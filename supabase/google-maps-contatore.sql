-- ========================================
-- AGRIDESK - Google Maps: contatore giornaliero (blocco spese) + fonte della posizione
-- Da eseguire UNA volta su Supabase > SQL Editor (si puo' rieseguire: non rompe niente).
--
-- Ogni uso di Google (apertura mappa, suggerimenti indirizzo, dettaglio indirizzo, ricerca posizione)
-- passa da google_maps_consuma(): massimo 300 al giorno per ogni servizio.
-- 300 x 31 giorni = 9.300 < 10.000 gratuiti al mese di Google: non si paga mai.
-- Finito il limite del giorno l'app usa OpenStreetMap fino al giorno dopo.
-- Il limite sta QUI (nel database), non nell'app: dall'app non si puo' alzare.
-- ========================================

create table if not exists public.google_maps_uso (
    giorno   date    not null,
    servizio text    not null,   -- MAPPA / SUGGERIMENTI / DETTAGLI / GEOCODING
    n        integer not null default 0,
    primary key (giorno, servizio)
);

-- Nessuno legge o scrive la tabella direttamente: solo la funzione qui sotto
alter table public.google_maps_uso enable row level security;

create or replace function public.google_maps_consuma(p_servizio text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_limite integer := 300;   -- usi al giorno per servizio (per cambiarlo: modificare qui e rieseguire)
    v_giorno date := (now() at time zone 'Europe/Rome')::date;
    v_n      integer;
begin
    if auth.uid() is null then
        return false;
    end if;
    if p_servizio not in ('MAPPA', 'SUGGERIMENTI', 'DETTAGLI', 'GEOCODING') then
        return false;
    end if;
    insert into public.google_maps_uso (giorno, servizio, n)
    values (v_giorno, p_servizio, 0)
    on conflict (giorno, servizio) do nothing;

    update public.google_maps_uso
    set n = n + 1
    where giorno = v_giorno and servizio = p_servizio and n < v_limite
    returning n into v_n;

    -- pulizia: si tengono solo gli ultimi 90 giorni
    delete from public.google_maps_uso where giorno < v_giorno - 90;

    return v_n is not null;
end;
$$;

revoke all on function public.google_maps_consuma(text) from public;
grant execute on function public.google_maps_consuma(text) to authenticated;

-- Per vedere quanto e' stato usato (da qui, SQL Editor):
--   select * from public.google_maps_uso order by giorno desc, servizio;

-- ------------------------------------------------------------
-- Fonte della posizione delle richieste robot (GOOGLE / OSM):
-- gli indirizzi NON trovati con OpenStreetMap vengono ricercati una volta con Google.
-- Funzione nuova, separata da richieste_robot_posizione (che resta com'e').
-- ------------------------------------------------------------
alter table public.richieste_robot add column if not exists geo_fonte text;

create or replace function public.richieste_robot_posizione_fonte(
    p_id bigint, p_lat double precision, p_lon double precision,
    p_stato text, p_indirizzo text, p_paese text, p_fonte text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if not (public.puo_modificare_interventi() or public.richieste_robot_puo_modificare()) then
        raise exception 'Non autorizzato';
    end if;
    update public.richieste_robot
    set lat = p_lat,
        lon = p_lon,
        geo_stato = p_stato,
        geo_indirizzo = p_indirizzo,
        geo_fonte = p_fonte,
        paese = coalesce(nullif(paese, ''), nullif(upper(trim(coalesce(p_paese, ''))), ''))
    where id = p_id;
end;
$$;

grant execute on function public.richieste_robot_posizione_fonte(bigint, double precision, double precision, text, text, text, text) to authenticated;
