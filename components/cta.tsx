import { Button } from '@/components/ui/button'
import { ArrowRight } from 'lucide-react'
import Link from 'next/link'

export function CTA() {
  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 bg-muted/30">
      <div className="mx-auto max-w-7xl">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary/20 via-secondary/20 to-accent/20 p-12 md:p-16">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_50%,rgba(120,119,198,0.4),transparent_50%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_50%,rgba(74,222,128,0.3),transparent_50%)]" />
          
          <div className="relative text-center space-y-8">
            <h2 className="text-3xl md:text-5xl font-bold text-balance">
              Ready to Work Securely?
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-muted-foreground text-balance">
              Join TaskChain today and experience the future of freelancing with blockchain-powered escrow protection.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button size="lg" className="group" asChild>
                <Link href="/signup">
                  Get Started Free
                  <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="#features">Learn More</Link>
              </Button>
            </div>
            
            <p className="text-sm text-muted-foreground">
              No credit card required • Free to join • Start earning today
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
