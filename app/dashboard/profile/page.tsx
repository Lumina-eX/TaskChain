import type { Metadata } from 'next'
import { FreelancerProfile } from '@/components/freelancer/freelancer-profile'

export const metadata: Metadata = {
  title: 'Profile | TaskChain',
  description: 'View your freelancer profile, reputation score, skills, and completed projects.',
}

export default function ProfilePage() {
  return (
    <main className="min-h-screen bg-background">
      <FreelancerProfile />
    </main>
  )
}
