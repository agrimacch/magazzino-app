-- ============================================================
-- AGRIDESK v7.11.4 - Ordini clienti: piu' acconti con la data e data del saldo
-- Aggiunge due colonne a macchine_ordini. Non tocca altro (i vecchi acconti restano come sono).
--   acconti    = elenco dei versamenti: [{"data":"2026-11-21","importo":200,"metodo":"CONTANTI","operatore":"DP","at":"..."}]
--               (la colonna acconto resta la SOMMA degli acconti)
--   saldo_data = giorno in cui il cliente ha pagato il saldo (con "Pagato")
-- Si puo' eseguire piu' volte.
-- ============================================================
alter table public.macchine_ordini
    add column if not exists acconti jsonb not null default '[]'::jsonb;

alter table public.macchine_ordini
    add column if not exists saldo_data date;

-- controllo
select count(*) filter (where acconto > 0) as ordini_con_acconto,
       count(*) filter (where jsonb_array_length(acconti) > 0) as con_acconti_datati,
       count(*) filter (where saldo_data is not null) as con_data_saldo
from public.macchine_ordini;
