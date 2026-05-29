import { Hero } from '@/components/hero'
import { Features } from '@/components/features'
import { HowItWorks } from '@/components/how-it-works'
import { Benefits } from '@/components/benefits'
import { Testimonials } from '@/components/testimonials'
import { CTA } from '@/components/cta'
import { Footer } from '@/components/footer'
import { Navbar } from '@/components/navbar'
import ActivityTimeline from '@/components/ActivityTimeline';

export default function Home() {
  return (
    <main className="min-h-screen">
      <Navbar />
      <Hero />
      
      {/* This is the timeline section we added */}
      <section className="py-12 bg-gray-50">
        <ActivityTimeline />
      </section>

      <Features />
      <HowItWorks />
      <Benefits />
      <Testimonials />
      <CTA />
      <Footer />
    </main>
  );
}
