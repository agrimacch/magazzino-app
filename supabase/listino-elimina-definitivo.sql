-- ============================================================
-- AGRIDESK v8.9.0 - LISTINO VENDITE: ELIMINA PER SEMPRE UN ARTICOLO CANCELLATO (solo admin)
-- ------------------------------------------------------------
-- Nuova funzione, non tocca i dati finche' non la si usa. Si puo' rieseguire.
-- listino_elimina_definitivo(id):
--   - solo admin (is_admin()) e solo articoli gia' in "Articoli cancellati" (attivo = false)
--   - NON elimina se l'articolo ha macchine in Inventario Macchine (anche consegnate) o e' componente
--     di un set: le macchine resterebbero senza articolo. Risponde con il motivo.
--   - toglie lo storico dei netti dell'articolo; le righe degli ordini clienti e gli articoli dei
--     Listini Fornitori collegati restano, solo senza collegamento (come gia' previsto dal database)
--   - se l'articolo era un SET, toglie anche la sua composizione
-- ============================================================

create or replace function public.listino_elimina_definitivo(p_id bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    v_art public.listino_articoli%rowtype;
    v_n int;
begin
    if not public.is_admin() then
        raise exception 'Solo un admin puo'' eliminare per sempre un articolo';
    end if;
    select * into v_art from public.listino_articoli where id = p_id for update;
    if not found then
        return 'GIA_ELIMINATO';
    end if;
    if v_art.attivo then
        raise exception 'L''articolo non e'' tra i cancellati: prima spostalo in "Articoli cancellati"';
    end if;

    if to_regclass('public.macchine_pezzi') is not null then
        select count(*) into v_n from public.macchine_pezzi where articolo_id = p_id;
        if v_n > 0 then
            return 'MACCHINE:' || v_n;
        end if;
    end if;
    if to_regclass('public.macchine_composizione') is not null then
        select count(*) into v_n from public.macchine_composizione where componente_id = p_id;
        if v_n > 0 then
            return 'COMPONENTE:' || v_n;
        end if;
        delete from public.macchine_composizione where set_id = p_id;
    end if;

    if to_regclass('public.listino_storico_netti') is not null then
        delete from public.listino_storico_netti where articolo_id = p_id;
    end if;

    delete from public.listino_articoli where id = p_id;
    return 'OK';
end;
$$;

revoke all on function public.listino_elimina_definitivo(bigint) from public, anon;
grant execute on function public.listino_elimina_definitivo(bigint) to authenticated;

-- Controllo: deve comparire la funzione
select proname as funzione from pg_proc where proname = 'listino_elimina_definitivo';
