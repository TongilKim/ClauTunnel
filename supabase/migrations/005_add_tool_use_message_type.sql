-- Allow 'tool-use' message type in messages table for code diff display
ALTER TABLE messages DROP CONSTRAINT messages_type_check;
ALTER TABLE messages ADD CONSTRAINT messages_type_check
  CHECK (type IN ('output', 'input', 'error', 'system', 'tool-use'));
