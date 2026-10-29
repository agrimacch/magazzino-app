ISTRUZIONI PROGETTO AGRIMAG
NON usare MAI emoji diretti
USA SEMPRE codici HTML entities (es. &#128230; &#10133;)
USA SEMPRE HTML entities ANCHE per accenti italiani (&agrave; &egrave; &ograve; &ugrave;) per evitare corruzione UTF-8
Quando modifichi HTML/JS controlla sempre z-index per sovrapposizioni
Fornisci sempre FILE COMPLETI, mai snippet
Il deploy e' su VERCEL (non Netlify)
Database: Supabase

Non servono guide se devo solo sostituire i codici completi. FORNISCIMI FILE COMPLETI DA SCARICARE E SOSTITUIRE (li metti a fondo chat, io clicco sopra, si apre il file in un'altra finestra, copio il codice; cosi' le chat non diventano lunghissime).
Ho ancora delle migliorie da apportare che apporteremo un po' alla volta assieme senza rompere codici :)


STRUTTURA APP (v4.9.5)

Dashboard con 3 card dopo il login:
- Magazzino: Inventario Consumabili, Inventario Ricambi Stock, Scanner (solo mobile)
- Vendite (admin E operatori, con gli stessi permessi): Listino Vendite, Listini Fornitori (ancora "in costruzione")
- Gestione Utenti (solo admin)

Sezione Ricambi Stock completa con import Excel (max 100 righe), movimenti dedicati e report.
Scanner unificato: cerca sia in Articoli che in Ricambi.
Persistenza sessione: quando cambi finestra browser l'app ricorda sezione/tab (fino a refresh manuale o logout).
Maiuscolo automatico: tutti i campi testo convertiti in MAIUSCOLO al salvataggio (esclusi email/password/date).
Consumabili e Ricambi: dentro ogni fornitore gli articoli sono in ordine di CODICE ARTICOLO (ordine naturale: X30 prima di X100).
  Anche i Consumabili hanno la voce "Codice (A-Z)" nel menu ordinamento.
  Dopo carico/scarico/modifica i filtri e la ricerca RESTANO (si azzerano solo entrando nella sezione). Vale anche per i movimenti.
Sezioni Consumabili, Ricambi, Scanner, Listino Vendite, Listini Fornitori: oltre a "Torna a Magazzino/Vendite" c'e' il pulsante
  "Dashboard" (classe .back-buttons in style.css).
Finestre (pop-up) con campi: pulsanti Salva/Conferma/Annulla sempre visibili in fondo mentre si scorre (sticky);
  da telefono partono dall'alto e usano il 92% dello schermo (dvh, per le barre di Safari). Regole in style.css, sezione "FINESTRE".


FILE PRINCIPALI
- index.html - struttura pagina (contiene anche la sezione Listino Vendite e i suoi pop-up)
- style.css - stili generali e responsive
- listino.css - stili del Listino Vendite (NUOVO)
- app.js - logica consumabili, navigazione, ruoli, login
- ricambi-functions.js - logica ricambi stock (contiene anche showCustomAlert)
- listino-functions.js - logica Listino Vendite (NUOVO)
- update-version.sh - aggiorna versione, cache di tutti i file css/js (anche listino), pop-up novita'
- supabase/listino-notifiche-setup.sql - script tabella notifiche (eseguito su Supabase)
- supabase/notifica-telegram.ts - codice della Edge Function Telegram (incollato su Supabase, NON gira nell'app)

Librerie esterne: Supabase JS, SheetJS (lettura Excel), html5-qrcode 2.3.8, ExcelJS 4.4.0 (caricata solo quando si scarica il listino in Excel, da jsdelivr).


TABELLE SUPABASE
- articoli, movimenti (consumabili)
- ricambi_stock, movimenti_ricambi
- user_roles (email, role admin/operatore, iniziali)
- listino_articoli (NUOVA): una riga per macchina
  colonne: attrezzo, marchio, alimentazione, tipologia_alimentazione, modello, note,
  netto_1, note_1, netto_2, note_2, netto_3, note_3 (netti numerici),
  vendita_promo, scadenza_promo, vendita_scatola, vendita_no_promo (testo: se c'e' un numero l'app lo mostra come prezzo),
  listino (numero), chiave (MARCHIO|MODELLO|NOTE, univoca), attivo (false = articolo cancellato), data_cancellazione
- listino_storico_netti (NUOVA): ogni netto registrato con articolo_id, modello, netto, note, origine
  (IMPORT INIZIALE / AGGIORNAMENTO / NUOVO ARTICOLO / MODIFICA APP), utente, data_registrazione
- listino_notifiche (NUOVA v4.9.0): una riga per ogni modifica al listino
  e (dalla v4.9.5) anche gli avvisi di magazzino: il nome e' rimasto "listino_notifiche" ma la tabella e' per tutte le notifiche
  colonne: created_at, utente (email), utente_nome (iniziali), tipo (MODIFICA / NUOVO / CANCELLATO / RIPRISTINATO / IMPORT /
  SOTTOSOGLIA_CONSUMABILI / ESAURITO_CONSUMABILI / ESAURITO_RICAMBI),
  titolo, righe (jsonb: [{e: etichetta, v: valore, n: true se e' un netto}]), articolo_id, cerca (testo per "Vai all'articolo")
  RLS: lettura per tutti i collegati, inserimento solo a proprio nome, niente modifica/cancellazione. Tabella nel tempo reale (supabase_realtime).
- Funzione SQL public.is_admin() (controlla user_roles)
- Regole RLS listino: accesso completo (lettura e scrittura) per tutti gli utenti collegati, admin e operatori. Nessun accesso senza login.
- Preferenze utente salvate su user_metadata: lastSeenVersion, listinoNettiVisibili, listinoStoriciVisibili, listinoNotificheLette
- Edge Function "notifica-telegram": Verify JWT SPENTO (il controllo lo fa la funzione rileggendo la notifica con il token dell'utente).
  Secrets: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID (id del gruppo, numero negativo)


LISTINO VENDITE - COME FUNZIONA

Schede: Listino | Import Excel | Storico netti | Articoli cancellati
Admin e operatori possono fare tutto (vedere, importare, modificare, cancellare, ripristinare).

Listino:
- Articoli raggruppati per ATTREZZO in ordine alfabetico
- Ricerca libera + filtri a cascata: attrezzo, marchio, alimentazione, tipologia alimentazione
- PC: tutte le colonne. In alto due caselline (scelta ricordata per ogni utente, anche su altri dispositivi):
  "Mostra netti e note" (di default netti e note sfocati) e "Mostra netto 2 e netto 3" (di default colonne nascoste)
- Mobile: schede compatte (marchio, modello, alimentazione, tipologia, note; prezzi su 2 righe: promo, no promo, in scatola, listino).
  Se SCADENZA PROMO e' compilata compare sotto con la sveglia. Pulsante "i" = pop-up con netto 1 e note 1.
- PROMO SCADUTE IN ROSSO: l'app cerca una data nel testo di SCADENZA PROMO (es. "VOLANTINO FINO 30/11/26",
  anche con punti o anno a 4 cifre; se ci sono piu' date vale l'ultima). Se la data e' passata: da PC cella rossa
  con etichetta SCADUTA, da mobile riquadro rosso "PROMO SCADUTA". Testo senza data = mai scaduta.
  Da mobile le caselline non ci sono e i netti non sono sfocati (si vedono solo nel pop-up "i" e nello storico).
- Matita su ogni articolo (modifica), pulsante "Nuovo articolo", "Sposta in articoli cancellati", "Ripristina"

Import Excel:
- File .xls/.xlsx, foglio "Elenco_attrezzi" (o il primo foglio), nessun limite di righe
- Colonne: ATTREZZO, MARCHIO, ALIMENTAZIONE, TIPOLOGIA ALIM., MODELLO, NOTE, NETTO 1, NOTE 1, NETTO 2, NOTE 2,
  NETTO 3, NOTE 3, VENDITA PROMO, SCADENZA PROMO, VENDITA IN SCATOLA, VENDITA NO PROMO, LISTINO
- Chiave per riconoscere l'articolo: MARCHIO + MODELLO + NOTE (se cambio la NOTE l'app lo vede come cancellato + nuovo)
- Anteprima prima di salvare: nuovi, netti cambiati, altre modifiche, ripristinati, cancellati, invariati, avvisi.
  Avviso rosso se il file cancellerebbe molti articoli insieme. Doppioni nel file segnalati e saltati.
- Primo caricamento: importa netto 1/2/3 cosi' come sono nel file
- Caricamenti successivi: conta solo NETTO 1 e NOTE 1. Se il netto 1 cambia l'app scala: netto 1 -> netto 2 -> netto 3
  (netto 2 e 3 del file vengono ignorati). Se NETTO 1 e' vuoto si tiene quello attuale.
- Articoli non piu' presenti nel file -> "Articoli cancellati" (tornano attivi se rimessi nel file)
- Pulsante "Scarica listino Excel aggiornato": file con prima riga bloccata, filtri su tutte le colonne, prezzi in euro

Modifica dall'app:
- Stessa logica dell'import: se cambio il netto 1 scala netto 1 -> 2 -> 3 e scrive nello storico ("Modifica da app")
- Netto 2 e 3 visibili ma non modificabili (li gestisce l'app)
- Controllo doppioni (stesso marchio + modello + note)
- REGOLA DI LAVORO SCELTA: prima di lavorare sul mio Excel scarico SEMPRE il listino aggiornato dall'app e lavoro su quello

NOTIFICHE (v4.9.0, magazzino dalla v4.9.5):
- Ogni modifica al listino di qualsiasi utente (modifica articolo, nuovo, sposta in cancellati, ripristina, import Excel)
  salva una riga in listino_notifiche e chiama la Edge Function notifica-telegram (messaggio nel gruppo Telegram).
- Salvataggio senza cambiamenti = nessuna notifica. Import = un solo messaggio di riepilogo (max 25 righe su Telegram, max 300 salvate).
- Campanella nell'header, SOLO DA PC (da mobile e' nascosta: bastano avviso a comparsa e Telegram): numerino rosso = notifiche
  di ALTRI non ancora viste. Tempo reale Supabase + ricontrollo quando si torna sull'app. Avviso a comparsa in alto (anche su mobile).
- Pannello "Notifiche": mostra SOLO le novita' non ancora viste; chiudendolo spariscono (non c'e' storico da consultare).
  "Vai all'articolo" apre il listino (o Consumabili/Ricambi) gia' filtrato. Netti sfocati da PC se "Mostra netti e note" e' spenta.
  Admin: pulsante "Prova Telegram".
- MAGAZZINO (promemoria ordini, v4.9.5): funzione magazzinoNotificaScorta(sezione, prima, dopo) in listino-functions.js,
  chiamata dopo carico/scarico (anche da Scanner) e dopo la modifica articolo/ricambio. Scatta SOLO nel momento in cui si passa il limite:
  * Consumabili: SOTTO SOGLIA quando la quantita' passa da sopra a <= soglia_minima (e resta > 0); ESAURITO quando arriva a 0
  * Ricambi stock: solo ESAURITO (la soglia dei ricambi e' fissa a 1 e non si gestisce)
  Telegram: intestazione "AGRIMAG - Magazzino" + "SOTTO SOGLIA / ESAURITO - da ordinare", codice, quantita' rimasta, fornitore.
  Le notifiche di magazzino aggiornano da sole la tabella Consumabili/Ricambi degli altri utenti collegati.
  L'import Excel dei ricambi aggiunge solo quantita': non genera avvisi.
- Se arriva una modifica mentre si guarda il listino, il listino si ricarica da solo (dopo, se la finestra di modifica o un import sono aperti).
- Se la tabella o Telegram non funzionano il listino continua a funzionare: errori solo in console (F12).
- Logica in listino-functions.js (sezione "NOTIFICHE LISTINO"), stili in listino.css, avvio in app.js (fine di showMainScreen).
- Telegram: bot @listinomacchine_bot, gruppo "AGRIMACCH VENDITE" (chat id nel secret TELEGRAM_CHAT_ID).
  Se Telegram trasforma il gruppo in supergruppo l'id cambia (inizia con -100): rifare getUpdates e aggiornare il secret.
  Ogni volta che cambia supabase/notifica-telegram.ts va reincollato in Supabase > Edge Functions > notifica-telegram > Code (index.ts) > Deploy.

Storico netti:
- Per ogni macchina tutti i netti con data, nota e origine, dal piu' recente (anche quelli usciti da netto 3)
- Ricerca macchina, "Scarica TXT", "Stampa / PDF" (dalla stampa si sceglie Salva come PDF)
- I netti di partenza hanno la data del primo caricamento (le date vere partono dagli aggiornamenti successivi)


SICUREZZA E SUPABASE
- L'app usa la chiave publishable (sb_publishable_...) al posto della anon legacy: testata e funzionante
- Le chiavi legacy NON sono ancora disattivate (Supabase > Project Settings > API Keys > Legacy API Keys)
- La password non viene salvata nel browser, solo l'email
- .gitignore con *.pem, *.key, .DS_Store
- Script SQL gia' eseguiti: listino-vendite-setup.sql, listino-vendite-modifica-colonne.sql, listino-vendite-operatori.sql,
  listino-notifiche-setup.sql (v4.9.0)
- Nota: lo sfocamento dei netti e' solo visivo (serve se qualcuno guarda lo schermo).


POP-UP "NOVITA'"
- Non ricompare a ogni login su mobile (vista salvata in localStorage, user_metadata.lastSeenVersion e flag di sessione)
- Per mostrarne uno nuovo: ./update-version.sh, rispondere "s" al pop-up e scrivere le novita'


DA FARE PIU' AVANTI
- Listini Fornitori (ancora pagina "in costruzione")
- Disattivare le chiavi legacy di Supabase
- Bug Safari/WebKit (contenuto che sparisce ridimensionando la finestra) non del tutto risolto, Firefox ok


COMANDI DA TERMINALE (lavoro da li)

CARICARE FILE AGGIORNATI SU GITHUB
cd ~/Desktop/magazzino-app
./push-all.sh

VARIARE VERSIONE (aggiorna anche la cache di tutti i file css/js)
cd ~/Desktop/magazzino-app
./update-version.sh

AVVIARE SERVER HTTPS
cd ~/Desktop/magazzino-app/ bash start-https-server.sh
PER FERMARE IL SERVER
Ctrl + C