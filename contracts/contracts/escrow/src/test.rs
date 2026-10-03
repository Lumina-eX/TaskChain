#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Events as _, Ledger as _},
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
        status: MilestoneStatus::Created,
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

fn milestone_with_deadline(env: &Env, id: u32, amount: i128, deadline: u64) -> Milestone {
    Milestone {
        id,
        deadline,
        amount,
        status: MilestoneStatus::Pending,
        description: String::from_str(env, "Deadline milestone"),
        client_approved: false,
        freelancer_approved: false,
    }
}

fn initialize_single_milestone_with_deadline(setup: &TestSetup, amount: i128, deadline: u64) {
    let milestones = vec![
        &setup.env,
        milestone_with_deadline(&setup.env, 1, amount, deadline),
    ];
    setup.escrow_client.initialize(
        &setup.admin,
        &setup.client,
        &setup.freelancer,
        &setup.arbiter,
        &setup.token_address,
        &milestones,
    );
}

fn contract_event_count(env: &Env, client: &EscrowContractClient<'_>) -> usize {
    env.events()
        .all()
        .filter_by_contract(&client.address)
        .events()
        .len()
}

fn fully_approve_single_milestone(setup: &TestSetup) {
    setup.escrow_client.fund();
    setup.escrow_client.start_milestone(&1);
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
        status: MilestoneStatus::Created,
        description: String::from_str(&env, "Milestone 1"),
        client_approved: false,
        freelancer_approved: false,
    };
    let milestone_2 = Milestone {
        id: 2,
        deadline: 0,
        amount: 200,
        status: MilestoneStatus::Created,
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
    assert_eq!(fetched_milestones.get(0).unwrap().status, MilestoneStatus::Created);

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
    escrow.start_milestone(&1);
    escrow.submit_milestone(&1);
    assert_eq!(escrow.get_milestones().get(0).unwrap().status, MilestoneStatus::Submitted);

    // Approve Milestone 1 by client
    escrow.approve(&1);
    assert_eq!(escrow.get_milestones().get(0).unwrap().status, MilestoneStatus::Approved);
    assert_eq!(escrow.has_client_approval(&1), true);

    // Release Milestone 1 by client (client-only authorization)
    escrow.release(&1, &setup.client);
    assert_eq!(escrow.get_milestones().get(0).unwrap().status, MilestoneStatus::Released);

    // Verify token payout and escrow balance tracking
    assert_eq!(token_client.balance(&setup.freelancer), 100);
    assert_eq!(token_client.balance(&escrow.address), 200);
    assert_eq!(escrow.get_escrow_balance(), 200);
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
        status: MilestoneStatus::Created,
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
        status: MilestoneStatus::Created,
        description: String::from_str(&env, "High Value Milestone"),
        client_approved: false,
        freelancer_approved: false,
    };
    let milestones = vec![&env, milestone];

    escrow.initialize(&setup.admin, &setup.client, &setup.freelancer, &setup.arbiter, &setup.token_address, &milestones);
    escrow.fund();
    escrow.start_milestone(&1);
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
    assert_eq!(escrow.get_milestones().get(0).unwrap().status, MilestoneStatus::Resolved);
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
        status: MilestoneStatus::Created,
        description: String::from_str(&env, "High Value Milestone"),
        client_approved: false,
        freelancer_approved: false,
    };
    let milestones = vec![&env, milestone];

    escrow.initialize(&setup.admin, &setup.client, &setup.freelancer, &setup.arbiter, &setup.token_address, &milestones);
    escrow.fund();
    escrow.start_milestone(&1);
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
    assert_eq!(escrow.get_milestones().get(0).unwrap().status, MilestoneStatus::Resolved);
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
        status: MilestoneStatus::Created,
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
        status: MilestoneStatus::Created,
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
        status: MilestoneStatus::Created,
        description: String::from_str(&env, "Milestone"),
        client_approved: false,
        freelancer_approved: false,
    };
    let milestones = vec![&env, milestone];

    escrow.initialize(&setup.admin, &setup.client, &setup.freelancer, &setup.arbiter, &setup.token_address, &milestones);
    escrow.fund();
    escrow.start_milestone(&1);
    escrow.submit_milestone(&1);
    escrow.approve(&1);

    // Freelancer tries to trigger release (unauthorized, only client can do this)
    escrow.release(&1, &setup.freelancer);
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
        status: MilestoneStatus::Created,
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
fn test_release_without_approval_fails() {
    let setup = setup_test();
    let escrow = setup.escrow_client;
    let env = setup.env;

    let milestone = Milestone {
        id: 1,
        deadline: 0,
        amount: 100,
        status: MilestoneStatus::Created,
        description: String::from_str(&env, "Milestone"),
        client_approved: false,
        freelancer_approved: false,
    };
    let milestones = vec![&env, milestone];

    escrow.initialize(&setup.admin, &setup.client, &setup.freelancer, &setup.arbiter, &setup.token_address, &milestones);
    escrow.fund();
    escrow.start_milestone(&1);
    escrow.submit_milestone(&1);
    // Missing client approval - should fail with InsufficientApprovals (error code 9)
    escrow.release(&1, &setup.client);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #6)")]
fn test_double_client_approval_fails() {
    let setup = setup_test();
    let escrow = setup.escrow_client;
    let env = setup.env;

    let milestone = Milestone {
        id: 1,
        deadline: 0,
        amount: 100,
        status: MilestoneStatus::Created,
        description: String::from_str(&env, "Milestone"),
        client_approved: false,
        freelancer_approved: false,
    };
    let milestones = vec![&env, milestone];

    escrow.initialize(&setup.admin, &setup.client, &setup.freelancer, &setup.arbiter, &setup.token_address, &milestones);
    escrow.fund();
    escrow.start_milestone(&1);
    escrow.submit_milestone(&1);
    escrow.approve(&1);
    // Once approved, the milestone is no longer in Submitted state.
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
        status: MilestoneStatus::Created,
        description: String::from_str(&env, "Milestone"),
        client_approved: false,
        freelancer_approved: false,
    };
    let milestones = vec![&env, milestone];

    escrow.initialize(&setup.admin, &setup.client, &setup.freelancer, &setup.arbiter, &setup.token_address, &milestones);
    escrow.fund();
    escrow.start_milestone(&1);
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
        status: MilestoneStatus::Created,
        description: String::from_str(&env, "High Value Milestone"),
        client_approved: false,
        freelancer_approved: false,
    };
    let milestones = vec![&env, milestone];

    escrow.initialize(&setup.admin, &setup.client, &setup.freelancer, &setup.arbiter, &setup.token_address, &milestones);
    escrow.fund();
    escrow.start_milestone(&1);
    escrow.submit_milestone(&1);
    escrow.approve(&1);

    // Verify client approval is set
    assert_eq!(escrow.has_client_approval(&1), true);

    // Client disputes the milestone
    escrow.dispute(&1, &setup.client);
    assert_eq!(escrow.get_milestones().get(0).unwrap().status, MilestoneStatus::Disputed);

    // Verify approvals are cleared
    assert_eq!(escrow.has_client_approval(&1), false);
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
    setup.escrow_client.release(&1, &setup.client);

    setup.escrow_client.dispute(&1, &setup.client);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #6)")]
fn test_refund_after_release_fails() {
    let setup = setup_test();
    initialize_single_milestone(&setup, 150);
    fully_approve_single_milestone(&setup);
    setup.escrow_client.release(&1, &setup.client);

    setup.escrow_client.refund(&1, &setup.freelancer);
}

#[test]
fn test_successful_security_events_are_emitted() {
    let setup = setup_test();
    let env = setup.env.clone();

    initialize_single_milestone(&setup, 150);
    assert_eq!(
        env.events()
            .all()
            .filter_by_contract(&setup.escrow_client.address)
            .events()
            .len(),
        1
    );

    setup.escrow_client.fund();
    assert_eq!(
        env.events()
            .all()
            .filter_by_contract(&setup.escrow_client.address)
            .events()
            .len(),
        1
    );

    setup.escrow_client.start_milestone(&1);
    setup.escrow_client.submit_milestone(&1);
    assert_eq!(
        env.events()
            .all()
            .filter_by_contract(&setup.escrow_client.address)
            .events()
            .len(),
        1
    );

    setup.escrow_client.approve(&1);
    assert_eq!(
        env.events()
            .all()
            .filter_by_contract(&setup.escrow_client.address)
            .events()
            .len(),
        1
    );

    setup.escrow_client.freelancer_confirm(&1);
    assert_eq!(
        env.events()
            .all()
            .filter_by_contract(&setup.escrow_client.address)
            .events()
            .len(),
        1
    );

    setup.escrow_client.release(&1, &setup.client);
    assert_eq!(
        env.events()
            .all()
            .filter_by_contract(&setup.escrow_client.address)
            .events()
            .len(),
        1
    );
}

// --- Deadline: set / extend ---

#[test]
fn test_set_deadline_stores_value_and_emits_event() {
    let setup = setup_test();
    initialize_single_milestone(&setup, 100);
    let escrow = setup.escrow_client;
    let env = setup.env.clone();

    env.ledger().set_timestamp(1_000);
    assert_eq!(escrow.get_milestone_deadline(&1), 0);
    assert_eq!(escrow.is_milestone_expired(&1), false);

    let before = contract_event_count(&env, &escrow);
    escrow.set_deadline(&1, &setup.client, &5_000);
    let after = contract_event_count(&env, &escrow);

    assert_eq!(escrow.get_milestone_deadline(&1), 5_000);
    assert_eq!(after, before + 1);
    assert_eq!(escrow.is_milestone_expired(&1), false);

    env.ledger().set_timestamp(5_001);
    assert_eq!(escrow.is_milestone_expired(&1), true);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #7)")]
fn test_set_deadline_unauthorized_fails() {
    let setup = setup_test();
    initialize_single_milestone(&setup, 100);
    let escrow = setup.escrow_client;
    let env = setup.env.clone();

    env.ledger().set_timestamp(1_000);
    let stranger = Address::generate(&env);
    escrow.set_deadline(&1, &stranger, &5_000);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #14)")]
fn test_set_deadline_in_past_fails() {
    let setup = setup_test();
    initialize_single_milestone(&setup, 100);
    let escrow = setup.escrow_client;
    let env = setup.env.clone();

    env.ledger().set_timestamp(1_000);
    escrow.set_deadline(&1, &setup.client, &1_000);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #15)")]
fn test_set_deadline_twice_fails() {
    let setup = setup_test();
    initialize_single_milestone(&setup, 100);
    let escrow = setup.escrow_client;
    let env = setup.env.clone();

    env.ledger().set_timestamp(1_000);
    escrow.set_deadline(&1, &setup.client, &5_000);
    escrow.set_deadline(&1, &setup.client, &6_000);
}

#[test]
fn test_extend_deadline_by_arbiter_succeeds() {
    let setup = setup_test();
    initialize_single_milestone(&setup, 100);
    let escrow = setup.escrow_client;
    let env = setup.env.clone();

    env.ledger().set_timestamp(1_000);
    escrow.set_deadline(&1, &setup.client, &5_000);
    escrow.extend_deadline(&1, &setup.arbiter, &9_000);
    assert_eq!(escrow.get_milestone_deadline(&1), 9_000);
}

#[test]
fn test_expired_milestone_can_be_extended_then_submitted() {
    let setup = setup_test();
    initialize_single_milestone_with_deadline(&setup, 100, 5_000);
    let escrow = setup.escrow_client;
    let env = setup.env.clone();

    env.ledger().set_timestamp(1_000);
    escrow.fund();

    env.ledger().set_timestamp(6_000);
    assert_eq!(escrow.is_milestone_expired(&1), true);

    escrow.extend_deadline(&1, &setup.arbiter, &20_000);
    assert_eq!(escrow.get_milestone_deadline(&1), 20_000);
    assert_eq!(escrow.is_milestone_expired(&1), false);

    // After the extension the milestone is live again and can be worked on.
    escrow.submit_milestone(&1);
    assert_eq!(escrow.get_milestones().get(0).unwrap().status, MilestoneStatus::Submitted);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #7)")]
fn test_extend_deadline_unauthorized_fails() {
    let setup = setup_test();
    initialize_single_milestone(&setup, 100);
    let escrow = setup.escrow_client;
    let env = setup.env.clone();

    env.ledger().set_timestamp(1_000);
    escrow.set_deadline(&1, &setup.client, &5_000);
    escrow.extend_deadline(&1, &setup.freelancer, &9_000);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #14)")]
fn test_extend_deadline_backwards_fails() {
    let setup = setup_test();
    initialize_single_milestone(&setup, 100);
    let escrow = setup.escrow_client;
    let env = setup.env.clone();

    env.ledger().set_timestamp(1_000);
    escrow.set_deadline(&1, &setup.client, &5_000);
    escrow.extend_deadline(&1, &setup.client, &4_000);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #14)")]
fn test_extend_deadline_without_existing_deadline_fails() {
    let setup = setup_test();
    initialize_single_milestone(&setup, 100);
    let escrow = setup.escrow_client;
    let env = setup.env.clone();

    env.ledger().set_timestamp(1_000);
    escrow.extend_deadline(&1, &setup.client, &5_000);
}

// --- Deadline: approval / release / submission guards ---

#[test]
#[should_panic(expected = "HostError: Error(Contract, #11)")]
fn test_submit_after_deadline_expired_fails() {
    let setup = setup_test();
    initialize_single_milestone_with_deadline(&setup, 100, 5_000);
    let escrow = setup.escrow_client;
    let env = setup.env.clone();

    env.ledger().set_timestamp(1_000);
    escrow.fund();

    env.ledger().set_timestamp(5_001);
    escrow.submit_milestone(&1);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #11)")]
fn test_approve_after_deadline_expired_fails() {
    let setup = setup_test();
    initialize_single_milestone_with_deadline(&setup, 100, 5_000);
    let escrow = setup.escrow_client;
    let env = setup.env.clone();

    env.ledger().set_timestamp(1_000);
    escrow.fund();
    escrow.submit_milestone(&1);

    env.ledger().set_timestamp(5_001);
    escrow.approve(&1);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #11)")]
fn test_release_after_deadline_expired_fails() {
    let setup = setup_test();
    initialize_single_milestone_with_deadline(&setup, 100, 5_000);
    let escrow = setup.escrow_client;
    let env = setup.env.clone();

    env.ledger().set_timestamp(1_000);
    escrow.fund();
    escrow.submit_milestone(&1);
    escrow.approve(&1);

    // Even a fully approved milestone cannot be released after expiry.
    env.ledger().set_timestamp(5_001);
    escrow.release(&1, &setup.client);
}

// --- Deadline: client-initiated refunds after expiry ---

#[test]
fn test_client_refund_after_expiry_when_funded_no_submission() {
    let setup = setup_test();
    initialize_single_milestone_with_deadline(&setup, 250, 5_000);
    let escrow = setup.escrow_client;
    let env = setup.env.clone();

    env.ledger().set_timestamp(1_000);
    escrow.fund();
    assert_eq!(escrow.is_funded(), true);

    env.ledger().set_timestamp(5_001);
    assert_eq!(escrow.is_milestone_expired(&1), true);

    let before = contract_event_count(&env, &escrow);
    escrow.claim_expired_refund(&1, &setup.client);
    let after = contract_event_count(&env, &escrow);

    // DeadlineExpired + RefundIssued
    assert_eq!(after, before + 2);
    assert_eq!(escrow.get_milestones().get(0).unwrap().status, MilestoneStatus::Refunded);

    let token_client = token::Client::new(&env, &setup.token_address);
    assert_eq!(token_client.balance(&setup.client), 1000);
    assert_eq!(token_client.balance(&escrow.address), 0);
    assert_eq!(escrow.get_escrow_balance(), 0);
}

#[test]
fn test_client_refund_after_expiry_when_submitted() {
    let setup = setup_test();
    initialize_single_milestone_with_deadline(&setup, 150, 5_000);
    let escrow = setup.escrow_client;
    let env = setup.env.clone();

    env.ledger().set_timestamp(1_000);
    escrow.fund();
    escrow.submit_milestone(&1);

    env.ledger().set_timestamp(5_001);
    escrow.claim_expired_refund(&1, &setup.client);

    assert_eq!(escrow.get_milestones().get(0).unwrap().status, MilestoneStatus::Refunded);
    let token_client = token::Client::new(&env, &setup.token_address);
    assert_eq!(token_client.balance(&setup.client), 1000);
    assert_eq!(token_client.balance(&escrow.address), 0);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #13)")]
fn test_client_refund_before_expiry_fails() {
    let setup = setup_test();
    initialize_single_milestone_with_deadline(&setup, 100, 5_000);
    let escrow = setup.escrow_client;
    let env = setup.env.clone();

    env.ledger().set_timestamp(1_000);
    escrow.fund();
    escrow.claim_expired_refund(&1, &setup.client);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #7)")]
fn test_client_refund_unauthorized_fails() {
    let setup = setup_test();
    initialize_single_milestone_with_deadline(&setup, 100, 5_000);
    let escrow = setup.escrow_client;
    let env = setup.env.clone();

    env.ledger().set_timestamp(1_000);
    escrow.fund();

    env.ledger().set_timestamp(5_001);
    escrow.claim_expired_refund(&1, &setup.freelancer);
}

// --- Deadline: disputes after expiry keep funds locked ---

#[test]
fn test_dispute_can_be_raised_after_expiry() {
    let setup = setup_test();
    initialize_single_milestone_with_deadline(&setup, 400, 5_000);
    let escrow = setup.escrow_client;
    let env = setup.env.clone();

    env.ledger().set_timestamp(1_000);
    escrow.fund();
    escrow.submit_milestone(&1);

    env.ledger().set_timestamp(6_000);
    assert_eq!(escrow.is_milestone_expired(&1), true);

    escrow.dispute(&1, &setup.client);
    assert_eq!(escrow.get_milestones().get(0).unwrap().status, MilestoneStatus::Disputed);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #16)")]
fn test_claim_refund_locked_when_disputed_after_expiry() {
    let setup = setup_test();
    initialize_single_milestone_with_deadline(&setup, 400, 5_000);
    let escrow = setup.escrow_client;
    let env = setup.env.clone();

    env.ledger().set_timestamp(1_000);
    escrow.fund();
    escrow.submit_milestone(&1);

    env.ledger().set_timestamp(6_000);
    escrow.dispute(&1, &setup.client);
    // Refund is blocked while the dispute is open; the arbiter must resolve it.
    escrow.claim_expired_refund(&1, &setup.client);
}

#[test]
fn test_arbiter_resolves_dispute_raised_after_expiry() {
    let setup = setup_test();
    initialize_single_milestone_with_deadline(&setup, 400, 5_000);
    let escrow = setup.escrow_client;
    let env = setup.env.clone();

    env.ledger().set_timestamp(1_000);
    escrow.fund();
    escrow.submit_milestone(&1);

    env.ledger().set_timestamp(6_000);
    escrow.dispute(&1, &setup.freelancer);
    escrow.resolve_dispute(&1, &false);

    assert_eq!(escrow.get_milestones().get(0).unwrap().status, MilestoneStatus::Refunded);
    let token_client = token::Client::new(&env, &setup.token_address);
    assert_eq!(token_client.balance(&setup.client), 1000);
    assert_eq!(escrow.get_escrow_balance(), 0);
}

// --- Deadline: multiple simultaneous expiries + auto expiry event ---

#[test]
fn test_multiple_milestones_expiring_simultaneously() {
    let setup = setup_test();
    let env = setup.env.clone();

    let milestones = vec![
        &env,
        milestone_with_deadline(&env, 1, 100, 5_000),
        milestone_with_deadline(&env, 2, 200, 5_000),
    ];
    setup.escrow_client.initialize(
        &setup.admin,
        &setup.client,
        &setup.freelancer,
        &setup.arbiter,
        &setup.token_address,
        &milestones,
    );
    let escrow = setup.escrow_client;

    env.ledger().set_timestamp(1_000);
    escrow.fund();
    assert_eq!(escrow.get_escrow_balance(), 300);

    env.ledger().set_timestamp(5_001);
    assert_eq!(escrow.is_milestone_expired(&1), true);
    assert_eq!(escrow.is_milestone_expired(&2), true);

    escrow.claim_expired_refund(&1, &setup.client);
    escrow.claim_expired_refund(&2, &setup.client);

    let stored = escrow.get_milestones();
    assert_eq!(stored.get(0).unwrap().status, MilestoneStatus::Refunded);
    assert_eq!(stored.get(1).unwrap().status, MilestoneStatus::Refunded);
    assert_eq!(escrow.get_escrow_balance(), 0);

    let token_client = token::Client::new(&env, &setup.token_address);
    assert_eq!(token_client.balance(&setup.client), 1000);
    assert_eq!(token_client.balance(&escrow.address), 0);
}

#[test]
fn test_auto_expire_emits_deadline_expired() {
    let setup = setup_test();
    initialize_single_milestone_with_deadline(&setup, 150, 5_000);
    let escrow = setup.escrow_client;
    let env = setup.env.clone();

    env.ledger().set_timestamp(1_000);
    escrow.fund();

    env.ledger().set_timestamp(6_000);
    // View calls emit no events, so this resets the observed event list.
    assert_eq!(escrow.is_milestone_expired(&1), true);
    escrow.auto_expire(&setup.client, &1);

    // MilestoneExpired + DeadlineExpired
    assert_eq!(contract_event_count(&env, &escrow), 2);
    assert_eq!(escrow.get_milestones().get(0).unwrap().status, MilestoneStatus::AutoExpired);

    let token_client = token::Client::new(&env, &setup.token_address);
    assert_eq!(token_client.balance(&setup.client), 1000);
    assert_eq!(escrow.get_escrow_balance(), 0);
}

// --- Dispute escrow mechanism edge cases (issue #220) ---

#[test]
#[should_panic(expected = "HostError: Error(Contract, #6)")]
fn test_dispute_without_funding_fails() {
    let setup = setup_test();
    // Milestone is Pending (never funded): a dispute must not bypass escrow funding.
    initialize_single_milestone(&setup, 150);

    setup.escrow_client.dispute(&1, &setup.client);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #6)")]
fn test_dispute_before_submission_fails() {
    let setup = setup_test();
    // Funded but not submitted yet: a dispute must not bypass milestone submission.
    initialize_single_milestone(&setup, 150);
    setup.escrow_client.fund();

    setup.escrow_client.dispute(&1, &setup.client);
}

#[test]
fn test_arbiter_can_raise_dispute() {
    let setup = setup_test();
    initialize_single_milestone(&setup, 150);
    setup.escrow_client.fund();
    // #189 state machine: a funded milestone must be started (Funded ->
    // InProgress) before it can be submitted.
    setup.escrow_client.start_milestone(&1);
    setup.escrow_client.submit_milestone(&1);

    // The authorized arbitrator is allowed to raise a dispute.
    setup.escrow_client.dispute(&1, &setup.arbiter);

    assert_eq!(
        setup.escrow_client.get_milestones().get(0).unwrap().status,
        MilestoneStatus::Disputed
    );
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #6)")]
fn test_release_blocked_while_disputed() {
    let setup = setup_test();
    initialize_single_milestone(&setup, 150);
    setup.escrow_client.fund();
    // #189 state machine: a funded milestone must be started (Funded ->
    // InProgress) before it can be submitted.
    setup.escrow_client.start_milestone(&1);
    setup.escrow_client.submit_milestone(&1);
    setup.escrow_client.approve(&1);
    setup.escrow_client.dispute(&1, &setup.client);

    // Funds are locked while the dispute is open, even for the client.
    setup.escrow_client.release(&1, &setup.client);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #6)")]
fn test_refund_blocked_while_disputed() {
    let setup = setup_test();
    initialize_single_milestone(&setup, 150);
    setup.escrow_client.fund();
    // #189 state machine: a funded milestone must be started (Funded ->
    // InProgress) before it can be submitted.
    setup.escrow_client.start_milestone(&1);
    setup.escrow_client.submit_milestone(&1);
    setup.escrow_client.dispute(&1, &setup.freelancer);

    // The freelancer cannot refund out from under an open dispute.
    setup.escrow_client.refund(&1, &setup.freelancer);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #6)")]
fn test_multiple_disputes_rejected() {
    let setup = setup_test();
    initialize_single_milestone(&setup, 150);
    setup.escrow_client.fund();
    // #189 state machine: a funded milestone must be started (Funded ->
    // InProgress) before it can be submitted.
    setup.escrow_client.start_milestone(&1);
    setup.escrow_client.submit_milestone(&1);

    setup.escrow_client.dispute(&1, &setup.client);
    setup.escrow_client.resolve_dispute(&1, &true);

    // Once resolved, the milestone is terminal: a second dispute is rejected.
    setup.escrow_client.dispute(&1, &setup.client);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #6)")]
fn test_resolve_without_dispute_fails() {
    let setup = setup_test();
    initialize_single_milestone(&setup, 150);
    setup.escrow_client.fund();
    // #189 state machine: a funded milestone must be started (Funded ->
    // InProgress) before it can be submitted.
    setup.escrow_client.start_milestone(&1);
    setup.escrow_client.submit_milestone(&1);

    setup.escrow_client.resolve_dispute(&1, &true);
}

#[test]
fn test_dispute_events_are_emitted() {
    let setup = setup_test();
    let env = setup.env.clone();

    initialize_single_milestone(&setup, 150);
    setup.escrow_client.fund();
    // #189 state machine: a funded milestone must be started (Funded ->
    // InProgress) before it can be submitted.
    setup.escrow_client.start_milestone(&1);
    setup.escrow_client.submit_milestone(&1);

    setup.escrow_client.dispute(&1, &setup.client);
    assert_eq!(
        env.events()
            .all()
            .filter_by_contract(&setup.escrow_client.address)
            .events()
            .len(),
        1
    );

    setup.escrow_client.resolve_dispute(&1, &true);
    assert_eq!(
        env.events()
            .all()
            .filter_by_contract(&setup.escrow_client.address)
            .events()
            .len(),
        1
    );
}
