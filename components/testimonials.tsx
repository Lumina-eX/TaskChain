import { Star } from 'lucide-react'

const testimonials = [
  {
    name: 'Sarah Chen',
    role: 'Web Developer',
    avatar: '/avatars/sarah.jpg',
    content: "TaskChain changed the game for me. I finally feel secure taking on new clients knowing the payment is guaranteed through escrow. No more chasing invoices!",
    rating: 5,
  },
  {
    name: 'Michael Rodriguez',
    role: 'Startup Founder',
    avatar: '/avatars/michael.jpg',
    content: "As a client, I love that I can verify work before releasing payment. The milestone system gives me control while still being fair to freelancers.",
    rating: 5,
  },
  {
    name: 'Emily Watson',
    role: 'Graphic Designer',
    avatar: '/avatars/emily.jpg',
    content: "Zero platform fees means I actually keep what I earn. Plus, instant payments on the blockchain are incredible. This is the future of freelancing.",
    rating: 5,
  },
]

export function Testimonials() {
  return (
    <section id="testimonials" className="py-24 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="text-center space-y-4 mb-16">
          <h2 className="text-3xl md:text-5xl font-bold text-balance">
            Trusted by Freelancers & Clients
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground text-balance">
            Join thousands who have already made the switch to secure, blockchain-powered freelancing.
          </p>
        </div>
        
        <div className="grid md:grid-cols-3 gap-8">
          {testimonials.map((testimonial) => (
            <div
              key={testimonial.name}
              className="p-6 rounded-xl bg-card/50 backdrop-blur-sm border border-border/40 space-y-4"
            >
              <div className="flex gap-1">
                {Array.from({ length: testimonial.rating }).map((_, i) => (
                  <Star key={i} className="h-5 w-5 fill-primary text-primary" />
                ))}
              </div>
              
              <p className="text-muted-foreground leading-relaxed">
                "{testimonial.content}"
              </p>
              
              <div className="flex items-center gap-3 pt-4 border-t border-border/40">
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-accent" />
                <div>
                  <p className="font-semibold">{testimonial.name}</p>
                  <p className="text-sm text-muted-foreground">{testimonial.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
