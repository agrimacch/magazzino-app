-- ============================================================
-- AGRIDESK - PULIZIA DELLE PROVE (Inventario Macchine + Ordini Clienti)
-- ------------------------------------------------------------
-- DA USARE UNA VOLTA SOLA, quando hai finito le prove e prima di
-- iniziare a lavorare sul serio.
--
-- Cancella TUTTO:
--   - le macchine del quaderno (macchine_pezzi)
--   - il registro movimenti macchine (macchine_movimenti)
--   - gli ordini clienti e le loro righe
--   - il libro Ordini Macchine (ordini al fornitore e sezioni)
-- e fa ripartire i numeri da capo (il prossimo ordine sara' il n. 1).
--
-- Richieste interventi robot (v6.3.0): le richieste di MONTAGGIO create
-- dagli ordini di prova e non ancora organizzate (esito vuoto) vengono
-- cancellate insieme agli ordini; quelle gia' organizzate restano, solo
-- scollegate dall'ordine (si cancellano dall'app se erano di prova).
-- Le richieste scritte a mano NON vengono toccate.
--
-- NON tocca: Listino Vendite, storico netti, consumabili, ricambi,
-- utenti, interventi. La composizione dei SET resta (sezione 2 se vuoi
-- cancellare anche quella).
--
-- (v6.3.0: niente piu' TRUNCATE, che Supabase rifiuta perche' la tabella
--  richieste_robot e' collegata agli ordini. Si usa DELETE.)
--
-- Come si usa: Supabase > SQL Editor > New query, incolla tutto e Run.
-- ATTENZIONE: non si puo' tornare indietro.
-- ============================================================

-- 1. Quaderno, movimenti e ordini
delete from public.macchine_movimenti;
delete from public.macchine_pezzi;
delete from public.macchine_ordini_righe;
delete from public.macchine_ordini;
-- Libro Ordini Macchine (ordini al fornitore e sezioni; serve ordini-macchine-setup.sql gia' eseguito)
delete from public.macchine_of_ordini;
delete from public.macchine_of_sezioni;

-- Contatori interni da capo (il numero d'ordine riparte comunque da 1)
select setval(pg_get_serial_sequence('public.macchine_movimenti', 'id'), 1, false);
select setval(pg_get_serial_sequence('public.macchine_pezzi', 'id'), 1, false);
select setval(pg_get_serial_sequence('public.macchine_ordini_righe', 'id'), 1, false);
select setval(pg_get_serial_sequence('public.macchine_ordini', 'id'), 1, false);

-- 2. (FACOLTATIVO) anche la composizione dei set:
--    togli i due trattini all'inizio della riga sotto prima di premere Run
-- delete from public.macchine_composizione;

-- 3. Controllo: le prime quattro devono risultare 0
select 'macchine_pezzi' as tabella, count(*) as righe from public.macchine_pezzi
union all select 'macchine_movimenti', count(*) from public.macchine_movimenti
union all select 'macchine_ordini', count(*) from public.macchine_ordini
union all select 'macchine_ordini_righe', count(*) from public.macchine_ordini_righe
union all select 'richieste robot rimaste da ordini (scollegate)', count(*) from public.richieste_robot
    where ordine_id is null and note like 'MONTAGGIO % - ORDINE %';
