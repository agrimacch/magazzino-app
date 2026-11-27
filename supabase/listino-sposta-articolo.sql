-- ============================================================
-- AGRIDESK v8.9.1 - SPOSTA TUTTO DA UN ARTICOLO CANCELLATO A UN ALTRO (solo admin)
-- ------------------------------------------------------------
-- Serve quando un articolo e' stato rinominato nell'Excel e l'app ne ha creato uno nuovo:
-- le macchine dell'Inventario Macchine erano rimaste sul vecchio (cancellato).
-- listino_sposta_articolo(da, a):
--   - solo admin; "da" deve essere tra gli Articoli cancellati, "a" attivo
--   - sposta su "a": macchine (articolo e set), composizione dei set, righe degli ordini clienti,
--     collegamenti dei Listini Fornitori, storico dei netti, movimenti e correzioni dell'inventario
--   - codice a barre e codice articolo: se "a" non li ha, prende quelli di "da"
--   - alla fine elimina "da" (non serve piu')
-- Nuova funzione, non tocca niente finche' non la si usa. Si puo' rieseguire.
-- ============================================================

create or replace function public.listino_sposta_articolo(p_da bigint, p_a bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_da public.listino_articoli%rowtype;
    v_a  public.listino_articoli%rowtype;
    v_macchine int := 0;
    v_righe int := 0;
begin
    if not public.is_admin() then
        raise exception 'Solo un admin puo'' spostare gli articoli';
    end if;
    if p_da = p_a then
        raise exception 'Scegli un articolo diverso';
    end if;
    select * into v_da from public.listino_articoli where id = p_da for update;
    select * into v_a  from public.listino_articoli where id = p_a for update;
    if v_da.id is null or v_a.id is null then
        raise exception 'Articolo non trovato';
    end if;
    if v_da.attivo then
        raise exception 'Si sposta solo da un articolo cancellato';
    end if;
    if not v_a.attivo then
        raise exception 'L''articolo di arrivo e'' tra i cancellati: ripristinalo prima';
    end if;

    if to_regclass('public.macchine_pezzi') is not null then
        update public.macchine_pezzi set articolo_id = p_a where articolo_id = p_da;
        get diagnostics v_macchine = row_count;
        update public.macchine_pezzi set set_id = p_a where set_id = p_da;
    end if;
    if to_regclass('public.macchine_composizione') is not null then
        -- se "a" ha gia' lo stesso componente / set, la riga doppia di "da" si toglie
        delete from public.macchine_composizione d
         where d.set_id = p_da
           and exists (select 1 from public.macchine_composizione x where x.set_id = p_a and x.componente_id = d.componente_id);
        update public.macchine_composizione set set_id = p_a where set_id = p_da;
        delete from public.macchine_composizione d
         where d.componente_id = p_da
           and exists (select 1 from public.macchine_composizione x where x.set_id = d.set_id and x.componente_id = p_a);
        update public.macchine_composizione set componente_id = p_a where componente_id = p_da;
    end if;
    if to_regclass('public.macchine_ordini_righe') is not null then
        update public.macchine_ordini_righe set articolo_id = p_a where articolo_id = p_da;
        get diagnostics v_righe = row_count;
    end if;
    if to_regclass('public.lf_articoli') is not null then
        update public.lf_articoli set articolo_id = p_a where articolo_id = p_da;
    end if;
    if to_regclass('public.listino_storico_netti') is not null then
        update public.listino_storico_netti set articolo_id = p_a where articolo_id = p_da;
    end if;
    if to_regclass('public.macchine_movimenti') is not null then
        update public.macchine_movimenti set articolo_id = p_a where articolo_id = p_da;
    end if;
    if to_regclass('public.macchine_correzioni') is not null then
        update public.macchine_correzioni set articolo_id = p_a where articolo_id = p_da;
    end if;

    -- codici: prima li tolgo dal vecchio (il codice a barre deve essere unico)
    update public.listino_articoli set codice_barre = null, codice_articolo = null where id = p_da;
    update public.listino_articoli
       set codice_barre = coalesce(codice_barre, v_da.codice_barre),
           codice_articolo = coalesce(codice_articolo, v_da.codice_articolo)
     where id = p_a;

    delete from public.listino_articoli where id = p_da;
    return jsonb_build_object('macchine', v_macchine, 'righe_ordini', v_righe);
end;
$$;

revoke all on function public.listino_sposta_articolo(bigint, bigint) from public, anon;
grant execute on function public.listino_sposta_articolo(bigint, bigint) to authenticated;

-- Controllo: deve comparire la funzione
select proname as funzione from pg_proc where proname = 'listino_sposta_articolo';
