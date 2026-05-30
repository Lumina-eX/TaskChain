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
    EmergencyWithdrawn = 7,  // Funds withdrawn via emergency mechanism
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
    Admin,
    Paused,
    EmergencyWithdrawTimelock,
    MaxContractValue,
    DisputeTimelock,
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
    ContractPaused = 9,
    EmergencyWithdrawNotReady = 10,
    MaxValueExceeded = 11,
    DisputeTimelockNotExpired = 12,
    InvalidAddress = 13,
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
        admin: Address,
        max_contract_value: i128,
        dispute_timelock: u64,
    ) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Client) {
            return Err(Error::AlreadyInitialized);
        }

        if milestones.is_empty() {
            return Err(Error::MilestoneNotFound);
        }

        // Validate addresses are not zero
        if client == Address::from(&env) || freelancer == Address::from(&env) || arbiter == Address::from(&env) || token == Address::from(&env) {
            return Err(Error::InvalidAddress);
        }

        // Validate all milestone amounts are greater than zero
        for i in 0..milestones.len() {
            let milestone = milestones.get(i).unwrap();
            if milestone.amount <= 0 {
                return Err(Error::ZeroAmount);
            }
        }

        // Validate max_contract_value is positive
        if max_contract_value <= 0 {
            return Err(Error::ZeroAmount);
        }

        env.storage().instance().set(&DataKey::Client, &client);
        env.storage().instance().set(&DataKey::Freelancer, &freelancer);
        env.storage().instance().set(&DataKey::Arbiter, &arbiter);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::Milestones, &milestones);
        env.storage().instance().set(&DataKey::IsFunded, &false);
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Paused, &false);
        env.storage().instance().set(&DataKey::MaxContractValue, &max_contract_value);
        env.storage().instance().set(&DataKey::DisputeTimelock, &dispute_timelock);

        Ok(())
    }

    /// Helper function to check if contract is paused
    fn is_paused(env: &Env) -> bool {
        env.storage().instance().get(&DataKey::Paused).unwrap_or(false)
    }

    /// The client locks the total funds for all milestones into the contract.
    pub fn fund(env: Env) -> Result<(), Error> {
        // Check if contract is paused
        if Self::is_paused(&env) {
            return Err(Error::ContractPaused);
        }

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

        // Check against max contract value
        let max_value: i128 = env.storage().instance().get(&DataKey::MaxContractValue).ok_or(Error::NotInitialized)?;
        if total_amount > max_value {
            return Err(Error::MaxValueExceeded);
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
        // Check if contract is paused
        if Self::is_paused(&env) {
            return Err(Error::ContractPaused);
        }

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
        // Check if contract is paused
        if Self::is_paused(&env) {
            return Err(Error::ContractPaused);
        }

        let client: Address = env.storage().instance().get(&DataKey::Client).ok_or(Error::NotInitialized)?;
        client.require_auth();

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

    /// Transfers funds of an approved milestone to the freelancer.
    /// Can be triggered by either client or freelancer.
    pub fn release(env: Env, milestone_id: u32, caller: Address) -> Result<(), Error> {
        // Check if contract is paused
        if Self::is_paused(&env) {
            return Err(Error::ContractPaused);
        }

        caller.require_auth();

        let client: Address = env.storage().instance().get(&DataKey::Client).ok_or(Error::NotInitialized)?;
        let freelancer: Address = env.storage().instance().get(&DataKey::Freelancer).ok_or(Error::NotInitialized)?;

        if caller != client && caller != freelancer {
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
        // Check if contract is paused
        if Self::is_paused(&env) {
            return Err(Error::ContractPaused);
        }

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
    pub fn dispute(env: Env, milestone_id: u32, caller: Address) -> Result<(), Error> {
        // Check if contract is paused
        if Self::is_paused(&env) {
            return Err(Error::ContractPaused);
        }

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
                if milestone.status != MilestoneStatus::Funded && milestone.status != MilestoneStatus::Submitted {
                    return Err(Error::InvalidMilestoneStatus);
                }
                milestone.status = MilestoneStatus::Disputed;
                // Store the dispute timestamp for timelock check
                env.storage().instance().set(&DataKey::DisputeTimelock, &env.ledger().timestamp());
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

    // --- Admin Functions ---

    /// Pause the contract - only callable by admin
    pub fn pause(env: Env) -> Result<(), Error> {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).ok_or(Error::NotInitialized)?;
        admin.require_auth();
        
        env.storage().instance().set(&DataKey::Paused, &true);
        Ok(())
    }

    /// Unpause the contract - only callable by admin
    pub fn unpause(env: Env) -> Result<(), Error> {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).ok_or(Error::NotInitialized)?;
        admin.require_auth();
        
        env.storage().instance().set(&DataKey::Paused, &false);
        Ok(())
    }

    /// Initiate emergency withdrawal - sets timelock, only callable by admin
    pub fn initiate_emergency_withdraw(env: Env) -> Result<(), Error> {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).ok_or(Error::NotInitialized)?;
        admin.require_auth();
        
        // Set timelock to 48 hours from now (in ledger timestamp)
        let timelock = env.ledger().timestamp() + 172800; // 48 hours in seconds
        env.storage().instance().set(&DataKey::EmergencyWithdrawTimelock, &timelock);
        
        Ok(())
    }

    /// Execute emergency withdrawal - only callable by admin after timelock expires
    pub fn emergency_withdraw(env: Env, recipient: Address) -> Result<(), Error> {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).ok_or(Error::NotInitialized)?;
        admin.require_auth();
        
        let timelock: u64 = env.storage().instance().get(&DataKey::EmergencyWithdrawTimelock).ok_or(Error::EmergencyWithdrawNotReady)?;
        let current_timestamp = env.ledger().timestamp();
        
        if current_timestamp < timelock {
            return Err(Error::EmergencyWithdrawNotReady);
        }
        
        // Calculate total remaining balance
        let milestones: Vec<Milestone> = env.storage().instance().get(&DataKey::Milestones).ok_or(Error::NotInitialized)?;
        let mut total_amount: i128 = 0;
        
        for i in 0..milestones.len() {
            let milestone = milestones.get(i).unwrap();
            // Only withdraw from milestones that haven't been released or refunded
            if milestone.status == MilestoneStatus::Funded || milestone.status == MilestoneStatus::Submitted || milestone.status == MilestoneStatus::Approved {
                total_amount += milestone.amount;
            }
        }
        
        if total_amount <= 0 {
            return Err(Error::ZeroAmount);
        }
        
        // Transfer all remaining funds to recipient
        let token_address: Address = env.storage().instance().get(&DataKey::Token).ok_or(Error::NotInitialized)?;
        let token_client = token::Client::new(&env, &token_address);
        token_client.transfer(&env.current_contract_address(), &recipient, &total_amount);
        
        // Update all affected milestones to EmergencyWithdrawn status
        let mut updated_milestones = Vec::new(&env);
        for i in 0..milestones.len() {
            let mut milestone = milestones.get(i).unwrap();
            if milestone.status == MilestoneStatus::Funded || milestone.status == MilestoneStatus::Submitted || milestone.status == MilestoneStatus::Approved {
                milestone.status = MilestoneStatus::EmergencyWithdrawn;
            }
            updated_milestones.push_back(milestone);
        }
        
        env.storage().instance().set(&DataKey::Milestones, &updated_milestones);
        
        // Clear the timelock
        env.storage().instance().set(&DataKey::EmergencyWithdrawTimelock, &0u64);
        
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

    pub fn get_admin(env: Env) -> Result<Address, Error> {
        env.storage().instance().get(&DataKey::Admin).ok_or(Error::NotInitialized)
    }

    pub fn is_paused(env: Env) -> bool {
        env.storage().instance().get(&DataKey::Paused).unwrap_or(false)
    }

    pub fn get_max_contract_value(env: Env) -> Result<i128, Error> {
        env.storage().instance().get(&DataKey::MaxContractValue).ok_or(Error::NotInitialized)
    }

    pub fn get_emergency_withdraw_timelock(env: Env) -> Result<u64, Error> {
        env.storage().instance().get(&DataKey::EmergencyWithdrawTimelock).ok_or(Error::NotInitialized)
    }
}

mod test;
