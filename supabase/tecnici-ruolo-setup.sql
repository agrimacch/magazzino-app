-- ============================================================
-- AGRIMAG - RUOLO "TECNICO" (v5.1.0)
-- ------------------------------------------------------------
-- 1. Permette di salvare il ruolo "tecnico" in Gestione Utenti
-- 2. Blocca i tecnici fuori dalla sezione Interventi Esterni ANCHE
--    nel database (non solo nell'app): niente magazzino, listino,
--    notifiche, e niente modifiche agli utenti.
--    Agli interventi pensa gia' lo script interventi-esterni-setup.sql
--    (i tecnici possono solo leggere).
--
-- Va eseguito DOPO interventi-esterni-setup.sql.
-- Come si usa: Supabase > SQL Editor > New query, incolla tutto
-- e premi Run. Si puo' rieseguire senza problemi.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Ruolo "tecnico" ammesso nella tabella user_roles
--    (se c'era un controllo che accettava solo admin/operatore
--    viene sostituito; se la colonna e' di tipo "enum" si aggiunge il valore)
-- ------------------------------------------------------------
do $$
declare
    c record;
    tipo_colonna text;
    nome_tipo text;
begin
    select data_type, udt_name into tipo_colonna, nome_tipo
    from information_schema.columns
    where table_schema = 'public' and table_name = 'user_roles' and column_name = 'role';

    if tipo_colonna = 'USER-DEFINED' then
        execute format('alter type public.%I add value if not exists %L', nome_tipo, 'tecnico');
    else
        for c in
            select conname from pg_constraint
            where conrelid = 'public.user_roles'::regclass
              and contype = 'c'
              and pg_get_constraintdef(oid) ilike '%role%'
        loop
            execute format('alter table public.user_roles drop constraint %I', c.conname);
        end loop;
        alter table public.user_roles
            add constraint user_roles_role_check check (role in ('admin', 'operatore', 'tecnico'));
    end if;
end $$;

-- ------------------------------------------------------------
-- 2. Funzione: l'utente collegato e' un tecnico?
-- ------------------------------------------------------------
create or replace function public.is_tecnico()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.user_roles
        where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
          and role = 'tecnico'
    );
$$;

-- ------------------------------------------------------------
-- 3. Regole "restrittive": si aggiungono a quelle che ci sono gia'
--    (non le cambiano). Per admin e operatori non cambia nulla;
--    i tecnici non leggono e non scrivono queste tabelle.
-- ------------------------------------------------------------
do $$
declare
    t text;
begin
    foreach t in array array[
        'articoli', 'movimenti', 'ricambi_stock', 'movimenti_ricambi',
        'listino_articoli', 'listino_storico_netti', 'listino_notifiche'
    ] loop
        if to_regclass('public.' || t) is not null then
            execute format('drop policy if exists "blocco_tecnici" on public.%I', t);
            execute format(
                'create policy "blocco_tecnici" on public.%I as restrictive for all to authenticated ' ||
                'using (not public.is_tecnico()) with check (not public.is_tecnico())', t);
        end if;
    end loop;
end $$;

-- user_roles: il tecnico deve poter LEGGERE (l'app controlla il suo ruolo),
-- ma non puo' creare, modificare o cancellare utenti
drop policy if exists "blocco_tecnici_ins" on public.user_roles;
create policy "blocco_tecnici_ins" on public.user_roles
    as restrictive for insert to authenticated with check (not public.is_tecnico());
drop policy if exists "blocco_tecnici_upd" on public.user_roles;
create policy "blocco_tecnici_upd" on public.user_roles
    as restrictive for update to authenticated using (not public.is_tecnico());
drop policy if exists "blocco_tecnici_del" on public.user_roles;
create policy "blocco_tecnici_del" on public.user_roles
    as restrictive for delete to authenticated using (not public.is_tecnico());

-- ------------------------------------------------------------
-- Controllo finale: un elenco di tabelle con la regola "blocco_tecnici..."
-- ------------------------------------------------------------
select tablename as tabella, policyname as regola, cmd as operazione, permissive
from pg_policies
where policyname like 'blocco_tecnici%'
order by tablename, policyname;
