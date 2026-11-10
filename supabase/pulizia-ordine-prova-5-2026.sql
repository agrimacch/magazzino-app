-- ============================================================
-- AGRIDESK - ORDINE DI PROVA N. 5/2026 (dimostrazione del 9/11/2026): ANTEPRIMA
-- ------------------------------------------------------------
-- L'ordine e' gia' stato eliminato dall'app, e con lui le righe dello storico "ORDINE 5/2026".
-- Le macchine create dalla prova (caricate in casa) sono rimaste come DISPONIBILI.
--
-- Questa query NON cambia niente: mostra le macchine create o toccate il 9/11/2026,
-- con il loro storico. Fai uno screenshot del risultato e mandalo in chat:
-- ti preparo la pulizia solo per quelle della prova.
--
-- Come si usa: Supabase > SQL Editor > New query, incolla tutto e premi Run.
-- ============================================================

select p.id as macchina,
       to_char(p.created_at at time zone 'Europe/Rome', 'DD/MM HH24:MI') as creata,
       a.marchio, a.modello,
       p.stato, coalesce(p.cliente, '-') as cliente, coalesce(p.matricola, '-') as matricola,
       p.ordine_fornitore_id as ordine_fornitore,
       (select string_agg(to_char(mv.created_at at time zone 'Europe/Rome', 'DD/MM HH24:MI') || ' ' || mv.tipo || ': ' || coalesce(mv.dettaglio, ''), '  |  ' order by mv.created_at)
          from public.macchine_movimenti mv where mv.pezzo_id = p.id) as storico
from public.macchine_pezzi p
join public.listino_articoli a on a.id = p.articolo_id
where (p.created_at at time zone 'Europe/Rome')::date = date '2026-11-09'
   or exists (select 1 from public.macchine_movimenti mv
              where mv.pezzo_id = p.id and (mv.created_at at time zone 'Europe/Rome')::date = date '2026-11-09')
order by p.created_at, p.id;
