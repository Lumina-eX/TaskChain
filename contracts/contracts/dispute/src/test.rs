#![cfg(test)]
extern crate alloc;

use alloc::string::ToString;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, Env, String
};

use crate::{DisputeContract, DisputeContractClient, DisputeStatus, Error};
use soroban_sdk::token;

fn create_token_contract<'a>(e: &Env, admin: &Address) -> token::Client<'a> {
    token::Client::new(e, &e.register_stellar_asset_contract(admin.clone()))
}

#[test]
fn test_initialization() {
    let env = Env::default();
    let contract_id = env.register_contract(None, DisputeContract);
    let client = DisputeContractClient::new(&env, &contract_id);
    let token_admin = Address::generate(&env);
    let token = create_token_contract(&env, &token_admin);

    client.initialize(&token.address);
    assert_eq!(client.get_dispute_count(), 0);
}

#[test]
fn test_create_dispute() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, DisputeContract);
    let client = DisputeContractClient::new(&env, &contract_id);
    let token_admin = Address::generate(&env);
    let token = create_token_contract(&env, &token_admin);

    client.initialize(&token.address);

    let title = String::from_str(&env, "Dispute 1");
    let description = String::from_str(&env, "Client vs Freelancer");
    let duration = 86400; // 1 day
    let disputed_amount = 5000;
    let winner = Address::generate(&env);
    let loser = Address::generate(&env);
    let caller = Address::generate(&env);

    let token_admin_client = token::StellarAssetClient::new(&env, &token.address);
    token_admin_client.mint(&caller, &disputed_amount);

    env.ledger().set_timestamp(1000);
    
    let dispute_id = client.create_dispute(&caller, &title, &description, 
&duration, &disputed_amount, &winner, &loser);
    
    assert_eq!(dispute_id, 0);
    assert_eq!(client.get_dispute_count(), 1);

    let dispute = client.get_dispute(&dispute_id);
    assert_eq!(dispute.id, 0);
    assert_eq!(dispute.title, title);
    assert_eq!(dispute.end_time, 1000 + duration);
    assert_eq!(dispute.status, DisputeStatus::Open);
    assert_eq!(dispute.disputed_amount, disputed_amount);
    assert_eq!(dispute.winner_address, winner);
    assert_eq!(dispute.loser_address, loser);
}

#[test]
fn test_voting_and_resolving() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, DisputeContract);
    let client = DisputeContractClient::new(&env, &contract_id);
    let token_admin = Address::generate(&env);
    let token = create_token_contract(&env, &token_admin);

    client.initialize(&token.address);

    let voter1 = Address::generate(&env);
    let voter2 = Address::generate(&env);
    let winner = Address::generate(&env);
    let loser = Address::generate(&env);
    let caller = Address::generate(&env);
    let disputed_amount = 2000;

    // Mint tokens to voters and caller
    let token_admin_client = token::StellarAssetClient::new(&env, &token.address);
    token_admin_client.mint(&voter1, &1000);
    token_admin_client.mint(&voter2, &500);
    token_admin_client.mint(&caller, &disputed_amount);

    let title = String::from_str(&env, "Dispute");
    let desc = String::from_str(&env, "Desc");
    
    env.ledger().set_timestamp(1000);
    let dispute_id = client.create_dispute(&caller, &title, &desc, &100, 
&disputed_amount, &winner, &loser);

    client.vote(&voter1, &dispute_id, &1000, &true);
    client.vote(&voter2, &dispute_id, &500, &false);

    let dispute_mid = client.get_dispute(&dispute_id);
    assert_eq!(dispute_mid.votes_for, 1000);
    assert_eq!(dispute_mid.votes_against, 500);

    // Fast forward to after deadline
    env.ledger().set_timestamp(1101);

    let is_resolved_in_favor = client.resolve(&dispute_id);
    assert_eq!(is_resolved_in_favor, true); // votes_for > votes_against

    let dispute_final = client.get_dispute(&dispute_id);
    assert_eq!(dispute_final.status, DisputeStatus::Resolved);

    // Check disputed amount distribution
    assert_eq!(token.balance(&winner), disputed_amount);
    assert_eq!(token.balance(&loser), 0);

    // Claim stakes
    client.claim_stake(&voter1, &dispute_id);
    client.claim_stake(&voter2, &dispute_id);

    assert_eq!(token.balance(&voter1), 1000);
    assert_eq!(token.balance(&voter2), 500);
    assert_eq!(token.balance(&contract_id), 0);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #6)")]
fn test_vote_after_deadline() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, DisputeContract);
    let client = DisputeContractClient::new(&env, &contract_id);

    let token_admin = Address::generate(&env);
    let token = create_token_contract(&env, &token_admin);

    client.initialize(&token.address);

    let voter = Address::generate(&env);
    let token_admin_client = token::StellarAssetClient::new(&env, &token.address);
    token_admin_client.mint(&voter, &100);

    env.ledger().set_timestamp(1000);

    let dispute_id = client.create_dispute(
        &voter,
        &String::from_str(&env, "title"),
        &String::from_str(&env, "desc"),
        &100,
        &100,
        &Address::generate(&env),
        &Address::generate(&env),
    );

    env.ledger().set_timestamp(1101);

    client.vote(&voter, &dispute_id, &100, &true);
}
