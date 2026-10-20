'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import {
  Loader2,
  ArrowLeft,
  Bell,
  ShieldCheck,
  Wallet,
  Palette,
  User,
  Copy,
  Check,
  MoonStar,
  SunMedium,
  Monitor,
  LogOut,
  KeyRound,
  AlertCircle,
  RotateCcw,
  Shield,
  Mail,
  Smartphone,
  MonitorSmartphone,
  Clock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { useStellarWallet, truncateStellarAddress, networkLabel, REQUIRED_NETWORK } from '@/components/wallet-provider'
import { cn } from '@/lib/utils'
import type { NotificationPreferences } from '@/lib/notification-preferences'

// ─── Local types ─────────────────────────────────────────────────────────────

type ProfileDraft = {
  displayName: string
  email: string
  phone: string
  avatarUrl: string
  bio: string
}

type NotifSaveStatus = 'idle' | 'saving' | 'saved' | 'error'

// ─── Constants ────────────────────────────────────────────────────────────────

const PROFILE_STORAGE_KEY = 'taskchain_settings_profile'

const DEFAULT_PREFERENCES: NotificationPreferences = {
  milestonesInApp: true,
  paymentsInApp: true,
  disputesInApp: true,
  deadlinesInApp: true,
  milestonesEmail: true,
  paymentsEmail: true,
  disputesEmail: true,
  deadlinesEmail: false,
  emailEnabled: true,
  pushEnabled: true,
  inAppEnabled: true,
  digest: 'daily',
}

const defaultProfile: ProfileDraft = {
  displayName: '',
  email: '',
  phone: '',
  avatarUrl: '',
  bio: '',
}

function readStoredJSON<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return { ...fallback, ...JSON.parse(raw) }
  } catch {
    return fallback
  }
}

function SectionHeading({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

export function SettingsClient() {
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const { address, isConnected, network } = useStellarWallet()

  // ── Profile state ──────────────────────────────────────────────────────────
  const [profile, setProfile] = useState<ProfileDraft>(() =>
    readStoredJSON(PROFILE_STORAGE_KEY, defaultProfile),
  )
  const [profileSaved, setProfileSaved] = useState(false)

  // ── Notification preferences state ────────────────────────────────────────
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFERENCES)
  const [prefsLoading, setPrefsLoading] = useState(true)
  const [prefsLoadError, setPrefsLoadError] = useState<string | null>(null)
  const [notifSaveStatus, setNotifSaveStatus] = useState<NotifSaveStatus>('idle')
  const [notifSaveError, setNotifSaveError] = useState<string | null>(null)
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const [resetting, setResetting] = useState(false)

  // ── Other UI state ─────────────────────────────────────────────────────────
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle')
  const [securityDialogOpen, setSecurityDialogOpen] = useState(false)

  const maskedWallet = useMemo(() => {
    if (!address) return 'No wallet connected'
    return truncateStellarAddress(address)
  }, [address])

  // ── Load preferences from API on mount ────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    setPrefsLoading(true)
    setPrefsLoadError(null)

    fetch('/api/notifications/preferences', {
      headers: { 'Cache-Control': 'no-store' },
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`)
        }
        return res.json() as Promise<{ preferences: NotificationPreferences }>
      })
      .then((data) => {
        if (!cancelled) setPreferences(data.preferences)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setPrefsLoadError(
            err instanceof Error ? err.message : 'Failed to load preferences',
          )
          // Fall back to platform defaults so the UI is still usable offline
          setPreferences(DEFAULT_PREFERENCES)
        }
      })
      .finally(() => {
        if (!cancelled) setPrefsLoading(false)
      })

    return () => { cancelled = true }
  }, [])

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleProfileSave = () => {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile))
    setProfileSaved(true)
    window.setTimeout(() => setProfileSaved(false), 1800)
  }

  const handlePrefsChange = useCallback(
    (patch: Partial<NotificationPreferences>) => {
      setPreferences((prev) => ({ ...prev, ...patch }))
      // Clear previous error / saved feedback when user makes a new change
      setNotifSaveStatus('idle')
      setNotifSaveError(null)
    },
    [],
  )

  const handleNotificationsSave = useCallback(async () => {
    setNotifSaveStatus('saving')
    setNotifSaveError(null)
    try {
      const res = await fetch('/api/notifications/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(preferences),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error ?? `HTTP ${res.status}`,
        )
      }
      setPreferences((data as { preferences: NotificationPreferences }).preferences)
      setNotifSaveStatus('saved')
      window.setTimeout(() => setNotifSaveStatus('idle'), 2200)
    } catch (err) {
      setNotifSaveStatus('error')
      setNotifSaveError(
        err instanceof Error ? err.message : 'Failed to save preferences',
      )
    }
  }, [preferences])

  const handlePrefsReset = useCallback(async () => {
    setResetting(true)
    try {
      const res = await fetch('/api/notifications/preferences', {
        method: 'DELETE',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error ?? `HTTP ${res.status}`,
        )
      }
      setPreferences((data as { preferences: NotificationPreferences }).preferences)
      setNotifSaveStatus('saved')
      window.setTimeout(() => setNotifSaveStatus('idle'), 2200)
    } catch (err) {
      setNotifSaveStatus('error')
      setNotifSaveError(
        err instanceof Error ? err.message : 'Failed to reset preferences',
      )
    } finally {
      setResetting(false)
      setResetDialogOpen(false)
    }
  }, [])

  const handleCopyWallet = async () => {
    if (!address) return
    await navigator.clipboard.writeText(address)
    setCopyState('copied')
    window.setTimeout(() => setCopyState('idle'), 1600)
  }

  const handleSignOutDevice = () => {
    localStorage.removeItem('tc_dev_access_token')
    localStorage.removeItem('stellar_wallet_address')
    router.push('/login')
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-background via-background to-muted/20">
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-3">
            <Button asChild variant="ghost" className="w-fit pl-0 text-muted-foreground hover:text-foreground">
              <Link href="/dashboard">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to dashboard
              </Link>
            </Button>
            <div>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Settings & Preferences</h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
                Manage your profile, notification preferences, wallet details, theme, and security controls from one place.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={isConnected ? 'secondary' : 'outline'}>
              {isConnected ? 'Wallet connected' : 'Wallet disconnected'}
            </Badge>
            {address && (
              <Badge variant={network === REQUIRED_NETWORK ? 'default' : 'destructive'}>
                {networkLabel(network)}
              </Badge>
            )}
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.9fr)]">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <SectionHeading
                    icon={User}
                    title="Profile"
                    description="Update your personal information and public-facing identity."
                  />
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="display-name">Display name</Label>
                      <Input
                        id="display-name"
                        value={profile.displayName}
                        onChange={(e) => setProfile((prev) => ({ ...prev, displayName: e.target.value }))}
                        placeholder="Your name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={profile.email}
                        onChange={(e) => setProfile((prev) => ({ ...prev, email: e.target.value }))}
                        placeholder="you@example.com"
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="phone">Contact phone</Label>
                      <Input
                        id="phone"
                        value={profile.phone}
                        onChange={(e) => setProfile((prev) => ({ ...prev, phone: e.target.value }))}
                        placeholder="+234..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="avatar-url">Avatar URL</Label>
                      <Input
                        id="avatar-url"
                        value={profile.avatarUrl}
                        onChange={(e) => setProfile((prev) => ({ ...prev, avatarUrl: e.target.value }))}
                        placeholder="https://..."
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bio">Bio</Label>
                    <Textarea
                      id="bio"
                      value={profile.bio}
                      onChange={(e) => setProfile((prev) => ({ ...prev, bio: e.target.value }))}
                      placeholder="Short summary for your profile"
                      className="min-h-28"
                    />
                  </div>
                </CardContent>
                <CardFooter className="justify-between gap-3 border-t px-6 pt-6">
                  <p className="text-sm text-muted-foreground">
                    Changes are stored locally until a server profile endpoint is connected.
                  </p>
                  <Button onClick={handleProfileSave}>
                    {profileSaved ? <Check className="mr-2 h-4 w-4" /> : null}
                    {profileSaved ? 'Saved' : 'Save profile'}
                  </Button>
                </CardFooter>
              </Card>

              <Card>
                <CardHeader>
                  <SectionHeading
                    icon={Bell}
                    title="Notification Preferences"
                    description="Configure which events trigger notifications and how you receive them."
                  />
                </CardHeader>

                <CardContent className="space-y-6">
                  {/* ── Loading skeleton ─────────────────────────────────── */}
                  {prefsLoading && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading preferences…
                    </div>
                  )}

                  {/* ── Load error banner ────────────────────────────────── */}
                  {!prefsLoading && prefsLoadError && (
                    <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>
                        Could not load saved preferences ({prefsLoadError}). Showing defaults — changes will still be saved.
                      </span>
                    </div>
                  )}

                  {!prefsLoading && (
                    <>
                      {/* ── Global channel switches ───────────────────────── */}
                      <div className="space-y-3">
                        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                          <MonitorSmartphone className="h-4 w-4 text-primary" />
                          Delivery channels
                        </h3>
                        <p className="text-xs text-muted-foreground -mt-1">
                          Master switches — disabling a channel silences all notifications on that channel.
                        </p>
                        <div className="grid gap-3 sm:grid-cols-3">
                          <ChannelToggle
                            icon={Mail}
                            label="Email"
                            enabled={preferences.emailEnabled}
                            onToggle={() => handlePrefsChange({ emailEnabled: !preferences.emailEnabled })}
                          />
                          <ChannelToggle
                            icon={Smartphone}
                            label="Push"
                            enabled={preferences.pushEnabled}
                            onToggle={() => handlePrefsChange({ pushEnabled: !preferences.pushEnabled })}
                          />
                          <ChannelToggle
                            icon={Bell}
                            label="In-app"
                            enabled={preferences.inAppEnabled}
                            onToggle={() => handlePrefsChange({ inAppEnabled: !preferences.inAppEnabled })}
                          />
                        </div>
                      </div>

                      <Separator />

                      {/* ── Per-event-category toggles ────────────────────── */}
                      <div className="space-y-3">
                        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                          <Bell className="h-4 w-4 text-primary" />
                          Event categories
                        </h3>
                        <p className="text-xs text-muted-foreground -mt-1">
                          Fine-tune which events notify you and on which channel.
                        </p>

                        <div className="overflow-x-auto rounded-xl border border-border/60">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-border/60 bg-muted/30">
                                <th className="py-3 pl-4 pr-2 text-left font-medium text-muted-foreground">Event</th>
                                <th className="px-4 py-3 text-center font-medium text-muted-foreground">
                                  <span className="flex items-center justify-center gap-1.5">
                                    <Bell className="h-3.5 w-3.5" />In-app
                                  </span>
                                </th>
                                <th className="px-4 py-3 text-center font-medium text-muted-foreground">
                                  <span className="flex items-center justify-center gap-1.5">
                                    <Mail className="h-3.5 w-3.5" />Email
                                  </span>
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border/40">
                              <EventRow
                                label="Milestone updates"
                                description="Submissions, approvals, and rejections"
                                inApp={preferences.milestonesInApp}
                                email={preferences.milestonesEmail}
                                inAppDisabled={!preferences.inAppEnabled}
                                emailDisabled={!preferences.emailEnabled}
                                onInAppToggle={() => handlePrefsChange({ milestonesInApp: !preferences.milestonesInApp })}
                                onEmailToggle={() => handlePrefsChange({ milestonesEmail: !preferences.milestonesEmail })}
                              />
                              <EventRow
                                label="Payments"
                                description="Escrow funded, released, or refunded"
                                inApp={preferences.paymentsInApp}
                                email={preferences.paymentsEmail}
                                inAppDisabled={!preferences.inAppEnabled}
                                emailDisabled={!preferences.emailEnabled}
                                onInAppToggle={() => handlePrefsChange({ paymentsInApp: !preferences.paymentsInApp })}
                                onEmailToggle={() => handlePrefsChange({ paymentsEmail: !preferences.paymentsEmail })}
                              />
                              <EventRow
                                label="Disputes"
                                description="New disputes and resolution updates"
                                inApp={preferences.disputesInApp}
                                email={preferences.disputesEmail}
                                inAppDisabled={!preferences.inAppEnabled}
                                emailDisabled={!preferences.emailEnabled}
                                onInAppToggle={() => handlePrefsChange({ disputesInApp: !preferences.disputesInApp })}
                                onEmailToggle={() => handlePrefsChange({ disputesEmail: !preferences.disputesEmail })}
                              />
                              <EventRow
                                label="Upcoming deadlines"
                                description="Milestone approaching or overdue alerts"
                                inApp={preferences.deadlinesInApp}
                                email={preferences.deadlinesEmail}
                                inAppDisabled={!preferences.inAppEnabled}
                                emailDisabled={!preferences.emailEnabled}
                                onInAppToggle={() => handlePrefsChange({ deadlinesInApp: !preferences.deadlinesInApp })}
                                onEmailToggle={() => handlePrefsChange({ deadlinesEmail: !preferences.deadlinesEmail })}
                              />
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <Separator />

                      {/* ── Delivery digest ───────────────────────────────── */}
                      <div className="space-y-3">
                        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                          <Clock className="h-4 w-4 text-primary" />
                          Delivery cadence
                        </h3>
                        <p className="text-xs text-muted-foreground -mt-1">
                          Controls how frequently email notifications are batched and sent.
                        </p>
                        <Select
                          value={preferences.digest}
                          onValueChange={(value) =>
                            handlePrefsChange({ digest: value as NotificationPreferences['digest'] })
                          }
                        >
                          <SelectTrigger className="w-full sm:w-64">
                            <SelectValue placeholder="Select cadence" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="instant">Instant — send immediately</SelectItem>
                            <SelectItem value="daily">Daily digest — once per day</SelectItem>
                            <SelectItem value="weekly">Weekly digest — once per week</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <Separator />

                      {/* ── Security alerts (essential, non-dismissible) ───── */}
                      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                        <div className="flex items-start gap-3">
                          <Shield className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                          <div className="space-y-1">
                            <p className="text-sm font-semibold">Security &amp; account alerts</p>
                            <p className="text-xs text-muted-foreground">
                              Critical security notifications (sign-in alerts, wallet activity, account changes) are always
                              delivered and cannot be disabled. These protect your account and comply with platform policy.
                            </p>
                          </div>
                          <Badge variant="secondary" className="ml-auto shrink-0 text-xs">
                            Always on
                          </Badge>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>

                <CardFooter className="flex-col items-stretch gap-3 border-t px-6 pt-6 sm:flex-row sm:items-center sm:justify-between">
                  {/* Save status feedback */}
                  <div className="flex items-center gap-2 text-sm min-h-[1.25rem]">
                    {notifSaveStatus === 'saving' && (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                        <span className="text-muted-foreground">Saving…</span>
                      </>
                    )}
                    {notifSaveStatus === 'saved' && (
                      <>
                        <Check className="h-3.5 w-3.5 text-green-600" />
                        <span className="text-green-600">Preferences saved</span>
                      </>
                    )}
                    {notifSaveStatus === 'error' && notifSaveError && (
                      <>
                        <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                        <span className="text-destructive">{notifSaveError}</span>
                      </>
                    )}
                    {notifSaveStatus === 'idle' && (
                      <span className="text-muted-foreground">
                        Preferences sync to your account across all sessions.
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setResetDialogOpen(true)}
                      disabled={prefsLoading || notifSaveStatus === 'saving'}
                    >
                      <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                      Reset to defaults
                    </Button>
                    <Button
                      onClick={handleNotificationsSave}
                      disabled={prefsLoading || notifSaveStatus === 'saving'}
                    >
                      {notifSaveStatus === 'saving'
                        ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        : notifSaveStatus === 'saved'
                          ? <Check className="mr-2 h-4 w-4" />
                          : null}
                      {notifSaveStatus === 'saving' ? 'Saving…' : notifSaveStatus === 'saved' ? 'Saved' : 'Save preferences'}
                    </Button>
                  </div>
                </CardFooter>
              </Card>

              <Card>
                <CardHeader>
                  <SectionHeading
                    icon={ShieldCheck}
                    title="Security"
                    description="Review access controls, account protection, and session state."
                  />
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                      <div className="flex items-center gap-2">
                        <KeyRound className="h-4 w-4 text-primary" />
                        <p className="font-medium">Password</p>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Use a strong password and change it periodically.
                      </p>
                      <Button variant="outline" className="mt-4" onClick={() => setSecurityDialogOpen(true)}>
                        Change password
                      </Button>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-primary" />
                        <p className="font-medium">Two-factor authentication</p>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Add a second verification step to strengthen account access.
                      </p>
                      <Button variant="outline" className="mt-4" onClick={() => setSecurityDialogOpen(true)}>
                        Enable 2FA
                      </Button>
                    </div>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-medium">Session controls</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Sign out of this device and clear stored authentication state.
                        </p>
                      </div>
                      <Button variant="destructive" onClick={handleSignOutDevice}>
                        <LogOut className="mr-2 h-4 w-4" />
                        Sign out
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <SectionHeading
                    icon={Wallet}
                    title="Wallet Information"
                    description="View the active wallet connection without exposing unnecessary details."
                  />
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Connected wallet</p>
                    <div className="mt-2 flex items-center gap-2">
                      <p className="font-mono text-sm">{maskedWallet}</p>
                      {address && (
                        <Button variant="ghost" size="icon-sm" onClick={handleCopyWallet} aria-label="Copy wallet address">
                          {copyState === 'copied' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      )}
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {address ? 'Full address is kept private and only exposed when needed.' : 'Connect a wallet to see account details.'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Network</p>
                    <p className="mt-2 text-sm font-medium">{address ? networkLabel(network) : 'Unavailable'}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <SectionHeading
                    icon={Palette}
                    title="Theme Settings"
                    description="Choose the visual mode that fits your workflow."
                  />
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 p-4">
                    <div>
                      <p className="font-medium">Current theme</p>
                      <p className="mt-1 text-sm text-muted-foreground capitalize">
                        {theme ?? 'system'}
                      </p>
                    </div>
                    <ThemeToggle />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <ThemeOption
                      active={theme === 'light'}
                      icon={SunMedium}
                      label="Light"
                      onClick={() => setTheme('light')}
                    />
                    <ThemeOption
                      active={theme === 'dark'}
                      icon={MoonStar}
                      label="Dark"
                      onClick={() => setTheme('dark')}
                    />
                    <ThemeOption
                      active={theme === 'system'}
                      icon={Monitor}
                      label="System"
                      onClick={() => setTheme('system')}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-dashed">
                <CardHeader>
                  <SectionHeading
                    icon={Loader2}
                    title="Loading & Availability"
                    description="Graceful fallback state while settings data is unavailable."
                  />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    This page uses lightweight local defaults first, then hydrates user-specific state when available.
                  </p>
                </CardContent>
              </Card>
            </div>
        </div>
      </div>

      <Dialog open={securityDialogOpen} onOpenChange={setSecurityDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Security action</DialogTitle>
            <DialogDescription>
              Password reset and two-factor enrollment flows can be connected here when the backend endpoints are available.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSecurityDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset preferences confirmation dialog */}
      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset notification preferences?</DialogTitle>
            <DialogDescription>
              This will restore all notification settings to the platform defaults and cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setResetDialogOpen(false)}
              disabled={resetting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handlePrefsReset}
              disabled={resetting}
            >
              {resetting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {resetting ? 'Resetting…' : 'Reset to defaults'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Compact card for a global channel master switch (Email / Push / In-app). */
function ChannelToggle({
  icon: Icon,
  label,
  enabled,
  onToggle,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  enabled: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={enabled}
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-xl border p-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        enabled
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/40 hover:text-foreground',
      )}
    >
      <Icon className="h-5 w-5" />
      <span className="font-medium">{label}</span>
      <span className="text-xs">{enabled ? 'On' : 'Off'}</span>
    </button>
  )
}

/** Table row for a per-event-category in-app + email pair of toggles. */
function EventRow({
  label,
  description,
  inApp,
  email,
  inAppDisabled,
  emailDisabled,
  onInAppToggle,
  onEmailToggle,
}: {
  label: string
  description: string
  inApp: boolean
  email: boolean
  inAppDisabled: boolean
  emailDisabled: boolean
  onInAppToggle: () => void
  onEmailToggle: () => void
}) {
  return (
    <tr className="bg-background hover:bg-muted/20 transition-colors">
      <td className="py-3 pl-4 pr-2">
        <p className="font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </td>
      <td className="px-4 py-3 text-center">
        <ToggleButton
          enabled={inApp}
          disabled={inAppDisabled}
          onToggle={onInAppToggle}
          aria-label={`Toggle in-app notifications for ${label}`}
        />
      </td>
      <td className="px-4 py-3 text-center">
        <ToggleButton
          enabled={email}
          disabled={emailDisabled}
          onToggle={onEmailToggle}
          aria-label={`Toggle email notifications for ${label}`}
        />
      </td>
    </tr>
  )
}

/** Small on/off toggle button shared by EventRow cells. */
function ToggleButton({
  enabled,
  disabled,
  onToggle,
  'aria-label': ariaLabel,
}: {
  enabled: boolean
  disabled: boolean
  onToggle: () => void
  'aria-label': string
}) {
  return (
    <Button
      type="button"
      variant={enabled && !disabled ? 'default' : 'outline'}
      size="sm"
      onClick={onToggle}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-pressed={enabled}
      className={cn(
        'w-14 transition-opacity',
        disabled && 'opacity-40 cursor-not-allowed',
      )}
    >
      {enabled ? 'On' : 'Off'}
    </Button>
  )
}

function ThemeOption({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-xl border p-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/40 hover:text-foreground'
      )}
    >
      <Icon className="h-5 w-5" />
      <span className="font-medium">{label}</span>
    </button>
  )
}
