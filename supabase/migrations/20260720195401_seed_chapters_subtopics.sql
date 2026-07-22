/*
# Seed IBPS SO IT Chapters and Subtopics

Inserts 14 IBPS SO IT exam subjects in priority order (1 = highest),
each with priority-ordered subtopics reflecting IBPS SO IT syllabus weightage.
*/

-- Chapters
INSERT INTO chapters (name, slug, priority, description) VALUES
('Data Communications & Networking', 'cn', 1, 'Network fundamentals, protocols, email systems, DNS & internet services'),
('DBMS', 'dbms', 2, 'SQL & DBMS queries, normalization, architecture, concurrency control, transactions'),
('Data Structures & Algorithms', 'dsa', 3, 'IBPS SO IT PYQ-specific DSA topics, frequently asked and most expected'),
('AI & ML', 'aiml', 4, 'Artificial Intelligence & Machine Learning concepts per IBPS SO IT'),
('IoT', 'iot', 5, 'Internet of Things architecture, protocols, and applications'),
('Data Engineering / Warehousing & ETL', 'data-engineering', 6, 'Data warehousing, ETL processes, data pipelines'),
('Cybersecurity', 'cybersecurity', 7, 'Cryptography, security standards, cybersecurity threats & defenses'),
('OS & Linux/Unix', 'os-linux', 8, 'Operating systems concepts, Linux/Unix commands and administration'),
('Cloud Computing', 'cloud', 9, 'Cloud service models, virtualization, deployment architectures'),
('Web Technologies', 'web-tech', 10, 'HTML, CSS, JavaScript, web protocols, and frameworks'),
('Software Engineering', 'software-engineering', 11, 'SDLC models, testing, project management, design patterns'),
('Regex', 'regex', 12, 'Regular expressions: pattern matching, syntax, applications'),
('File Systems', 'file-systems', 13, 'File system structures, allocation methods, access control'),
('Disaster Recovery', 'disaster-recovery', 14, 'Disaster recovery planning, BCP, backup strategies, RTO/RPO')
ON CONFLICT (slug) DO NOTHING;

-- Helper: insert subtopics for a given chapter slug
-- We use explicit column aliases to avoid ambiguity with chapters columns.

-- 1. CN
INSERT INTO subtopics (chapter_id, name, slug, priority)
SELECT c.id, v.sub_name, v.sub_slug, v.sub_priority
FROM chapters c
JOIN (VALUES
('cn', 'Network Fundamentals', 'network-fundamentals', 1),
('cn', 'Protocols (TCP/IP, OSI)', 'protocols', 2),
('cn', 'Email Systems & Protocols', 'email-systems', 3),
('cn', 'DNS & Internet Services', 'dns-internet-services', 4),
('cn', 'Routing & Switching', 'routing-switching', 5),
('cn', 'Network Topologies & Media', 'topologies-media', 6),
('cn', 'IP Addressing & Subnetting', 'ip-addressing', 7),
('cn', 'Network Security Basics', 'network-security-basics', 8),
('cn', 'Wireless & Mobile Networks', 'wireless-networks', 9),
('cn', 'Network Devices & Equipment', 'network-devices', 10)
) AS v(chap_slug, sub_name, sub_slug, sub_priority) ON v.chap_slug = c.slug
ON CONFLICT (chapter_id, slug) DO NOTHING;

-- 2. DBMS
INSERT INTO subtopics (chapter_id, name, slug, priority)
SELECT c.id, v.sub_name, v.sub_slug, v.sub_priority
FROM chapters c
JOIN (VALUES
('dbms', 'SQL & DBMS Queries', 'sql-queries', 1),
('dbms', 'DB Normalization & Architecture', 'normalization-architecture', 2),
('dbms', 'Concurrency Control & Transactions', 'concurrency-transactions', 3),
('dbms', 'Indexing & Query Optimization', 'indexing-optimization', 4),
('dbms', 'Relational Model & Keys', 'relational-model', 5),
('dbms', 'Joins & Set Operations', 'joins-set-operations', 6),
('dbms', 'Stored Procedures & Triggers', 'procedures-triggers', 7),
('dbms', 'NoSQL & Distributed Databases', 'nosql-distributed', 8),
('dbms', 'ACID Properties & Isolation Levels', 'acid-isolation', 9),
('dbms', 'Data Integrity & Constraints', 'data-integrity', 10)
) AS v(chap_slug, sub_name, sub_slug, sub_priority) ON v.chap_slug = c.slug
ON CONFLICT (chapter_id, slug) DO NOTHING;

-- 3. DSA
INSERT INTO subtopics (chapter_id, name, slug, priority)
SELECT c.id, v.sub_name, v.sub_slug, v.sub_priority
FROM chapters c
JOIN (VALUES
('dsa', 'Arrays & Strings', 'arrays-strings', 1),
('dsa', 'Linked Lists', 'linked-lists', 2),
('dsa', 'Stacks & Queues', 'stacks-queues', 3),
('dsa', 'Trees & Graphs', 'trees-graphs', 4),
('dsa', 'Sorting Algorithms', 'sorting', 5),
('dsa', 'Searching Algorithms', 'searching', 6),
('dsa', 'Dynamic Programming', 'dynamic-programming', 7),
('dsa', 'Hashing & Hash Tables', 'hashing', 8),
('dsa', 'Time & Space Complexity', 'complexity-analysis', 9),
('dsa', 'Greedy & Divide-and-Conquer', 'greedy-divide-conquer', 10)
) AS v(chap_slug, sub_name, sub_slug, sub_priority) ON v.chap_slug = c.slug
ON CONFLICT (chapter_id, slug) DO NOTHING;

-- 4. AI & ML
INSERT INTO subtopics (chapter_id, name, slug, priority)
SELECT c.id, v.sub_name, v.sub_slug, v.sub_priority
FROM chapters c
JOIN (VALUES
('aiml', 'Machine Learning Basics', 'ml-basics', 1),
('aiml', 'Supervised Learning', 'supervised-learning', 2),
('aiml', 'Unsupervised Learning', 'unsupervised-learning', 3),
('aiml', 'Neural Networks & Deep Learning', 'neural-networks', 4),
('aiml', 'Natural Language Processing', 'nlp', 5),
('aiml', 'Reinforcement Learning', 'reinforcement-learning', 6),
('aiml', 'Model Evaluation & Metrics', 'model-evaluation', 7),
('aiml', 'Feature Engineering', 'feature-engineering', 8),
('aiml', 'AI Fundamentals & Search Algorithms', 'ai-fundamentals', 9),
('aiml', 'Computer Vision', 'computer-vision', 10)
) AS v(chap_slug, sub_name, sub_slug, sub_priority) ON v.chap_slug = c.slug
ON CONFLICT (chapter_id, slug) DO NOTHING;

-- 5. IoT
INSERT INTO subtopics (chapter_id, name, slug, priority)
SELECT c.id, v.sub_name, v.sub_slug, v.sub_priority
FROM chapters c
JOIN (VALUES
('iot', 'IoT Architecture & Layers', 'iot-architecture', 1),
('iot', 'IoT Protocols (MQTT, CoAP)', 'iot-protocols', 2),
('iot', 'Sensors & Actuators', 'sensors-actuators', 3),
('iot', 'IoT Security & Privacy', 'iot-security', 4),
('iot', 'Edge & Fog Computing', 'edge-fog-computing', 5),
('iot', 'IoT Gateways & Cloud Integration', 'iot-gateways', 6),
('iot', 'Wireless Communication (RFID, NFC, Zigbee)', 'iot-wireless', 7),
('iot', 'IoT Applications & Use Cases', 'iot-applications', 8),
('iot', 'Embedded Systems for IoT', 'embedded-systems', 9),
('iot', 'IoT Data Management', 'iot-data-management', 10)
) AS v(chap_slug, sub_name, sub_slug, sub_priority) ON v.chap_slug = c.slug
ON CONFLICT (chapter_id, slug) DO NOTHING;

-- 6. Data Engineering
INSERT INTO subtopics (chapter_id, name, slug, priority)
SELECT c.id, v.sub_name, v.sub_slug, v.sub_priority
FROM chapters c
JOIN (VALUES
('data-engineering', 'ETL Processes & Tools', 'etl-processes', 1),
('data-engineering', 'Data Warehouse Architecture', 'warehouse-architecture', 2),
('data-engineering', 'Star & Snowflake Schemas', 'star-snowflake-schemas', 3),
('data-engineering', 'Data Modeling for Warehousing', 'data-modeling-warehouse', 4),
('data-engineering', 'OLAP vs OLTP', 'olap-oltp', 5),
('data-engineering', 'Data Integration & Quality', 'data-integration', 6),
('data-engineering', 'Slowly Changing Dimensions (SCD)', 'scd', 7),
('data-engineering', 'Data Pipelines & Orchestration', 'data-pipelines', 8),
('data-engineering', 'Metadata Management', 'metadata-management', 9),
('data-engineering', 'Big Data Processing (Hadoop, Spark)', 'big-data-processing', 10)
) AS v(chap_slug, sub_name, sub_slug, sub_priority) ON v.chap_slug = c.slug
ON CONFLICT (chapter_id, slug) DO NOTHING;

-- 7. Cybersecurity
INSERT INTO subtopics (chapter_id, name, slug, priority)
SELECT c.id, v.sub_name, v.sub_slug, v.sub_priority
FROM chapters c
JOIN (VALUES
('cybersecurity', 'Cryptography & Security Standards', 'cryptography', 1),
('cybersecurity', 'Network Security & Firewalls', 'network-security', 2),
('cybersecurity', 'Threats & Attack Types', 'threats-attacks', 3),
('cybersecurity', 'Authentication & Access Control', 'auth-access-control', 4),
('cybersecurity', 'Security Policies & Frameworks', 'security-frameworks', 5),
('cybersecurity', 'Malware & Intrusion Detection', 'malware-ids', 6),
('cybersecurity', 'PKI & Digital Signatures', 'pki-digital-signatures', 7),
('cybersecurity', 'Web Application Security', 'web-security', 8),
('cybersecurity', 'Security Auditing & Compliance', 'auditing-compliance', 9),
('cybersecurity', 'Incident Response & Forensics', 'incident-response', 10)
) AS v(chap_slug, sub_name, sub_slug, sub_priority) ON v.chap_slug = c.slug
ON CONFLICT (chapter_id, slug) DO NOTHING;

-- 8. OS & Linux/Unix
INSERT INTO subtopics (chapter_id, name, slug, priority)
SELECT c.id, v.sub_name, v.sub_slug, v.sub_priority
FROM chapters c
JOIN (VALUES
('os-linux', 'Process Management & Scheduling', 'process-management', 1),
('os-linux', 'Memory Management & Virtual Memory', 'memory-management', 2),
('os-linux', 'Linux/Unix Commands', 'linux-commands', 3),
('os-linux', 'File Permissions & Ownership', 'file-permissions', 4),
('os-linux', 'Shell Scripting', 'shell-scripting', 5),
('os-linux', 'Inter-process Communication (IPC)', 'ipc', 6),
('os-linux', 'Deadlocks & Synchronization', 'deadlocks-sync', 7),
('os-linux', 'Paging & Segmentation', 'paging-segmentation', 8),
('os-linux', 'Linux File System Hierarchy', 'linux-fs-hierarchy', 9),
('os-linux', 'System Administration & Services', 'system-admin', 10)
) AS v(chap_slug, sub_name, sub_slug, sub_priority) ON v.chap_slug = c.slug
ON CONFLICT (chapter_id, slug) DO NOTHING;

-- 9. Cloud
INSERT INTO subtopics (chapter_id, name, slug, priority)
SELECT c.id, v.sub_name, v.sub_slug, v.sub_priority
FROM chapters c
JOIN (VALUES
('cloud', 'Cloud Service Models (IaaS, PaaS, SaaS)', 'service-models', 1),
('cloud', 'Virtualization & Hypervisors', 'virtualization', 2),
('cloud', 'Cloud Deployment Models', 'deployment-models', 3),
('cloud', 'Cloud Storage & Databases', 'cloud-storage', 4),
('cloud', 'Cloud Security & Compliance', 'cloud-security', 5),
('cloud', 'Containerization (Docker, Kubernetes)', 'containerization', 6),
('cloud', 'Load Balancing & Auto-scaling', 'load-balancing', 7),
('cloud', 'Serverless & Microservices', 'serverless-microservices', 8),
('cloud', 'Cloud Providers (AWS, Azure, GCP)', 'cloud-providers', 9),
('cloud', 'Multi-cloud & Hybrid Cloud', 'multi-hybrid-cloud', 10)
) AS v(chap_slug, sub_name, sub_slug, sub_priority) ON v.chap_slug = c.slug
ON CONFLICT (chapter_id, slug) DO NOTHING;

-- 10. Web Technologies
INSERT INTO subtopics (chapter_id, name, slug, priority)
SELECT c.id, v.sub_name, v.sub_slug, v.sub_priority
FROM chapters c
JOIN (VALUES
('web-tech', 'HTML & CSS', 'html-css', 1),
('web-tech', 'JavaScript & DOM', 'javascript-dom', 2),
('web-tech', 'HTTP & Web Protocols', 'http-protocols', 3),
('web-tech', 'REST & SOAP APIs', 'rest-soap-apis', 4),
('web-tech', 'Web Frameworks & Architecture', 'web-frameworks', 5),
('web-tech', 'Session Management & Cookies', 'session-cookies', 6),
('web-tech', 'Web Security (XSS, CSRF)', 'web-security-topics', 7),
('web-tech', 'XML & JSON', 'xml-json', 8),
('web-tech', 'Responsive Design & Frontend Tools', 'responsive-design', 9),
('web-tech', 'Web Servers & Hosting', 'web-servers', 10)
) AS v(chap_slug, sub_name, sub_slug, sub_priority) ON v.chap_slug = c.slug
ON CONFLICT (chapter_id, slug) DO NOTHING;

-- 11. Software Engineering
INSERT INTO subtopics (chapter_id, name, slug, priority)
SELECT c.id, v.sub_name, v.sub_slug, v.sub_priority
FROM chapters c
JOIN (VALUES
('software-engineering', 'SDLC Models (Waterfall, Agile, Spiral)', 'sdlc-models', 1),
('software-engineering', 'Software Testing & Methodologies', 'testing', 2),
('software-engineering', 'Requirements Analysis & Specification', 'requirements', 3),
('software-engineering', 'Software Design & Architecture', 'design-architecture', 4),
('software-engineering', 'Project Management & Estimation', 'project-management', 5),
('software-engineering', 'Configuration Management & Version Control', 'config-management', 6),
('software-engineering', 'Design Patterns', 'design-patterns', 7),
('software-engineering', 'Quality Assurance & Metrics', 'quality-assurance', 8),
('software-engineering', 'UML & Modeling Diagrams', 'uml-modeling', 9),
('software-engineering', 'Maintenance & Reengineering', 'maintenance', 10)
) AS v(chap_slug, sub_name, sub_slug, sub_priority) ON v.chap_slug = c.slug
ON CONFLICT (chapter_id, slug) DO NOTHING;

-- 12. Regex
INSERT INTO subtopics (chapter_id, name, slug, priority)
SELECT c.id, v.sub_name, v.sub_slug, v.sub_priority
FROM chapters c
JOIN (VALUES
('regex', 'Regex Syntax & Metacharacters', 'regex-syntax', 1),
('regex', 'Character Classes & Quantifiers', 'char-classes-quantifiers', 2),
('regex', 'Anchors & Boundaries', 'anchors-boundaries', 3),
('regex', 'Groups & Backreferences', 'groups-backreferences', 4),
('regex', 'Lookahead & Lookbehind', 'lookahead-lookbehind', 5),
('regex', 'Regex in Programming Languages', 'regex-in-languages', 6),
('regex', 'Common Regex Patterns', 'common-patterns', 7),
('regex', 'Regex Flags & Modifiers', 'regex-flags', 8),
('regex', 'Pattern Matching Applications', 'pattern-matching', 9),
('regex', 'Regex Performance & Optimization', 'regex-performance', 10)
) AS v(chap_slug, sub_name, sub_slug, sub_priority) ON v.chap_slug = c.slug
ON CONFLICT (chapter_id, slug) DO NOTHING;

-- 13. File Systems
INSERT INTO subtopics (chapter_id, name, slug, priority)
SELECT c.id, v.sub_name, v.sub_slug, v.sub_priority
FROM chapters c
JOIN (VALUES
('file-systems', 'File System Structures', 'fs-structures', 1),
('file-systems', 'File Allocation Methods', 'file-allocation', 2),
('file-systems', 'Directory Structures', 'directory-structures', 3),
('file-systems', 'Access Methods & File Operations', 'access-methods', 4),
('file-systems', 'Disk Scheduling Algorithms', 'disk-scheduling', 5),
('file-systems', 'File Access Control & Protection', 'fs-access-control', 6),
('file-systems', 'Journaling & Log-structured FS', 'journaling-fs', 7),
('file-systems', 'Distributed & Network File Systems', 'distributed-fs', 8),
('file-systems', 'Fragmentation & Compaction', 'fragmentation', 9),
('file-systems', 'File System Types (NTFS, ext, FAT)', 'fs-types', 10)
) AS v(chap_slug, sub_name, sub_slug, sub_priority) ON v.chap_slug = c.slug
ON CONFLICT (chapter_id, slug) DO NOTHING;

-- 14. Disaster Recovery
INSERT INTO subtopics (chapter_id, name, slug, priority)
SELECT c.id, v.sub_name, v.sub_slug, v.sub_priority
FROM chapters c
JOIN (VALUES
('disaster-recovery', 'Disaster Recovery Planning', 'dr-planning', 1),
('disaster-recovery', 'Business Continuity Planning (BCP)', 'bcp', 2),
('disaster-recovery', 'Backup Strategies & Types', 'backup-strategies', 3),
('disaster-recovery', 'RTO & RPO Metrics', 'rto-rpo', 4),
('disaster-recovery', 'Recovery Site Strategies (Hot/Warm/Cold)', 'recovery-sites', 5),
('disaster-recovery', 'High Availability & Redundancy', 'high-availability', 6),
('disaster-recovery', 'DR Testing & Drills', 'dr-testing', 7),
('disaster-recovery', 'Cloud-based Disaster Recovery', 'cloud-dr', 8),
('disaster-recovery', 'Data Replication & Mirroring', 'data-replication', 9),
('disaster-recovery', 'Incident Management & Crisis Response', 'incident-management', 10)
) AS v(chap_slug, sub_name, sub_slug, sub_priority) ON v.chap_slug = c.slug
ON CONFLICT (chapter_id, slug) DO NOTHING;
