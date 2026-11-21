/**
 * Milestone Progress Tracker - Public API
 * 
 * Export the main component and types for easy importing:
 * import { MilestoneProgressTracker, MilestoneTrackerData } from '@/components/dashboard/milestone-tracker'
 */

export {
  MilestoneProgressTracker,
  type MilestoneProgressTrackerProps,
  type MilestoneTrackerData,
  type MilestoneState,
} from './milestone-progress-tracker'

export { MilestoneProgressTrackerDemo } from './milestone-progress-tracker-demo'

export {
  calculateMilestoneMetrics,
  getAllowedStateTransitions,
  isValidStateTransition,
  formatMilestoneState,
  type MilestoneProgressMetrics,
  type MilestoneStateTransition,
} from '@/lib/milestone-tracker'

export {
  ContractMilestoneCalendar,
  type CalendarMilestone,
  type MilestoneStatus,
} from './contract-milestone-calendar'
