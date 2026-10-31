ISTRUZIONI PROGETTO AGRIDESK (ex AGRIMAG) - RIEPILOGO v6.2.0 (31 ottobre 2026)
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
li deve RILEGGERE e confrontare (a volte la prima scrittura arriva con la versione vecchia: va ripetuta finche' il file e' giusto;
conviene usare ogni volta un nome di appoggio nuovo per il file da scrivere).
Il terminale sul Mac (device_bash) non parte se sul disco c'e' poco spazio libero (servono ~17 GB): i file si leggono/scrivono lo stesso.
Prima di modificare un file va riletto dalla cartella (io cambio versione con update-version.sh e il testo del pop-up).
NON modificare funzioni Supabase che gia' funzionano per aggiungere cose nuove: le funzioni nuove vanno in una
Edge Function separata (con bot/gruppo/secrets propri), cosi' se si rompe qualcosa il resto continua a funzionare.
Testo per i messaggi: niente emoji dirette nei file; nei .ts e .gs le emoji si scrivono come \uXXXX.
STILE DOCUMENTI: da ora in poi TUTTI i documenti generati dalla web app (PDF, stampe, report) devono avere lo stesso stile dei report
(classi rpt-* in macchine.css, rptHtml/rptCreaPdfBlob in macchine-report.js, motore pdfCreaDaHtml). Ordine cliente gia' convertito;
ancora nel vecchio stile (window.print): stampa storico netti del listino, report consumabili e ricambi.


NOME E INDIRIZZO
- Nome dell'app: AGRIDESK (fino alla v6.1.0 si chiamava AGRIMAG). Cambiato solo cio' che si vede: titolo scheda,
  login, nome sotto l'icona (manifest.json: "AGRIDESK - Agrimacch" / short_name "AGRIDESK"), titolo pop-up novita'
  (update-version.sh accetta sia AGRIMAG sia AGRIDESK e scrive AGRIDESK), stampa storico netti, autore Excel archivio.
  Nomi file, database, messaggi Telegram ("AGRIMAG - ...") NON cambiati (eventualmente un po' alla volta).
- Indirizzo ufficiale: https://magazzino.agrimacch.it  (VERCEL, progetto "magazzino-app", account Donato Pastrello Hobby)
- NETLIFY: esiste un doppione vecchio "unrivaled-torrone-b6c6e2.netlify.app" (team agrimacch) ancora collegato a GitHub
  che consumava crediti (mail "credits - upgrade to restore full service"). Da fare: Stop builds / Unlink repository,
  dopo 2-3 settimane cancellarlo. NON fare upgrade.
- Versione online: 6.1.1. Prossima da pubblicare: 6.2.0 (Inventario Macchine + Ordini Clienti) con ./update-version.sh
  (CURRENT_VERSION in app.js). Se update-version.sh da' "permission denied":
  chmod +x update-version.sh  (oppure: bash update-version.sh)


STRUTTURA APP (v6.2.0)

Dashboard con 4 card dopo il login:
- Magazzino: Inventario Consumabili, Inventario Ricambi Stock, Inventario Macchine (NUOVO v6.2.0, admin e operatori), Scanner (solo mobile)
- Vendite (admin E operatori, con gli stessi permessi): Listino Vendite, Listini Fornitori (PDF su Google Drive),
  Ordini Clienti (NUOVO v6.2.0, admin e operatori)
- Tecnici (admin, operatori e tecnici; modificano admin e operatori): Interventi Esterni (NUOVO v6.0.0)
- Gestione Utenti (solo admin)

Ruoli: admin, operatore, tecnico (NUOVO v6.0.0).
- Il TECNICO vede SOLO Tecnici > Interventi Esterni, in sola lettura (tutte le settimane, tutti i tecnici).
  Entra direttamente nel planning. Niente pop-up novita', niente campanella, niente dati di magazzino.
  Bloccato anche nel database (regole "restrittive" blocco_tecnici sulle altre tabelle).
- Visibilita' sezione Tecnici: in app.js costante TECNICI_PER_OPERATORI (true dalla v6.0.0;
  false = solo admin e tecnici). Funzione sezioneConsentita() decide chi vede cosa.
- Il tecnico NON vede il pop-up novita' (checkAndShowWhatsNew solo se !isTecnico).

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
- supabase/organizzazione-setup.sql - colonne promemoria + tabelle meteo (v6.1.0, eseguito)
  (supabase/promemoria-setup.sql e' un file vecchio non piu' usato: si puo' cancellare)
- supabase/organizzazione-interventi.ts - Edge Function SEPARATA: promemoria WhatsApp + meteo (v6.1.0)
- google/organizzazione-interventi.gs - script Google SEPARATO "AGRIMAG organizzazione" (account agrimacchricambi)
- GUIDA_ORGANIZZAZIONE_INTERVENTI.md - guida promemoria WhatsApp + meteo
- macchine-functions.js + macchine.css - Magazzino > Inventario Macchine: inventario, quaderno, carico, carico Excel, set, movimenti (v6.2.0)
- macchine-report.js - Inventario Macchine > Report vendite e Valore magazzino, Excel e PDF (v6.2.0)
- ordini-functions.js + ordini.css - Vendite > Ordini Clienti: modulo, firma, stati, PDF, Drive; contiene anche la creazione PDF comune (v6.2.0)
- supabase/inventario-macchine-setup.sql - tabelle macchine (eseguito)
- supabase/ordini-clienti-setup.sql - tabelle ordini + colonne operatore/Drive/senza installazione (rieseguibile)
- supabase/ordini-senza-installazione.sql - colonne senza_installazione + firma_installazione (DA ESEGUIRE, 31/10)
- supabase/macchine-operatori.sql - apre macchine e ordini agli operatori (DA ESEGUIRE prima di mettere online)
- supabase/pulizia-prove-macchine.sql - svuota quaderno, movimenti e ordini dopo le prove (DA ESEGUIRE una volta, a prove finite)
- supabase/ordini-drive.ts + google/ordini-drive.gs - PDF ordini su Google Drive. Guida: GUIDA_ORDINI_DRIVE.md
- update-version.sh (deve essere eseguibile: se compare "permission denied" -> chmod +x update-version.sh) - aggiorna versione, cache di TUTTI i file .css/.js con "?v=" (regola unica, vale anche per file nuovi), pop-up novita'
- google/listini-drive.gs - script Google (account aziendale, script.google.com, pubblicato come App web "Esegui come: Me", accesso "Chiunque")
- supabase/listini-drive.ts - Edge Function "listini-drive" (Verify JWT spento; secrets DRIVE_SCRIPT_URL, DRIVE_SCRIPT_KEY)
- GUIDA_LISTINI_FORNITORI.md - guida passo passo di configurazione
- supabase/listino-notifiche-setup.sql - script tabella notifiche (eseguito su Supabase)
- supabase/notifica-telegram.ts - codice della Edge Function Telegram (incollato su Supabase, NON gira nell'app)

Librerie esterne: Supabase JS, SheetJS (lettura/scrittura Excel), html5-qrcode 2.3.8, ExcelJS 4.4.0 (caricata solo quando si scarica il listino in Excel, da jsdelivr),
html2canvas 1.4.1 + jsPDF 2.5.1 (caricate solo quando si crea un PDF, da jsdelivr), font Kalam (Google Fonts, nomi nel quaderno).


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
  interventi ha anche (v6.1.0) promemoria_at, promemoria_da (email o TELEGRAM): promemoria WhatsApp inviato
  org_localita (nome paese, lat, lon, trovata, descrizione) e org_meteo_cache (chiave lat,lon, dati, scade_at):
    RLS senza regole = solo la funzione organizzazione-interventi ci lavora
  assenze_eventi: eventi di assenza letti dal calendario (stato PROPOSTA / COLORATO / RIFIUTATO /
    NON_RICONOSCIUTO / CANCELLATO); RLS senza regole = solo la funzione Supabase ci lavora
  Funzioni SQL: puo_modificare_interventi() (admin/operatore), is_tecnico()
  RLS: lettura per tutti i collegati, scrittura solo admin/operatori. Tempo reale su tecnici,
  interventi_settimana_tecnici, interventi, interventi_inviati.
- INVENTARIO MACCHINE (v6.2.0):
  macchine_pezzi (una riga per macchina fisica): articolo_id, stato DA_ORDINARE/ORDINATA/IN_CASA/CONSEGNATA, cliente (vuoto + IN_CASA =
    disponibile), matricola, netto_carico, set_id (venduta dentro un set), ordine_id, ordine_riga_id, note, data_carico, data_consegna
  macchine_composizione (set_id, componente_id, quantita)
  macchine_movimenti (registro: tipo, stato_prima/dopo, cliente, matricola, netto, dettaglio, utente) - solo lettura e inserimento
  macchine_ordini: anno+numero (unique), data, operatore, cliente, indirizzo, telefono, email, codice_fiscale, partita_iva, note,
    pagamento, totale, firma (PNG base64), consegnato_at, annullato_at, drive_url, drive_file_id, drive_salvato_at
  macchine_ordini_righe: ordine_id (cascade), posizione, articolo_id (vuoto = riga libera), descrizione, codice, quantita,
    prezzo_totale, disponibilita DISPONIBILE/DA_ORDINARE/LIBERA
  Funzione SQL puo_gestire_macchine(): admin e operatori. RLS di tutte le tabelle macchine/ordini basata su questa.
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

Settimana (aggiornamenti v6.0.1):
- Da telefono il GIORNO scelto resta (sessionStorage "interventiGiorno" = settimana+giorno): dopo il salvataggio,
  tornando da WhatsApp o dopo un refresh non torna piu' al lunedi'. Se la settimana e' gia' aperta,
  openInterventiEsterni ricarica solo i dati (niente scroll in cima).
- "I MIEI INTERVENTI": nella finestra Tecnici ogni tecnico ha "Utente dell'app" (colonna tecnici.email).
  L'utente collegato vede: etichetta "N TUOI" sulle settimane, pallino arancione col numero sui giorni,
  riquadro "Questa settimana hai N interventi", la sua scheda per prima con stella e bordo arancione,
  barra arancione sulle sue righe. Interventi con esito NO o svuotati non contano.
- Campo Cliente: segnaposto "Nome Cognome - Paese - Telefono (es. MARIO ROSSI - MIRA - 3471234567)"
  + nota "il paese serve per il meteo, il cellulare per il promemoria WhatsApp".

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

ORGANIZZAZIONE INTERVENTI (v6.1.0) - SISTEMA SEPARATO: promemoria WhatsApp + meteo
- Bot @organizzazioneinterventi_bot, gruppo Telegram "Organizzazione interventi" (bot SENZA webhook: getUpdates funziona).
- Edge Function organizzazione-interventi (Verify JWT SPENTO). Secrets: ORG_BOT_TOKEN, ORG_CHAT_ID, ORG_SCRIPT_KEY,
  ORG_SERVICE_KEY (sb_secret_...). Script Google "AGRIMAG organizzazione" (attivatore ogni 5 minuti, invia una volta
  al giorno dopo le 17, lun-sab). Funzioni a mano: diagnosi, provaPromemoria, installaAttivatore, rifaiOggi.
- PROMEMORIA WHATSAPP (app, admin/operatori): riquadro "Promemoria clienti" in cima agli Interventi Esterni con gli
  appuntamenti del giorno lavorativo dopo (sabato -> lunedi'): Invia promemoria / inviato il... (Di nuovo) /
  manca cellulare / da confermare (esito ?). Pulsante anche nella finestra dell'intervento.
  Il pulsante apre wa.me con il testo (window.open subito, poi segna promemoria_at). Cambiando l'ORA il segno si toglie.
  Cellulare preso dal campo Cliente (3xx..., anche con spazi/punti/+39; i fissi no).
  Messaggio: "Buongiorno, le ricordiamo l'appuntamento di domani, *martedi' 10 novembre alle ore 8.30*, con un nostro
  tecnico per l'intervento di assistenza. Se ha bisogno di spostarlo o annullarlo, la preghiamo di contattarci
  telefonicamente al numero +39 041 5401030. La ringraziamo e le porgiamo cordiali saluti. *Agrimacch srl*"
  (INT/SOP/MONT = intervento di assistenza / sopralluogo / montaggio; oggi/domani/data; "14.45/15" = tra le ore...).
  IL TESTO E' IN DUE FILE: interventi-functions.js e supabase/organizzazione-interventi.ts.
- TELEGRAM ALLE 17: "ORGANIZZAZIONE INTERVENTI" del giorno lavorativo dopo: avviso PIOGGIA PREVISTA su N interventi,
  per ogni intervento meteo + link "Invia promemoria WhatsApp" (link firmato ?wa=id.firma alla funzione: segna
  inviato da TELEGRAM e fa redirect a wa.me), gia' inviati, senza cellulare, da confermare.
- Il messaggio parte dal WhatsApp del dispositivo: numero aziendale = WhatsApp Business (su PC WhatsApp Web/Desktop
  collegato, oppure WhatsApp Business sul proprio telefono come dispositivo collegato).
- METEO (tutti gli utenti): paese dal campo Cliente (dopo il trattino; senza trattino l'ultima parola prima del
  telefono). Coordinate: Nominatim (OpenStreetMap) - dai server Supabase spesso HTTP 403 - poi Photon (komoot, stessi
  dati OSM); cache in org_localita; "non trovato" salvato solo se Photon risponde vuoto, ricontrollato dopo 7 giorni.
  Previsioni MET Norway (api.met.no, gratis anche uso aziendale, CC BY 4.0; Open-Meteo NO: gratis solo non commerciale),
  cache 1 ora, ~9 giorni. Mattina 8-13, pomeriggio 13-19. PIOGGIA >= 1 mm nella mezza giornata (badge blu),
  DEBOLE 0,2-1 mm (azzurro chiaro), altrimenti icona. Pioggia segnata sulle linguette/caselle dei giorni.
  Icone ingrandite (14px PC, 16px telefono). L'app chiama la funzione (azione meteo) e ricorda 30 minuti.
- Per far riprovare paesi non trovati: SQL "delete from public.org_localita where trovata = false;"

LEZIONI TELEGRAM (importante)
- Se un gruppo diventa SUPERGRUPPO cambia chat id (inizia con -100): errore "group chat was upgraded to a supergroup".
  Le funzioni ora scrivono nell'errore il NUOVO chat id. @interventiesterni_bot ha il webhook (assenze): per il chat
  id scrivere /id@interventiesterni_bot nel gruppo.
- Attenzione a non incollare il chat id nel secret del TOKEN (successo il 30/10: si erano fermati interventi e assenze).
- Diagnosi: script assenze -> funzione "diagnosi" (controlla secrets, bot, webhook, chat, db); script organizzazione
  -> "diagnosi" (secrets, bot, gruppo, db, luoghi, meteo).

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


INVENTARIO MACCHINE (Magazzino) - COME FUNZIONA (v6.2.0)

Collegato al Listino Vendite: ogni macchina fisica e' una riga di macchine_pezzi legata a un articolo di listino_articoli.
PER ORA SOLO ADMIN (31/10, sezioni in prova): MACCHINE_PER_OPERATORI = false in macchine-functions.js. Con true: admin e operatori
(stessi permessi), mai i tecnici. Costante MACCHINE_PER_OPERATORI in macchine-functions.js +
funzione SQL puo_gestire_macchine() con role in ('admin','operatore') (supabase/macchine-operatori.sql).
Stati (i colori del quadernone cartaceo):
- DA_ORDINARE = quadrato bianco + nome cliente | ORDINATA = blu + nome | IN_CASA = verde (con nome assegnata, senza nome disponibile)
- CONSEGNATA = verde con la croce
Pulsanti in alto: "Carico macchine" e "Nuova voce". Schede: Inventario | Quaderno | Carico Excel | Set | Movimenti | Report | Valore
(scheda ricordata in sessionStorage "macchineTab", marchio del quaderno in "macchineMarchio"; si azzerano entrando da Magazzino e al logout).
- Inventario: stesse colonne/suddivisione del listino senza prezzi; disponibili/assegnate/ordinate/da ordinare; riepilogo con valore in casa;
  casellina "Solo articoli con pezzi"; pulsanti + (carica) e quaderno su ogni riga.
- Quaderno: riproduce il raccoglitore (divisori per marchio a destra da PC / in alto da telefono, evidenziatore giallo attrezzo+marchio,
  tabella a quadratini con nome scritto "a penna" font Kalam da Google Fonts). Tocco sul quadratino = modifica stato/cliente/matricola/
  netto/note (+ storico della riga); "+" = nuova riga. Ricerca in tutti i marchi anche per cliente e matricola. Casellina "Mostra consegnate".
- Matricola facoltativa: si scrive o si legge con la fotocamera (QR o codice a barre, html5-qrcode).
- Carico macchine: articolo, quantita', netto (proposto netto 1), matricole. Le macchine vanno PRIMA ai clienti in attesa
  (ORDINATE poi DA ORDINARE, in ordine di inserimento), il resto disponibili; anteprima "Cosa succede". Un set carica i suoi componenti.
  Articolo non in listino: "Crealo" apre la finestra Nuovo articolo del listino e poi lo seleziona (hook macDopoSalvataggioListino).
- Carico Excel: file unico per tutti i marchi (colonne listino + QUANTITA + MATRICOLE). Modello scaricabile vuoto o gia' compilato
  con il listino di un marchio. Abbinamento MARCHIO+MODELLO+NOTE (se manca la NOTE e c'e' un solo articolo con quel modello lo abbina).
  Articolo nuovo = creato (serve ATTREZZO); netto 1 diverso = scalamento netto1->2->3 + storico (origine "CARICO MACCHINE");
  prezzi compilati aggiornano il listino (celle vuote non cancellano); QUANTITA vuota/0 = solo listino; righe ripetute unite;
  matricole doppie bloccate. Anteprima CARICO/NUOVO/SOLO LISTINO/ERRORE. UNA sola notifica di riepilogo (tipo IMPORT).
- Set: composizione dei set (macchine_composizione). L'app propone gli articoli con SET/KIT/CPL/COMPLETA. In magazzino si caricano i
  componenti; i set componibili si calcolano. Un componente non puo' essere a sua volta un set.
- Movimenti: registro (CARICO / NUOVA VOCE / MODIFICA / CANCELLATA / ORDINE), ultimi 500.
- Nel Listino Vendite (admin e operatori) accanto al modello: casetta N (disponibili) "+ N ass." oppure puzzle "N set".
- Report (macchine-report.js): venduta = CONSEGNATA alla data di consegna. Periodo, marchio, attrezzo, ricerca; raggruppa per marchio,
  attrezzo, modello, operatore, mese. Pezzi, ricavo (prezzo riga ordine diviso tra le macchine della riga in proporzione ai netti),
  costo (netto di carico), margine e margine % sul prezzo. Consegne senza ordine = "s.p." (senza prezzo).
  TUTTI I PREZZI (vendita e netti) SONO IVA INCLUSA: casellina "Mostra gli importi senza IVA (prezzi e netti sono IVA inclusa:
  scorpora l'iva a entrambi)" attiva di default (localStorage repPrezziIvaInclusa), toglie il 22% a entrambi. Excel (RIEPILOGO+DETTAGLIO) e PDF.
- Valore: adesso (IN_CASA, anche assegnate) o a una data (caricate entro la data e non consegnate quel giorno; le righe cancellate
  dal quaderno non si ricostruiscono: meglio consegnare che eliminare). Netto di carico (se manca netto 1). Stessa casellina IVA. Excel e PDF.


ORDINI CLIENTI (Vendite) - COME FUNZIONA (v6.2.0)

Sostituiscono il blocchetto delle commissioni (solo ordini, niente preventivi). Admin e operatori.
- Modulo come la commissione: data, OPERATORE (proposto chi e' collegato, si sceglie dagli utenti o si scrive), Sig./Sig.ra (obbligatorio),
  indirizzo, tel/cell, e-mail, C.F., P.IVA, note, pagamento (testo libero). Numero progressivo che riparte ogni anno (es. 12/2026),
  assegnato al salvataggio (unique anno+numero, riprova se due salvano insieme).
- Righe: articolo del listino (Disponibile = la macchina scelta dall'operatore viene intestata al cliente; Da ordinare = crea la riga bianca
  nel quaderno; set = componenti) oppure riga libera (olio, accessori: non tocca il magazzino). Prezzo proposto: promo valida >
  no promo > listino ("in scatola" mai), sempre modificabile (e' il prezzo TOTALE della riga). Blocca se le disponibili non bastano.
- Scelta macchina OBBLIGATORIA (scelta di Donny: l'app non sceglie mai da sola, niente FIFO): sulle righe Disponibile compaiono sempre
  le macchine libere in casa come caselline (matricola o "senza matricola" + data carico); per i set una casella per componente
  (ordSceltiDi / ordSistemaScelte; nel set la nuova spunta sostituisce la piu' vecchia). Non salva finche' le spuntate != fabbisogno.
  Ricerca per matricola nel campo articoli (macPickerImposta 5o parametro { onPezzo }): voce "MATR. ..." -> ordAggiungiPezzo
  (riga gia' scelta, o aggiunta alla riga Disponibile dello stesso articolo); matricole non libere mostrate come info (a chi).
  La matricola va nel PDF sotto l'articolo ("Matr. ..."). Se la matricola arriva dopo (carico che assegna a un ordine, o modifica
  nel quaderno) macchine-functions.js segna l'ordine in macOrdiniDaAggiornare e a fine macRicarica chiama ordAggiornaPdfOrdini(ids):
  il PDF su Drive viene rifatto da solo (solo ordini gia' su Drive e non annullati).
- Bozza dal listino: carrello &#128722; su ogni articolo del listino (PC e telefono, solo se macPuoGestire). Bozza = [{articolo_id,
  quantita}] in user_metadata.ordineBozza (+ copia localStorage), riletta con getUser() quando si apre listino/ordini (multi-dispositivo).
  Barra verde in cima al listino e in cima agli Ordini Clienti: "Crea l'ordine" (dal listino apre Ordini > Nuovo e mette le righe,
  ricontrolla Disponibile/Da ordinare con la quantita'), "Svuota". Usata la bozza si svuota. Stesso articolo = quantita' +1.
- Firma del cliente sullo schermo (canvas, salvata come PNG nel campo firma). Due riquadri firma gestiti da ordFirme.vendita /
  ordFirme.installazione (ordFirmaCollega, ordFirmaPulisciUna, ordFirmaImposta, ordFirmaDatiUna).
- SENZA SERVIZIO DI INSTALLAZIONE (31/10): casellina #ord-senza-installazione (spenta di default) nel modulo; mostra il testo
  ORD_CONDIZIONI_NO_INSTALLAZIONE e la seconda firma. Colonne macchine_ordini.senza_installazione (boolean) e firma_installazione
  (PNG) -> supabase/ordini-senza-installazione.sql (anche in ordini-clienti-setup.sql). I campi si mandano solo se usati
  (ordCampiInstallazione), cosi' gli ordini normali funzionano anche senza le colonne. PDF: dichiarazione + firma DENTRO il
  riquadro dell'ordine (tbody .ordd-noinst-corpo tra le righe articoli e la riga Disponibile/Totale, bordo verde, come la
  commissione COMM. ROBOT di Donny); condizioni di vendita + firma FUORI, sotto.
  Badge NO INST. in elenco e nel dettaglio. Testo della dichiarazione = quello scritto da Donny (NON quello corto della bozza PDF).
  Nel modulo dell'app la casellina e la dichiarazione stanno sopra il TOTALE.
- Stato calcolato dalle macchine collegate: Da ordinare -> Ordinato -> In casa -> Consegnato (oppure Annullato).
- Dettaglio: PDF/Stampa, "Ordinato al fornitore" (bianco->blu), quando arriva il carico la assegna da solo, "Consegnato al cliente"
  (croce), Modifica dati cliente/firma (righe bloccate; cambio nome aggiornato anche nel quaderno), Annulla (in casa tornano
  disponibili, da ordinare tolte, ordinate restano senza cliente; numero resta), Elimina (come annulla + cancella ordine + PDF nel
  cestino Drive; se era l'ultimo dell'anno il numero viene riusato, altrimenti resta un buco).
- PDF: nello STILE DEI REPORT (rpt-* + classi ordd-* in ordini.css; ordHtmlStampa): logo, "Ordine N. x/aaaa", Data + Operatore,
  dati azienda; sezioni Cliente / Pagamento / Articoli (colonne Articolo+matricola, Codice, Q.ta', Magazzino, P. totale), righe vuote
  fino a riempire il foglio (misurate in .pdf-foglio.pdf-misura), caselle Disponibile/Da ordinare + TOTALE, condizioni, firma. Dati aziendali e condizioni in cima a ordini-functions.js (ORD_AZIENDA,
  ORD_CONDIZIONI). Il numero di fax del modulo NON e' stampato.
- PDF su Google Drive in automatico (nuovo ordine, modifica, annullo): ORDINI CLIENTI / ORDINI CLIENTI <anno> (cartelle create da sole),
  file "ORDINE 0001-2026 CLIENTE.pdf". Script Google SEPARATO google/ordini-drive.gs (progetto "AGRIDESK Ordini", account aziendale,
  App web Esegui come Me / Chiunque) + Edge Function "ordini-drive" (Verify JWT spento; controlla login e puo_gestire_macchine;
  secrets ORDINI_SCRIPT_URL, ORDINI_SCRIPT_KEY). Pulsante "Prova Drive" sopra l'elenco. Guida: GUIDA_ORDINI_DRIVE.md.

CREAZIONE PDF (ordini, report, valore)
- Funzione comune pdfCreaDaHtml() in ordini-functions.js: il foglio (718 px = 190 mm) si costruisce in alto a sinistra della pagina,
  coperto dall'avviso "Creazione del PDF...", lo fotografa html2canvas 1.4.1 e lo impagina jsPDF 2.5.1 (caricate da jsdelivr solo quando
  servono). Ordine = una pagina (scalata se serve); report = piu' pagine tagliate tra una riga e l'altra, numero pagina se > 1.
- NIENTE window.print per ordini/report: "PDF / Stampa" apre il PDF in una nuova scheda (pdfApriInScheda), cosi' non compaiono
  data/indirizzo/numeri del browser. Limite: salvando dalla scheda il nome del file e' casuale.
- LEZIONI: html2pdf.js tagliava il lato destro (centrava sulla larghezza della finestra: Safari/finestre strette) e con la pagina
  scorsa usciva spostato o bianco -> abbandonato. Prima di fotografare si torna in cima alla pagina e poi si rimette lo scroll.
  Gli stili da telefono dell'app NON devono entrare nel foglio PDF (regole .pdf-foglio ... !important in macchine.css).


SICUREZZA E SUPABASE
- L'app usa la chiave publishable (sb_publishable_...) al posto della anon legacy: testata e funzionante
- Le chiavi legacy NON sono ancora disattivate (Supabase > Project Settings > API Keys > Legacy API Keys)
- La password non viene salvata nel browser, solo l'email
- .gitignore con *.pem, *.key, .DS_Store
- Script SQL gia' eseguiti: listino-vendite-setup.sql, listino-vendite-modifica-colonne.sql, listino-vendite-operatori.sql,
  listino-notifiche-setup.sql (v4.9.0), interventi-esterni-setup.sql, tecnici-ruolo-setup.sql,
  interventi-telegram-setup.sql, assenze-tecnici-setup.sql (v6.0.0), organizzazione-setup.sql (v6.1.0)
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
- PRIMA DI METTERE ONLINE la v6.2.0: eseguire supabase/macchine-operatori.sql; a prove finite pulizia-prove-macchine.sql
  (+ articoli di prova del listino in "Articoli cancellati", netti di prova corretti, PDF di prova cancellati da Drive);
  riportare il quadernone con "Nuova voce" e configurare i set; poi ./update-version.sh (rispondere "s" al push)
- Configurare (o verificare con "Prova Drive") il salvataggio degli ordini su Drive: GUIDA_ORDINI_DRIVE.md
- Telegram per macchine/ordini: Donny ci sta pensando (idee: macchina arrivata per un cliente, riepilogo da ordinare al fornitore,
  nuovo ordine, macchine assegnate da troppo tempo). Va fatto con funzione/bot SEPARATI.
- Eventuale nome giusto del PDF quando si salva dalla nuova scheda (oggi casuale)
- NETLIFY: Stop builds sul doppione e poi cancellarlo (vedi NOME E INDIRIZZO)
- Eventuale cambio "AGRIMAG" -> "AGRIDESK" anche nei messaggi Telegram (4 funzioni da ripubblicare)
- Aggiornare MANUALE.md con v6.0.1 / v6.1.x (giorno ricordato, i miei interventi, promemoria, meteo, AGRIDESK)
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