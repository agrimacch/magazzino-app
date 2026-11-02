-- ========================================
-- AGRIDESK - Ordini Clienti: sconto sul totale
-- Da eseguire UNA volta su Supabase > SQL Editor (si puo' rieseguire: se la colonna c'e' gia' non succede nulla).
-- La stessa riga e' anche in ordini-clienti-setup.sql.
-- ========================================
alter table public.macchine_ordini add column if not exists sconto numeric;   -- euro; totale = somma righe - sconto
