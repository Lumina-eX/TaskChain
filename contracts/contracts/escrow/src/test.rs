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
    admin: Address,
    client: Address,
    freelancer: Address,
    arbiter: Address,
}

fn setup_test() -> TestSetup {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let client = Address::generate(&env);
    let freelancer = Address::generate(&env);
    let arbiter = Address::generate(&env);
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
        admin,
        client,
        freelancer,
        arbiter,
    }
}

fn milestone(env: &Env, id: u32, amount: i128) -> Milestone {
    Milestone {
        id,
        deadline: 0,
        amount,
        status: MilestoneStatus::Pending,
        description: String::from_str(env, "Security milestone"),
        client_approved: false,
        freelancer_approved: false,
    }
}

fn initialize_single_milestone(setup: &TestSetup, amount: i128) {
    let milestones = vec![&setup.env, milestone(&setup.env, 1, amount)];
    setup.escrow_client.initialize(
        &setup.admin,
        &setup.client,
        &setup.freelancer,
        &setup.arbiter,
        &setup.token_address,
        &milestones,
    );
}

fn fully_approve_single_milestone(setup: &TestSetup) {
    setup.escrow_client.fund();
    setup.escrow_client.submit_milestone(&1);
    setup.escrow_client.approve(&1);
    setup.escrow_client.freelancer_confirm(&1);
}

#[test]
fn test_happy_path() {
    let setup = setup_test();
    let escrow = setup.escrow_client;
    let env = setup.env;

    let milestone_1 = Milestone {
        id: 1,
        deadline: 0,
        amount: 100,
        status: MilestoneStatus::Pending,
        description: String::from_str(&env, "Milestone 1"),
        client_approved: false,
        freelancer_approved: false,
    };
    let milestone_2 = Milestone {
        id: 2,
        deadline: 0,
        amount: 200,
        status: MilestoneStatus::Pending,
        description: String::from_str(&env, "Milestone 2"),
        client_approved: false,
        freelancer_approved: false,
    };

    let milestones = vec![&env, milestone_1, milestone_2];

    // Initialize
    escrow.initialize(&setup.admin, &setup.client, &setup.freelancer, &setup.arbiter, &setup.token_address, &milestones);

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

    // Approve Milestone 1 by client
    escrow.approve(&1);
    assert_eq!(escrow.get_milestones().get(0).unwrap().status, MilestoneStatus::Approved);
    assert_eq!(escrow.has_client_approval(&1), true);

    // Freelancer confirms Milestone 1 (multi-sig requirement)
    escrow.freelancer_confirm(&1);
    assert_eq!(escrow.has_freelancer_approval(&1), true);

    // Release Milestone 1 by freelancer (now both approvals are present)
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
        deadline: 0,
        amount: 250,
        status: MilestoneStatus::Pending,
        description: String::from_str(&env, "Project Work"),
        client_approved: false,
        freelancer_approved: false,
    };
    let milestones = vec![&env, milestone];

    escrow.initialize(&setup.admin, &setup.client, &setup.freelancer, &setup.arbiter, &setup.token_address, &milestones);
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
        deadline: 0,
        amount: 400,
        status: MilestoneStatus::Pending,
        description: String::from_str(&env, "High Value Milestone"),
        client_approved: false,
        freelancer_approved: false,
    };
    let milestones = vec![&env, milestone];

    escrow.initialize(&setup.admin, &setup.client, &setup.freelancer, &setup.arbiter, &setup.token_address, &milestones);
    escrow.fund();
    escrow.submit_milestone(&1);
    escrow.approve(&1);

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
        deadline: 0,
        amount: 400,
        status: MilestoneStatus::Pending,
        description: String::from_str(&env, "High Value Milestone"),
        client_approved: false,
        freelancer_approved: false,
    };
    let milestones = vec![&env, milestone];

    escrow.initialize(&setup.admin, &setup.client, &setup.freelancer, &setup.arbiter, &setup.token_address, &milestones);
    escrow.fund();
    escrow.submit_milestone(&1);

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
        deadline: 0,
        amount: 100,
        status: MilestoneStatus::Pending,
        description: String::from_str(&env, "Milestone"),
        client_approved: false,
        freelancer_approved: false,
    };
    let milestones = vec![&env, milestone];

    escrow.initialize(&setup.admin, &setup.client, &setup.freelancer, &setup.arbiter, &setup.token_address, &milestones);
    // Double initialize should trigger AlreadyInitialized error (error code 1)
    escrow.initialize(&setup.admin, &setup.client, &setup.freelancer, &setup.arbiter, &setup.token_address, &milestones);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #8)")]
fn test_zero_amount_fails() {
    let setup = setup_test();
    let escrow = setup.escrow_client;
    let env = setup.env;

    let milestone = Milestone {
        id: 1,
        deadline: 0,
        amount: 0, // Zero amount
        status: MilestoneStatus::Pending,
        description: String::from_str(&env, "Invalid Milestone"),
        client_approved: false,
        freelancer_approved: false,
    };
    let milestones = vec![&env, milestone];

    escrow.initialize(&setup.admin, &setup.client, &setup.freelancer, &setup.arbiter, &setup.token_address, &milestones);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #7)")]
fn test_unauthorized_release_fails() {
    let setup = setup_test();
    let escrow = setup.escrow_client;
    let env = setup.env;

    let milestone = Milestone {
        id: 1,
        deadline: 0,
        amount: 100,
        status: MilestoneStatus::Pending,
        description: String::from_str(&env, "Milestone"),
        client_approved: false,
        freelancer_approved: false,
    };
    let milestones = vec![&env, milestone];

    escrow.initialize(&setup.admin, &setup.client, &setup.freelancer, &setup.arbiter, &setup.token_address, &milestones);
    escrow.fund();
    escrow.submit_milestone(&1);
    escrow.approve(&1);
    escrow.freelancer_confirm(&1);

    // Random address tries to trigger release
    let stranger = Address::generate(&env);
    escrow.release(&1, &stranger);
}

#[test]
fn test_version() {
    let setup = setup_test();
    let escrow = setup.escrow_client;
    let env = setup.env;

    let milestone = Milestone {
        id: 1,
        deadline: 0,
        amount: 100,
        status: MilestoneStatus::Pending,
        description: String::from_str(&env, "Milestone"),
        client_approved: false,
        freelancer_approved: false,
    };
    let milestones = vec![&env, milestone];

    escrow.initialize(&setup.admin, &setup.client, &setup.freelancer, &setup.arbiter, &setup.token_address, &milestones);

    assert_eq!(escrow.version(), 1);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #9)")]
fn test_release_without_both_approvals_fails() {
    let setup = setup_test();
    let escrow = setup.escrow_client;
    let env = setup.env;

    let milestone = Milestone {
        id: 1,
        deadline: 0,
        amount: 100,
        status: MilestoneStatus::Pending,
        description: String::from_str(&env, "Milestone"),
        client_approved: false,
        freelancer_approved: false,
    };
    let milestones = vec![&env, milestone];

    escrow.initialize(&setup.admin, &setup.client, &setup.freelancer, &setup.arbiter, &setup.token_address, &milestones);
    escrow.fund();
    escrow.submit_milestone(&1);
    escrow.approve(&1);
    // Missing freelancer_confirm - should fail with InsufficientApprovals (error code 9)
    escrow.release(&1, &setup.client);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #10)")]
fn test_double_client_approval_fails() {
    let setup = setup_test();
    let escrow = setup.escrow_client;
    let env = setup.env;

    let milestone = Milestone {
        id: 1,
        deadline: 0,
        amount: 100,
        status: MilestoneStatus::Pending,
        description: String::from_str(&env, "Milestone"),
        client_approved: false,
        freelancer_approved: false,
    };
    let milestones = vec![&env, milestone];

    escrow.initialize(&setup.admin, &setup.client, &setup.freelancer, &setup.arbiter, &setup.token_address, &milestones);
    escrow.fund();
    escrow.submit_milestone(&1);
    escrow.approve(&1);
    // Double approval should fail with AlreadyApproved (error code 10)
    escrow.approve(&1);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #10)")]
fn test_double_freelancer_confirmation_fails() {
    let setup = setup_test();
    let escrow = setup.escrow_client;
    let env = setup.env;

    let milestone = Milestone {
        id: 1,
        deadline: 0,
        amount: 100,
        status: MilestoneStatus::Pending,
        description: String::from_str(&env, "Milestone"),
        client_approved: false,
        freelancer_approved: false,
    };
    let milestones = vec![&env, milestone];

    escrow.initialize(&setup.admin, &setup.client, &setup.freelancer, &setup.arbiter, &setup.token_address, &milestones);
    escrow.fund();
    escrow.submit_milestone(&1);
    escrow.approve(&1);
    escrow.freelancer_confirm(&1);
    // Double confirmation should fail with AlreadyApproved (error code 10)
    escrow.freelancer_confirm(&1);
}

#[test]
fn test_dispute_clears_approvals() {
    let setup = setup_test();
    let escrow = setup.escrow_client;
    let env = setup.env;

    let milestone = Milestone {
        id: 1,
        deadline: 0,
        amount: 400,
        status: MilestoneStatus::Pending,
        description: String::from_str(&env, "High Value Milestone"),
        client_approved: false,
        freelancer_approved: false,
    };
    let milestones = vec![&env, milestone];

    escrow.initialize(&setup.admin, &setup.client, &setup.freelancer, &setup.arbiter, &setup.token_address, &milestones);
    escrow.fund();
    escrow.submit_milestone(&1);
    escrow.approve(&1);
    escrow.freelancer_confirm(&1);

    // Verify both approvals are set
    assert_eq!(escrow.has_client_approval(&1), true);
    assert_eq!(escrow.has_freelancer_approval(&1), true);

    // Client disputes the milestone
    escrow.dispute(&1, &setup.client);
    assert_eq!(escrow.get_milestones().get(0).unwrap().status, MilestoneStatus::Disputed);

    // Verify approvals are cleared
    assert_eq!(escrow.has_client_approval(&1), false);
    assert_eq!(escrow.has_freelancer_approval(&1), false);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #7)")]
fn test_unauthorized_refund_fails() {
    let setup = setup_test();
    initialize_single_milestone(&setup, 150);
    setup.escrow_client.fund();

    setup.escrow_client.refund(&1, &setup.client);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #7)")]
fn test_unauthorized_dispute_fails() {
    let setup = setup_test();
    initialize_single_milestone(&setup, 150);
    setup.escrow_client.fund();

    let stranger = Address::generate(&setup.env);
    setup.escrow_client.dispute(&1, &stranger);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #5)")]
fn test_submit_invalid_milestone_fails() {
    let setup = setup_test();
    initialize_single_milestone(&setup, 150);
    setup.escrow_client.fund();

    setup.escrow_client.submit_milestone(&99);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #5)")]
fn test_release_invalid_milestone_fails() {
    let setup = setup_test();
    initialize_single_milestone(&setup, 150);
    fully_approve_single_milestone(&setup);

    setup.escrow_client.release(&99, &setup.client);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #6)")]
fn test_double_release_replay_fails() {
    let setup = setup_test();
    initialize_single_milestone(&setup, 150);
    fully_approve_single_milestone(&setup);
    setup.escrow_client.release(&1, &setup.client);

    setup.escrow_client.release(&1, &setup.client);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #6)")]
fn test_double_refund_replay_fails() {
    let setup = setup_test();
    initialize_single_milestone(&setup, 150);
    setup.escrow_client.fund();
    setup.escrow_client.refund(&1, &setup.freelancer);

    setup.escrow_client.refund(&1, &setup.freelancer);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #6)")]
fn test_dispute_after_release_fails() {
    let setup = setup_test();
    initialize_single_milestone(&setup, 150);
    fully_approve_single_milestone(&setup);
    setup.escrow_client.release(&1, &setup.freelancer);

    setup.escrow_client.dispute(&1, &setup.client);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #6)")]
fn test_refund_after_release_fails() {
    let setup = setup_test();
    initialize_single_milestone(&setup, 150);
    fully_approve_single_milestone(&setup);
    setup.escrow_client.release(&1, &setup.freelancer);

    setup.escrow_client.refund(&1, &setup.freelancer);
}

#[test]
fn test_successful_security_events_are_emitted() {
    let setup = setup_test();
    let env = setup.env.clone();
    let initial_event_count = env.events().all().len();

    initialize_single_milestone(&setup, 150);
    assert_eq!(env.events().all().len(), initial_event_count + 1);

    setup.escrow_client.fund();
    assert_eq!(env.events().all().len(), initial_event_count + 2);

    setup.escrow_client.submit_milestone(&1);
    assert_eq!(env.events().all().len(), initial_event_count + 3);

    setup.escrow_client.approve(&1);
    assert_eq!(env.events().all().len(), initial_event_count + 4);

    setup.escrow_client.freelancer_confirm(&1);
    assert_eq!(env.events().all().len(), initial_event_count + 5);

    setup.escrow_client.release(&1, &setup.client);
    assert_eq!(env.events().all().len(), initial_event_count + 6);
}
