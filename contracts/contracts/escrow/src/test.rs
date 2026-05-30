#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::Address as _,
    vec, Address, Env, String,
};

fn create_token_contract<'a>(env: &Env, admin: &Address) -> Address {
    env.register_stellar_asset_contract_v2(admin.clone()).address()
}

struct TestSetup {
    env: Env,
    #[allow(dead_code)]
    contract_id: Address,
    escrow_client: EscrowContractClient<'static>,
    token_address: Address,
    client: Address,
    freelancer: Address,
    arbiter: Address,
    admin: Address,
}

fn setup_test() -> TestSetup {
    let env = Env::default();
    env.mock_all_auths();

    let client = Address::generate(&env);
    let freelancer = Address::generate(&env);
    let arbiter = Address::generate(&env);
    let admin = Address::generate(&env);
    let token_admin = Address::generate(&env);

    let token_address = create_token_contract(&env, &token_admin);
    let token_admin_client = token::StellarAssetClient::new(&env, &token_address);
    token_admin_client.mint(&client, &1000);

    let contract_id = env.register(EscrowContract, ());
    let escrow_client = EscrowContractClient::new(&env, &contract_id);

    TestSetup {
        env,
        contract_id,
        escrow_client,
        token_address,
        client,
        freelancer,
        arbiter,
        admin,
    }
}

#[test]
fn test_happy_path() {
    let setup = setup_test();
    let escrow = setup.escrow_client;
    let env = setup.env;

    let milestone_1 = Milestone {
        id: 1,
        amount: 100,
        status: MilestoneStatus::Pending,
        description: String::from_str(&env, "Milestone 1"),
    };
    let milestone_2 = Milestone {
        id: 2,
        amount: 200,
        status: MilestoneStatus::Pending,
        description: String::from_str(&env, "Milestone 2"),
    };

    let milestones = vec![&env, milestone_1, milestone_2];

    // Initialize
    escrow.initialize(&setup.client, &setup.freelancer, &setup.arbiter, &setup.token_address, &milestones, &setup.admin, &1000, &0);

    // Verify getters
    assert_eq!(escrow.get_client(), setup.client);
    assert_eq!(escrow.get_freelancer(), setup.freelancer);
    assert_eq!(escrow.get_arbiter(), setup.arbiter);
    assert_eq!(escrow.get_token(), setup.token_address);
    assert_eq!(escrow.is_funded(), false);

    let fetched_milestones = escrow.get_milestones();
    assert_eq!(fetched_milestones.len(), 2);
    assert_eq!(fetched_milestones.get(0).unwrap().status, MilestoneStatus::Pending);

    // Fund
    escrow.fund();
    assert_eq!(escrow.is_funded(), true);

    // Check balances
    let token_client = token::Client::new(&env, &setup.token_address);
    assert_eq!(token_client.balance(&setup.client), 700);
    assert_eq!(token_client.balance(&escrow.address), 300);

    let updated_milestones = escrow.get_milestones();
    assert_eq!(updated_milestones.get(0).unwrap().status, MilestoneStatus::Funded);

    // Submit Milestone 1
    escrow.submit_milestone(&1);
    assert_eq!(escrow.get_milestones().get(0).unwrap().status, MilestoneStatus::Submitted);

    // Approve Milestone 1
    escrow.approve(&1);
    assert_eq!(escrow.get_milestones().get(0).unwrap().status, MilestoneStatus::Approved);

    // Release Milestone 1 by freelancer
    escrow.release(&1, &setup.freelancer);
    assert_eq!(escrow.get_milestones().get(0).unwrap().status, MilestoneStatus::Released);

    // Verify token payout
    assert_eq!(token_client.balance(&setup.freelancer), 100);
    assert_eq!(token_client.balance(&escrow.address), 200);
}

#[test]
fn test_voluntary_refund() {
    let setup = setup_test();
    let escrow = setup.escrow_client;
    let env = setup.env;

    let milestone = Milestone {
        id: 1,
        amount: 250,
        status: MilestoneStatus::Pending,
        description: String::from_str(&env, "Project Work"),
    };
    let milestones = vec![&env, milestone];

    escrow.initialize(&setup.client, &setup.freelancer, &setup.arbiter, &setup.token_address, &milestones, &setup.admin, &1000, &0);
    escrow.fund();

    // Freelancer triggers voluntary refund
    escrow.refund(&1, &setup.freelancer);

    // Verify state updates
    let updated = escrow.get_milestones();
    assert_eq!(updated.get(0).unwrap().status, MilestoneStatus::Refunded);

    let token_client = token::Client::new(&env, &setup.token_address);
    // Client balance is restored (750 + 250 = 1000)
    assert_eq!(token_client.balance(&setup.client), 1000);
    assert_eq!(token_client.balance(&escrow.address), 0);
}

#[test]
fn test_dispute_and_resolve_to_freelancer() {
    let setup = setup_test();
    let escrow = setup.escrow_client;
    let env = setup.env;

    let milestone = Milestone {
        id: 1,
        amount: 400,
        status: MilestoneStatus::Pending,
        description: String::from_str(&env, "High Value Milestone"),
    };
    let milestones = vec![&env, milestone];

    escrow.initialize(&setup.client, &setup.freelancer, &setup.arbiter, &setup.token_address, &milestones, &setup.admin, &1000, &0);
    escrow.fund();
    escrow.submit_milestone(&1);

    // Client disputes the milestone
    escrow.dispute(&1, &setup.client);
    assert_eq!(escrow.get_milestones().get(0).unwrap().status, MilestoneStatus::Disputed);

    // Arbiter resolves dispute in freelancer's favor
    escrow.resolve_dispute(&1, &true);

    // Verify freelancer receives funds
    let token_client = token::Client::new(&env, &setup.token_address);
    assert_eq!(token_client.balance(&setup.freelancer), 400);
    assert_eq!(token_client.balance(&setup.client), 600);
    assert_eq!(escrow.get_milestones().get(0).unwrap().status, MilestoneStatus::Released);
}

#[test]
fn test_dispute_and_resolve_to_client() {
    let setup = setup_test();
    let escrow = setup.escrow_client;
    let env = setup.env;

    let milestone = Milestone {
        id: 1,
        amount: 400,
        status: MilestoneStatus::Pending,
        description: String::from_str(&env, "High Value Milestone"),
    };
    let milestones = vec![&env, milestone];

    escrow.initialize(&setup.client, &setup.freelancer, &setup.arbiter, &setup.token_address, &milestones, &setup.admin, &1000, &0);
    escrow.fund();

    // Freelancer disputes milestone (perhaps client won't approve)
    escrow.dispute(&1, &setup.freelancer);
    assert_eq!(escrow.get_milestones().get(0).unwrap().status, MilestoneStatus::Disputed);

    // Arbiter resolves dispute in client's favor
    escrow.resolve_dispute(&1, &false);

    // Verify client gets refunded
    let token_client = token::Client::new(&env, &setup.token_address);
    assert_eq!(token_client.balance(&setup.client), 1000);
    assert_eq!(token_client.balance(&setup.freelancer), 0);
    assert_eq!(escrow.get_milestones().get(0).unwrap().status, MilestoneStatus::Refunded);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #1)")]
fn test_double_initialization_fails() {
    let setup = setup_test();
    let escrow = setup.escrow_client;
    let env = setup.env;

    let milestone = Milestone {
        id: 1,
        amount: 100,
        status: MilestoneStatus::Pending,
        description: String::from_str(&env, "Milestone"),
    };
    let milestones = vec![&env, milestone];

    escrow.initialize(&setup.client, &setup.freelancer, &setup.arbiter, &setup.token_address, &milestones, &setup.admin, &1000, &0);
    // Double initialize should trigger AlreadyInitialized error (error code 1)
    escrow.initialize(&setup.client, &setup.freelancer, &setup.arbiter, &setup.token_address, &milestones, &setup.admin, &1000, &0);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #8)")]
fn test_zero_amount_fails() {
    let setup = setup_test();
    let escrow = setup.escrow_client;
    let env = setup.env;

    let milestone = Milestone {
        id: 1,
        amount: 0, // Zero amount
        status: MilestoneStatus::Pending,
        description: String::from_str(&env, "Invalid Milestone"),
    };
    let milestones = vec![&env, milestone];

    escrow.initialize(&setup.client, &setup.freelancer, &setup.arbiter, &setup.token_address, &milestones, &setup.admin, &1000, &0);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #7)")]
fn test_unauthorized_release_fails() {
    let setup = setup_test();
    let escrow = setup.escrow_client;
    let env = setup.env;

    let milestone = Milestone {
        id: 1,
        amount: 100,
        status: MilestoneStatus::Pending,
        description: String::from_str(&env, "Milestone"),
    };
    let milestones = vec![&env, milestone];

    escrow.initialize(&setup.client, &setup.freelancer, &setup.arbiter, &setup.token_address, &milestones, &setup.admin, &1000, &0);
    escrow.fund();
    escrow.submit_milestone(&1);
    escrow.approve(&1);

    // Random address tries to trigger release
    let stranger = Address::generate(&env);
    escrow.release(&1, &stranger);
}

#[test]
fn test_pause_unpause() {
    let setup = setup_test();
    let escrow = setup.escrow_client;
    let env = setup.env;

    let milestone = Milestone {
        id: 1,
        amount: 100,
        status: MilestoneStatus::Pending,
        description: String::from_str(&env, "Milestone"),
    };
    let milestones = vec![&env, milestone];

    escrow.initialize(&setup.client, &setup.freelancer, &setup.arbiter, &setup.token_address, &milestones, &setup.admin, &1000, &0);
    
    // Contract should not be paused initially
    assert_eq!(escrow.is_paused(), false);
    
    // Pause the contract
    escrow.pause();
    assert_eq!(escrow.is_paused(), true);
    
    // Unpause the contract
    escrow.unpause();
    assert_eq!(escrow.is_paused(), false);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #9)")]
fn test_pause_blocks_operations() {
    let setup = setup_test();
    let escrow = setup.escrow_client;
    let env = setup.env;

    let milestone = Milestone {
        id: 1,
        amount: 100,
        status: MilestoneStatus::Pending,
        description: String::from_str(&env, "Milestone"),
    };
    let milestones = vec![&env, milestone];

    escrow.initialize(&setup.client, &setup.freelancer, &setup.arbiter, &setup.token_address, &milestones, &setup.admin, &1000, &0);
    escrow.fund();
    
    // Pause the contract
    escrow.pause();
    
    // Try to submit milestone while paused - should fail
    escrow.submit_milestone(&1);
}

#[test]
fn test_emergency_withdraw() {
    let setup = setup_test();
    let escrow = setup.escrow_client;
    let env = setup.env;

    let milestone = Milestone {
        id: 1,
        amount: 100,
        status: MilestoneStatus::Pending,
        description: String::from_str(&env, "Milestone"),
    };
    let milestones = vec![&env, milestone];

    escrow.initialize(&setup.client, &setup.freelancer, &setup.arbiter, &setup.token_address, &milestones, &setup.admin, &1000, &0);
    escrow.fund();
    
    // Initiate emergency withdrawal
    escrow.initiate_emergency_withdraw();
    
    // Verify timelock is set
    let timelock = escrow.get_emergency_withdraw_timelock();
    assert!(timelock > 0);
    
    // Advance time past timelock (48 hours = 172800 seconds)
    setup.env.ledger().set_timestamp(timelock + 1);
    
    // Execute emergency withdrawal to admin
    escrow.emergency_withdraw(&setup.admin);
    
    // Verify milestone status is EmergencyWithdrawn
    let updated_milestones = escrow.get_milestones();
    assert_eq!(updated_milestones.get(0).unwrap().status, MilestoneStatus::EmergencyWithdrawn);
    
    // Verify admin received funds
    let token_client = token::Client::new(&env, &setup.token_address);
    assert_eq!(token_client.balance(&setup.admin), 100);
    assert_eq!(token_client.balance(&escrow.address), 0);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #10)")]
fn test_emergency_withdraw_before_timelock_fails() {
    let setup = setup_test();
    let escrow = setup.escrow_client;
    let env = setup.env;

    let milestone = Milestone {
        id: 1,
        amount: 100,
        status: MilestoneStatus::Pending,
        description: String::from_str(&env, "Milestone"),
    };
    let milestones = vec![&env, milestone];

    escrow.initialize(&setup.client, &setup.freelancer, &setup.arbiter, &setup.token_address, &milestones, &setup.admin, &1000, &0);
    escrow.fund();
    
    // Initiate emergency withdrawal
    escrow.initiate_emergency_withdraw();
    
    // Try to execute immediately without waiting for timelock - should fail
    escrow.emergency_withdraw(&setup.admin);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #11)")]
fn test_max_contract_value_enforced() {
    let setup = setup_test();
    let escrow = setup.escrow_client;
    let env = setup.env;

    let milestone = Milestone {
        id: 1,
        amount: 2000, // Exceeds max_contract_value of 1000
        status: MilestoneStatus::Pending,
        description: String::from_str(&env, "Milestone"),
    };
    let milestones = vec![&env, milestone];

    escrow.initialize(&setup.client, &setup.freelancer, &setup.arbiter, &setup.token_address, &milestones, &setup.admin, &1000, &0);
    
    // Try to fund with amount exceeding max - should fail
    escrow.fund();
}
