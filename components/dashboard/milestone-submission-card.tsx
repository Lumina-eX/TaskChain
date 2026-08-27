"use client"

import * as React from "react"
import { format } from "date-fns"
import { FileText, Link as LinkIcon, Upload, Loader2, CheckCircle2 } from "lucide-react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { toast } from "sonner"

interface MilestoneSubmissionCardProps {
  milestoneId: string
  milestoneTitle: string
  canSubmit: boolean
  currentStatus: string
  onSubmitSuccess?: () => void
}

export function MilestoneSubmissionCard({
  milestoneId,
  milestoneTitle,
  canSubmit,
  currentStatus,
  onSubmitSuccess,
}: MilestoneSubmissionCardProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [showSubmitDialog, setShowSubmitDialog] = React.useState(false)
  const [submissionNotes, setSubmissionNotes] = React.useState("")
  const [deliverableLinks, setDeliverableLinks] = React.useState<string[]>([''])

  const addLinkField = () => {
    setDeliverableLinks([...deliverableLinks, ''])
  }

  const updateLink = (index: number, value: string) => {
    const updated = [...deliverableLinks]
    updated[index] = value
    setDeliverableLinks(updated)
  }

  const removeLink = (index: number) => {
    setDeliverableLinks(deliverableLinks.filter((_, i) => i !== index))
  }

  const handleSubmit = async () => {
    const validLinks = deliverableLinks.filter(link => link.trim().length > 0)
    
    if (validLinks.length === 0 && !submissionNotes.trim()) {
      toast.error("Please provide either deliverable links or submission notes")
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch(`/api/milestones/${milestoneId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submission_notes: submissionNotes.trim(),
          deliverable_links: validLinks,
          deliverables: validLinks, // For backward compatibility
        }),
      })

      if (response.ok) {
        toast.success("Milestone submitted successfully!")
        setShowSubmitDialog(false)
        setSubmissionNotes("")
        setDeliverableLinks([''])
        onSubmitSuccess?.()
        router.push(`/dashboard/milestones/${milestoneId}`)
      } else {
        const data = await response.json()
        toast.error(data.error || "Failed to submit milestone")
      }
    } catch {
      toast.error("Error submitting milestone")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!canSubmit) {
    return (
      <Card className="border-border/40 bg-card/95">
        <CardHeader>
          <CardTitle className="text-lg">Submit Milestone</CardTitle>
          <CardDescription>
            This milestone cannot be submitted in its current status: <strong>{currentStatus}</strong>
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <>
      <Card className="border-border/40 bg-card/95">
        <CardHeader>
          <CardTitle className="text-lg">Ready to Submit?</CardTitle>
          <CardDescription>
            Submit your deliverables for <strong>{milestoneTitle}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Once submitted, the client will be notified to review your work. Make sure all
            deliverables are complete and meet the requirements.
          </p>
        </CardContent>
        <CardFooter>
          <Button 
            onClick={() => setShowSubmitDialog(true)}
            className="w-full"
            size="lg"
          >
            <Upload className="mr-2 h-5 w-5" />
            Submit for Review
          </Button>
        </CardFooter>
      </Card>

      <AlertDialog open={showSubmitDialog} onOpenChange={setShowSubmitDialog}>
        <AlertDialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>Submit Milestone</AlertDialogTitle>
            <AlertDialogDescription>
              Provide links to your deliverables and any notes for the client.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4 py-4">
            {/* Submission Notes */}
            <div className="space-y-2">
              <Label htmlFor="submission-notes">
                Submission Notes <span className="text-xs text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="submission-notes"
                placeholder="Describe what you've completed, any important details, or special instructions..."
                value={submissionNotes}
                onChange={(e) => setSubmissionNotes(e.target.value)}
                rows={4}
                className="resize-none"
              />
            </div>

            {/* Deliverable Links */}
            <div className="space-y-2">
              <Label>Deliverable Links</Label>
              <div className="space-y-2">
                {deliverableLinks.map((link, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      placeholder="https://..."
                      value={link}
                      onChange={(e) => updateLink(index, e.target.value)}
                      className="flex-1"
                    />
                    {deliverableLinks.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeLink(index)}
                        type="button"
                      >
                        ×
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={addLinkField}
                type="button"
                className="w-full"
              >
                + Add Another Link
              </Button>
            </div>

            <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
              <p className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>Make sure all deliverables are accessible and complete before submitting.</span>
              </p>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit Milestone
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
