-- Migration: 012-messaging.sql
-- Creates the conversations and messages tables for the in-app messaging feature.

-- conversations: one per contract, links client and freelancer
CREATE TABLE IF NOT EXISTS conversations (
  id               BIGSERIAL PRIMARY KEY,
  contract_id      BIGINT       NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  client_id        BIGINT       NOT NULL REFERENCES users(id),
  freelancer_id    BIGINT       NOT NULL REFERENCES users(id),
  last_message     TEXT,
  last_message_at  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  -- Enforce one conversation per contract
  CONSTRAINT conversations_contract_id_unique UNIQUE (contract_id)
);

CREATE INDEX IF NOT EXISTS idx_conversations_client_id     ON conversations (client_id);
CREATE INDEX IF NOT EXISTS idx_conversations_freelancer_id ON conversations (freelancer_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_msg_at   ON conversations (last_message_at DESC NULLS LAST);

-- messages: individual chat messages within a conversation
CREATE TABLE IF NOT EXISTS messages (
  id               BIGSERIAL PRIMARY KEY,
  conversation_id  BIGINT       NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id        BIGINT       NOT NULL REFERENCES users(id),
  content          TEXT         NOT NULL CHECK (char_length(content) BETWEEN 1 AND 4000),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages (conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id       ON messages (sender_id);

-- conversation_participants: tracks last_read_at per user for unread count calculation
CREATE TABLE IF NOT EXISTS conversation_participants (
  conversation_id  BIGINT       NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id          BIGINT       NOT NULL REFERENCES users(id),
  last_read_at     TIMESTAMPTZ,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_conv_participants_user ON conversation_participants (user_id);
