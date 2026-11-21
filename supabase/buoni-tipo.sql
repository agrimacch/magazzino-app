-- ============================================================
-- AGRIDESK v7.11 - Buoni: tipo REGALO / SPESA
-- Aggiunge una colonna alla tabella dei buoni. Non tocca altro.
-- I buoni gia' fatti restano BUONI REGALO. Stessa numerazione per i due tipi.
-- Si puo' eseguire piu' volte.
-- ============================================================
alter table public.buoni_regalo
    add column if not exists tipo text not null default 'REGALO';

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'buoni_regalo_tipo_check') then
        alter table public.buoni_regalo
            add constraint buoni_regalo_tipo_check check (tipo in ('REGALO', 'SPESA'));
    end if;
end $$;

-- controllo
select tipo, count(*) from public.buoni_regalo group by tipo;
