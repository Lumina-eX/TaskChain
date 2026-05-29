'use client'

import { CheckCircle2, Clock, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface Milestone {
  id: string
  title: string
  description: string
  amount: number
  status: 'completed' | 'in-progress' | 'pending'
  dueDate: string
  deliverables: string[]
}

const mockMilestones: Milestone[] = [
  {
    id: '1',
    title: 'Design & Mockups',
    description: 'Complete design mockups and wireframes',
    amount: 1250,
    status: 'completed',
    dueDate: '2024-02-15',
    deliverables: ['Homepage mockup', 'Dashboard mockup', 'Mobile views'],
  },
  {
    id: '2',
    title: 'Frontend Development',
    description: 'Build responsive frontend',
    amount: 2000,
    status: 'in-progress',
    dueDate: '2024-03-01',
    deliverables: ['React components', 'CSS styling', 'Responsive design'],
  },
  {
    id: '3',
    title: 'Backend Integration',
    description: 'Integrate with APIs',
    amount: 1500,
    status: 'pending',
    dueDate: '2024-03-15',
    deliverables: ['API integration', 'Database setup', 'Authentication'],
  },
  {
    id: '4',
    title: 'Testing & Deployment',
    description: 'QA testing and deployment',
    amount: 250,
    status: 'pending',
    dueDate: '2024-03-30',
    deliverables: ['Testing report', 'Bug fixes', 'Production deployment'],
  },
]

const statusConfig = {
  completed: { icon: CheckCircle2, color: 'text-accent', bg: 'bg-accent/10' },
  'in-progress': { icon: Clock, color: 'text-secondary', bg: 'bg-secondary/10' },
  pending: { icon: AlertCircle, color: 'text-muted-foreground', bg: 'bg-muted/10' },
}

export function MilestonesList({ projectId }: { projectId: string }) {
  return (
    <div className="space-y-4">
      {mockMilestones.map((milestone) => {
        const config = statusConfig[milestone.status]
        const Icon = config.icon

        return (
          <div
            key={milestone.id}
            className="p-4 rounded-lg border border-border/40 bg-card/30 hover:bg-card/50 transition-colors"
          >
            <div className="space-y-3">
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-3 flex-1">
                  <Icon className={`h-5 w-5 mt-1 flex-shrink-0 ${config.color}`} />
                  <div>
                    <h4 className="font-semibold">{milestone.title}</h4>
                    <p className="text-sm text-muted-foreground">{milestone.description}</p>
                  </div>
                </div>
                <Badge variant="outline" className={`flex-shrink-0 ${config.bg}`}>
                  {milestone.status.replace('-', ' ')}
                </Badge>
              </div>

              {/* Details */}
              <div className="grid grid-cols-3 gap-4 text-sm pl-8">
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Amount</p>
                  <p className="font-semibold">${milestone.amount.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Due Date</p>
                  <p className="font-semibold">{new Date(milestone.dueDate).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Deliverables</p>
                  <p className="font-semibold">{milestone.deliverables.length} items</p>
                </div>
              </div>

              {/* Deliverables */}
              <div className="pl-8">
                <p className="text-xs text-muted-foreground mb-2">Deliverables:</p>
                <ul className="space-y-1">
                  {milestone.deliverables.map((item, idx) => (
                    <li key={idx} className="text-sm text-muted-foreground flex items-center gap-2">
                      <div className="h-1 w-1 rounded-full bg-primary" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Actions */}
              {milestone.status === 'completed' && (
                <div className="pl-8 pt-2">
                  <Button size="sm" className="group">
                    <CheckCircle2 className="mr-2 h-4 w-4 group-hover:scale-110 transition-transform" />
                    Approve & Release Payment
                  </Button>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
