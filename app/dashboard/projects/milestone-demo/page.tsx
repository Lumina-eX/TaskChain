"use client";

import Link from "next/link";
import { ArrowLeft, Sparkles, ShieldCheck, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MilestoneProgressTracker, type Milestone } from "@/components/dashboard/milestone-progress-tracker";

// Comprehensive mock data covering all states
const initialMockMilestones: Milestone[] = [
  {
    id: "demo-m1",
    title: "1. Smart Contract Architecture & Escrow Hooks",
    description: "Design and implement the core Soroban smart contracts for trustless multi-party escrow, dynamic fees computation, and cryptographic payouts release hooks. Completed after initial security validation.",
    amount: 3500.00,
    currency: "USDC",
    due_date: "2026-05-10",
    status: "paid",
    deliverables: [
      "Escrow Soroban Contract compiled on Rust",
      "Automated unit testing suite (98% coverage)",
      "Testnet deployment and anchoring transactions record"
    ],
    submitted_at: "2026-05-08T14:32:00Z",
    approved_at: "2026-05-09T10:15:00Z",
    paid_at: "2026-05-10T09:00:00Z"
  },
  {
    id: "demo-m2",
    title: "2. UI/UX Dashboard Integration & Themes",
    description: "Build a highly responsive dark-themed dashboard frontend with glassmorphism components, detailed state management (using custom hooks), and dynamic performance metrics charting. Fully validated by designers.",
    amount: 2500.00,
    currency: "USDC",
    due_date: "2026-05-20",
    status: "approved",
    deliverables: [
      "Responsive React elements matching Figma wireframes",
      "Client/Freelancer contextual dashboards layout",
      "Sleek light/dark theme toggle hook integration"
    ],
    submitted_at: "2026-05-19T18:00:00Z",
    approved_at: "2026-05-20T11:45:00Z"
  },
  {
    id: "demo-m3",
    title: "3. Stellar SDK freighter Wallet Connection",
    description: "Implement secure browser-extension wallet auth using @stellar/freighter-api, signature authentication of user payloads on dynamic requests, and instant state retrieval for on-chain balances.",
    amount: 1800.00,
    currency: "USDC",
    due_date: "2026-05-28",
    status: "submitted",
    deliverables: [
      "Freighter API connect button & wallet session persistence",
      "Cryptographic signing helper methods for client payloads",
      "Balance synchronization with Stellar Testnet nodes"
    ],
    submitted_at: "2026-05-27T22:30:00Z"
  },
  {
    id: "demo-m4",
    title: "4. Stress Testing, Security Auditing & QA",
    description: "Conduct thorough load testing of API endpoints, test contract resilience against common attack vectors (reentrancy, overflow, auth bypass), and compile a detailed cryptographic security clearance report.",
    amount: 1200.00,
    currency: "USDC",
    due_date: "2026-06-15",
    status: "in_progress",
    deliverables: [
      "Resilience testing audit against reentrancy vectors",
      "10k concurrent simulated requests benchmark report",
      "Cryptographic security audit certification document"
    ]
  },
  {
    id: "demo-m5",
    title: "5. Production Deployment & Live Verification",
    description: "Anchor finalized smart contracts on Stellar Mainnet, release verified source code to public blockchain explorers, and configure production monitoring dashboard to trace live transactions stream.",
    amount: 1000.00,
    currency: "USDC",
    due_date: "2026-06-30",
    status: "pending",
    deliverables: [
      "Mainnet smart contracts anchoring setup",
      "Verified source code publication on explorer",
      "Live transactional alerts monitoring system"
    ]
  }
];

export default function MilestoneDemoPage() {
  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      {/* Back button and title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <Link href="/dashboard/projects">
            <Button variant="ghost" size="icon" className="hover:bg-muted/30">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-extrabold text-foreground tracking-tight">
                Milestone Tracker Sandbox
              </h1>
              <Sparkles className="h-5 w-5 text-primary animate-pulse" />
            </div>
            <p className="text-muted-foreground mt-1">
              Interactive playground showcasing TaskChain's premium, responsive Web3 milestone stepper & Kanban board.
            </p>
          </div>
        </div>
      </div>

      {/* Guide Banner */}
      <Card className="p-4 bg-primary/5 border border-primary/20 backdrop-blur-sm rounded-xl flex items-start gap-3">
        <ShieldCheck className="h-6 w-6 text-primary shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h4 className="font-bold text-sm text-foreground">Interactive Demo Mode Active</h4>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Use the buttons below to switch viewports (Cards, Stepper, or Kanban). Toggle <strong>Enable Sandbox</strong> to simulate transitioning a milestone through its 5-state Web3 escrow lifecycle: 
            <span className="font-semibold text-foreground px-1">Pending</span> ➔ 
            <span className="font-semibold text-indigo-400 px-1">In Progress</span> ➔ 
            <span className="font-semibold text-amber-400 px-1">Submitted</span> ➔ 
            <span className="font-semibold text-emerald-400 px-1">Approved</span> ➔ 
            <span className="font-semibold text-violet-400 px-1">Paid</span>.
          </p>
        </div>
      </Card>

      {/* Main Component Rendered in interactive sandbox */}
      <div className="space-y-4">
        <div className="flex items-center gap-1.5 px-1">
          <HelpCircle className="h-4.5 w-4.5 text-muted-foreground" />
          <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
            Milestone Progress Component View
          </h3>
        </div>
        
        <MilestoneProgressTracker
          milestones={initialMockMilestones}
          userRole="client"
          contractAddress="C_STELLAR_ESCROW_DUMMY_37A9F4"
        />
      </div>

      {/* Instructional Walkthrough footer */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
        <Card className="p-5 bg-card/20 border-border/40 space-y-2">
          <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-indigo-500" />
            1. Initiation (Freelancer)
          </h4>
          <p className="text-xs text-muted-foreground leading-relaxed">
            The milestone starts as <strong>Pending</strong>. Once the freelancer is ready to execute work, they click <strong>Start Milestone</strong> which flags it as <strong>In Progress</strong>.
          </p>
        </Card>
        
        <Card className="p-5 bg-card/20 border-border/40 space-y-2">
          <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            2. Submission & Review
          </h4>
          <p className="text-xs text-muted-foreground leading-relaxed">
            When deliverables are ready, the freelancer uploads files and clicks <strong>Submit Deliverables</strong>. The state becomes <strong>Submitted</strong>, alerting the client to audit the work.
          </p>
        </Card>
        
        <Card className="p-5 bg-card/20 border-border/40 space-y-2">
          <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-violet-500" />
            3. Approval & Blockchain Payout
          </h4>
          <p className="text-xs text-muted-foreground leading-relaxed">
            The client reviews work and clicks <strong>Approve</strong>. Once satisfied, they select <strong>Release Escrow Payout</strong> which invokes Soroban smart contracts, marking it as <strong>Paid</strong>.
          </p>
        </Card>
      </div>
    </div>
  );
}
