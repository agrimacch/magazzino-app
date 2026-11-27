-- ============================================================
-- AGRIDESK - CARTELLINI NEGOZIO anche agli OPERATORI
-- ------------------------------------------------------------
-- Prima: solo l'admin poteva vedere, scrivere e stampare i cartellini.
-- Dopo: admin e operatori. I tecnici no. I dati non vengono toccati.
--
-- Come si usa: Supabase > SQL Editor > New query, incolla tutto e Run.
-- (Va eseguito DOPO cartellini-setup.sql. Per tornare a solo admin:
--  sostituisci ('admin', 'operatore') con ('admin') e Run)
-- ============================================================

create or replace function public.cartellini_puo_gestire()
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

-- Controllo: chi puo' usare i cartellini
select email, role from public.user_roles
where role in ('admin', 'operatore')
order by role, email;
