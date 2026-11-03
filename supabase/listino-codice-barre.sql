-- ========================================
-- AGRIDESK - Listino Vendite: codice a barre per modello
-- Da eseguire UNA volta su Supabase > SQL Editor (si puo' rieseguire: se c'e' gia' non succede nulla).
-- Il codice e' facoltativo (puo' restare vuoto), ma due articoli non possono avere lo stesso codice.
-- ========================================
alter table public.listino_articoli add column if not exists codice_barre text;

-- Codici vuoti scritti come '' -> NULL (cosi' non contano come doppioni)
update public.listino_articoli set codice_barre = null where codice_barre is not null and btrim(codice_barre) = '';

-- Nessun doppione (i NULL, cioe' gli articoli senza codice, sono ammessi quanti si vuole)
create unique index if not exists listino_articoli_codice_barre_unico
    on public.listino_articoli (codice_barre)
    where codice_barre is not null;
