-- ============================================================
-- AGRIDESK v8.4.0 - Ordini Fornitore: PREZZO NETTO D'ACQUISTO nell'ordine
-- ------------------------------------------------------------
-- macchine_pezzi.netto_ordine = netto d'acquisto a pezzo scritto nell'ordine al fornitore
--   (es. consegna anticipata EUR 450, consegna piu' avanti EUR 480).
-- Al carico l'app propone questo netto (al posto del netto 1 del listino): si conferma o si cambia.
-- Il netto 1 e lo storico dei netti del listino NON cambiano.
-- Si puo' eseguire piu' volte.
-- ============================================================
alter table public.macchine_pezzi add column if not exists netto_ordine numeric(12,2);

-- controllo
select count(*) filter (where netto_ordine is not null) as macchine_con_prezzo_ordine
from public.macchine_pezzi;
