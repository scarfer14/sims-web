// Combines the SQL files into one script to paste into the Supabase SQL editor.
import { readFileSync, writeFileSync } from 'node:fs';
const read = (f) => readFileSync(new URL(`../db/${f}`, import.meta.url), 'utf8');
const out = [
  '-- SIMS: paste this whole file into Supabase > SQL Editor > New query, then Run.',
  '-- Generated from db/core.sql + db/seed.sql + db/supabase.sql (npm run build:sql).',
  '', read('core.sql'), read('seed.sql'), read('supabase.sql'),
].join('\n');
writeFileSync(new URL('../supabase/setup.sql', import.meta.url), out);
console.log('wrote supabase/setup.sql');
