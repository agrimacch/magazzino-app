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
Se la chat e' collegata al mio Mac, Claude puo' scrivere i file direttamente in ~/Desktop/magazzino-app: dopo ogni scrittura
li deve RILEGGERE e confrontare (a volte la prima scrittura arriva con la versione vecchia: va ripetuta finche' il file e' giusto).
Prima di modificare un file va riletto dalla cartella (io cambio versione con update-version.sh e il testo del pop-up).


STRUTTURA APP (v6.0.0 - versione attuale)

Dashboard con 4 card dopo il login:
- Magazzino: Inventario Consumabili, Inventario Ricambi Stock, Scanner (solo mobile)
- Vendite (admin E operatori, con gli stessi permessi): Listino Vendite, Listini Fornitori (PDF su Google Drive)
- Tecnici (admin, operatori e tecnici; modificano admin e operatori): Interventi Esterni (NUOVO v6.0.0)
- Gestione Utenti (solo admin)

Ruoli: admin, operatore, tecnico (NUOVO v6.0.0).
- Il TECNICO vede SOLO Tecnici > Interventi Esterni, in sola lettura (tutte le settimane, tutti i tecnici).
  Entra direttamente nel planning. Niente pop-up novita', niente campanella, niente dati di magazzino.
  Bloccato anche nel database (regole "restrittive" blocco_tecnici sulle altre tabelle).
- Visibilita' sezione Tecnici: in app.js costante TECNICI_PER_OPERATORI (true dalla v6.0.0;
  false = solo admin e tecnici). Funzione sezioneConsentita() decide chi vede cosa.

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
- fornitori-functions.js + fornitori.css - Listini Fornitori (v4.10.0)
- interventi-functions.js + interventi.css - Tecnici > Interventi Esterni (v6.0.0)
- supabase/interventi-esterni-setup.sql, tecnici-ruolo-setup.sql, interventi-telegram-setup.sql,
  assenze-tecnici-setup.sql - script SQL della v6.0.0 (gia' eseguiti)
- supabase/notifica-interventi.ts - Edge Function "Invia a Telegram" del planning
- supabase/assenze-tecnici.ts - Edge Function assenze da Google Calendar + pulsanti Telegram
- google/assenze-calendario.gs - script Google delle assenze (account agrimacchricambi, attivatore ogni minuto, lavora ogni 2)
- GUIDA_ASSENZE_CALENDARIO.md - guida passo passo della configurazione assenze
- update-version.sh (deve essere eseguibile: se compare "permission denied" -> chmod +x update-version.sh) - aggiorna versione, cache di TUTTI i file .css/.js con "?v=" (regola unica, vale anche per file nuovi), pop-up novita'
- google/listini-drive.gs - script Google (account aziendale, script.google.com, pubblicato come App web "Esegui come: Me", accesso "Chiunque")
- supabase/listini-drive.ts - Edge Function "listini-drive" (Verify JWT spento; secrets DRIVE_SCRIPT_URL, DRIVE_SCRIPT_KEY)
- GUIDA_LISTINI_FORNITORI.md - guida passo passo di configurazione
- supabase/listino-notifiche-setup.sql - script tabella notifiche (eseguito su Supabase)
- supabase/notifica-telegram.ts - codice della Edge Function Telegram (incollato su Supabase, NON gira nell'app)

Librerie esterne: Supabase JS, SheetJS (lettura Excel), html5-qrcode 2.3.8, ExcelJS 4.4.0 (caricata solo quando si scarica il listino in Excel, da jsdelivr).


TABELLE SUPABASE
- articoli, movimenti (consumabili)
- ricambi_stock, movimenti_ricambi
- user_roles (email, role admin/operatore/tecnico, iniziali)
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
- TECNICI (v6.0.0):
  tecnici (nome unico, fisso = tutte le settimane, attivo, ordine, email, telegram_id)
  interventi_settimana_tecnici (settimana = lunedi', tecnico_id): tecnici aggiunti a UNA settimana
  interventi (tecnico_id, data, turno M/P, posizione 1-4, ora, tipo INT/SOP/MONT, esito ?/NR/OK/NO, cliente,
    colore ROSSO/GIALLO/VERDE/BLU, updated_by): una riga solo se la casella e' compilata o colorata;
    chiave unica tecnico_id+data+turno+posizione
  interventi_inviati: "fotografia" di cosa e' gia' stato mandato su Telegram (stesse chiavi)
  assenze_eventi: eventi di assenza letti dal calendario (stato PROPOSTA / COLORATO / RIFIUTATO /
    NON_RICONOSCIUTO / CANCELLATO); RLS senza regole = solo la funzione Supabase ci lavora
  Funzioni SQL: puo_modificare_interventi() (admin/operatore), is_tecnico()
  RLS: lettura per tutti i collegati, scrittura solo admin/operatori. Tempo reale su tecnici,
  interventi_settimana_tecnici, interventi, interventi_inviati.
- Regole RLS listino: accesso completo (lettura e scrittura) per tutti gli utenti collegati, admin e operatori. Nessun accesso senza login.
- Preferenze utente salvate su user_metadata: lastSeenVersion, listinoNettiVisibili, listinoStoriciVisibili, listinoNotificheLette
- Edge Function "notifica-telegram": Verify JWT SPENTO (il controllo lo fa la funzione rileggendo la notifica con il token dell'utente).
  Secrets: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID (id del gruppo, numero negativo)


TECNICI > INTERVENTI ESTERNI (v6.0.0) - COME FUNZIONA

Elenco settimane:
- Settimane lunedi'-sabato divise per mese, dal 2 novembre 2026 (INT_INIZIO in interventi-functions.js).
  Selettore anno. "QUESTA SETTIMANA" in evidenza, numero interventi, pallino rosso se ci sono righe rosse.
- Pulsanti: Invia a Telegram (admin/operatori), Archivia anno (solo admin).
- La settimana aperta e' ricordata nella sessione (sessionStorage "interventiSettimana").

Settimana:
- PC: una tabella per tecnico (GIORNO, ORA, TIPO, ESITO, CLIENTE), 4 righe mattina + 4 pomeriggio,
  linea tratteggiata tra mattina e pomeriggio. Prec. / Oggi / Succ. / Settimane.
- Telefono: un giorno alla volta (linguette LUN...SAB), parte dal giorno di oggi.
- Clic su una riga = finestra: Ora (testo libero), Tipo INT/SOP/MONT, Esito ?/NR/OK/NO, Cliente, Colore.
  Esito NO = annullato (riga barrata). "Svuota riga" cancella testo e colore.
- Colori: una riga (finestra), piu' righe (Pennello: scegli colore e tocchi le righe; X = gomma),
  mezza giornata / giornata (clic sulla casella del giorno, da telefono "Colora").
- Pulsante Tecnici: aggiungere (tutte le settimane o solo questa), rinominare, disattivare.
  Admin: "Prova Telegram". Eliminare un tecnico: solo da SQL (vedi MANUALE.md 8bis.6).
- Tecnici della settimana = fissi attivi + aggiunti alla settimana + chi ha gia' righe in quella settimana.
- Tempo reale: le modifiche dei colleghi compaiono da sole.

Telegram planning (gruppo "Interventi esterni", bot @interventiesterni_bot):
- NIENTE parte da solo. Pulsante "Invia a Telegram" (azzurro con numerino = modifiche da mandare).
  Anteprima + conferma, poi UN messaggio raggruppato per tecnico:
  "Interventi aggiunti per ...", "modificati" (ora/tipo/cliente con prima -> dopo),
  "riprogrammati" (tolto l'esito NO), "cancellati" (esito NO o riga svuotata).
- Solo da OGGI in avanti; arriva solo lo stato finale (confronto con la tabella interventi_inviati).
- Esito "?" = cliente non ancora chiamato: la riga resta in attesa, parte quando l'esito cambia;
  se svuotata con "?" non parte nulla (l'app la toglie anche da interventi_inviati).
- Non generano avvisi: colori, esiti NR/OK.
- La regola e' scritta in DUE posti (devono restare uguali): interventi-functions.js (intTipoEvento,
  per il numerino) e supabase/notifica-interventi.ts (tipoEvento, per l'invio vero).
- Edge Function notifica-interventi: Verify JWT SPENTO; controlla login + puo_modificare_interventi().
  Secrets: TELEGRAM_BOT_TOKEN_INTERVENTI, TELEGRAM_CHAT_ID_INTERVENTI.

Assenze da Google Calendar:
- Calendario condiviso delle assenze visto dall'account agrimacchricambi@gmail.com.
  Script google/assenze-calendario.gs: CALENDARIO_ID (solo l'ID, NON il codice <iframe>; per trovarlo
  eseguire "elencaCalendari"), CHIAVE = ASSENZE_SCRIPT_KEY. Attivatore ogni minuto, lavora nei minuti pari.
  Funzioni a mano: provaCollegamento, controllaAdesso (log con una riga per evento), installaAttivatore,
  rifaiResocontoOggi.
- Edge Function assenze-tecnici (Verify JWT SPENTO), chiamata dallo script (chiave) e da Telegram (webhook):
  * titoli: serve una parola di assenza (assente, assenti, assenza, ferie, malattia, malato, permesso,
    esce, esco, uscita); tecnico = nome e cognome in qualsiasi ordine, oppure solo nome/cognome se unico
    tra i tecnici dell'app (anche quelli aggiunti in futuro). "paolo rossi assente" (cognome diverso
    accanto al nome) = altra persona, ignorata. Non tecnici: ignorati senza messaggio.
    Nome di piu' tecnici: messaggio "DA CONTROLLARE".
  * giornata 8-19, mattina 8-13, pomeriggio 13-19; tutto il giorno = giornate intere (anche piu' giorni);
    "esce ore X" = mattina se X < 13, altrimenti pomeriggio; domenica mai.
  * messaggio a Donny (chat privata, ASSENZE_CHAT_ID) con la parte capita e i pulsanti
    Come proposto / Solo mattina / Solo pomeriggio / Giornata intera / No -> colora il planning
    (merge: il testo delle righe resta, cambia solo il colore; updated_by = CALENDARIO).
  * evento modificato = nuova proposta; evento tolto dal calendario = avviso + "Togli il rosso".
  * dopo le 7:00 resoconto "ASSENZE DI OGGI" (solo se ce ne sono, mai la domenica).
  * se l'invio Telegram fallisce l'evento viene riprovato al giro dopo.
  Secrets: TELEGRAM_BOT_TOKEN_INTERVENTI, ASSENZE_CHAT_ID, ASSENZE_SCRIPT_KEY, ASSENZE_WEBHOOK_SECRET,
  ASSENZE_SERVICE_KEY (chiave segreta sb_secret_..., cosi' funziona anche quando si disattivano le legacy).
- Il bot @interventiesterni_bot ha il webhook su assenze-tecnici: getUpdates non funziona piu';
  per il chat id di una chat scrivere /id al bot.
- Per far riproporre tutti gli eventi: SQL "delete from public.assenze_eventi;"

Archivio di fine anno (solo admin):
- "Archivia anno" nell'elenco settimane: scarica INTERVENTI_ESTERNI_anno.xlsx (colori, filtri, riga bloccata),
  chiede di controllarlo, poi svuota il server SOLO dopo aver scritto l'anno (interventi, tecnici della
  settimana, interventi_inviati di quell'anno). L'anno = settimane il cui lunedi' cade nell'anno.


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
  Titolo e pulsanti (Prova Telegram / Chiudi) fermi, scorre solo l'elenco (#notifiche-lista, overflow in listino.css).
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
  listino-notifiche-setup.sql (v4.9.0), interventi-esterni-setup.sql, tecnici-ruolo-setup.sql,
  interventi-telegram-setup.sql, assenze-tecnici-setup.sql (v6.0.0)
- Gestione Utenti > Elimina cancella solo il ruolo (user_roles): l'account resta in Authentication > Users.
  Per riusare la stessa email: eliminarlo anche da li' (o SQL: delete from auth.users where lower(email) = lower('...');)
- Nota: lo sfocamento dei netti e' solo visivo (serve se qualcuno guarda lo schermo).


LISTINI FORNITORI (v4.10.0)
- PDF su Google Drive dell'account AZIENDALE, cartella principale condivisa con i colleghi (Editor: anche gli operatori caricano).
  Struttura: CARTELLA / FORNITORE / file (fornitore diretto) oppure CARTELLA / IMPORTATORE / MARCHIO / file.
  Nomi file: "LISTINO 2026", "CATALOGO 2026" (+ nota dopo l'anno). Sottocartella ARCHIVIO dentro un marchio = archiviati.
- Flusso: app -> Edge Function listini-drive (controlla login, aggiunge la chiave segreta) -> script Google doGet(key) -> JSON
  {ok, aggiornato, cartella{nome,url}, fornitori[{nome,url,marchi[{nome,url,diretto,file[{id,nome,url,tipo,dimensione,modificato,creato,cartella}]}]}], fuoriPosto[]}
  Lo script tiene l'elenco in cache 10 minuti; "Aggiorna elenco" nell'app forza la rilettura (aggiorna=1).
- App: guida "Come caricare e aggiornare i listini" in cima, ricerca (fornitore/marchio/nome file), pulsanti
  "Apri cartella su Drive", "Apri tutti / Chiudi tutti", "Aggiorna elenco".
- Elenco a FISARMONICA (<details>): ogni fornitore e' una riga chiusa con nome, "Fornitore diretto" o "Importatore - N marchi"
  (+ elenco marchi), etichetta "N file" e "NUOVO" se un file e' stato caricato/aggiornato negli ultimi 7 giorni.
  Clic = si apre: marchi affiancati (PC) con listino e catalogo dell'anno piu' recente in evidenza, altri anni in "Archivio",
  avviso per nomi fuori regola. I fornitori aperti sono ricordati nella sessione (sessionStorage "fornitoriAperti").
  Con una ricerca attiva i risultati si aprono da soli.
- CARTELLE VUOTE NASCOSTE: marchi senza file e fornitori senza file non compaiono; la riga "Elenco letto da Drive alle..."
  dice quanti ne sono stati nascosti. Avviso giallo se ci sono file nella cartella principale fuori da un fornitore.
- I file si aprono su Google Drive (nuova scheda / app Drive).
- Telegram: lo script ha un attivatore ogni 15 minuti (controllaNuoviFile) che manda "Nuovo"/"Aggiornato" con link.
  Token e chat id sono scritti nelle prime righe dello script (oltre che nei secrets Supabase).
- Se si modifica lo script (anche solo le 4 righe in alto): Esegui il deployment > Gestisci deployment > matita >
  Nuova versione > Esegui il deployment (l'URL resta uguale). L'app usa SEMPRE la versione pubblicata, non quella salvata.
- CARTELLA_ID = parte dell'indirizzo della cartella dopo "folders/" (di solito 33 caratteri, inizia con 1).
  Errore "Ungultige Datei- oder Ordner-ID" (tedesco, viene da Google) = ID sbagliato o incompleto.
- Errore Telegram "chat not found" = token o chat id sbagliati nelle prime righe dello script (bot giusto: @listinomacchine_bot,
  token che inizia con 9209718053:, gruppo -5318188950).
- CONFIGURAZIONE COMPLETATA e funzionante (ott 2026). Guida: GUIDA_LISTINI_FORNITORI.md

POP-UP "NOVITA'"
- Non ricompare a ogni login su mobile (vista salvata in localStorage, user_metadata.lastSeenVersion e flag di sessione)
- Per mostrarne uno nuovo: ./update-version.sh, rispondere "s" al pop-up e scrivere le novita'


DA FARE PIU' AVANTI
- Eventuale pulsante "Elimina tecnico" nell'app (oggi solo via SQL)
- Eventuale pulsante "Elimina" in Gestione Utenti che cancelli anche l'account Authentication (serve una Edge Function)
- A fine 2026: "Archivia anno" per il 2026
- Disattivare le chiavi legacy di Supabase
- Ricambi stock: la soglia e' fissa a 1 (non gestita); se servisse, aggiungere una soglia vera per avere anche l'avviso "sotto soglia"
- Notifiche push con numerino sull'icona dell'app (PWA): valutate, rimandate (complesse su iPhone); per ora bastano Telegram + avvisi in app
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