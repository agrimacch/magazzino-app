-- ============================================================
-- AGRIDESK - ELIMINARE UN ORDINE SENZA LASCIARE TRACCIA (solo admin)
-- ------------------------------------------------------------
-- Il pulsante "Elimina ordine" (solo admin) cancella ordine, righe, macchine DA ORDINARE,
-- richiesta di montaggio non organizzata e manda il PDF nel cestino di Drive.
-- Questa funzione toglie poi dal registro movimenti tutte le righe con quel numero
-- d'ordine (es. "ORDINE 1/2026 ..."), che l'app da sola non puo' cancellare.
-- Per sicurezza non fa niente se esiste ancora (o di nuovo) un ordine con quel numero.
--
-- Come si usa: Supabase > SQL Editor > New query, incolla tutto e premi Run.
-- Si puo' rieseguire senza problemi.
-- ============================================================

create or replace function public.ordine_elimina_tracce(p_numero text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    n integer;
begin
    if not exists (
        select 1 from public.user_roles
        where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
          and role = 'admin'
    ) then
        raise exception 'Solo un admin puo'' eliminare le tracce di un ordine';
    end if;
    if p_numero is null or p_numero !~ '^[0-9]+/[0-9]{4}$' then
        raise exception 'Numero d''ordine non valido: %', p_numero;
    end if;
    if exists (select 1 from public.macchine_ordini where (numero || '/' || anno) = p_numero) then
        raise exception 'Esiste un ordine con il numero %: non cancello i movimenti', p_numero;
    end if;
    delete from public.macchine_movimenti where dettaglio like 'ORDINE ' || p_numero || ' %';
    get diagnostics n = row_count;
    return n;
end;
$$;

revoke all on function public.ordine_elimina_tracce(text) from public;
grant execute on function public.ordine_elimina_tracce(text) to authenticated;
