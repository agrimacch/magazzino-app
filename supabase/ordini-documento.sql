-- ============================================================
-- AGRIDESK - ORDINI CLIENTI: DOCUMENTO FISCALE (SCONTRINO / FATTURA)
-- ------------------------------------------------------------
-- Nel modulo dell'ordine, prima delle Note, si sceglie obbligatoriamente
-- "Scontrino" oppure "Fattura". Compare nel dettaglio e nel PDF dell'ordine.
-- Gli ordini gia' fatti restano senza (vuoto): si sceglie quando si modificano.
--
-- Come si usa: Supabase > SQL Editor > New query, incolla tutto e premi Run.
-- Si puo' rieseguire senza problemi.
-- ============================================================

alter table public.macchine_ordini add column if not exists documento text;

alter table public.macchine_ordini drop constraint if exists macchine_ordini_documento_check;
alter table public.macchine_ordini add constraint macchine_ordini_documento_check
    check (documento is null or documento in ('SCONTRINO', 'FATTURA'));

-- Controllo: deve uscire una riga "documento"
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'macchine_ordini' and column_name = 'documento';
