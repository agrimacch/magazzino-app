-- ========================================
-- AGRIDESK - Ordini Clienti: "senza servizio di installazione"
-- Da eseguire UNA volta su Supabase > SQL Editor (si puo' rieseguire: se le colonne ci sono gia' non succede nulla).
-- Le stesse righe sono anche in ordini-clienti-setup.sql.
-- ========================================
alter table public.macchine_ordini add column if not exists senza_installazione boolean not null default false;
alter table public.macchine_ordini add column if not exists firma_installazione text;   -- PNG base64 (seconda firma)
