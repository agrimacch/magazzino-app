-- ============================================================
-- AGRIDESK v8.3.0 - CONTANTI: AZZERA TUTTO (dopo le prove)
-- ------------------------------------------------------------
-- Cancella TUTTI i passaggi, i QR e gli incassi della sezione Contanti
-- e fa ripartire il conteggio da ADESSO: gli acconti / saldi in contanti
-- registrati prima di questo momento (comprese le prove) non contano piu'.
-- Gli ordini clienti NON vengono toccati.
--
-- Da usare SOLO finite le prove, prima di cominciare a usare i contanti sul serio.
-- Come si usa: Supabase > SQL Editor > New query, incolla tutto e premi Run.
-- ============================================================

delete from public.contanti_passaggi;
delete from public.contanti_qr;
delete from public.contanti_incassi;
update public.contanti_config set dal = now() where id = 1;

-- Controllo: tutto a zero, "contanti_dal" = adesso
select (select dal from public.contanti_config) as contanti_dal,
       (select count(*) from public.contanti_incassi) as incassi,
       (select count(*) from public.contanti_passaggi) as passaggi;
