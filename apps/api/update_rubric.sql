UPDATE rubrics
SET config = jsonb_set(config::jsonb, '{required_submissions}',
  '[{"key":"report1","label":"Project Introduction","week":1},
    {"key":"report2","label":"PMP","week":2},
    {"key":"report3","label":"SRS","week":3},
    {"key":"report4","label":"SDD","week":5},
    {"key":"report5","label":"STD","week":5},
    {"key":"report6","label":"SUG","week":14},
    {"key":"report7","label":"Final Report","week":15},
    {"key":"software","label":"Software Product","week":15}]'::jsonb
)::json
WHERE key = 'defense_sep490';
