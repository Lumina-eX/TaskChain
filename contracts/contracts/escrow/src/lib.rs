#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, contracterror, token, Address, Env, String, Vec, symbol_short,
};

// ---------------------------------------------------------------------------
// State Machine
// ---------------------------------------------------------------------------
//
// Contract-level lifecycle (IsFunded flag represents Created vs Funded):
//   Created (initialized, not yet funded)
//   → Funded (client calls fund())
//   → InProgress (client calls start_milestone() per milestone)
//   → Submitted (freelancer calls submit_milestone())
//   → Approved (client calls approve())
//   → Released (client or freelancer calls release() after both confirm)
//
// Additional transitions per milestone:
//   InProgress | Submitted | Approved → Disputed (client or freelancer)
//   Disputed   → Released | Refunded  (arbiter calls resolve_dispute())
//   Funded | InProgress   → Refunded  (client OR freelancer calls refund())
//   Funded | InProgress   → AutoExpired (permissionless after deadline)
//
// ---------------------------------------------------------------------------

/// Per-milestone status — drives the milestone-level state machine.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[contracttype]
pub enum MilestoneStatus {
    /// Milestone created but contract not yet funded.
    Pending = 0,
    /// Escrow funded; work not yet started.
    Funded = 1,
    /// Client has called start_milestone(); work is underway.
    InProgress = 2,
    /// Freelancer has submitted deliverable.
    Submitted = 3,
    /// Client has approved; awaiting freelancer confirmation.
    Approved = 4,
    /// Funds released to freelancer — terminal.
    Released = 5,
    /// Funds returned to client — terminal.
    Refunded = 6,
    /// Milestone under arbitration.
    Disputed = 7,
    /// Deadline passed without submission — terminal.
    AutoExpired = 8,
}

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, PartialEq, Eq)]
#[contracttype]
pub struct Milestone {
    pub deadline: u64,
    pub id: u32,
    pub amount: i128,
    pub status: MilestoneStatus,
    pub description: String,
    pub client_approved: bool,
    pub freelancer_approved: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
#[contracttype]
pub enum DataKey {
    Client,
    Freelancer,
    Arbiter,
    Token,
    IsFunded,
    Admin,
    Version,
    Milestone(u32),
    MilestoneIds,
}

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[contracterror]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    AlreadyFunded = 3,
    NotFunded = 4,
    MilestoneNotFound = 5,
    InvalidMilestoneStatus = 6,
    Unauthorized = 7,
    ZeroAmount = 8,
    InsufficientApprovals = 9,
    AlreadyApproved = 10,
    DeadlineExceeded = 11,
    AlreadyExpired = 12,
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    // -----------------------------------------------------------------------
    // Lifecycle: initialize
    // -----------------------------------------------------------------------

    /// Create the escrow.  Stores parties, token, and milestone definitions.
    /// State: → Created (IsFunded = false, all milestones Pending)
    pub fn initialize(
        env: Env,
        admin: Address,
        client: Address,
        freelancer: Address,
        arbiter: Address,
        token: Address,
        milestones: Vec<Milestone>,
    ) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Client) {
            return Err(Error::AlreadyInitialized);
        }

        if milestones.is_empty() {
            return Err(Error::MilestoneNotFound);
        }

        let mut ids = Vec::new(&env);
        for i in 0..milestones.len() {
            let mut milestone = milestones.get(i).unwrap();
            if milestone.amount <= 0 {
                return Err(Error::ZeroAmount);
            }
            // Normalise approval flags on initialization
            milestone.client_approved = false;
            milestone.freelancer_approved = false;
            milestone.status = MilestoneStatus::Pending;
            env.storage().instance().set(&DataKey::Milestone(milestone.id), &milestone);
            ids.push_back(milestone.id);
        }

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Version, &1u32);
        env.storage().instance().set(&DataKey::Client, &client);
        env.storage().instance().set(&DataKey::Freelancer, &freelancer);
        env.storage().instance().set(&DataKey::Arbiter, &arbiter);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::MilestoneIds, &ids);
        env.storage().instance().set(&DataKey::IsFunded, &false);

        // Event: (topic: "init") → (client, freelancer, arbiter)
        env.events().publish((symbol_short!("init"),), (client, freelancer, arbiter));

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Lifecycle: fund
    // -----------------------------------------------------------------------

    /// Client locks the total milestone amounts into the contract.
    /// State: Pending → Funded  (for every milestone)
    pub fn fund(env: Env) -> Result<(), Error> {
        let client: Address = env.storage().instance().get(&DataKey::Client).ok_or(Error::NotInitialized)?;
        client.require_auth();

        let is_already_funded: bool = env.storage().instance().get(&DataKey::IsFunded).unwrap_or(false);
        if is_already_funded {
            return Err(Error::AlreadyFunded);
        }

        let ids: Vec<u32> = env.storage().instance().get(&DataKey::MilestoneIds).ok_or(Error::NotInitialized)?;
        let mut total_amount: i128 = 0;

        for i in 0..ids.len() {
            let id = ids.get(i).unwrap();
            let milestone: Milestone = env.storage().instance()
                .get(&DataKey::Milestone(id))
                .ok_or(Error::MilestoneNotFound)?;
            total_amount += milestone.amount;
        }

        if total_amount <= 0 {
            return Err(Error::ZeroAmount);
        }

        let token_address: Address = env.storage().instance().get(&DataKey::Token).ok_or(Error::NotInitialized)?;
        let token_client = token::Client::new(&env, &token_address);
        token_client.transfer(&client, &env.current_contract_address(), &total_amount);

        // Transition all Pending milestones → Funded
        for i in 0..ids.len() {
            let id = ids.get(i).unwrap();
            let mut milestone: Milestone = env.storage().instance()
                .get(&DataKey::Milestone(id))
                .ok_or(Error::MilestoneNotFound)?;
            if milestone.status == MilestoneStatus::Pending {
                milestone.status = MilestoneStatus::Funded;
            }
            env.storage().instance().set(&DataKey::Milestone(id), &milestone);
        }

        env.storage().instance().set(&DataKey::IsFunded, &true);

        // Event: (topic: "fund") → (total_amount)
        env.events().publish((symbol_short!("fund"),), (total_amount,));

        Ok(())
    }

    // -----------------------------------------------------------------------
    // State machine: start_milestone  (NEW)
    // -----------------------------------------------------------------------

    /// Client signals that work may begin on a specific milestone.
    /// State: Funded → InProgress
    ///
    /// Authorization: client only.
    pub fn start_milestone(env: Env, milestone_id: u32) -> Result<(), Error> {
        let client: Address = env.storage().instance().get(&DataKey::Client).ok_or(Error::NotInitialized)?;
        client.require_auth();

        let mut milestone: Milestone = env.storage().instance()
            .get(&DataKey::Milestone(milestone_id))
            .ok_or(Error::MilestoneNotFound)?;

        if milestone.status != MilestoneStatus::Funded {
            return Err(Error::InvalidMilestoneStatus);
        }

        milestone.status = MilestoneStatus::InProgress;
        env.storage().instance().set(&DataKey::Milestone(milestone_id), &milestone);

        // Event: (topic: "start") → (milestone_id)
        env.events().publish((symbol_short!("start"),), (milestone_id,));

        Ok(())
    }

    // -----------------------------------------------------------------------
    // State machine: submit_milestone
    // -----------------------------------------------------------------------

    /// Freelancer submits a completed deliverable.
    /// State: InProgress → Submitted
    ///
    /// Authorization: freelancer only.
    pub fn submit_milestone(env: Env, milestone_id: u32) -> Result<(), Error> {
        let freelancer: Address = env.storage().instance().get(&DataKey::Freelancer).ok_or(Error::NotInitialized)?;
        freelancer.require_auth();

        let mut milestone: Milestone = env.storage().instance()
            .get(&DataKey::Milestone(milestone_id))
            .ok_or(Error::MilestoneNotFound)?;

        // Require InProgress — the formal state machine requires start_milestone()
        // to have been called before a submission is possible.
        if milestone.status != MilestoneStatus::InProgress {
            return Err(Error::InvalidMilestoneStatus);
        }
        if milestone.deadline > 0 && env.ledger().timestamp() > milestone.deadline {
            return Err(Error::DeadlineExceeded);
        }

        milestone.status = MilestoneStatus::Submitted;
        env.storage().instance().set(&DataKey::Milestone(milestone_id), &milestone);

        // Event: (topic: "submt") → (milestone_id)
        env.events().publish((symbol_short!("submt"),), (milestone_id,));

        Ok(())
    }

    // -----------------------------------------------------------------------
    // State machine: approve
    // -----------------------------------------------------------------------

    /// Client approves a submitted milestone.
    /// State: Submitted → Approved
    ///
    /// Authorization: client only.
    pub fn approve(env: Env, milestone_id: u32) -> Result<(), Error> {
        let client: Address = env.storage().instance().get(&DataKey::Client).ok_or(Error::NotInitialized)?;
        client.require_auth();

        let mut milestone: Milestone = env.storage().instance()
            .get(&DataKey::Milestone(milestone_id))
            .ok_or(Error::MilestoneNotFound)?;

        if milestone.status != MilestoneStatus::Submitted {
            return Err(Error::InvalidMilestoneStatus);
        }
        if milestone.client_approved {
            return Err(Error::AlreadyApproved);
        }

        milestone.client_approved = true;
        milestone.status = MilestoneStatus::Approved;
        env.storage().instance().set(&DataKey::Milestone(milestone_id), &milestone);

        // Event: (topic: "aprov") → (milestone_id)
        env.events().publish((symbol_short!("aprov"),), (milestone_id,));

        Ok(())
    }

    // -----------------------------------------------------------------------
    // State machine: freelancer_confirm
    // -----------------------------------------------------------------------

    /// Freelancer countersigns an approval, enabling fund release.
    /// State: stays Approved (sets freelancer_approved = true)
    ///
    /// Authorization: freelancer only.
    pub fn freelancer_confirm(env: Env, milestone_id: u32) -> Result<(), Error> {
        let freelancer: Address = env.storage().instance().get(&DataKey::Freelancer).ok_or(Error::NotInitialized)?;
        freelancer.require_auth();

        let mut milestone: Milestone = env.storage().instance()
            .get(&DataKey::Milestone(milestone_id))
            .ok_or(Error::MilestoneNotFound)?;

        if milestone.status != MilestoneStatus::Approved {
            return Err(Error::InvalidMilestoneStatus);
        }
        if milestone.freelancer_approved {
            return Err(Error::AlreadyApproved);
        }

        milestone.freelancer_approved = true;
        env.storage().instance().set(&DataKey::Milestone(milestone_id), &milestone);

        // Event: (topic: "cnfrm") → (milestone_id)
        env.events().publish((symbol_short!("cnfrm"),), (milestone_id,));

        Ok(())
    }

    // -----------------------------------------------------------------------
    // State machine: release
    // -----------------------------------------------------------------------

    /// Release milestone funds to the freelancer once both parties have confirmed.
    /// State: Approved → Released
    ///
    /// Authorization: client or freelancer.
    pub fn release(env: Env, milestone_id: u32, caller: Address) -> Result<(), Error> {
        caller.require_auth();

        let client: Address = env.storage().instance().get(&DataKey::Client).ok_or(Error::NotInitialized)?;
        let freelancer: Address = env.storage().instance().get(&DataKey::Freelancer).ok_or(Error::NotInitialized)?;

        if caller != client && caller != freelancer {
            return Err(Error::Unauthorized);
        }

        let mut milestone: Milestone = env.storage().instance()
            .get(&DataKey::Milestone(milestone_id))
            .ok_or(Error::MilestoneNotFound)?;

        if !milestone.client_approved || !milestone.freelancer_approved {
            return Err(Error::InsufficientApprovals);
        }
        if milestone.status != MilestoneStatus::Approved {
            return Err(Error::InvalidMilestoneStatus);
        }

        let transfer_amount = milestone.amount;
        milestone.status = MilestoneStatus::Released;
        env.storage().instance().set(&DataKey::Milestone(milestone_id), &milestone);

        let token_address: Address = env.storage().instance().get(&DataKey::Token).ok_or(Error::NotInitialized)?;
        let token_client = token::Client::new(&env, &token_address);
        token_client.transfer(&env.current_contract_address(), &freelancer, &transfer_amount);

        // Event: (topic: "relse") → (milestone_id, transfer_amount)
        env.events().publish((symbol_short!("relse"),), (milestone_id, transfer_amount));

        Ok(())
    }

    // -----------------------------------------------------------------------
    // State machine: refund
    // -----------------------------------------------------------------------

    /// Return milestone funds to the client.
    /// Both the client AND the freelancer may trigger a refund (e.g. freelancer
    /// voluntarily surrenders, or client reclaims unfunded work).
    ///
    /// State: Funded | InProgress → Refunded
    ///
    /// Authorization: client or freelancer.
    pub fn refund(env: Env, milestone_id: u32, caller: Address) -> Result<(), Error> {
        caller.require_auth();

        let client: Address = env.storage().instance().get(&DataKey::Client).ok_or(Error::NotInitialized)?;
        let freelancer: Address = env.storage().instance().get(&DataKey::Freelancer).ok_or(Error::NotInitialized)?;

        // Both client and freelancer are permitted to initiate a refund.
        if caller != client && caller != freelancer {
            return Err(Error::Unauthorized);
        }

        let mut milestone: Milestone = env.storage().instance()
            .get(&DataKey::Milestone(milestone_id))
            .ok_or(Error::MilestoneNotFound)?;

        // Refund is only valid while work has not been submitted/approved.
        if milestone.status != MilestoneStatus::Funded
            && milestone.status != MilestoneStatus::InProgress
        {
            return Err(Error::InvalidMilestoneStatus);
        }

        let transfer_amount = milestone.amount;
        milestone.status = MilestoneStatus::Refunded;
        env.storage().instance().set(&DataKey::Milestone(milestone_id), &milestone);

        let token_address: Address = env.storage().instance().get(&DataKey::Token).ok_or(Error::NotInitialized)?;
        let token_client = token::Client::new(&env, &token_address);
        token_client.transfer(&env.current_contract_address(), &client, &transfer_amount);

        // Event: (topic: "rfund") → (milestone_id, transfer_amount)
        env.events().publish((symbol_short!("rfund"),), (milestone_id, transfer_amount));

        Ok(())
    }

    // -----------------------------------------------------------------------
    // State machine: dispute
    // -----------------------------------------------------------------------

    /// Raise a dispute on a milestone that is in-progress, submitted, or approved.
    /// State: InProgress | Submitted | Approved → Disputed
    ///
    /// Authorization: client or freelancer.
    pub fn dispute(env: Env, milestone_id: u32, caller: Address) -> Result<(), Error> {
        caller.require_auth();

        let client: Address = env.storage().instance().get(&DataKey::Client).ok_or(Error::NotInitialized)?;
        let freelancer: Address = env.storage().instance().get(&DataKey::Freelancer).ok_or(Error::NotInitialized)?;

        if caller != client && caller != freelancer {
            return Err(Error::Unauthorized);
        }

        let mut milestone: Milestone = env.storage().instance()
            .get(&DataKey::Milestone(milestone_id))
            .ok_or(Error::MilestoneNotFound)?;

        // Disputes may only be raised on active work states.
        if milestone.status != MilestoneStatus::InProgress
            && milestone.status != MilestoneStatus::Submitted
            && milestone.status != MilestoneStatus::Approved
        {
            return Err(Error::InvalidMilestoneStatus);
        }

        milestone.status = MilestoneStatus::Disputed;
        // Clear both approval flags so the arbiter starts from a clean slate.
        milestone.client_approved = false;
        milestone.freelancer_approved = false;
        env.storage().instance().set(&DataKey::Milestone(milestone_id), &milestone);

        // Event: (topic: "dispt") → (milestone_id)
        env.events().publish((symbol_short!("dispt"),), (milestone_id,));

        Ok(())
    }

    // -----------------------------------------------------------------------
    // State machine: resolve_dispute
    // -----------------------------------------------------------------------

    /// Arbitrator resolves a disputed milestone.
    /// State: Disputed → Released (to freelancer) | Refunded (to client)
    ///
    /// Authorization: arbiter only.
    pub fn resolve_dispute(env: Env, milestone_id: u32, release_to_freelancer: bool) -> Result<(), Error> {
        let arbiter: Address = env.storage().instance().get(&DataKey::Arbiter).ok_or(Error::NotInitialized)?;
        arbiter.require_auth();

        let mut milestone: Milestone = env.storage().instance()
            .get(&DataKey::Milestone(milestone_id))
            .ok_or(Error::MilestoneNotFound)?;

        if milestone.status != MilestoneStatus::Disputed {
            return Err(Error::InvalidMilestoneStatus);
        }

        let transfer_amount = milestone.amount;
        milestone.status = if release_to_freelancer {
            MilestoneStatus::Released
        } else {
            MilestoneStatus::Refunded
        };
        env.storage().instance().set(&DataKey::Milestone(milestone_id), &milestone);

        let recipient: Address = if release_to_freelancer {
            env.storage().instance().get(&DataKey::Freelancer).ok_or(Error::NotInitialized)?
        } else {
            env.storage().instance().get(&DataKey::Client).ok_or(Error::NotInitialized)?
        };

        let token_address: Address = env.storage().instance().get(&DataKey::Token).ok_or(Error::NotInitialized)?;
        let token_client = token::Client::new(&env, &token_address);
        token_client.transfer(&env.current_contract_address(), &recipient, &transfer_amount);

        // Event: (topic: "rslve") → (milestone_id, release_to_freelancer)
        env.events().publish((symbol_short!("rslve"),), (milestone_id, release_to_freelancer));

        Ok(())
    }

    // -----------------------------------------------------------------------
    // State machine: auto_expire
    // -----------------------------------------------------------------------

    /// Anyone may call this after a milestone's deadline has passed.
    /// Funds are returned to the client automatically.
    /// State: Funded | InProgress | Submitted → AutoExpired
    pub fn auto_expire(env: Env, milestone_id: u32) -> Result<(), Error> {
        let mut milestone: Milestone = env.storage().instance()
            .get(&DataKey::Milestone(milestone_id))
            .ok_or(Error::MilestoneNotFound)?;

        if milestone.deadline == 0 {
            return Err(Error::InvalidMilestoneStatus);
        }
        if env.ledger().timestamp() <= milestone.deadline {
            return Err(Error::InvalidMilestoneStatus);
        }

        // Guard against double-expiry or terminal states
        if milestone.status == MilestoneStatus::Released
            || milestone.status == MilestoneStatus::Refunded
            || milestone.status == MilestoneStatus::Disputed
            || milestone.status == MilestoneStatus::AutoExpired
        {
            return Err(Error::AlreadyExpired);
        }

        let transfer_amount = milestone.amount;
        milestone.status = MilestoneStatus::AutoExpired;
        env.storage().instance().set(&DataKey::Milestone(milestone_id), &milestone);

        let client: Address = env.storage().instance().get(&DataKey::Client).ok_or(Error::NotInitialized)?;
        let token_address: Address = env.storage().instance().get(&DataKey::Token).ok_or(Error::NotInitialized)?;
        let token_client = token::Client::new(&env, &token_address);
        token_client.transfer(&env.current_contract_address(), &client, &transfer_amount);

        // Event: (topic: "expir") → (milestone_id, transfer_amount)
        env.events().publish((symbol_short!("expir"),), (milestone_id, transfer_amount));

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Read helpers
    // -----------------------------------------------------------------------

    pub fn is_milestone_expired(env: Env, milestone_id: u32) -> Result<bool, Error> {
        let milestone: Milestone = env.storage().instance()
            .get(&DataKey::Milestone(milestone_id))
            .ok_or(Error::MilestoneNotFound)?;
        if milestone.deadline == 0 {
            return Ok(false);
        }
        Ok(env.ledger().timestamp() > milestone.deadline)
    }

    pub fn get_milestone_deadline(env: Env, milestone_id: u32) -> Result<u64, Error> {
        let milestone: Milestone = env.storage().instance()
            .get(&DataKey::Milestone(milestone_id))
            .ok_or(Error::MilestoneNotFound)?;
        Ok(milestone.deadline)
    }

    pub fn get_milestones(env: Env) -> Result<Vec<Milestone>, Error> {
        let ids: Vec<u32> = env.storage().instance().get(&DataKey::MilestoneIds).ok_or(Error::NotInitialized)?;
        let mut milestones = Vec::new(&env);
        for i in 0..ids.len() {
            let id = ids.get(i).unwrap();
            let milestone: Milestone = env.storage().instance()
                .get(&DataKey::Milestone(id))
                .ok_or(Error::MilestoneNotFound)?;
            milestones.push_back(milestone);
        }
        Ok(milestones)
    }

    pub fn get_client(env: Env) -> Result<Address, Error> {
        env.storage().instance().get(&DataKey::Client).ok_or(Error::NotInitialized)
    }

    pub fn get_freelancer(env: Env) -> Result<Address, Error> {
        env.storage().instance().get(&DataKey::Freelancer).ok_or(Error::NotInitialized)
    }

    pub fn get_arbiter(env: Env) -> Result<Address, Error> {
        env.storage().instance().get(&DataKey::Arbiter).ok_or(Error::NotInitialized)
    }

    pub fn get_token(env: Env) -> Result<Address, Error> {
        env.storage().instance().get(&DataKey::Token).ok_or(Error::NotInitialized)
    }

    pub fn is_funded(env: Env) -> bool {
        env.storage().instance().get(&DataKey::IsFunded).unwrap_or(false)
    }

    pub fn has_client_approval(env: Env, milestone_id: u32) -> bool {
        env.storage().instance()
            .get::<DataKey, Milestone>(&DataKey::Milestone(milestone_id))
            .map(|m| m.client_approved)
            .unwrap_or(false)
    }

    pub fn has_freelancer_approval(env: Env, milestone_id: u32) -> bool {
        env.storage().instance()
            .get::<DataKey, Milestone>(&DataKey::Milestone(milestone_id))
            .map(|m| m.freelancer_approved)
            .unwrap_or(false)
    }

    // -----------------------------------------------------------------------
    // Admin
    // -----------------------------------------------------------------------

    pub fn upgrade(env: Env, new_wasm_hash: soroban_sdk::BytesN<32>) -> Result<(), Error> {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).ok_or(Error::NotInitialized)?;
        admin.require_auth();
        env.deployer().update_current_contract_wasm(new_wasm_hash);
        Ok(())
    }

    pub fn version(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::Version).unwrap_or(0)
    }
}

mod test;
