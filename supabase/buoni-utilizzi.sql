-- ============================================================
-- AGRIDESK v7.11.3 - Buoni: spese a piu' riprese
-- Aggiunge una colonna alla tabella dei buoni. Non tocca altro.
-- utilizzi = elenco delle spese fatte con il buono:
--   [{"data":"2026-11-25","importo":30,"note":"...","operatore":"DP","at":"..."}]
-- Residuo = importo - somma delle spese (lo calcola l'app).
-- Si puo' eseguire piu' volte.
-- ============================================================
alter table public.buoni_regalo
    add column if not exists utilizzi jsonb not null default '[]'::jsonb;

-- controllo: buoni con almeno una spesa
select count(*) filter (where jsonb_array_length(utilizzi) > 0) as buoni_con_spese, count(*) as buoni
from public.buoni_regalo;
