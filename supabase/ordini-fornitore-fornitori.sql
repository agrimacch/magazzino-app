-- ============================================================
-- AGRIDESK v8.3.0 - Ordini Fornitore: FORNITORI CON PIU' MARCHI
-- ------------------------------------------------------------
-- of_fornitori_marchi: per ogni marchio il suo fornitore (es. ECHO, AS MOTOR, WEIBANG -> CORMIK).
--   Si compila dall'app (Ordini Fornitore > Fornitori) man mano che serve.
-- macchine_of_ordini.gruppo: gli ordini fatti insieme allo stesso fornitore (uno per marchio)
--   hanno lo stesso gruppo e nel libro si vedono come UN ordine (stessa data e iniziali).
-- Le sezioni del fornitore (prestagionali) hanno macchine_of_sezioni.marchio = 'F:<FORNITORE>'.
-- Permessi come il resto del libro (puo_gestire_macchine: admin e operatori).
--
-- Come si usa: Supabase > SQL Editor > New query, incolla tutto e premi Run. Si puo' rieseguire.
-- ============================================================

create table if not exists public.of_fornitori_marchi (
    marchio     text primary key,          -- come nel Listino Agrimacch (es. ECHO)
    fornitore   text not null,             -- es. CORMIK
    updated_at  timestamptz not null default now(),
    updated_by  text
);

alter table public.macchine_of_ordini add column if not exists gruppo text;
create index if not exists macchine_of_ordini_gruppo_idx on public.macchine_of_ordini (gruppo);

alter table public.of_fornitori_marchi enable row level security;
drop policy if exists "of_fornitori_marchi_tutto" on public.of_fornitori_marchi;
create policy "of_fornitori_marchi_tutto" on public.of_fornitori_marchi
    for all to authenticated
    using (public.puo_gestire_macchine())
    with check (public.puo_gestire_macchine());

-- Controllo
select fornitore, string_agg(marchio, ', ' order by marchio) as marchi
from public.of_fornitori_marchi group by fornitore order by fornitore;
