"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  FileArchive,
  FileImage,
  FileText,
  FileVideo,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";

interface DisputeDetails {
  id: number | string;
  job_title: string;
  reason: string;
  status:
    | "open"
    | "under_review"
    | "resolved"
    | "resolved_client"
    | "resolved_freelancer"
    | "resolved_split"
    | string;
  created_at: string;
  updated_at?: string;
  resolution?: string | null;
  resolved_at?: string | null;
  raised_by_username?: string | null;
  raised_by_wallet?: string | null;
}

interface EvidenceItem {
  id: number | string;
  file_name: string;
  file_type?: string | null;
  mime_type?: string | null;
  file_size?: number | null;
  file_hash?: string | null;
  description?: string | null;
  created_at: string;
  uploaded_by_username?: string | null;
}

interface PreviewFile {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
  progress: number;
  state: "queued" | "uploading" | "complete" | "error";
  error?: string;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_FILES = 10;
const allowedEvidenceTypes = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
  "application/gzip",
  "application/x-tar",
  "text/plain",
  "text/csv",
  "application/json",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-msvideo",
];

const statusStyles: Record<string, { label: string; color: string; textColor: string }> = {
  open: {
    label: "Open",
    color: "bg-amber-500/10",
    textColor: "text-amber-600 dark:text-amber-400",
  },
  under_review: {
    label: "Under review",
    color: "bg-secondary/10",
    textColor: "text-secondary",
  },
  resolved: {
    label: "Resolved",
    color: "bg-accent/10",
    textColor: "text-accent",
  },
};

function formatDate(value?: string) {
  if (!value) return "Unavailable";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatFileSize(size?: number | null) {
  if (!size) return "No file";
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function createPreviewId(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function isAcceptedFile(file: File) {
  return file.type.startsWith("image/") || allowedEvidenceTypes.includes(file.type);
}

function getEvidenceIcon(type?: string | null) {
  if (type?.startsWith("image/")) return FileImage;
  if (type?.startsWith("video/")) return FileVideo;
  if (type?.includes("zip") || type?.includes("tar") || type?.includes("gzip")) return FileArchive;
  return FileText;
}

function getEvidenceUrl(disputeId: string, evidenceId: string | number, preview = false) {
  const suffix = preview ? "?preview=1" : "";
  return `/api/disputes/${disputeId}/evidence/${evidenceId}${suffix}`;
}

function normalizeStatus(status?: string) {
  if (!status) return "open";
  return status.startsWith("resolved") ? "resolved" : status;
}

export default function DisputeResolutionPage({ params }: { params: { id: string } }) {
  return <DisputeResolutionView disputeId={params.id} />;
}

function DisputeResolutionView({ disputeId }: { disputeId: string }) {
  const [dispute, setDispute] = useState<DisputeDetails | null>(null);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [evidenceLoading, setEvidenceLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<PreviewFile[]>([]);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewsRef = useRef<PreviewFile[]>([]);

  const fetchDispute = useCallback(async () => {
    const res = await fetch(`/api/disputes/${disputeId}`, {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    if (res.status === 403) {
      setAccessDenied(true);
      throw new Error("Access denied");
    }
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error || "Unable to load dispute details.");
    }
    setAccessDenied(false);
    setDispute(await res.json());
  }, [disputeId]);

  const fetchEvidence = useCallback(async () => {
    const res = await fetch(`/api/disputes/${disputeId}/evidence`, {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    if (res.status === 403) {
      setAccessDenied(true);
      throw new Error("Access denied");
    }
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error || "Unable to load evidence.");
    }
    const data = await res.json();
    setEvidence(Array.isArray(data.evidence) ? data.evidence : []);
  }, [disputeId]);

  const refreshDispute = useCallback(
    async (showLoading = false) => {
      if (showLoading) setLoading(true);
      setError(null);
      try {
        await Promise.all([fetchDispute(), fetchEvidence()]);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to load dispute.";
        setError(message);
      } finally {
        setLoading(false);
        setEvidenceLoading(false);
      }
    },
    [fetchDispute, fetchEvidence],
  );

  useEffect(() => {
    refreshDispute(true);
    const timer = window.setInterval(() => refreshDispute(false), 15000);
    return () => window.clearInterval(timer);
  }, [refreshDispute]);

  useEffect(() => {
    previewsRef.current = previews;
  }, [previews]);

  useEffect(() => {
    return () => {
      previewsRef.current.forEach((preview) => URL.revokeObjectURL(preview.url));
    };
  }, []);

  const timeline = useMemo(() => {
    const status = normalizeStatus(dispute?.status);
    const evidenceSubmitted = evidence.length > 0 || status === "under_review" || status === "resolved";
    return [
      { key: "opened", label: "Opened", date: dispute?.created_at, complete: Boolean(dispute), active: status === "open" && !evidenceSubmitted },
      { key: "evidence", label: "Evidence submitted", date: evidence.at(-1)?.created_at, complete: evidenceSubmitted, active: status === "open" && evidence.length > 0 },
      { key: "review", label: "Under review", date: dispute?.updated_at, complete: status === "under_review" || status === "resolved", active: status === "under_review" },
      { key: "resolved", label: "Resolved", date: dispute?.resolved_at ?? dispute?.updated_at, complete: status === "resolved", active: status === "resolved" },
    ];
  }, [dispute, evidence]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    const currentIds = new Set(selectedFiles.map(createPreviewId));
    const nextFiles: File[] = [];
    const invalidFiles: string[] = [];
    const sizeExceeded: string[] = [];

    for (const file of files) {
      if (selectedFiles.length + nextFiles.length >= MAX_FILES) break;
      if (!isAcceptedFile(file)) {
        invalidFiles.push(file.name);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        sizeExceeded.push(file.name);
        continue;
      }
      if (!currentIds.has(createPreviewId(file))) nextFiles.push(file);
    }

    if (invalidFiles.length > 0) toast.error(`Unsupported file type: ${invalidFiles.join(", ")}`);
    if (sizeExceeded.length > 0) toast.error(`File size too large: ${sizeExceeded.join(", ")}`);

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
      progress: 0,
      state: "queued" as const,
    }));

    setSelectedFiles((current) => [...current, ...nextFiles].slice(0, MAX_FILES));
    setPreviews((current) => [...current, ...newPreviews].slice(0, MAX_FILES));
    event.target.value = "";
  };

  const handleRemoveFile = (removeId: string) => {
    setSelectedFiles((current) => current.filter((file) => createPreviewId(file) !== removeId));
    setPreviews((current) => {
      const removed = current.find((preview) => preview.id === removeId);
      if (removed) URL.revokeObjectURL(removed.url);
      return current.filter((preview) => preview.id !== removeId);
    });
  };

  const uploadEvidenceFile = useCallback(
    (file: File, description: string) => {
      return new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const formData = new FormData();
        formData.append("files", file);
        if (description) formData.append("description", description);

        const previewId = createPreviewId(file);
        setPreviews((current) =>
          current.map((preview) =>
            preview.id === previewId ? { ...preview, state: "uploading", progress: 2 } : preview,
          ),
        );

        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable) return;
          const progress = Math.min(99, Math.round((event.loaded / event.total) * 100));
          setPreviews((current) =>
            current.map((preview) => (preview.id === previewId ? { ...preview, progress } : preview)),
          );
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            setPreviews((current) =>
              current.map((preview) =>
                preview.id === previewId ? { ...preview, state: "complete", progress: 100 } : preview,
              ),
            );
            resolve();
            return;
          }

          let message = "Evidence upload failed.";
          try {
            message = JSON.parse(xhr.responseText)?.error || message;
          } catch {
            message = "Evidence upload failed.";
          }
          setPreviews((current) =>
            current.map((preview) =>
              preview.id === previewId ? { ...preview, state: "error", error: message } : preview,
            ),
          );
          reject(new Error(message));
        };

        xhr.onerror = () => {
          const message = "Evidence upload failed. Check your connection and try again.";
          setPreviews((current) =>
            current.map((preview) =>
              preview.id === previewId ? { ...preview, state: "error", error: message } : preview,
            ),
          );
          reject(new Error(message));
        };

        xhr.open("POST", `/api/disputes/${disputeId}/evidence`);
        xhr.withCredentials = true;
        xhr.send(formData);
      });
    },
    [disputeId],
  );

  const submitEvidence = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedNotes = notes.trim();
    if (selectedFiles.length === 0 && trimmedNotes.length === 0) {
      toast.error("Add evidence or notes before submitting.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (selectedFiles.length === 0) {
        const formData = new FormData();
        formData.append("description", trimmedNotes);
        const res = await fetch(`/api/disputes/${disputeId}/evidence`, {
          method: "POST",
          credentials: "include",
          body: formData,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || "Evidence note could not be submitted.");
        }
      } else {
        for (const file of selectedFiles) {
          await uploadEvidenceFile(file, trimmedNotes);
        }
      }

      setSelectedFiles([]);
      setPreviews((current) => {
        current.forEach((preview) => URL.revokeObjectURL(preview.url));
        return [];
      });
      setNotes("");
      await refreshDispute(false);
      toast.success("Evidence submitted for review.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Evidence upload failed.";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const status = statusStyles[normalizeStatus(dispute?.status)] ?? statusStyles.open;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Dispute resolution
          </p>
          <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Evidence review</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {dispute?.job_title ?? "Loading dispute workspace"}
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="self-start">
          <Link href="/dashboard/disputes">
            <ArrowLeft className="h-4 w-4" /> Back to disputes
          </Link>
        </Button>
      </div>

      {loading ? (
        <div className="mt-10 rounded-xl border border-border/50 bg-card/80 p-8 text-center text-muted-foreground">
          Loading dispute details...
        </div>
      ) : accessDenied ? (
        <div className="mt-10 rounded-xl border border-destructive/50 bg-destructive/10 p-8 text-center text-destructive">
          <ShieldAlert className="mx-auto h-8 w-8" />
          <p className="mt-3 font-semibold">Restricted dispute</p>
          <p className="mt-2 text-sm">Only the contract parties and moderators can view this evidence.</p>
        </div>
      ) : error ? (
        <div className="mt-10 rounded-xl border border-destructive/50 bg-destructive/10 p-8 text-center text-destructive">
          <p className="font-semibold">Unable to load dispute</p>
          <p className="mt-2">{error}</p>
        </div>
      ) : (
        <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.85fr)]">
          <div className="space-y-6">
            <Card className="p-0">
              <CardHeader className="border-b border-border/50">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <CardTitle className="text-xl sm:text-2xl">{dispute?.job_title ?? "Dispute details"}</CardTitle>
                    <CardDescription>
                      Raised by {dispute?.raised_by_username ?? "unknown user"} on {formatDate(dispute?.created_at)}
                    </CardDescription>
                  </div>
                  <Badge className={`${status.color} ${status.textColor} border-0`}>
                    {status.label}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-lg border border-border/50 bg-muted/40 p-4">
                    <p className="text-sm text-muted-foreground">Raised by</p>
                    <p className="mt-2 break-words font-semibold text-foreground">
                      {dispute?.raised_by_username ?? "Unknown"}
                    </p>
                    <p className="mt-1 break-all text-sm text-muted-foreground">{dispute?.raised_by_wallet ?? "Wallet unavailable"}</p>
                  </div>
                  <div className="rounded-lg border border-border/50 bg-muted/40 p-4">
                    <p className="text-sm text-muted-foreground">Last update</p>
                    <p className="mt-2 font-semibold text-foreground">
                      {formatDate(dispute?.updated_at ?? dispute?.created_at)}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">{evidence.length} evidence item{evidence.length === 1 ? "" : "s"}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold">Dispute reason</p>
                  <div className="rounded-lg border border-border/50 bg-background p-4 text-sm leading-6 text-muted-foreground">
                    {dispute?.reason ?? "No additional information provided."}
                  </div>
                </div>
              </CardContent>
            </Card>

            <form onSubmit={submitEvidence} className="space-y-6">
              <Card className="p-0">
                <CardHeader className="border-b border-border/50">
                  <CardTitle>Submit evidence</CardTitle>
                  <CardDescription>
                    Documents, images, videos, archives, and notes are accepted.
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-6">
                  <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_160px]">
                    <div className="space-y-2">
                      <Label htmlFor="dispute-evidence" className="text-sm font-semibold">
                        Evidence files
                      </Label>
                      <input
                        id="dispute-evidence"
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.gz,.tar,.txt,.csv,.json"
                        onChange={handleFileUpload}
                        className="sr-only"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full justify-start text-muted-foreground hover:text-foreground"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isSubmitting}
                      >
                        <Upload className="h-4 w-4" />
                        Choose files
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        Up to {MAX_FILES} files, {MAX_FILE_SIZE / (1024 * 1024)} MB each.
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/50 bg-muted/40 p-4">
                      <p className="text-sm text-muted-foreground">Queued</p>
                      <p className="mt-2 text-2xl font-semibold text-foreground">{selectedFiles.length}</p>
                    </div>
                  </div>

                  {previews.length > 0 && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {previews.map((file) => {
                        const Icon = getEvidenceIcon(file.type);
                        return (
                          <div key={file.id} className="overflow-hidden rounded-lg border border-border/50 bg-background">
                            {file.type.startsWith("image/") ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={file.url} alt={file.name} className="h-40 w-full object-cover" />
                            ) : (
                              <div className="flex h-40 items-center justify-center bg-muted/80 text-muted-foreground">
                                <Icon className="h-8 w-8" />
                              </div>
                            )}
                            <div className="space-y-3 p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate font-semibold">{file.name}</p>
                                  <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => handleRemoveFile(file.id)}
                                  disabled={isSubmitting}
                                  aria-label={`Remove ${file.name}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                              {(file.state === "uploading" || file.state === "complete" || file.state === "error") && (
                                <div className="space-y-2">
                                  <Progress value={file.progress} />
                                  <p className="text-xs text-muted-foreground">
                                    {file.state === "error" ? file.error : `${file.progress}% uploaded`}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="evidence-notes" className="text-sm font-semibold">
                      Evidence notes
                    </Label>
                    <Textarea
                      id="evidence-notes"
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      placeholder="Add context for moderators and the other party..."
                      rows={4}
                      disabled={isSubmitting}
                    />
                  </div>
                </CardContent>

                <CardFooter className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-muted-foreground">
                    Files are validated before upload and stored with an integrity hash.
                  </div>
                  <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
                    {isSubmitting ? "Submitting..." : "Submit evidence"}
                  </Button>
                </CardFooter>
              </Card>
            </form>

            <Card className="p-0">
              <CardHeader className="border-b border-border/50">
                <CardTitle>Evidence list</CardTitle>
                <CardDescription>Chronological record for this dispute.</CardDescription>
              </CardHeader>
              <CardContent>
                {evidenceLoading ? (
                  <p className="text-sm text-muted-foreground">Loading evidence...</p>
                ) : evidence.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    No evidence has been submitted yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {evidence.map((item) => {
                      const type = item.mime_type ?? item.file_type;
                      const Icon = getEvidenceIcon(type);
                      const canPreview = Boolean(item.file_size) && (
                        type?.startsWith("image/") || type?.startsWith("video/") || type === "application/pdf" || type?.startsWith("text/")
                      );
                      return (
                        <div key={item.id} className="rounded-lg border border-border/50 bg-background p-4">
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div className="flex min-w-0 gap-3">
                              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                                <Icon className="h-5 w-5" />
                              </span>
                              <div className="min-w-0">
                                <p className="truncate font-semibold">{item.file_name}</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {formatDate(item.created_at)} by {item.uploaded_by_username ?? "unknown"}
                                </p>
                                {item.description && (
                                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
                                )}
                                <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                                  <span>{formatFileSize(item.file_size)}</span>
                                  {item.file_hash && <span className="break-all">SHA-256 {item.file_hash.slice(0, 12)}...</span>}
                                </div>
                              </div>
                            </div>
                            {item.file_size ? (
                              <div className="flex gap-2">
                                {canPreview ? (
                                  <Button asChild variant="outline" size="sm">
                                    <a href={getEvidenceUrl(disputeId, item.id, true)} target="_blank" rel="noreferrer">
                                      <Eye className="h-4 w-4" /> Preview
                                    </a>
                                  </Button>
                                ) : null}
                                <Button asChild variant="outline" size="sm">
                                  <a href={getEvidenceUrl(disputeId, item.id)}>
                                    <Download className="h-4 w-4" /> Download
                                  </a>
                                </Button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="p-0">
              <CardHeader className="border-b border-border/50">
                <CardTitle>Status timeline</CardTitle>
                <CardDescription>Opened, evidence, review, and resolution stages.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {timeline.map((item, index) => (
                  <div key={item.key} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={`flex h-8 w-8 items-center justify-center rounded-full border ${
                          item.complete
                            ? "border-accent bg-accent/10 text-accent"
                            : item.active
                              ? "border-secondary bg-secondary/10 text-secondary"
                              : "border-border bg-muted text-muted-foreground"
                        }`}
                      >
                        {item.complete ? <CheckCircle2 className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}
                      </span>
                      {index < timeline.length - 1 && <span className="h-10 w-px bg-border" />}
                    </div>
                    <div className="pb-4">
                      <p className="font-semibold">{item.label}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{item.complete || item.active ? formatDate(item.date) : "Pending"}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="p-0">
              <CardHeader className="border-b border-border/50">
                <CardTitle>Access control</CardTitle>
                <CardDescription>Evidence is scoped to the dispute record.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border border-border/50 bg-muted/40 p-4">
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="mt-0.5 h-5 w-5 text-accent" />
                    <div>
                      <p className="font-semibold">Authorized viewers only</p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        Contract parties and moderators can view, submit, preview, and download evidence.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="rounded-lg border border-border/50 bg-background p-4">
                  <p className="text-sm font-semibold">Resolution outcome</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {normalizeStatus(dispute?.status) === "resolved"
                      ? dispute?.resolution ?? "Final outcome has been recorded."
                      : "A moderator decision will appear here after review."}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
