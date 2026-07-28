import { NextRequest, NextResponse } from 'next/server';
import { INITIAL_MESSAGES } from '@/lib/mock-chat';
import { ChatMessage } from '@/types/chat';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ contractId: string }> }
) {
  const { contractId } = await params;

  const messages = INITIAL_MESSAGES[contractId] || [];
  return NextResponse.json({
    success: true,
    contractId,
    messages,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ contractId: string }> }
) {
  try {
    const { contractId } = await params;
    const body = await request.json();
    const { content, senderId, senderName, senderRole, senderAvatar } = body;

    if (!content || !content.trim()) {
      return NextResponse.json(
        { success: false, error: 'Message content cannot be empty' },
        { status: 400 }
      );
    }

    const newMessage: ChatMessage = {
      id: `msg_${contractId}_${Date.now()}`,
      contractId,
      senderId: senderId || 'client_1',
      senderName: senderName || 'Alex Vance',
      senderRole: senderRole || 'client',
      senderAvatar: senderAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=256',
      content: content.trim(),
      timestamp: new Date().toISOString(),
      status: 'sent',
    };

    if (!INITIAL_MESSAGES[contractId]) {
      INITIAL_MESSAGES[contractId] = [];
    }
    INITIAL_MESSAGES[contractId].push(newMessage);

    return NextResponse.json({
      success: true,
      message: newMessage,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to process message' },
      { status: 500 }
    );
  }
}
