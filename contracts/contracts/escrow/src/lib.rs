#![no_std]
use soroban_sdk::{
    contract, contractevent, contractimpl, contracttype, contracterror, token, Address, Env, String, Vec,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[contracttype]
pub enum MilestoneStatus {
    Created = 0,
    Funded = 1,
    InProgress = 2,
    Submitted = 3,
    Approved = 4,
    Released = 5,
    Refunded = 6,
    Disputed = 7,
    Resolved = 8,
    AutoExpired = 9,
    Expired = 10,
    Extended = 11,
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
    Milestone(u32),
    MilestoneIds,
    EscrowBalance,
    PendingDeadline(u32),
    ExpiredFrom(u32),
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
    /// ERR_INVALID_DEADLINE
    InvalidDeadline = 13,
    /// ERR_EXTENSION_NOT_FOUND
    ExtensionNotFound = 14,
    /// ERR_DUPLICATE_MILESTONE_ID
    DuplicateMilestoneId = 15,
    /// ERR_INSUFFICIENT_BALANCE
    InsufficientBalance = 16,
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
pub struct MilestoneStarted {
    #[topic]
    pub contract_id: Address,
    #[topic]
    pub milestone_id: u32,
    #[topic]
    pub actor: Address,
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

#[contractevent]
pub struct DeadlineSet {
    #[topic]
    pub contract_id: Address,
    #[topic]
    pub milestone_id: u32,
    #[topic]
    pub actor: Address,
    pub deadline: u64,
}

#[contractevent]
pub struct DeadlineExpired {
    #[topic]
    pub contract_id: Address,
    #[topic]
    pub milestone_id: u32,
    #[topic]
    pub actor: Address,
    pub deadline: u64,
}

#[contractevent]
pub struct DeadlineExtended {
    #[topic]
    pub contract_id: Address,
    #[topic]
    pub milestone_id: u32,
    #[topic]
    pub actor: Address,
    pub previous_deadline: u64,
    pub new_deadline: u64,
    pub was_expired: bool,
}

fn mark_milestone_expired(
    env: &Env,
    milestone_id: u32,
    milestone: &mut Milestone,
    actor: &Address,
) -> Result<(), Error> {
    if milestone.deadline == 0 || env.ledger().timestamp() <= milestone.deadline {
        return Err(Error::DeadlineExceeded);
    }
    if !matches!(
        milestone.status,
        MilestoneStatus::Funded
            | MilestoneStatus::InProgress
            | MilestoneStatus::Submitted
            | MilestoneStatus::Approved
            | MilestoneStatus::Extended
    ) {
        return Err(Error::InvalidMilestoneStatus);
    }

    env.storage()
        .instance()
        .set(&DataKey::ExpiredFrom(milestone_id), &milestone.status);
    milestone.status = MilestoneStatus::Expired;
    milestone.client_approved = false;
    milestone.freelancer_approved = false;
    env.storage()
        .instance()
        .set(&DataKey::Milestone(milestone_id), milestone);

    DeadlineExpired {
        contract_id: env.current_contract_address(),
        milestone_id,
        actor: actor.clone(),
        deadline: milestone.deadline,
    }
    .publish(env);

    Ok(())
}

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
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
            if milestone.deadline == 0 || milestone.deadline <= env.ledger().timestamp() {
                return Err(Error::InvalidDeadline);
            }
            for j in 0..ids.len() {
                if ids.get(j).unwrap() == milestone.id {
                    return Err(Error::DuplicateMilestoneId);
                }
            }
            milestone.status = MilestoneStatus::Created;
            milestone.client_approved = false;
            milestone.freelancer_approved = false;
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

        EscrowCreated {
            contract_id: env.current_contract_address(),
            actor: admin.clone(),
            client,
            freelancer,
            arbiter,
            token,
            milestone_count: ids.len(),
        }
        .publish(&env);

        for i in 0..ids.len() {
            let id = ids.get(i).unwrap();
            let milestone: Milestone = env
                .storage()
                .instance()
                .get(&DataKey::Milestone(id))
                .ok_or(Error::MilestoneNotFound)?;
            DeadlineSet {
                contract_id: env.current_contract_address(),
                milestone_id: id,
                actor: admin.clone(),
                deadline: milestone.deadline,
            }
            .publish(&env);
        }

        Ok(())
    }

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
            let milestone: Milestone = env.storage().instance().get(&DataKey::Milestone(id)).ok_or(Error::MilestoneNotFound)?;
            if milestone.deadline > 0 && env.ledger().timestamp() > milestone.deadline {
                return Err(Error::DeadlineExceeded);
            }
            total_amount += milestone.amount;
        }

        if total_amount <= 0 {
            return Err(Error::ZeroAmount);
        }

        let token_address: Address = env.storage().instance().get(&DataKey::Token).ok_or(Error::NotInitialized)?;
        let token_client = token::Client::new(&env, &token_address);
        token_client.transfer(&client, &env.current_contract_address(), &total_amount);

        for i in 0..ids.len() {
            let id = ids.get(i).unwrap();
            let mut milestone: Milestone = env.storage().instance().get(&DataKey::Milestone(id)).ok_or(Error::MilestoneNotFound)?;
            if milestone.status == MilestoneStatus::Created {
                milestone.status = MilestoneStatus::Funded;
            }
            env.storage().instance().set(&DataKey::Milestone(id), &milestone);
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

    pub fn start_milestone(env: Env, milestone_id: u32) -> Result<(), Error> {
        let freelancer: Address = env.storage().instance().get(&DataKey::Freelancer).ok_or(Error::NotInitialized)?;
        freelancer.require_auth();

        let mut milestone: Milestone = env.storage().instance().get(&DataKey::Milestone(milestone_id)).ok_or(Error::MilestoneNotFound)?;

        if milestone.status != MilestoneStatus::Funded
            && milestone.status != MilestoneStatus::Extended
        {
            return Err(Error::InvalidMilestoneStatus);
        }
        if milestone.deadline > 0 && env.ledger().timestamp() > milestone.deadline {
            return Err(Error::DeadlineExceeded);
        }

        milestone.status = MilestoneStatus::InProgress;
        env.storage().instance().set(&DataKey::Milestone(milestone_id), &milestone);

        MilestoneStarted {
            contract_id: env.current_contract_address(),
            milestone_id,
            actor: freelancer,
        }
        .publish(&env);

        Ok(())
    }

    pub fn submit_milestone(env: Env, milestone_id: u32) -> Result<(), Error> {
        let freelancer: Address = env.storage().instance().get(&DataKey::Freelancer).ok_or(Error::NotInitialized)?;
        freelancer.require_auth();

        let mut milestone: Milestone = env.storage().instance().get(&DataKey::Milestone(milestone_id)).ok_or(Error::MilestoneNotFound)?;

        if milestone.status != MilestoneStatus::InProgress {
            return Err(Error::InvalidMilestoneStatus);
        }
        if milestone.deadline > 0 && env.ledger().timestamp() > milestone.deadline {
            return Err(Error::DeadlineExceeded);
        }

        milestone.status = MilestoneStatus::Submitted;
        env.storage().instance().set(&DataKey::Milestone(milestone_id), &milestone);

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

    pub fn approve(env: Env, milestone_id: u32) -> Result<(), Error> {
        let client: Address = env.storage().instance().get(&DataKey::Client).ok_or(Error::NotInitialized)?;
        client.require_auth();

        let mut milestone: Milestone = env.storage().instance().get(&DataKey::Milestone(milestone_id)).ok_or(Error::MilestoneNotFound)?;

        if milestone.status != MilestoneStatus::Submitted {
            return Err(Error::InvalidMilestoneStatus);
        }
        if milestone.deadline > 0 && env.ledger().timestamp() > milestone.deadline {
            return Err(Error::DeadlineExceeded);
        }
        if milestone.client_approved {
            return Err(Error::AlreadyApproved);
        }

        milestone.client_approved = true;
        milestone.status = MilestoneStatus::Approved;
        env.storage().instance().set(&DataKey::Milestone(milestone_id), &milestone);

        MilestoneApproved {
            contract_id: env.current_contract_address(),
            milestone_id,
            actor: client,
        }
        .publish(&env);

        Ok(())
    }

    pub fn freelancer_confirm(env: Env, milestone_id: u32) -> Result<(), Error> {
        let freelancer: Address = env.storage().instance().get(&DataKey::Freelancer).ok_or(Error::NotInitialized)?;
        freelancer.require_auth();

        let mut milestone: Milestone = env.storage().instance().get(&DataKey::Milestone(milestone_id)).ok_or(Error::MilestoneNotFound)?;

        if milestone.status != MilestoneStatus::Approved {
            return Err(Error::InvalidMilestoneStatus);
        }
        if milestone.deadline > 0 && env.ledger().timestamp() > milestone.deadline {
            return Err(Error::DeadlineExceeded);
        }
        if milestone.freelancer_approved {
            return Err(Error::AlreadyApproved);
        }

        milestone.freelancer_approved = true;
        env.storage().instance().set(&DataKey::Milestone(milestone_id), &milestone);

        MilestoneConfirmed {
            contract_id: env.current_contract_address(),
            milestone_id,
            actor: freelancer,
        }
        .publish(&env);

        Ok(())
    }

    pub fn release(env: Env, milestone_id: u32, caller: Address) -> Result<(), Error> {
        caller.require_auth();

        let client: Address = env.storage().instance().get(&DataKey::Client).ok_or(Error::NotInitialized)?;
        let freelancer: Address = env.storage().instance().get(&DataKey::Freelancer).ok_or(Error::NotInitialized)?;

        if caller != client {
            return Err(Error::Unauthorized);
        }

        let mut milestone: Milestone = env.storage().instance().get(&DataKey::Milestone(milestone_id)).ok_or(Error::MilestoneNotFound)?;

        if milestone.status == MilestoneStatus::Released {
            return Err(Error::InvalidMilestoneStatus);
        }
        if milestone.deadline > 0 && env.ledger().timestamp() > milestone.deadline {
            return Err(Error::DeadlineExceeded);
        }

        // While a dispute is open the escrowed funds are frozen: `release` must be
        // blocked until the arbitrator resolves the dispute.
        if milestone.status == MilestoneStatus::Disputed {
            return Err(Error::InvalidMilestoneStatus);
        }

        if !milestone.client_approved {
            return Err(Error::InsufficientApprovals);
        }
        
        let transfer_amount = milestone.amount;
        let mut balance: i128 = env.storage().instance().get(&DataKey::EscrowBalance).unwrap_or(0);
        if balance < transfer_amount {
            return Err(Error::InsufficientBalance);
        }
        milestone.status = MilestoneStatus::Released;
        env.storage().instance().set(&DataKey::Milestone(milestone_id), &milestone);
        env.storage()
            .instance()
            .remove(&DataKey::PendingDeadline(milestone_id));
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
        let client: Address = env.storage().instance().get(&DataKey::Client).ok_or(Error::NotInitialized)?;
        if caller != freelancer && caller != client {
            return Err(Error::Unauthorized);
        }

        let mut milestone: Milestone = env.storage().instance().get(&DataKey::Milestone(milestone_id)).ok_or(Error::MilestoneNotFound)?;

        match milestone.status {
            MilestoneStatus::Expired => {
                if caller != client {
                    return Err(Error::Unauthorized);
                }
                if milestone.deadline == 0
                    || env.ledger().timestamp() <= milestone.deadline
                {
                    return Err(Error::InvalidMilestoneStatus);
                }
            }
            MilestoneStatus::Funded | MilestoneStatus::Submitted => {
                if caller != freelancer {
                    return Err(Error::Unauthorized);
                }
            }
            _ => return Err(Error::InvalidMilestoneStatus),
        }

        let transfer_amount = milestone.amount;
        let mut balance: i128 = env.storage().instance().get(&DataKey::EscrowBalance).unwrap_or(0);
        if balance < transfer_amount {
            return Err(Error::InsufficientBalance);
        }
        balance -= transfer_amount;
        env.storage().instance().set(&DataKey::EscrowBalance, &balance);
        milestone.status = MilestoneStatus::Refunded;
        env.storage().instance().set(&DataKey::Milestone(milestone_id), &milestone);
        env.storage()
            .instance()
            .remove(&DataKey::PendingDeadline(milestone_id));

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

    pub fn dispute(env: Env, milestone_id: u32, caller: Address) -> Result<(), Error> {
        caller.require_auth();

        let client: Address = env.storage().instance().get(&DataKey::Client).ok_or(Error::NotInitialized)?;
        let freelancer: Address = env.storage().instance().get(&DataKey::Freelancer).ok_or(Error::NotInitialized)?;
        let arbiter: Address = env.storage().instance().get(&DataKey::Arbiter).ok_or(Error::NotInitialized)?;

        // Role-based access: only the escrow participants (client/freelancer) or the
        // authorized arbitrator may raise a dispute.
        if caller != client && caller != freelancer && caller != arbiter {
            return Err(Error::Unauthorized);
        }

        let mut milestone: Milestone = env.storage().instance().get(&DataKey::Milestone(milestone_id)).ok_or(Error::MilestoneNotFound)?;

        // A dispute can only be raised after the milestone has been funded and
        // submitted (Submitted/Approved) - it must not bypass the normal lifecycle.
        if (milestone.status == MilestoneStatus::Submitted
            || milestone.status == MilestoneStatus::Approved)
            && milestone.deadline > 0
            && milestone.deadline > 0
            && env.ledger().timestamp() > milestone.deadline
        {
            mark_milestone_expired(&env, milestone_id, &mut milestone, &caller)?;
        }

        let can_dispute = match milestone.status {
            MilestoneStatus::Submitted | MilestoneStatus::Approved => true,
            MilestoneStatus::Expired => env
                .storage()
                .instance()
                .get::<DataKey, MilestoneStatus>(&DataKey::ExpiredFrom(milestone_id))
                .map(|status| {
                    status == MilestoneStatus::Submitted
                        || status == MilestoneStatus::Approved
                        || status == MilestoneStatus::Extended
                })
                .unwrap_or(false),
            _ => false,
        };
        if !can_dispute {
            return Err(Error::InvalidMilestoneStatus);
        }

        milestone.status = MilestoneStatus::Disputed;
        milestone.client_approved = false;
        milestone.freelancer_approved = false;
        env.storage()
            .instance()
            .remove(&DataKey::ExpiredFrom(milestone_id));
        env.storage()
            .instance()
            .remove(&DataKey::PendingDeadline(milestone_id));
        env.storage().instance().set(&DataKey::Milestone(milestone_id), &milestone);

        DisputeRaised {
            contract_id: env.current_contract_address(),
            milestone_id,
            actor: caller,
        }
        .publish(&env);

        Ok(())
    }

    pub fn resolve_dispute(env: Env, milestone_id: u32, release_to_freelancer: bool) -> Result<(), Error> {
        let arbiter: Address = env.storage().instance().get(&DataKey::Arbiter).ok_or(Error::NotInitialized)?;
        arbiter.require_auth();

        let mut milestone: Milestone = env.storage().instance().get(&DataKey::Milestone(milestone_id)).ok_or(Error::MilestoneNotFound)?;

        if milestone.status != MilestoneStatus::Disputed {
            return Err(Error::InvalidMilestoneStatus);
        }

        let transfer_amount = milestone.amount;
        let mut balance: i128 = env.storage().instance().get(&DataKey::EscrowBalance).unwrap_or(0);
        if balance < transfer_amount {
            return Err(Error::InsufficientBalance);
        }
        balance -= transfer_amount;
        env.storage().instance().set(&DataKey::EscrowBalance, &balance);
        milestone.status = MilestoneStatus::Resolved;
        env.storage().instance().set(&DataKey::Milestone(milestone_id), &milestone);
        env.storage()
            .instance()
            .remove(&DataKey::PendingDeadline(milestone_id));

        let recipient: Address = if release_to_freelancer {
            env.storage().instance().get(&DataKey::Freelancer).ok_or(Error::NotInitialized)?
        } else {
            env.storage().instance().get(&DataKey::Client).ok_or(Error::NotInitialized)?
        };

        let token_address: Address = env.storage().instance().get(&DataKey::Token).ok_or(Error::NotInitialized)?;
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

    pub fn auto_expire(env: Env, caller: Address, milestone_id: u32) -> Result<(), Error> {
        caller.require_auth();
        let mut milestone: Milestone = env.storage().instance().get(&DataKey::Milestone(milestone_id)).ok_or(Error::MilestoneNotFound)?;

        if milestone.status == MilestoneStatus::Expired
            || milestone.status == MilestoneStatus::AutoExpired
        {
            return Err(Error::AlreadyExpired);
        }
        mark_milestone_expired(&env, milestone_id, &mut milestone, &caller)
    }

    pub fn request_deadline_extension(
        env: Env,
        milestone_id: u32,
        new_deadline: u64,
        caller: Address,
    ) -> Result<(), Error> {
        caller.require_auth();
        let client: Address = env.storage().instance().get(&DataKey::Client).ok_or(Error::NotInitialized)?;
        let arbiter: Address = env.storage().instance().get(&DataKey::Arbiter).ok_or(Error::NotInitialized)?;
        if caller != client && caller != arbiter {
            return Err(Error::Unauthorized);
        }

        let mut milestone: Milestone = env.storage().instance().get(&DataKey::Milestone(milestone_id)).ok_or(Error::MilestoneNotFound)?;
        if milestone.deadline > 0
            && env.ledger().timestamp() > milestone.deadline
            && matches!(
                milestone.status,
                MilestoneStatus::Funded
                    | MilestoneStatus::InProgress
                    | MilestoneStatus::Submitted
                    | MilestoneStatus::Approved
                    | MilestoneStatus::Extended
            )
        {
            mark_milestone_expired(&env, milestone_id, &mut milestone, &caller)?;
        }
        if !matches!(
            milestone.status,
            MilestoneStatus::Funded
                | MilestoneStatus::InProgress
                | MilestoneStatus::Submitted
                | MilestoneStatus::Approved
                | MilestoneStatus::Expired
                | MilestoneStatus::Extended
        ) {
            return Err(Error::InvalidMilestoneStatus);
        }

        let current_deadline = milestone.deadline;
        let pending_deadline: Option<u64> = env
            .storage()
            .instance()
            .get(&DataKey::PendingDeadline(milestone_id));
        if new_deadline <= current_deadline
            || new_deadline <= env.ledger().timestamp()
            || pending_deadline.map(|pending| new_deadline <= pending).unwrap_or(false)
        {
            return Err(Error::InvalidDeadline);
        }

        env.storage()
            .instance()
            .set(&DataKey::PendingDeadline(milestone_id), &new_deadline);
        Ok(())
    }

    pub fn approve_deadline_extension(env: Env, milestone_id: u32) -> Result<(), Error> {
        let arbiter: Address = env.storage().instance().get(&DataKey::Arbiter).ok_or(Error::NotInitialized)?;
        arbiter.require_auth();

        let new_deadline: u64 = env
            .storage()
            .instance()
            .get(&DataKey::PendingDeadline(milestone_id))
            .ok_or(Error::ExtensionNotFound)?;
        let mut milestone: Milestone = env.storage().instance().get(&DataKey::Milestone(milestone_id)).ok_or(Error::MilestoneNotFound)?;
        if milestone.deadline > 0
            && env.ledger().timestamp() > milestone.deadline
            && matches!(
                milestone.status,
                MilestoneStatus::Funded
                    | MilestoneStatus::InProgress
                    | MilestoneStatus::Submitted
                    | MilestoneStatus::Approved
                    | MilestoneStatus::Extended
            )
        {
            mark_milestone_expired(&env, milestone_id, &mut milestone, &arbiter)?;
        }
        if new_deadline <= milestone.deadline || new_deadline <= env.ledger().timestamp() {
            return Err(Error::InvalidDeadline);
        }
        if !matches!(
            milestone.status,
            MilestoneStatus::Funded
                | MilestoneStatus::InProgress
                | MilestoneStatus::Submitted
                | MilestoneStatus::Approved
                | MilestoneStatus::Expired
                | MilestoneStatus::Extended
        ) {
            return Err(Error::InvalidMilestoneStatus);
        }

        let previous_deadline = milestone.deadline;
        let was_expired = milestone.status == MilestoneStatus::Expired;
        if was_expired {
            milestone.status = MilestoneStatus::Extended;
            milestone.client_approved = false;
            milestone.freelancer_approved = false;
        }
        env.storage()
            .instance()
            .remove(&DataKey::ExpiredFrom(milestone_id));
        milestone.deadline = new_deadline;
        env.storage().instance().set(&DataKey::Milestone(milestone_id), &milestone);
        env.storage()
            .instance()
            .remove(&DataKey::PendingDeadline(milestone_id));

        DeadlineExtended {
            contract_id: env.current_contract_address(),
            milestone_id,
            actor: arbiter,
            previous_deadline,
            new_deadline,
            was_expired,
        }
        .publish(&env);

        Ok(())
    }

    pub fn is_milestone_expired(env: Env, milestone_id: u32) -> Result<bool, Error> {
        let milestone: Milestone = env.storage().instance().get(&DataKey::Milestone(milestone_id)).ok_or(Error::MilestoneNotFound)?;
        Ok(milestone.deadline > 0 && env.ledger().timestamp() > milestone.deadline)
    }

    pub fn get_milestone_deadline(env: Env, milestone_id: u32) -> Result<u64, Error> {
        let milestone: Milestone = env.storage().instance().get(&DataKey::Milestone(milestone_id)).ok_or(Error::MilestoneNotFound)?;
        Ok(milestone.deadline)
    }

    // --- State Getters ---

    pub fn get_milestones(env: Env) -> Result<Vec<Milestone>, Error> {
        let ids: Vec<u32> = env.storage().instance().get(&DataKey::MilestoneIds).ok_or(Error::NotInitialized)?;
        let mut milestones = Vec::new(&env);
        for i in 0..ids.len() {
            let id = ids.get(i).unwrap();
            let milestone: Milestone = env.storage().instance().get(&DataKey::Milestone(id)).ok_or(Error::MilestoneNotFound)?;
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
        env.storage().instance().get::<DataKey, Milestone>(&DataKey::Milestone(milestone_id))
            .map(|m| m.client_approved)
            .unwrap_or(false)
    }

    pub fn has_freelancer_approval(env: Env, milestone_id: u32) -> bool {
        env.storage().instance().get::<DataKey, Milestone>(&DataKey::Milestone(milestone_id))
            .map(|m| m.freelancer_approved)
            .unwrap_or(false)
    }
}

mod test;
