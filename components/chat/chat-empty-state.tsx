'use client';

import { MessageSquare, ShieldCheck, Sparkles, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ChatEmptyStateProps {
  type: 'no-selected' | 'no-messages';
  contractTitle?: string;
  onQuickStart?: (message: string) => void;
}

export function ChatEmptyState({ type, contractTitle, onQuickStart }: ChatEmptyStateProps) {
  if (type === 'no-selected') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-card/10 backdrop-blur-xs rounded-2xl border border-border/30 m-4">
        <div className="h-16 w-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4 shadow-inner">
          <MessageSquare className="h-8 w-8 text-primary" />
        </div>
        <h3 className="text-xl font-bold tracking-tight text-foreground">Select a Contract Conversation</h3>
        <p className="text-muted-foreground text-sm max-w-sm mt-2">
          Choose an active contract from the list to message your client or freelancer securely.
        </p>
        <div className="flex items-center gap-2 mt-6 text-xs text-muted-foreground bg-muted/30 px-3 py-1.5 rounded-full border border-border/40">
          <ShieldCheck className="h-4 w-4 text-accent" />
          <span>All messages are encrypted and logged for escrow milestone verification</span>
        </div>
      </div>
    );
  }

  const quickPrompts = [
    "Hi there! I'm ready to discuss the milestones for this contract.",
    "Could you provide an update on the latest task progress?",
    "I have reviewed the scope requirements and look forward to working with you.",
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
      <div className="h-14 w-14 rounded-full bg-secondary/10 border border-secondary/20 flex items-center justify-center">
        <Sparkles className="h-7 w-7 text-secondary" />
      </div>
      <div>
        <h4 className="text-lg font-semibold">Start the Conversation</h4>
        <p className="text-muted-foreground text-sm max-w-md mt-1">
          This is the beginning of your chat for <span className="font-medium text-foreground">{contractTitle || 'this contract'}</span>.
        </p>
      </div>

      {onQuickStart && (
        <div className="w-full max-w-md space-y-2 pt-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Suggested Greetings</p>
          <div className="flex flex-col gap-2">
            {quickPrompts.map((prompt, idx) => (
              <button
                key={idx}
                onClick={() => onQuickStart(prompt)}
                className="text-left text-xs p-3 rounded-xl bg-card/60 hover:bg-card border border-border/40 hover:border-primary/40 text-foreground/90 transition-all flex items-center justify-between group"
              >
                <span>&quot;{prompt}&quot;</span>
                <Send className="h-3.5 w-3.5 text-primary opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
