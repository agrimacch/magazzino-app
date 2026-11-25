-- ============================================================
-- AGRIDESK v8.2.0 - PLANNING INTERVENTI: FURGONE PER TECNICO (mattina / pomeriggio)
-- ------------------------------------------------------------
-- Da eseguire DOPO supabase/mezzi-setup.sql e supabase/mezzi-unita.sql. Non tocca i dati esistenti.
--   interventi_furgoni          con che furgone esce ogni tecnico, per giorno e turno (M / P).
--                               Lo stesso furgone non puo' essere dato a due tecnici nello stesso turno.
--   interventi_furgoni_inviati  la "fotografia" di cosa e' gia' stato mandato su Telegram
--                               (cosi' "Invia a Telegram" manda solo i cambi)
--   mezzi_furgoni               ora tutti gli utenti collegati possono LEGGERE i nomi dei furgoni
--   mezzi_stato_planning()      ricambi e quantita' nei furgoni (solo lettura) per il planning:
--                               admin, operatori e tecnici (il magazzino dei furgoni resta solo admin)
-- Chi scrive: admin e operatori (funzione puo_modificare_interventi(), come il planning).
-- Si puo' rieseguire senza problemi.
-- ============================================================

create table if not exists public.interventi_furgoni (
    data        date not null,
    turno       text not null check (turno in ('M', 'P')),
    tecnico_id  bigint not null references public.tecnici(id) on delete cascade,
    furgone_id  bigint not null references public.mezzi_furgoni(id) on delete cascade,
    updated_at  timestamptz not null default now(),
    updated_by  text,
    primary key (data, turno, tecnico_id),
    unique (data, turno, furgone_id)
);

create table if not exists public.interventi_furgoni_inviati (
    data        date not null,
    turno       text not null,
    tecnico_id  bigint not null references public.tecnici(id) on delete cascade,
    furgone_id  bigint references public.mezzi_furgoni(id) on delete cascade,
    inviato_at  timestamptz not null default now(),
    inviato_da  text,
    primary key (data, turno, tecnico_id)
);

alter table public.interventi_furgoni enable row level security;
alter table public.interventi_furgoni_inviati enable row level security;

drop policy if exists "interventi_furgoni_lettura" on public.interventi_furgoni;
create policy "interventi_furgoni_lettura" on public.interventi_furgoni
    for select to authenticated using (true);
drop policy if exists "interventi_furgoni_scrittura" on public.interventi_furgoni;
create policy "interventi_furgoni_scrittura" on public.interventi_furgoni
    for all to authenticated
    using (public.puo_modificare_interventi())
    with check (public.puo_modificare_interventi());

drop policy if exists "interventi_furgoni_inviati_lettura" on public.interventi_furgoni_inviati;
create policy "interventi_furgoni_inviati_lettura" on public.interventi_furgoni_inviati
    for select to authenticated using (true);
drop policy if exists "interventi_furgoni_inviati_scrittura" on public.interventi_furgoni_inviati;
create policy "interventi_furgoni_inviati_scrittura" on public.interventi_furgoni_inviati
    for all to authenticated
    using (public.puo_modificare_interventi())
    with check (public.puo_modificare_interventi());

-- I nomi dei furgoni li leggono tutti (servono nel planning)
drop policy if exists "mezzi_furgoni_lettura" on public.mezzi_furgoni;
create policy "mezzi_furgoni_lettura" on public.mezzi_furgoni
    for select to authenticated using (true);

-- Ricambi e quantita' nei furgoni, in sola lettura, per il planning
-- (se esisteva gia' con altre colonne la tolgo prima)
drop function if exists public.mezzi_stato_planning();
create or replace function public.mezzi_stato_planning()
returns table (ricambio_id bigint, marca text, modelli text, codice text, descrizione text, unita text,
               furgone_id bigint, quantita numeric, soglia numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
    if not (public.mezzi_puo_gestire() or public.puo_modificare_interventi() or public.is_tecnico()) then
        return;
    end if;
    return query
        select r.id, r.marca, r.modelli, r.codice, r.descrizione, r.unita, g.furgone_id, g.quantita::numeric, g.soglia::numeric
        from public.mezzi_ricambi r
        join public.mezzi_giacenze g on g.ricambio_id = r.id
        where r.attivo;
end;
$$;

revoke all on function public.mezzi_stato_planning() from public, anon;
grant execute on function public.mezzi_stato_planning() to authenticated;

-- Tempo reale: chi guarda il planning vede subito il furgone cambiato
do $$
begin
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'interventi_furgoni'
    ) then
        alter publication supabase_realtime add table public.interventi_furgoni;
    end if;
end $$;

-- Controllo: devono comparire le 2 tabelle con le loro regole e la regola di lettura dei furgoni
select tablename as tabella, policyname as regola
from pg_policies
where tablename in ('interventi_furgoni', 'interventi_furgoni_inviati', 'mezzi_furgoni')
order by tablename, policyname;
