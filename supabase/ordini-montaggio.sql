-- ============================================================
-- AGRIDESK - ORDINI CLIENTI: MONTATA PRONTA ALL'USO / IN SCATOLA
-- ------------------------------------------------------------
-- Nuova colonna montaggio delle righe degli ordini clienti:
--   MONTATA = il cliente la vuole montata pronta all'uso
--   SCATOLA = la vuole in scatola
--   vuoto   = non indicato (righe libere, ordini vecchi)
-- Serve al report dell'arrivo merce (da montare / in scatola / in casa) e compare
-- nel dettaglio dell'ordine, nel PDF e nel libro Ordini Macchine.
--
-- Come si usa: Supabase > SQL Editor > New query, incolla tutto e premi Run.
-- Si puo' rieseguire senza problemi. I dati non vengono toccati.
-- ============================================================

alter table public.macchine_ordini_righe add column if not exists montaggio text;

alter table public.macchine_ordini_righe drop constraint if exists macchine_ordini_righe_montaggio_check;
alter table public.macchine_ordini_righe add constraint macchine_ordini_righe_montaggio_check
    check (montaggio is null or montaggio in ('MONTATA', 'SCATOLA'));

-- Controllo: deve restituire 1 riga
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'macchine_ordini_righe' and column_name = 'montaggio';
