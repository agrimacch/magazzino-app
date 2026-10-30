-- ============================================================
-- AGRIMAG - INTERVENTI ESTERNI: AVVISI TELEGRAM (v5.1.0)
-- ------------------------------------------------------------
-- Tabella "interventi_inviati": la fotografia di cosa e' gia' stato
-- mandato su Telegram. Quando si preme "Invia a Telegram" la funzione
-- confronta il planning con questa fotografia, manda UN riepilogo con
-- le differenze (nuovi, modificati, annullati, tolti) e aggiorna la foto.
-- Cosi' se una riga viene corretta 3 volte, su Telegram arriva solo
-- la versione finale.
--
-- Va eseguito DOPO interventi-esterni-setup.sql.
-- Come si usa: Supabase > SQL Editor > New query, incolla tutto
-- e premi Run. Si puo' rieseguire senza problemi.
-- ============================================================

create table if not exists public.interventi_inviati (
    tecnico_id   bigint not null references public.tecnici(id) on delete cascade,
    data         date not null,
    turno        text not null,
    posizione    smallint not null,
    ora          text,
    tipo         text,
    esito        text,
    cliente      text,
    inviato_at   timestamptz not null default now(),
    inviato_da   text,
    primary key (tecnico_id, data, turno, posizione)
);

create index if not exists interventi_inviati_data_idx on public.interventi_inviati (data);

alter table public.interventi_inviati enable row level security;

drop policy if exists "interventi_inviati_lettura" on public.interventi_inviati;
create policy "interventi_inviati_lettura" on public.interventi_inviati
    for select to authenticated using (true);

drop policy if exists "interventi_inviati_scrittura" on public.interventi_inviati;
create policy "interventi_inviati_scrittura" on public.interventi_inviati
    for all to authenticated
    using (public.puo_modificare_interventi())
    with check (public.puo_modificare_interventi());

-- Tempo reale: il contatore "da inviare" si azzera anche sugli altri dispositivi
do $$
begin
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'interventi_inviati'
    ) then
        alter publication supabase_realtime add table public.interventi_inviati;
    end if;
end $$;

-- Controllo finale: 2 regole e realtime = true
select
    p.policyname as regola,
    p.cmd as operazione,
    exists (
        select 1 from pg_publication_tables r
        where r.pubname = 'supabase_realtime' and r.tablename = 'interventi_inviati'
    ) as realtime
from pg_policies p
where p.tablename = 'interventi_inviati'
order by p.policyname;
