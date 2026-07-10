-- Supabase 外置记忆库 - 聊天记录表
-- 在 Supabase SQL Editor 中执行此脚本

-- 聊天记录表
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assistant_id TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at);

-- RLS 策略
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anonymous insert" ON chat_messages
    FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anonymous select" ON chat_messages
    FOR SELECT TO anon USING (true);