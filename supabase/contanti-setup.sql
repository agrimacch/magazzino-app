-- ============================================================
-- AGRIDESK v8.3.0 - CONTANTI: chi ha in mano i soldi degli ordini clienti
-- ------------------------------------------------------------
-- Ogni acconto / saldo pagato in CONTANTI (registrato da oggi in poi) e' un "incasso".
-- All'inizio i soldi sono di chi l'ha registrato (le sue iniziali). Per passarli a un collega:
--   chi DA' mostra un QR (vale 60 secondi), chi RICEVE lo legge con l'app e preme "Ricevo EUR ...".
--   Solo chi riceve cambia il detentore. Chi ha i soldi alla fine segna "Versato in cassa / banca".
-- Admin e operatori. Le tabelle si cambiano SOLO con le funzioni qui sotto (nessuno scrive a mano).
--
-- Come si usa: Supabase > SQL Editor > New query, incolla tutto e premi Run.
-- Serve prima supabase/ordini-incasso.sql (colonna saldo_operatore). Si puo' rieseguire.
-- ============================================================

-- Da quando contare (la prima volta = adesso; i pagamenti vecchi non entrano)
create table if not exists public.contanti_config (
    id   integer primary key default 1 check (id = 1),
    dal  timestamptz not null default now()
);
insert into public.contanti_config (id) values (1) on conflict (id) do nothing;

create table if not exists public.contanti_incassi (
    id             bigserial primary key,
    ordine_id      bigint not null references public.macchine_ordini(id) on delete cascade,
    chiave         text not null,            -- 'A:<at>' acconto, 'S' saldo
    tipo           text not null,            -- ACCONTO | SALDO
    data           date,
    importo        numeric not null,
    registrato_da  text,                     -- email di chi l'ha registrato
    detentore      text not null,            -- email di chi ha i soldi adesso
    versato_at     timestamptz,              -- versato in cassa / banca (fine del giro)
    versato_da     text,
    sparito        boolean not null default false,   -- tolto dall'ordine o ordine annullato
    created_at     timestamptz not null default now(),
    unique (ordine_id, chiave)
);

create table if not exists public.contanti_passaggi (
    id        bigserial primary key,
    tipo      text not null default 'PASSAGGIO',     -- PASSAGGIO | VERSATO
    incassi   bigint[] not null,
    importo   numeric not null,
    da_email  text not null,
    a_email   text not null,                          -- 'CASSA' quando versato
    at        timestamptz not null default now()
);

create table if not exists public.contanti_qr (
    token     text primary key,
    da_email  text not null,
    incassi   bigint[] not null,
    importo   numeric not null,
    scade_at  timestamptz not null,
    usato_at  timestamptz,
    a_email   text
);

-- ---------- Chi puo' ----------
create or replace function public.contanti_mia_email()
returns text language sql stable as $$
    select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

create or replace function public.contanti_puo()
returns boolean language sql stable security definer set search_path = public as $$
    select exists (
        select 1 from public.user_roles
        where lower(email) = public.contanti_mia_email() and role in ('admin', 'operatore')
    );
$$;

-- ---------- Incassi in contanti presi dagli ordini ----------
create or replace function public.contanti_da_ordini()
returns table (d_ordine bigint, d_chiave text, d_tipo text, d_data date, d_importo numeric, d_registrato text)
language sql stable security definer set search_path = public as $$
    with cfg as (select dal from public.contanti_config where id = 1)
    select o.id, 'A:' || (a ->> 'at'), 'ACCONTO', nullif(a ->> 'data', '')::date,
           round((a ->> 'importo')::numeric, 2), lower(a ->> 'operatore')
    from public.macchine_ordini o
    cross join cfg
    cross join lateral jsonb_array_elements(coalesce(o.acconti, '[]'::jsonb)) a
    where public.contanti_puo()
      and o.annullato_at is null
      and upper(coalesce(a ->> 'metodo', '')) like '%CONTANTI%'
      and coalesce(a ->> 'at', '') <> '' and coalesce(a ->> 'operatore', '') <> ''
      and (a ->> 'at')::timestamptz >= cfg.dal
    union all
    select o.id, 'S', 'SALDO', o.saldo_data,
           round(o.totale - coalesce(o.acconto, 0), 2), lower(o.saldo_operatore)
    from public.macchine_ordini o
    cross join cfg
    where public.contanti_puo()
      and o.annullato_at is null and o.pagato
      and o.saldo_operatore is not null
      and o.saldo_data >= (cfg.dal at time zone 'Europe/Rome')::date
      and o.totale - coalesce(o.acconto, 0) > 0
      and upper(coalesce(case when coalesce(o.acconto, 0) > 0 then coalesce(o.metodo_saldo, o.metodo_pagamento) else o.metodo_pagamento end, ''))
          like '%CONTANTI%';
$$;

-- Aggiorna gli incassi (si chiama ogni volta che si apre la sezione Contanti)
create or replace function public.contanti_sincronizza()
returns void language plpgsql security definer set search_path = public as $$
begin
    if not public.contanti_puo() then raise exception 'Non autorizzato'; end if;
    insert into public.contanti_incassi (ordine_id, chiave, tipo, data, importo, registrato_da, detentore)
        select d_ordine, d_chiave, d_tipo, d_data, d_importo, d_registrato, d_registrato
        from public.contanti_da_ordini()
    on conflict (ordine_id, chiave) do update
        set importo = excluded.importo, data = excluded.data, sparito = false;
    update public.contanti_incassi i set sparito = true
    where not i.sparito
      and not exists (select 1 from public.contanti_da_ordini() d where d.d_ordine = i.ordine_id and d.d_chiave = i.chiave);
end;
$$;

-- ---------- QR: chi DA' i soldi ----------
create or replace function public.contanti_crea_qr(p_incassi bigint[])
returns table (qr_token text, qr_importo numeric, qr_scade timestamptz)
language plpgsql security definer set search_path = public as $$
declare
    me   text := public.contanti_mia_email();
    n    integer;
    tot  numeric;
    t    text;
    sc   timestamptz := now() + interval '60 seconds';
begin
    if not public.contanti_puo() then raise exception 'Non autorizzato'; end if;
    select count(*), coalesce(sum(i.importo), 0) into n, tot
    from public.contanti_incassi i
    where i.id = any(p_incassi) and lower(i.detentore) = me and i.versato_at is null and not i.sparito;
    if n = 0 or n <> coalesce(array_length(p_incassi, 1), 0) then
        raise exception 'Alcuni contanti non sono piu'' tuoi: aggiorna la pagina';
    end if;
    t := replace(gen_random_uuid()::text, '-', '');
    insert into public.contanti_qr (token, da_email, incassi, importo, scade_at) values (t, me, p_incassi, tot, sc);
    return query select t, tot, sc;
end;
$$;

-- Stato di un QR (chi riceve vede da chi e quanto; chi da' vede se e' stato usato)
create or replace function public.contanti_leggi_qr(p_token text)
returns table (q_da text, q_a text, q_importo numeric, q_n integer, q_scade timestamptz, q_usato boolean)
language sql stable security definer set search_path = public as $$
    select q.da_email, q.a_email, q.importo, coalesce(array_length(q.incassi, 1), 0), q.scade_at, q.usato_at is not null
    from public.contanti_qr q
    where q.token = p_token and public.contanti_puo();
$$;

-- ---------- QR: chi RICEVE i soldi ----------
create or replace function public.contanti_ricevi(p_token text)
returns numeric language plpgsql security definer set search_path = public as $$
declare
    me  text := public.contanti_mia_email();
    q   public.contanti_qr%rowtype;
    n   integer;
begin
    if not public.contanti_puo() then raise exception 'Non autorizzato'; end if;
    select * into q from public.contanti_qr where token = p_token for update;
    if not found then raise exception 'QR non valido'; end if;
    if q.usato_at is not null then raise exception 'Questo QR e'' gia'' stato usato'; end if;
    if q.scade_at < now() then raise exception 'QR scaduto: fatti mostrare un QR nuovo'; end if;
    if lower(q.da_email) = me then raise exception 'Non puoi ricevere i soldi da te stesso'; end if;
    update public.contanti_incassi set detentore = me
    where id = any(q.incassi) and lower(detentore) = lower(q.da_email) and versato_at is null and not sparito;
    get diagnostics n = row_count;
    if n <> coalesce(array_length(q.incassi, 1), 0) then
        raise exception 'I contanti sono cambiati: fatti mostrare un QR nuovo';
    end if;
    update public.contanti_qr set usato_at = now(), a_email = me where token = p_token;
    insert into public.contanti_passaggi (tipo, incassi, importo, da_email, a_email)
        values ('PASSAGGIO', q.incassi, q.importo, lower(q.da_email), me);
    return q.importo;
end;
$$;

-- ---------- Fine del giro: versato in cassa / banca (admin e operatori, solo i soldi che ha lui) ----------
create or replace function public.contanti_versa(p_incassi bigint[])
returns numeric language plpgsql security definer set search_path = public as $$
declare
    me   text := public.contanti_mia_email();
    n    integer;
    tot  numeric;
begin
    if not public.contanti_puo() then raise exception 'Non autorizzato'; end if;
    with u as (
        update public.contanti_incassi set versato_at = now(), versato_da = me
        where id = any(p_incassi) and lower(detentore) = me and versato_at is null
        returning id, importo
    )
    select count(*), coalesce(sum(importo), 0) into n, tot from u;
    if n = 0 then raise exception 'Nessun contante tuo da versare'; end if;
    insert into public.contanti_passaggi (tipo, incassi, importo, da_email, a_email)
        values ('VERSATO', p_incassi, tot, me, 'CASSA');
    return tot;
end;
$$;

-- ---------- Permessi ----------
alter table public.contanti_config   enable row level security;
alter table public.contanti_incassi  enable row level security;
alter table public.contanti_passaggi enable row level security;
alter table public.contanti_qr       enable row level security;

drop policy if exists "contanti_incassi_leggi" on public.contanti_incassi;
create policy "contanti_incassi_leggi" on public.contanti_incassi
    for select to authenticated using (public.contanti_puo());

drop policy if exists "contanti_passaggi_leggi" on public.contanti_passaggi;
create policy "contanti_passaggi_leggi" on public.contanti_passaggi
    for select to authenticated using (public.contanti_puo());
-- contanti_qr e contanti_config: nessuna lettura diretta (solo dalle funzioni)

revoke all on function public.contanti_da_ordini() from anon;
grant execute on function public.contanti_sincronizza() to authenticated;
grant execute on function public.contanti_crea_qr(bigint[]) to authenticated;
grant execute on function public.contanti_leggi_qr(text) to authenticated;
grant execute on function public.contanti_ricevi(text) to authenticated;
grant execute on function public.contanti_versa(bigint[]) to authenticated;

-- Controllo
select (select dal from public.contanti_config) as contanti_dal,
       (select count(*) from public.contanti_incassi) as incassi;
