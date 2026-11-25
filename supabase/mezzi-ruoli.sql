-- ============================================================
-- AGRIDESK v8.5.0 - MAGAZZINO ESTERNO MEZZI APERTO A OPERATORI E TECNICI
-- ------------------------------------------------------------
-- Da eseguire DOPO supabase/mezzi-setup.sql e supabase/mezzi-unita.sql. Non tocca i dati.
--   admin e operatori  -> mezzi_puo_gestire(): tutto (ricambi, carico, rettifica, Excel, movimenti,
--                         eliminare i rapportini)
--   tecnici            -> mezzi_puo_usare(): leggono furgoni, ricambi e quantita'; fanno e correggono
--                         i rapportini; i ricambi del rapportino escono / tornano nel furgone
--                         (solo movimenti USO e RESO legati a un rapportino). Non eliminano i rapportini.
--   listino_notifiche  -> i tecnici possono registrare (e la funzione Telegram rileggere) solo gli
--                         avvisi SOTTOSOGLIA_FURGONE; per il resto restano bloccati come prima.
-- Si puo' rieseguire senza problemi.
-- ============================================================

-- Chi gestisce il magazzino dei furgoni: admin e operatori (prima solo admin)
create or replace function public.mezzi_puo_gestire()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.user_roles
        where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
          and role::text in ('admin', 'operatore')
    );
$$;

-- Chi usa il magazzino dei furgoni (cerca, rapportini): admin, operatori e tecnici
create or replace function public.mezzi_puo_usare()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.user_roles
        where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
          and role::text in ('admin', 'operatore', 'tecnico')
    );
$$;

revoke all on function public.mezzi_puo_usare() from public, anon;
grant execute on function public.mezzi_puo_usare() to authenticated;

-- Lettura di furgoni, ricambi e quantita' per tutti quelli che usano la sezione
-- (la scrittura resta alla regola "<tabella>_tutto" = mezzi_puo_gestire())
do $$
declare
    t text;
begin
    foreach t in array array['mezzi_furgoni', 'mezzi_ricambi', 'mezzi_giacenze', 'mezzi_rapportini', 'mezzi_rapportini_righe'] loop
        execute format('drop policy if exists %I on public.%I', t || '_lettura', t);
        execute format('create policy %I on public.%I for select to authenticated using (public.mezzi_puo_usare())', t || '_lettura', t);
    end loop;
end $$;

-- Rapportini: anche i tecnici li creano e li modificano (eliminare resta ad admin e operatori)
drop policy if exists "mezzi_rapportini_inserimento" on public.mezzi_rapportini;
create policy "mezzi_rapportini_inserimento" on public.mezzi_rapportini
    for insert to authenticated with check (public.mezzi_puo_usare());
drop policy if exists "mezzi_rapportini_modifica" on public.mezzi_rapportini;
create policy "mezzi_rapportini_modifica" on public.mezzi_rapportini
    for update to authenticated using (public.mezzi_puo_usare()) with check (public.mezzi_puo_usare());

-- Righe del rapportino: modificando un rapportino l'app le cancella e le riscrive
drop policy if exists "mezzi_rapportini_righe_inserimento" on public.mezzi_rapportini_righe;
create policy "mezzi_rapportini_righe_inserimento" on public.mezzi_rapportini_righe
    for insert to authenticated with check (public.mezzi_puo_usare());
drop policy if exists "mezzi_rapportini_righe_modifica" on public.mezzi_rapportini_righe;
create policy "mezzi_rapportini_righe_modifica" on public.mezzi_rapportini_righe
    for update to authenticated using (public.mezzi_puo_usare()) with check (public.mezzi_puo_usare());
drop policy if exists "mezzi_rapportini_righe_cancella" on public.mezzi_rapportini_righe;
create policy "mezzi_rapportini_righe_cancella" on public.mezzi_rapportini_righe
    for delete to authenticated using (public.mezzi_puo_usare());

-- Quantita' nei furgoni: admin e operatori tutto; i tecnici solo USO / RESO di un rapportino
create or replace function public.mezzi_muovi(
    p_ricambio bigint, p_furgone bigint, p_delta numeric, p_tipo text,
    p_rapportino bigint default null, p_nota text default null
)
returns table (quantita_prima numeric, quantita_dopo numeric, soglia numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_prima numeric;
    v_soglia numeric;
    v_dopo numeric;
    v_delta numeric := round(coalesce(p_delta, 0), 2);
    v_utente text := coalesce(auth.jwt() ->> 'email', '');
begin
    if not public.mezzi_puo_gestire() then
        if not (public.mezzi_puo_usare()
                and p_tipo in ('USO', 'RESO')
                and p_rapportino is not null
                and exists (select 1 from public.mezzi_rapportini r where r.id = p_rapportino)) then
            raise exception 'Non hai i permessi per il magazzino dei furgoni';
        end if;
    end if;
    insert into public.mezzi_giacenze (ricambio_id, furgone_id, quantita, soglia)
    values (p_ricambio, p_furgone, 0, 0)
    on conflict (ricambio_id, furgone_id) do nothing;

    select g.quantita, g.soglia into v_prima, v_soglia
    from public.mezzi_giacenze g
    where g.ricambio_id = p_ricambio and g.furgone_id = p_furgone
    for update;

    v_dopo := v_prima + v_delta;
    if v_dopo < 0 then
        raise exception 'QUANTITA_INSUFFICIENTE: nel furgone ce ne sono %', v_prima;
    end if;

    update public.mezzi_giacenze
    set quantita = v_dopo, updated_at = now(), updated_by = v_utente
    where ricambio_id = p_ricambio and furgone_id = p_furgone;

    if v_delta <> 0 then
        insert into public.mezzi_movimenti (ricambio_id, furgone_id, tipo, quantita, quantita_dopo, rapportino_id, nota, utente)
        values (p_ricambio, p_furgone, p_tipo, v_delta, v_dopo, p_rapportino, p_nota, v_utente);
    end if;

    return query select v_prima, v_dopo, v_soglia;
end;
$$;

revoke all on function public.mezzi_muovi(bigint, bigint, numeric, text, bigint, text) from public, anon;
grant execute on function public.mezzi_muovi(bigint, bigint, numeric, text, bigint, text) to authenticated;

-- Avvisi sotto scorta dei furgoni: i tecnici possono registrarli (campanella + Telegram).
-- Prima il blocco dei tecnici valeva per tutta la tabella; ora lascia passare solo SOTTOSOGLIA_FURGONE.
do $$
begin
    if to_regclass('public.listino_notifiche') is not null then
        drop policy if exists "blocco_tecnici" on public.listino_notifiche;
        create policy "blocco_tecnici" on public.listino_notifiche as restrictive for all to authenticated
            using (not public.is_tecnico() or tipo = 'SOTTOSOGLIA_FURGONE')
            with check (not public.is_tecnico() or tipo = 'SOTTOSOGLIA_FURGONE');
    end if;
end $$;

-- Controllo: devono comparire le regole _lettura, _inserimento, _modifica, _cancella e blocco_tecnici
select tablename as tabella, policyname as regola, cmd as operazione
from pg_policies
where tablename like 'mezzi_%' or (tablename = 'listino_notifiche' and policyname = 'blocco_tecnici')
order by tablename, policyname;
