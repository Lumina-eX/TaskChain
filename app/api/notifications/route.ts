import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { sql } from '@/lib/db'
import { getUserIdByWallet } from '@/lib/reputation'

export const GET = withAuth(async (request: NextRequest, auth) => {
  const userId = await getUserIdByWallet(auth.walletAddress)
  if (userId === null) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  try {
    const notifications = await sql`
      SELECT id, type, title, message, link, is_read, created_at
      FROM notifications
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT 50
    `
    return NextResponse.json(notifications)
  } catch (error) {
    console.error('Failed to fetch notifications:', error)
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 })
  }
})

export const PATCH = withAuth(async (request: NextRequest, auth) => {
  const userId = await getUserIdByWallet(auth.walletAddress)
  if (userId === null) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  try {
    const { id } = await request.json()
    if (id) {
      await sql`
        UPDATE notifications
        SET is_read = TRUE
        WHERE id = ${id} AND user_id = ${userId}
      `
    } else {
      await sql`
        UPDATE notifications
        SET is_read = TRUE
        WHERE user_id = ${userId} AND is_read = FALSE
      `
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to update notifications:', error)
    return NextResponse.json({ error: 'Failed to update notifications' }, { status: 500 })
  }
})
