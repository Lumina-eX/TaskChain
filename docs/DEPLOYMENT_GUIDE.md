# TaskChain Mainnet Deployment Guide

**Version**: 1.1  
**Date**: 2026-06-24  
**Status**: Draft

---

## Overview

This guide provides step-by-step instructions for deploying TaskChain to the Stellar mainnet. It covers pre-deployment preparation, the deployment process, post-deployment validation, and emergency procedures.

Smart contract deployments (Soroban escrow) must additionally follow the [Soroban Escrow Deployment Verification](#soroban-escrow-deployment-verification--reproducibility) procedures below, which define reproducible builds, artifact traceability, and auditable deployment records for both Testnet and Mainnet.

---

## Prerequisites

### 1. Infrastructure Requirements
- Neon Postgres database (production tier)
- Vercel account (or alternative hosting)
- Domain name configured with SSL
- Monitoring service (Sentry, Datadog, etc.)
- DDoS protection (Cloudflare recommended)

### 2. Security Requirements
- HSM or KMS for platform escrow key storage
- Multi-signature wallet for platform escrow account
- Secure secret management (Vercel Environment Variables)
- Emergency signer setup (5 authorized signers)

### 3. Team Requirements
- At least 2 authorized admins for deployment
- Security team on standby during deployment
- Support team ready for launch
- Emergency contact list prepared

---

## Pre-Deployment Checklist

### 1. Security Audit
- [ ] Complete security audit checklist (`docs/SECURITY_AUDIT_CHECKLIST.md`)
- [ ] Review threat modeling document (`docs/THREAT_MODELING.md`)
- [ ] Complete smart contract audit (if applicable)
- [ ] Review and approve all security findings
- [ ] Document any accepted risks

### 2. Smart Contract Preparation
- [ ] Smart contract audited by reputable firm
- [ ] Contract source code verified on Stellar explorer
- [ ] Build reproduced from pinned toolchain and WASM hash matches the recorded artifact
- [ ] Contract deployed to mainnet
- [ ] Contract tested on mainnet with small amounts
- [ ] Emergency stop functionality tested
- [ ] Contract upgrade mechanism tested (if applicable)

### 3. Database Preparation
- [ ] Production database provisioned
- [ ] Database connection string secured
- [ ] Database backups configured
- [ ] Database migration tested on staging
- [ ] Database performance tested under load

### 4. Environment Configuration
- [ ] All environment variables documented
- [ ] JWT_SECRET generated (32+ characters)
- [ ] STELLAR_HORIZON_URL set to mainnet
- [ ] STELLAR_NETWORK_PASSPHRASE set to mainnet
- [ ] ESCROW_ACCOUNT_ID set to platform escrow address
- [ ] No testnet configuration in environment
- [ ] Secrets stored in secure location (not in code)
- [ ] Network config (`config/networks/mainnet.env`) is separate from Testnet and contains no testnet values

### 5. Key Management
- [ ] Platform escrow private key stored in HSM/KMS
- [ ] Multi-signature configured for escrow account
- [ ] Key backup procedure documented
- [ ] Key rotation procedure documented
- [ ] Emergency access procedure documented

### 6. Emergency Signers Setup
- [ ] 5 emergency signers identified
- [ ] Emergency signer wallets created
- [ ] Emergency signer contact information collected
- [ ] Emergency signer approval process documented
- [ ] Emergency withdrawal mechanism tested on testnet

### 7. Monitoring & Logging
- [ ] Application monitoring configured
- [ ] Error tracking configured (Sentry)
- [ ] Performance monitoring configured
- [ ] Security event logging configured
- [ ] Alert thresholds configured
- [ ] On-call rotation established

### 8. Testing
- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] CI contract test suite and build verification passing for the pinned toolchain
- [ ] Load testing completed
- [ ] Security testing completed
- [ ] User acceptance testing completed
- [ ] Disaster recovery tested

---

## Deployment Process

### Step 1: Prepare Environment

```bash
# Clone repository
git clone <repository-url>
cd TaskChain

# Install dependencies
npm install

# Create environment file
cp .env.example .env
```

### Step 2: Configure Environment Variables

Edit `.env` with production values:

```bash
# Database
DATABASE_URL=postgres://user:password@ep-xxx.aws.neon.tech/neondb?sslmode=require

# Auth
JWT_SECRET=<generate-with: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))">

# Stellar Mainnet
STELLAR_HORIZON_URL=https://horizon.stellar.org
STELLAR_NETWORK_PASSPHRASE=Public Global Stellar Network ; September 2015

# Platform Escrow
ESCROW_ACCOUNT_ID=GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

### Step 3: Run Pre-Deployment Checks

```bash
# Dry run to check configuration
DRY_RUN=true npx tsx scripts/deploy-mainnet.ts
```

This will verify:
- All required environment variables are set
- JWT_SECRET is strong enough
- Stellar network is configured for mainnet
- Database connection works
- Escrow account is valid
- No testnet configuration present

### Step 4: Run Database Migrations

```bash
# Run migrations
npx tsx scripts/migrate.ts
```

This will create all required tables including:
- User tables
- Escrow tables
- Critical operations table (fail-safe)
- Emergency withdrawal tables

### Step 5: Build Application

```bash
# Build for production
npm run build
```

### Step 6: Initialize Security Systems

The deployment script will automatically initialize:
- Fail-safe system
- Emergency withdrawal system

### Step 7: Deploy to Production

```bash
# Confirm deployment
CONFIRM=true npx tsx scripts/deploy-mainnet.ts
```

This will:
- Run all pre-deployment checks
- Execute database migrations
- Build the application
- Initialize security systems
- Validate the deployment
- Generate deployment report

### Step 8: Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy to production
vercel --prod
```

Or use the Vercel dashboard to deploy from GitHub.

---

## Post-Deployment Validation

### 1. Health Checks

```bash
# Check application health
curl https://your-domain.com/api/health

# Check database connection
curl https://your-domain.com/api/health/db

# Check blockchain connection
curl https://your-domain.com/api/health/blockchain
```

### 2. Functional Testing

Test critical functionality:
- [ ] User registration and authentication
- [ ] Job creation
- [ ] Escrow funding (small amount)
- [ ] Milestone creation and approval
- [ ] Fund release (small amount)
- [ ] Escrow refund (small amount)
- [ ] Dispute creation
- [ ] Emergency withdrawal (test)

### 3. Security Validation

- [ ] Verify all endpoints require authentication
- [ ] Verify rate limiting is working
- [ ] Verify CORS is restricted
- [ ] Verify security headers are set
- [ ] Verify no sensitive data in logs
- [ ] Verify error messages don't leak information

### 4. Monitoring Verification

- [ ] Verify logs are being collected
- [ ] Verify errors are being tracked
- [ ] Verify alerts are configured
- [ ] Verify dashboards are working
- [ ] Verify on-call notifications work

---

## Emergency Procedures

### 1. Emergency Withdrawal

If funds are stuck in escrow:

1. Create emergency withdrawal request:
```bash
curl -X POST https://your-domain.com/api/emergency/withdrawals \
  -H "Authorization: Bearer <admin-token>" \
  -d '{
    "contractId": "contract-id",
    "reason": "Smart contract bug",
    "amount": "1000",
    "currency": "USDC",
    "recipientAddress": "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
  }'
```

2. Get 3 of 5 emergency signers to approve

3. Wait 48-hour time delay

4. Execute withdrawal

### 2. Rollback Procedure

If deployment fails:

1. Revert to previous deployment:
```bash
vercel rollback <deployment-url>
```

2. Restore database from backup:
```bash
# Contact Neon support for point-in-time recovery
```

3. Verify rollback was successful

4. Investigate failure

5. Fix issues and redeploy

### 3. Circuit Breaker Activation

If system is under attack:

1. Activate circuit breakers via admin panel
2. Stop all new transactions
3. Investigate attack
4. Patch vulnerabilities
5. Gradually resume operations

---

## Monitoring & Maintenance

### 1. Daily Monitoring

- Check error rates
- Check transaction success rates
- Check blockchain synchronization
- Review security logs
- Review performance metrics

### 2. Weekly Maintenance

- Review and rotate secrets (if needed)
- Review and update emergency signers
- Review and update rate limits
- Review and update monitoring thresholds
- Review and update documentation

### 3. Monthly Maintenance

- Security audit review
- Smart contract audit review
- Dependency updates
- Performance optimization
- Disaster recovery drill

---

## Troubleshooting

### Issue: Database Connection Failed

**Symptoms**: Application cannot connect to database

**Solutions**:
1. Verify DATABASE_URL is correct
2. Verify database is accessible
3. Check SSL mode is set to require
4. Check firewall rules
5. Verify database credentials

### Issue: Blockchain Connection Failed

**Symptoms**: Cannot connect to Stellar network

**Solutions**:
1. Verify STELLAR_HORIZON_URL is correct
2. Verify network passphrase is correct
3. Check Stellar network status
4. Verify escrow account exists
5. Check rate limits

### Issue: Fail-Safe System Not Working

**Symptoms**: Critical operations not being tracked

**Solutions**:
1. Verify critical_operations table exists
2. Verify fail-safe system initialized
3. Check database permissions
4. Review fail-safe logs
5. Restart application

### Issue: Emergency Withdrawal Not Working

**Symptoms**: Cannot create or execute emergency withdrawal

**Solutions**:
1. Verify emergency_withdrawals table exists
2. Verify emergency signers are configured
3. Verify admin permissions
4. Check approval requirements
5. Verify time delay has passed

---

## Contact Information

### Emergency Contacts

- **Platform Security Lead**: [Name, Email, Phone]
- **Stellar Support**: [Contact Information]
- **Infrastructure Provider**: [Contact Information]
- **Legal Counsel**: [Name, Email, Phone]

### Support Channels

- **Slack**: #taskchain-ops
- **Email**: ops@taskchain.io
- **PagerDuty**: [Integration]

---

## Appendix

### A. Environment Variables Reference

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| DATABASE_URL | Yes | Neon Postgres connection string | postgres://user:pass@ep-xxx.neon.tech/neondb?sslmode=require |
| JWT_SECRET | Yes | JWT signing secret (32+ chars) | <random-64-char-string> |
| STELLAR_HORIZON_URL | Yes | Stellar Horizon RPC endpoint | https://horizon.stellar.org |
| STELLAR_NETWORK_PASSPHRASE | Yes | Stellar network passphrase | Public Global Stellar Network ; September 2015 |
| ESCROW_ACCOUNT_ID | Yes | Platform escrow account public key | GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX |
| NODE_ENV | No | Node environment | production |

### B. Useful Commands

```bash
# Run migrations
npx tsx scripts/migrate.ts

# Deploy to mainnet
CONFIRM=true npx tsx scripts/deploy-mainnet.ts

# Start worker process
npm run worker

# Run tests
npm test

# Build application
npm run build

# Start production server
npm run start:production
```

### C. Resources

- [Stellar Documentation](https://developers.stellar.org/)
- [Neon Documentation](https://neon.tech/docs)
- [Vercel Documentation](https://vercel.com/docs)
- [Next.js Documentation](https://nextjs.org/docs)

---

## Change Log

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-06-24 | Initial deployment guide | Security Team |

---

## Sign-Off

**Deployment Lead**: ______________________ Date: ________

**Security Lead**: ______________________ Date: ________

**CTO/VP Engineering**: ______________________ Date: ________
