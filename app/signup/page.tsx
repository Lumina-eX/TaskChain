'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Briefcase, Code2, Shield, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Role = 'client' | 'freelancer'

const roles = [
  {
    id: 'client' as Role,
    icon: Briefcase,
    title: 'I\'m a Client',
    description: 'I want to post projects, hire talent, and pay securely through escrow.',
    perks: ['Post unlimited projects', 'Milestone-based payments', 'Dispute protection'],
  },
  {
    id: 'freelancer' as Role,
    icon: Code2,
    title: 'I\'m a Freelancer',
    description: 'I want to find work, get paid on-chain, and build my reputation.',
    perks: ['Guaranteed milestone payouts', 'On-chain reputation', 'Zero platform fees'],
  },
]

export default function SignupPage() {
  const router = useRouter()
  const [selected, setSelected] = useState<Role | null>(null)

  const handleContinue = () => {
    if (!selected) return
    // Pass role as query param so the login/wallet-connect page can store it
    router.push(`/login?role=${selected}`)
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      {/* Background glows — matches login page */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/20 rounded-full blur-[120px] opacity-20 pointer-events-none" />
      <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-accent/20 rounded-full blur-[100px] opacity-20 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-secondary/20 rounded-full blur-[100px] opacity-20 pointer-events-none" />

      {/* Back button */}
      <div className="absolute top-4 left-4 z-20 md:top-8 md:left-8">
        <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground">
          <Link href="/">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Home
          </Link>
        </Button>
      </div>

      <div className="relative z-10 w-full max-w-2xl space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-card/50 backdrop-blur-sm border border-border/40 text-xs text-muted-foreground">
            <Shield className="h-3.5 w-3.5 text-primary" />
            Powered by Stellar Blockchain
          </div>
          <h1 className="text-3xl font-bold">Get started on TaskChain</h1>
          <p className="text-muted-foreground">Choose how you want to use the platform</p>
        </div>

        {/* Role cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {roles.map((role) => {
            const Icon = role.icon
            const isSelected = selected === role.id
            return (
              <button
                key={role.id}
                onClick={() => setSelected(role.id)}
                className={cn(
                  'relative text-left p-6 rounded-2xl border-2 transition-all duration-200 bg-card/50 backdrop-blur-sm',
                  'hover:border-primary/50 hover:bg-card/80',
                  isSelected
                    ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10'
                    : 'border-border/40'
                )}
              >
                {/* Selected indicator */}
                {isSelected && (
                  <span className="absolute top-4 right-4 w-2.5 h-2.5 rounded-full bg-primary" />
                )}

                <div className="space-y-4">
                  <div className={cn(
                    'w-12 h-12 rounded-xl flex items-center justify-center transition-colors',
                    isSelected ? 'bg-primary/20' : 'bg-muted/50'
                  )}>
                    <Icon className={cn('h-6 w-6', isSelected ? 'text-primary' : 'text-muted-foreground')} />
                  </div>

                  <div>
                    <p className="font-semibold text-foreground">{role.title}</p>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                      {role.description}
                    </p>
                  </div>

                  <ul className="space-y-1.5">
                    {role.perks.map((perk) => (
                      <li key={perk} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Zap className={cn('h-3 w-3 shrink-0', isSelected ? 'text-primary' : 'text-muted-foreground/50')} />
                        {perk}
                      </li>
                    ))}
                  </ul>
                </div>
              </button>
            )
          })}
        </div>

        {/* Continue */}
        <div className="space-y-4">
          <Button
            size="lg"
            className="w-full group"
            disabled={!selected}
            onClick={handleContinue}
          >
            Continue with wallet
            <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Already have an account?{' '}
            <Link href="/login" className="text-primary hover:underline underline-offset-4">
              Connect wallet
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
