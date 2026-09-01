#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Events as _},
    vec, Address, Env, String,
};

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

fn create_token_contract(env: &Env, admin: &Address) -> Address {
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
    token_admin_client.mint(&client, &1_000);

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
        amount,
        status: MilestoneStatus::Pending,
        description: String::from_str(env, "Milestone 1"),
        client_approved: false,
        freelancer_approved: false,
    };
    vec![env, m]
}

/// Initialise and advance the contract to the InProgress state.
fn init_and_start(setup: &TestSetup) {
    let escrow = &setup.escrow_client;
    let milestones = single_milestone(&setup.env, 100);
    escrow.initialize(
        &setup.admin,
        &setup.client,
        &setup.freelancer,
        &setup.arbiter,
        &setup.token_address,
        &milestones,
    );
    escrow.fund();
    escrow.start_work();
}

// ===========================================================================
// VALID TRANSITION PATH TESTS
// ===========================================================================

// ---------------------------------------------------------------------------
// Happy path: Created → Funded → InProgress → Submitted → Approved → Released
// ---------------------------------------------------------------------------
#[test]
fn test_happy_path_full_state_machine() {
    let setup = setup_test();
    let escrow = &setup.escrow_client;
    let env = &setup.env;

    let milestones = single_milestone(env, 100);
    escrow.initialize(
        &setup.admin,
        &setup.client,
        &setup.freelancer,
        &setup.arbiter,
        &setup.token_address,
        &milestones,
    );

    // Created
    assert_eq!(escrow.get_contract_state(), ContractState::Created);

    // Created → Funded
    escrow.fund();
    assert_eq!(escrow.get_contract_state(), ContractState::Funded);
    assert!(escrow.is_funded());

    // Funded → InProgress
    escrow.start_work();
    assert_eq!(escrow.get_contract_state(), ContractState::InProgress);
    assert_eq!(
        escrow.get_milestones().get(0).unwrap().status,
        MilestoneStatus::InProgress
    );

    // InProgress → Submitted
    escrow.submit_milestone(&1);
    assert_eq!(escrow.get_contract_state(), ContractState::Submitted);
    assert_eq!(
        escrow.get_milestones().get(0).unwrap().status,
        MilestoneStatus::Submitted
    );

    // Submitted → Approved
    escrow.approve(&1);
    assert_eq!(escrow.get_contract_state(), ContractState::Approved);
    assert!(escrow.has_client_approval(&1));

    // Release Milestone 1 by client (client-only authorization)
    escrow.release(&1, &setup.client);
    assert_eq!(escrow.get_milestones().get(0).unwrap().status, MilestoneStatus::Released);

    // Verify token payout and escrow balance tracking
    assert_eq!(token_client.balance(&setup.freelancer), 100);
    assert_eq!(token_client.balance(&escrow.address), 200);
    assert_eq!(escrow.get_escrow_balance(), 200);
}

// ---------------------------------------------------------------------------
// Multi-milestone: second milestone continues after first is released
// ---------------------------------------------------------------------------
#[test]
fn test_multi_milestone_happy_path() {
    let setup = setup_test();
    let escrow = &setup.escrow_client;
    let env = &setup.env;

    let token_admin = Address::generate(env);
    let token_addr = create_token_contract(env, &token_admin);
    token::StellarAssetClient::new(env, &token_addr).mint(&setup.client, &300);

    let m1 = Milestone {
        id: 1,
        deadline: 0,
        amount: 100,
        status: MilestoneStatus::Pending,
        description: String::from_str(env, "M1"),
        client_approved: false,
        freelancer_approved: false,
    };
    let m2 = Milestone {
        id: 2,
        deadline: 0,
        amount: 200,
        status: MilestoneStatus::Pending,
        description: String::from_str(env, "M2"),
        client_approved: false,
        freelancer_approved: false,
    };
    let milestones = vec![env, m1, m2];

    escrow.initialize(
        &setup.admin,
        &setup.client,
        &setup.freelancer,
        &setup.arbiter,
        &token_addr,
        &milestones,
    );
    escrow.fund();
    escrow.start_work();

    // Complete milestone 1
    escrow.submit_milestone(&1);
    escrow.approve(&1);
    escrow.freelancer_confirm(&1);
    escrow.release(&1, &setup.client);

    // After releasing M1, contract reverts to InProgress because M2 is pending.
    assert_eq!(escrow.get_contract_state(), ContractState::InProgress);

    // Complete milestone 2
    escrow.submit_milestone(&2);
    escrow.approve(&2);
    escrow.freelancer_confirm(&2);
    escrow.release(&2, &setup.freelancer);

    // Both milestones done — contract reaches Released.
    assert_eq!(escrow.get_contract_state(), ContractState::Released);

    let token_client = token::Client::new(env, &token_addr);
    assert_eq!(token_client.balance(&setup.freelancer), 300);
    assert_eq!(token_client.balance(&escrow.address), 0);
}

// ---------------------------------------------------------------------------
// Transition: Submitted → Disputed → Resolved (in freelancer's favour)
// ---------------------------------------------------------------------------
#[test]
fn test_submitted_disputed_resolved_to_freelancer() {
    let setup = setup_test();
    let escrow = &setup.escrow_client;
    let env = &setup.env;

    init_and_start(&setup);
    escrow.submit_milestone(&1);
    assert_eq!(escrow.get_contract_state(), ContractState::Submitted);

    // Client raises dispute on submitted milestone.
    escrow.dispute(&1, &setup.client);
    assert_eq!(escrow.get_contract_state(), ContractState::Disputed);
    assert_eq!(
        escrow.get_milestones().get(0).unwrap().status,
        MilestoneStatus::Disputed
    );

    // Arbiter resolves in freelancer's favour.
    escrow.resolve_dispute(&1, &true);
    assert_eq!(escrow.get_contract_state(), ContractState::Resolved);
    assert_eq!(
        escrow.get_milestones().get(0).unwrap().status,
        MilestoneStatus::Resolved
    );

    let token_client = token::Client::new(env, &setup.token_address);
    assert_eq!(token_client.balance(&setup.freelancer), 100);
    assert_eq!(token_client.balance(&setup.client), 900);
}

// ---------------------------------------------------------------------------
// Transition: Approved → Disputed → Resolved (in client's favour)
// ---------------------------------------------------------------------------
#[test]
fn test_approved_disputed_resolved_to_client() {
    let setup = setup_test();
    let escrow = &setup.escrow_client;
    let env = &setup.env;

    init_and_start(&setup);
    escrow.submit_milestone(&1);
    escrow.approve(&1);
    assert_eq!(escrow.get_contract_state(), ContractState::Approved);

    // Client raises a last-minute dispute.
    escrow.dispute(&1, &setup.client);
    assert_eq!(escrow.get_contract_state(), ContractState::Disputed);

    // Arbiter resolves in client's favour.
    escrow.resolve_dispute(&1, &false);
    assert_eq!(escrow.get_contract_state(), ContractState::Resolved);

    let token_client = token::Client::new(env, &setup.token_address);
    assert_eq!(token_client.balance(&setup.client), 1_000); // full refund
    assert_eq!(token_client.balance(&setup.freelancer), 0);
}

// ---------------------------------------------------------------------------
// Transition: InProgress → Disputed (freelancer raises dispute)
// ---------------------------------------------------------------------------
#[test]
fn test_inprogress_disputed_by_freelancer() {
    let setup = setup_test();
    let escrow = &setup.escrow_client;

    init_and_start(&setup);
    escrow.dispute(&1, &setup.freelancer);
    assert_eq!(escrow.get_contract_state(), ContractState::Disputed);
}

// ---------------------------------------------------------------------------
// Transition: Funded → Refunded (client refunds before work starts)
// ---------------------------------------------------------------------------
#[test]
fn test_funded_refunded_by_client() {
    let setup = setup_test();
    let escrow = &setup.escrow_client;
    let env = &setup.env;

    let milestones = single_milestone(env, 250);
    escrow.initialize(
        &setup.admin,
        &setup.client,
        &setup.freelancer,
        &setup.arbiter,
        &setup.token_address,
        &milestones,
    );
    escrow.fund();

    // Client refunds before work started.
    escrow.refund(&1, &setup.client);
    assert_eq!(escrow.get_contract_state(), ContractState::Refunded);

    let token_client = token::Client::new(env, &setup.token_address);
    assert_eq!(token_client.balance(&setup.client), 1_000); // fully restored
}

// ---------------------------------------------------------------------------
// Transition: InProgress → Refunded (freelancer voluntary refund)
// ---------------------------------------------------------------------------
#[test]
fn test_inprogress_refunded_by_freelancer() {
    let setup = setup_test();
    let escrow = &setup.escrow_client;
    let env = &setup.env;

    init_and_start(&setup);
    escrow.refund(&1, &setup.freelancer);
    assert_eq!(escrow.get_contract_state(), ContractState::Refunded);

    let token_client = token::Client::new(env, &setup.token_address);
    assert_eq!(token_client.balance(&setup.client), 1_000);
}

// ---------------------------------------------------------------------------
// Transition: Submitted → Refunded (freelancer retracts submission)
// ---------------------------------------------------------------------------
#[test]
fn test_submitted_refunded_by_freelancer() {
    let setup = setup_test();
    let escrow = &setup.escrow_client;
    let env = &setup.env;

    init_and_start(&setup);
    escrow.submit_milestone(&1);
    escrow.refund(&1, &setup.freelancer);
    assert_eq!(escrow.get_contract_state(), ContractState::Refunded);

    let token_client = token::Client::new(env, &setup.token_address);
    assert_eq!(token_client.balance(&setup.client), 1_000);
}

// ---------------------------------------------------------------------------
// get_contract_state getter works at each state
// ---------------------------------------------------------------------------
#[test]
fn test_get_contract_state_at_each_step() {
    let setup = setup_test();
    let escrow = &setup.escrow_client;
    let env = &setup.env;

    let milestones = single_milestone(env, 50);
    escrow.initialize(
        &setup.admin,
        &setup.client,
        &setup.freelancer,
        &setup.arbiter,
        &setup.token_address,
        &milestones,
    );
    assert_eq!(escrow.get_contract_state(), ContractState::Created);

    escrow.fund();
    assert_eq!(escrow.get_contract_state(), ContractState::Funded);

    escrow.start_work();
    assert_eq!(escrow.get_contract_state(), ContractState::InProgress);

    escrow.submit_milestone(&1);
    assert_eq!(escrow.get_contract_state(), ContractState::Submitted);

    escrow.approve(&1);

    // Freelancer tries to trigger release (unauthorized, only client can do this)
    escrow.release(&1, &setup.freelancer);
}

// ---------------------------------------------------------------------------
// Dispute clears approval flags
// ---------------------------------------------------------------------------
#[test]
fn test_dispute_clears_approvals() {
    let setup = setup_test();
    let escrow = &setup.escrow_client;

    init_and_start(&setup);
    escrow.submit_milestone(&1);
    escrow.approve(&1);
    escrow.freelancer_confirm(&1);

    assert!(escrow.has_client_approval(&1));
    assert!(escrow.has_freelancer_approval(&1));

    escrow.dispute(&1, &setup.client);
    assert!(!escrow.has_client_approval(&1));
    assert!(!escrow.has_freelancer_approval(&1));
}

// ---------------------------------------------------------------------------
// Version getter
// ---------------------------------------------------------------------------
#[test]
fn test_version() {
    let setup = setup_test();
    let escrow = &setup.escrow_client;
    let env = &setup.env;

    let milestones = single_milestone(env, 10);
    escrow.initialize(
        &setup.admin,
        &setup.client,
        &setup.freelancer,
        &setup.arbiter,
        &setup.token_address,
        &milestones,
    );
    assert_eq!(escrow.version(), 1);
}

// ===========================================================================
// INVALID TRANSITION TESTS  (each must panic / return error)
// ===========================================================================

// ---------------------------------------------------------------------------
// Cannot fund a contract that is already funded
// ---------------------------------------------------------------------------
#[test]
#[should_panic(expected = "HostError: Error(Contract, #9)")]
fn test_release_without_approval_fails() {
    let setup = setup_test();
    let escrow = &setup.escrow_client;
    let env = &setup.env;

    let milestones = single_milestone(env, 100);
    escrow.initialize(
        &setup.admin,
        &setup.client,
        &setup.freelancer,
        &setup.arbiter,
        &setup.token_address,
        &milestones,
    );
    escrow.fund();
    escrow.fund(); // AlreadyFunded → InvalidContractState (contract is now Funded not Created)
}

// ---------------------------------------------------------------------------
// Cannot start_work before funding
// ---------------------------------------------------------------------------
#[test]
#[should_panic(expected = "HostError")]
fn test_start_work_before_fund_fails() {
    let setup = setup_test();
    let escrow = &setup.escrow_client;
    let env = &setup.env;

    let milestones = single_milestone(env, 100);
    escrow.initialize(
        &setup.admin,
        &setup.client,
        &setup.freelancer,
        &setup.arbiter,
        &setup.token_address,
        &milestones,
    );
    // State is Created; start_work requires Funded.
    escrow.start_work();
}

// ---------------------------------------------------------------------------
// Cannot submit before start_work
// ---------------------------------------------------------------------------
#[test]
#[should_panic(expected = "HostError")]
fn test_submit_before_start_work_fails() {
    let setup = setup_test();
    let escrow = &setup.escrow_client;
    let env = &setup.env;

    let milestones = single_milestone(env, 100);
    escrow.initialize(
        &setup.admin,
        &setup.client,
        &setup.freelancer,
        &setup.arbiter,
        &setup.token_address,
        &milestones,
    );
    escrow.fund();
    // State is Funded; submit requires InProgress.
    escrow.submit_milestone(&1);
    // Missing client approval - should fail with InsufficientApprovals (error code 9)
    escrow.release(&1, &setup.client);
}

// ---------------------------------------------------------------------------
// Cannot release without client approval
// ---------------------------------------------------------------------------
#[test]
#[should_panic(expected = "HostError: Error(Contract, #6)")]
fn test_double_client_approval_fails() {
    let setup = setup_test();
    let escrow = &setup.escrow_client;

    init_and_start(&setup);
    escrow.submit_milestone(&1);
    escrow.approve(&1);
    // freelancer_confirm is missing — InsufficientApprovals.
    escrow.release(&1, &setup.client);
}

// ---------------------------------------------------------------------------
// Cannot release without freelancer confirmation
// ---------------------------------------------------------------------------
#[test]
#[should_panic(expected = "HostError")]
fn test_release_without_freelancer_confirm_fails() {
    let setup = setup_test();
    let escrow = &setup.escrow_client;

    init_and_start(&setup);
    escrow.submit_milestone(&1);
    escrow.approve(&1);
    // Once approved, the milestone is no longer in Submitted state.
    escrow.approve(&1);
    escrow.freelancer_confirm(&1);

    let stranger = Address::generate(env);
    escrow.release(&1, &stranger);
}

// ---------------------------------------------------------------------------
// Cannot approve twice (AlreadyApproved)
// ---------------------------------------------------------------------------
#[test]
#[should_panic(expected = "HostError")]
fn test_double_client_approval_fails() {
    let setup = setup_test();
    let escrow = &setup.escrow_client;

    init_and_start(&setup);
    escrow.submit_milestone(&1);
    escrow.approve(&1);
    // Second approve — AlreadyApproved.
    escrow.approve(&1);
}

// ---------------------------------------------------------------------------
// Cannot confirm twice (AlreadyApproved)
// ---------------------------------------------------------------------------
#[test]
#[should_panic(expected = "HostError")]
fn test_double_freelancer_confirm_fails() {
    let setup = setup_test();
    let escrow = &setup.escrow_client;

    init_and_start(&setup);
    escrow.submit_milestone(&1);
    escrow.approve(&1);
    escrow.freelancer_confirm(&1);
    // Second confirm.
    escrow.freelancer_confirm(&1);
}

// ---------------------------------------------------------------------------
// Cannot resolve a dispute when contract is not Disputed
// ---------------------------------------------------------------------------
#[test]
#[should_panic(expected = "HostError")]
fn test_resolve_dispute_without_dispute_fails() {
    let setup = setup_test();
    let escrow = &setup.escrow_client;

    init_and_start(&setup);
    escrow.submit_milestone(&1);
    escrow.approve(&1);
    // State is Approved, not Disputed.
    escrow.resolve_dispute(&1, &true);
}

// ---------------------------------------------------------------------------
// Cannot raise a dispute when contract is Released
// ---------------------------------------------------------------------------
#[test]
#[should_panic(expected = "HostError")]
fn test_dispute_after_release_fails() {
    let setup = setup_test();
    let escrow = &setup.escrow_client;

    init_and_start(&setup);
    escrow.submit_milestone(&1);
    escrow.approve(&1);
    escrow.freelancer_confirm(&1);
    escrow.release(&1, &setup.client);
    // Contract is now Released.
    escrow.dispute(&1, &setup.client);
}

// ---------------------------------------------------------------------------
// Cannot raise a dispute when contract is Resolved
// ---------------------------------------------------------------------------
#[test]
#[should_panic(expected = "HostError")]
fn test_dispute_after_resolved_fails() {
    let setup = setup_test();
    let escrow = &setup.escrow_client;

    init_and_start(&setup);
    escrow.submit_milestone(&1);
    escrow.dispute(&1, &setup.client);
    escrow.resolve_dispute(&1, &true);
    // Contract is Resolved — cannot dispute again.
    escrow.dispute(&1, &setup.client);
}

// ---------------------------------------------------------------------------
// Cannot raise a dispute by a stranger
// ---------------------------------------------------------------------------
#[test]
#[should_panic(expected = "HostError")]
fn test_dispute_by_stranger_fails() {
    let setup = setup_test();
    let escrow = &setup.escrow_client;
    let env = &setup.env;

    init_and_start(&setup);
    escrow.submit_milestone(&1);

    let stranger = Address::generate(env);
    escrow.dispute(&1, &stranger);
}

// ---------------------------------------------------------------------------
// Cannot refund when contract is Approved (past the valid window)
// ---------------------------------------------------------------------------
#[test]
#[should_panic(expected = "HostError")]
fn test_refund_in_approved_state_fails() {
    let setup = setup_test();
    let escrow = &setup.escrow_client;

    init_and_start(&setup);
    escrow.submit_milestone(&1);
    escrow.approve(&1);
    // State is Approved; refund requires Funded/InProgress/Submitted.
    escrow.refund(&1, &setup.freelancer);
}

// ---------------------------------------------------------------------------
// Cannot refund by a stranger
// ---------------------------------------------------------------------------
#[test]
#[should_panic(expected = "HostError")]
fn test_refund_by_stranger_fails() {
    let setup = setup_test();
    let escrow = &setup.escrow_client;
    let env = &setup.env;

    init_and_start(&setup);
    let stranger = Address::generate(env);
    escrow.refund(&1, &stranger);
}

// ---------------------------------------------------------------------------
// Cannot initialize twice (AlreadyInitialized)
// ---------------------------------------------------------------------------
#[test]
#[should_panic(expected = "HostError")]
fn test_double_initialization_fails() {
    let setup = setup_test();
    let escrow = &setup.escrow_client;
    let env = &setup.env;

    let milestones = single_milestone(env, 100);
    escrow.initialize(
        &setup.admin,
        &setup.client,
        &setup.freelancer,
        &setup.arbiter,
        &setup.token_address,
        &milestones,
    );
    escrow.initialize(
        &setup.admin,
        &setup.client,
        &setup.freelancer,
        &setup.arbiter,
        &setup.token_address,
        &milestones,
    );
}

// ---------------------------------------------------------------------------
// Cannot initialize with zero-amount milestone
// ---------------------------------------------------------------------------
#[test]
#[should_panic(expected = "HostError")]
fn test_zero_amount_milestone_fails() {
    let setup = setup_test();
    let escrow = &setup.escrow_client;
    let env = &setup.env;

    let m = Milestone {
        id: 1,
        deadline: 0,
        amount: 0,
        status: MilestoneStatus::Pending,
        description: String::from_str(env, "Zero"),
        client_approved: false,
        freelancer_approved: false,
    };
    escrow.initialize(
        &setup.admin,
        &setup.client,
        &setup.freelancer,
        &setup.arbiter,
        &setup.token_address,
        &vec![env, m],
    );
}

// ---------------------------------------------------------------------------
// Arbiter cannot resolve a dispute in the freelancer's favour by themselves
// (only the arbiter address is authorised — test with a stranger trying)
// ---------------------------------------------------------------------------
#[test]
#[should_panic(expected = "HostError")]
fn test_resolve_dispute_by_stranger_fails() {
    let setup = setup_test();
    let escrow = &setup.escrow_client;
    let _env = &setup.env;

    init_and_start(&setup);
    escrow.submit_milestone(&1);
    escrow.approve(&1);

    // Verify client approval is set
    assert_eq!(escrow.has_client_approval(&1), true);

    init_and_start(&setup);
    // State is InProgress — fund() requires Created.
    escrow.fund();
}

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
