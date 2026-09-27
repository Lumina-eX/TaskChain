import type { Metadata } from 'next'
import { EarningsAnalyticsDashboard } from '@/components/freelancer/earnings-analytics'

export const metadata: Metadata = {
  title: 'Earnings & Payment Analytics | TaskChain',
  description:
    'Track freelancer earnings, pending escrow, released payments, and monthly trends.',
}

export default function FreelancerEarningsPage() {
  return (
    <main className="min-h-screen bg-background">
      <EarningsAnalyticsDashboard />
    </main>
  )
}
