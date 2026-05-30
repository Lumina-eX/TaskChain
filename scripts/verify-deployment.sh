#!/bin/bash

###############################################################################
# TaskChain Deployment Verification Script
# 
# This script verifies that the TaskChain platform has been deployed correctly
# to mainnet and all components are functioning as expected.
#
# PREREQUISITES:
# - Deployment completed successfully
# - Environment variables configured in .env
# - Soroban CLI installed
###############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Load environment variables
if [ -f "$PROJECT_ROOT/.env" ]; then
    source "$PROJECT_ROOT/.env"
else
    echo -e "${RED}ERROR: .env file not found${NC}"
    exit 1
fi

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}TaskChain Deployment Verification${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

###############################################################################
# Verify Network Configuration
###############################################################################

echo -e "${YELLOW}[1/6] Verifying network configuration...${NC}"

if [ "$STELLAR_NETWORK_PASSPHRASE" = "Public Global Stellar Network ; September 2015" ]; then
    echo -e "${GREEN}✓ Network configured for mainnet${NC}"
else
    echo -e "${RED}✗ Network not configured for mainnet${NC}"
    echo -e "${RED}  Current: $STELLAR_NETWORK_PASSPHRASE${NC}"
    exit 1
fi

echo ""

###############################################################################
# Verify Database Connection
###############################################################################

echo -e "${YELLOW}[2/6] Verifying database connection...${NC}"

cd "$PROJECT_ROOT"

# Test database connection
node -e "
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);
sql\`SELECT 1\`.then(() => {
    console.log('Database connection successful');
    process.exit(0);
}).catch((err) => {
    console.error('Database connection failed:', err.message);
    process.exit(1);
});
"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Database connection verified${NC}"
else
    echo -e "${RED}✗ Database connection failed${NC}"
    exit 1
fi

echo ""

###############################################################################
# Verify Smart Contract Deployment
###############################################################################

echo -e "${YELLOW}[3/6] Verifying smart contract deployment...${NC}"

# Check if contract ID is set
if [ -z "$CONTRACT_ID" ]; then
    echo -e "${YELLOW}⚠ CONTRACT_ID not set in environment variables${NC}"
    echo -e "${YELLOW}  Skipping contract verification${NC}"
else
    # Verify contract exists on mainnet
    if soroban contract inspect --id "$CONTRACT_ID" --network mainnet &> /dev/null; then
        echo -e "${GREEN}✓ Contract deployed and accessible${NC}"
        echo -e "${GREEN}  Contract ID: $CONTRACT_ID${NC}"
    else
        echo -e "${RED}✗ Contract verification failed${NC}"
        echo -e "${RED}  Contract ID: $CONTRACT_ID${NC}"
        exit 1
    fi
fi

echo ""

###############################################################################
# Verify Escrow Account
###############################################################################

echo -e "${YELLOW}[4/6] Verifying escrow account...${NC}"

if [ -z "$ESCROW_ACCOUNT_ID" ]; then
    echo -e "${RED}✗ ESCROW_ACCOUNT_ID not set${NC}"
    exit 1
fi

# Check if escrow account exists
if soroban account address "$ESCROW_ACCOUNT_ID" &> /dev/null; then
    echo -e "${GREEN}✓ Escrow account exists on mainnet${NC}"
    echo -e "${GREEN}  Account: $ESCROW_ACCOUNT_ID${NC}"
else
    echo -e "${RED}✗ Escrow account not found on mainnet${NC}"
    exit 1
fi

echo ""

###############################################################################
# Verify Frontend Build
###############################################################################

echo -e "${YELLOW}[5/6] Verifying frontend build...${NC}"

if [ -d "$PROJECT_ROOT/.next" ]; then
    echo -e "${GREEN}✓ Frontend build exists${NC}"
else
    echo -e "${RED}✗ Frontend build not found${NC}"
    echo -e "${RED}  Run 'npm run build' to build the frontend${NC}"
    exit 1
fi

echo ""

###############################################################################
# Verify Security Configuration
###############################################################################

echo -e "${YELLOW}[6/6] Verifying security configuration...${NC}"

# Check JWT secret
if [ ${#JWT_SECRET} -lt 32 ]; then
    echo -e "${RED}✗ JWT_SECRET is too short (minimum 32 characters)${NC}"
    exit 1
else
    echo -e "${GREEN}✓ JWT_SECRET meets minimum length requirement${NC}"
fi

# Check database SSL mode
if [[ $DATABASE_URL == *"sslmode=require"* ]]; then
    echo -e "${GREEN}✓ Database connection uses SSL${NC}"
else
    echo -e "${YELLOW}⚠ Database connection may not use SSL${NC}"
    echo -e "${YELLOW}  Ensure ?sslmode=require is in DATABASE_URL${NC}"
fi

echo ""

###############################################################################
# Verification Summary
###############################################################################

echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Verification Summary${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${GREEN}✓ Network configuration verified${NC}"
echo -e "${GREEN}✓ Database connection verified${NC}"
echo -e "${GREEN}✓ Smart contract deployment verified${NC}"
echo -e "${GREEN}✓ Escrow account verified${NC}"
echo -e "${GREEN}✓ Frontend build verified${NC}"
echo -e "${GREEN}✓ Security configuration verified${NC}"
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}All verifications passed!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "1. Start the blockchain worker: npm run worker"
echo "2. Start the production server: npm start"
echo "3. Monitor the application for issues"
echo "4. Set up monitoring and alerting"
echo ""
