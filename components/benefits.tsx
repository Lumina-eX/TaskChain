import { Users, Briefcase } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export function Benefits() {
  return (
    <section id="benefits" className="py-24 px-4 sm:px-6 lg:px-8 bg-muted/30">
      <div className="mx-auto max-w-7xl">
        <div className="text-center space-y-4 mb-16">
          <h2 className="text-3xl md:text-5xl font-bold text-balance">
            Built for Everyone
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground text-balance">
            Whether you're hiring or looking for work, TaskChain has you covered.
          </p>
        </div>
        
        <div className="grid md:grid-cols-2 gap-8">
          <div className="group p-8 rounded-2xl bg-gradient-to-br from-primary/10 via-secondary/10 to-transparent border border-border/40 hover:border-primary/50 transition-all duration-300">
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                  <Briefcase className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-2xl font-bold">For Freelancers</h3>
              </div>
              
              <ul className="space-y-3 text-muted-foreground">
                <li className="flex items-start gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                  <span className="leading-relaxed">Get paid instantly when work is approved</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                  <span className="leading-relaxed">No platform fees - keep 100% of your earnings</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                  <span className="leading-relaxed">Protected by blockchain escrow - guaranteed payment</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                  <span className="leading-relaxed">Build reputation with verified reviews</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                  <span className="leading-relaxed">Fair dispute resolution when needed</span>
                </li>
              </ul>
              
              <Button className="w-full group-hover:scale-105 transition-transform" asChild>
                <Link href="/signup?type=freelancer">Start Freelancing</Link>
              </Button>
            </div>
          </div>
          
          <div className="group p-8 rounded-2xl bg-gradient-to-br from-accent/10 via-secondary/10 to-transparent border border-border/40 hover:border-accent/50 transition-all duration-300">
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 rounded-xl bg-gradient-to-br from-accent to-secondary flex items-center justify-center">
                  <Users className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-2xl font-bold">For Clients</h3>
              </div>
              
              <ul className="space-y-3 text-muted-foreground">
                <li className="flex items-start gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-accent mt-2 flex-shrink-0" />
                  <span className="leading-relaxed">Pay only when work meets your standards</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-accent mt-2 flex-shrink-0" />
                  <span className="leading-relaxed">Funds secured in escrow for your protection</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-accent mt-2 flex-shrink-0" />
                  <span className="leading-relaxed">Access to verified freelancers with proven track records</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-accent mt-2 flex-shrink-0" />
                  <span className="leading-relaxed">Milestone-based payments for project control</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-accent mt-2 flex-shrink-0" />
                  <span className="leading-relaxed">Transparent pricing with no hidden fees</span>
                </li>
              </ul>
              
              <Button className="w-full group-hover:scale-105 transition-transform" variant="secondary" asChild>
                <Link href="/signup?type=client">Hire Talent</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
