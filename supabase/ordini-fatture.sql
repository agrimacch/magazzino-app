-- ============================================================
-- AGRIDESK v8.3.0 - Ordini clienti: numero e data delle FATTURE
-- ------------------------------------------------------------
-- fatture = elenco delle fatture dell'ordine (si scrivono anche dopo):
--   [{"tipo":"ACCONTO","numero":"120","data":"2026-11-21"}, {"tipo":"COMPLESSIVA","numero":"135","data":"2026-11-28"}]
--   tipo: ACCONTO (di acconto), SALDO (di saldo), COMPLESSIVA
-- Compaiono nel dettaglio e nel PDF accanto alla casella Fattura. Si puo' eseguire piu' volte.
-- ============================================================
alter table public.macchine_ordini
    add column if not exists fatture jsonb not null default '[]'::jsonb;

-- controllo
select count(*) filter (where documento = 'FATTURA') as ordini_con_fattura,
       count(*) filter (where jsonb_array_length(fatture) > 0) as con_numero_fattura
from public.macchine_ordini;
