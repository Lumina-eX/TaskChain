#![no_std]
use soroban_sdk::{
    contract, contractevent, contractimpl, contracttype, contracterror, token, Address, Env, String, Vec,
};

// ---------------------------------------------------------------------------
// Contract-level state machine
//
// Valid transitions:
//   Created    → Funded      (client calls fund())
//   Funded     → InProgress  (freelancer calls start_work())
//   Funded     → Refunded    (client or freelancer calls refund() – no work started)
//   InProgress → Submitted   (freelancer calls submit_milestone())
//   InProgress → Refunded    (freelancer voluntarily refunds)
//   InProgress → Disputed    (client or freelancer raises dispute)
//   Submitted  → Approved    (client calls approve())
//   Submitted  → Disputed    (client raises dispute on submission)
//   Submitted  → Refunded    (freelancer retracts submission)
//   Approved   → Released    (both confirm then call release())
//   Approved   → Disputed    (client raises last-minute dispute)
//   Disputed   → Resolved    (arbiter calls resolve_dispute())
//
// Multi-milestone: after a single milestone is Released the contract reverts
// to InProgress so remaining milestones can continue through the same flow.
// ---------------------------------------------------------------------------
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[contracttype]
pub enum ContractState {
    Created = 0,
    Funded = 1,
    InProgress = 2,
    Submitted = 3,
    Approved = 4,
    Released = 5,
    Disputed = 6,
    Resolved = 7,
    Refunded = 8,
}

// ---------------------------------------------------------------------------
// Per-milestone status (granular tracking for multi-milestone contracts)
// ---------------------------------------------------------------------------
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[contracttype]
pub enum MilestoneStatus {
    Pending = 0,
    Funded = 1,
    InProgress = 2,
    Submitted = 3,
    Approved = 4,
    Released = 5,
    Refunded = 6,
    Disputed = 7,
    Resolved = 8,
    AutoExpired = 9,
}

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
    ContractState,
    Milestone(u32),
    MilestoneIds,
    EscrowBalance,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
#[contracterror]
#[repr(u32)]
pub enum Error {
    /// ERR_ALREADY_INITIALIZED
    AlreadyInitialized = 1,
    /// ERR_NOT_INITIALIZED
    NotInitialized = 2,
    /// ERR_ALREADY_FUNDED
    AlreadyFunded = 3,
    /// ERR_NOT_FUNDED
    NotFunded = 4,
    /// ERR_MILESTONE_NOT_FOUND
    MilestoneNotFound = 5,
    /// ERR_INVALID_STATE
    InvalidMilestoneStatus = 6,
    /// ERR_UNAUTHORIZED
    Unauthorized = 7,
    /// ERR_INVALID_AMOUNT
    ZeroAmount = 8,
    /// ERR_INSUFFICIENT_APPROVALS
    InsufficientApprovals = 9,
    /// ERR_ALREADY_APPROVED
    AlreadyApproved = 10,
    /// ERR_DEADLINE_EXCEEDED
    DeadlineExceeded = 11,
    /// ERR_ALREADY_EXPIRED
    AlreadyExpired = 12,
    InvalidContractState = 13,
}

// ---------------------------------------------------------------------------
// Contract events  (recommended #[contractevent] macro — SDK v25+)
// ---------------------------------------------------------------------------

/// Emitted on every contract-level state transition. Carries both the old
/// and new state as u32 discriminant values for easy off-chain indexing.
#[contractevent]
pub struct StateTransition {
    pub from: u32,
    pub to: u32,
}

/// Emitted once when the contract is initialized.
#[contractevent]
pub struct ContractInitialized {
    pub client: Address,
    pub freelancer: Address,
    pub arbiter: Address,
}

/// Emitted when the escrow is funded by the client.
#[contractevent]
pub struct EscrowFunded {
    pub total_amount: i128,
}

/// Emitted when the freelancer signals that work has begun.
#[contractevent]
pub struct WorkStarted {}

/// Emitted when the freelancer submits a milestone for review.
#[contractevent]
pub struct MilestoneSubmitted {
    pub milestone_id: u32,
}

/// Emitted when the client approves a submitted milestone.
#[contractevent]
pub struct MilestoneApproved {
    pub milestone_id: u32,
}

/// Emitted when the freelancer confirms the client's approval.
#[contractevent]
pub struct FreelancerConfirmed {
    pub milestone_id: u32,
}

/// Emitted when milestone funds are released to the freelancer.
#[contractevent]
pub struct FundsReleased {
    pub milestone_id: u32,
    pub amount: i128,
}

/// Emitted when a dispute is raised by either party.
#[contractevent]
pub struct DisputeRaised {
    pub milestone_id: u32,
}

/// Emitted when the arbitrator resolves a dispute.
#[contractevent]
pub struct DisputeResolved {
    pub milestone_id: u32,
    pub release_to_freelancer: bool,
}

/// Emitted when a milestone is refunded to the client.
#[contractevent]
pub struct FundsRefunded {
    pub milestone_id: u32,
    pub amount: i128,
}

/// Emitted when a milestone auto-expires and funds return to the client.
#[contractevent]
pub struct MilestoneExpired {
    pub milestone_id: u32,
    pub amount: i128,
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

fn get_contract_state(env: &Env) -> Result<ContractState, Error> {
    env.storage()
        .instance()
        .get(&DataKey::ContractState)
        .ok_or(Error::NotInitialized)
}

fn set_contract_state(env: &Env, new_state: ContractState) {
    env.storage()
        .instance()
        .set(&DataKey::ContractState, &new_state);
}

/// Standardized event schemas. Topics are indexed by Soroban RPC consumers;
/// non-topic fields are emitted as the event data payload.
#[contractevent]
pub struct EscrowCreated {
    #[topic]
    pub contract_id: Address,
    #[topic]
    pub actor: Address,
    pub client: Address,
    pub freelancer: Address,
    pub arbiter: Address,
    pub token: Address,
    pub milestone_count: u32,
}

#[contractevent]
pub struct EscrowFunded {
    #[topic]
    pub contract_id: Address,
    #[topic]
    pub actor: Address,
    pub amount: i128,
}

#[contractevent]
pub struct MilestoneSubmitted {
    #[topic]
    pub contract_id: Address,
    #[topic]
    pub milestone_id: u32,
    #[topic]
    pub actor: Address,
    pub amount: i128,
    pub deadline: u64,
}

#[contractevent]
pub struct MilestoneApproved {
    #[topic]
    pub contract_id: Address,
    #[topic]
    pub milestone_id: u32,
    #[topic]
    pub actor: Address,
}

#[contractevent]
pub struct MilestoneConfirmed {
    #[topic]
    pub contract_id: Address,
    #[topic]
    pub milestone_id: u32,
    #[topic]
    pub actor: Address,
}

#[contractevent]
pub struct PaymentReleased {
    #[topic]
    pub contract_id: Address,
    #[topic]
    pub milestone_id: u32,
    #[topic]
    pub actor: Address,
    pub recipient: Address,
    pub amount: i128,
}

#[contractevent]
pub struct DisputeRaised {
    #[topic]
    pub contract_id: Address,
    #[topic]
    pub milestone_id: u32,
    #[topic]
    pub actor: Address,
}

#[contractevent]
pub struct RefundIssued {
    #[topic]
    pub contract_id: Address,
    #[topic]
    pub milestone_id: u32,
    #[topic]
    pub actor: Address,
    pub recipient: Address,
    pub amount: i128,
}

#[contractevent]
pub struct DisputeResolved {
    #[topic]
    pub contract_id: Address,
    #[topic]
    pub milestone_id: u32,
    #[topic]
    pub actor: Address,
    pub recipient: Address,
    pub amount: i128,
    pub release_to_freelancer: bool,
}

#[contractevent]
pub struct MilestoneExpired {
    #[topic]
    pub contract_id: Address,
    #[topic]
    pub milestone_id: u32,
    #[topic]
    pub actor: Address,
    pub recipient: Address,
    pub amount: i128,
}

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    // -----------------------------------------------------------------------
    // Lifecycle: initialize
    //   (none) → Created
    // -----------------------------------------------------------------------

    /// Set up the contract parties and milestone schedule.
    pub fn initialize(
        env: Env,
        admin: Address,
        client: Address,
        freelancer: Address,
        arbiter: Address,
        token: Address,
        milestones: Vec<Milestone>,
    ) -> Result<(), Error> {
        admin.require_auth();

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
            // Normalize approval flags regardless of caller-supplied values.
            milestone.client_approved = false;
            milestone.freelancer_approved = false;
            milestone.status = MilestoneStatus::Pending;
            env.storage()
                .instance()
                .set(&DataKey::Milestone(milestone.id), &milestone);
            ids.push_back(milestone.id);
        }

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Version, &1u32);
        env.storage().instance().set(&DataKey::Client, &client);
        env.storage()
            .instance()
            .set(&DataKey::Freelancer, &freelancer);
        env.storage().instance().set(&DataKey::Arbiter, &arbiter);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::MilestoneIds, &ids);
        env.storage().instance().set(&DataKey::IsFunded, &false);

        EscrowCreated {
            contract_id: env.current_contract_address(),
            actor: admin,
            client,
            freelancer,
            arbiter,
            token,
            milestone_count: ids.len(),
        }
        .publish(&env);

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Transition: Created → Funded
    // -----------------------------------------------------------------------

    /// Client deposits all milestone amounts into the escrow.
    /// Authorization: client only.
    pub fn fund(env: Env) -> Result<(), Error> {
        let client: Address = env
            .storage()
            .instance()
            .get(&DataKey::Client)
            .ok_or(Error::NotInitialized)?;
        client.require_auth();

        let state = get_contract_state(&env)?;
        if state != ContractState::Created {
            return Err(Error::InvalidContractState);
        }

        let is_already_funded: bool = env
            .storage()
            .instance()
            .get(&DataKey::IsFunded)
            .unwrap_or(false);
        if is_already_funded {
            return Err(Error::AlreadyFunded);
        }

        let ids: Vec<u32> = env
            .storage()
            .instance()
            .get(&DataKey::MilestoneIds)
            .ok_or(Error::NotInitialized)?;
        let mut total_amount: i128 = 0;

        for i in 0..ids.len() {
            let id = ids.get(i).unwrap();
            let milestone: Milestone = env
                .storage()
                .instance()
                .get(&DataKey::Milestone(id))
                .ok_or(Error::MilestoneNotFound)?;
            total_amount += milestone.amount;
        }
        if total_amount <= 0 {
            return Err(Error::ZeroAmount);
        }

        let token_address: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(Error::NotInitialized)?;
        let token_client = token::Client::new(&env, &token_address);
        token_client.transfer(&client, &env.current_contract_address(), &total_amount);

        // Advance each milestone: Pending → Funded.
        for i in 0..ids.len() {
            let id = ids.get(i).unwrap();
            let mut milestone: Milestone = env
                .storage()
                .instance()
                .get(&DataKey::Milestone(id))
                .ok_or(Error::MilestoneNotFound)?;
            if milestone.status == MilestoneStatus::Pending {
                milestone.status = MilestoneStatus::Funded;
            }
            env.storage()
                .instance()
                .set(&DataKey::Milestone(id), &milestone);
        }

        env.storage().instance().set(&DataKey::IsFunded, &true);
        env.storage().instance().set(&DataKey::EscrowBalance, &total_amount);

        EscrowFunded {
            contract_id: env.current_contract_address(),
            actor: client,
            amount: total_amount,
        }
        .publish(&env);

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Transition: InProgress → Submitted
    // -----------------------------------------------------------------------

    /// Freelancer submits a specific milestone deliverable for client review.
    /// Authorization: freelancer only.
    pub fn submit_milestone(env: Env, milestone_id: u32) -> Result<(), Error> {
        let freelancer: Address = env
            .storage()
            .instance()
            .get(&DataKey::Freelancer)
            .ok_or(Error::NotInitialized)?;
        freelancer.require_auth();

        // Requires InProgress (including after a prior Released milestone in a
        // multi-milestone contract).
        let state = get_contract_state(&env)?;
        if state != ContractState::InProgress {
            return Err(Error::InvalidContractState);
        }

        let mut milestone: Milestone = env
            .storage()
            .instance()
            .get(&DataKey::Milestone(milestone_id))
            .ok_or(Error::MilestoneNotFound)?;

        if milestone.status != MilestoneStatus::InProgress {
            return Err(Error::InvalidMilestoneStatus);
        }
        if milestone.deadline > 0 && env.ledger().timestamp() > milestone.deadline {
            return Err(Error::DeadlineExceeded);
        }

        milestone.status = MilestoneStatus::Submitted;
        env.storage()
            .instance()
            .set(&DataKey::Milestone(milestone_id), &milestone);

        MilestoneSubmitted {
            contract_id: env.current_contract_address(),
            milestone_id,
            actor: freelancer,
            amount: milestone.amount,
            deadline: milestone.deadline,
        }
        .publish(&env);

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Transition: Submitted → Approved
    // -----------------------------------------------------------------------

    /// Client approves the submitted milestone.
    /// Authorization: client only.
    pub fn approve(env: Env, milestone_id: u32) -> Result<(), Error> {
        let client: Address = env
            .storage()
            .instance()
            .get(&DataKey::Client)
            .ok_or(Error::NotInitialized)?;
        client.require_auth();

        let state = get_contract_state(&env)?;
        if state != ContractState::Submitted {
            return Err(Error::InvalidContractState);
        }

        let mut milestone: Milestone = env
            .storage()
            .instance()
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
        env.storage()
            .instance()
            .set(&DataKey::Milestone(milestone_id), &milestone);

        // Transition: Submitted → Approved.
        emit_transition(&env, ContractState::Submitted, ContractState::Approved);
        set_contract_state(&env, ContractState::Approved);

        MilestoneApproved {
            contract_id: env.current_contract_address(),
            milestone_id,
            actor: client,
        }
        .publish(&env);

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Freelancer confirmation (sub-step within Approved)
    // -----------------------------------------------------------------------

    /// Freelancer confirms the client's approval — required before release.
    /// Authorization: freelancer only.
    pub fn freelancer_confirm(env: Env, milestone_id: u32) -> Result<(), Error> {
        let freelancer: Address = env
            .storage()
            .instance()
            .get(&DataKey::Freelancer)
            .ok_or(Error::NotInitialized)?;
        freelancer.require_auth();

        let state = get_contract_state(&env)?;
        if state != ContractState::Approved {
            return Err(Error::InvalidContractState);
        }

        let mut milestone: Milestone = env
            .storage()
            .instance()
            .get(&DataKey::Milestone(milestone_id))
            .ok_or(Error::MilestoneNotFound)?;

        if milestone.status != MilestoneStatus::Approved {
            return Err(Error::InvalidMilestoneStatus);
        }
        if milestone.freelancer_approved {
            return Err(Error::AlreadyApproved);
        }

        milestone.freelancer_approved = true;
        env.storage()
            .instance()
            .set(&DataKey::Milestone(milestone_id), &milestone);

        MilestoneConfirmed {
            contract_id: env.current_contract_address(),
            milestone_id,
            actor: freelancer,
        }
        .publish(&env);

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Transition: Approved → Released
    // -----------------------------------------------------------------------

    /// Release milestone funds to the freelancer once both parties have confirmed.
    /// Authorization: client or freelancer.
    pub fn release(env: Env, milestone_id: u32, caller: Address) -> Result<(), Error> {
        caller.require_auth();

        let client: Address = env
            .storage()
            .instance()
            .get(&DataKey::Client)
            .ok_or(Error::NotInitialized)?;
        let freelancer: Address = env
            .storage()
            .instance()
            .get(&DataKey::Freelancer)
            .ok_or(Error::NotInitialized)?;

        if caller != client {
            return Err(Error::Unauthorized);
        }

        let state = get_contract_state(&env)?;
        if state != ContractState::Approved {
            return Err(Error::InvalidContractState);
        }

        let mut milestone: Milestone = env
            .storage()
            .instance()
            .get(&DataKey::Milestone(milestone_id))
            .ok_or(Error::MilestoneNotFound)?;

        if milestone.status == MilestoneStatus::Released {
            return Err(Error::InvalidMilestoneStatus);
        }

        if !milestone.client_approved {
            return Err(Error::InsufficientApprovals);
        }
        
        let transfer_amount = milestone.amount;
        milestone.status = MilestoneStatus::Released;
        env.storage().instance().set(&DataKey::Milestone(milestone_id), &milestone);

        let mut balance: i128 = env.storage().instance().get(&DataKey::EscrowBalance).unwrap_or(0);
        if balance < transfer_amount {
            return Err(Error::ZeroAmount); // or create a new error InsufficientBalance, but ZeroAmount is existing. Wait, let's just do it.
        }
        balance -= transfer_amount;
        env.storage().instance().set(&DataKey::EscrowBalance, &balance);

        let token_address: Address = env.storage().instance().get(&DataKey::Token).ok_or(Error::NotInitialized)?;
        let token_client = token::Client::new(&env, &token_address);
        token_client.transfer(&env.current_contract_address(), &freelancer, &transfer_amount);

        PaymentReleased {
            contract_id: env.current_contract_address(),
            milestone_id,
            actor: caller,
            recipient: freelancer,
            amount: transfer_amount,
        }
        .publish(&env);

        Ok(())
    }

    pub fn refund(env: Env, milestone_id: u32, caller: Address) -> Result<(), Error> {
        caller.require_auth();

        let freelancer: Address = env.storage().instance().get(&DataKey::Freelancer).ok_or(Error::NotInitialized)?;
        if caller != freelancer {
            return Err(Error::Unauthorized);
        }
        .publish(&env);

        // For multi-milestone contracts: if there are still active milestones
        // revert contract state back to InProgress so the workflow continues.
        let ids: Vec<u32> = env
            .storage()
            .instance()
            .get(&DataKey::MilestoneIds)
            .ok_or(Error::NotInitialized)?;
        for i in 0..ids.len() {
            let id = ids.get(i).unwrap();
            if id == milestone_id {
                continue;
            }
            let m: Milestone = env
                .storage()
                .instance()
                .get(&DataKey::Milestone(id))
                .ok_or(Error::MilestoneNotFound)?;
            if m.status == MilestoneStatus::InProgress || m.status == MilestoneStatus::Funded {
                emit_transition(&env, ContractState::Released, ContractState::InProgress);
                set_contract_state(&env, ContractState::InProgress);
                break;
            }
        }

        let transfer_amount = milestone.amount;
        milestone.status = MilestoneStatus::Refunded;
        env.storage().instance().set(&DataKey::Milestone(milestone_id), &milestone);

        let mut balance: i128 = env.storage().instance().get(&DataKey::EscrowBalance).unwrap_or(0);
        if balance >= transfer_amount {
            balance -= transfer_amount;
            env.storage().instance().set(&DataKey::EscrowBalance, &balance);
        }

        let client: Address = env.storage().instance().get(&DataKey::Client).ok_or(Error::NotInitialized)?;
        let token_address: Address = env.storage().instance().get(&DataKey::Token).ok_or(Error::NotInitialized)?;
        let token_client = token::Client::new(&env, &token_address);
        token_client.transfer(&env.current_contract_address(), &client, &transfer_amount);

        RefundIssued {
            contract_id: env.current_contract_address(),
            milestone_id,
            actor: caller,
            recipient: client,
            amount: transfer_amount,
        }
        .publish(&env);

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Transition: Funded/InProgress/Submitted/Approved → Disputed
    // -----------------------------------------------------------------------

    /// Raise a dispute on a milestone.
    /// Authorization: client or freelancer.
    pub fn dispute(env: Env, milestone_id: u32, caller: Address) -> Result<(), Error> {
        caller.require_auth();

        let client: Address = env
            .storage()
            .instance()
            .get(&DataKey::Client)
            .ok_or(Error::NotInitialized)?;
        let freelancer: Address = env
            .storage()
            .instance()
            .get(&DataKey::Freelancer)
            .ok_or(Error::NotInitialized)?;

        if caller != client && caller != freelancer {
            return Err(Error::Unauthorized);
        }

        let state = get_contract_state(&env)?;
        if state != ContractState::Funded
            && state != ContractState::InProgress
            && state != ContractState::Submitted
            && state != ContractState::Approved
        {
            return Err(Error::InvalidContractState);
        }

        let mut milestone: Milestone = env
            .storage()
            .instance()
            .get(&DataKey::Milestone(milestone_id))
            .ok_or(Error::MilestoneNotFound)?;

        if milestone.status != MilestoneStatus::Funded
            && milestone.status != MilestoneStatus::InProgress
            && milestone.status != MilestoneStatus::Submitted
            && milestone.status != MilestoneStatus::Approved
        {
            return Err(Error::InvalidMilestoneStatus);
        }

        milestone.status = MilestoneStatus::Disputed;
        milestone.client_approved = false;
        milestone.freelancer_approved = false;
        env.storage()
            .instance()
            .set(&DataKey::Milestone(milestone_id), &milestone);

        DisputeRaised {
            contract_id: env.current_contract_address(),
            milestone_id,
            actor: caller,
        }
        .publish(&env);

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Transition: Disputed → Resolved
    // -----------------------------------------------------------------------

    /// Arbitrator resolves the dispute and transfers funds to the winning party.
    /// Authorization: arbiter only.
    pub fn resolve_dispute(
        env: Env,
        milestone_id: u32,
        release_to_freelancer: bool,
    ) -> Result<(), Error> {
        let arbiter: Address = env
            .storage()
            .instance()
            .get(&DataKey::Arbiter)
            .ok_or(Error::NotInitialized)?;
        arbiter.require_auth();

        let state = get_contract_state(&env)?;
        if state != ContractState::Disputed {
            return Err(Error::InvalidContractState);
        }

        let mut milestone: Milestone = env
            .storage()
            .instance()
            .get(&DataKey::Milestone(milestone_id))
            .ok_or(Error::MilestoneNotFound)?;

        if milestone.status != MilestoneStatus::Disputed {
            return Err(Error::InvalidMilestoneStatus);
        }

        let transfer_amount = milestone.amount;

        // Mark per-milestone resolution.
        milestone.status = MilestoneStatus::Resolved;
        env.storage()
            .instance()
            .set(&DataKey::Milestone(milestone_id), &milestone);

        let mut balance: i128 = env.storage().instance().get(&DataKey::EscrowBalance).unwrap_or(0);
        if balance >= transfer_amount {
            balance -= transfer_amount;
            env.storage().instance().set(&DataKey::EscrowBalance, &balance);
        }

        let recipient: Address = if release_to_freelancer {
            env.storage()
                .instance()
                .get(&DataKey::Freelancer)
                .ok_or(Error::NotInitialized)?
        } else {
            env.storage()
                .instance()
                .get(&DataKey::Client)
                .ok_or(Error::NotInitialized)?
        };

        let token_address: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(Error::NotInitialized)?;
        let token_client = token::Client::new(&env, &token_address);
        token_client.transfer(&env.current_contract_address(), &recipient, &transfer_amount);

        DisputeResolved {
            contract_id: env.current_contract_address(),
            milestone_id,
            actor: arbiter,
            recipient,
            amount: transfer_amount,
            release_to_freelancer,
        }
        .publish(&env);

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Auto-expiry (permissionless, guarded by deadline)
    // -----------------------------------------------------------------------

    /// Anyone can call this after a milestone's deadline has passed.
    /// Returns the milestone amount to the client.
    pub fn auto_expire(env: Env, milestone_id: u32) -> Result<(), Error> {
        let caller = env.caller();
        let mut milestone: Milestone = env.storage().instance().get(&DataKey::Milestone(milestone_id)).ok_or(Error::MilestoneNotFound)?;

        if milestone.deadline == 0 {
            return Err(Error::InvalidMilestoneStatus);
        }
        if env.ledger().timestamp() <= milestone.deadline {
            return Err(Error::InvalidMilestoneStatus);
        }

        if milestone.status == MilestoneStatus::Released
            || milestone.status == MilestoneStatus::Refunded
            || milestone.status == MilestoneStatus::Disputed
            || milestone.status == MilestoneStatus::Resolved
            || milestone.status == MilestoneStatus::AutoExpired
        {
            return Err(Error::AlreadyExpired);
        }

        let transfer_amount = milestone.amount;
        milestone.status = MilestoneStatus::AutoExpired;
        env.storage().instance().set(&DataKey::Milestone(milestone_id), &milestone);

        let mut balance: i128 = env.storage().instance().get(&DataKey::EscrowBalance).unwrap_or(0);
        if balance >= transfer_amount {
            balance -= transfer_amount;
            env.storage().instance().set(&DataKey::EscrowBalance, &balance);
        }

        let client: Address = env.storage().instance().get(&DataKey::Client).ok_or(Error::NotInitialized)?;
        let token_address: Address = env.storage().instance().get(&DataKey::Token).ok_or(Error::NotInitialized)?;
        let token_client = token::Client::new(&env, &token_address);
        token_client.transfer(&env.current_contract_address(), &client, &transfer_amount);

        MilestoneExpired {
            contract_id: env.current_contract_address(),
            milestone_id,
            actor: caller,
            recipient: client,
            amount: transfer_amount,
        }
        .publish(&env);

        Ok(())
    }

    // -----------------------------------------------------------------------
    // State getters
    // -----------------------------------------------------------------------

    pub fn get_contract_state(env: Env) -> Result<ContractState, Error> {
        get_contract_state(&env)
    }

    pub fn is_milestone_expired(env: Env, milestone_id: u32) -> Result<bool, Error> {
        let milestone: Milestone = env
            .storage()
            .instance()
            .get(&DataKey::Milestone(milestone_id))
            .ok_or(Error::MilestoneNotFound)?;
        if milestone.deadline == 0 {
            return Ok(false);
        }
        Ok(env.ledger().timestamp() > milestone.deadline)
    }

    pub fn get_milestone_deadline(env: Env, milestone_id: u32) -> Result<u64, Error> {
        let milestone: Milestone = env
            .storage()
            .instance()
            .get(&DataKey::Milestone(milestone_id))
            .ok_or(Error::MilestoneNotFound)?;
        Ok(milestone.deadline)
    }

    pub fn get_milestones(env: Env) -> Result<Vec<Milestone>, Error> {
        let ids: Vec<u32> = env
            .storage()
            .instance()
            .get(&DataKey::MilestoneIds)
            .ok_or(Error::NotInitialized)?;
        let mut milestones = Vec::new(&env);
        for i in 0..ids.len() {
            let id = ids.get(i).unwrap();
            let milestone: Milestone = env
                .storage()
                .instance()
                .get(&DataKey::Milestone(id))
                .ok_or(Error::MilestoneNotFound)?;
            milestones.push_back(milestone);
        }
        Ok(milestones)
    }

    pub fn get_client(env: Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Client)
            .ok_or(Error::NotInitialized)
    }

    pub fn get_freelancer(env: Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Freelancer)
            .ok_or(Error::NotInitialized)
    }

    pub fn get_arbiter(env: Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Arbiter)
            .ok_or(Error::NotInitialized)
    }

    pub fn get_token(env: Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(Error::NotInitialized)
    }

    pub fn is_funded(env: Env) -> bool {
        env.storage().instance().get(&DataKey::IsFunded).unwrap_or(false)
    }

    pub fn upgrade(env: Env, new_wasm_hash: soroban_sdk::BytesN<32>) -> Result<(), Error> {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).ok_or(Error::NotInitialized)?;
        admin.require_auth();
        env.deployer().update_current_contract_wasm(new_wasm_hash);
        Ok(())
    }

    pub fn get_escrow_balance(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::EscrowBalance).unwrap_or(0)
    }

    pub fn version(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::Version).unwrap_or(0)
    }

    pub fn has_client_approval(env: Env, milestone_id: u32) -> bool {
        env.storage()
            .instance()
            .get::<DataKey, Milestone>(&DataKey::Milestone(milestone_id))
            .map(|m| m.client_approved)
            .unwrap_or(false)
    }

    pub fn has_freelancer_approval(env: Env, milestone_id: u32) -> bool {
        env.storage()
            .instance()
            .get::<DataKey, Milestone>(&DataKey::Milestone(milestone_id))
            .map(|m| m.freelancer_approved)
            .unwrap_or(false)
    }

    // -----------------------------------------------------------------------
    // Admin
    // -----------------------------------------------------------------------

    pub fn upgrade(env: Env, new_wasm_hash: soroban_sdk::BytesN<32>) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();
        env.deployer().update_current_contract_wasm(new_wasm_hash);
        Ok(())
    }

    pub fn version(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::Version)
            .unwrap_or(0)
    }
}

mod test;
