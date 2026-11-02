-- ========================================
-- AGRIDESK - Dati aziendali (pannello "Dati aziendali", solo admin)
-- Da eseguire UNA volta su Supabase > SQL Editor (si puo' rieseguire: non cancella nulla).
-- Una sola riga (id = 1) con i dati stampati su ordini e report.
-- Lettura: tutti gli utenti collegati. Modifica: solo admin (funzione is_admin() gia' esistente).
-- ========================================
create table if not exists public.impostazioni_azienda (
    id                  integer primary key default 1 check (id = 1),
    ragione_sociale     text,
    indirizzo           text,
    telefono_whatsapp   text,
    telefono            text,
    email               text,
    partita_iva         text,
    codice_fiscale      text,
    codice_univoco      text,
    sito_web            text,
    logo                text,          -- immagine PNG (data URL base64), vuoto = logo.png dell'app
    updated_at          timestamptz not null default now(),
    updated_by          text
);

alter table public.impostazioni_azienda enable row level security;

drop policy if exists azienda_lettura on public.impostazioni_azienda;
create policy azienda_lettura on public.impostazioni_azienda
    for select to authenticated using (true);

drop policy if exists azienda_inserimento_admin on public.impostazioni_azienda;
create policy azienda_inserimento_admin on public.impostazioni_azienda
    for insert to authenticated with check (public.is_admin());

drop policy if exists azienda_modifica_admin on public.impostazioni_azienda;
create policy azienda_modifica_admin on public.impostazioni_azienda
    for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Riga iniziale con i dati attuali (se c'e' gia' non la tocca)
insert into public.impostazioni_azienda (id, ragione_sociale, indirizzo, telefono, email, sito_web)
values (1, 'Agrimacch srl', 'Via Castellana, 86 - 30030 Martellago (VE)', '041 5401030', 'info@agrimacch.it', 'www.agrimacch.it')
on conflict (id) do nothing;
