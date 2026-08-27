# 🚀 Milestone Review Interface - Installation Checklist

## Prerequisites
- Node.js and npm installed
- Database connection configured
- Existing TaskChain application running

---

## 📋 Installation Steps

### 1. Install Missing Dependencies

```bash
# Install Radix UI Collapsible component
npm install @radix-ui/react-collapsible@1.1.2
```

> **Note**: `@radix-ui/react-scroll-area` and `@radix-ui/react-separator` are already installed.

### 2. Run Database Migration

```bash
# Run migrations to create new tables and columns
npm run migrate
```

**Expected Output:**
```
✓ Migration 008_milestone_submission_history.sql completed
✓ Table milestone_submission_history created
✓ Columns added to milestones table
```

**Verify Migration:**
```sql
-- Check if table exists
SELECT * FROM milestone_submission_history LIMIT 1;

-- Check new columns
SELECT submission_notes, revision_requested, revision_count 
FROM milestones LIMIT 1;
```

### 3. Verify File Structure

Ensure all new files are in place:

```bash
# Check API routes
ls app/api/milestones/[id]/request-changes/route.ts
ls app/api/milestones/[id]/history/route.ts

# Check components
ls components/dashboard/milestone-review.tsx
ls components/dashboard/milestone-submission-card.tsx
ls components/ui/collapsible.tsx
ls components/ui/separator.tsx
ls components/ui/scroll-area.tsx

# Check page
ls app/dashboard/milestones/[id]/page.tsx

# Check migrations
ls lib/db/migrations/008_milestone_submission_history.sql

# Check documentation
ls docs/milestone-review-interface.md
ls docs/milestone-review-quick-start.md
ls MILESTONE_REVIEW_FEATURE.md
```

### 4. Test the Installation

#### Manual Testing
```bash
# Start development server
npm run dev

# Navigate to:
http://localhost:3000/dashboard/milestones/[any-milestone-id]
```

#### Automated Testing
```bash
# Run test suite
npm run test

# Run specific test
npm run test milestone-review.test.tsx
```

### 5. Verify API Endpoints

Test each endpoint manually:

```bash
# Get milestone
curl -X GET http://localhost:3000/api/milestones/[id] \
  -H "Authorization: Bearer YOUR_TOKEN"

# Submit milestone (Freelancer)
curl -X POST http://localhost:3000/api/milestones/[id]/submit \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"submission_notes":"Test","deliverable_links":["https://test.com"]}'

# Approve milestone (Client)
curl -X POST http://localhost:3000/api/milestones/[id]/approve \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"action":"approve"}'

# Request changes (Client)
curl -X POST http://localhost:3000/api/milestones/[id]/request-changes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"revision_notes":"Please revise"}'

# Get history
curl -X GET http://localhost:3000/api/milestones/[id]/history \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## ✅ Verification Checklist

### Database
- [ ] Migration file exists: `lib/db/migrations/008_milestone_submission_history.sql`
- [ ] Migration ran successfully
- [ ] Table `milestone_submission_history` created
- [ ] Columns added to `milestones` table
- [ ] Indexes created successfully

### Dependencies
- [ ] `@radix-ui/react-collapsible` installed
- [ ] `@radix-ui/react-scroll-area` exists (already installed)
- [ ] `@radix-ui/react-separator` exists (already installed)
- [ ] No dependency conflicts

### API Endpoints
- [ ] `GET /api/milestones/[id]` returns milestone data
- [ ] `POST /api/milestones/[id]/submit` accepts submissions
- [ ] `POST /api/milestones/[id]/approve` processes approvals
- [ ] `POST /api/milestones/[id]/request-changes` creates revision requests
- [ ] `GET /api/milestones/[id]/history` returns history
- [ ] All endpoints return proper error codes
- [ ] Authentication required on all endpoints
- [ ] Role-based access control working

### UI Components
- [ ] `MilestoneReview` component renders
- [ ] `MilestoneSubmissionCard` component renders
- [ ] Status badges display correctly
- [ ] Action buttons appear for correct roles
- [ ] Dialogs open and close properly
- [ ] Loading states show correctly
- [ ] Error states display messages
- [ ] Toast notifications work

### Pages
- [ ] `/dashboard/milestones/[id]` page accessible
- [ ] Client view shows review actions
- [ ] Freelancer view shows submission card
- [ ] Navigation works correctly
- [ ] Back button functions
- [ ] Error page displays on failures

### Functionality
- [ ] Client can approve milestone
- [ ] Client can request changes
- [ ] Client can reject milestone
- [ ] Freelancer can submit milestone
- [ ] Freelancer sees revision alerts
- [ ] Submission history loads
- [ ] History entries display correctly
- [ ] Timestamps formatted properly
- [ ] Deliverables display correctly

### Responsive Design
- [ ] Desktop view (>1024px) works
- [ ] Tablet view (640-1024px) works
- [ ] Mobile view (<640px) works
- [ ] Buttons accessible on touch devices
- [ ] Text readable on all screen sizes
- [ ] No horizontal scrolling issues

### Accessibility
- [ ] Keyboard navigation works
- [ ] Screen reader compatible
- [ ] Focus management correct
- [ ] ARIA labels present
- [ ] Color contrast sufficient
- [ ] Semantic HTML used

### Security
- [ ] Authentication enforced
- [ ] Role-based access working
- [ ] SQL injection protected
- [ ] XSS protection in place
- [ ] Input validation working
- [ ] Error messages don't leak info

### Documentation
- [ ] `milestone-review-interface.md` complete
- [ ] `milestone-review-quick-start.md` available
- [ ] `MILESTONE_REVIEW_FEATURE.md` readable
- [ ] API documented
- [ ] Component props documented
- [ ] Database schema documented

### Testing
- [ ] Test file created: `__tests__/milestone-review.test.tsx`
- [ ] Tests pass: `npm run test`
- [ ] Manual testing completed
- [ ] Edge cases tested
- [ ] Error scenarios tested

---

## 🐛 Troubleshooting

### Issue: Migration Fails

**Symptoms:**
```
Error: relation "milestone_submission_history" already exists
```

**Solution:**
```sql
-- Check if table exists
SELECT * FROM milestone_submission_history;

-- If it exists but has issues, drop and re-run
DROP TABLE IF EXISTS milestone_submission_history CASCADE;

-- Re-run migration
npm run migrate
```

### Issue: Missing Dependency

**Symptoms:**
```
Module not found: Can't resolve '@radix-ui/react-collapsible'
```

**Solution:**
```bash
npm install @radix-ui/react-collapsible@1.1.2
npm run dev
```

### Issue: API Returns 404

**Symptoms:**
```
404 Not Found for /api/milestones/[id]/history
```

**Solution:**
1. Verify file exists: `app/api/milestones/[id]/history/route.ts`
2. Restart dev server: `npm run dev`
3. Check for TypeScript errors: `npm run build`

### Issue: Database Connection Error

**Symptoms:**
```
Error: DATABASE_URL environment variable is not set
```

**Solution:**
```bash
# Check .env file exists
cat .env

# Verify DATABASE_URL is set
grep DATABASE_URL .env

# Copy from example if missing
cp env.example .env
# Then edit .env with your database credentials
```

### Issue: Component Not Rendering

**Symptoms:**
- Blank page
- "Component is not defined" error

**Solution:**
1. Check imports are correct
2. Verify component file exists
3. Clear Next.js cache:
```bash
rm -rf .next
npm run dev
```

### Issue: Tests Failing

**Symptoms:**
```
Test suite failed to run
```

**Solution:**
```bash
# Install test dependencies
npm install --save-dev @testing-library/react @testing-library/jest-dom vitest jsdom

# Clear test cache
npm run test -- --clearCache

# Run tests again
npm run test
```

---

## 🎯 Post-Installation

### 1. Configure Notifications
Ensure notification system is set up for:
- Milestone submitted
- Milestone approved
- Milestone rejected
- Revisions requested

### 2. Update Navigation
Add links to milestone review in:
- Dashboard contract cards
- Freelancer milestone list
- Client project views

### 3. Monitor Performance
Set up monitoring for:
- API endpoint response times
- Database query performance
- User interaction metrics

### 4. Train Users
Provide documentation to:
- Clients on how to review submissions
- Freelancers on how to submit work
- Both on submission history

---

## 📊 Verification Commands

```bash
# Check all files exist
find . -name "milestone-review*" -o -name "milestone-submission*"

# Count new API routes
find app/api/milestones -name "route.ts" | wc -l

# Check database tables
psql $DATABASE_URL -c "\dt milestone*"

# Test build
npm run build

# Check for errors
npm run lint
```

---

## ✨ Success Criteria

Your installation is complete when:

1. ✅ All dependencies installed
2. ✅ Database migration successful
3. ✅ All API endpoints working
4. ✅ UI components rendering correctly
5. ✅ Tests passing
6. ✅ Client can approve/reject/request changes
7. ✅ Freelancer can submit milestones
8. ✅ History tracking working
9. ✅ Responsive on all devices
10. ✅ No console errors

---

## 🎉 Next Steps

After successful installation:

1. **Deploy to staging** for QA testing
2. **Gather user feedback** from beta testers
3. **Monitor metrics** for adoption and issues
4. **Plan enhancements** based on usage
5. **Update user documentation** as needed

---

## 📞 Support

If you encounter issues not covered here:

1. Check the comprehensive documentation: `docs/milestone-review-interface.md`
2. Review the quick start guide: `docs/milestone-review-quick-start.md`
3. Check console logs for error details
4. Verify all environment variables are set
5. Ensure database connection is working

---

**Installation Guide Version 1.0.0**  
*Last Updated: August 2026*
