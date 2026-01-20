import { Search, FileText, Lock, CheckCircle } from 'lucide-react'

const steps = [
  {
    icon: Search,
    title: 'Find or Post Work',
    description: 'Clients post jobs, freelancers browse opportunities and submit proposals.',
    number: '01',
  },
  {
    icon: FileText,
    title: 'Accept Proposal',
    description: 'Client reviews proposals and accepts the best fit for their project.',
    number: '02',
  },
  {
    icon: Lock,
    title: 'Funds Escrowed',
    description: 'Payment is locked in a smart contract on Stellar blockchain for security.',
    number: '03',
  },
  {
    icon: CheckCircle,
    title: 'Complete & Release',
    description: 'Work is delivered, reviewed, and funds are automatically released to freelancer.',
    number: '04',
  },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-24 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="text-center space-y-4 mb-16">
          <h2 className="text-3xl md:text-5xl font-bold text-balance">
            How It Works
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground text-balance">
            Simple, secure, and transparent process from start to finish.
          </p>
        </div>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((step, index) => {
            const Icon = step.icon
            return (
              <div key={step.title} className="relative">
                <div className="flex flex-col items-center text-center space-y-4">
                  <div className="relative">
                    <div className="absolute -top-4 -left-4 text-6xl font-bold text-primary/10">
                      {step.number}
                    </div>
                    <div className="relative h-16 w-16 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                      <Icon className="h-8 w-8 text-white" />
                    </div>
                  </div>
                  
                  <h3 className="text-xl font-semibold">{step.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {step.description}
                  </p>
                </div>
                
                {index < steps.length - 1 && (
                  <div className="hidden lg:block absolute top-8 left-[60%] w-[80%] h-0.5 bg-gradient-to-r from-primary to-transparent" />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
