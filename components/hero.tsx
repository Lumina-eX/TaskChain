import { Button } from '@/components/ui/button'
import { ArrowRight, Shield, Zap } from 'lucide-react'
import Link from 'next/link'

export function Hero() {
  return (
    <section className="relative pt-32 pb-20 px-4 sm:px-6 lg:px-8 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-secondary/20 to-accent/20 opacity-50" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(120,119,198,0.3),transparent_50%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(74,222,128,0.2),transparent_50%)]" />

      <div className="relative mx-auto max-w-7xl">
        <div className="text-center space-y-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-card/50 backdrop-blur-sm border border-border/40">
            <Shield className="h-4 w-4 text-primary" />
            <span className="text-sm text-muted-foreground">Powered by Stellar Blockchain</span>
          </div>

          <h1 className="text-5xl md:text-7xl font-bold text-balance">
            Freelance with{' '}
            <span className="bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
              Confidence
            </span>
          </h1>

          <p className="mx-auto max-w-2xl text-lg md:text-xl text-muted-foreground text-balance">
            The Web3-powered platform that protects both clients and freelancers with blockchain-based escrow payments.
            Work securely, get paid fairly.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" className="group" asChild>
              <Link href="/signup">
                Get Started Free
                <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="#how-it-works">
                <Zap className="mr-2 h-4 w-4" />
                See How It Works
              </Link>
            </Button>
          </div>

          <div className="flex items-center justify-center gap-8 pt-8 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              <span>0% Platform Fees</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-secondary animate-pulse" />
              <span>Instant Payouts</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-accent animate-pulse" />
              <span>100% Secure</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
