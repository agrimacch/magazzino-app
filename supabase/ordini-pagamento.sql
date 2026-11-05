-- ========================================
-- AGRIDESK - Ordini Clienti: acconto e "pagato"
-- Da eseguire UNA volta su Supabase > SQL Editor (si puo' rieseguire: se le colonne ci sono gia' non succede nulla).
--   acconto  euro versati dal cliente: sul PDF "Acconto versato" e "DA SALDARE" = totale - acconto
--   pagato   ordine pagato tutto: sul PDF il timbro PAGATO
--   metodo_pagamento / metodo_acconto / metodo_saldo   CONTANTI, CARTA DI CREDITO, BONIFICO, BONIFICO ANTICIPATO, ASSEGNO
-- ========================================
alter table public.macchine_ordini add column if not exists acconto numeric;
alter table public.macchine_ordini add column if not exists pagato boolean not null default false;
alter table public.macchine_ordini add column if not exists metodo_pagamento text;
alter table public.macchine_ordini add column if not exists metodo_acconto text;
alter table public.macchine_ordini add column if not exists metodo_saldo text;
