# Milestone Review Interface - Architecture Diagram

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER INTERFACE                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────────┐         ┌──────────────────────────┐  │
│  │   Client View       │         │   Freelancer View        │  │
│  ├─────────────────────┤         ├──────────────────────────┤  │
│  │ • View submission   │         │ • Submit deliverables    │  │
│  │ • Approve           │         │ • View status            │  │
│  │ • Request changes   │         │ • See feedback           │  │
│  │ • Reject            │         │ • View history           │  │
│  │ • View history      │         │ • Resubmit               │  │
│  └─────────────────────┘         └──────────────────────────┘  │
│                                                                   │
└───────────────────────┬───────────────────────────────────────┘
                        │
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│                    COMPONENT LAYER                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  MilestoneReview Component                                │  │
│  │  • Props: milestone, userRole, onUpdate                   │  │
│  │  • State: dialogs, loading, history                       │  │
│  │  • Renders: details, actions, history timeline            │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  MilestoneSubmissionCard Component                        │  │
│  │  • Props: milestoneId, title, canSubmit                   │  │
│  │  • State: form data, loading                              │  │
│  │  • Renders: submission form, link inputs                  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  UI Components                                            │  │
│  │  • Collapsible, Separator, ScrollArea                     │  │
│  │  • AlertDialog, Card, Button, Badge                       │  │
│  │  • Toast notifications, Loading spinners                  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                   │
└───────────────────────┬───────────────────────────────────────┘
                        │
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│                       API LAYER                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  GET    /api/milestones/[id]                                    │
│  ├─ Auth: Required                                               │
│  ├─ Access: Client or Freelancer                                │
│  └─ Returns: Milestone details                                  │
│                                                                   │
│  POST   /api/milestones/[id]/submit                             │
│  ├─ Auth: Required                                               │
│  ├─ Access: Freelancer only                                     │
│  ├─ Body: { submission_notes, deliverable_links }              │
│  └─ Updates: Status → submitted, logs history                   │
│                                                                   │
│  POST   /api/milestones/[id]/approve                            │
│  ├─ Auth: Required                                               │
│  ├─ Access: Client only                                         │
│  ├─ Body: { action, rejection_reason }                         │
│  └─ Updates: Status → approved/rejected, logs history          │
│                                                                   │
│  POST   /api/milestones/[id]/request-changes                    │
│  ├─ Auth: Required                                               │
│  ├─ Access: Client only                                         │
│  ├─ Body: { revision_notes }                                    │
│  └─ Updates: Status → in_progress, logs history                │
│                                                                   │
│  GET    /api/milestones/[id]/history                            │
│  ├─ Auth: Required                                               │
│  ├─ Access: Client or Freelancer                                │
│  └─ Returns: Complete submission timeline                       │
│                                                                   │
└───────────────────────┬───────────────────────────────────────┘
                        │
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│                   MIDDLEWARE LAYER                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Authentication (withAuth)                                │  │
│  │  • Verifies JWT token                                     │  │
│  │  • Extracts wallet address                                │  │
│  │  • Returns 401 if invalid                                 │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Authorization                                            │  │
│  │  • Verifies user role (client/freelancer)                 │  │
│  │  • Checks contract membership                             │  │
│  │  • Validates milestone status                             │  │
│  │  • Returns 403 if unauthorized                            │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Validation                                               │  │
│  │  • Validates request body                                 │  │
│  │  • Checks required fields                                 │  │
│  │  • Sanitizes inputs                                       │  │
│  │  • Returns 400/422 if invalid                             │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                   │
└───────────────────────┬───────────────────────────────────────┘
                        │
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│                   SERVICE LAYER                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Activity Service                                         │  │
│  │  • Logs all milestone actions                             │  │
│  │  • Creates activity timeline                              │  │
│  │  • Tracks actor and metadata                              │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Notification Service                                     │  │
│  │  • Dispatches milestone notifications                     │  │
│  │  • Notifies clients of submissions                        │  │
│  │  • Notifies freelancers of reviews                        │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                   │
└───────────────────────┬───────────────────────────────────────┘
                        │
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│                   DATABASE LAYER                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  milestones                                               │  │
│  │  ├─ id, title, description, amount, currency              │  │
│  │  ├─ status, due_date, contract_id                         │  │
│  │  ├─ submission_notes, deliverables                        │  │
│  │  ├─ revision_requested, revision_count                    │  │
│  │  ├─ submitted_at, approved_at                             │  │
│  │  ├─ last_reviewed_at, last_reviewed_by                    │  │
│  │  └─ created_at, updated_at                                │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  milestone_submission_history                             │  │
│  │  ├─ id, milestone_id                                      │  │
│  │  ├─ submission_type (submitted/approved/rejected/...)     │  │
│  │  ├─ submitted_by, reviewed_by                             │  │
│  │  ├─ deliverable_notes, deliverable_links                  │  │
│  │  ├─ feedback, revision_notes                              │  │
│  │  ├─ metadata                                              │  │
│  │  └─ created_at                                            │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  contracts                                                │  │
│  │  ├─ id, client_id, freelancer_id                          │  │
│  │  └─ ... (existing fields)                                 │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  users                                                    │  │
│  │  ├─ id, wallet_address, name                              │  │
│  │  └─ ... (existing fields)                                 │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Diagrams

### Approval Flow

```
Client                  Frontend              API               Database
  │                        │                    │                   │
  │  Click "Approve"       │                    │                   │
  ├───────────────────────>│                    │                   │
  │                        │  POST /approve     │                   │
  │                        ├───────────────────>│                   │
  │                        │                    │  Verify auth      │
  │                        │                    │  Check role       │
  │                        │                    │  Validate status  │
  │                        │                    ├──────────────────>│
  │                        │                    │  UPDATE milestone │
  │                        │                    │  INSERT history   │
  │                        │                    │<──────────────────┤
  │                        │  {milestone}       │                   │
  │                        │<───────────────────┤                   │
  │  Show success          │                    │                   │
  │<───────────────────────┤                    │                   │
  │                        │                    │  Notify freelancer│
  │                        │                    ├──────────────────>│
```

### Request Changes Flow

```
Client                  Frontend              API               Database
  │                        │                    │                   │
  │  Click "Request        │                    │                   │
  │  Changes"              │                    │                   │
  ├───────────────────────>│                    │                   │
  │                        │                    │                   │
  │  Enter feedback        │                    │                   │
  ├───────────────────────>│                    │                   │
  │                        │                    │                   │
  │  Click "Send"          │                    │                   │
  ├───────────────────────>│                    │                   │
  │                        │  POST              │                   │
  │                        │  /request-changes  │                   │
  │                        ├───────────────────>│                   │
  │                        │                    │  Verify auth      │
  │                        │                    │  Check client     │
  │                        │                    │  Validate status  │
  │                        │                    ├──────────────────>│
  │                        │                    │  UPDATE milestone │
  │                        │                    │  - status→in_prog │
  │                        │                    │  - revision_flag  │
  │                        │                    │  - rev_count++    │
  │                        │                    │  INSERT history   │
  │                        │                    │<──────────────────┤
  │                        │  {milestone}       │                   │
  │                        │<───────────────────┤                   │
  │  Show success          │                    │                   │
  │<───────────────────────┤                    │                   │
  │                        │                    │  Notify freelancer│
  │                        │                    │  with feedback    │
  │                        │                    ├──────────────────>│
```

### Submission Flow

```
Freelancer              Frontend              API               Database
  │                        │                    │                   │
  │  Click "Submit"        │                    │                   │
  ├───────────────────────>│                    │                   │
  │                        │                    │                   │
  │  Add links & notes     │                    │                   │
  ├───────────────────────>│                    │                   │
  │                        │                    │                   │
  │  Click "Submit"        │                    │                   │
  ├───────────────────────>│                    │                   │
  │                        │  POST /submit      │                   │
  │                        ├───────────────────>│                   │
  │                        │                    │  Verify auth      │
  │                        │                    │  Check freelancer │
  │                        │                    │  Validate status  │
  │                        │                    ├──────────────────>│
  │                        │                    │  UPDATE milestone │
  │                        │                    │  - status→submit  │
  │                        │                    │  - submit_notes   │
  │                        │                    │  - deliverables   │
  │                        │                    │  INSERT history   │
  │                        │                    │<──────────────────┤
  │                        │  {milestone}       │                   │
  │                        │<───────────────────┤                   │
  │  Navigate to review    │                    │                   │
  │<───────────────────────┤                    │                   │
  │                        │                    │  Notify client    │
  │                        │                    ├──────────────────>│
```

---

## State Machine

### Milestone Status Transitions

```
                    ┌──────────┐
                    │ pending  │
                    └────┬─────┘
                         │
              ┌──────────▼─────────┐
              │   in_progress      │◄─────────┐
              └────┬───────────────┘          │
                   │                           │
        Submit     │                           │ Request
        ───────────┤                           │ Changes
                   │                           │
              ┌────▼────────┐                 │
              │  submitted  ├─────────────────┘
              └─┬─────────┬─┘
                │         │
     Approve    │         │    Reject
     ───────────┤         ├─────────────
                │         │
        ┌───────▼──┐  ┌───▼────────┐
        │ approved │  │  rejected  │
        └──────────┘  └────────────┘
             │
        ┌────▼────┐
        │  paid   │
        └─────────┘
```

### Detailed State Rules

```
pending
  ↓ (freelancer starts work)
in_progress
  ↓ (freelancer submits)
submitted
  ├─ (client approves) → approved → paid
  ├─ (client rejects) → rejected
  └─ (client requests changes) → in_progress
       ↓ (freelancer resubmits)
     submitted (cycle repeats)
```

---

## Component Hierarchy

```
MilestoneReviewPage
│
├─ Navigation (Back button)
│
├─ Header (Title, description)
│
├─ MilestoneSubmissionCard (if freelancer && can_submit)
│  ├─ AlertDialog
│  │  ├─ Link inputs (dynamic array)
│  │  ├─ Textarea (submission notes)
│  │  └─ Submit button
│  └─ Card (ready to submit message)
│
└─ MilestoneReview
   │
   ├─ Card (main container)
   │  │
   │  ├─ CardHeader
   │  │  ├─ Title
   │  │  ├─ Description
   │  │  └─ Status Badge
   │  │
   │  ├─ CardContent
   │  │  │
   │  │  ├─ Details Grid
   │  │  │  ├─ Amount
   │  │  │  ├─ Due Date
   │  │  │  └─ Submitted Date
   │  │  │
   │  │  ├─ Revision Alert (if revisions)
   │  │  │
   │  │  ├─ Submission Notes Section
   │  │  │
   │  │  ├─ Deliverables Section
   │  │  │  └─ Deliverable Items (with links)
   │  │  │
   │  │  └─ Collapsible (Submission History)
   │  │     └─ ScrollArea
   │  │        └─ History Timeline
   │  │           └─ History Entries (list)
   │  │
   │  └─ CardFooter (if client && submitted)
   │     ├─ Approve Button
   │     ├─ Request Changes Button
   │     └─ Reject Button
   │
   ├─ AlertDialog (Approve Confirmation)
   │
   ├─ AlertDialog (Request Changes)
   │  └─ Textarea (revision notes)
   │
   └─ AlertDialog (Reject Confirmation)
      └─ Textarea (rejection reason)
```

---

## Security Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Request Flow                           │
└─────────────────────────────────────────────────────────┘

Request
   ↓
┌──────────────────┐
│ JWT Token Check  │ ← Extract from cookie/header
└────────┬─────────┘
         │ Valid?
         ├─ No → 401 Unauthorized
         │
         ↓ Yes
┌──────────────────┐
│ User Lookup      │ ← Fetch user by wallet_address
└────────┬─────────┘
         │ Found?
         ├─ No → 404 User Not Found
         │
         ↓ Yes
┌──────────────────┐
│ Contract Check   │ ← Verify user in contract
└────────┬─────────┘
         │ Member?
         ├─ No → 403 Forbidden
         │
         ↓ Yes
┌──────────────────┐
│ Role Check       │ ← Verify client/freelancer
└────────┬─────────┘
         │ Correct role?
         ├─ No → 403 Forbidden
         │
         ↓ Yes
┌──────────────────┐
│ Status Check     │ ← Validate milestone status
└────────┬─────────┘
         │ Valid?
         ├─ No → 422 Invalid Status
         │
         ↓ Yes
┌──────────────────┐
│ Input Validation │ ← Sanitize & validate body
└────────┬─────────┘
         │ Valid?
         ├─ No → 400/422 Validation Error
         │
         ↓ Yes
┌──────────────────┐
│ Execute Action   │ ← Perform database operation
└────────┬─────────┘
         │
         ↓
┌──────────────────┐
│ Log Activity     │ ← Record in activity log
└────────┬─────────┘
         │
         ↓
┌──────────────────┐
│ Send Response    │ ← Return success/error
└──────────────────┘
```

---

## Deployment Architecture

```
┌──────────────────────────────────────────────────────────┐
│                      Production                          │
├──────────────────────────────────────────────────────────┤
│                                                           │
│   ┌───────────────────────────────────────────────┐     │
│   │  Load Balancer                                 │     │
│   └───────────┬───────────────────────────────────┘     │
│               │                                           │
│       ┌───────┴────────┐                                 │
│       ↓                ↓                                  │
│   ┌──────┐         ┌──────┐                             │
│   │ App  │         │ App  │  (Next.js instances)        │
│   │ Node │         │ Node │                              │
│   └───┬──┘         └───┬──┘                             │
│       │                │                                  │
│       └────────┬───────┘                                 │
│                ↓                                          │
│         ┌──────────────┐                                 │
│         │  Database    │  (PostgreSQL/Neon)             │
│         │  - milestones│                                 │
│         │  - history   │                                 │
│         └──────────────┘                                 │
│                                                           │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│                   External Services                       │
├──────────────────────────────────────────────────────────┤
│                                                           │
│   ┌─────────────────┐    ┌──────────────────┐          │
│   │  Notification   │    │  Activity Log     │          │
│   │  Service        │    │  Service          │          │
│   └─────────────────┘    └──────────────────┘          │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

---

This architecture provides a comprehensive view of how all components work together to deliver the milestone review feature with high reliability, security, and performance.
