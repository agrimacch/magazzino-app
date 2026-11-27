-- ============================================================
-- AGRIDESK - CARTELLINI NEGOZIO (v8.3.0)
-- ------------------------------------------------------------
-- cartellini_negozio: una riga per articolo del Listino Agrimacch con quello che il listino
--   non ha (tipo, nome sul cartellino, caratteristiche) e quando e' stato stampato
--   (per sapere quali cartellini sono da ristampare). I PREZZI si leggono sempre dal listino.
-- cartellini_marche: logo, testo garanzia e assistenza per ogni marchio.
-- Admin e operatori (cartellini_puo_gestire()); i tecnici no.
--
-- Come si usa: Supabase > SQL Editor > New query, incolla tutto e premi Run.
-- Si puo' rieseguire senza problemi.
-- ============================================================

create table if not exists public.cartellini_negozio (
    id                  bigserial primary key,
    articolo_id         bigint not null unique references public.listino_articoli(id) on delete cascade,
    tipo                text,            -- es. POTATORE (vuoto = ATTREZZO del listino)
    titolo              text,            -- nome sul cartellino (vuoto = MODELLO del listino)
    caratteristiche     text,            -- una per riga
    dati_modificati_at  timestamptz,     -- ultima modifica di tipo / nome / caratteristiche
    bianco_stampato_at  timestamptz,     -- ultima stampa del cartellino bianco
    bianco_prezzo       numeric,         -- prezzo LISTINO stampato
    promo_stampato_at   timestamptz,     -- ultima stampa del cartellino promo (giallo)
    promo_prezzo        numeric,         -- prezzo promo stampato
    promo_scadenza      text,            -- data "FINO AL" stampata (gg/mm/aaaa)
    updated_by          text,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

create table if not exists public.cartellini_marche (
    marchio     text primary key,        -- MAIUSCOLO, come nel listino
    logo        text,                    -- immagine PNG (data URL)
    garanzia    text,                    -- es. GARANZIA FINO A 5 ANNI (vuoto = riga non stampata)
    assistenza  text,                    -- es. ASSISTENZA DIRETTA ('' = riga non stampata)
    updated_by  text,
    updated_at  timestamptz not null default now()
);

create or replace function public.cartellini_set_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists cartellini_negozio_updated on public.cartellini_negozio;
create trigger cartellini_negozio_updated before update on public.cartellini_negozio
    for each row execute function public.cartellini_set_updated_at();

drop trigger if exists cartellini_marche_updated on public.cartellini_marche;
create trigger cartellini_marche_updated before update on public.cartellini_marche
    for each row execute function public.cartellini_set_updated_at();

-- Chi puo' usare i cartellini: admin e operatori (deve corrispondere a CART_RUOLI in cartellini-functions.js)
create or replace function public.cartellini_puo_gestire()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.user_roles
        where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
          and role in ('admin', 'operatore')
    );
$$;

alter table public.cartellini_negozio enable row level security;
alter table public.cartellini_marche enable row level security;

drop policy if exists "cartellini_negozio_tutto" on public.cartellini_negozio;
create policy "cartellini_negozio_tutto" on public.cartellini_negozio
    for all to authenticated
    using (public.cartellini_puo_gestire())
    with check (public.cartellini_puo_gestire());

drop policy if exists "cartellini_marche_tutto" on public.cartellini_marche;
create policy "cartellini_marche_tutto" on public.cartellini_marche
    for all to authenticated
    using (public.cartellini_puo_gestire())
    with check (public.cartellini_puo_gestire());

-- Controllo
select (select count(*) from public.cartellini_negozio) as schede,
       (select count(*) from public.cartellini_marche) as marche;
