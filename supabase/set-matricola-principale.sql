-- ============================================================
-- AGRIDESK v7.10.2 - Set: quale pezzo riceve la matricola della scatola
-- Aggiunge una colonna alla composizione dei set. Non tocca altro.
-- principale = true sul pezzo "macchina" del set (es. GTA 20 nel SET GTA 26):
-- la matricola letta sulla scatola del set va a lui. Si sceglie nella scheda Set (pallino).
-- Si puo' eseguire piu' volte.
-- ============================================================
alter table public.macchine_composizione
    add column if not exists principale boolean not null default false;

-- controllo: i set e il pezzo segnato (vuoto finche' non salvi il set con il pallino)
select s.modello as set_modello, a.modello as componente, c.quantita, c.principale
from public.macchine_composizione c
join public.listino_articoli s on s.id = c.set_id
join public.listino_articoli a on a.id = c.componente_id
order by s.modello, c.principale desc, a.modello;
