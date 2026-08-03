import { NextResponse } from 'next/server';
import { INITIAL_CONVERSATIONS } from '@/lib/mock-chat';

export async function GET() {
  try {
    return NextResponse.json({
      success: true,
      conversations: INITIAL_CONVERSATIONS,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to fetch contract conversations' },
      { status: 500 }
    );
  }
}
