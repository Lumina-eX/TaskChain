#!/bin/bash

###############################################################################
# TaskChain Mainnet Deployment Script
# 
# This script handles the deployment of the TaskChain platform to Stellar mainnet.
# It includes pre-deployment checks, contract deployment, and verification.
#
# PREREQUISITES:
# - Rust and Soroban CLI installed
# - Stellar mainnet account with sufficient XLM for deployment
# - Environment variables configured in .env
# - Neon database configured for mainnet
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CONTRACTS_DIR="$PROJECT_ROOT/contracts"
CONTRACT_DIR="$CONTRACTS_DIR/contracts/escrow"

# Load environment variables
if [ -f "$PROJECT_ROOT/.env" ]; then
    source "$PROJECT_ROOT/.env"
else
    echo -e "${RED}ERROR: .env file not found${NC}"
    exit 1
fi

# Validate required environment variables
required_vars=(
    "STELLAR_NETWORK_PASSPHRASE"
    "ESCROW_ACCOUNT_ID"
    "DATABASE_URL"
    "JWT_SECRET"
)

missing_vars=()
for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        missing_vars+=("$var")
    fi
done

if [ ${#missing_vars[@]} -gt 0 ]; then
    echo -e "${RED}ERROR: Missing required environment variables:${NC}"
    printf '%s\n' "${missing_vars[@]}"
    exit 1
fi

# Validate network configuration
if [ "$STELLAR_NETWORK_PASSPHRASE" = "Test SDF Network ; September 2015" ]; then
    echo -e "${RED}ERROR: Network passphrase is set to testnet. This script is for mainnet deployment.${NC}"
    echo -e "${YELLOW}Please set STELLAR_NETWORK_PASSPHRASE to: 'Public Global Stellar Network ; September 2015'${NC}"
    exit 1
fi

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}TaskChain Mainnet Deployment${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

###############################################################################
# Pre-deployment Checks
###############################################################################

echo -e "${YELLOW}[1/7] Running pre-deployment checks...${NC}"

# Check if Soroban CLI is installed
if ! command -v soroban &> /dev/null; then
    echo -e "${RED}ERROR: soroban CLI not found. Please install Soroban CLI.${NC}"
    exit 1
fi

# Check if Rust is installed
if ! command -v rustc &> /dev/null; then
    echo -e "${RED}ERROR: rustc not found. Please install Rust.${NC}"
    exit 1
fi

# Check if contract directory exists
if [ ! -d "$CONTRACT_DIR" ]; then
    echo -e "${RED}ERROR: Contract directory not found at $CONTRACT_DIR${NC}"
    exit 1
fi

# Check if escrow account exists on mainnet
echo -e "${YELLOW}Checking escrow account on mainnet...${NC}"
if ! soroban account address "$ESCROW_ACCOUNT_ID" &> /dev/null; then
    echo -e "${RED}ERROR: Escrow account $ESCROW_ACCOUNT_ID does not exist on mainnet${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Pre-deployment checks passed${NC}"
echo ""

###############################################################################
# Build Contract
###############################################################################

echo -e "${YELLOW}[2/7] Building smart contract...${NC}"

cd "$CONTRACTS_DIR"

# Build the contract in release mode
cargo build --release --target wasm32-unknown-unknown

if [ $? -ne 0 ]; then
    echo -e "${RED}ERROR: Contract build failed${NC}"
    exit 1
fi

# Optimize the WASM file
soroban contract optimize --wasm "$CONTRACT_DIR/target/wasm32-unknown-unknown/release/escrow.wasm"

if [ $? -ne 0 ]; then
    echo -e "${RED}ERROR: Contract optimization failed${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Contract built and optimized${NC}"
echo ""

###############################################################################
# Database Migration
###############################################################################

echo -e "${YELLOW}[3/7] Running database migrations...${NC}"

cd "$PROJECT_ROOT"

# Run database migrations
npm run migrate

if [ $? -ne 0 ]; then
    echo -e "${RED}ERROR: Database migration failed${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Database migrations completed${NC}"
echo ""

###############################################################################
# Deploy Contract to Mainnet
###############################################################################

echo -e "${YELLOW}[4/7] Deploying escrow contract to mainnet...${NC}"

# Get the optimized WASM file
WASM_FILE="$CONTRACT_DIR/target/wasm32-unknown-unknown/release/escrow.optimized.wasm"

if [ ! -f "$WASM_FILE" ]; then
    echo -e "${RED}ERROR: Optimized WASM file not found${NC}"
    exit 1
fi

# Deploy the contract
# Note: You'll need to provide the actual deployment parameters
# This is a template - adjust based on your actual deployment needs
echo -e "${YELLOW}Deploying contract with parameters:${NC}"
echo "  - Admin: $ESCROW_ACCOUNT_ID"
echo "  - Max Contract Value: 1000000000 (10M XLM)"
echo "  - Dispute Timelock: 86400 (24 hours)"

# soroban contract deploy \
#   --wasm "$WASM_FILE" \
#   --source "$ESCROW_ACCOUNT_ID" \
#   --network "mainnet" \
#   -- \
#   initialize \
#   --client <CLIENT_ADDRESS> \
#   --freelancer <FREELANCER_ADDRESS> \
#   --arbiter <ARBITER_ADDRESS> \
#   --token <TOKEN_ADDRESS> \
#   --admin "$ESCROW_ACCOUNT_ID" \
#   --max_contract_value 1000000000 \
#   --dispute_timelock 86400

echo -e "${YELLOW}NOTE: Actual contract deployment command is commented out.${NC}"
echo -e "${YELLOW}Please uncomment and configure the deployment command above with actual addresses.${NC}"
echo -e "${GREEN}✓ Contract deployment prepared${NC}"
echo ""

###############################################################################
# Verify Deployment
###############################################################################

echo -e "${YELLOW}[5/7] Verifying deployment...${NC}"

# Verify contract is deployed and accessible
# soroban contract inspect --id <CONTRACT_ID> --network mainnet

echo -e "${YELLOW}NOTE: Contract verification step requires actual contract ID.${NC}"
echo -e "${GREEN}✓ Deployment verification prepared${NC}"
echo ""

###############################################################################
# Build and Deploy Frontend
###############################################################################

echo -e "${YELLOW}[6/7] Building and deploying frontend...${NC}"

cd "$PROJECT_ROOT"

# Build the Next.js application
npm run build

if [ $? -ne 0 ]; then
    echo -e "${RED}ERROR: Frontend build failed${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Frontend built successfully${NC}"
echo ""

# Deploy to Vercel (if configured)
# vercel --prod

echo -e "${YELLOW}NOTE: Vercel deployment command is commented out.${NC}"
echo -e "${YELLOW}Run 'vercel --prod' to deploy to production.${NC}"
echo ""

###############################################################################
# Post-deployment Configuration
###############################################################################

echo -e "${YELLOW}[7/7] Running post-deployment configuration...${NC}"

# Start the blockchain worker
echo -e "${YELLOW}Starting blockchain worker...${NC}"
# npm run worker &

echo -e "${YELLOW}NOTE: Worker start command is commented out.${NC}"
echo -e "${YELLOW}Run 'npm run worker' to start the blockchain event listener.${NC}"
echo ""

###############################################################################
# Deployment Summary
###############################################################################

echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Deployment Summary${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${GREEN}✓ Smart contract built and optimized${NC}"
echo -e "${GREEN}✓ Database migrations completed${NC}"
echo -e "${GREEN}✓ Contract deployment prepared${NC}"
echo -e "${GREEN}✓ Frontend built successfully${NC}"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "1. Uncomment and configure the contract deployment command"
echo "2. Deploy the contract to mainnet"
echo "3. Verify the contract deployment"
echo "4. Deploy frontend to Vercel"
echo "5. Start the blockchain worker"
echo "6. Monitor the deployment for issues"
echo ""
echo -e "${YELLOW}Important Security Reminders:${NC}"
echo "- Ensure admin private keys are stored securely (HSM/KMS)"
echo "- Monitor the contract for unusual activity"
echo "- Have emergency withdrawal procedure documented"
echo "- Set up monitoring and alerting"
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Deployment preparation complete!${NC}"
echo -e "${BLUE}========================================${NC}"
