'use client'

import Link from 'next/link'
import { Menu, Bell, LogOut, User, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import {
  useStellarWallet,
  truncateStellarAddress,
  networkLabel,
  REQUIRED_NETWORK,
} from '@/components/wallet-provider'
import { useRouter } from 'next/navigation'

interface DashboardHeaderProps {
  onMenuClick: () => void
}

export function DashboardHeader({ onMenuClick }: DashboardHeaderProps) {
  const router = useRouter()
  const { address, isConnected, isWrongNetwork, network, disconnect } = useStellarWallet()

  const handleLogout = () => {
    disconnect()
    router.push('/login')
  }

  return (
    <header className="border-b border-border/40 bg-background/80 backdrop-blur-xl sticky top-0 z-40">
      <div className="flex items-center justify-between h-16 px-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={onMenuClick}
          className="lg:hidden"
        >
          <Menu className="h-6 w-6" />
        </Button>

        <div className="flex-1" />

        <div className="flex items-center gap-3">

          {/* Wrong-network pill — compact inline warning in the header */}
          {isConnected && isWrongNetwork && (
            <div className="hidden sm:flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-600 dark:text-amber-400 border border-amber-500/30">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>Switch to Testnet in Freighter</span>
            </div>
          )}

          {/* Wallet status pill (shown when connected and on correct network) */}
          {isConnected && address && !isWrongNetwork && (
            <div className="hidden sm:flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-mono">{truncateStellarAddress(address)}</span>
              <span className="opacity-60">·</span>
              <span>{networkLabel(network)}</span>
            </div>
          )}

          {/* Notifications */}
          <Button
            variant="ghost"
            size="icon"
            className="relative"
          >
            <Bell className="h-5 w-5" />
            <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary animate-pulse" />
          </Button>

          <ThemeToggle />

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full relative">
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-accent" />
                {isConnected && isWrongNetwork && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500">
                    <AlertTriangle className="h-2.5 w-2.5 text-white" />
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              {/* Wallet info section */}
              {isConnected && address && (
                <>
                  <div className="px-2 py-2">
                    <p className="text-xs text-muted-foreground mb-0.5">Connected wallet</p>
                    <p className="text-xs font-mono text-foreground truncate">{address}</p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                          network === REQUIRED_NETWORK
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                            : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {networkLabel(network)}
                      </span>
                      {isWrongNetwork && (
                        <span className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
                          <AlertTriangle className="h-3 w-3" /> Wrong network
                        </span>
                      )}
                    </div>
                  </div>
                  <DropdownMenuSeparator />
                </>
              )}

              <DropdownMenuItem asChild>
                <Link href="/dashboard/profile" className="flex items-center gap-2 cursor-pointer">
                  <User className="h-4 w-4" />
                  Profile
                </Link>
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                id="dashboard-logout-button"
                onClick={handleLogout}
                className="text-destructive focus:text-destructive flex items-center gap-2 cursor-pointer"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
