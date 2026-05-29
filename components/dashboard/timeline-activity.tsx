'use client'

import { CheckCircle2, MessageSquare, Upload, AlertCircle, Clock } from 'lucide-react'

interface ActivityItem {
  id: string
  type: 'completed' | 'comment' | 'upload' | 'dispute' | 'created'
  title: string
  description: string
  timestamp: string
  actor: string
}

const mockActivities: ActivityItem[] = [
  {
    id: '1',
    type: 'completed',
    title: 'Milestone 2 Completed',
    description: 'Frontend Development milestone has been marked as complete',
    timestamp: '2 hours ago',
    actor: 'Alex Johnson',
  },
  {
    id: '2',
    type: 'upload',
    title: 'Files Uploaded',
    description: 'Component Library and design specifications uploaded',
    timestamp: '5 hours ago',
    actor: 'Alex Johnson',
  },
  {
    id: '3',
    type: 'comment',
    title: 'Message from Freelancer',
    description: '"Milestone 1 is ready for review. Please check the files."',
    timestamp: '1 day ago',
    actor: 'Alex Johnson',
  },
  {
    id: '4',
    type: 'completed',
    title: 'Milestone 1 Approved',
    description: 'Design & Mockups milestone approved. $1,250 released.',
    timestamp: '2 days ago',
    actor: 'You',
  },
  {
    id: '5',
    type: 'created',
    title: 'Project Created',
    description: 'Website Redesign project has been created with 4 milestones',
    timestamp: '5 days ago',
    actor: 'You',
  },
]

const iconConfig = {
  completed: { icon: CheckCircle2, color: 'text-accent', bgColor: 'bg-accent/10' },
  comment: { icon: MessageSquare, color: 'text-secondary', bgColor: 'bg-secondary/10' },
  upload: { icon: Upload, color: 'text-primary', bgColor: 'bg-primary/10' },
  dispute: { icon: AlertCircle, color: 'text-destructive', bgColor: 'bg-destructive/10' },
  created: { icon: Clock, color: 'text-muted-foreground', bgColor: 'bg-muted/10' },
}

export function TimelineActivity() {
  return (
    <div className="space-y-4">
      {mockActivities.map((activity, index) => {
        const config = iconConfig[activity.type]
        const Icon = config.icon

        return (
          <div key={activity.id} className="flex gap-4">
            {/* Timeline line */}
            <div className="relative flex flex-col items-center">
              <div className={`h-10 w-10 rounded-full ${config.bgColor} flex items-center justify-center flex-shrink-0`}>
                <Icon className={`h-5 w-5 ${config.color}`} />
              </div>
              {index < mockActivities.length - 1 && (
                <div className="w-0.5 h-16 bg-border/40 mt-2" />
              )}
            </div>

            {/* Content */}
            <div className="pb-4 pt-1 flex-1 min-w-0">
              <div>
                <p className="font-semibold">{activity.title}</p>
                <p className="text-sm text-muted-foreground mt-1">{activity.description}</p>
              </div>
              <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                <span>{activity.actor}</span>
                <span>•</span>
                <span>{activity.timestamp}</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
