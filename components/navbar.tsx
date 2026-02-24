'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Menu, X, Wallet } from 'lucide-react'
import { useState, useEffect } from 'react'

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [address, setAddress] = useState<string | null>(null)

  useEffect(() => {
    const savedAddress = localStorage.getItem('stellar_wallet_address')
    if (savedAddress) {
      setAddress(savedAddress)
    }
  }, [])

  const formatAddress = (addr: string) => {
    if (!addr || addr.length <= 10) return addr;
    return `${addr.substring(0, 5)}...${addr.substring(addr.length - 4)}`
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/40 backdrop-blur-xl bg-background/80">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary via-secondary to-accent" />
            <span className="text-xl font-bold text-foreground">TaskChain</span>
          </div>

          <div className="hidden md:flex items-center gap-8">
            <Link href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Features
            </Link>
            <Link href="#how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              How It Works
            </Link>
            <Link href="#benefits" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Benefits
            </Link>
            <Link href="#testimonials" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Testimonials
            </Link>
          </div>

          <div className="hidden md:flex items-center gap-4">
            {address ? (
              <Button variant="outline" asChild>
                <Link href="/login">
                  <Wallet className="w-4 h-4 mr-2" />
                  {formatAddress(address)}
                </Link>
              </Button>
            ) : (
              <>
                <Button variant="ghost" asChild>
                  <Link href="/login">Login</Link>
                </Button>
                <Button asChild>
                  <Link href="/signup">Get Started</Link>
                </Button>
              </>
            )}
          </div>

          <button
            className="md:hidden p-2 text-muted-foreground hover:text-foreground"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden border-t border-border/40 bg-background/95 backdrop-blur-xl">
          <div className="px-4 py-6 space-y-4">
            <Link href="#features" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">
              Features
            </Link>
            <Link href="#how-it-works" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">
              How It Works
            </Link>
            <Link href="#benefits" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">
              Benefits
            </Link>
            <Link href="#testimonials" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">
              Testimonials
            </Link>
            <div className="pt-4 space-y-2">
              {address ? (
                <Button variant="outline" className="w-full" asChild>
                  <Link href="/login">
                    <Wallet className="w-4 h-4 mr-2" />
                    {formatAddress(address)}
                  </Link>
                </Button>
              ) : (
                <>
                  <Button variant="ghost" className="w-full" asChild>
                    <Link href="/login">Login</Link>
                  </Button>
                  <Button className="w-full" asChild>
                    <Link href="/signup">Get Started</Link>
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  )
}
