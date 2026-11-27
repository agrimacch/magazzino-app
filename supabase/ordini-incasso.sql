-- ============================================================
-- AGRIDESK v8.3.0 - Ordini clienti: chi ha ricevuto il saldo
-- ------------------------------------------------------------
-- saldo_operatore = email di chi ha segnato l'ordine come PAGATO (chi ha ricevuto i soldi).
-- Nell'app e sul PDF si vedono le sue iniziali (sul PDF "ricevuto da" solo per contanti e assegni).
-- Gli acconti hanno gia' chi li ha registrati (campo "operatore" dentro la colonna acconti).
-- Si puo' eseguire piu' volte. Non tocca i dati esistenti.
-- ============================================================
alter table public.macchine_ordini
    add column if not exists saldo_operatore text;

-- controllo
select count(*) filter (where pagato) as ordini_pagati,
       count(*) filter (where saldo_operatore is not null) as con_chi_ha_ricevuto
from public.macchine_ordini;
