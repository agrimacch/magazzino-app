-- ============================================================
-- AGRIDESK v8.1.1 - MAGAZZINO ESTERNO MEZZI: ricambi A METRI (es. cavo perimetrale)
-- ------------------------------------------------------------
-- Da eseguire DOPO supabase/mezzi-setup.sql. Non cancella dati.
--   mezzi_ricambi.unita          PZ (pezzi, come prima) oppure MT (metri)
--   quantita' e soglie           da numeri interi a numeri con i decimali (es. 12,5 metri)
--   mezzi_rapportini_righe       quantita' con i decimali + unita' (resta scritta nel rapportino)
--   mezzi_muovi()                accetta anche i decimali
-- Si puo' rieseguire senza problemi.
-- ============================================================

alter table public.mezzi_ricambi
    add column if not exists unita text not null default 'PZ';

alter table public.mezzi_ricambi drop constraint if exists mezzi_ricambi_unita_check;
alter table public.mezzi_ricambi
    add constraint mezzi_ricambi_unita_check check (unita in ('PZ', 'MT'));

alter table public.mezzi_giacenze
    alter column quantita type numeric(10,2),
    alter column soglia type numeric(10,2);

alter table public.mezzi_movimenti
    alter column quantita type numeric(10,2),
    alter column quantita_dopo type numeric(10,2);

alter table public.mezzi_rapportini_righe drop constraint if exists mezzi_rapportini_righe_quantita_check;
alter table public.mezzi_rapportini_righe
    alter column quantita type numeric(10,2);
alter table public.mezzi_rapportini_righe
    add constraint mezzi_rapportini_righe_quantita_check check (quantita > 0 and quantita <= 9999);
alter table public.mezzi_rapportini_righe
    add column if not exists unita text;

-- La funzione che cambia le quantita' ora accetta i decimali
drop function if exists public.mezzi_muovi(bigint, bigint, integer, text, bigint, text);

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
        raise exception 'Non hai i permessi per il magazzino dei furgoni';
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

-- Controllo: devono comparire unita' e le quantita' "numeric"
select table_name as tabella, column_name as colonna, data_type as tipo
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'mezzi_ricambi' and column_name = 'unita')
    or (table_name in ('mezzi_giacenze', 'mezzi_movimenti', 'mezzi_rapportini_righe') and column_name in ('quantita', 'soglia', 'quantita_dopo', 'unita')))
order by table_name, column_name;
