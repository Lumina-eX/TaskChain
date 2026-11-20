"use client"

import * as React from "react"
import { format } from "date-fns"
import {
  FileText,
  FileImage,
  FileVideo,
  FileCode,
  File,
  Download,
  Eye,
  Clock,
  User,
  HardDrive,
  X,
  Loader2,
  AlertCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"

export interface WorkspaceFile {
  id: string
  original_filename: string
  mime_type: string
  file_size: number
  created_at: string
  uploader: {
    id: string
    display_name: string | null
    username: string
  }
}

interface WorkspaceFileCardProps {
  file: WorkspaceFile
  contractId: string
  /** Pass token for download/preview requests */
  authToken: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function fileTypeLabel(mime: string): string {
  if (mime.startsWith("image/")) return mime.replace("image/", "").toUpperCase()
  if (mime === "application/pdf") return "PDF"
  if (mime.startsWith("video/")) return mime.replace("video/", "").toUpperCase()
  if (mime.startsWith("text/")) return mime.replace("text/", "").toUpperCase()
  if (mime.includes("spreadsheet") || mime.includes("excel")) return "XLSX"
  if (mime.includes("wordprocessingml") || mime.includes("msword")) return "DOCX"
  if (mime.includes("zip")) return "ZIP"
  const ext = mime.split("/")[1]?.toUpperCase()
  return ext ?? "FILE"
}

function FileIcon({ mime, className }: { mime: string; className?: string }) {
  if (mime.startsWith("image/")) return <FileImage className={className} />
  if (mime.startsWith("video/")) return <FileVideo className={className} />
  if (mime.startsWith("text/") || mime.includes("json") || mime.includes("javascript"))
    return <FileCode className={className} />
  return <FileText className={className} />
}

function isPreviewable(mime: string): boolean {
  return (
    mime.startsWith("image/") ||
    mime === "application/pdf" ||
    mime.startsWith("text/")
  )
}

function fileTypeColor(mime: string): string {
  if (mime.startsWith("image/")) return "bg-blue-500/10 text-blue-500 border-blue-500/20"
  if (mime === "application/pdf") return "bg-red-500/10 text-red-500 border-red-500/20"
  if (mime.startsWith("video/")) return "bg-purple-500/10 text-purple-500 border-purple-500/20"
  if (mime.startsWith("text/")) return "bg-green-500/10 text-green-500 border-green-500/20"
  return "bg-muted text-muted-foreground border-border/40"
}

// ─── Preview Dialog ────────────────────────────────────────────────────────

interface PreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  file: WorkspaceFile
  contractId: string
  authToken: string | null
}

function PreviewDialog({ open, onOpenChange, file, contractId, authToken }: PreviewDialogProps) {
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) {
      // Revoke the object URL when dialog closes to free memory
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setPreviewUrl(null)
      setError(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    const headers: HeadersInit = {}
    if (authToken) headers["Authorization"] = `Bearer ${authToken}`

    fetch(
      `/api/contracts/${contractId}/workspace/files/${file.id}?preview=1`,
      { headers, credentials: "include" },
    )
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error ?? "Failed to load preview")
        }
        return res.blob()
      })
      .then((blob) => {
        if (cancelled) return
        setPreviewUrl(URL.createObjectURL(blob))
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "Preview unavailable")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, file.id, contractId, authToken, previewUrl])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b border-border/40">
          <DialogTitle className="flex items-center gap-3 text-base font-semibold truncate">
            <FileIcon mime={file.mime_type} className="h-5 w-5 shrink-0 text-muted-foreground" />
            {file.original_filename}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto min-h-[300px] relative bg-muted/20">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && !loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <AlertCircle className="h-10 w-10 text-destructive" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {previewUrl && !loading && (
            <>
              {file.mime_type.startsWith("image/") && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt={file.original_filename}
                  className="max-w-full max-h-full object-contain mx-auto block p-4"
                />
              )}
              {file.mime_type === "application/pdf" && (
                <iframe
                  src={previewUrl}
                  title={file.original_filename}
                  className="w-full h-full min-h-[500px] border-0"
                />
              )}
              {file.mime_type.startsWith("text/") && (
                <TextPreview url={previewUrl} />
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function TextPreview({ url }: { url: string }) {
  const [text, setText] = React.useState<string | null>(null)
  React.useEffect(() => {
    fetch(url).then((r) => r.text()).then(setText).catch(() => setText("Could not read text content."))
  }, [url])
  return (
    <pre className="p-4 text-xs font-mono whitespace-pre-wrap break-words text-foreground/80 overflow-auto">
      {text ?? "Loading…"}
    </pre>
  )
}

// ─── Main Card ─────────────────────────────────────────────────────────────

export function WorkspaceFileCard({ file, contractId, authToken }: WorkspaceFileCardProps) {
  const [downloading, setDownloading] = React.useState(false)
  const [previewOpen, setPreviewOpen] = React.useState(false)
  const previable = isPreviewable(file.mime_type)

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const headers: HeadersInit = {}
      if (authToken) headers["Authorization"] = `Bearer ${authToken}`

      const res = await fetch(
        `/api/contracts/${contractId}/workspace/files/${file.id}`,
        { headers, credentials: "include" },
      )

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? "Download failed")
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = file.original_filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success(`Downloaded ${file.original_filename}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed")
    } finally {
      setDownloading(false)
    }
  }

  return (
    <>
      <div className="flex items-start gap-4 p-4 rounded-lg border border-border/40 bg-card/60 hover:bg-card/80 transition-colors group">
        {/* Icon */}
        <div className="shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <FileIcon mime={file.mime_type} className="h-5 w-5 text-primary" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 space-y-1.5">
          <p className="font-medium text-sm truncate leading-tight" title={file.original_filename}>
            {file.original_filename}
          </p>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {/* File type badge */}
            <Badge
              variant="outline"
              className={`text-[10px] px-1.5 py-0 font-semibold ${fileTypeColor(file.mime_type)}`}
            >
              {fileTypeLabel(file.mime_type)}
            </Badge>

            {/* File size */}
            <span className="flex items-center gap-1">
              <HardDrive className="h-3 w-3 shrink-0" />
              {formatBytes(file.file_size)}
            </span>

            {/* Uploader */}
            <span className="flex items-center gap-1 truncate max-w-[140px]" title={file.uploader.display_name ?? file.uploader.username}>
              <User className="h-3 w-3 shrink-0" />
              {file.uploader.display_name ?? `@${file.uploader.username}`}
            </span>

            {/* Upload date */}
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3 shrink-0" />
              {format(new Date(file.created_at), "MMM d, yyyy 'at' h:mm a")}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="shrink-0 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          {previable && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPreviewOpen(true)}
              title="Preview file"
            >
              <Eye className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleDownload}
            disabled={downloading}
            title="Download file"
          >
            {downloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {previable && (
        <PreviewDialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          file={file}
          contractId={contractId}
          authToken={authToken}
        />
      )}
    </>
  )
}
