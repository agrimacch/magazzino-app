-- ============================================================
-- AGRIDESK v7.11.7 - Ordini clienti: righe libere con quantita' 0 (righe di solo testo)
-- Cambia solo il controllo sulla quantita' delle righe degli ordini:
--   righe con articolo del listino: da 1 a 999 (come prima)
--   righe libere (senza articolo):  da 0 a 999
-- Non tocca i dati. Si puo' eseguire piu' volte.
-- ============================================================
alter table public.macchine_ordini_righe
    drop constraint if exists macchine_ordini_righe_quantita_check;

alter table public.macchine_ordini_righe
    add constraint macchine_ordini_righe_quantita_check
    check (quantita between 0 and 999 and (quantita >= 1 or articolo_id is null));

-- controllo: deve comparire il nuovo controllo
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.macchine_ordini_righe'::regclass and conname like '%quantita%';
