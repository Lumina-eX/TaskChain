#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, contracterror, token, Address, Env, String, Vec,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[contracttype]
pub enum MilestoneStatus {
    Pending = 0,     // Created but not yet funded
    Funded = 1,      // Contract funded, ready for work
    Submitted = 2,   // Work completed and submitted by freelancer
    Approved = 3,    // Approved by client, ready for release
    Released = 4,    // Funds successfully transferred to freelancer
    Refunded = 5,    // Funds returned to client
    Disputed = 6,    // Under dispute, waiting for arbiter resolution
}

#[derive(Clone, Debug, PartialEq, Eq)]
#[contracttype]
pub struct Milestone {
    pub id: u32,
    pub amount: i128,
    pub status: MilestoneStatus,
    pub description: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
#[contracttype]
pub enum DataKey {
    Client,
    Freelancer,
    Arbiter,
    Token,
    Milestones,
    IsFunded,
    ClientApproval(u32),
    FreelancerApproval(u32),
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
}

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    /// Initialize the escrow agreement with participant addresses, the payment token, and the milestones.
    pub fn initialize(
        env: Env,
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

        // Validate all milestone amounts are greater than zero
        for i in 0..milestones.len() {
            let milestone = milestones.get(i).unwrap();
            if milestone.amount <= 0 {
                return Err(Error::ZeroAmount);
            }
        }

        env.storage().instance().set(&DataKey::Client, &client);
        env.storage().instance().set(&DataKey::Freelancer, &freelancer);
        env.storage().instance().set(&DataKey::Arbiter, &arbiter);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::Milestones, &milestones);
        env.storage().instance().set(&DataKey::IsFunded, &false);

        Ok(())
    }

    /// The client locks the total funds for all milestones into the contract.
    pub fn fund(env: Env) -> Result<(), Error> {
        let client: Address = env.storage().instance().get(&DataKey::Client).ok_or(Error::NotInitialized)?;
        client.require_auth();

        let is_already_funded: bool = env.storage().instance().get(&DataKey::IsFunded).unwrap_or(false);
        if is_already_funded {
            return Err(Error::AlreadyFunded);
        }

        let milestones: Vec<Milestone> = env.storage().instance().get(&DataKey::Milestones).ok_or(Error::NotInitialized)?;
        let mut total_amount: i128 = 0;

        for i in 0..milestones.len() {
            let milestone = milestones.get(i).unwrap();
            total_amount += milestone.amount;
        }

        if total_amount <= 0 {
            return Err(Error::ZeroAmount);
        }

        // Transfer payment tokens from the client to this contract
        let token_address: Address = env.storage().instance().get(&DataKey::Token).ok_or(Error::NotInitialized)?;
        let token_client = token::Client::new(&env, &token_address);
        token_client.transfer(&client, &env.current_contract_address(), &total_amount);

        // Update milestones to Funded status
        let mut updated_milestones = Vec::new(&env);
        for i in 0..milestones.len() {
            let mut milestone = milestones.get(i).unwrap();
            if milestone.status == MilestoneStatus::Pending {
                milestone.status = MilestoneStatus::Funded;
            }
            updated_milestones.push_back(milestone);
        }

        env.storage().instance().set(&DataKey::Milestones, &updated_milestones);
        env.storage().instance().set(&DataKey::IsFunded, &true);

        Ok(())
    }

    /// Freelancer submits milestone progress for client review.
    pub fn submit_milestone(env: Env, milestone_id: u32) -> Result<(), Error> {
        let freelancer: Address = env.storage().instance().get(&DataKey::Freelancer).ok_or(Error::NotInitialized)?;
        freelancer.require_auth();

        let milestones: Vec<Milestone> = env.storage().instance().get(&DataKey::Milestones).ok_or(Error::NotInitialized)?;
        let mut found = false;
        let mut updated_milestones = Vec::new(&env);

        for i in 0..milestones.len() {
            let mut milestone = milestones.get(i).unwrap();
            if milestone.id == milestone_id {
                found = true;
                if milestone.status != MilestoneStatus::Funded {
                    return Err(Error::InvalidMilestoneStatus);
                }
                milestone.status = MilestoneStatus::Submitted;
            }
            updated_milestones.push_back(milestone);
        }

        if !found {
            return Err(Error::MilestoneNotFound);
        }

        env.storage().instance().set(&DataKey::Milestones, &updated_milestones);
        Ok(())
    }

    /// Client approves milestone completion.
    pub fn approve(env: Env, milestone_id: u32) -> Result<(), Error> {
        let client: Address = env.storage().instance().get(&DataKey::Client).ok_or(Error::NotInitialized)?;
        client.require_auth();

        // Check if already approved by client
        let approval_key = DataKey::ClientApproval(milestone_id);
        if env.storage().instance().has(&approval_key) {
            return Err(Error::AlreadyApproved);
        }

        let milestones: Vec<Milestone> = env.storage().instance().get(&DataKey::Milestones).ok_or(Error::NotInitialized)?;
        let mut found = false;
        let mut updated_milestones = Vec::new(&env);

        for i in 0..milestones.len() {
            let mut milestone = milestones.get(i).unwrap();
            if milestone.id == milestone_id {
                found = true;
                if milestone.status != MilestoneStatus::Submitted {
                    return Err(Error::InvalidMilestoneStatus);
                }
                // Set client approval
                env.storage().instance().set(&approval_key, &true);
                milestone.status = MilestoneStatus::Approved;
            }
            updated_milestones.push_back(milestone);
        }

        if !found {
            return Err(Error::MilestoneNotFound);
        }

        env.storage().instance().set(&DataKey::Milestones, &updated_milestones);
        Ok(())
    }

    /// Freelancer confirms milestone completion (second signature for multi-sig release).
    pub fn freelancer_confirm(env: Env, milestone_id: u32) -> Result<(), Error> {
        let freelancer: Address = env.storage().instance().get(&DataKey::Freelancer).ok_or(Error::NotInitialized)?;
        freelancer.require_auth();

        let milestones: Vec<Milestone> = env.storage().instance().get(&DataKey::Milestones).ok_or(Error::NotInitialized)?;
        let mut found = false;

        for i in 0..milestones.len() {
            let milestone = milestones.get(i).unwrap();
            if milestone.id == milestone_id {
                found = true;
                if milestone.status != MilestoneStatus::Approved {
                    return Err(Error::InvalidMilestoneStatus);
                }
                // Check if already confirmed by freelancer
                let approval_key = DataKey::FreelancerApproval(milestone_id);
                if env.storage().instance().has(&approval_key) {
                    return Err(Error::AlreadyApproved);
                }
                // Set freelancer confirmation
                env.storage().instance().set(&approval_key, &true);
            }
        }

        if !found {
            return Err(Error::MilestoneNotFound);
        }

        Ok(())
    }

    /// Transfers funds of an approved milestone to the freelancer.
    /// Requires multi-signature: both client and freelancer must have approved.
    /// Can be triggered by either client or freelancer after both approvals.
    pub fn release(env: Env, milestone_id: u32, caller: Address) -> Result<(), Error> {
        caller.require_auth();

        let client: Address = env.storage().instance().get(&DataKey::Client).ok_or(Error::NotInitialized)?;
        let freelancer: Address = env.storage().instance().get(&DataKey::Freelancer).ok_or(Error::NotInitialized)?;

        if caller != client && caller != freelancer {
            return Err(Error::Unauthorized);
        }

        // Check multi-signature requirement: both client and freelancer must have approved
        let client_approval_key = DataKey::ClientApproval(milestone_id);
        let freelancer_approval_key = DataKey::FreelancerApproval(milestone_id);
        
        let client_approved: bool = env.storage().instance().get(&client_approval_key).unwrap_or(false);
        let freelancer_approved: bool = env.storage().instance().get(&freelancer_approval_key).unwrap_or(false);
        
        if !client_approved || !freelancer_approved {
            return Err(Error::InsufficientApprovals);
        }

        let milestones: Vec<Milestone> = env.storage().instance().get(&DataKey::Milestones).ok_or(Error::NotInitialized)?;
        let mut found = false;
        let mut transfer_amount: i128 = 0;
        let mut updated_milestones = Vec::new(&env);

        for i in 0..milestones.len() {
            let mut milestone = milestones.get(i).unwrap();
            if milestone.id == milestone_id {
                found = true;
                if milestone.status != MilestoneStatus::Approved {
                    return Err(Error::InvalidMilestoneStatus);
                }
                transfer_amount = milestone.amount;
                milestone.status = MilestoneStatus::Released;
            }
            updated_milestones.push_back(milestone);
        }

        if !found {
            return Err(Error::MilestoneNotFound);
        }

        // Payout to freelancer
        let token_address: Address = env.storage().instance().get(&DataKey::Token).ok_or(Error::NotInitialized)?;
        let token_client = token::Client::new(&env, &token_address);
        token_client.transfer(&env.current_contract_address(), &freelancer, &transfer_amount);

        env.storage().instance().set(&DataKey::Milestones, &updated_milestones);
        Ok(())
    }

    /// Freelancer voluntarily refunds locked funds back to the client.
    pub fn refund(env: Env, milestone_id: u32, caller: Address) -> Result<(), Error> {
        caller.require_auth();

        let freelancer: Address = env.storage().instance().get(&DataKey::Freelancer).ok_or(Error::NotInitialized)?;
        if caller != freelancer {
            return Err(Error::Unauthorized);
        }

        let milestones: Vec<Milestone> = env.storage().instance().get(&DataKey::Milestones).ok_or(Error::NotInitialized)?;
        let mut found = false;
        let mut transfer_amount: i128 = 0;
        let mut updated_milestones = Vec::new(&env);

        for i in 0..milestones.len() {
            let mut milestone = milestones.get(i).unwrap();
            if milestone.id == milestone_id {
                found = true;
                // Only non-released and funded milestones can be refunded
                if milestone.status != MilestoneStatus::Funded && milestone.status != MilestoneStatus::Submitted {
                    return Err(Error::InvalidMilestoneStatus);
                }
                transfer_amount = milestone.amount;
                milestone.status = MilestoneStatus::Refunded;
            }
            updated_milestones.push_back(milestone);
        }

        if !found {
            return Err(Error::MilestoneNotFound);
        }

        // Refund client
        let client: Address = env.storage().instance().get(&DataKey::Client).ok_or(Error::NotInitialized)?;
        let token_address: Address = env.storage().instance().get(&DataKey::Token).ok_or(Error::NotInitialized)?;
        let token_client = token::Client::new(&env, &token_address);
        token_client.transfer(&env.current_contract_address(), &client, &transfer_amount);

        env.storage().instance().set(&DataKey::Milestones, &updated_milestones);
        Ok(())
    }

    /// Puts a milestone into dispute, halting regular flow and delegating resolution to the arbiter.
    /// Can be raised by client or freelancer.
    /// Clears any existing approvals when dispute is raised.
    pub fn dispute(env: Env, milestone_id: u32, caller: Address) -> Result<(), Error> {
        caller.require_auth();

        let client: Address = env.storage().instance().get(&DataKey::Client).ok_or(Error::NotInitialized)?;
        let freelancer: Address = env.storage().instance().get(&DataKey::Freelancer).ok_or(Error::NotInitialized)?;

        if caller != client && caller != freelancer {
            return Err(Error::Unauthorized);
        }

        let milestones: Vec<Milestone> = env.storage().instance().get(&DataKey::Milestones).ok_or(Error::NotInitialized)?;
        let mut found = false;
        let mut updated_milestones = Vec::new(&env);

        for i in 0..milestones.len() {
            let mut milestone = milestones.get(i).unwrap();
            if milestone.id == milestone_id {
                found = true;
                if milestone.status != MilestoneStatus::Funded && milestone.status != MilestoneStatus::Submitted && milestone.status != MilestoneStatus::Approved {
                    return Err(Error::InvalidMilestoneStatus);
                }
                milestone.status = MilestoneStatus::Disputed;
                // Clear approvals when dispute is raised
                env.storage().instance().remove(&DataKey::ClientApproval(milestone_id));
                env.storage().instance().remove(&DataKey::FreelancerApproval(milestone_id));
            }
            updated_milestones.push_back(milestone);
        }

        if !found {
            return Err(Error::MilestoneNotFound);
        }

        env.storage().instance().set(&DataKey::Milestones, &updated_milestones);
        Ok(())
    }

    /// Arbiter resolves a dispute by deciding whether to payout freelancer or refund client.
    pub fn resolve_dispute(env: Env, milestone_id: u32, release_to_freelancer: bool) -> Result<(), Error> {
        let arbiter: Address = env.storage().instance().get(&DataKey::Arbiter).ok_or(Error::NotInitialized)?;
        arbiter.require_auth();

        let milestones: Vec<Milestone> = env.storage().instance().get(&DataKey::Milestones).ok_or(Error::NotInitialized)?;
        let mut found = false;
        let mut transfer_amount: i128 = 0;
        let mut updated_milestones = Vec::new(&env);

        for i in 0..milestones.len() {
            let mut milestone = milestones.get(i).unwrap();
            if milestone.id == milestone_id {
                found = true;
                if milestone.status != MilestoneStatus::Disputed {
                    return Err(Error::InvalidMilestoneStatus);
                }
                transfer_amount = milestone.amount;
                milestone.status = if release_to_freelancer {
                    MilestoneStatus::Released
                } else {
                    MilestoneStatus::Refunded
                };
            }
            updated_milestones.push_back(milestone);
        }

        if !found {
            return Err(Error::MilestoneNotFound);
        }

        let recipient: Address = if release_to_freelancer {
            env.storage().instance().get(&DataKey::Freelancer).ok_or(Error::NotInitialized)?
        } else {
            env.storage().instance().get(&DataKey::Client).ok_or(Error::NotInitialized)?
        };

        // Transfer funds
        let token_address: Address = env.storage().instance().get(&DataKey::Token).ok_or(Error::NotInitialized)?;
        let token_client = token::Client::new(&env, &token_address);
        token_client.transfer(&env.current_contract_address(), &recipient, &transfer_amount);

        env.storage().instance().set(&DataKey::Milestones, &updated_milestones);
        Ok(())
    }

    // --- State Getters ---

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

    pub fn get_milestones(env: Env) -> Result<Vec<Milestone>, Error> {
        env.storage().instance().get(&DataKey::Milestones).ok_or(Error::NotInitialized)
    }

    pub fn is_funded(env: Env) -> bool {
        env.storage().instance().get(&DataKey::IsFunded).unwrap_or(false)
    }

    /// Check if client has approved a specific milestone
    pub fn has_client_approval(env: Env, milestone_id: u32) -> bool {
        env.storage().instance().get(&DataKey::ClientApproval(milestone_id)).unwrap_or(false)
    }

    /// Check if freelancer has approved a specific milestone
    pub fn has_freelancer_approval(env: Env, milestone_id: u32) -> bool {
        env.storage().instance().get(&DataKey::FreelancerApproval(milestone_id)).unwrap_or(false)
    }
}

mod test;
