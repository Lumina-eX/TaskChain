import { Suspense } from 'react'
import type { Metadata } from 'next'
import { ProjectDiscovery } from '@/components/projects/project-discovery'

export const metadata: Metadata = {
  title: 'Browse Projects | TaskChain',
  description:
    'Discover open TaskChain projects. Filter by budget, status, and required skills, then sort by newest, budget, or deadline.',
}

export default function ProjectsPage() {
  return (
    <Suspense fallback={null}>
      <ProjectDiscovery />
    </Suspense>
  )
}
