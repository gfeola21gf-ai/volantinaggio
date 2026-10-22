/* config.js — indirizzo di Supabase (stesso progetto di Le mie routine, Annona, Pasti del weekend e Piantina corso).
   Valori PUBBLICI: la sicurezza sta nelle regole di supabase/volantini.sql.
   ⚠️ Mai chiavi segrete qui. */
export const SUPABASE_URL = "https://hcseefgwbxfmtjccbrkq.supabase.co";
export const SUPABASE_CHIAVE_PUBBLICA = "sb_publishable_2m7zEzOSvmB2Gl8d5lEXfg_k3NSaOQr";

// Chiave PUBBLICA per le notifiche push (VAPID), la stessa di Le mie routine.
// La privata corrispondente sta SOLO nei "Secrets" di Supabase.
export const VAPID_CHIAVE_PUBBLICA = "BMIkTsM8WY7Tq42Vzp_Y7e-PSdzAg-hmZnBu_hRPDpU6vM0ome1tQzPxyRzmGDXfUEllMJK7ifHv2PHGjLdVsog";
