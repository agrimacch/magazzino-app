-- ============================================================
-- AGRIDESK - PULIZIA DELLE PROVE DI ORDINI MACCHINE (marchio PROVA)
-- ------------------------------------------------------------
-- Per le prove si usano SOLO articoli del Listino Vendite con marchio PROVA
-- oppure con l'attrezzo che inizia con ATTREZZO PROVA (es. ATTREZZO PROVA 1, ATTREZZO PROVA 2)
-- e clienti che iniziano con PROVA.
--
-- ANTEPRIMA (facoltativa): per vedere quali articoli verranno tolti, esegui prima da sola questa riga:
--   select id, attrezzo, marchio, modello from public.listino_articoli where upper(btrim(coalesce(marchio, ''))) = 'PROVA' or upper(btrim(coalesce(attrezzo, ''))) like 'ATTREZZO PROVA%';
-- Questo script toglie TUTTO quello che riguarda gli articoli di prova, senza lasciare traccia:
--   - macchine del quaderno di articoli PROVA (anche quelle caricate e consegnate)
--   - i loro movimenti, le correzioni e le composizioni dei set
--   - gli ordini al fornitore e le sezioni del marchio PROVA (libro Ordini Macchine)
--   - storico netti e notifiche (campanella) degli articoli PROVA
--   - gli articoli PROVA del Listino Vendite
-- I messaggi Telegram gia' partiti non si possono togliere.
--
-- PRIMA, nell'app: Ordini Clienti > ogni ordine PROVA > Elimina ordine (solo admin).
-- Toglie ordine, PDF su Drive e movimenti dell'ordine (e il numero si riusa se era l'ultimo).
-- Se resta un ordine con un articolo PROVA lo script si ferma e non cancella niente.
--
-- NON tocca: altri marchi, ordini veri, consumabili, ricambi, utenti, interventi.
--
-- Come si usa: Supabase > SQL Editor > New query, incolla tutto e premi Run.
-- Si puo' rieseguire (se non c'e' piu' niente di PROVA non fa niente).
-- ============================================================

do $$
declare
    v_art bigint[];
    v_pezzi bigint[];
    v_of bigint[];
begin
    select coalesce(array_agg(id), '{}') into v_art
    from public.listino_articoli
    where upper(btrim(coalesce(marchio, ''))) = 'PROVA'
       or upper(btrim(coalesce(attrezzo, ''))) like 'ATTREZZO PROVA%';

    -- Sicurezza: niente ordini clienti con articoli PROVA (vanno eliminati dall'app)
    if exists (select 1 from public.macchine_ordini_righe where articolo_id = any(v_art)) then
        raise exception 'Ci sono ancora ordini clienti con articoli PROVA: eliminali prima dall''app (Ordini Clienti > ordine > Elimina ordine). Non ho cancellato niente.';
    end if;

    select coalesce(array_agg(id), '{}') into v_pezzi
    from public.macchine_pezzi
    where articolo_id = any(v_art) or set_id = any(v_art);

    -- Ordini al fornitore che contengono macchine di prova (anche se il marchio non e' PROVA)
    select coalesce(array_agg(distinct ordine_fornitore_id), '{}') into v_of
    from public.macchine_pezzi
    where id = any(v_pezzi) and ordine_fornitore_id is not null;

    -- Macchine, movimenti, correzioni
    delete from public.macchine_movimenti where pezzo_id = any(v_pezzi) or articolo_id = any(v_art);
    delete from public.macchine_pezzi where id = any(v_pezzi);
    delete from public.macchine_correzioni where articolo_id = any(v_art);
    delete from public.macchine_composizione where set_id = any(v_art) or componente_id = any(v_art);

    -- Libro Ordini Macchine: ordini rimasti vuoti dopo aver tolto le prove, e tutto il marchio PROVA
    delete from public.macchine_of_ordini o
     where (o.id = any(v_of) and not exists (select 1 from public.macchine_pezzi p where p.ordine_fornitore_id = o.id))
        or upper(btrim(o.marchio)) = 'PROVA';
    -- Sezioni del marchio PROVA, e sezioni chiamate PROVA... (anche sotto un marchio vero) rimaste senza ordini
    delete from public.macchine_of_sezioni s
     where upper(btrim(s.marchio)) = 'PROVA'
        or (upper(btrim(s.nome)) like 'PROVA%' and not exists (select 1 from public.macchine_of_ordini o where o.sezione_id = s.id));

    -- Listino: storico netti, notifiche, articoli
    delete from public.listino_storico_netti where articolo_id = any(v_art);
    delete from public.listino_notifiche where articolo_id = any(v_art);
    delete from public.listino_articoli where id = any(v_art);
end;
$$;

-- Controllo: devono risultare tutte 0
select 'articoli di prova nel listino' as controllo, count(*) as righe
  from public.listino_articoli where upper(btrim(coalesce(marchio, ''))) = 'PROVA' or upper(btrim(coalesce(attrezzo, ''))) like 'ATTREZZO PROVA%'
union all
select 'ordini al fornitore PROVA', count(*) from public.macchine_of_ordini where upper(btrim(marchio)) = 'PROVA'
union all
select 'sezioni PROVA', count(*) from public.macchine_of_sezioni where upper(btrim(marchio)) = 'PROVA'
union all
select 'ordini clienti con cliente PROVA (da eliminare dall''app)', count(*) from public.macchine_ordini where cliente ilike 'PROVA%'
union all
select 'sezioni senza ordini (se sono di prova eliminale dall''app: Sezione > Elimina)', count(*)
  from public.macchine_of_sezioni s where not exists (select 1 from public.macchine_of_ordini o where o.sezione_id = s.id);
