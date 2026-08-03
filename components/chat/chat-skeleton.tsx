'use client';

import { Card } from '@/components/ui/card';

export function ChatListSkeleton() {
  return (
    <div className="space-y-3 p-3 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-card/40 border border-border/30">
          <div className="h-10 w-10 rounded-full bg-muted/60 shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-muted/60 rounded w-3/4" />
            <div className="h-3 bg-muted/40 rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ChatThreadSkeleton() {
  return (
    <div className="flex-1 p-6 space-y-6 animate-pulse overflow-y-auto">
      <div className="flex items-start gap-3">
        <div className="h-8 w-8 rounded-full bg-muted/60 shrink-0" />
        <div className="space-y-2">
          <div className="h-16 w-64 bg-muted/50 rounded-2xl rounded-tl-none" />
          <div className="h-3 w-16 bg-muted/30 rounded" />
        </div>
      </div>
      
      <div className="flex items-start gap-3 justify-end">
        <div className="space-y-2 flex flex-col items-end">
          <div className="h-12 w-56 bg-primary/20 rounded-2xl rounded-tr-none" />
          <div className="h-3 w-16 bg-muted/30 rounded" />
        </div>
        <div className="h-8 w-8 rounded-full bg-primary/30 shrink-0" />
      </div>

      <div className="flex items-start gap-3">
        <div className="h-8 w-8 rounded-full bg-muted/60 shrink-0" />
        <div className="space-y-2">
          <div className="h-20 w-72 bg-muted/50 rounded-2xl rounded-tl-none" />
          <div className="h-3 w-16 bg-muted/30 rounded" />
        </div>
      </div>
    </div>
  );
}
