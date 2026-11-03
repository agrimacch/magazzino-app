-- ============================================================
-- AGRIDESK - BUONI REGALO anche agli OPERATORI
-- ------------------------------------------------------------
-- Prima: solo l'admin poteva vedere, creare e modificare i buoni regalo
-- (e salvarli su Drive con la funzione buoni-drive).
-- Dopo: admin e operatori. I tecnici no. I dati non vengono toccati.
--
-- Come si usa: Supabase > SQL Editor > New query, incolla tutto e Run.
-- (Per tornare a solo admin: sostituisci ('admin', 'operatore') con ('admin') e Run)
-- ATTENZIONE: se un giorno riesegui buoni-regalo-setup.sql, poi riesegui anche questo.
-- ============================================================

create or replace function public.buoni_puo_gestire()
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

-- Controllo: chi puo' gestire i buoni regalo
select email, role from public.user_roles
where role in ('admin', 'operatore')
order by role, email;
