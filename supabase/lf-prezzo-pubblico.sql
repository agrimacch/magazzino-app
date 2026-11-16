-- ========================================
-- AGRIDESK v7.8 - Listini Fornitori: prezzo cliente = prezzo al pubblico consigliato
-- Aggiunge una colonna a lf_listini. Non tocca le funzioni esistenti (lf_carica_listino resta com'e').
-- 'RICARICO' = netto + ricarico (come prima, valore di default per tutti i listini gia' caricati)
-- 'PUBBLICO' = prezzo al pubblico consigliato del fornitore (colonna Listino IVA esclusa) + IVA
-- Si puo' eseguire piu' volte.
-- ========================================
alter table public.lf_listini
    add column if not exists prezzo_cliente text not null default 'RICARICO';

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'lf_listini_prezzo_cliente_check') then
        alter table public.lf_listini
            add constraint lf_listini_prezzo_cliente_check check (prezzo_cliente in ('RICARICO', 'PUBBLICO'));
    end if;
end $$;

-- controllo
select id, nome, ricarico, prezzo_cliente from public.lf_listini order by nome;
