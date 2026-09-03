"use client"

import * as React from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Loader2 } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { MilestoneReview, Milestone } from "@/components/dashboard/milestone-review"
import { MilestoneSubmissionCard } from "@/components/dashboard/milestone-submission-card"
import { toast } from "sonner"

export default function MilestoneReviewPage() {
  const params = useParams()
  const router = useRouter()
  const milestoneId = params.id as string

  const [milestone, setMilestone] = React.useState<Milestone | null>(null)
  const [userRole, setUserRole] = React.useState<'client' | 'freelancer' | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const fetchMilestone = React.useCallback(async () => {
    setIsLoading(true)
    setError(null)
    
    try {
      const response = await fetch(`/api/milestones/${milestoneId}`)
      
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to fetch milestone')
      }

      const data = await response.json()
      setMilestone(data.milestone)

      // Determine user role
      const userResponse = await fetch('/api/auth/me')
      if (userResponse.ok) {
        const userData = await userResponse.json()
        const isClient = data.milestone.client_id === userData.user?.id
        setUserRole(isClient ? 'client' : 'freelancer')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load milestone'
      setError(message)
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }, [milestoneId])

  React.useEffect(() => {
    fetchMilestone()
  }, [fetchMilestone])

  const handleUpdate = () => {
    fetchMilestone()
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">Loading milestone details...</p>
        </div>
      </div>
    )
  }

  if (error || !milestone || !userRole) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4 max-w-md">
          <div className="text-6xl">😕</div>
          <h2 className="text-2xl font-bold">Unable to Load Milestone</h2>
          <p className="text-muted-foreground">
            {error || 'The milestone could not be found or you do not have access to view it.'}
          </p>
          <div className="flex gap-3 justify-center">
            <Button onClick={() => router.back()} variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Go Back
            </Button>
            <Button onClick={fetchMilestone}>
              Try Again
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container max-w-5xl py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Milestone Review</h1>
          <p className="text-muted-foreground mt-1">
            {userRole === 'client' 
              ? 'Review and approve the freelancer\'s submission'
              : 'View your milestone submission status'
            }
          </p>
        </div>
      </div>

      {/* Freelancer Submission Card - Show if freelancer and can submit */}
      {userRole === 'freelancer' && ['pending', 'in_progress'].includes(milestone.status) && (
        <MilestoneSubmissionCard
          milestoneId={milestone.id}
          milestoneTitle={milestone.title}
          canSubmit={['pending', 'in_progress'].includes(milestone.status)}
          currentStatus={milestone.status}
          onSubmitSuccess={handleUpdate}
        />
      )}

      {/* Milestone Review Component */}
      <MilestoneReview
        milestone={milestone}
        userRole={userRole}
        onUpdate={handleUpdate}
      />

      {/* Back Button */}
      <div className="flex justify-center pt-6">
        <Button
          variant="outline"
          onClick={() => router.back()}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to {userRole === 'client' ? 'Dashboard' : 'Milestones'}
        </Button>
      </div>
    </div>
  )
}
