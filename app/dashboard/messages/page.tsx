"use client";

import { useEffect, useState, useCallback } from "react";
import { ConversationList, type Conversation } from "@/components/dashboard/messaging/conversation-list";
import { ChatWindow } from "@/components/dashboard/messaging/chat-window";
import { cn } from "@/lib/utils";

function getAuthHeaders(): Record<string, string> {
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("tc_dev_access_token")
      : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function getCurrentUserId(): string | null {
  if (typeof window === "undefined") return null;
  // Decode JWT payload to extract sub (user id) without a library
  try {
    const token = localStorage.getItem("tc_dev_access_token");
    if (!token) return null;
    const payload = token.split(".")[1];
    const decoded = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    // The JWT uses walletAddress as the subject; we resolve user id server-side.
    // For message ownership matching we compare sender_id (integer) vs this.
    // The API returns sender_id as a string so we use walletAddress for now.
    return decoded.sub ?? decoded.walletAddress ?? null;
  } catch {
    return null;
  }
}

export default function MessagingPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  // Mobile: show chat panel or list panel
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");

  useEffect(() => {
    setCurrentUserId(getCurrentUserId());
  }, []);

  const fetchConversations = useCallback(async () => {
    setLoadingConversations(true);
    try {
      const res = await fetch("/api/conversations", {
        headers: getAuthHeaders(),
        credentials: "include",
      });
      if (!res.ok) return;
      const data = await res.json();
      setConversations(data.conversations ?? []);
    } finally {
      setLoadingConversations(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const handleSelectConversation = (conversation: Conversation) => {
    setSelectedConversation(conversation);
    setMobileView("chat");
  };

  const handleBack = () => {
    setMobileView("list");
    // Refresh conversations to update unread counts
    fetchConversations();
  };

  return (
    <div className="p-4 sm:p-8 h-full">
      <div className="space-y-4 sm:space-y-6 h-full flex flex-col">
        {/* Page header */}
        <div>
          <h1 className="text-3xl font-bold">Messages</h1>
          <p className="text-muted-foreground mt-1">
            Communicate with your clients and freelancers within contracts.
          </p>
        </div>

        {/* Chat layout */}
        <div className="flex-1 min-h-0 rounded-xl border border-border/40 bg-card/50 backdrop-blur-sm overflow-hidden">
          <div className="flex h-full">
            {/* Conversation list — hidden on mobile when chat is open */}
            <aside
              className={cn(
                "w-full sm:w-80 border-r border-border/40 flex-shrink-0 flex flex-col",
                // On mobile: show only when in list view
                mobileView === "chat" ? "hidden sm:flex" : "flex"
              )}
            >
              <ConversationList
                conversations={conversations}
                selectedId={selectedConversation?.id ?? null}
                onSelect={handleSelectConversation}
                loading={loadingConversations}
              />
            </aside>

            {/* Chat window — hidden on mobile when list is shown */}
            <div
              className={cn(
                "flex-1 flex flex-col min-w-0",
                mobileView === "list" ? "hidden sm:flex" : "flex"
              )}
            >
              <ChatWindow
                conversation={selectedConversation}
                currentUserId={currentUserId}
                onBack={handleBack}
                isMobileView={mobileView === "chat"}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
