-- 0018: persistent read-state for proactive chat messages
--
-- Unread used to be derived ("proactive message newer than last user reply"),
-- so merely opening/reading a chat never cleared the badge — only replying did.
-- Add an explicit is_read flag so opening the conversation can mark messages read.

ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS is_read boolean NOT NULL DEFAULT false;

-- Backfill: proactive messages the user already replied to are considered read
-- (mirrors the previous derived logic, so badge counts stay unchanged on rollout).
UPDATE chat_messages cm
SET is_read = true
WHERE cm.is_proactive = true
  AND EXISTS (
    SELECT 1 FROM chat_messages r
    WHERE r.user_id = cm.user_id
      AND r.girlfriend_id = cm.girlfriend_id
      AND r.role = 'user'
      AND r.created_at > cm.created_at
  );

-- Partial index backing GET /api/chat/unread-count (only unread proactive rows).
CREATE INDEX IF NOT EXISTS idx_chat_messages_unread
  ON chat_messages (user_id, girlfriend_id)
  WHERE is_proactive = true AND is_read = false;
