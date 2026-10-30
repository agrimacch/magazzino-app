-- ============================================================
-- AGRIDESK - INVENTARIO MACCHINE e ORDINI CLIENTI anche agli OPERATORI
-- ------------------------------------------------------------
-- Cambia solo chi puo' vedere e modificare le tabelle:
--   macchine_pezzi, macchine_composizione, macchine_movimenti,
--   macchine_ordini, macchine_ordini_righe
-- e chi puo' salvare i PDF degli ordini su Drive (funzione ordini-drive).
-- Prima: solo admin. Dopo: admin e operatori (i tecnici no).
-- I dati non vengono toccati.
--
-- Come si usa: Supabase > SQL Editor > New query, incolla tutto e Run.
-- (Per tornare a solo admin: sostituisci ('admin', 'operatore') con ('admin') e Run)
-- ============================================================

create or replace function public.puo_gestire_macchine()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.user_roles
        where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
          and role in ('admin', 'operatore')
    );
$$;

-- Controllo: elenca chi ha accesso (ruolo admin o operatore)
select email, role from public.user_roles
where role in ('admin', 'operatore')
order by role, email;
