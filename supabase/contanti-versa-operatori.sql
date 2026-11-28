-- ============================================================
-- AGRIDESK v8.4.0 - CONTANTI: "Versato in cassa / banca" anche agli OPERATORI
-- ------------------------------------------------------------
-- Prima solo l'admin poteva segnare i contanti come versati. Ora admin e operatori,
-- ma sempre e SOLO i contanti che ha in mano chi preme il pulsante.
-- Come si usa: Supabase > SQL Editor > New query, incolla tutto e premi Run. Si puo' rieseguire.
-- ============================================================

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

grant execute on function public.contanti_versa(bigint[]) to authenticated;
