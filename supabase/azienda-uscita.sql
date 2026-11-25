-- ============================================================
-- AGRIDESK v8.3.0 - DIRITTO DI USCITA PER COMUNE (Dati aziendali)
-- ------------------------------------------------------------
-- Aggiunge a impostazioni_azienda la colonna uscita_zone: l'elenco delle zone
-- (importo IVA compresa + comuni) che l'admin modifica in Dati aziendali.
-- Il rapportino del Magazzino esterno mezzi compila da solo l'uscita in base al paese del cliente.
-- Finche' la colonna e' vuota l'app usa le zone predefinite (45 e 65 euro).
-- Da eseguire DOPO supabase/dati-azienda-setup.sql. Non tocca i dati esistenti; si puo' rieseguire.
-- ============================================================

alter table public.impostazioni_azienda add column if not exists uscita_zone jsonb;

-- Controllo: deve comparire la colonna uscita_zone
select column_name as colonna, data_type as tipo
from information_schema.columns
where table_schema = 'public' and table_name = 'impostazioni_azienda' and column_name = 'uscita_zone';
