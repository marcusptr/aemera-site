// lib/supabase.js — Client Supabase partagé (service_role, accès complet, usage serveur UNIQUEMENT)
// Ne jamais importer ce fichier dans du code qui s'exécute côté navigateur.

import { createClient } from '@supabase/supabase-js';

export const supabaseAdmin = createClient(
  'https://jckfmdszxwvxqmukosyu.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);
