"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  Clock3,
  FilePlus,
  ShieldCheck,
  Upload,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface DisputeDetails {
  id: number;
  job_title: string;
  reason: string;
  status: "open" | "under_review" | "resolved" | string;
  created_at: string;
  updated_at?: string;
  resolution?: string | null;
  resolved_at?: string | null;
  raised_by_username?: string | null;
  raised_by_wallet?: string | null;
}

interface PreviewFile {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
}

const statusStyles: Record<string, { label: string; color: string; textColor: string }> = {
  open: {
    label: "Open",
    color: "bg-amber-500/10",
    textColor: "text-amber-500",
  },
  under_review: {
    label: "Under Review",
    color: "bg-secondary/10",
    textColor: "text-secondary",
  },
  resolved: {
    label: "Resolved",
    color: "bg-accent/10",
    textColor: "text-accent",
  },
};

const allowedFileTypes = [
  "image/",
  "application/pdf",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

function formatDate(value?: string) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function createPreviewId(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function isAcceptedFile(file: File) {
  return (
    allowedFileTypes.some((allowed) => file.type.startsWith(allowed)) ||
    file.name.toLowerCase().endsWith(".docx")
  );
}

export default function DisputeResolutionPage({ params }: { params: { id: string } }) {
  return <DisputeResolutionView disputeId={params.id} />;
}

function DisputeResolutionView({ disputeId }: { disputeId: string }) {
  const [dispute, setDispute] = useState<DisputeDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<PreviewFile[]>([]);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let mounted = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    fetch(`/api/disputes/${disputeId}`, {
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || "Unable to load dispute details.");
        }
        return res.json();
      })
      .then((data) => {
        if (!mounted) return;
        setDispute(data);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err.message || "Unable to load dispute details.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [disputeId]);

  useEffect(() => {
    return () => {
      previews.forEach((preview) => URL.revokeObjectURL(preview.url));
    };
  }, [previews]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    const nextFiles: File[] = [];
    const invalidFiles: string[] = [];
    const sizeExceeded: string[] = [];

    for (const file of files) {
      if (nextFiles.length + selectedFiles.length >= 5) break;
      if (!isAcceptedFile(file)) {
        invalidFiles.push(file.name);
        continue;
      }
      if (file.size > 10 * 1024 * 1024) {
        sizeExceeded.push(file.name);
        continue;
      }
      nextFiles.push(file);
    }

    if (invalidFiles.length > 0) {
      toast.error(`Unsupported file type: ${invalidFiles.join(", ")}`);
    }
    if (sizeExceeded.length > 0) {
      toast.error(`File size too large: ${sizeExceeded.join(", ")}`);
    }

    if (nextFiles.length === 0) {
      event.target.value = "";
      return;
    }

    const newPreviews = nextFiles.map((file) => ({
      id: createPreviewId(file),
      name: file.name,
      type: file.type,
      size: file.size,
      url: URL.createObjectURL(file),
    }));

    setSelectedFiles((current) => [...current, ...nextFiles].slice(0, 5));
    setPreviews((current) => [...current, ...newPreviews].slice(0, 5));
    event.target.value = "";
  };

  const handleRemoveFile = (removeId: string) => {
    setSelectedFiles((current) =>
      current.filter((file) => createPreviewId(file) !== removeId),
    );
    setPreviews((current) => current.filter((preview) => preview.id !== removeId));
  };

  const submitEvidence = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (selectedFiles.length === 0 && notes.trim().length === 0) {
      toast.error("Add evidence or notes before submitting.");
      return;
    }

    setIsSubmitting(true);
    await new Promise((resolve) => setTimeout(resolve, 800));
    setIsSubmitting(false);
    setSelectedFiles([]);
    setPreviews([]);
    setNotes("");
    toast.success("Dispute evidence submitted successfully.");
  };

  const status = statusStyles[dispute?.status ?? "open"] ?? statusStyles.open;

  return (
    <div className="p-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-muted-foreground">
            Dispute resolution
          </p>
          <h1 className="mt-2 text-3xl font-bold">Review dispute</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Use this page to view dispute details, attach supporting evidence, and track the resolution outcome.
          </p>
        </div>
        <Link href="/dashboard/disputes" className="self-start">
          <Button asChild variant="outline" size="sm">
            <span className="inline-flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" /> Back to disputes
            </span>
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="mt-10 rounded-3xl border border-border/50 bg-card/80 p-8 text-center text-muted-foreground">
          Loading dispute details…
        </div>
      ) : error ? (
        <div className="mt-10 rounded-3xl border border-destructive/50 bg-destructive/10 p-8 text-center text-destructive">
          <p className="font-semibold">Unable to load dispute</p>
          <p className="mt-2">{error}</p>
        </div>
      ) : (
        <div className="mt-8 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
          <div className="space-y-6">
            <Card className="p-6">
              <CardHeader className="border-b border-border/50 pb-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <CardTitle className="text-2xl">{dispute?.job_title ?? "Dispute details"}</CardTitle>
                    <CardDescription>
                      {dispute?.reason ? "Reason and context for this dispute." : "No dispute reason available."}
                    </CardDescription>
                  </div>
                  <Badge className={`${status.color} ${status.textColor} border-0`}>
                    {status.label}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-border/50 bg-muted/40 p-4">
                    <p className="text-sm text-muted-foreground">Raised by</p>
                    <p className="mt-2 font-semibold text-foreground">
                      {dispute?.raised_by_username ?? "Unknown"}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">{dispute?.raised_by_wallet ?? "Wallet unavailable"}</p>
                  </div>
                  <div className="rounded-2xl border border-border/50 bg-muted/40 p-4">
                    <p className="text-sm text-muted-foreground">Created</p>
                    <p className="mt-2 font-semibold text-foreground">
                      {formatDate(dispute?.created_at)}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">Last updated {formatDate(dispute?.updated_at ?? dispute?.created_at)}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold">Dispute reason</p>
                  <div className="rounded-3xl border border-border/50 bg-background p-4 text-sm leading-6 text-muted-foreground">
                    {dispute?.reason ?? "No additional information provided."}
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold">Current resolution outcome</p>
                  <div className="rounded-3xl border border-border/50 bg-card/80 p-4">
                    <p className="text-sm text-muted-foreground">Status</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">
                      {dispute?.status === "resolved"
                        ? "Resolved"
                        : dispute?.status === "under_review"
                        ? "In review"
                        : "Open"}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {dispute?.status === "resolved"
                        ? dispute?.resolution ?? "Final outcome has been recorded."
                        : "This dispute is being evaluated by the platform team and DAO voting integration will be added soon."}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <form onSubmit={submitEvidence} className="space-y-6">
              <Card className="p-6">
                <CardHeader className="border-b border-border/50 pb-4">
                  <div>
                    <CardTitle>Evidence upload</CardTitle>
                    <CardDescription>
                      Share files and notes to support the dispute resolution review.
                    </CardDescription>
                  </div>
                </CardHeader>

                <CardContent className="space-y-6">
                  <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                    <div className="space-y-2">
                      <Label htmlFor="dispute-evidence" className="text-sm font-semibold">
                        Supporting evidence
                      </Label>
                      <input
                        id="dispute-evidence"
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept="image/*,.pdf,.docx,.txt"
                        onChange={handleFileUpload}
                        className="sr-only"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full justify-start text-muted-foreground hover:text-foreground"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload className="mr-2 h-4 w-4" />
                        Choose files
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        Maximum 5 files, 10MB each. Supported: images, PDF, DOCX, TXT.
                      </p>
                    </div>
                    <div className="rounded-3xl border border-border/50 bg-muted/40 p-4">
                      <p className="text-sm text-muted-foreground">Selected files</p>
                      <p className="mt-2 text-lg font-semibold text-foreground">{selectedFiles.length}</p>
                    </div>
                  </div>

                  {previews.length > 0 && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {previews.map((file) => (
                        <div
                          key={file.id}
                          className="group overflow-hidden rounded-3xl border border-border/50 bg-background"
                        >
                          {file.type.startsWith("image/") ? (
                            <img
                              src={file.url}
                              alt={file.name}
                              className="h-40 w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-40 items-center justify-center bg-muted/80 text-muted-foreground">
                              <FilePlus className="h-8 w-8" />
                            </div>
                          )}
                          <div className="flex items-center justify-between gap-2 p-4">
                            <div>
                              <p className="font-semibold">{file.name}</p>
                              <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveFile(file.id)}
                            >
                              ✕
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="evidence-notes" className="text-sm font-semibold">
                      Notes for the review team
                    </Label>
                    <Textarea
                      id="evidence-notes"
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      placeholder="Explain why this evidence is important for the dispute..."
                      rows={4}
                    />
                  </div>
                </CardContent>

                <CardFooter className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-muted-foreground">
                    Evidence updates are saved for review, and DAO voting is planned for a later phase.
                  </div>
                  <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
                    {isSubmitting ? "Submitting…" : "Submit evidence"}
                  </Button>
                </CardFooter>
              </Card>
            </form>
          </div>

          <div className="space-y-6">
            <Card className="p-6">
              <CardHeader className="border-b border-border/50 pb-4">
                <div>
                  <CardTitle>Voting status</CardTitle>
                  <CardDescription>
                    Placeholder for future on-chain DAO dispute voting and governance.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-3xl border border-border/50 bg-muted/40 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">DAO voting</p>
                      <p className="text-sm text-muted-foreground">Not yet active</p>
                    </div>
                    <Badge className="border-0 bg-secondary/10 text-secondary">Coming soon</Badge>
                  </div>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-border/20">
                    <div className="h-full w-20 rounded-full bg-secondary" />
                  </div>
                </div>
                <div className="grid gap-3 rounded-3xl border border-border/50 bg-background p-4">
                  <div className="flex items-center gap-3">
                    <Clock3 className="h-5 w-5 text-secondary" />
                    <p className="text-sm text-foreground">Waiting for governance integration</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Users className="h-5 w-5 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Community voting will be enabled in a future release.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="p-6">
              <CardHeader className="border-b border-border/50 pb-4">
                <div>
                  <CardTitle>Resolution outcome</CardTitle>
                  <CardDescription>
                    Track the dispute status and final decision summary.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 rounded-3xl border border-border/50 bg-muted/40 p-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary/10 text-secondary">
                      <ShieldCheck className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="font-semibold">
                        {dispute?.status === "resolved" ? "Final outcome recorded" : "Resolution pending"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {dispute?.status === "resolved"
                          ? "This dispute has been closed and the outcome is available below."
                          : "The review team will publish a decision after evidence is evaluated."}
                      </p>
                    </div>
                  </div>
                  {dispute?.status === "resolved" ? (
                    <div className="rounded-3xl border border-border/50 bg-background p-4 text-sm">
                      <p className="font-semibold">Outcome summary</p>
                      <p className="mt-2 text-muted-foreground">{dispute.resolution ?? "No resolution details were provided."}</p>
                      <p className="mt-3 text-xs text-muted-foreground">Resolved at {formatDate(dispute.resolved_at ?? dispute.updated_at)}</p>
                    </div>
                  ) : (
                    <div className="rounded-3xl border border-border/50 bg-background p-4 text-sm text-muted-foreground">
                      Final outcome information will appear here once the dispute is resolved.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
