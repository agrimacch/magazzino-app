-- ============================================================
-- AGRIDESK v8.7.0 - RICAMBI "SENZA SCORTA" (Magazzino esterno mezzi)
-- ------------------------------------------------------------
-- Da eseguire DOPO supabase/mezzi-setup.sql. Non tocca i dati esistenti; si puo' rieseguire.
-- senza_scorta = true: il ricambio si mette nei rapportini con il suo prezzo ma NON si conta nei furgoni
-- (niente quantita', niente scarico dal furgone, niente avvisi sotto scorta, fuori dall'inventario).
-- Es. olio, grasso, minuteria. Si imposta dalla scheda del ricambio o con la colonna SENZA SCORTA dell'Excel.
-- ============================================================

alter table public.mezzi_ricambi add column if not exists senza_scorta boolean not null default false;

-- Controllo: deve comparire la colonna senza_scorta
select column_name as colonna, data_type as tipo, column_default as predefinito
from information_schema.columns
where table_schema = 'public' and table_name = 'mezzi_ricambi' and column_name = 'senza_scorta';
