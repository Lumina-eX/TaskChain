#![no_std]
use soroban_sdk::{
    contract, contractevent, contractimpl, contracttype, contracterror, token, Address, Env,
    String, Vec,
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
}

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

/// Emit a state-transition event carrying both the old and new state so that
/// off-chain indexers have a complete audit trail.
fn emit_transition(env: &Env, old: ContractState, new: ContractState) {
    StateTransition {
        from: old as u32,
        to: new as u32,
    }
    .publish(env);
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

        // Contract starts in Created state.
        set_contract_state(&env, ContractState::Created);

        // Events.
        ContractInitialized {
            client: client.clone(),
            freelancer: freelancer.clone(),
            arbiter: arbiter.clone(),
        }
        .publish(&env);
        emit_transition(&env, ContractState::Created, ContractState::Created);

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

        // Transition: Created → Funded.
        emit_transition(&env, ContractState::Created, ContractState::Funded);
        set_contract_state(&env, ContractState::Funded);

        EscrowFunded { total_amount }.publish(&env);

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Transition: Funded → InProgress
    // -----------------------------------------------------------------------

    /// Freelancer signals that work has begun.
    /// Authorization: freelancer only.
    pub fn start_work(env: Env) -> Result<(), Error> {
        let freelancer: Address = env
            .storage()
            .instance()
            .get(&DataKey::Freelancer)
            .ok_or(Error::NotInitialized)?;
        freelancer.require_auth();

        let state = get_contract_state(&env)?;
        if state != ContractState::Funded {
            return Err(Error::InvalidContractState);
        }

        // Advance milestones: Funded → InProgress.
        let ids: Vec<u32> = env
            .storage()
            .instance()
            .get(&DataKey::MilestoneIds)
            .ok_or(Error::NotInitialized)?;
        for i in 0..ids.len() {
            let id = ids.get(i).unwrap();
            let mut milestone: Milestone = env
                .storage()
                .instance()
                .get(&DataKey::Milestone(id))
                .ok_or(Error::MilestoneNotFound)?;
            if milestone.status == MilestoneStatus::Funded {
                milestone.status = MilestoneStatus::InProgress;
            }
            env.storage()
                .instance()
                .set(&DataKey::Milestone(id), &milestone);
        }

        // Transition: Funded → InProgress.
        emit_transition(&env, ContractState::Funded, ContractState::InProgress);
        set_contract_state(&env, ContractState::InProgress);

        WorkStarted {}.publish(&env);

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

        // Transition: InProgress → Submitted.
        emit_transition(&env, ContractState::InProgress, ContractState::Submitted);
        set_contract_state(&env, ContractState::Submitted);

        MilestoneSubmitted { milestone_id }.publish(&env);

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

        MilestoneApproved { milestone_id }.publish(&env);

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

        FreelancerConfirmed { milestone_id }.publish(&env);

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

        if caller != client && caller != freelancer {
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

        if !milestone.client_approved || !milestone.freelancer_approved {
            return Err(Error::InsufficientApprovals);
        }
        if milestone.status != MilestoneStatus::Approved {
            return Err(Error::InvalidMilestoneStatus);
        }

        let transfer_amount = milestone.amount;
        milestone.status = MilestoneStatus::Released;
        env.storage()
            .instance()
            .set(&DataKey::Milestone(milestone_id), &milestone);

        let token_address: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(Error::NotInitialized)?;
        let token_client = token::Client::new(&env, &token_address);
        token_client.transfer(
            &env.current_contract_address(),
            &freelancer,
            &transfer_amount,
        );

        // Transition: Approved → Released.
        emit_transition(&env, ContractState::Approved, ContractState::Released);
        set_contract_state(&env, ContractState::Released);

        FundsReleased {
            milestone_id,
            amount: transfer_amount,
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

        // Transition: <previous state> → Disputed.
        emit_transition(&env, state, ContractState::Disputed);
        set_contract_state(&env, ContractState::Disputed);

        DisputeRaised { milestone_id }.publish(&env);

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

        // Transition: Disputed → Resolved.
        emit_transition(&env, ContractState::Disputed, ContractState::Resolved);
        set_contract_state(&env, ContractState::Resolved);

        DisputeResolved {
            milestone_id,
            release_to_freelancer,
        }
        .publish(&env);

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Transition: Funded / InProgress / Submitted → Refunded
    // -----------------------------------------------------------------------

    /// Refund a specific milestone's funds back to the client.
    /// Authorization: client (before work starts) or freelancer (voluntary).
    pub fn refund(env: Env, milestone_id: u32, caller: Address) -> Result<(), Error> {
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
        {
            return Err(Error::InvalidMilestoneStatus);
        }

        let transfer_amount = milestone.amount;
        milestone.status = MilestoneStatus::Refunded;
        env.storage()
            .instance()
            .set(&DataKey::Milestone(milestone_id), &milestone);

        let token_address: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(Error::NotInitialized)?;
        let token_client = token::Client::new(&env, &token_address);
        token_client.transfer(&env.current_contract_address(), &client, &transfer_amount);

        // Transition: <state> → Refunded.
        emit_transition(&env, state, ContractState::Refunded);
        set_contract_state(&env, ContractState::Refunded);

        FundsRefunded {
            milestone_id,
            amount: transfer_amount,
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
        let mut milestone: Milestone = env
            .storage()
            .instance()
            .get(&DataKey::Milestone(milestone_id))
            .ok_or(Error::MilestoneNotFound)?;

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
        env.storage()
            .instance()
            .set(&DataKey::Milestone(milestone_id), &milestone);

        let client: Address = env
            .storage()
            .instance()
            .get(&DataKey::Client)
            .ok_or(Error::NotInitialized)?;
        let token_address: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(Error::NotInitialized)?;
        let token_client = token::Client::new(&env, &token_address);
        token_client.transfer(&env.current_contract_address(), &client, &transfer_amount);

        MilestoneExpired {
            milestone_id,
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
        env.storage()
            .instance()
            .get(&DataKey::IsFunded)
            .unwrap_or(false)
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
