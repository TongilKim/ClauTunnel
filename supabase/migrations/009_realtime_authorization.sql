-- Realtime Authorization: private channels with RLS on realtime.messages
--
-- Channel naming convention:
--   session:{session_id}:output|input|presence
--   machine:{machine_id}:input|output|presence
--
-- The policy extracts the entity type and ID from the channel topic,
-- then checks ownership through the machines table.

-- Enable RLS on the Realtime messages table
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

-- Policy for session channels: user must own the session's machine
CREATE POLICY realtime_session_policy ON realtime.messages
  FOR ALL
  USING (
    -- Match session:* channels
    realtime.topic() LIKE 'session:%'
    AND EXISTS (
      SELECT 1
      FROM sessions
      JOIN machines ON machines.id = sessions.machine_id
      WHERE sessions.id = (split_part(realtime.topic(), ':', 2))::uuid
      AND machines.user_id = auth.uid()
    )
  );

-- Policy for machine channels: user must own the machine
CREATE POLICY realtime_machine_policy ON realtime.messages
  FOR ALL
  USING (
    -- Match machine:* channels
    realtime.topic() LIKE 'machine:%'
    AND EXISTS (
      SELECT 1
      FROM machines
      WHERE machines.id = (split_part(realtime.topic(), ':', 2))::uuid
      AND machines.user_id = auth.uid()
    )
  );
