/*
# Add Miscellaneous chapter for full-test imports

1. New Data
- Adds a "Miscellaneous" chapter (priority 15) for questions that span multiple topics,
  e.g. when a user imports a full test from a ChatGPT conversation or YouTube video
  that covers many subjects at once.
2. Subtopics
- Adds a single "Mixed / Full Test" subtopic under Miscellaneous so imported
  full-test questions have a home.
3. Notes
- No schema changes — uses existing chapters/subtopics tables.
*/

INSERT INTO chapters (name, slug, priority, description)
VALUES ('Miscellaneous', 'miscellaneous', 15, 'Full tests and mixed-topic question sets that span multiple chapters.')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO subtopics (chapter_id, name, slug, priority)
SELECT c.id, 'Mixed / Full Test', 'mixed-full-test', 1
FROM chapters c
WHERE c.slug = 'miscellaneous'
AND NOT EXISTS (
  SELECT 1 FROM subtopics s WHERE s.chapter_id = c.id AND s.slug = 'mixed-full-test'
);