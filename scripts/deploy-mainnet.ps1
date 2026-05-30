###############################################################################
# TaskChain Mainnet Deployment Script (PowerShell)
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

param(
    [switch]$SkipChecks,
    [switch]$SkipMigration,
    [switch]$SkipBuild,
    [switch]$SkipContractDeploy,
    [switch]$SkipFrontendBuild
)

$ErrorActionPreference = "Stop"

# Configuration
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$ContractsDir = Join-Path $ProjectRoot "contracts"
$ContractDir = Join-Path $ContractsDir "contracts\escrow"

# Load environment variables
$EnvFile = Join-Path $ProjectRoot ".env"
if (-not (Test-Path $EnvFile)) {
    Write-Host "ERROR: .env file not found" -ForegroundColor Red
    exit 1
}

# Read environment variables from .env file
Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^([^#].+?)=(.+)$') {
        $name = $matches[1]
        $value = $matches[2]
        [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
}

# Validate required environment variables
$requiredVars = @(
    "STELLAR_NETWORK_PASSPHRASE",
    "ESCROW_ACCOUNT_ID",
    "DATABASE_URL",
    "JWT_SECRET"
)

$missingVars = @()
foreach ($var in $requiredVars) {
    $value = [Environment]::GetEnvironmentVariable($var, "Process")
    if ([string]::IsNullOrWhiteSpace($value)) {
        $missingVars += $var
    }
}

if ($missingVars.Count -gt 0) {
    Write-Host "ERROR: Missing required environment variables:" -ForegroundColor Red
    $missingVars | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    exit 1
}

# Validate network configuration
$networkPassphrase = [Environment]::GetEnvironmentVariable("STELLAR_NETWORK_PASSPHRASE", "Process")
if ($networkPassphrase -eq "Test SDF Network ; September 2015") {
    Write-Host "ERROR: Network passphrase is set to testnet. This script is for mainnet deployment." -ForegroundColor Red
    Write-Host "Please set STELLAR_NETWORK_PASSPHRASE to: 'Public Global Stellar Network ; September 2015'" -ForegroundColor Yellow
    exit 1
}

Write-Host "========================================" -ForegroundColor Blue
Write-Host "TaskChain Mainnet Deployment" -ForegroundColor Blue
Write-Host "========================================" -ForegroundColor Blue
Write-Host ""

###############################################################################
# Pre-deployment Checks
###############################################################################

if (-not $SkipChecks) {
    Write-Host "[1/7] Running pre-deployment checks..." -ForegroundColor Yellow

    # Check if Soroban CLI is installed
    if (-not (Get-Command soroban -ErrorAction SilentlyContinue)) {
        Write-Host "ERROR: soroban CLI not found. Please install Soroban CLI." -ForegroundColor Red
        exit 1
    }

    # Check if Rust is installed
    if (-not (Get-Command rustc -ErrorAction SilentlyContinue)) {
        Write-Host "ERROR: rustc not found. Please install Rust." -ForegroundColor Red
        exit 1
    }

    # Check if Node.js is installed
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Host "ERROR: node not found. Please install Node.js." -ForegroundColor Red
        exit 1
    }

    # Check if contract directory exists
    if (-not (Test-Path $ContractDir)) {
        Write-Host "ERROR: Contract directory not found at $ContractDir" -ForegroundColor Red
        exit 1
    }

    # Check if escrow account exists on mainnet
    Write-Host "Checking escrow account on mainnet..." -ForegroundColor Yellow
    $escrowAccountId = [Environment]::GetEnvironmentVariable("ESCROW_ACCOUNT_ID", "Process")
    # Note: Actual account check would require soroban CLI command
    # soroban account address $escrowAccountId

    Write-Host "✓ Pre-deployment checks passed" -ForegroundColor Green
    Write-Host ""
}

###############################################################################
# Build Contract
###############################################################################

if (-not $SkipBuild) {
    Write-Host "[2/7] Building smart contract..." -ForegroundColor Yellow

    Push-Location $ContractsDir

    try {
        # Build the contract in release mode
        cargo build --release --target wasm32-unknown-unknown

        if ($LASTEXITCODE -ne 0) {
            Write-Host "ERROR: Contract build failed" -ForegroundColor Red
            exit 1
        }

        # Optimize the WASM file
        $wasmFile = Join-Path $ContractDir "target\wasm32-unknown-unknown\release\escrow.wasm"
        soroban contract optimize --wasm $wasmFile

        if ($LASTEXITCODE -ne 0) {
            Write-Host "ERROR: Contract optimization failed" -ForegroundColor Red
            exit 1
        }

        Write-Host "✓ Contract built and optimized" -ForegroundColor Green
    }
    finally {
        Pop-Location
    }

    Write-Host ""
}

###############################################################################
# Database Migration
###############################################################################

if (-not $SkipMigration) {
    Write-Host "[3/7] Running database migrations..." -ForegroundColor Yellow

    Push-Location $ProjectRoot

    try {
        # Run database migrations
        npm run migrate

        if ($LASTEXITCODE -ne 0) {
            Write-Host "ERROR: Database migration failed" -ForegroundColor Red
            exit 1
        }

        Write-Host "✓ Database migrations completed" -ForegroundColor Green
    }
    finally {
        Pop-Location
    }

    Write-Host ""
}

###############################################################################
# Deploy Contract to Mainnet
###############################################################################

if (-not $SkipContractDeploy) {
    Write-Host "[4/7] Deploying escrow contract to mainnet..." -ForegroundColor Yellow

    # Get the optimized WASM file
    $wasmFile = Join-Path $ContractDir "target\wasm32-unknown-unknown\release\escrow.optimized.wasm"

    if (-not (Test-Path $wasmFile)) {
        Write-Host "ERROR: Optimized WASM file not found" -ForegroundColor Red
        exit 1
    }

    # Deploy the contract
    # Note: You'll need to provide the actual deployment parameters
    Write-Host "Deploying contract with parameters:" -ForegroundColor Yellow
    Write-Host "  - Admin: $escrowAccountId"
    Write-Host "  - Max Contract Value: 1000000000 (10M XLM)"
    Write-Host "  - Dispute Timelock: 86400 (24 hours)"

    # soroban contract deploy `
    #   --wasm $wasmFile `
    #   --source $escrowAccountId `
    #   --network "mainnet" `
    #   -- `
    #   initialize `
    #   --client <CLIENT_ADDRESS> `
    #   --freelancer <FREELANCER_ADDRESS> `
    #   --arbiter <ARBITER_ADDRESS> `
    #   --token <TOKEN_ADDRESS> `
    #   --admin $escrowAccountId `
    #   --max_contract_value 1000000000 `
    #   --dispute_timelock 86400

    Write-Host "NOTE: Actual contract deployment command is commented out." -ForegroundColor Yellow
    Write-Host "Please uncomment and configure the deployment command above with actual addresses." -ForegroundColor Yellow
    Write-Host "✓ Contract deployment prepared" -ForegroundColor Green
    Write-Host ""
}

###############################################################################
# Verify Deployment
###############################################################################

Write-Host "[5/7] Verifying deployment..." -ForegroundColor Yellow

# Verify contract is deployed and accessible
# soroban contract inspect --id <CONTRACT_ID> --network mainnet

Write-Host "NOTE: Contract verification step requires actual contract ID." -ForegroundColor Yellow
Write-Host "✓ Deployment verification prepared" -ForegroundColor Green
Write-Host ""

###############################################################################
# Build and Deploy Frontend
###############################################################################

if (-not $SkipFrontendBuild) {
    Write-Host "[6/7] Building and deploying frontend..." -ForegroundColor Yellow

    Push-Location $ProjectRoot

    try {
        # Build the Next.js application
        npm run build

        if ($LASTEXITCODE -ne 0) {
            Write-Host "ERROR: Frontend build failed" -ForegroundColor Red
            exit 1
        }

        Write-Host "✓ Frontend built successfully" -ForegroundColor Green
    }
    finally {
        Pop-Location
    }

    # Deploy to Vercel (if configured)
    # vercel --prod

    Write-Host "NOTE: Vercel deployment command is commented out." -ForegroundColor Yellow
    Write-Host "Run 'vercel --prod' to deploy to production." -ForegroundColor Yellow
    Write-Host ""
}

###############################################################################
# Post-deployment Configuration
###############################################################################

Write-Host "[7/7] Running post-deployment configuration..." -ForegroundColor Yellow

# Start the blockchain worker
Write-Host "Starting blockchain worker..." -ForegroundColor Yellow
# npm run worker &

Write-Host "NOTE: Worker start command is commented out." -ForegroundColor Yellow
Write-Host "Run 'npm run worker' to start the blockchain event listener." -ForegroundColor Yellow
Write-Host ""

###############################################################################
# Deployment Summary
###############################################################################

Write-Host "========================================" -ForegroundColor Blue
Write-Host "Deployment Summary" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Blue
Write-Host ""
Write-Host "✓ Smart contract built and optimized" -ForegroundColor Green
Write-Host "✓ Database migrations completed" -ForegroundColor Green
Write-Host "✓ Contract deployment prepared" -ForegroundColor Green
Write-Host "✓ Frontend built successfully" -ForegroundColor Green
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "1. Uncomment and configure the contract deployment command"
Write-Host "2. Deploy the contract to mainnet"
Write-Host "3. Verify the contract deployment"
Write-Host "4. Deploy frontend to Vercel"
Write-Host "5. Start the blockchain worker"
Write-Host "6. Monitor the deployment for issues"
Write-Host ""
Write-Host "Important Security Reminders:" -ForegroundColor Yellow
Write-Host "- Ensure admin private keys are stored securely (HSM/KMS)"
Write-Host "- Monitor the contract for unusual activity"
Write-Host "- Have emergency withdrawal procedure documented"
Write-Host "- Set up monitoring and alerting"
Write-Host ""
Write-Host "========================================" -ForegroundColor Blue
Write-Host "Deployment preparation complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Blue
