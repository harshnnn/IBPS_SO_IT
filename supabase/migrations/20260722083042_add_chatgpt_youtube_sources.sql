-- Allow 'chatgpt' and 'youtube' as question sources in addition to 'manual' and 'ai'
ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_source_check;
ALTER TABLE questions ADD CONSTRAINT questions_source_check
  CHECK (source IN ('manual','ai','chatgpt','youtube'));