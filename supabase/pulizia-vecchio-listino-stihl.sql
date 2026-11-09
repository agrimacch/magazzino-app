-- ============================================================
-- AGRIDESK - PULIZIA: toglie il VECCHIO Listino STIHL
-- ------------------------------------------------------------
-- Da eseguire DOPO listini-fornitori-setup.sql e DOPO aver pubblicato la versione dell'app
-- senza il vecchio Listino STIHL (./update-version.sh e ./push-all.sh).
--
-- Cosa fa:
--   1. controlla che in Listini Fornitori ci sia il fornitore STIHL (se manca si ferma e non tocca niente)
--   2. ricopia in Listini Fornitori collegamenti ed EAN fatti nel vecchio listino DOPO la copia
--      (solo dove in Listini Fornitori mancano: niente viene sovrascritto)
--   3. cancella le tabelle stihl_articoli e stihl_fonti con le loro regole e le funzioni stihl_*
--
-- NON tocca il Listino Agrimacch (articoli, prezzi, codici a barre, codici articolo restano)
-- e non tocca le tabelle lf_* di Listini Fornitori.
-- Dopo: ricarica OPG e OPM da Listini Fornitori > Carica file con "Sostituisci" e metti le scadenze.
--
-- Come si usa: Supabase > SQL Editor > New query, incolla tutto e premi Run.
-- Si puo' rieseguire senza problemi (se le tabelle non ci sono piu' non fa niente).
-- ============================================================

do $$
declare v_f bigint;
begin
    if to_regclass('public.lf_fornitori') is null then
        raise exception 'Manca Listini Fornitori: esegui prima listini-fornitori-setup.sql';
    end if;
    select id into v_f from public.lf_fornitori where nome = 'STIHL';

    if to_regclass('public.stihl_articoli') is not null then
        if v_f is null then
            raise exception 'In Listini Fornitori non c''e'' il fornitore STIHL: non cancello niente';
        end if;

        -- articoli del vecchio listino che non erano ancora stati copiati
        insert into public.lf_articoli (fornitore_id, codice, descrizione, categoria, ean, articolo_id, updated_at, updated_by)
        select v_f, s.codice, s.descrizione, s.categoria, s.ean, s.articolo_id, s.updated_at, s.updated_by
        from public.stihl_articoli s
        on conflict (fornitore_id, codice) do nothing;

        -- collegamenti ed EAN fatti dopo la copia (solo dove mancano)
        update public.lf_articoli a
           set articolo_id = coalesce(a.articolo_id, s.articolo_id),
               ean = coalesce(a.ean, s.ean)
          from public.stihl_articoli s
         where a.fornitore_id = v_f
           and a.codice = s.codice
           and ((a.articolo_id is null and s.articolo_id is not null) or (a.ean is null and s.ean is not null));
    end if;
end;
$$;

-- Tabelle del vecchio listino (con le loro regole di accesso e il trigger del codice articolo)
drop table if exists public.stihl_articoli cascade;
drop table if exists public.stihl_fonti cascade;

-- Funzioni del vecchio listino
drop function if exists public.stihl_collega(bigint, bigint);
drop function if exists public.stihl_codice_al_listino();
drop function if exists public.stihl_puo_vedere();
drop function if exists public.stihl_puo_caricare();

-- Controllo finale: cosa resta in Listini Fornitori
select 'fornitori' as cosa, count(*) as quanti from public.lf_fornitori
union all select 'listini', count(*) from public.lf_listini
union all select 'articoli', count(*) from public.lf_articoli
union all select 'articoli collegati al Listino Agrimacch', count(*) from public.lf_articoli where articolo_id is not null
union all select 'articoli con EAN', count(*) from public.lf_articoli where ean is not null
union all select 'prezzi', count(*) from public.lf_prezzi;
