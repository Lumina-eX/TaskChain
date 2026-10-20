'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  Check,
  Copy,
  Info,
  Laptop,
  Loader2,
  MonitorSmartphone,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Tablet,
  Wallet,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  REQUIRED_NETWORK,
  networkLabel,
  truncateStellarAddress,
  useStellarWallet,
} from '@/components/wallet-provider'
import { cn } from '@/lib/utils'
import {
  buildSecurityAlerts,
  type SecurityAlert,
  type SecuritySession,
  type SessionDeviceType,
  type SessionStatus,
} from '@/lib/auth/session-types'

function getAuthHeaders(): Record<string, string> {
  const token =
    typeof window !== 'undefined'
      ? localStorage.getItem('tc_dev_access_token')
      : null
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function formatDateTime(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? 'Unknown time' : date.toLocaleString()
}

function formatRelative(iso: string): string {
  const parsed = Date.parse(iso)
  if (Number.isNaN(parsed)) return 'Unknown'

  const diffMs = Date.now() - parsed
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60) return 'just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour}h ago`
  const diffDay = Math.floor(diffHour / 24)
  if (diffDay < 7) return `${diffDay}d ago`
  return formatDateTime(iso)
}

const deviceIcons: Record<SessionDeviceType, typeof Laptop> = {
  mobile: Smartphone,
  tablet: Tablet,
  desktop: Laptop,
  unknown: MonitorSmartphone,
}

const alertStyles: Record<
  SecurityAlert['severity'],
  { container: string; icon: string; Icon: typeof ShieldAlert }
> = {
  critical: {
    container: 'border-destructive/40 bg-destructive/10',
    icon: 'text-destructive',
    Icon: ShieldAlert,
  },
  warning: {
    container: 'border-amber-500/40 bg-amber-500/10',
    icon: 'text-amber-600 dark:text-amber-400',
    Icon: AlertTriangle,
  },
  info: {
    container: 'border-border/40 bg-card/50',
    icon: 'text-primary',
    Icon: Info,
  },
}

function StatusBadge({ status }: { status: SessionStatus }) {
  if (status === 'active') {
    return <Badge variant="default">Active</Badge>
  }
  if (status === 'revoked') {
    return <Badge variant="destructive">Revoked</Badge>
  }
  return <Badge variant="outline">Expired</Badge>
}

function SessionSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className="h-24 rounded-xl bg-card/50 border border-border/40 animate-pulse"
        />
      ))}
    </div>
  )
}

interface SessionCardProps {
  session: SecuritySession
  onRevoke: (session: SecuritySession) => void
  onSignOut: (session: SecuritySession) => void
}

function SessionCard({ session, onRevoke, onSignOut }: SessionCardProps) {
  const Icon = deviceIcons[session.device.type] ?? MonitorSmartphone

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/40">
      <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium text-sm">{session.device.label}</p>
              {session.current ? (
                <Badge variant="secondary">This device</Badge>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              {session.ipAddress ?? 'Unknown IP'} · Signed in{' '}
              {formatDateTime(session.loginAt)}
            </p>
            <p className="text-xs text-muted-foreground">
              Last active {formatRelative(session.lastActiveAt)}
              {session.status === 'expired'
                ? ` · Expired ${formatRelative(session.expiresAt)}`
                : null}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:flex-col sm:items-end shrink-0">
          <StatusBadge status={session.status} />
          {session.status === 'active' ? (
            session.current ? (
              <Button size="sm" variant="outline" onClick={() => onSignOut(session)}>
                Sign out
              </Button>
            ) : (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => onRevoke(session)}
              >
                Revoke
              </Button>
            )
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

interface SessionListProps {
  sessions: SecuritySession[]
  emptyMessage: string
  onRevoke: (session: SecuritySession) => void
  onSignOut: (session: SecuritySession) => void
}

function SessionList({
  sessions,
  emptyMessage,
  onRevoke,
  onSignOut,
}: SessionListProps) {
  if (sessions.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {sessions.map((session) => (
        <SessionCard
          key={session.id}
          session={session}
          onRevoke={onRevoke}
          onSignOut={onSignOut}
        />
      ))}
    </div>
  )
}

export function SecurityDashboard() {
  const router = useRouter()
  const {
    address,
    network,
    isWrongNetwork,
    isConnecting,
    connect,
  } = useStellarWallet()

  const [sessions, setSessions] = useState<SecuritySession[]>([])
  const [alerts, setAlerts] = useState<SecurityAlert[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingSession, setPendingSession] = useState<SecuritySession | null>(
    null
  )
  const [pendingAction, setPendingAction] = useState<'revoke' | 'logout'>(
    'revoke'
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [tab, setTab] = useState<SessionStatus | 'history'>('active')

  const loadSessions = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/auth/sessions', {
        method: 'GET',
        headers: getAuthHeaders(),
        credentials: 'include',
      })

      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error ?? 'Failed to load sessions')
      }

      const body = await response.json()
      setSessions(body.data.sessions ?? [])
      setAlerts(body.data.alerts ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSessions()
  }, [loadSessions])

  const handleRevoke = useCallback((session: SecuritySession) => {
    setPendingAction('revoke')
    setPendingSession(session)
  }, [])

  const handleSignOut = useCallback((session: SecuritySession) => {
    setPendingAction('logout')
    setPendingSession(session)
  }, [])

  const handleConfirm = useCallback(async () => {
    const target = pendingSession
    if (!target) return

    setIsSubmitting(true)
    try {
      if (pendingAction === 'logout') {
        const response = await fetch('/api/auth/logout', {
          method: 'POST',
          headers: getAuthHeaders(),
          credentials: 'include',
        })
        if (!response.ok) {
          const body = await response.json().catch(() => null)
          throw new Error(body?.error ?? 'Failed to sign out')
        }
        localStorage.removeItem('tc_dev_access_token')
        toast.success('Signed out of this device')
        setPendingSession(null)
        router.push('/login')
        return
      }

      // Only reflect the revocation after the server confirms it.
      const response = await fetch(
        `/api/auth/sessions/${target.id}/revoke`,
        {
          method: 'POST',
          headers: getAuthHeaders(),
          credentials: 'include',
        }
      )
      const body = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(body?.error ?? 'Failed to revoke session')
      }

      const next = sessions.map((session) =>
        session.id === target.id
          ? {
              ...session,
              status: 'revoked' as SessionStatus,
              revokedAt: new Date().toISOString(),
            }
          : session
      )
      setSessions(next)
      setAlerts(buildSecurityAlerts(next))
      toast.success('Session revoked')
      setPendingSession(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
      setPendingSession(null)
    } finally {
      setIsSubmitting(false)
    }
  }, [pendingAction, pendingSession, router, sessions])

  const handleCopyAddress = useCallback(async () => {
    if (!address) return
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      toast.success('Wallet address copied')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Failed to copy wallet address')
    }
  }, [address])

  const activeSessions = sessions.filter((s) => s.status === 'active')
  const revokedSessions = sessions.filter((s) => s.status === 'revoked')
  const expiredSessions = sessions.filter((s) => s.status === 'expired')
  const loginHistory = [...sessions].sort(
    (a, b) => Date.parse(b.loginAt) - Date.parse(a.loginAt)
  )

  const openRevokeDialog = pendingAction === 'revoke'

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="space-y-8 max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
              <ShieldCheck className="h-7 w-7 text-primary" aria-hidden="true" />
              Account Security
            </h1>
            <p className="text-muted-foreground mt-2">
              Review your sessions, watch for suspicious activity and manage
              who can access your account.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadSessions()}
            disabled={isLoading}
          >
            <RefreshCw
              className={cn('h-4 w-4 mr-2', isLoading && 'animate-spin')}
              aria-hidden="true"
            />
            Refresh
          </Button>
        </div>

        {/* Wallet & network */}
        <Card className="bg-card/50 backdrop-blur-sm border-border/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" aria-hidden="true" />
              Connected wallet
            </CardTitle>
            <CardDescription>
              The wallet and network used to sign in to TaskChain.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!address ? (
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <p className="text-sm text-muted-foreground flex-1">
                  No wallet connected. Connect Freighter to see your wallet
                  address and network.
                </p>
                <Button
                  size="sm"
                  onClick={() => void connect()}
                  disabled={isConnecting}
                >
                  {isConnecting ? (
                    <>
                      <Loader2
                        className="h-4 w-4 mr-2 animate-spin"
                        aria-hidden="true"
                      />
                      Connecting…
                    </>
                  ) : (
                    'Connect wallet'
                  )}
                </Button>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Wallet address</p>
                  <div className="mt-1 flex items-center gap-2">
                    <code className="text-sm font-mono truncate">
                      {truncateStellarAddress(address)}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => void handleCopyAddress()}
                      aria-label="Copy wallet address"
                    >
                      {copied ? (
                        <Check
                          className="h-4 w-4 text-green-500"
                          aria-hidden="true"
                        />
                      ) : (
                        <Copy className="h-4 w-4" aria-hidden="true" />
                      )}
                    </Button>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Network</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge
                      variant={
                        network === REQUIRED_NETWORK ? 'secondary' : 'destructive'
                      }
                    >
                      {networkLabel(network)}
                    </Badge>
                    {isWrongNetwork ? (
                      <span className="text-xs text-destructive">
                        Expected {networkLabel(REQUIRED_NETWORK)}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Security alerts */}
        {alerts.length > 0 ? (
          <section aria-label="Security alerts" className="space-y-3">
            <h2 className="text-lg font-semibold">Security alerts</h2>
            <div className="space-y-3">
              {alerts.map((alert) => {
                const styles = alertStyles[alert.severity]
                const Icon = styles.Icon
                return (
                  <div
                    key={alert.id}
                    role="alert"
                    className={cn(
                      'flex items-start gap-3 rounded-xl border p-4',
                      styles.container
                    )}
                  >
                    <Icon
                      className={cn('h-5 w-5 shrink-0 mt-0.5', styles.icon)}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{alert.title}</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {alert.message}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        ) : null}

        {/* Sessions */}
        <section aria-label="Sessions" className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Sessions</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Devices that are signed in or have signed in to your account.
              Revoke anything you do not recognise.
            </p>
          </div>

          {isLoading && sessions.length === 0 ? (
            <SessionSkeleton />
          ) : error ? (
            <div
              role="alert"
              className="text-center py-12 rounded-xl border border-destructive/40 bg-destructive/10"
            >
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => void loadSessions()}
              >
                Try again
              </Button>
            </div>
          ) : (
            <Tabs
              value={tab}
              onValueChange={(value) =>
                setTab(value as SessionStatus | 'history')
              }
            >
              <div className="overflow-x-auto">
                <TabsList className="h-auto">
                  <TabsTrigger value="active" className="whitespace-nowrap">
                    Active ({activeSessions.length})
                  </TabsTrigger>
                  <TabsTrigger value="revoked" className="whitespace-nowrap">
                    Revoked ({revokedSessions.length})
                  </TabsTrigger>
                  <TabsTrigger value="expired" className="whitespace-nowrap">
                    Expired ({expiredSessions.length})
                  </TabsTrigger>
                  <TabsTrigger value="history" className="whitespace-nowrap">
                    Login history
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="active" className="mt-4">
                <SessionList
                  sessions={activeSessions}
                  emptyMessage="No active sessions."
                  onRevoke={handleRevoke}
                  onSignOut={handleSignOut}
                />
              </TabsContent>
              <TabsContent value="revoked" className="mt-4">
                <SessionList
                  sessions={revokedSessions}
                  emptyMessage="No revoked sessions."
                  onRevoke={handleRevoke}
                  onSignOut={handleSignOut}
                />
              </TabsContent>
              <TabsContent value="expired" className="mt-4">
                <SessionList
                  sessions={expiredSessions}
                  emptyMessage="No expired sessions."
                  onRevoke={handleRevoke}
                  onSignOut={handleSignOut}
                />
              </TabsContent>
              <TabsContent value="history" className="mt-4">
                <SessionList
                  sessions={loginHistory}
                  emptyMessage="No sign-in activity yet."
                  onRevoke={handleRevoke}
                  onSignOut={handleSignOut}
                />
              </TabsContent>
            </Tabs>
          )}
        </section>
      </div>

      {/* Revoke / sign-out confirmation */}
      <AlertDialog
        open={!!pendingSession}
        onOpenChange={(open) => {
          if (!open && !isSubmitting) setPendingSession(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {openRevokeDialog ? 'Revoke this session?' : 'Sign out this device?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {openRevokeDialog
                ? `"${pendingSession?.device.label ?? 'This session'}" will be signed out immediately and will need to sign in again.`
                : 'You will be signed out of TaskChain on this device and redirected to the login page.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                void handleConfirm()
              }}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2
                    className="h-4 w-4 mr-2 animate-spin"
                    aria-hidden="true"
                  />
                  Working…
                </>
              ) : openRevokeDialog ? (
                'Revoke session'
              ) : (
                'Sign out'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
