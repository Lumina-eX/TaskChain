'use client'

import { useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { format } from 'date-fns'
import { toast } from 'sonner'
import {
  Plus,
  Trash2,
  ChevronRight,
  ChevronLeft,
  Check,
  Loader2,
  CalendarIcon,
  Rocket,
  AlertCircle,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'

// ─── Schemas ────────────────────────────────────────────────────────────────

const basicDetailsSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters'),
  description: z.string().min(20, 'Description must be at least 20 characters'),
  category: z.string().min(1, 'Please select a category'),
  deadline: z.date({ required_error: 'Deadline is required' }).refine(
    (d) => d > new Date(),
    'Deadline must be in the future'
  ),
})

const milestoneItemSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters'),
  description: z.string().optional(),
  amount: z.coerce.number().positive('Amount must be positive'),
  dueDate: z.date({ required_error: 'Due date is required' }).refine(
    (d) => d > new Date(),
    'Due date must be in the future'
  ),
})

const milestonesSchema = z.object({
  milestones: z
    .array(milestoneItemSchema)
    .min(1, 'Add at least one milestone'),
})

const budgetSchema = z.object({
  currency: z.string().min(1, 'Please select a currency'),
  terms: z.string().optional(),
})

// Combined full schema
const fullSchema = basicDetailsSchema
  .merge(milestonesSchema)
  .merge(budgetSchema)

type FullFormValues = z.infer<typeof fullSchema>

// ─── Step config ────────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: 'Basic Details' },
  { id: 2, label: 'Milestones' },
  { id: 3, label: 'Budget' },
  { id: 4, label: 'Confirm' },
]

const CATEGORIES = [
  'Web Development',
  'Mobile Development',
  'Design & Creative',
  'Writing & Content',
  'Marketing',
  'Data & Analytics',
  'DevOps & Cloud',
  'Other',
]

const CURRENCIES = ['USDC', 'XLM', 'USDT']

// ─── Props ───────────────────────────────────────────────────────────────────

interface CreateProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CreateProjectDialog({ open, onOpenChange }: CreateProjectDialogProps) {
  const [step, setStep] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [deployError, setDeployError] = useState<string | null>(null)

  const form = useForm<FullFormValues>({
    resolver: zodResolver(fullSchema),
    defaultValues: {
      title: '',
      description: '',
      category: '',
      deadline: undefined,
      milestones: [{ title: '', description: '', amount: 0, dueDate: undefined }],
      currency: 'USDC',
      terms: '',
    },
    mode: 'onTouched',
  })

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'milestones',
  })

  const watchedMilestones = form.watch('milestones')
  const watchedCurrency = form.watch('currency')
  const totalBudget = watchedMilestones.reduce(
    (sum, m) => sum + (Number(m.amount) || 0),
    0
  )

  // ── Step validation ──────────────────────────────────────────────────────

  const validateStep = async (current: number): Promise<boolean> => {
    const fieldsToValidate: (keyof FullFormValues)[] =
      current === 1
        ? ['title', 'description', 'category', 'deadline']
        : current === 2
        ? ['milestones']
        : current === 3
        ? ['currency']
        : []

    if (fieldsToValidate.length === 0) return true
    return form.trigger(fieldsToValidate as Parameters<typeof form.trigger>[0])
  }

  const handleNext = async () => {
    const valid = await validateStep(step)
    if (valid) {
      setDeployError(null)
      setStep((s) => Math.min(s + 1, 4))
    }
  }

  const handleBack = () => {
    setDeployError(null)
    setStep((s) => Math.max(s - 1, 1))
  }

  const handleClose = () => {
    if (isSubmitting) return
    onOpenChange(false)
    // Defer reset so the closing animation isn't janky
    setTimeout(() => {
      setStep(1)
      setSubmitted(false)
      setDeployError(null)
      form.reset()
    }, 300)
  }

  const onSubmit = async (values: FullFormValues) => {
    setIsSubmitting(true)
    setDeployError(null)

    try {
      const payload = {
        title: values.title,
        description: values.description,
        category: values.category,
        deadline: values.deadline.toISOString(),
        totalAmount: totalBudget.toFixed(2),
        currency: values.currency,
        terms: values.terms || undefined,
        milestones: values.milestones.map((m) => ({
          title: m.title,
          description: m.description || undefined,
          amount: Number(m.amount).toFixed(2),
          dueDate: m.dueDate.toISOString(),
        })),
      }

      // In dev, the mock login stores the access token in localStorage as a
      // fallback for environments where httpOnly cookies aren't forwarded.
      const devToken =
        typeof window !== 'undefined'
          ? localStorage.getItem('tc_dev_access_token')
          : null

      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (devToken) headers['Authorization'] = `Bearer ${devToken}`

      const res = await fetch('/api/projects/create', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data?.error ?? `Request failed (${res.status})`)
      }

      setSubmitted(true)
      toast.success('Project created!', {
        description: `"${data.title}" saved with ${data.milestonesCreated} milestone(s).`,
      })
      setTimeout(() => handleClose(), 2000)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.'
      setDeployError(message)
      toast.error('Failed to create project', { description: message })
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" />
            Create New Project
          </DialogTitle>
          <DialogDescription>
            {submitted ? 'Your project is being deployed!' : `Step ${step} of ${STEPS.length}`}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        {!submitted && (
          <StepIndicator currentStep={step} steps={STEPS} />
        )}

        {submitted ? (
          <SuccessView />
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 py-2">
              {step === 1 && <StepBasicDetails form={form} />}
              {step === 2 && (
                <StepMilestones
                  form={form}
                  fields={fields}
                  append={append}
                  remove={remove}
                />
              )}
              {step === 3 && (
                <StepBudget
                  form={form}
                  totalBudget={totalBudget}
                  currency={watchedCurrency}
                  milestoneCount={fields.length}
                />
              )}
              {step === 4 && (
                <StepConfirm
                  values={form.getValues()}
                  totalBudget={totalBudget}
                  deployError={deployError}
                />
              )}

              {/* Navigation */}
              <div className="flex justify-between pt-2 border-t border-border/40">
                <Button
                  type="button"
                  variant="outline"
                  onClick={step === 1 ? handleClose : handleBack}
                  disabled={isSubmitting}
                >
                  {step === 1 ? (
                    'Cancel'
                  ) : (
                    <>
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Back
                    </>
                  )}
                </Button>

                {step < 4 ? (
                  <Button type="button" onClick={handleNext}>
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                ) : (
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Deploying…
                      </>
                    ) : (
                      <>
                        <Rocket className="h-4 w-4 mr-2" />
                        Deploy Project
                      </>
                    )}
                  </Button>
                )}
              </div>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Step Indicator ──────────────────────────────────────────────────────────

function StepIndicator({
  currentStep,
  steps,
}: {
  currentStep: number
  steps: typeof STEPS
}) {
  return (
    <nav aria-label="Form steps" className="flex items-start gap-0 py-1 overflow-x-auto">
      {steps.map((s, i) => {
        const done = currentStep > s.id
        const active = currentStep === s.id
        return (
          <div key={s.id} className="flex items-center flex-1 min-w-0">
            {/* Step bubble + label */}
            <div className="flex flex-col items-center gap-1 flex-1 min-w-0 px-1">
              <div
                className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors shrink-0',
                  done
                    ? 'bg-primary border-primary text-primary-foreground'
                    : active
                    ? 'border-primary text-primary bg-primary/10'
                    : 'border-border text-muted-foreground bg-muted/30'
                )}
                aria-current={active ? 'step' : undefined}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : s.id}
              </div>
              <span
                className={cn(
                  'text-[10px] font-medium text-center leading-tight w-full truncate',
                  active ? 'text-primary' : done ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {s.label}
              </span>
            </div>
            {/* Connector line — hidden on last step */}
            {i < steps.length - 1 && (
              <div
                className={cn(
                  'h-0.5 w-4 sm:w-8 shrink-0 mb-4 rounded transition-colors',
                  currentStep > s.id ? 'bg-primary' : 'bg-border'
                )}
              />
            )}
          </div>
        )
      })}
    </nav>
  )
}

// ─── Step 1: Basic Details ───────────────────────────────────────────────────

function StepBasicDetails({ form }: { form: ReturnType<typeof useForm<FullFormValues>> }) {
  return (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name="title"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Project Title</FormLabel>
            <FormControl>
              <Input placeholder="e.g., Website Redesign" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="description"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Description</FormLabel>
            <FormControl>
              <Textarea
                placeholder="Describe your project requirements in detail…"
                rows={4}
                className="resize-none"
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="category"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Category</FormLabel>
            <Select onValueChange={field.onChange} value={field.value}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="deadline"
        render={({ field }) => (
          <FormItem className="flex flex-col">
            <FormLabel>Project Deadline</FormLabel>
            <Popover>
              <PopoverTrigger asChild>
                <FormControl>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full pl-3 text-left font-normal',
                      !field.value && 'text-muted-foreground'
                    )}
                  >
                    {field.value ? format(field.value, 'PPP') : 'Pick a date'}
                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                  </Button>
                </FormControl>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={field.value}
                  onSelect={field.onChange}
                  disabled={(d) => d <= new Date()}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  )
}

// ─── Step 2: Milestones ──────────────────────────────────────────────────────

function StepMilestones({
  form,
  fields,
  append,
  remove,
}: {
  form: ReturnType<typeof useForm<FullFormValues>>
  fields: ReturnType<typeof useFieldArray<FullFormValues, 'milestones'>>['fields']
  append: ReturnType<typeof useFieldArray<FullFormValues, 'milestones'>>['append']
  remove: ReturnType<typeof useFieldArray<FullFormValues, 'milestones'>>['remove']
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Break your project into milestones. Each milestone will be escrowed separately.
      </p>

      {fields.map((field, index) => (
        <div
          key={field.id}
          className="p-4 rounded-lg border border-border/40 bg-muted/10 space-y-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground">
              Milestone {index + 1}
            </span>
            {fields.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={() => remove(index)}
                aria-label={`Remove milestone ${index + 1}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>

          <FormField
            control={form.control}
            name={`milestones.${index}.title`}
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">Title</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Design Mockups" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name={`milestones.${index}.description`}
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">Description (optional)</FormLabel>
                <FormControl>
                  <Input placeholder="Brief description…" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField
              control={form.control}
              name={`milestones.${index}.amount`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Amount</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="1"
                      placeholder="500"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name={`milestones.${index}.dueDate`}
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel className="text-xs">Due Date</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className={cn(
                            'w-full pl-3 text-left font-normal text-xs h-9',
                            !field.value && 'text-muted-foreground'
                          )}
                        >
                          {field.value ? format(field.value, 'MMM d, yyyy') : 'Pick date'}
                          <CalendarIcon className="ml-auto h-3 w-3 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(d) => d <= new Date()}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>
      ))}

      {/* Root-level milestones error */}
      {form.formState.errors.milestones?.root && (
        <p className="text-sm text-destructive">
          {form.formState.errors.milestones.root.message}
        </p>
      )}

      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() =>
          append({ title: '', description: '', amount: 0, dueDate: undefined as unknown as Date })
        }
      >
        <Plus className="h-4 w-4 mr-2" />
        Add Milestone
      </Button>
    </div>
  )
}

// ─── Step 3: Budget Summary ──────────────────────────────────────────────────

function StepBudget({
  form,
  totalBudget,
  currency,
  milestoneCount,
}: {
  form: ReturnType<typeof useForm<FullFormValues>>
  totalBudget: number
  currency: string
  milestoneCount: number
}) {
  return (
    <div className="space-y-5">
      <div className="p-4 rounded-xl bg-primary/10 border border-primary/20 text-center space-y-1">
        <p className="text-sm text-muted-foreground">Total Escrow Amount</p>
        <p className="text-4xl font-bold text-primary">
          {totalBudget.toLocaleString()}
        </p>
        <p className="text-sm text-muted-foreground">
          across {milestoneCount} milestone{milestoneCount !== 1 ? 's' : ''}
        </p>
      </div>

      <FormField
        control={form.control}
        name="currency"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Currency</FormLabel>
            <Select onValueChange={field.onChange} value={field.value}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Select currency" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="terms"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Contract Terms (optional)</FormLabel>
            <FormControl>
              <Textarea
                placeholder="Any additional terms or conditions for the contract…"
                rows={3}
                className="resize-none"
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="p-3 rounded-lg bg-muted/30 border border-border/40 text-sm text-muted-foreground">
        <p className="font-semibold text-foreground mb-1">💡 How escrow works</p>
        <p>
          {totalBudget.toLocaleString()} {currency} will be locked in a Stellar smart contract.
          Funds are released to the freelancer only after you approve each milestone.
        </p>
      </div>
    </div>
  )
}

// ─── Step 4: Confirm & Deploy ────────────────────────────────────────────────

function StepConfirm({
  values,
  totalBudget,
  deployError,
}: {
  values: FullFormValues
  totalBudget: number
  deployError: string | null
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Review your project before deploying to the blockchain.
      </p>

      {/* Error banner */}
      {deployError && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{deployError}</span>
        </div>
      )}

      {/* Basic details */}
      <Section title="Basic Details">
        <Row label="Title" value={values.title} />
        <Row label="Category" value={values.category} />
        <Row
          label="Deadline"
          value={values.deadline ? format(values.deadline, 'PPP') : '—'}
        />
        <Row label="Description" value={values.description} multiline />
      </Section>

      {/* Milestones */}
      <Section title={`Milestones (${values.milestones.length})`}>
        {values.milestones.map((m, i) => (
          <div key={i} className="flex justify-between items-start text-sm py-1">
            <span className="text-muted-foreground truncate max-w-[60%]">
              {i + 1}. {m.title}
              {m.dueDate && (
                <span className="ml-1 text-xs opacity-70">
                  · {format(m.dueDate, 'MMM d')}
                </span>
              )}
            </span>
            <span className="font-semibold shrink-0">
              {Number(m.amount).toLocaleString()} {values.currency}
            </span>
          </div>
        ))}
      </Section>

      {/* Budget */}
      <Section title="Budget">
        <Row label="Currency" value={values.currency} />
        {values.terms && <Row label="Terms" value={values.terms} multiline />}
        <div className="flex justify-between items-center pt-2 border-t border-border/40 mt-2">
          <span className="font-semibold">Total Escrow</span>
          <span className="text-lg font-bold text-primary">
            {totalBudget.toLocaleString()} {values.currency}
          </span>
        </div>
      </Section>

      <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm text-amber-700 dark:text-amber-400">
        ⚠️ Deploying will create an on-chain escrow contract. This action cannot be undone.
      </div>
    </div>
  )
}

// ─── Success View ────────────────────────────────────────────────────────────

function SuccessView() {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-4 text-center">
      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
        <Check className="h-8 w-8 text-primary" />
      </div>
      <div>
        <p className="text-lg font-bold">Project Created!</p>
        <p className="text-sm text-muted-foreground mt-1">
          Your project and milestones have been saved to the database.
        </p>
      </div>
    </div>
  )
}

// ─── Small helpers ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border/40 bg-muted/10 overflow-hidden">
      <div className="px-4 py-2 bg-muted/20 border-b border-border/40">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </p>
      </div>
      <div className="px-4 py-3 space-y-1">{children}</div>
    </div>
  )
}

function Row({
  label,
  value,
  multiline,
}: {
  label: string
  value: string
  multiline?: boolean
}) {
  return (
    <div className={cn('text-sm', multiline ? 'space-y-0.5' : 'flex justify-between gap-2')}>
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={cn('font-medium', multiline ? 'text-foreground' : 'text-right truncate')}>
        {value}
      </span>
    </div>
  )
}
