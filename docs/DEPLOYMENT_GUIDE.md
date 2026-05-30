# TaskChain Mainnet Deployment Guide

**Version**: 1.0.0  
**Date**: 2025-05-30  
**Status**: Ready for Mainnet Deployment

---

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Environment Configuration](#environment-configuration)
3. [Smart Contract Deployment](#smart-contract-deployment)
4. [Database Migration](#database-migration)
5. [Frontend Deployment](#frontend-deployment)
6. [Post-Deployment Verification](#post-deployment-verification)
7. [Monitoring and Alerting](#monitoring-and-alerting)
8. [Emergency Procedures](#emergency-procedures)
9. [Security Best Practices](#security-best-practices)

---

## Pre-Deployment Checklist

### Infrastructure

- [ ] Neon Postgres database configured for mainnet
- [ ] Database connection string with SSL enabled
- [ ] Vercel account configured for production deployment
- [ ] Domain name configured and pointing to Vercel
- [ ] SSL certificate configured (automatic with Vercel)

### Security

- [ ] JWT secret generated (minimum 32 characters)
- [ ] Admin multi-sig wallet created on Stellar mainnet
- [ ] Escrow account funded with sufficient XLM for operations
- [ ] Private keys stored in HSM or KMS (not in environment variables)
- [ ] Environment variables secured (no hardcoded secrets)

### Smart Contract

- [ ] Smart contract audited by third-party security firm
- [ ] Contract tests passing with >95% coverage
- [ ] Emergency withdrawal mechanism tested
- [ ] Pause functionality tested
- [ ] Max contract value limits configured
- [ ] Dispute timelock configured

### Monitoring

- [ ] Monitoring service configured (e.g., Sentry, Datadog)
- [ ] Alerting configured for critical events
- [ ] Log aggregation configured
- [ ] Blockchain transaction monitoring configured

---

## Environment Configuration

### 1. Create Production `.env` File

Copy the example environment file and configure for production:

```bash
cp env.example .env
```

### 2. Configure Required Variables

Edit `.env` with the following production values:

```env
# Database
DATABASE_URL=postgres://user:password@ep-<endpoint-id>.<region>.aws.neon.tech/neondb?sslmode=require

# Auth
JWT_SECRET=<generate-48-byte-random-hex>

# Stellar Mainnet
STELLAR_HORIZON_URL=https://horizon.stellar.org
STELLAR_NETWORK_PASSPHRASE=Public Global Stellar Network ; September 2015

# Escrow Account
ESCROW_ACCOUNT_ID=<your-escrow-account-public-key>

# Contract Security
CONTRACT_ADMIN_ADDRESS=<your-admin-multi-sig-public-key>
MAX_CONTRACT_VALUE=10000000000  # 1000 XLM in stroops
DISPUTE_TIMELOCK=86400  # 24 hours
EMERGENCY_WITHDRAW_TIMELOCK=172800  # 48 hours
```

### 3. Generate Secure Secrets

Generate a secure JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 4. Validate Configuration

Run the verification script to ensure configuration is correct:

```bash
# On Linux/Mac
bash scripts/verify-deployment.sh

# On Windows
powershell -File scripts/verify-deployment.ps1
```

---

## Smart Contract Deployment

### 1. Build the Contract

```bash
cd contracts
cargo build --release --target wasm32-unknown-unknown
```

### 2. Optimize the WASM

```bash
soroban contract optimize --wasm contracts/contracts/escrow/target/wasm32-unknown-unknown/release/escrow.wasm
```

### 3. Deploy to Mainnet

Use the Soroban CLI to deploy the contract:

```bash
soroban contract deploy \
  --wasm contracts/contracts/escrow/target/wasm32-unknown-unknown/release/escrow.optimized.wasm \
  --source <YOUR_DEPLOYER_ACCOUNT> \
  --network mainnet \
  -- \
  initialize \
  --client <CLIENT_ADDRESS> \
  --freelancer <FREELANCER_ADDRESS> \
  --arbiter <ARBITER_ADDRESS> \
  --token <TOKEN_ADDRESS> \
  --admin <ADMIN_ADDRESS> \
  --max_contract_value 10000000000 \
  --dispute_timelock 86400
```

### 4. Record Contract ID

After deployment, record the contract ID:

```bash
CONTRACT_ID=<deployed-contract-id>
```

Add this to your `.env` file:

```env
CONTRACT_ID=<deployed-contract-id>
```

### 5. Verify Deployment

```bash
soroban contract inspect --id $CONTRACT_ID --network mainnet
```

---

## Database Migration

### 1. Run Migrations

```bash
cd <project-root>
npm run migrate
```

### 2. Verify Tables Created

Connect to your Neon database and verify tables exist:

```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public';
```

Expected tables:
- users
- jobs
- proposals
- escrow_transactions
- reviews
- disputes
- notifications

---

## Frontend Deployment

### 1. Build the Application

```bash
npm run build
```

### 2. Deploy to Vercel

```bash
vercel --prod
```

### 3. Configure Environment Variables in Vercel

Add the following environment variables in Vercel dashboard:
- `DATABASE_URL`
- `JWT_SECRET`
- `STELLAR_HORIZON_URL`
- `STELLAR_NETWORK_PASSPHRASE`
- `ESCROW_ACCOUNT_ID`
- `CONTRACT_ID`
- `CONTRACT_ADMIN_ADDRESS`

### 4. Verify Deployment

Visit your domain and verify:
- Homepage loads correctly
- Authentication works
- No console errors
- API endpoints respond correctly

---

## Post-Deployment Verification

### 1. Run Verification Script

```bash
# On Linux/Mac
bash scripts/verify-deployment.sh

# On Windows
powershell -File scripts/verify-deployment.ps1
```

### 2. Test Critical Flows

Test the following critical flows:
- User registration and authentication
- Job creation
- Escrow funding
- Milestone submission
- Milestone approval
- Payment release
- Dispute creation
- Emergency withdrawal (testnet only)

### 3. Monitor Initial Activity

Monitor the following for the first 24-48 hours:
- Error rates
- Transaction failures
- Database performance
- Blockchain transaction confirmations
- User activity

---

## Monitoring and Alerting

### Recommended Monitoring Tools

1. **Application Monitoring**: Sentry or Datadog
2. **Log Aggregation**: LogRocket or Papertrail
3. **Uptime Monitoring**: UptimeRobot or Pingdom
4. **Blockchain Monitoring**: StellarExpert custom alerts

### Critical Alerts to Configure

1. **Smart Contract Events**
   - Emergency withdrawal initiated
   - Contract paused
   - Large value transactions (> 10,000 XLM)

2. **Application Errors**
   - Error rate > 5%
   - Database connection failures
   - API response time > 2s

3. **Security Events**
   - Failed authentication attempts > 10/min
   - Unauthorized access attempts
   - Unusual transaction patterns

### Monitoring Dashboard

Create a dashboard with the following metrics:
- Active users
- Total escrow value
- Transaction volume
- Error rate
- API response time
- Database query performance

---

## Emergency Procedures

### Emergency Withdrawal

If funds need to be withdrawn urgently:

1. **Initiate Emergency Withdrawal**
   ```bash
   soroban contract invoke \
     --id $CONTRACT_ID \
     --source <ADMIN_ADDRESS> \
     --network mainnet \
     -- \
     initiate_emergency_withdraw
   ```

2. **Wait for Timelock** (48 hours)
   - Notify stakeholders
   - Document reason for withdrawal
   - Prepare recipient address

3. **Execute Emergency Withdrawal**
   ```bash
   soroban contract invoke \
     --id $CONTRACT_ID \
     --source <ADMIN_ADDRESS> \
     --network mainnet \
     -- \
     emergency_withdraw \
     --recipient <RECIPIENT_ADDRESS>
   ```

### Contract Pause

If a critical vulnerability is discovered:

1. **Pause the Contract**
   ```bash
   soroban contract invoke \
     --id $CONTRACT_ID \
     --source <ADMIN_ADDRESS> \
     --network mainnet \
     -- \
     pause
   ```

2. **Notify Users**
   - Post announcement on website
   - Send email notifications
   - Update social media

3. **Address Vulnerability**
   - Fix the issue
   - Deploy new contract
   - Migrate funds

4. **Unpause or Migrate**
   - If fix is simple: unpause
   - If fix is complex: migrate to new contract

### Incident Response Plan

1. **Detection** (0-1 hour)
   - Monitor alerts
   - Identify issue
   - Assess severity

2. **Containment** (1-2 hours)
   - Pause contract if needed
   - Stop affected services
   - Preserve evidence

3. **Investigation** (2-24 hours)
   - Analyze root cause
   - Determine impact
   - Document findings

4. **Resolution** (24-72 hours)
   - Implement fix
   - Test thoroughly
   - Deploy fix

5. **Recovery** (72+ hours)
   - Restore services
   - Monitor for issues
   - Communicate with users

---

## Security Best Practices

### Key Management

1. **Use Multi-Sig for Critical Operations**
   - Admin operations should require multi-sig
   - Use at least 2-of-3 or 3-of-5 multi-sig
   - Distribute keys among trusted parties

2. **Hardware Security Modules (HSM)**
   - Store private keys in HSM or KMS
   - Never store keys in environment variables
   - Use AWS KMS, GCP KMS, or similar

3. **Key Rotation**
   - Rotate keys quarterly
   - Document rotation procedures
   - Test rotation process on testnet first

### Access Control

1. **Principle of Least Privilege**
   - Grant minimum required permissions
   - Review access regularly
   - Revoke access when no longer needed

2. **Multi-Factor Authentication**
   - Require MFA for admin access
   - Use hardware keys (YubiKey) for critical operations
   - Implement session timeouts

### Network Security

1. **SSL/TLS Everywhere**
   - All connections must use HTTPS
   - Use strong TLS ciphers
   - Enable HSTS

2. **Firewall Rules**
   - Restrict database access
   - IP whitelist for admin access
   - Use VPC peering where possible

### Code Security

1. **Regular Audits**
   - Quarterly security audits
   - Third-party smart contract audits
   - Penetration testing

2. **Dependency Management**
   - Keep dependencies updated
   - Use dependency scanning tools
   - Review security advisories

### Operational Security

1. **Backup and Recovery**
   - Regular database backups
   - Test restore procedures
   - Document recovery process

2. **Change Management**
   - Use code review process
   - Test changes on testnet first
   - Document all changes

3. **Monitoring**
   - 24/7 monitoring
   - Alert on anomalies
   - Regular security reviews

---

## Troubleshooting

### Common Issues

#### Contract Deployment Fails

**Symptom**: Contract deployment returns error

**Solutions**:
1. Check account has sufficient XLM for deployment
2. Verify network passphrase is correct
3. Ensure Soroban CLI is up to date
4. Check contract WASM is valid

#### Database Connection Fails

**Symptom**: Application cannot connect to database

**Solutions**:
1. Verify DATABASE_URL is correct
2. Check SSL mode is enabled
3. Verify database is accessible
4. Check firewall rules

#### Transactions Not Confirming

**Symptom**: Blockchain transactions stuck pending

**Solutions**:
1. Check network status
2. Verify account has sufficient fees
3. Check transaction memo format
4. Verify contract is not paused

### Getting Help

If you encounter issues not covered here:

1. Check logs: `npm run worker` logs for blockchain events
2. Review documentation: `docs/` directory
3. Check Stellar documentation: https://developers.stellar.org
4. Review Soroban documentation: https://soroban.stellar.org

---

## Appendix A: Useful Commands

### Stellar CLI Commands

```bash
# Check account balance
soroban account balance --id <ACCOUNT_ID> --network mainnet

# Inspect contract
soroban contract inspect --id <CONTRACT_ID> --network mainnet

# Invoke contract function
soroban contract invoke --id <CONTRACT_ID> --source <SOURCE> --network mainnet -- <FUNCTION> <ARGS>

# Get transaction status
soroban transaction --id <TRANSACTION_ID> --network mainnet
```

### Database Commands

```bash
# Run migrations
npm run migrate

# Connect to database
psql $DATABASE_URL

# Check tables
\dt

# Check recent transactions
SELECT * FROM escrow_transactions ORDER BY created_at DESC LIMIT 10;
```

### Application Commands

```bash
# Build application
npm run build

# Start production server
npm start

# Start blockchain worker
npm run worker

# Run tests
npm test
```

---

## Appendix B: Contact Information

### Emergency Contacts

- **Security Team**: security@taskchain.io
- **DevOps Team**: devops@taskchain.io
- **Smart Contract Team**: contracts@taskchain.io

### External Resources

- **Stellar Support**: https://stellar.org/support
- **Soroban Discord**: https://discord.gg/stellar
- **Neon Support**: https://neon.tech/support

---

**End of Deployment Guide**
