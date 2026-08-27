"use client"

import * as React from "react"
import { format } from "date-fns"
import {
  CheckCircle2,
  XCircle,
  FileText,
  Link as LinkIcon,
  Clock,
  AlertCircle,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Loader2,
  Download,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { toast } from "sonner"

export interface Milestone {
  id: string
  title: string
  description: string | null
  amount: string
  currency: string
  status: string
  due_date: string | null
  submitted_at: string | null
  approved_at: string | null
  submission_notes: string | null
  deliverables: string[] | null
  revision_requested: boolean
  revision_count: number
  contract_id: string
  freelancer_id: string
  client_id: string
}

export interface SubmissionHistoryEntry {
  id: string
  submission_type: 'submitted' | 'approved' | 'rejected' | 'revision_requested'
  submitter_name: string
  submitter_wallet: string
  reviewer_name: string | null
  reviewer_wallet: string | null
  deliverable_notes: string | null
  deliverable_links: string[] | null
  feedback: string | null
  revision_notes: string | null
  created_at: string
}

interface MilestoneReviewProps {
  milestone: Milestone
  userRole: 'client' | 'freelancer'
  onUpdate?: () => void
}

const statusConfig: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  pending: { label: "Pending", color: "bg-gray-500/10 text-gray-500", icon: AlertCircle },
  in_progress: { label: "In Progress", color: "bg-blue-500/10 text-blue-500", icon: Clock },
  submitted: { label: "Awaiting Review", color: "bg-amber-500/10 text-amber-500", icon: Clock },
  approved: { label: "Approved", color: "bg-green-500/10 text-green-500", icon: CheckCircle2 },
  rejected: { label: "Rejected", color: "bg-red-500/10 text-red-500", icon: XCircle },
  paid: { label: "Paid", color: "bg-emerald-500/10 text-emerald-500", icon: CheckCircle2 },
}

export function MilestoneReview({ milestone, userRole, onUpdate }: MilestoneReviewProps) {
  const [isApproving, setIsApproving] = React.useState(false)
  const [isRejecting, setIsRejecting] = React.useState(false)
  const [isRequestingChanges, setIsRequestingChanges] = React.useState(false)
  const [showApproveDialog, setShowApproveDialog] = React.useState(false)
  const [showRejectDialog, setShowRejectDialog] = React.useState(false)
  const [showChangesDialog, setShowChangesDialog] = React.useState(false)
  const [rejectionReason, setRejectionReason] = React.useState("")
  const [revisionNotes, setRevisionNotes] = React.useState("")
  const [history, setHistory] = React.useState<SubmissionHistoryEntry[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = React.useState(false)
  const [historyExpanded, setHistoryExpanded] = React.useState(false)

  const config = statusConfig[milestone.status] || statusConfig.pending
  const Icon = config.icon

  const isSubmitted = milestone.status === 'submitted'
  const isClient = userRole === 'client'
  const canReview = isClient && isSubmitted

  // Load submission history
  const loadHistory = React.useCallback(async () => {
    if (historyExpanded && history.length === 0) {
      setIsLoadingHistory(true)
      try {
        const response = await fetch(`/api/milestones/${milestone.id}/history`)
        if (response.ok) {
          const data = await response.json()
          setHistory(data.history || [])
        } else {
          toast.error("Failed to load submission history")
        }
      } catch {
        toast.error("Error loading submission history")
      } finally {
        setIsLoadingHistory(false)
      }
    }
  }, [milestone.id, historyExpanded, history.length])

  React.useEffect(() => {
    loadHistory()
  }, [loadHistory])

  const handleApprove = async () => {
    setIsApproving(true)
    try {
      const response = await fetch(`/api/milestones/${milestone.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      })

      if (response.ok) {
        toast.success("Milestone approved successfully!")
        setShowApproveDialog(false)
        onUpdate?.()
      } else {
        const data = await response.json()
        toast.error(data.error || "Failed to approve milestone")
      }
    } catch {
      toast.error("Error approving milestone")
    } finally {
      setIsApproving(false)
    }
  }

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      toast.error("Please provide a reason for rejection")
      return
    }

    setIsRejecting(true)
    try {
      const response = await fetch(`/api/milestones/${milestone.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'reject',
          rejection_reason: rejectionReason 
        }),
      })

      if (response.ok) {
        toast.success("Milestone rejected")
        setShowRejectDialog(false)
        setRejectionReason("")
        onUpdate?.()
      } else {
        const data = await response.json()
        toast.error(data.error || "Failed to reject milestone")
      }
    } catch {
      toast.error("Error rejecting milestone")
    } finally {
      setIsRejecting(false)
    }
  }

  const handleRequestChanges = async () => {
    if (!revisionNotes.trim()) {
      toast.error("Please provide revision notes")
      return
    }

    setIsRequestingChanges(true)
    try {
      const response = await fetch(`/api/milestones/${milestone.id}/request-changes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision_notes: revisionNotes }),
      })

      if (response.ok) {
        toast.success("Revision request sent to freelancer")
        setShowChangesDialog(false)
        setRevisionNotes("")
        onUpdate?.()
      } else {
        const data = await response.json()
        toast.error(data.error || "Failed to request changes")
      }
    } catch {
      toast.error("Error requesting changes")
    } finally {
      setIsRequestingChanges(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card className="border-border/40 bg-card/95">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-1 flex-1">
              <CardTitle className="text-2xl">{milestone.title}</CardTitle>
              <CardDescription>
                {milestone.description || "No description provided"}
              </CardDescription>
            </div>
            <Badge className={config.color} variant="secondary">
              <Icon className="mr-1.5 h-3.5 w-3.5" />
              {config.label}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Milestone Details */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Amount</p>
              <p className="text-2xl font-bold">
                ${parseFloat(milestone.amount).toLocaleString()} {milestone.currency}
              </p>
            </div>
            
            {milestone.due_date && (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Due Date</p>
                <p className="text-lg font-semibold">
                  {format(new Date(milestone.due_date), "PPP")}
                </p>
              </div>
            )}

            {milestone.submitted_at && (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Submitted</p>
                <p className="text-lg font-semibold">
                  {format(new Date(milestone.submitted_at), "PPP 'at' p")}
                </p>
              </div>
            )}
          </div>

          {milestone.revision_count > 0 && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              <p className="text-sm text-amber-600 dark:text-amber-400">
                Revisions requested {milestone.revision_count} time{milestone.revision_count !== 1 ? 's' : ''}
              </p>
            </div>
          )}

          {/* Submission Details */}
          {isSubmitted && milestone.submission_notes && (
            <>
              <Separator />
              <div className="space-y-3">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Submission Notes
                </h3>
                <p className="text-sm text-muted-foreground bg-muted/50 p-4 rounded-lg">
                  {milestone.submission_notes}
                </p>
              </div>
            </>
          )}

          {/* Deliverables */}
          {milestone.deliverables && milestone.deliverables.length > 0 && (
            <>
              <Separator />
              <div className="space-y-3">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Deliverables ({milestone.deliverables.length})
                </h3>
                <div className="space-y-2">
                  {milestone.deliverables.map((deliverable, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 rounded-lg border border-border/40 bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {deliverable.startsWith('http') ? (
                          <LinkIcon className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <FileText className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="text-sm font-medium">{deliverable}</span>
                      </div>
                      {deliverable.startsWith('http') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          asChild
                        >
                          <a
                            href={deliverable}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2"
                          >
                            Open <LinkIcon className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Submission History */}
          <Separator />
          <Collapsible open={historyExpanded} onOpenChange={setHistoryExpanded}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Submission History
                </span>
                {historyExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-4">
              {isLoadingHistory ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : history.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No submission history yet
                </p>
              ) : (
                <ScrollArea className="h-[300px] rounded-lg border border-border/40 p-4">
                  <div className="space-y-4">
                    {history.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex gap-4 pb-4 border-b border-border/40 last:border-0 last:pb-0"
                      >
                        <div className="mt-1">
                          {entry.submission_type === 'approved' ? (
                            <CheckCircle2 className="h-5 w-5 text-green-500" />
                          ) : entry.submission_type === 'rejected' ? (
                            <XCircle className="h-5 w-5 text-red-500" />
                          ) : entry.submission_type === 'revision_requested' ? (
                            <AlertCircle className="h-5 w-5 text-amber-500" />
                          ) : (
                            <FileText className="h-5 w-5 text-blue-500" />
                          )}
                        </div>
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold capitalize">
                              {entry.submission_type.replace('_', ' ')}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(entry.created_at), "MMM d, yyyy 'at' h:mm a")}
                            </p>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            by {entry.submitter_name || entry.submitter_wallet.slice(0, 8)}...
                          </p>
                          {entry.deliverable_notes && (
                            <p className="text-sm mt-2 bg-muted/50 p-2 rounded">
                              {entry.deliverable_notes}
                            </p>
                          )}
                          {entry.revision_notes && (
                            <p className="text-sm mt-2 bg-amber-500/10 p-2 rounded border border-amber-500/20">
                              <span className="font-semibold">Revision requested:</span> {entry.revision_notes}
                            </p>
                          )}
                          {entry.feedback && (
                            <p className="text-sm mt-2 bg-muted/50 p-2 rounded">
                              <span className="font-semibold">Feedback:</span> {entry.feedback}
                            </p>
                          )}
                          {entry.reviewer_name && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Reviewed by {entry.reviewer_name}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CollapsibleContent>
          </Collapsible>
        </CardContent>

        {canReview && (
          <CardFooter className="flex gap-3 border-t border-border/40 pt-6">
            <Button
              onClick={() => setShowApproveDialog(true)}
              className="flex-1"
              size="lg"
            >
              <CheckCircle2 className="mr-2 h-5 w-5" />
              Approve Milestone
            </Button>
            <Button
              onClick={() => setShowChangesDialog(true)}
              variant="outline"
              className="flex-1"
              size="lg"
            >
              <MessageSquare className="mr-2 h-5 w-5" />
              Request Changes
            </Button>
            <Button
              onClick={() => setShowRejectDialog(true)}
              variant="destructive"
              size="lg"
            >
              <XCircle className="mr-2 h-5 w-5" />
              Reject
            </Button>
          </CardFooter>
        )}

        {!isClient && milestone.status === 'in_progress' && milestone.revision_requested && (
          <CardFooter className="border-t border-border/40 pt-6">
            <div className="w-full space-y-3">
              <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                    Revisions Requested
                  </p>
                  <p className="text-sm text-amber-600/80 dark:text-amber-400/80 mt-1">
                    The client has requested changes. Please review the feedback and resubmit.
                  </p>
                </div>
              </div>
            </div>
          </CardFooter>
        )}
      </Card>

      {/* Approve Dialog */}
      <AlertDialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve this milestone?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the milestone as approved and notify the freelancer. The payment
              will be released from escrow according to the contract terms.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleApprove} disabled={isApproving}>
              {isApproving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Approval
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Request Changes Dialog */}
      <AlertDialog open={showChangesDialog} onOpenChange={setShowChangesDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Request Changes</AlertDialogTitle>
            <AlertDialogDescription>
              Provide specific feedback on what needs to be revised. The milestone will be
              moved back to &quot;In Progress&quot; status.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Textarea
              placeholder="Describe the changes you'd like to see..."
              value={revisionNotes}
              onChange={(e) => setRevisionNotes(e.target.value)}
              rows={5}
              className="resize-none"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRequestChanges} disabled={isRequestingChanges || !revisionNotes.trim()}>
              {isRequestingChanges && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send Request
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject Dialog */}
      <AlertDialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject this milestone?</AlertDialogTitle>
            <AlertDialogDescription>
              This is a serious action. Please provide a detailed reason for rejection.
              This may trigger a dispute resolution process.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Textarea
              placeholder="Provide a detailed reason for rejection..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              rows={5}
              className="resize-none"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReject}
              disabled={isRejecting || !rejectionReason.trim()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isRejecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Rejection
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
