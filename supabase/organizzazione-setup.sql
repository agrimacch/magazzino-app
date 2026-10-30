-- ============================================================
-- AGRIMAG - ORGANIZZAZIONE INTERVENTI (v6.1.0)
-- Promemoria WhatsApp ai clienti + meteo per intervento
-- ------------------------------------------------------------
-- 1. Interventi: segno "promemoria inviato"
--      promemoria_at  quando e' stato aperto/inviato il promemoria WhatsApp
--      promemoria_da  chi (email dall'app, oppure TELEGRAM dal link nel gruppo)
--    Sono colonne nuove e vuote: non cambiano nulla per il resto dell'app.
-- 2. org_localita: coordinate dei paesi dei clienti (cercate una volta sola)
-- 3. org_meteo_cache: previsioni MET Norway tenute 1 ora
--    Le tabelle 2 e 3 le usa solo la funzione Supabase organizzazione-interventi
--    (RLS attiva senza regole = gli utenti dell'app non le vedono).
--
-- Come si usa: Supabase > SQL Editor > New query, incolla tutto
-- e premi Run. Si puo' rieseguire senza problemi.
-- ============================================================

alter table public.interventi add column if not exists promemoria_at timestamptz;
alter table public.interventi add column if not exists promemoria_da text;

create table if not exists public.org_localita (
    nome         text primary key,          -- es. "MIRA", "RIO SAN MARTINO"
    lat          double precision,
    lon          double precision,
    trovata      boolean not null default false,
    descrizione  text,                      -- nome completo trovato su OpenStreetMap
    updated_at   timestamptz not null default now()
);
alter table public.org_localita enable row level security;

create table if not exists public.org_meteo_cache (
    chiave    text primary key,             -- "lat,lon" arrotondati
    dati      jsonb not null,
    scade_at  timestamptz not null
);
alter table public.org_meteo_cache enable row level security;

-- Controllo finale: 2 colonne promemoria + 2 tabelle con rls = true
select 'colonna interventi.' || column_name as oggetto, true as rls
from information_schema.columns
where table_schema = 'public' and table_name = 'interventi' and column_name like 'promemoria%'
union all
select 'tabella ' || relname, relrowsecurity
from pg_class where relname in ('org_localita', 'org_meteo_cache');
