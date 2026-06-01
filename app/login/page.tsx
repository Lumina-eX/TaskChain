'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { signMessage } from '@stellar/freighter-api'
import { Button } from '@/components/ui/button'
import {
  Wallet,
  LogOut,
  AlertCircle,
  Loader2,
  ArrowLeft,
  FlaskConical,
  AlertTriangle,
} from 'lucide-react'
import Link from 'next/link'
import {
  useStellarWallet,
  truncateStellarAddress,
} from '@/components/wallet-provider'

const IS_DEV = process.env.NODE_ENV !== 'production'

export default function LoginPage() {
  const router = useRouter()

  // ── Wallet context ────────────────────────────────────────────────────────
  const {
    address,
    isConnected: walletIsConnected,
    isConnecting,
    isWrongNetwork,
    network,
    connect,
    disconnect,
  } = useStellarWallet()

  // ── Local state ──────────────────────────────────────────────────────────
  const [isInitializing, setIsInitializing] = useState(true)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [isMocking, setIsMocking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Session check on mount ────────────────────────────────────────────────
  useEffect(() => {
    const checkSession = async () => {
      try {
        const savedAddress = localStorage.getItem('stellar_wallet_address')
        if (savedAddress && walletIsConnected) {
          const meRes = await fetch('/api/auth/me')
          if (meRes.ok) {
            router.push('/dashboard')
            return
          }
        }
      } catch (err) {
        console.error('Failed to initialize wallet session:', err)
      } finally {
        setIsInitializing(false)
      }
    }

    // Small delay to let provider's first sync complete
    const t = setTimeout(checkSession, 700)
    return () => clearTimeout(t)
  }, [router, walletIsConnected])

  // ── Step 1: Connect wallet ────────────────────────────────────────────────
  const handleConnect = async () => {
    setError(null)
    // Delegates to the global provider (handles requestAccess + address/network sync)
    await connect()
  }

  // ── Step 2: Sign message & authenticate ─────────────────────────────────
  const handleSign = async () => {
    setError(null)

    if (!address) {
      setError('No wallet connected. Please connect Freighter first.')
      return
    }

    // Block if on the wrong network
    if (isWrongNetwork) {
      setError(
        `Wrong network detected (${network}). Please switch your Freighter wallet to Stellar Testnet and try again.`
      )
      return
    }

    try {
      // 1. Fetch Nonce & Message
      setStatusMessage('Requesting authentication message...')
      const nonceRes = await fetch('/api/auth/nonce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: address }),
      })
      const nonceData = await nonceRes.json()
      if (!nonceRes.ok) {
        throw new Error(nonceData?.error || 'Failed to generate authentication nonce.')
      }

      const { nonce, message } = nonceData

      // 2. Request signature via Freighter signMessage
      setStatusMessage('Approve signature request...')
      const signResponse = await signMessage(message)

      let signature: string | undefined
      if (typeof signResponse === 'string') {
        signature = signResponse
      } else if (signResponse && typeof signResponse === 'object') {
        if (signResponse.error) {
          throw new Error(
            signResponse.error.message || signResponse.error || 'Message signing was rejected.'
          )
        }
        signature = signResponse.signedMessage
      }

      if (!signature) {
        throw new Error('Message signing was cancelled or failed.')
      }

      // 3. Verify Signature & Nonce on Backend
      setStatusMessage('Verifying signature...')
      const verifyRes = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: address, nonce, signature, message }),
      })

      const verifyData = await verifyRes.json()
      if (!verifyRes.ok) {
        throw new Error(verifyData?.error || 'Signature verification failed.')
      }

      // 4. Persist & redirect
      localStorage.setItem('stellar_wallet_address', address)
      if (verifyData.accessToken) {
        localStorage.setItem('tc_dev_access_token', verifyData.accessToken)
      }
      router.push('/dashboard')
    } catch (err: unknown) {
      console.error('Sign-in error:', err)
      setError(err instanceof Error ? err.message : 'Unable to authenticate. Please try again.')
    } finally {
      setStatusMessage(null)
    }
  }

  // ── Dev-only mock login bypass ─────────────────────────────────────────
  const handleMockLogin = async () => {
    setError(null)
    setIsMocking(true)
    try {
      const res = await fetch('/api/auth/mock', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Mock auth failed')
      localStorage.setItem('stellar_wallet_address', data.walletAddress)
      if (data.accessToken) {
        localStorage.setItem('tc_dev_access_token', data.accessToken)
      }
      router.push('/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Mock login failed')
    } finally {
      setIsMocking(false)
    }
  }

  const handleDisconnect = () => {
    disconnect()
    setError(null)
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      {/* Back button */}
      <div className="absolute top-4 left-4 z-20 md:top-8 md:left-8">
        <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground">
          <Link href="/">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Home
          </Link>
        </Button>
      </div>

      {/* Background decorations */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/20 rounded-full blur-[120px] opacity-20 pointer-events-none" />
      <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-accent/20 rounded-full blur-[100px] opacity-20 pointer-events-none" />

      <div className="relative z-10 w-full max-w-md bg-card border border-border/50 rounded-2xl p-8 shadow-2xl backdrop-blur-sm">
        <div className="flex flex-col items-center text-center space-y-6">
          {/* Icon */}
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
            <Wallet className="w-8 h-8 text-primary" />
          </div>

          {/* Header */}
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight text-card-foreground">Connect Wallet</h1>
            <p className="text-sm text-muted-foreground">
              Connect your Stellar Freighter wallet to access your account securely.
            </p>
          </div>

          {/* Error banner */}
          {error && (
            <div className="w-full p-4 rounded-lg bg-destructive/10 border border-destructive/20 flex items-start space-x-3 text-left">
              <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {/* ── State: Initializing ─────────────────────────────────────── */}
          {isInitializing ? (
            <div className="w-full h-12 flex items-center justify-center text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>

          ) : address ? (
            /* ── State: Wallet connected ─────────────────────────────── */
            <div className="w-full space-y-4">

              {/* Connected wallet info */}
              <div className="p-4 rounded-lg bg-secondary/50 border border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-sm font-medium text-foreground">Connected</span>
                </div>
                <span className="text-sm font-mono bg-background px-2 py-1 rounded border border-border/50">
                  {truncateStellarAddress(address)}
                </span>
              </div>

              {/* Wrong-network warning */}
              {isWrongNetwork && (
                <div className="w-full p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start gap-3 text-left">
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">Wrong Network</p>
                    <p className="text-xs text-amber-700/80 dark:text-amber-300/80 mt-0.5">
                      Your Freighter wallet is set to <strong>{network}</strong>. TaskChain requires{' '}
                      <strong>Stellar Testnet</strong>. Open Freighter → Settings → Network and switch, then try again.
                    </p>
                  </div>
                </div>
              )}

              {/* Sign-in button */}
              <Button
                id="login-sign-button"
                className="w-full"
                size="lg"
                onClick={handleSign}
                disabled={isConnecting || isWrongNetwork || !!statusMessage}
              >
                {statusMessage ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {statusMessage}
                  </>
                ) : isWrongNetwork ? (
                  <>
                    <AlertTriangle className="w-4 h-4 mr-2 text-amber-500" />
                    Switch to Testnet First
                  </>
                ) : (
                  'Sign In with Freighter'
                )}
              </Button>

              <Button
                id="login-disconnect-button"
                variant="ghost"
                className="w-full text-muted-foreground"
                onClick={handleDisconnect}
              >
                <LogOut className="w-4 h-4 mr-2" />
                Use a different wallet
              </Button>
            </div>

          ) : (
            /* ── State: Not connected ─────────────────────────────────── */
            <div className="w-full space-y-4">
              <Button
                id="login-connect-button"
                className="w-full"
                size="lg"
                onClick={handleConnect}
                disabled={isConnecting}
              >
                {isConnecting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Connecting…
                  </>
                ) : (
                  'Connect Freighter'
                )}
              </Button>

              {/* Dev-only bypass — never rendered in production */}
              {IS_DEV && (
                <div className="space-y-2">
                  <div className="relative flex items-center gap-2">
                    <div className="flex-1 h-px bg-border/40" />
                    <span className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-widest">
                      dev only
                    </span>
                    <div className="flex-1 h-px bg-border/40" />
                  </div>
                  <Button
                    id="login-mock-button"
                    variant="outline"
                    className="w-full border-dashed border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/60"
                    onClick={handleMockLogin}
                    disabled={isMocking}
                  >
                    {isMocking ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Bypassing…
                      </>
                    ) : (
                      <>
                        <FlaskConical className="w-4 h-4 mr-2" />
                        Bypass — Dev Mode
                      </>
                    )}
                  </Button>
                  <p className="text-[10px] text-center text-muted-foreground/50">
                    Skips wallet. Uses mock address for DB testing.
                  </p>
                </div>
              )}

              <p className="text-xs text-muted-foreground pt-4 border-t border-border/40">
                By connecting a wallet, you agree to TaskChain&apos;s Terms of Service and Privacy Policy.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
