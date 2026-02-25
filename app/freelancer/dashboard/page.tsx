import type { Metadata } from 'next'
import { FreelancerDashboard } from '@/components/freelancer/freelancer-dashboard'

export const metadata: Metadata = {
  title: 'Freelancer Dashboard | TaskChain',
  description:
    'Track active and completed contracts, earnings, and escrow status in one place.',
}

export default function FreelancerDashboardPage() {
  return (
    <main className="min-h-screen bg-background">
      <FreelancerDashboard />
    </main>
  )
}
