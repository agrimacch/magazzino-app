-- ============================================================
-- AGRIDESK - Listino Vendite: CODICE ARTICOLO del fornitore
-- ------------------------------------------------------------
-- Nuova colonna codice_articolo di listino_articoli (facoltativa, es. STIHA02-011-3515,
-- 11371200650). Compare nel libro Ordini Macchine, si cerca nel listino, si scrive nella
-- finestra Modifica articolo e nella colonna CODICE ARTICOLO dell'Excel del listino
-- (la cella vuota non cancella il codice gia' salvato).
--
-- Articoli dei fornitori: il codice viene preso da solo da Listini Fornitori quando si fa
-- Collega / Crea (vedi listini-fornitori-setup.sql). Un codice gia' scritto non viene mai sovrascritto.
--
-- Come si usa: Supabase > SQL Editor > New query, incolla tutto e premi Run.
-- Si puo' rieseguire senza problemi.
-- ============================================================

alter table public.listino_articoli add column if not exists codice_articolo text;

-- Codici vuoti scritti come '' -> NULL
update public.listino_articoli set codice_articolo = null
where codice_articolo is not null and btrim(codice_articolo) = '';

-- Il codice del fornitore arriva da solo da Listini Fornitori (Collega / Crea):
-- trigger lf_codice_al_listino in listini-fornitori-setup.sql.
-- (Il vecchio Listino STIHL e il suo trigger sono stati tolti con pulizia-vecchio-listino-stihl.sql)

-- Controllo: quanti articoli hanno il codice articolo
select count(*) filter (where codice_articolo is not null) as con_codice_articolo,
       count(*) as articoli_totali
from public.listino_articoli;
