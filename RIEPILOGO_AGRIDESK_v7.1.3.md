ISTRUZIONI PROGETTO AGRIDESK (ex AGRIMAG) - RIEPILOGO v7.1.3 (7 novembre 2026)
Si aggiunge a RIEPILOGO_AGRIDESK_v6.3.5.md e RIEPILOGO_AGRIDESK_v6.2.0.md: regole, stile documenti, struttura e note tecniche restano quelle.
Regole di sempre: niente emoji dirette (HTML entities), accenti come entities (nei .js: \uXXXX), controllare gli z-index,
file completi, deploy su VERCEL, database Supabase. Se la chat e' collegata al Mac: file scritti direttamente in
~/Desktop/magazzino-app, riletti prima e ricontrollati dopo (la scrittura a volte arriva vecchia: aspettare qualche secondo
dopo la copia, riscrivere e ricontrollare con cmp).
Le funzioni Supabase che gia' funzionano NON si toccano: le cose nuove vanno in Edge Function o funzioni SQL separate.
Dopo ogni modifica: ./update-version.sh (cambia il ?v= dei file e il numero vX.Y.Z) e ./push-all.sh.
Manuale completo e aggiornato: MANUALE.md.

==================================================================
NOVITA' DALLA v6.3.6 ALLA v7.1.3
==================================================================

1. INVENTARIO MACCHINE: LETTORE DI CODICI A BARRE (v6.3.6 - v7.0.0)
- Lettore NETUM U820 (USB 2.4G o Bluetooth, funziona come tastiera). Manuale tradotto in italiano: documento
  "Manuale lettore U820 - traduzione italiana".
- Codice a barre per MODELLO sugli articoli del Listino Vendite (colonna codice_barre di listino_articoli, senza doppioni),
  colonna CODICE A BARRE negli Excel. In tutta l'app un codice numerico di 11-14 cifre vale uguale con o senza zeri davanti
  (listinoStessoCodiceBarre: UPC-A STIHL = EAN-13 con lo 0).
- CARICO A RAFFICA (macchine-raffica.js): si leggono tutte le scatole (codice modello + matricola, in qualsiasi ordine,
  modelli diversi insieme). Ordine Automatico (prova le due combinazioni e tiene la migliore) o fisso. Codice sconosciuto
  ripetuto = modello nuovo ("Scegli modello" + spunta = salva il codice sull'articolo). Letture salvate nel browser fino
  alla conferma. Memoria del lettore per il giro senza PC. CARICO INIZIALE (censimento delle macchine gia' in casa: niente
  clienti, completa il quaderno). Foglio "Codici del lettore" (Code 128 disegnati dall'app) e guida "i".
- Articolo non nel listino: "Crea nel listino" (dati STIHL dall'EAN) o "Crea nuovo" con netto e prezzi da completare dopo.
- Scheda CORREZIONI (v6.4.3, solo admin): toglie una macchina caricata per errore come se non fosse mai entrata
  (supabase/macchine-correzioni.sql, registro in macchine_correzioni).
- Nota: un codice a barre che dovrebbe avere il trattino ma esce col punto e' un difetto dell'etichetta, non del lettore
  (verificato il 5/11: gli altri trattini vengono letti bene).

2. LISTINO STIHL (v7.0.0, Vendite)
- File stihl-functions.js, stihl.css; tabelle stihl_articoli (con colonna ean) e stihl_fonti; supabase/listino-stihl-setup.sql.
- Import dei file Excel OPG/OPM con foglio, riga titoli e colonne configurabili (scelte ricordate); ricarico di default 30%;
  prezzo cliente = (netto + 30%) x 1,22 arrotondato all'euro; netti e ricarico oscurabili.
- EAN dal Superlistino (circa 30.000 righe): si salvano SOLO gli EAN degli articoli del listino STIHL.
- Permessi: admin e operatori vedono (operatori in sola consultazione); Carica file, Caricamenti, guida "i" e
  Collega / Crea SOLO admin (STIHL_RUOLI_VEDERE / _CARICARE / _COLLEGARE + funzione stihl_collega()).

3. ORDINI CLIENTI (v7.0.2 - v7.0.4)
- ELIMINA ORDINE solo admin (ORD_RUOLI_ELIMINA): l'ordine sparisce del tutto con i suoi movimenti
  (funzione ordine_elimina_tracce, supabase/ordini-elimina-admin.sql). Gli operatori possono solo annullare.
- PAGAMENTO: acconto (scalato dal totale: "Acconto versato" e "DA SALDARE"), casellina Pagato, metodi di pagamento
  (CONTANTI, CARTA DI CREDITO, BONIFICO, BONIFICO ANTICIPATO, ASSEGNO) complessivo, dell'acconto e del saldo
  (supabase/ordini-pagamento.sql). Pulsante "Segna come pagato" nel dettaglio.
- PDF: timbro PAGATO (immagine timbro-pagato.png, largo 150 px, inclinato, al centro della tabella articoli), logo grande
  il doppio (88 px ordini, 68 px report), data piu' grande, tolta la scritta "la fattura puo' essere richiesta solo all'ordine".
  Layout controllato: con sconto, acconto e pagato resta in una pagina A4.

4. AGGIORNAMENTO AUTOMATICO DELL'APP (v7.1.0, ogni 2 minuti dalla v7.1.2) - app.js in fondo + style.css (.agg-barra)
- Ogni 2 minuti e ogni volta che si torna sull'app legge il numero "vX.Y.Z" pubblicato in index.html e lo confronta con
  CURRENT_VERSION. App in secondo piano o appena riaperta, senza finestre aperte: si ricarica da sola (sezione e scheda
  ripristinate). Mentre si lavora: barra blu in alto "Aggiorna ora". Una sola ricarica automatica per versione (niente giri
  a vuoto se Vercel non ha ancora pubblicato). Funziona solo cambiando versione con ./update-version.sh. PROVATO 7/11: OK.

5. INTERVENTI ESTERNI (planning) - v7.1.0
- Esito NR (non risponde) resta IN ATTESA come "?": non parte con "Invia a Telegram" finche' l'esito non cambia
  (intInAttesa in interventi-functions.js, inAttesa in supabase/notifica-interventi.ts).
- Tecnici: toccando una riga si apre la finestra "Richiesta del cliente" (data della chiamata, cliente con link telefono/Maps,
  note della richiesta). Per tutti si apre anche dall'icona della catena sulle righe agganciate.
- Nuovo tipo TEL = telefonare al cliente. Il tecnico tocca la riga TEL: "Ha risposto (OK)" -> scrive "Cosa ci siamo detti io
  e il cliente" e parte DA SOLO il messaggio Telegram "Chiamata eseguita"; "Non risponde (NR)" -> si segnano data e ora del
  tentativo (elenco dei tentativi). Admin/operatori: pulsante "Registra la telefonata" nella finestra della riga.
  Salvataggio con la funzione SQL intervento_chiamata (anche per i tecnici, solo righe TEL; permesso puo_registrare_chiamata),
  colonne interventi.chiamata_note / chiamata_tentativi / chiamata_at / chiamata_da. L'esito passa alla richiesta agganciata
  (trigger gia' esistente). Telegram: notifica-interventi con { chiamata: id }. Le TEL non hanno promemoria WhatsApp ne' meteo;
  colonna TELEFONATA nell'Excel di fine anno.
- Messaggio delle 17 (organizzazione-interventi.ts): elenchi a parte "Non risponde (NR)" e "Telefonate (TEL)".

6. RICHIESTE INTERVENTI ROBOT - v7.1.0
- Intestazioni DAVVERO bloccate: la regola generale "table { overflow: hidden }" di style.css le bloccava; ora la tabella
  ha overflow visible e il riquadro arriva al fondo dello schermo (rrAdattaAltezza), scorre al suo interno.
- "Nascondi le OK": spunta sempre attiva quando si apre la sezione; le OK restano salvate, sotto la ricerca quante sono nascoste.
- Tipo TEL (Telefonata): basta il telefono (via e paese non obbligatori), dedotto dalle note che iniziano con TELEFON / RICHIAM
  / CHIAMAR; non va sulla mappa ma nel contenitore viola "Da telefonare" dell'Organizzazione. Nella finestra info della
  richiesta compaiono tentativi e note della telefonata.

==================================================================
SCRIPT E FUNZIONI SUPABASE DI QUESTO GIRO (controllare che siano stati eseguiti)
==================================================================
- SQL Editor: listino-stihl-setup.sql, ordini-elimina-admin.sql, ordini-pagamento.sql, macchine-correzioni.sql,
  telefonate-setup.sql (TEL: colonne, tipo TEL ammesso nelle richieste, intervento_chiamata, puo_registrare_chiamata).
- Edge Functions da ripubblicare (Verify JWT spento): notifica-interventi.ts e organizzazione-interventi.ts (v7.1.0).
- Pulizia prove: supabase/pulizia-prove-macchine.sql (quando le prove del carico a raffica sono finite).
- elimina-ordine-prova.sql e' superato dal pulsante Elimina ordine.

==================================================================
DA FARE PIU' AVANTI
==================================================================
- Richieste interventi (trattori, trattorini rasaerba...) e Richieste tagliandi: Donny spieghera' come lavorano.
- Listino Vendite / Listini Fornitori: eventuale import OPM e altri file STIHL quando arrivano le promo nuove (ricaricare poi gli EAN).
- Chiavi legacy Supabase: disattivarle dopo le verifiche indicate nel riepilogo v6.3.5.
- Pop-up novita': SHOW_WHATS_NEW_POPUP e' false; per comunicare le novita' agli utenti attivarlo e scrivere il testo.
