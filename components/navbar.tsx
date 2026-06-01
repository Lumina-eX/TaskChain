'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Menu, X, Wallet, User, Settings, LogOut, ChevronDown, AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import { ThemeToggle } from './ui/ThemeToggle'
import {
  useStellarWallet,
  truncateStellarAddress,
  networkLabel,
  REQUIRED_NETWORK,
  type StellarNetwork,
} from '@/components/wallet-provider'
import { useRouter } from 'next/navigation'

// ── Standalone sub-component ──────────────────────────────────────────────────

function NetworkBadge({
  network,
  isConnected,
}: {
  network: StellarNetwork
  isConnected: boolean
}) {
  if (!isConnected) return null
  const isTestnet = network === REQUIRED_NETWORK
  return (
    <span
      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none ${
        isTestnet
          ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
          : 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
      }`}
    >
      {networkLabel(network)}
    </span>
  )
}

export function Navbar() {
  const router = useRouter()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false)

  const {
    address,
    isConnected,
    isConnecting,
    isWrongNetwork,
    network,
    connect,
    disconnect,
  } = useStellarWallet()

  const closeMenus = () => {
    setMobileMenuOpen(false)
    setProfileDropdownOpen(false)
  }

  const handleConnect = async () => {
    await connect()
  }

  const handleDisconnect = () => {
    disconnect()
    closeMenus()
    router.push('/login')
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/40 backdrop-blur-xl bg-background/80">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          
          {/* Logo Section */}
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary via-secondary to-accent" />
            <span className="text-xl font-bold text-foreground">TaskChain</span>
          </div>

          {/* Desktop Navigation Links */}
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

          {/* Desktop Actions Area */}
          <div className="hidden md:flex items-center gap-4">

            {/* Wallet Button */}
            {isConnected && address ? (
              <Button
                variant="outline"
                size="sm"
                className={`gap-2 rounded-full font-medium ${isWrongNetwork ? 'border-amber-500/60 text-amber-600 dark:text-amber-400' : ''}`}
                onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
              >
                {isWrongNetwork ? (
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                ) : (
                  <Wallet className="h-4 w-4" />
                )}
                <span className="font-mono">{truncateStellarAddress(address)}</span>
              <NetworkBadge network={network} isConnected={isConnected} />
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              </Button>
            ) : (
              <Button
                id="navbar-connect-wallet"
                variant="default"
                size="sm"
                className="gap-2 rounded-full font-medium"
                onClick={handleConnect}
                disabled={isConnecting}
              >
                <Wallet className="h-4 w-4" />
                <span>{isConnecting ? 'Connecting…' : 'Connect Wallet'}</span>
              </Button>
            )}

            {/* Profile Dropdown */}
            {isConnected && (
              <div className="relative">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1 rounded-full p-1 pl-2 hover:bg-muted"
                  onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                >
                  <div className="flex h-6 w-full items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary px-2">
                    {address ? address[0] : 'U'}
                  </div>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${profileDropdownOpen ? "rotate-180" : ""}`} />
                </Button>

                {profileDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-56 origin-top-right rounded-xl border border-border/60 bg-background p-1 shadow-xl ring-1 ring-black/5 animate-in fade-in slide-in-from-top-1 duration-150">
                    {/* Wallet info header */}
                    <div className="px-3 py-2 mb-1 border-b border-border/40">
                      <p className="text-xs text-muted-foreground">Connected wallet</p>
                      <p className="text-xs font-mono text-foreground truncate">{address}</p>
                      <div className="flex items-center gap-1 mt-1">
                      <NetworkBadge network={network} isConnected={isConnected} />
                        {isWrongNetwork && (
                          <span className="text-[10px] text-amber-600 dark:text-amber-400">
                            Switch to Testnet!
                          </span>
                        )}
                      </div>
                    </div>

                    <Link 
                      href="/dashboard/profile" 
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      onClick={closeMenus}
                    >
                      <User className="h-4 w-4" />
                      <span>My Profile</span>
                    </Link>
                    <Link 
                      href="/settings" 
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      onClick={closeMenus}
                    >
                      <Settings className="h-4 w-4" />
                      <span>Settings</span>
                    </Link>
                    <hr className="my-1 border-border/40" />
                    <button 
                      id="navbar-disconnect-wallet"
                      onClick={handleDisconnect}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <LogOut className="h-4 w-4" />
                      <span>Disconnect</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {!isConnected && (
              <Button variant="ghost" asChild>
                <Link href="/login">Login</Link>
              </Button>
            )}

            <ThemeToggle />
          </div>

          {/* Mobile Hamburger Trigger */}
          <button
            className="md:hidden p-2 text-muted-foreground hover:text-foreground transition-transform focus:outline-none"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-6 w-6 rotate-90 duration-200" /> : <Menu className="h-6 w-6 duration-200" />}
          </button>
        </div>
      </div>

      {/* Mobile Popout Panel */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-border/40 bg-background/95 backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="px-4 py-6 space-y-4">
            <Link href="#features" className="block text-sm text-muted-foreground hover:text-foreground transition-colors" onClick={closeMenus}>
              Features
            </Link>
            <Link href="#how-it-works" className="block text-sm text-muted-foreground hover:text-foreground transition-colors" onClick={closeMenus}>
              How It Works
            </Link>
            <Link href="#benefits" className="block text-sm text-muted-foreground hover:text-foreground transition-colors" onClick={closeMenus}>
              Benefits
            </Link>
            <Link href="#testimonials" className="block text-sm text-muted-foreground hover:text-foreground transition-colors" onClick={closeMenus}>
              Testimonials
            </Link>
            
            <div className="pt-4 border-t border-border/40 space-y-3">
              {isConnected && address ? (
                <>
                  {/* Wallet info card */}
                  <div className="rounded-lg border border-border/40 bg-muted/30 px-3 py-2 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Wallet</span>
                    <NetworkBadge network={network} isConnected={isConnected} />
                    </div>
                    <p className="text-xs font-mono text-foreground truncate">{address}</p>
                    {isWrongNetwork && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> Switch to Testnet in Freighter!
                      </p>
                    )}
                  </div>

                  <Button variant="ghost" className="w-full justify-start gap-2" asChild onClick={closeMenus}>
                    <Link href="/dashboard/profile"><User className="h-4 w-4" /> Profile</Link>
                  </Button>
                  <Button
                    id="mobile-disconnect-wallet"
                    variant="ghost"
                    className="w-full justify-start gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={handleDisconnect}
                  >
                    <LogOut className="h-4 w-4" /> Disconnect Wallet
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    id="mobile-connect-wallet"
                    className="w-full gap-2 rounded-lg justify-center"
                    onClick={handleConnect}
                    disabled={isConnecting}
                  >
                    <Wallet className="h-4 w-4" />
                    <span>{isConnecting ? 'Connecting…' : 'Connect Wallet'}</span>
                  </Button>
                  <Button variant="ghost" className="w-full" asChild onClick={closeMenus}>
                    <Link href="/login">Login</Link>
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