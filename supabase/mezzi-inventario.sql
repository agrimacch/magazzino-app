-- ============================================================
-- AGRIDESK v8.6.0 - INVENTARIO DEI FURGONI (primo carico / conta della merce)
-- ------------------------------------------------------------
-- Da eseguire DOPO supabase/mezzi-setup.sql, mezzi-unita.sql e mezzi-ruoli.sql. Non tocca i dati esistenti.
--   mezzi_inventari                 un inventario per furgone: BOZZA mentre si conta (si salva a ogni numero,
--                                   si riprende da un altro telefono), poi CONFERMATO.
--                                   righe  = { "id ricambio": quantita' contata }
--                                   extra  = ricambi trovati nel furgone ma non in elenco (li crea l'ufficio)
--   mezzi_inventario_conferma(id)   mette nel furgone le quantita' contate (movimento RETTIFICA con nota
--                                   "INVENTARIO N. x"); i ricambi non contati restano come sono.
-- Lo fanno admin, operatori e tecnici (mezzi_puo_usare()); eliminare un inventario: admin e operatori.
-- Si puo' rieseguire senza problemi.
-- ============================================================

create table if not exists public.mezzi_inventari (
    id              bigserial primary key,
    furgone_id      bigint not null references public.mezzi_furgoni(id) on delete cascade,
    stato           text not null default 'BOZZA' check (stato in ('BOZZA', 'CONFERMATO')),
    righe           jsonb not null default '{}'::jsonb,
    extra           jsonb not null default '[]'::jsonb,
    note            text,
    riepilogo       jsonb,
    created_at      timestamptz not null default now(),
    created_by      text,
    updated_at      timestamptz not null default now(),
    updated_by      text,
    confermato_at   timestamptz,
    confermato_da   text
);

-- Una sola bozza aperta per furgone
create unique index if not exists mezzi_inventari_una_bozza on public.mezzi_inventari (furgone_id) where stato = 'BOZZA';

alter table public.mezzi_inventari enable row level security;

drop policy if exists "mezzi_inventari_lettura" on public.mezzi_inventari;
create policy "mezzi_inventari_lettura" on public.mezzi_inventari
    for select to authenticated using (public.mezzi_puo_usare());
drop policy if exists "mezzi_inventari_inserimento" on public.mezzi_inventari;
create policy "mezzi_inventari_inserimento" on public.mezzi_inventari
    for insert to authenticated with check (public.mezzi_puo_usare() and stato = 'BOZZA');
-- si modifica solo la bozza (la conferma la fa la funzione qui sotto)
drop policy if exists "mezzi_inventari_modifica" on public.mezzi_inventari;
create policy "mezzi_inventari_modifica" on public.mezzi_inventari
    for update to authenticated
    using (public.mezzi_puo_usare() and stato = 'BOZZA')
    with check (public.mezzi_puo_usare() and stato = 'BOZZA');
drop policy if exists "mezzi_inventari_cancella" on public.mezzi_inventari;
create policy "mezzi_inventari_cancella" on public.mezzi_inventari
    for delete to authenticated using (public.mezzi_puo_gestire());

-- Segna (o toglie, con quantita' null) la conta di un ricambio nella bozza.
-- Una riga alla volta: due telefoni sulla stessa bozza non si cancellano i numeri a vicenda.
create or replace function public.mezzi_inventario_segna(p_inventario bigint, p_ricambio bigint, p_quantita numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if not public.mezzi_puo_usare() then
        raise exception 'Non hai i permessi per il magazzino dei furgoni';
    end if;
    if p_quantita is not null and p_quantita < 0 then
        raise exception 'Quantita'' negativa';
    end if;
    update public.mezzi_inventari
    set righe = case when p_quantita is null then righe - p_ricambio::text
                     else righe || jsonb_build_object(p_ricambio::text, round(p_quantita, 2)) end,
        updated_at = now(),
        updated_by = coalesce(auth.jwt() ->> 'email', '')
    where id = p_inventario and stato = 'BOZZA';
    if not found then
        raise exception 'INVENTARIO_GIA_CONFERMATO';
    end if;
end;
$$;

revoke all on function public.mezzi_inventario_segna(bigint, bigint, numeric) from public, anon;
grant execute on function public.mezzi_inventario_segna(bigint, bigint, numeric) to authenticated;

-- Conferma: le quantita' contate diventano le quantita' del furgone
create or replace function public.mezzi_inventario_conferma(p_inventario bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_inv public.mezzi_inventari%rowtype;
    v_utente text := coalesce(auth.jwt() ->> 'email', '');
    v_chiave text;
    v_valore jsonb;
    v_ricambio bigint;
    v_contata numeric;
    v_prima numeric;
    v_cambiati int := 0;
    v_uguali int := 0;
begin
    if not public.mezzi_puo_usare() then
        raise exception 'Non hai i permessi per il magazzino dei furgoni';
    end if;

    select * into v_inv from public.mezzi_inventari where id = p_inventario for update;
    if not found then
        raise exception 'Inventario non trovato';
    end if;
    if v_inv.stato <> 'BOZZA' then
        raise exception 'INVENTARIO_GIA_CONFERMATO';
    end if;

    for v_chiave, v_valore in select key, value from jsonb_each(v_inv.righe) loop
        v_ricambio := v_chiave::bigint;
        if jsonb_typeof(v_valore) <> 'number' then
            continue;
        end if;
        v_contata := round((v_valore #>> '{}')::numeric, 2);
        if v_contata < 0 then
            raise exception 'Quantita'' negativa per il ricambio %', v_ricambio;
        end if;
        if not exists (select 1 from public.mezzi_ricambi where id = v_ricambio) then
            continue;   -- ricambio eliminato nel frattempo
        end if;

        insert into public.mezzi_giacenze (ricambio_id, furgone_id, quantita, soglia)
        values (v_ricambio, v_inv.furgone_id, 0, 0)
        on conflict (ricambio_id, furgone_id) do nothing;

        select g.quantita into v_prima
        from public.mezzi_giacenze g
        where g.ricambio_id = v_ricambio and g.furgone_id = v_inv.furgone_id
        for update;

        if v_prima = v_contata then
            v_uguali := v_uguali + 1;
            continue;
        end if;

        update public.mezzi_giacenze
        set quantita = v_contata, updated_at = now(), updated_by = v_utente
        where ricambio_id = v_ricambio and furgone_id = v_inv.furgone_id;

        insert into public.mezzi_movimenti (ricambio_id, furgone_id, tipo, quantita, quantita_dopo, rapportino_id, nota, utente)
        values (v_ricambio, v_inv.furgone_id, 'RETTIFICA', v_contata - v_prima, v_contata, null,
                'INVENTARIO N. ' || v_inv.id, v_utente);
        v_cambiati := v_cambiati + 1;
    end loop;

    update public.mezzi_inventari
    set stato = 'CONFERMATO',
        confermato_at = now(),
        confermato_da = v_utente,
        updated_at = now(),
        updated_by = v_utente,
        riepilogo = jsonb_build_object('contati', v_cambiati + v_uguali, 'cambiati', v_cambiati, 'uguali', v_uguali,
                                       'extra', jsonb_array_length(coalesce(v_inv.extra, '[]'::jsonb)))
    where id = v_inv.id;

    return jsonb_build_object('contati', v_cambiati + v_uguali, 'cambiati', v_cambiati, 'uguali', v_uguali);
end;
$$;

revoke all on function public.mezzi_inventario_conferma(bigint) from public, anon;
grant execute on function public.mezzi_inventario_conferma(bigint) to authenticated;

-- Tempo reale: due telefoni sulla stessa bozza vedono i numeri dell'altro
do $$
begin
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mezzi_inventari'
    ) then
        alter publication supabase_realtime add table public.mezzi_inventari;
    end if;
end $$;

-- Controllo: devono comparire 4 regole
select policyname as regola, cmd as operazione
from pg_policies
where tablename = 'mezzi_inventari'
order by policyname;
