-- ============================================================
-- AGRIDESK v7.11.6 - Ordini Fornitore: righe DA ORDINARE nelle sezioni (es. PRESTAGIONALE)
-- Aggiunge una colonna a macchine_pezzi. Non tocca altro.
--   sezione_da_ordinare = sezione del libro ordini in cui sta la macchina ANCORA DA ORDINARE
--   (vuota = ORDINI NORMALE). Si svuota quando la macchina viene segnata come ordinata.
--   Se si elimina la sezione, le righe tornano in ORDINI NORMALE.
-- Si puo' eseguire piu' volte.
-- ============================================================
alter table public.macchine_pezzi
    add column if not exists sezione_da_ordinare bigint references public.macchine_of_sezioni(id) on delete set null;

create index if not exists macchine_pezzi_sezione_da_ordinare_idx on public.macchine_pezzi (sezione_da_ordinare);

-- controllo
select count(*) filter (where stato = 'DA_ORDINARE') as da_ordinare,
       count(*) filter (where stato = 'DA_ORDINARE' and sezione_da_ordinare is not null) as in_una_sezione
from public.macchine_pezzi;
