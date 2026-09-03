import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MilestoneReview } from '@/components/dashboard/milestone-review'
import { toast } from 'sonner'

// Mock toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

// Mock fetch
global.fetch = vi.fn()

const mockMilestone = {
  id: 'milestone-1',
  title: 'Design Prototype',
  description: 'Complete the initial design prototype',
  amount: '1500.00',
  currency: 'USDC',
  status: 'submitted',
  due_date: '2026-09-30T00:00:00Z',
  submitted_at: '2026-08-20T10:30:00Z',
  approved_at: null,
  submission_notes: 'Completed all design requirements',
  deliverables: ['https://figma.com/design', 'https://drive.google.com/prototype'],
  revision_requested: false,
  revision_count: 0,
  contract_id: 'contract-1',
  freelancer_id: 'freelancer-1',
  client_id: 'client-1',
}

describe('MilestoneReview Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Client View', () => {
    it('should render milestone details correctly', () => {
      render(
        <MilestoneReview
          milestone={mockMilestone}
          userRole="client"
          onUpdate={() => {}}
        />
      )

      expect(screen.getByText('Design Prototype')).toBeInTheDocument()
      expect(screen.getByText('Complete the initial design prototype')).toBeInTheDocument()
      expect(screen.getByText(/\$1,500/)).toBeInTheDocument()
    })

    it('should show review action buttons for submitted milestone', () => {
      render(
        <MilestoneReview
          milestone={mockMilestone}
          userRole="client"
          onUpdate={() => {}}
        />
      )

      expect(screen.getByText('Approve Milestone')).toBeInTheDocument()
      expect(screen.getByText('Request Changes')).toBeInTheDocument()
      expect(screen.getByText('Reject')).toBeInTheDocument()
    })

    it('should not show review actions for non-submitted milestone', () => {
      const inProgressMilestone = { ...mockMilestone, status: 'in_progress' }
      
      render(
        <MilestoneReview
          milestone={inProgressMilestone}
          userRole="client"
          onUpdate={() => {}}
        />
      )

      expect(screen.queryByText('Approve Milestone')).not.toBeInTheDocument()
    })

    it('should display submission notes', () => {
      render(
        <MilestoneReview
          milestone={mockMilestone}
          userRole="client"
          onUpdate={() => {}}
        />
      )

      expect(screen.getByText('Completed all design requirements')).toBeInTheDocument()
    })

    it('should display deliverables', () => {
      render(
        <MilestoneReview
          milestone={mockMilestone}
          userRole="client"
          onUpdate={() => {}}
        />
      )

      expect(screen.getByText('https://figma.com/design')).toBeInTheDocument()
      expect(screen.getByText('https://drive.google.com/prototype')).toBeInTheDocument()
      expect(screen.getByText(/Deliverables \(2\)/)).toBeInTheDocument()
    })

    it('should show revision indicator when revisions requested', () => {
      const revisedMilestone = {
        ...mockMilestone,
        revision_count: 2,
      }

      render(
        <MilestoneReview
          milestone={revisedMilestone}
          userRole="client"
          onUpdate={() => {}}
        />
      )

      expect(screen.getByText(/Revisions requested 2 times/)).toBeInTheDocument()
    })

    it('should open approve dialog when approve button clicked', async () => {
      render(
        <MilestoneReview
          milestone={mockMilestone}
          userRole="client"
          onUpdate={() => {}}
        />
      )

      const approveButton = screen.getByText('Approve Milestone')
      fireEvent.click(approveButton)

      await waitFor(() => {
        expect(screen.getByText('Approve this milestone?')).toBeInTheDocument()
      })
    })

    it('should call approve API when confirmed', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ milestone: { ...mockMilestone, status: 'approved' } }),
      })
      global.fetch = mockFetch

      const onUpdate = vi.fn()

      render(
        <MilestoneReview
          milestone={mockMilestone}
          userRole="client"
          onUpdate={onUpdate}
        />
      )

      // Open dialog
      fireEvent.click(screen.getByText('Approve Milestone'))

      // Confirm
      await waitFor(() => {
        const confirmButton = screen.getByText('Confirm Approval')
        fireEvent.click(confirmButton)
      })

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          `/api/milestones/${mockMilestone.id}/approve`,
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ action: 'approve' }),
          })
        )
        expect(toast.success).toHaveBeenCalledWith('Milestone approved successfully!')
        expect(onUpdate).toHaveBeenCalled()
      })
    })

    it('should open request changes dialog', async () => {
      render(
        <MilestoneReview
          milestone={mockMilestone}
          userRole="client"
          onUpdate={() => {}}
        />
      )

      const requestButton = screen.getByRole('button', { name: /Request Changes/i })
      fireEvent.click(requestButton)

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Describe the changes/)).toBeInTheDocument()
      })
    })

    it('should call request-changes API with notes', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ milestone: { ...mockMilestone, status: 'in_progress' } }),
      })
      global.fetch = mockFetch

      render(
        <MilestoneReview
          milestone={mockMilestone}
          userRole="client"
          onUpdate={() => {}}
        />
      )

      // Open dialog
      fireEvent.click(screen.getByText('Request Changes'))

      await waitFor(() => {
        const textarea = screen.getByPlaceholderText(/Describe the changes/)
        fireEvent.change(textarea, { target: { value: 'Please update the color scheme' } })

        const sendButton = screen.getByText('Send Request')
        fireEvent.click(sendButton)
      })

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          `/api/milestones/${mockMilestone.id}/request-changes`,
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ revision_notes: 'Please update the color scheme' }),
          })
        )
      })
    })

    it('should require rejection reason', async () => {
      render(
        <MilestoneReview
          milestone={mockMilestone}
          userRole="client"
          onUpdate={() => {}}
        />
      )

      fireEvent.click(screen.getByText('Reject'))

      await waitFor(() => {
        const confirmButton = screen.getByText('Confirm Rejection')
        expect(confirmButton).toBeDisabled()
      })
    })

    it('should handle API errors gracefully', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Network error' }),
      })
      global.fetch = mockFetch

      render(
        <MilestoneReview
          milestone={mockMilestone}
          userRole="client"
          onUpdate={() => {}}
        />
      )

      fireEvent.click(screen.getByText('Approve Milestone'))

      await waitFor(() => {
        const confirmButton = screen.getByText('Confirm Approval')
        fireEvent.click(confirmButton)
      })

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled()
      })
    })
  })

  describe('Freelancer View', () => {
    it('should not show review actions for freelancer', () => {
      render(
        <MilestoneReview
          milestone={mockMilestone}
          userRole="freelancer"
          onUpdate={() => {}}
        />
      )

      expect(screen.queryByText('Approve Milestone')).not.toBeInTheDocument()
      expect(screen.queryByText('Request Changes')).not.toBeInTheDocument()
      expect(screen.queryByText('Reject')).not.toBeInTheDocument()
    })

    it('should show revision alert when revisions requested', () => {
      const revisedMilestone = {
        ...mockMilestone,
        status: 'in_progress',
        revision_requested: true,
      }

      render(
        <MilestoneReview
          milestone={revisedMilestone}
          userRole="freelancer"
          onUpdate={() => {}}
        />
      )

      expect(screen.getByText('Revisions Requested')).toBeInTheDocument()
      expect(screen.getByText(/client has requested changes/)).toBeInTheDocument()
    })

    it('should display submission details for freelancer', () => {
      render(
        <MilestoneReview
          milestone={mockMilestone}
          userRole="freelancer"
          onUpdate={() => {}}
        />
      )

      expect(screen.getByText('Design Prototype')).toBeInTheDocument()
      expect(screen.getByText(/Awaiting Review/)).toBeInTheDocument()
    })
  })

  describe('Submission History', () => {
    it('should load history when expanded', async () => {
      const mockHistory = [
        {
          id: 'history-1',
          submission_type: 'submitted',
          submitter_name: 'John Doe',
          submitter_wallet: 'GABC123...',
          reviewer_name: null,
          reviewer_wallet: null,
          deliverable_notes: 'Initial submission',
          feedback: null,
          revision_notes: null,
          created_at: '2026-08-20T10:30:00Z',
        },
      ]

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ history: mockHistory }),
      })
      global.fetch = mockFetch

      render(
        <MilestoneReview
          milestone={mockMilestone}
          userRole="client"
          onUpdate={() => {}}
        />
      )

      const historyButton = screen.getByText('Submission History')
      fireEvent.click(historyButton)

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(`/api/milestones/${mockMilestone.id}/history`)
      })
    })

    it('should display empty state when no history', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ history: [] }),
      })
      global.fetch = mockFetch

      render(
        <MilestoneReview
          milestone={mockMilestone}
          userRole="client"
          onUpdate={() => {}}
        />
      )

      const historyButton = screen.getByText('Submission History')
      fireEvent.click(historyButton)

      await waitFor(() => {
        expect(screen.getByText('No submission history yet')).toBeInTheDocument()
      })
    })
  })

  describe('Status Display', () => {
    const statuses = [
      { status: 'pending', label: 'Pending' },
      { status: 'in_progress', label: 'In Progress' },
      { status: 'submitted', label: 'Awaiting Review' },
      { status: 'approved', label: 'Approved' },
      { status: 'rejected', label: 'Rejected' },
      { status: 'paid', label: 'Paid' },
    ]

    statuses.forEach(({ status, label }) => {
      it(`should display correct badge for ${status} status`, () => {
        const milestone = { ...mockMilestone, status }

        render(
          <MilestoneReview
            milestone={milestone}
            userRole="client"
            onUpdate={() => {}}
          />
        )

        expect(screen.getByText(label)).toBeInTheDocument()
      })
    })
  })

  describe('Responsive Design', () => {
    it('should render without layout issues', () => {
      const { container } = render(
        <MilestoneReview
          milestone={mockMilestone}
          userRole="client"
          onUpdate={() => {}}
        />
      )

      expect(container.querySelector('.space-y-6')).toBeInTheDocument()
    })
  })
})
