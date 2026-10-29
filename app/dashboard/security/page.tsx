import type { Metadata } from 'next'
import { SecurityDashboard } from './security-client'

export const metadata: Metadata = {
  title: 'Security | TaskChain',
  description:
    'Review account activity, monitor active sessions and manage who can access your TaskChain account.',
}

export default function SecurityPage() {
  return <SecurityDashboard />
}
