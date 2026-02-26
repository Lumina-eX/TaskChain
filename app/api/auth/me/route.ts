import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'

export const GET = withAuth(async (_request, auth) => {
  return NextResponse.json(
    {
      walletAddress: auth.walletAddress,
      authenticated: true,
    },
    { status: 200 }
  )
})
