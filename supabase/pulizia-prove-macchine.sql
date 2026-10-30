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
-- e fa ripartire i numeri da capo (il prossimo ordine sara' il n. 1).
--
-- NON tocca: Listino Vendite, storico netti, consumabili, ricambi,
-- utenti, interventi. La composizione dei SET resta (sezione 2 se vuoi
-- cancellare anche quella).
--
-- Come si usa: Supabase > SQL Editor > New query, incolla tutto e Run.
-- ATTENZIONE: non si puo' tornare indietro.
-- ============================================================

-- 1. Quaderno, movimenti e ordini (tutto insieme, numeri da capo)
truncate table
    public.macchine_ordini_righe,
    public.macchine_ordini,
    public.macchine_pezzi,
    public.macchine_movimenti
restart identity;

-- 2. (FACOLTATIVO) anche la composizione dei set:
--    togli i due trattini all'inizio della riga sotto prima di premere Run
-- truncate table public.macchine_composizione;

-- 3. Controllo: devono risultare tutti 0
select 'macchine_pezzi' as tabella, count(*) as righe from public.macchine_pezzi
union all select 'macchine_movimenti', count(*) from public.macchine_movimenti
union all select 'macchine_ordini', count(*) from public.macchine_ordini
union all select 'macchine_ordini_righe', count(*) from public.macchine_ordini_righe;
