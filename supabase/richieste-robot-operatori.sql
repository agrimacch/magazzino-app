-- ============================================================
-- AGRIDESK - RICHIESTE INTERVENTI ROBOT modificabili da TUTTI (v6.3.0)
-- ------------------------------------------------------------
-- Prima: solo l'admin poteva creare / modificare / cancellare le richieste.
-- Dopo: admin, operatori E tecnici (tutti gli utenti dell'app).
-- I dati non vengono toccati. Si puo' rieseguire senza problemi.
--
-- Come si usa: Supabase > SQL Editor > New query, incolla tutto e Run.
-- (Per tornare a solo admin: sostituisci ('admin', 'operatore', 'tecnico') con ('admin') e Run)
-- ============================================================

create or replace function public.richieste_robot_puo_modificare()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.user_roles
        where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
          and role in ('admin', 'operatore', 'tecnico')
    );
$$;

-- Controllo: chi puo' modificare le richieste
select email, role from public.user_roles
where role in ('admin', 'operatore', 'tecnico')
order by role, email;
