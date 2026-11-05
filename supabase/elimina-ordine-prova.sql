-- ============================================================
-- AGRIDESK - ELIMINARE DEL TUTTO UN ORDINE DI PROVA (e la macchina inventata)
-- ------------------------------------------------------------
-- Prima: in app Ordini Clienti > apri l'ordine > "Elimina ordine"
--        (toglie ordine, righe, macchine DA ORDINARE, richiesta di montaggio
--         non ancora organizzata e mette il PDF di Drive nel cestino).
-- Poi questo script toglie quello che l'app lascia apposta come registro:
--   - i movimenti delle macchine con quel numero d'ordine
--   - (facoltativo) l'articolo inventato nel Listino Vendite con tutto quello
--     che ha: macchine nel quaderno, movimenti, storico netti, notifiche.
--
-- Come si usa (Supabase > SQL Editor > New query):
--   1. Scrivi qui sotto il numero dell'ordine e, se serve, il modello inventato
--      (nei DUE punti: PASSO 1 e PASSO 2, stessi valori).
--   2. Esegui solo il PASSO 1 (selezionalo e premi Run): controlla cosa trova.
--   3. Se e' giusto, esegui il PASSO 2. Non si puo' tornare indietro.
-- Fallo PRIMA che un collega crei un nuovo ordine: se era l'ultimo ordine
-- dell'anno, il suo numero viene riusato dal prossimo.
-- ============================================================


-- ===================== PASSO 1: CONTROLLO =====================
with dati as (
    select '5/2026'::text   as ordine,    -- <<< numero dell'ordine come lo vedi in app (numero/anno)
           ''::text         as modello    -- <<< modello inventato come nel listino ('' = nessuno)
)
select 'ordine ancora presente (va eliminato prima dall''app)' as cosa, count(*) as quanti
  from public.macchine_ordini o, dati d where (o.numero || '/' || o.anno) = d.ordine
union all
select 'movimenti con questo numero d''ordine', count(*)
  from public.macchine_movimenti m, dati d where m.dettaglio like 'ORDINE ' || d.ordine || ' %'
union all
select 'articoli del listino con questo modello: ' || coalesce(string_agg(a.marchio || ' ' || a.modello || coalesce(' ' || a.note, '') || ' (id ' || a.id || ')', ', '), '-'), count(*)
  from public.listino_articoli a, dati d where d.modello <> '' and a.modello = upper(d.modello)
union all
select 'macchine nel quaderno di quell''articolo', count(*)
  from public.macchine_pezzi p join public.listino_articoli a on a.id = p.articolo_id, dati d
 where d.modello <> '' and a.modello = upper(d.modello);


-- ===================== PASSO 2: CANCELLAZIONE =====================
-- do $$
-- declare
--     v_ordine  text := '5/2026';   -- <<< stesso numero del PASSO 1
--     v_modello text := '';         -- <<< stesso modello del PASSO 1 ('' = nessuno)
--     v_art     bigint[];
-- begin
--     -- Movimenti dell'ordine
--     delete from public.macchine_movimenti where dettaglio like 'ORDINE ' || v_ordine || ' %';
--
--     -- Articolo inventato e tutto quello che ha
--     if v_modello <> '' then
--         select array_agg(id) into v_art from public.listino_articoli where modello = upper(v_modello);
--         if v_art is not null then
--             delete from public.macchine_movimenti where articolo_id = any(v_art);
--             delete from public.macchine_pezzi where articolo_id = any(v_art);
--             delete from public.macchine_composizione where set_id = any(v_art) or componente_id = any(v_art);
--             delete from public.listino_storico_netti where articolo_id = any(v_art);
--             delete from public.listino_notifiche where articolo_id = any(v_art);
--             delete from public.listino_articoli where id = any(v_art);
--         end if;
--     end if;
-- end $$;
--
-- (Per eseguire il PASSO 2: togli i "-- " davanti a tutte le righe dal "do $$" a "end $$;",
--  oppure copia quelle righe in una nuova query senza i "-- ". Poi rilancia il PASSO 1:
--  devono risultare tutti 0.)
