'use client';

import { useState, useRef, KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Send, Paperclip, Smile, FileCode2 } from 'lucide-react';

interface ChatInputProps {
  onSendMessage: (content: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSendMessage, disabled }: ChatInputProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    if (!text.trim() || disabled) return;
    onSendMessage(text.trim());
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  };

  const insertSnippet = (snippet: string) => {
    setText((prev) => (prev ? `${prev} ${snippet}` : snippet));
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  return (
    <div className="p-4 border-t border-border/40 bg-card/40 backdrop-blur-md rounded-b-2xl">
      {/* Quick Actions Row */}
      <div className="flex items-center gap-1.5 mb-2 overflow-x-auto pb-1 no-scrollbar text-xs">
        <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider shrink-0 mr-1">
          Quick Snippets:
        </span>
        <button
          type="button"
          onClick={() => insertSnippet('Updated milestone deliverable uploaded.')}
          className="px-2.5 py-1 rounded-full bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/30 shrink-0 transition-colors"
        >
          📦 Deliverable Ready
        </button>
        <button
          type="button"
          onClick={() => insertSnippet('Escrow milestone payment request submitted.')}
          className="px-2.5 py-1 rounded-full bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/30 shrink-0 transition-colors"
        >
          💰 Milestone Request
        </button>
        <button
          type="button"
          onClick={() => insertSnippet('Reviewing contract terms and code repository.')}
          className="px-2.5 py-1 rounded-full bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/30 shrink-0 transition-colors"
        >
          🔍 Under Review
        </button>
      </div>

      {/* Input Form */}
      <div className="flex items-end gap-2 bg-card border border-border/60 focus-within:border-primary/60 rounded-xl p-2 shadow-xs transition-colors">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0 rounded-lg"
          title="Attach file (PDF, Zip, Code)"
          onClick={() => alert('Attachment upload feature simulator: File selected!')}
        >
          <Paperclip className="h-4 w-4" />
        </Button>

        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          placeholder="Type a message to contract party... (Press Enter to send, Shift+Enter for new line)"
          rows={1}
          disabled={disabled}
          className="flex-1 bg-transparent border-0 resize-none outline-none text-sm text-foreground placeholder:text-muted-foreground/70 min-h-[36px] max-h-[120px] py-1.5 px-1 leading-normal"
        />

        <Button
          type="button"
          onClick={handleSend}
          disabled={!text.trim() || disabled}
          size="sm"
          className="h-9 px-4 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-medium flex items-center gap-1.5 transition-all shrink-0"
        >
          <span>Send</span>
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
