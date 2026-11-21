-- ============================================================
-- AGRIDESK v7.11.1 - Buoni: modalita' di pagamento
-- Aggiunge una colonna alla tabella dei buoni. Non tocca altro.
-- Solo per uso interno: non compare sul buono dato al cliente (solo nell'app e sulla copia per il negozio).
-- Si puo' eseguire piu' volte.
-- ============================================================
alter table public.buoni_regalo
    add column if not exists pagamento text;

-- controllo
select pagamento, count(*) from public.buoni_regalo group by pagamento;
