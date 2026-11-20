"use client"

import * as React from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { format } from "date-fns"
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  FolderOpen,
  Filter,
  FileSearch,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock,
  AlertTriangle,
  History,
  FileText,
  Link as LinkIcon,
  HardDrive,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ScrollArea,
} from "@/components/ui/scroll-area"
import { WorkspaceFileCard, type WorkspaceFile } from "@/components/dashboard/workspace-file-card"

// ─── Types ─────────────────────────────────────────────────────────────────

interface SubmissionHistoryEntry {
  id: string
  submission_type: "submitted" | "approved" | "rejected" | "revision_requested"
  deliverable_notes: string | null
  deliverable_links: string[] | null
  feedback: string | null
  revision_notes: string | null
  created_at: string
  submitter: {
    display_name: string | null
    username: string | null
  }
}

interface MilestoneWithFiles {
  id: string
  title: string
  description: string | null
  status: string
  sort_order: number
  due_date: string | null
  amount: string
  currency: string
  submitted_at: string | null
  approved_at: string | null
  files: WorkspaceFile[]
  submission_history: SubmissionHistoryEntry[]
}

interface WorkspaceData {
  contract: {
    id: string
    status: string
    project_title: string
    total_amount: string
    currency: string
    client: { name: string | null; username: string }
    freelancer: { name: string | null; username: string } | null
  }
  milestones: MilestoneWithFiles[]
  total_files: number
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function getAuthHeaders(): Record<string, string> {
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("tc_dev_access_token")
      : null
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function getAuthToken(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem("tc_dev_access_token")
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

const milestoneStatusConfig: Record<
  string,
  { label: string; color: string; icon: React.ElementType }
> = {
  pending: {
    label: "Pending",
    color: "bg-muted text-muted-foreground border-muted",
    icon: Clock,
  },
  in_progress: {
    label: "In Progress",
    color: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    icon: Clock,
  },
  submitted: {
    label: "Awaiting Review",
    color: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    icon: AlertTriangle,
  },
  approved: {
    label: "Approved",
    color: "bg-green-500/10 text-green-500 border-green-500/20",
    icon: CheckCircle2,
  },
  rejected: {
    label: "Rejected",
    color: "bg-destructive/10 text-destructive border-destructive/20",
    icon: AlertCircle,
  },
  paid: {
    label: "Paid",
    color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    icon: CheckCircle2,
  },
}

const historyTypeConfig: Record<
  string,
  { label: string; color: string; icon: React.ElementType }
> = {
  submitted: { label: "Submitted", color: "text-blue-500", icon: FileText },
  approved: { label: "Approved", color: "text-green-500", icon: CheckCircle2 },
  rejected: { label: "Rejected", color: "text-destructive", icon: AlertCircle },
  revision_requested: {
    label: "Revision Requested",
    color: "text-amber-500",
    icon: AlertTriangle,
  },
}

// ─── Submission History Panel ──────────────────────────────────────────────

function SubmissionHistory({
  history,
}: {
  history: SubmissionHistoryEntry[]
}) {
  const [open, setOpen] = React.useState(false)

  if (history.length === 0) return null

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-between text-muted-foreground h-8 px-3 mt-2"
        >
          <span className="flex items-center gap-1.5">
            <History className="h-3.5 w-3.5" />
            Version history ({history.length})
          </span>
          {open ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <ScrollArea className="mt-2 max-h-64 rounded-lg border border-border/30 bg-muted/20 p-3">
          <div className="space-y-3">
            {history.map((entry, idx) => {
              const cfg = historyTypeConfig[entry.submission_type] ?? historyTypeConfig.submitted
              const Icon = cfg.icon
              const isLatest = idx === 0
              return (
                <div
                  key={entry.id}
                  className="flex gap-3 pb-3 border-b border-border/30 last:border-0 last:pb-0"
                >
                  <div className="mt-0.5 shrink-0">
                    <Icon className={`h-4 w-4 ${cfg.color}`} />
                  </div>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-semibold ${cfg.color}`}>
                        {cfg.label}
                      </span>
                      {isLatest && (
                        <Badge
                          variant="outline"
                          className="text-[9px] px-1 py-0 h-4 border-primary/30 text-primary"
                        >
                          Latest
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground ml-auto">
                        {format(new Date(entry.created_at), "MMM d, yyyy 'at' h:mm a")}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      by{" "}
                      {entry.submitter.display_name ??
                        `@${entry.submitter.username ?? "unknown"}`}
                    </p>
                    {entry.deliverable_notes && (
                      <p className="text-xs bg-muted/50 px-2 py-1 rounded mt-1">
                        {entry.deliverable_notes}
                      </p>
                    )}
                    {entry.deliverable_links && entry.deliverable_links.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {entry.deliverable_links.map((link, i) => (
                          <a
                            key={i}
                            href={link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-[11px] text-primary underline underline-offset-2"
                          >
                            <LinkIcon className="h-3 w-3" />
                            Link {i + 1}
                          </a>
                        ))}
                      </div>
                    )}
                    {entry.revision_notes && (
                      <p className="text-xs bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded mt-1">
                        <span className="font-semibold text-amber-600 dark:text-amber-400">
                          Revision:{" "}
                        </span>
                        {entry.revision_notes}
                      </p>
                    )}
                    {entry.feedback && (
                      <p className="text-xs bg-muted/50 px-2 py-1 rounded mt-1">
                        <span className="font-semibold">Feedback: </span>
                        {entry.feedback}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </ScrollArea>
      </CollapsibleContent>
    </Collapsible>
  )
}

// ─── Milestone Section ────────────────────────────────────────────────────

function MilestoneSection({
  milestone,
  contractId,
  authToken,
  defaultOpen,
}: {
  milestone: MilestoneWithFiles
  contractId: string
  authToken: string | null
  defaultOpen: boolean
}) {
  const [open, setOpen] = React.useState(defaultOpen)
  const cfg = milestoneStatusConfig[milestone.status] ?? milestoneStatusConfig.pending
  const StatusIcon = cfg.icon

  return (
    <Card className="bg-card/50 border-border/40">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between p-5 cursor-pointer select-none hover:bg-muted/20 transition-colors rounded-t-xl group">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {/* Number badge */}
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                {milestone.sort_order + 1}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-sm truncate">{milestone.title}</h3>
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-1.5 py-0 shrink-0 ${cfg.color}`}
                  >
                    <StatusIcon className="h-3 w-3 mr-1" />
                    {cfg.label}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                  <span>
                    {parseFloat(milestone.amount).toLocaleString()} {milestone.currency}
                  </span>
                  {milestone.due_date && (
                    <span>Due {format(new Date(milestone.due_date), "MMM d, yyyy")}</span>
                  )}
                  <span className="flex items-center gap-1">
                    <HardDrive className="h-3 w-3" />
                    {milestone.files.length}{" "}
                    {milestone.files.length === 1 ? "file" : "files"}
                  </span>
                </div>
              </div>
            </div>

            <div className="ml-4 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors">
              {open ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </div>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-5 pb-5 space-y-4 border-t border-border/40 pt-4">
            {/* Description */}
            {milestone.description && (
              <p className="text-sm text-muted-foreground">{milestone.description}</p>
            )}

            {/* Files */}
            {milestone.files.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
                <FileSearch className="h-8 w-8 opacity-40" />
                <p className="text-sm">No files uploaded for this milestone.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {milestone.files.map((file) => (
                  <WorkspaceFileCard
                    key={file.id}
                    file={file}
                    contractId={contractId}
                    authToken={authToken}
                  />
                ))}
              </div>
            )}

            {/* Version / submission history */}
            <SubmissionHistory history={milestone.submission_history} />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function WorkspacePage() {
  const { id: contractId } = useParams<{ id: string }>()
  const [data, setData] = React.useState<WorkspaceData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [filterMilestone, setFilterMilestone] = React.useState<string>("all")
  const [authToken] = React.useState<string | null>(getAuthToken)

  React.useEffect(() => {
    if (!contractId) return
    ;(async () => {
      try {
        const res = await fetch(`/api/contracts/${contractId}/workspace`, {
          headers: getAuthHeaders(),
          credentials: "include",
        })
        if (res.status === 403) {
          setError("You don't have permission to access this workspace.")
          return
        }
        if (res.status === 404) {
          setError("Contract not found.")
          return
        }
        if (!res.ok) {
          setError("Failed to load workspace data.")
          return
        }
        const json = await res.json()
        setData(json)
      } catch {
        setError("An unexpected error occurred while loading the workspace.")
      } finally {
        setLoading(false)
      }
    })()
  }, [contractId])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading workspace…
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <p className="text-muted-foreground text-center max-w-sm">
          {error ?? "Workspace could not be loaded."}
        </p>
        <Link href={`/dashboard/contracts/${contractId}`}>
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Contract
          </Button>
        </Link>
      </div>
    )
  }

  const { contract, milestones, total_files } = data

  // Filtered + sorted milestones
  const visibleMilestones =
    filterMilestone === "all"
      ? milestones
      : milestones.filter((m) => m.id === filterMilestone)

  // Summary stats
  const totalSize = milestones
    .flatMap((m) => m.files)
    .reduce((sum, f) => sum + (f.file_size ?? 0), 0)

  const milestonesWithFiles = milestones.filter((m) => m.files.length > 0).length

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-8">
      {/* ── Header ── */}
      <div className="flex items-start gap-4">
        <Link href={`/dashboard/contracts/${contractId}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold">Project Workspace</h1>
            <Badge
              variant="outline"
              className="text-xs capitalize border-border/60 text-muted-foreground"
            >
              {contract.status.replace("_", " ")}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1 truncate">
            {contract.project_title}
          </p>
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 bg-card/50 border-border/40 space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Files</p>
          <p className="text-2xl font-bold">{total_files}</p>
        </Card>
        <Card className="p-4 bg-card/50 border-border/40 space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Size</p>
          <p className="text-2xl font-bold">{formatBytes(totalSize)}</p>
        </Card>
        <Card className="p-4 bg-card/50 border-border/40 space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Milestones</p>
          <p className="text-2xl font-bold">
            {milestonesWithFiles}/{milestones.length}
          </p>
          <p className="text-[10px] text-muted-foreground">with files</p>
        </Card>
        <Card className="p-4 bg-card/50 border-border/40 space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Contract Value</p>
          <p className="text-2xl font-bold">
            {parseFloat(contract.total_amount).toLocaleString()}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              {contract.currency}
            </span>
          </p>
        </Card>
      </div>

      {/* ── Filter ── */}
      {milestones.length > 1 && (
        <div className="flex items-center gap-3">
          <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
          <Select value={filterMilestone} onValueChange={setFilterMilestone}>
            <SelectTrigger className="w-56 h-9 text-sm bg-card/50 border-border/40">
              <SelectValue placeholder="Filter by milestone" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All milestones</SelectItem>
              {milestones.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.title}
                  {m.files.length > 0 && (
                    <span className="ml-1.5 text-muted-foreground text-xs">
                      ({m.files.length})
                    </span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filterMilestone !== "all" && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 text-xs"
              onClick={() => setFilterMilestone("all")}
            >
              Clear filter
            </Button>
          )}
        </div>
      )}

      {/* ── Milestone sections ── */}
      {milestones.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-muted-foreground">
          <FolderOpen className="h-14 w-14 opacity-30" />
          <p className="text-lg font-medium">No milestones yet</p>
          <p className="text-sm max-w-xs text-center">
            Milestones and their files will appear here once they are created for this contract.
          </p>
        </div>
      ) : visibleMilestones.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
          <FileSearch className="h-12 w-12 opacity-30" />
          <p className="text-sm">No milestones match the current filter.</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFilterMilestone("all")}
          >
            Clear filter
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {visibleMilestones.map((milestone, idx) => (
            <MilestoneSection
              key={milestone.id}
              milestone={milestone}
              contractId={contractId}
              authToken={authToken}
              defaultOpen={idx === 0}
            />
          ))}
        </div>
      )}
    </div>
  )
}
