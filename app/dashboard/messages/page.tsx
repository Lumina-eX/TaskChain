'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChatLayout } from '@/components/chat/chat-layout';
import { Loader2 } from 'lucide-react';

function MessagesContent() {
  const searchParams = useSearchParams();
  const contractId = searchParams.get('contractId');

  return <ChatLayout initialContractId={contractId} currentUserId="client_1" />;
}

export default function MessagesPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">In-App Messaging</h1>
        <p className="text-muted-foreground text-xs sm:text-sm mt-1">
          Direct, encrypted communication channel between clients and freelancers for contract milestones.
        </p>
      </div>

      <Suspense
        fallback={
          <div className="flex items-center justify-center min-h-[500px] text-muted-foreground gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span>Loading message workspace...</span>
          </div>
        }
      >
        <MessagesContent />
      </Suspense>
    </div>
  );
}
