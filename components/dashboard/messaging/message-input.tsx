"use client";

import { useState, useRef, KeyboardEvent } from "react";
import { Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface MessageInputProps {
  onSend: (content: string) => Promise<void>;
  disabled?: boolean;
  placeholder?: string;
}

export function MessageInput({
  onSend,
  disabled = false,
  placeholder = "Type a message…",
}: MessageInputProps) {
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = async () => {
    const trimmed = content.trim();
    if (!trimmed || sending || disabled) return;

    setSending(true);
    try {
      await onSend(trimmed);
      setContent("");
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Cmd/Ctrl+Enter or Enter (without Shift) sends
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const canSend = content.trim().length > 0 && !sending && !disabled;

  return (
    <div className="p-4 border-t border-border/40 bg-background/80 backdrop-blur-sm">
      <div className="flex items-end gap-3 bg-card/50 border border-border/40 rounded-xl px-4 py-2 backdrop-blur-sm focus-within:border-primary/40 transition-colors">
        <Textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder={placeholder}
          disabled={disabled || sending}
          rows={1}
          className={cn(
            "flex-1 resize-none border-0 bg-transparent p-0 shadow-none focus-visible:ring-0",
            "min-h-[36px] max-h-[160px] text-sm leading-relaxed",
            "placeholder:text-muted-foreground"
          )}
        />
        <Button
          onClick={handleSend}
          disabled={!canSend}
          size="icon-sm"
          className="shrink-0 mb-0.5 bg-primary hover:bg-primary/90 disabled:opacity-30"
          aria-label="Send message"
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground mt-1.5 text-right pr-1">
        Enter to send · Shift+Enter for new line
      </p>
    </div>
  );
}
