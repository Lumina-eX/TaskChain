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

/// Build a default test environment: 1000-token balance for the client.
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
fn test_happy_path_full_state_machine() {
    let setup = setup_test();
    let escrow = &setup.escrow_client;
    let env = &setup.env;

    let milestone_1 = Milestone {
        id: 1,
        deadline: 0,
        amount: 100,
        status: MilestoneStatus::Pending,
        description: String::from_str(env, "Milestone 1"),
        client_approved: false,
        freelancer_approved: false,
    };
    let milestone_2 = Milestone {
        id: 2,
        deadline: 0,
        amount: 200,
        status: MilestoneStatus::Pending,
        description: String::from_str(env, "Milestone 2"),
        client_approved: false,
        freelancer_approved: false,
    };
    let milestones = vec![env, milestone_1, milestone_2];

    // ── Initialize ──────────────────────────────────────────────────────────
    escrow.initialize(&setup.admin, &setup.client, &setup.freelancer, &setup.arbiter, &setup.token_address, &milestones);

    assert_eq!(escrow.get_client(), setup.client);
    assert_eq!(escrow.get_freelancer(), setup.freelancer);
    assert_eq!(escrow.get_arbiter(), setup.arbiter);
    assert_eq!(escrow.get_token(), setup.token_address);
    assert_eq!(escrow.is_funded(), false);

    let fetched = escrow.get_milestones();
    assert_eq!(fetched.len(), 2);
    assert_eq!(fetched.get(0).unwrap().status, MilestoneStatus::Pending);

    // ── Fund ────────────────────────────────────────────────────────────────
    escrow.fund();
    assert_eq!(escrow.is_funded(), true);

    let token_client = token::Client::new(env, &setup.token_address);
    assert_eq!(token_client.balance(&setup.client), 700);
    assert_eq!(token_client.balance(&escrow.address), 300);

    let funded = escrow.get_milestones();
    assert_eq!(funded.get(0).unwrap().status, MilestoneStatus::Funded);
    assert_eq!(funded.get(1).unwrap().status, MilestoneStatus::Funded);

    // ── Start Milestone 1 ───────────────────────────────────────────────────
    escrow.start_milestone(&1);
    assert_eq!(
        escrow.get_milestones().get(0).unwrap().status,
        MilestoneStatus::InProgress
    );
    // Milestone 2 is still Funded
    assert_eq!(
        escrow.get_milestones().get(1).unwrap().status,
        MilestoneStatus::Funded
    );

    // ── Submit Milestone 1 ──────────────────────────────────────────────────
    escrow.submit_milestone(&1);
    assert_eq!(
        escrow.get_milestones().get(0).unwrap().status,
        MilestoneStatus::Submitted
    );

    // ── Approve Milestone 1 ─────────────────────────────────────────────────
    escrow.approve(&1);
    assert_eq!(
        escrow.get_milestones().get(0).unwrap().status,
        MilestoneStatus::Approved
    );
    assert!(escrow.has_client_approval(&1));

    // Release Milestone 1 by client (client-only authorization)
    escrow.release(&1, &setup.client);
    assert_eq!(escrow.get_milestones().get(0).unwrap().status, MilestoneStatus::Released);

    // Verify token payout and escrow balance tracking
    assert_eq!(token_client.balance(&setup.freelancer), 100);
    assert_eq!(token_client.balance(&escrow.address), 200);
    assert_eq!(escrow.get_escrow_balance(), 200);
}

// ===========================================================================
// 2. start_milestone tests
// ===========================================================================

#[test]
fn test_start_milestone_funded_to_inprogress() {
    let setup = setup_test();
    let id = setup_funded_milestone(&setup, 100);
    assert_eq!(
        setup.escrow_client.get_milestones().get(0).unwrap().status,
        MilestoneStatus::Funded
    );
    setup.escrow_client.start_milestone(&id);
    assert_eq!(
        setup.escrow_client.get_milestones().get(0).unwrap().status,
        MilestoneStatus::InProgress
    );
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #6)")]
fn test_start_milestone_requires_funded_not_pending() {
    // Initialize but do NOT fund — milestone is still Pending
    let setup = setup_test();
    let milestone = Milestone {
        id: 1,
        deadline: 0,
        amount: 100,
        status: MilestoneStatus::Pending,
        description: String::from_str(&setup.env, "M"),
        client_approved: false,
        freelancer_approved: false,
    };
    setup.escrow_client.initialize(
        &setup.admin, &setup.client, &setup.freelancer, &setup.arbiter,
        &setup.token_address, &vec![&setup.env, milestone],
    );
    // Should fail: milestone is Pending, not Funded
    setup.escrow_client.start_milestone(&1);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #6)")]
fn test_start_milestone_cannot_start_twice() {
    let setup = setup_test();
    let id = setup_funded_milestone(&setup, 100);
    setup.escrow_client.start_milestone(&id);
    // Second start should fail: already InProgress, not Funded
    setup.escrow_client.start_milestone(&id);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #6)")]
fn test_start_milestone_after_submitted_fails() {
    let setup = setup_test();
    let id = setup_submitted_milestone(&setup, 100);
    // Milestone is now Submitted — start must fail
    setup.escrow_client.start_milestone(&id);
}

// ===========================================================================
// 3. submit_milestone tests
// ===========================================================================

#[test]
fn test_submit_requires_in_progress() {
    let setup = setup_test();
    let id = setup_in_progress_milestone(&setup, 100);
    setup.escrow_client.submit_milestone(&id);
    assert_eq!(
        setup.escrow_client.get_milestones().get(0).unwrap().status,
        MilestoneStatus::Submitted
    );
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #6)")]
fn test_submit_from_funded_state_fails() {
    // The new state machine requires InProgress, not Funded.
    let setup = setup_test();
    let id = setup_funded_milestone(&setup, 100);
    // Funded → submit should fail
    setup.escrow_client.submit_milestone(&id);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #6)")]
fn test_submit_from_pending_fails() {
    let setup = setup_test();
    let milestone = Milestone {
        id: 1,
        deadline: 0,
        amount: 100,
        status: MilestoneStatus::Pending,
        description: String::from_str(&setup.env, "M"),
        client_approved: false,
        freelancer_approved: false,
    };
    setup.escrow_client.initialize(
        &setup.admin, &setup.client, &setup.freelancer, &setup.arbiter,
        &setup.token_address, &vec![&setup.env, milestone],
    );
    // Pending → submit should fail
    setup.escrow_client.submit_milestone(&1);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #6)")]
fn test_submit_from_approved_fails() {
    let setup = setup_test();
    let id = setup_approved_milestone(&setup, 100);
    // Approved → submit should fail
    setup.escrow_client.submit_milestone(&id);
}

// ===========================================================================
// 4. approve tests
// ===========================================================================

#[test]
fn test_approve_transitions_to_approved() {
    let setup = setup_test();
    let id = setup_submitted_milestone(&setup, 100);
    setup.escrow_client.approve(&id);
    assert_eq!(
        setup.escrow_client.get_milestones().get(0).unwrap().status,
        MilestoneStatus::Approved
    );
    assert!(setup.escrow_client.has_client_approval(&id));
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #6)")]
fn test_approve_from_funded_fails() {
    let setup = setup_test();
    let id = setup_funded_milestone(&setup, 100);
    setup.escrow_client.approve(&id);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #6)")]
fn test_approve_from_in_progress_fails() {
    let setup = setup_test();
    let id = setup_in_progress_milestone(&setup, 100);
    setup.escrow_client.approve(&id);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #6)")]
fn test_double_client_approval_fails() {
    let setup = setup_test();
    let id = setup_submitted_milestone(&setup, 100);
    setup.escrow_client.approve(&id);
    // After the first approve the milestone status becomes Approved, not Submitted.
    // The second approve() call will therefore fail with InvalidMilestoneStatus (#6)
    // because the status check fires before the AlreadyApproved guard.
    setup.escrow_client.approve(&id);
}

// ===========================================================================
// 5. freelancer_confirm tests
// ===========================================================================

#[test]
fn test_freelancer_confirm_sets_flag() {
    let setup = setup_test();
    let id = setup_approved_milestone(&setup, 100);
    assert!(!setup.escrow_client.has_freelancer_approval(&id));
    setup.escrow_client.freelancer_confirm(&id);
    assert!(setup.escrow_client.has_freelancer_approval(&id));
    // Status stays Approved
    assert_eq!(
        setup.escrow_client.get_milestones().get(0).unwrap().status,
        MilestoneStatus::Approved
    );
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #6)")]
fn test_freelancer_confirm_from_submitted_fails() {
    let setup = setup_test();
    let id = setup_submitted_milestone(&setup, 100);
    setup.escrow_client.freelancer_confirm(&id);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #10)")]
fn test_double_freelancer_confirmation_fails() {
    let setup = setup_test();
    let id = setup_approved_milestone(&setup, 100);
    setup.escrow_client.freelancer_confirm(&id);
    setup.escrow_client.freelancer_confirm(&id);
}

// ===========================================================================
// 6. release tests
// ===========================================================================

#[test]
fn test_release_by_freelancer() {
    let setup = setup_test();
    let id = setup_approved_milestone(&setup, 100);
    setup.escrow_client.freelancer_confirm(&id);
    setup.escrow_client.release(&id, &setup.freelancer);

    assert_eq!(
        setup.escrow_client.get_milestones().get(0).unwrap().status,
        MilestoneStatus::Released
    );
    let tc = token::Client::new(&setup.env, &setup.token_address);
    assert_eq!(tc.balance(&setup.freelancer), 100);
}

#[test]
fn test_release_by_client() {
    let setup = setup_test();
    let id = setup_approved_milestone(&setup, 100);
    setup.escrow_client.freelancer_confirm(&id);
    setup.escrow_client.release(&id, &setup.client);

    assert_eq!(
        setup.escrow_client.get_milestones().get(0).unwrap().status,
        MilestoneStatus::Released
    );
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #7)")]
fn test_unauthorized_release_fails() {
    let setup = setup_test();
    let id = setup_approved_milestone(&setup, 100);
    setup.escrow_client.freelancer_confirm(&id);
    let stranger = Address::generate(&setup.env);
    setup.escrow_client.release(&id, &stranger);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #9)")]
fn test_release_without_both_approvals_fails() {
    let setup = setup_test();
    let id = setup_approved_milestone(&setup, 100);
    // freelancer_confirm not called → InsufficientApprovals (error 9)
    setup.escrow_client.release(&id, &setup.client);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #9)")]
fn test_release_from_submitted_fails() {
    // Milestone is Submitted and neither party has approved yet.
    // release() checks approvals before the status guard, so the contract
    // returns InsufficientApprovals (#9) rather than InvalidMilestoneStatus (#6).
    let setup = setup_test();
    let id = setup_submitted_milestone(&setup, 100);
    setup.escrow_client.release(&id, &setup.client);
}

// ===========================================================================
// 7. refund tests
// ===========================================================================

#[test]
fn test_client_refund_from_funded() {
    let setup = setup_test();
    let id = setup_funded_milestone(&setup, 250);
    setup.escrow_client.refund(&id, &setup.client);

    assert_eq!(
        setup.escrow_client.get_milestones().get(0).unwrap().status,
        MilestoneStatus::Refunded
    );
    let tc = token::Client::new(&setup.env, &setup.token_address);
    assert_eq!(tc.balance(&setup.client), 1000);
    assert_eq!(tc.balance(&setup.escrow_client.address), 0);
}

#[test]
fn test_freelancer_refund_from_funded() {
    let setup = setup_test();
    let id = setup_funded_milestone(&setup, 250);
    setup.escrow_client.refund(&id, &setup.freelancer);

    assert_eq!(
        setup.escrow_client.get_milestones().get(0).unwrap().status,
        MilestoneStatus::Refunded
    );
    let tc = token::Client::new(&setup.env, &setup.token_address);
    // Client's funds returned
    assert_eq!(tc.balance(&setup.client), 1000);
}

#[test]
fn test_client_refund_from_in_progress() {
    let setup = setup_test();
    let id = setup_in_progress_milestone(&setup, 300);
    setup.escrow_client.refund(&id, &setup.client);

    assert_eq!(
        setup.escrow_client.get_milestones().get(0).unwrap().status,
        MilestoneStatus::Refunded
    );
    let tc = token::Client::new(&setup.env, &setup.token_address);
    assert_eq!(tc.balance(&setup.client), 1000);
}

#[test]
fn test_freelancer_refund_from_in_progress() {
    let setup = setup_test();
    let id = setup_in_progress_milestone(&setup, 300);
    setup.escrow_client.refund(&id, &setup.freelancer);

    assert_eq!(
        setup.escrow_client.get_milestones().get(0).unwrap().status,
        MilestoneStatus::Refunded
    );
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #6)")]
fn test_refund_from_submitted_fails() {
    let setup = setup_test();
    let id = setup_submitted_milestone(&setup, 100);
    // Submitted is no longer an allowed refund source
    setup.escrow_client.refund(&id, &setup.client);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #6)")]
fn test_refund_from_approved_fails() {
    let setup = setup_test();
    let id = setup_approved_milestone(&setup, 100);
    setup.escrow_client.refund(&id, &setup.client);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #7)")]
fn test_refund_unauthorized_fails() {
    let setup = setup_test();
    let id = setup_funded_milestone(&setup, 100);
    let stranger = Address::generate(&setup.env);
    setup.escrow_client.refund(&id, &stranger);
}

// ===========================================================================
// 8. dispute tests
// ===========================================================================

#[test]
fn test_client_dispute_from_in_progress() {
    let setup = setup_test();
    let id = setup_in_progress_milestone(&setup, 200);
    setup.escrow_client.dispute(&id, &setup.client);
    assert_eq!(
        setup.escrow_client.get_milestones().get(0).unwrap().status,
        MilestoneStatus::Disputed
    );
}

#[test]
fn test_freelancer_dispute_from_in_progress() {
    let setup = setup_test();
    let id = setup_in_progress_milestone(&setup, 200);
    setup.escrow_client.dispute(&id, &setup.freelancer);
    assert_eq!(
        setup.escrow_client.get_milestones().get(0).unwrap().status,
        MilestoneStatus::Disputed
    );
}

#[test]
fn test_client_dispute_from_submitted() {
    let setup = setup_test();
    let id = setup_submitted_milestone(&setup, 400);
    setup.escrow_client.dispute(&id, &setup.client);
    assert_eq!(
        setup.escrow_client.get_milestones().get(0).unwrap().status,
        MilestoneStatus::Disputed
    );
}

#[test]
fn test_client_dispute_from_approved() {
    let setup = setup_test();
    let id = setup_approved_milestone(&setup, 400);
    setup.escrow_client.freelancer_confirm(&id);

    setup.escrow_client.dispute(&id, &setup.client);
    assert_eq!(
        setup.escrow_client.get_milestones().get(0).unwrap().status,
        MilestoneStatus::Disputed
    );
    // Approvals should be cleared
    assert!(!setup.escrow_client.has_client_approval(&id));
    assert!(!setup.escrow_client.has_freelancer_approval(&id));
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #6)")]
fn test_dispute_from_funded_fails() {
    // Funded state is no longer disputable; work must have started first.
    let setup = setup_test();
    let id = setup_funded_milestone(&setup, 100);
    setup.escrow_client.dispute(&id, &setup.client);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #6)")]
fn test_dispute_from_pending_fails() {
    let setup = setup_test();
    let milestone = Milestone {
        id: 1,
        deadline: 0,
        amount: 100,
        status: MilestoneStatus::Pending,
        description: String::from_str(&setup.env, "M"),
        client_approved: false,
        freelancer_approved: false,
    };
    setup.escrow_client.initialize(
        &setup.admin, &setup.client, &setup.freelancer, &setup.arbiter,
        &setup.token_address, &vec![&setup.env, milestone],
    );
    setup.escrow_client.dispute(&1, &setup.client);
}

    escrow.initialize(&setup.admin, &setup.client, &setup.freelancer, &setup.arbiter, &setup.token_address, &milestones);
    escrow.fund();
    escrow.submit_milestone(&1);
    escrow.approve(&1);

    // Freelancer tries to trigger release (unauthorized, only client can do this)
    escrow.release(&1, &setup.freelancer);
}

#[test]
fn test_dispute_resolve_to_client() {
    let setup = setup_test();
    let id = setup_submitted_milestone(&setup, 400);
    setup.escrow_client.dispute(&id, &setup.freelancer);
    setup.escrow_client.resolve_dispute(&id, &false);

    let tc = token::Client::new(&setup.env, &setup.token_address);
    assert_eq!(tc.balance(&setup.client), 1000);
    assert_eq!(tc.balance(&setup.freelancer), 0);
    assert_eq!(
        setup.escrow_client.get_milestones().get(0).unwrap().status,
        MilestoneStatus::Refunded
    );
}

#[test]
fn test_dispute_resolve_from_in_progress() {
    let setup = setup_test();
    let id = setup_in_progress_milestone(&setup, 200);
    setup.escrow_client.dispute(&id, &setup.client);
    setup.escrow_client.resolve_dispute(&id, &true);

    assert_eq!(
        setup.escrow_client.get_milestones().get(0).unwrap().status,
        MilestoneStatus::Released
    );
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #6)")]
fn test_resolve_non_disputed_milestone_fails() {
    let setup = setup_test();
    let id = setup_submitted_milestone(&setup, 100);
    // Milestone is Submitted, not Disputed — should fail
    setup.escrow_client.resolve_dispute(&id, &true);
}

// ===========================================================================
// 10. Initialization guard tests
// ===========================================================================

#[test]
#[should_panic(expected = "HostError: Error(Contract, #1)")]
fn test_double_initialization_fails() {
    let setup = setup_test();
    let milestone = Milestone {
        id: 1,
        deadline: 0,
        amount: 100,
        status: MilestoneStatus::Pending,
        description: String::from_str(&setup.env, "M"),
        client_approved: false,
        freelancer_approved: false,
    };
    let milestones = vec![&setup.env, milestone.clone()];
    setup.escrow_client.initialize(
        &setup.admin, &setup.client, &setup.freelancer, &setup.arbiter,
        &setup.token_address, &milestones,
    );
    // Second initialize must fail with AlreadyInitialized (error 1)
    let milestones2 = vec![&setup.env, milestone];
    setup.escrow_client.initialize(
        &setup.admin, &setup.client, &setup.freelancer, &setup.arbiter,
        &setup.token_address, &milestones2,
    );
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #9)")]
fn test_release_without_approval_fails() {
    let setup = setup_test();
    let milestone = Milestone {
        id: 1,
        deadline: 0,
        amount: 0,
        status: MilestoneStatus::Pending,
        description: String::from_str(&setup.env, "Invalid"),
        client_approved: false,
        freelancer_approved: false,
    };
    let milestones = vec![&env, milestone];

    escrow.initialize(&setup.admin, &setup.client, &setup.freelancer, &setup.arbiter, &setup.token_address, &milestones);
    escrow.fund();
    escrow.submit_milestone(&1);
    // Missing client approval - should fail with InsufficientApprovals (error code 9)
    escrow.release(&1, &setup.client);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #6)")]
fn test_double_client_approval_fails() {
    let setup = setup_test();
    setup_funded_milestone(&setup, 100);
    // Second fund must fail with AlreadyFunded (error 3)
    setup.escrow_client.fund();
}

// ===========================================================================
// 11. Utility / getter tests
// ===========================================================================

#[test]
fn test_version() {
    let setup = setup_test();
    let milestone = Milestone {
        id: 1,
        deadline: 0,
        amount: 100,
        status: MilestoneStatus::Pending,
        description: String::from_str(&setup.env, "M"),
        client_approved: false,
        freelancer_approved: false,
    };
    let milestones = vec![&env, milestone];

    escrow.initialize(&setup.admin, &setup.client, &setup.freelancer, &setup.arbiter, &setup.token_address, &milestones);
    escrow.fund();
    escrow.submit_milestone(&1);
    escrow.approve(&1);
    // Once approved, the milestone is no longer in Submitted state.
    escrow.approve(&1);
}

#[test]
fn test_multiple_milestones_independent() {
    let setup = setup_test();
    let env = &setup.env;

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

    setup.escrow_client.initialize(
        &setup.admin, &setup.client, &setup.freelancer, &setup.arbiter,
        &setup.token_address, &vec![env, m1, m2],
    );
    setup.escrow_client.fund();

    // Start and submit only milestone 1
    setup.escrow_client.start_milestone(&1);
    setup.escrow_client.submit_milestone(&1);

    // Milestone 2 is still Funded
    let milestones = setup.escrow_client.get_milestones();
    assert_eq!(milestones.get(0).unwrap().status, MilestoneStatus::Submitted);
    assert_eq!(milestones.get(1).unwrap().status, MilestoneStatus::Funded);

    // Dispute milestone 1; milestone 2 stays untouched
    setup.escrow_client.dispute(&1, &setup.client);
    let milestones2 = setup.escrow_client.get_milestones();
    assert_eq!(milestones2.get(0).unwrap().status, MilestoneStatus::Disputed);
    assert_eq!(milestones2.get(1).unwrap().status, MilestoneStatus::Funded);
}

#[test]
fn test_getters_return_correct_parties() {
    let setup = setup_test();
    let milestone = Milestone {
        id: 1,
        deadline: 0,
        amount: 100,
        status: MilestoneStatus::Pending,
        description: String::from_str(&setup.env, "M"),
        client_approved: false,
        freelancer_approved: false,
    };
    let milestones = vec![&env, milestone];

    escrow.initialize(&setup.admin, &setup.client, &setup.freelancer, &setup.arbiter, &setup.token_address, &milestones);
    escrow.fund();
    escrow.submit_milestone(&1);
    escrow.approve(&1);

    // Verify client approval is set
    assert_eq!(escrow.has_client_approval(&1), true);

#[test]
#[should_panic(expected = "HostError: Error(Contract, #6)")]
fn test_no_transition_from_released() {
    let setup = setup_test();
    let id = setup_approved_milestone(&setup, 100);
    setup.escrow_client.freelancer_confirm(&id);
    setup.escrow_client.release(&id, &setup.freelancer);
    // Now Released → submit must fail
    setup.escrow_client.submit_milestone(&id);
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
