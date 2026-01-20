import { Shield, Lock, Zap, Users, FileCheck, Star } from 'lucide-react'

const features = [
  {
    icon: Shield,
    title: 'Escrow Protection',
    description: 'Funds are secured in blockchain smart contracts until work is completed and approved by both parties.',
  },
  {
    icon: Lock,
    title: 'Blockchain Security',
    description: 'Built on Stellar blockchain for transparent, immutable, and secure transactions.',
  },
  {
    icon: Zap,
    title: 'Instant Payments',
    description: 'Get paid immediately upon project completion. No waiting periods or delays.',
  },
  {
    icon: Users,
    title: 'Dispute Resolution',
    description: 'Fair and transparent dispute resolution system to protect both parties.',
  },
  {
    icon: FileCheck,
    title: 'Milestone Tracking',
    description: 'Break projects into milestones with automatic escrow release upon completion.',
  },
  {
    icon: Star,
    title: 'Review System',
    description: 'Build your reputation with verified reviews from completed projects.',
  },
]

export function Features() {
  return (
    <section id="features" className="py-24 px-4 sm:px-6 lg:px-8 bg-muted/30">
      <div className="mx-auto max-w-7xl">
        <div className="text-center space-y-4 mb-16">
          <h2 className="text-3xl md:text-5xl font-bold text-balance">
            Why Choose TaskChain?
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground text-balance">
            Built for the modern freelancer and client, with security and trust at the core.
          </p>
        </div>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature) => {
            const Icon = feature.icon
            return (
              <div
                key={feature.title}
                className="group relative p-6 rounded-xl bg-card/50 backdrop-blur-sm border border-border/40 hover:border-primary/50 transition-all duration-300"
              >
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 h-12 w-12 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl font-semibold">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
