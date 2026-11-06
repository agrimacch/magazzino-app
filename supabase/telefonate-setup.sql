-- ============================================================
-- AGRIDESK - TELEFONATE "TEL" (v7.1.0)
-- ------------------------------------------------------------
-- Nuovo tipo TEL = telefonare al cliente, sia nelle Richieste
-- interventi robot sia nel planning (Interventi esterni).
--
-- Nel planning il tecnico tocca la riga TEL e sceglie:
--   OK = ha risposto: scrive cosa si sono detti (colonna chiamata_note);
--        parte da solo il messaggio Telegram "Chiamata eseguita"
--   NR = non risponde: viene segnata data e ora del tentativo
--        (colonna chiamata_tentativi, una riga per tentativo)
-- L'esito passa alla richiesta agganciata come per gli altri tipi
-- (trigger interventi_sync_richieste, gia' presente).
--
-- I tecnici possono solo LEGGERE il planning: l'esito della telefonata
-- lo salvano con la funzione intervento_chiamata (solo righe TEL).
--
-- Richiede: interventi-esterni-setup.sql, tecnici-ruolo-setup.sql,
--           richieste-robot-setup.sql.
-- Come si usa: Supabase > SQL Editor > New query, incolla tutto e premi Run.
-- Si puo' rieseguire senza problemi (non cancella dati).
-- ============================================================

-- ------------------------------------------------------------
-- 1. COLONNE DELLA TELEFONATA NEL PLANNING
-- ------------------------------------------------------------
alter table public.interventi add column if not exists chiamata_note text;        -- cosa si sono detti (esito OK)
alter table public.interventi add column if not exists chiamata_tentativi text;   -- "06/11 15:30 NR (AZ)", uno per riga
alter table public.interventi add column if not exists chiamata_at timestamptz;   -- quando ha risposto
alter table public.interventi add column if not exists chiamata_da text;          -- chi ha chiamato (email)

-- ------------------------------------------------------------
-- 2. TIPO TEL AMMESSO NELLE RICHIESTE
--    (tolgo il vecchio controllo INT / SOP / MONT e lo rimetto con TEL)
-- ------------------------------------------------------------
do $$
declare
    c record;
begin
    for c in
        select conname from pg_constraint
        where conrelid = 'public.richieste_robot'::regclass
          and contype = 'c'
          and pg_get_constraintdef(oid) ilike '%tipo%'
    loop
        execute format('alter table public.richieste_robot drop constraint %I', c.conname);
    end loop;
end $$;

alter table public.richieste_robot
    add constraint richieste_robot_tipo_check check (tipo in ('INT', 'SOP', 'MONT', 'TEL'));

-- ------------------------------------------------------------
-- 3. CHI PUO' REGISTRARE UNA TELEFONATA: admin, operatori e tecnici
-- ------------------------------------------------------------
create or replace function public.puo_registrare_chiamata()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.user_roles
        where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
          and role in ('admin', 'operatore', 'tecnico')
    );
$$;

-- ------------------------------------------------------------
-- 4. ESITO DELLA TELEFONATA
--    p_esito   = 'OK' (serve p_note) oppure 'NR'
--    p_quando  = data e ora della chiamata (vuoto = adesso)
--    p_chi     = iniziali di chi ha chiamato (per l'elenco dei tentativi)
-- ------------------------------------------------------------
create or replace function public.intervento_chiamata(
    p_id bigint, p_esito text, p_note text default null,
    p_quando timestamptz default null, p_chi text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
    r public.interventi%rowtype;
    utente text := coalesce(auth.jwt() ->> 'email', '');
    quando timestamptz := coalesce(p_quando, now());
    sigla text := nullif(upper(trim(coalesce(p_chi, ''))), '');
    riga text;
begin
    if not public.puo_registrare_chiamata() then
        raise exception 'Non autorizzato';
    end if;
    if p_esito not in ('OK', 'NR') then
        raise exception 'Esito non valido (OK oppure NR)';
    end if;

    select * into r from public.interventi where id = p_id for update;
    if not found then
        raise exception 'Telefonata non trovata nel planning';
    end if;
    if coalesce(r.tipo, '') <> 'TEL' then
        raise exception 'Questa riga non e'' una telefonata (tipo TEL)';
    end if;

    if p_esito = 'NR' then
        riga := to_char(quando at time zone 'Europe/Rome', 'DD/MM HH24:MI') || ' NR' ||
                coalesce(' (' || left(sigla, 5) || ')', '');
        update public.interventi
        set esito = 'NR',
            chiamata_tentativi = concat_ws(E'\n', nullif(chiamata_tentativi, ''), riga),
            updated_at = now(),
            updated_by = utente
        where id = p_id;
    else
        if coalesce(trim(p_note), '') = '' then
            raise exception 'Scrivi cosa vi siete detti';
        end if;
        update public.interventi
        set esito = 'OK',
            chiamata_note = left(upper(trim(p_note)), 2000),
            chiamata_at = quando,
            chiamata_da = utente,
            updated_at = now(),
            updated_by = utente
        where id = p_id;
    end if;
    return json_build_object('ok', true, 'esito', p_esito);
end;
$$;

grant execute on function public.puo_registrare_chiamata() to authenticated;
grant execute on function public.intervento_chiamata(bigint, text, text, timestamptz, text) to authenticated;

-- ------------------------------------------------------------
-- Controllo finale: 4 colonne, il controllo del tipo con TEL e 2 funzioni
-- ------------------------------------------------------------
select 'colonna' as cosa, column_name as nome
from information_schema.columns
where table_schema = 'public' and table_name = 'interventi' and column_name like 'chiamata%'
union all
select 'controllo tipo', pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.richieste_robot'::regclass and conname = 'richieste_robot_tipo_check'
union all
select 'funzione', proname
from pg_proc
where proname in ('puo_registrare_chiamata', 'intervento_chiamata');
