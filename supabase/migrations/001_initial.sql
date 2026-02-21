-- ClauTunnel Database Schema
-- Initial migration for machines, sessions, messages, and push_tokens

-- Machines table: User's computers running CLI
CREATE TABLE machines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  hostname TEXT,
  status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'offline')),
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index on user_id for faster queries
CREATE INDEX idx_machines_user_id ON machines(user_id);

-- Create unique constraint on user_id + hostname to prevent duplicate machines
CREATE UNIQUE INDEX idx_machines_user_hostname ON machines(user_id, hostname) WHERE hostname IS NOT NULL;

-- Sessions table: Claude Code sessions
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'ended')),
  working_directory TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

-- Create index on machine_id for faster queries
CREATE INDEX idx_sessions_machine_id ON sessions(machine_id);

-- Create index on status for filtering active sessions
CREATE INDEX idx_sessions_status ON sessions(status);

-- Messages table: Output/input log with sequence numbers
CREATE TABLE messages (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('output', 'input', 'error', 'system')),
  content TEXT NOT NULL,
  seq INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index on session_id for faster queries
CREATE INDEX idx_messages_session_id ON messages(session_id);

-- Create index on session_id + seq for ordered retrieval
CREATE INDEX idx_messages_session_seq ON messages(session_id, seq);

-- Push tokens table: Expo push notification tokens
CREATE TABLE push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  device_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create unique constraint on token to prevent duplicates
CREATE UNIQUE INDEX idx_push_tokens_token ON push_tokens(token);

-- Create index on user_id for faster queries
CREATE INDEX idx_push_tokens_user_id ON push_tokens(user_id);

-- Enable Row Level Security on all tables
ALTER TABLE machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

-- RLS Policies for machines table
-- Users can only see their own machines
CREATE POLICY machines_select_policy ON machines
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can only insert their own machines
CREATE POLICY machines_insert_policy ON machines
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can only update their own machines
CREATE POLICY machines_update_policy ON machines
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can only delete their own machines
CREATE POLICY machines_delete_policy ON machines
  FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for sessions table
-- Users can see sessions for their machines
CREATE POLICY sessions_select_policy ON sessions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM machines
      WHERE machines.id = sessions.machine_id
      AND machines.user_id = auth.uid()
    )
  );

-- Users can insert sessions for their machines
CREATE POLICY sessions_insert_policy ON sessions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM machines
      WHERE machines.id = sessions.machine_id
      AND machines.user_id = auth.uid()
    )
  );

-- Users can update sessions for their machines
CREATE POLICY sessions_update_policy ON sessions
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM machines
      WHERE machines.id = sessions.machine_id
      AND machines.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM machines
      WHERE machines.id = sessions.machine_id
      AND machines.user_id = auth.uid()
    )
  );

-- Users can delete sessions for their machines
CREATE POLICY sessions_delete_policy ON sessions
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM machines
      WHERE machines.id = sessions.machine_id
      AND machines.user_id = auth.uid()
    )
  );

-- RLS Policies for messages table
-- Users can see messages for their sessions
CREATE POLICY messages_select_policy ON messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM sessions
      JOIN machines ON machines.id = sessions.machine_id
      WHERE sessions.id = messages.session_id
      AND machines.user_id = auth.uid()
    )
  );

-- Users can insert messages for their sessions
CREATE POLICY messages_insert_policy ON messages
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions
      JOIN machines ON machines.id = sessions.machine_id
      WHERE sessions.id = messages.session_id
      AND machines.user_id = auth.uid()
    )
  );

-- Users can delete messages for their sessions
CREATE POLICY messages_delete_policy ON messages
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM sessions
      JOIN machines ON machines.id = sessions.machine_id
      WHERE sessions.id = messages.session_id
      AND machines.user_id = auth.uid()
    )
  );

-- RLS Policies for push_tokens table
-- Users can only see their own push tokens
CREATE POLICY push_tokens_select_policy ON push_tokens
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can only insert their own push tokens
CREATE POLICY push_tokens_insert_policy ON push_tokens
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can only update their own push tokens
CREATE POLICY push_tokens_update_policy ON push_tokens
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can only delete their own push tokens
CREATE POLICY push_tokens_delete_policy ON push_tokens
  FOR DELETE
  USING (auth.uid() = user_id);

-- Enable Realtime for messages table
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for push_tokens updated_at
CREATE TRIGGER update_push_tokens_updated_at
  BEFORE UPDATE ON push_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
