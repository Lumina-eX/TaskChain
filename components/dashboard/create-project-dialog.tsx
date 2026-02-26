'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface CreateProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateProjectDialog({ open, onOpenChange }: CreateProjectDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    budget: '',
    deadline: '',
    milestones: '3',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    
    // Simulate API call
    setTimeout(() => {
      setIsLoading(false)
      onOpenChange(false)
      setFormData({
        title: '',
        description: '',
        budget: '',
        deadline: '',
        milestones: '3',
      })
    }, 1500)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Create New Project
          </DialogTitle>
          <DialogDescription>
            Define your project requirements and budget to get started
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title" className="text-sm font-semibold">
              Project Title
            </Label>
            <Input
              id="title"
              placeholder="e.g., Website Redesign"
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
              required
              className="border-border/40"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description" className="text-sm font-semibold">
              Description
            </Label>
            <Textarea
              id="description"
              placeholder="Describe your project requirements..."
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              required
              className="border-border/40 resize-none"
              rows={4}
            />
          </div>

          {/* Budget */}
          <div className="space-y-2">
            <Label htmlFor="budget" className="text-sm font-semibold">
              Budget (USD)
            </Label>
            <Input
              id="budget"
              type="number"
              placeholder="5000"
              value={formData.budget}
              onChange={(e) =>
                setFormData({ ...formData, budget: e.target.value })
              }
              required
              min="100"
              className="border-border/40"
            />
          </div>

          {/* Deadline */}
          <div className="space-y-2">
            <Label htmlFor="deadline" className="text-sm font-semibold">
              Deadline
            </Label>
            <Input
              id="deadline"
              type="date"
              value={formData.deadline}
              onChange={(e) =>
                setFormData({ ...formData, deadline: e.target.value })
              }
              required
              className="border-border/40"
            />
          </div>

          {/* Milestones */}
          <div className="space-y-2">
            <Label htmlFor="milestones" className="text-sm font-semibold">
              Number of Milestones
            </Label>
            <Select value={formData.milestones} onValueChange={(value) =>
              setFormData({ ...formData, milestones: value })
            }>
              <SelectTrigger className="border-border/40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 Milestone</SelectItem>
                <SelectItem value="2">2 Milestones</SelectItem>
                <SelectItem value="3">3 Milestones</SelectItem>
                <SelectItem value="4">4 Milestones</SelectItem>
                <SelectItem value="5">5 Milestones</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Info Box */}
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/30 text-sm text-muted-foreground">
            <p className="font-semibold text-foreground mb-1">💡 How it works:</p>
            <p>Your budget will be escrowed on the Stellar blockchain. The freelancer will receive payment as each milestone is completed and approved.</p>
          </div>

          <DialogFooter className="gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!formData.title || !formData.description || !formData.budget || !formData.deadline || isLoading}
              className="group"
            >
              {isLoading ? (
                <>Creating...</>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4 group-hover:scale-110 transition-transform" />
                  Create Project
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
