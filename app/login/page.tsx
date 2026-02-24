'use client'

import React, { useState, useEffect } from 'react'
import { isConnected, requestAccess, getAddress } from '@stellar/freighter-api'
import { Button } from '@/components/ui/button'
import { Wallet, LogOut, AlertCircle, Loader2, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function LoginPage() {
  const [address, setAddress] = useState<string | null>(null)
  const [isInitializing, setIsInitializing] = useState(true)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Initialize session from local storage on mount
  useEffect(() => {
    const initSession = async () => {
      try {
        const savedAddress = localStorage.getItem('stellar_wallet_address')
        if (savedAddress) {
          // Verify if still connected
          const connectedResponse = await isConnected()
          if (connectedResponse.isConnected) {
            setAddress(savedAddress)
          } else {
            localStorage.removeItem('stellar_wallet_address')
          }
        }
      } catch (err) {
        console.error('Failed to initialize wallet session:', err)
      } finally {
        setIsInitializing(false)
      }
    }

    // Slight delay to ensure Freighter extension is loaded
    setTimeout(initSession, 500)
  }, [])

  const handleConnect = async () => {
    setError(null)
    setIsConnecting(true)
    try {
      // Check if Freighter is installed
      const connectedResponse = await isConnected()
      if (connectedResponse.error && !connectedResponse.isConnected) {
        throw new Error(connectedResponse.error.message || 'Freighter wallet not detected. Please install the extension.')
      }

      // Request connection
      const accessResponse = await requestAccess()
      if (accessResponse.error) {
        throw new Error(accessResponse.error.message || 'Connection request was rejected.')
      }

      let walletAddress = accessResponse.address;

      // Fallback if address is missing but no error was caught
      if (!walletAddress) {
        const addressResponse = await getAddress()
        if (addressResponse.error) {
          throw new Error(addressResponse.error.message || 'Failed to retrieve wallet address.')
        }
        walletAddress = addressResponse.address
      }

      if (walletAddress) {
        setAddress(walletAddress)
        localStorage.setItem('stellar_wallet_address', walletAddress)
      } else {
        throw new Error('Failed to retrieve wallet address from Freighter.')
      }
    } catch (err: any) {
      console.error('Connection error:', err)
      setError(err?.message || 'Unable to connect wallet. Please try again.')
    } finally {
      setIsConnecting(false)
    }
  }

  const handleDisconnect = () => {
    setAddress(null)
    localStorage.removeItem('stellar_wallet_address')
    setError(null)
  }

  const formatAddress = (addr: string) => {
    if (!addr || addr.length <= 10) return addr;
    return `${addr.substring(0, 5)}...${addr.substring(addr.length - 4)}`
  }

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

      {/* Background decorations matching the app's aesthetic */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/20 rounded-full blur-[120px] opacity-20 pointer-events-none" />
      <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-accent/20 rounded-full blur-[100px] opacity-20 pointer-events-none" />

      <div className="relative z-10 w-full max-w-md bg-card border border-border/50 rounded-2xl p-8 shadow-2xl backdrop-blur-sm">
        <div className="flex flex-col items-center text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
            <Wallet className="w-8 h-8 text-primary" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight text-card-foreground">Connect Wallet</h1>
            <p className="text-sm text-muted-foreground">
              Connect your Stellar Freighter wallet to access your account securely.
            </p>
          </div>

          {error && (
            <div className="w-full p-4 rounded-lg bg-destructive/10 border border-destructive/20 flex items-start space-x-3 text-left">
              <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {isInitializing ? (
            <div className="w-full h-12 flex items-center justify-center text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : address ? (
            <div className="w-full space-y-4">
              <div className="p-4 rounded-lg bg-secondary/50 border border-border flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Connected</span>
                <span className="text-sm font-mono bg-background px-2 py-1 rounded border border-border/50">
                  {formatAddress(address)}
                </span>
              </div>

              <Button
                variant="destructive"
                className="w-full"
                onClick={handleDisconnect}
              >
                <LogOut className="w-4 h-4 mr-2" />
                Disconnect
              </Button>
            </div>
          ) : (
            <div className="w-full space-y-4">
              <Button
                className="w-full"
                size="lg"
                onClick={handleConnect}
                disabled={isConnecting}
              >
                {isConnecting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  'Connect Freighter'
                )}
              </Button>

              <p className="text-xs text-muted-foreground pt-4 border-t border-border/40">
                By connecting a wallet, you agree to TaskChain's Terms of Service and Privacy Policy.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
