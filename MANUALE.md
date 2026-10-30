# &#128230; AGRIMAG - Manuale d'uso e di manutenzione

**Versione app:** 6.0.0
**Ultimo aggiornamento manuale:** Ottobre 2026
**Tecnologie:** HTML + CSS + JavaScript (senza framework), Supabase (database e login), Vercel (pubblicazione), GitHub (codice)

---

## INDICE

1. Cos'&egrave; AGRIMAG
2. Struttura dell'app
3. Accesso e utenti
4. Dashboard
5. Magazzino &rarr; Inventario Consumabili
6. Magazzino &rarr; Inventario Ricambi Stock
7. Magazzino &rarr; Scanner (solo mobile)
8. Vendite
8bis. Tecnici &rarr; Interventi Esterni
9. Gestione Utenti (solo admin)
10. Funzioni automatiche dell'app
11. Manutenzione: file e comandi da terminale
12. Supabase: chiavi e sicurezza
13. Regole per chi modifica il codice
14. Problemi comuni e soluzioni
15. Storico modifiche principali

---

## 1. COS'&Egrave; AGRIMAG

AGRIMAG &egrave; una web app per gestire il magazzino: articoli consumabili e ricambi a stock, con carichi, scarichi, storico movimenti, report e scansione dei codici a barre da smartphone. Funziona da PC, tablet e smartphone.

**Architettura:**

```
Browser (PC / smartphone)
        |
   Sito su VERCEL  <---- codice caricato da GitHub
        |
   Database e login su SUPABASE
```

- **Vercel** pubblica il sito. Ad ogni caricamento su GitHub il sito si aggiorna da solo in 1-2 minuti.
- **GitHub** conserva il codice.
- **Supabase** conserva dati (articoli, ricambi, movimenti, utenti) e gestisce il login.

---

## 2. STRUTTURA DELL'APP

```
Login
  |
Dashboard
  |-- Magazzino
  |     |-- Inventario Consumabili
  |     |-- Inventario Ricambi Stock
  |     |-- Scanner (solo smartphone/tablet)
  |
  |-- Vendite
  |     |-- Listino Vendite
  |     |-- Listini Fornitori    (PDF su Google Drive)
  |
  |-- Tecnici
  |     |-- Interventi Esterni   (planning settimanale dei tecnici)
  |
  |-- Gestione Utenti            (solo admin)
```

In ogni sezione c'&egrave; un pulsante per tornare indietro (es. "Torna a Magazzino", "Torna alla Dashboard").

---

## 3. ACCESSO E UTENTI

### 3.1 Login
1. Apri l'indirizzo dell'app.
2. Inserisci email e password.
3. Premi **Accedi**.

### 3.2 "Resta connesso" / "Ricorda email"
- L'app **non salva pi&ugrave; la password**. Ricorda solo l'email.
- La sessione di login &egrave; gestita da Supabase e resta attiva finch&eacute; non fai **Esci**.
- Se vuoi che il browser proponga la password, usa il gestore password del dispositivo (iPhone: Portachiavi).

### 3.3 Ruoli
| Ruolo | Cosa pu&ograve; fare |
|-------|---------------------|
| **Admin** | Tutto: modificare ed eliminare articoli/ricambi, import Excel, gestire utenti |
| **Operatore** | Consultare, caricare e scaricare, usare scanner e report. Non pu&ograve; modificare/eliminare n&eacute; gestire utenti |
| **Tecnico** | Vede **solo** Tecnici &rarr; Interventi Esterni, in sola lettura (tutte le settimane, tutti i tecnici). Entra direttamente nel planning; niente pop-up novit&agrave; n&eacute; campanella. Bloccato anche nel database fuori da questa sezione |

La sezione **Vendite** &egrave; visibile ad admin e operatori. La sezione **Tecnici** ad admin, operatori e tecnici (admin e operatori possono modificare).

### 3.4 Password dimenticata
Chiedi a un admin di reimpostarla da Gestione Utenti oppure dal pannello Supabase (Authentication &rarr; Users).

---

## 4. DASHBOARD

Dopo il login compare la Dashboard con le card:

- &#127981; **Magazzino** - apre le tre sottocategorie (Consumabili, Ricambi Stock, Scanner)
- &#128176; **Vendite** - apre Listino Vendite e Listini Fornitori
- &#128119; **Tecnici** - apre Interventi Esterni (il tecnico vede solo questa)
- &#128101; **Gestione Utenti** - visibile solo agli admin

Cliccando su una card si entra nella sezione. Se cambi finestra del browser o torni all'app, **l'app ricorda in quale sezione e scheda eri** (fino a refresh manuale o logout).

---

## 5. INVENTARIO CONSUMABILI

Percorso: Dashboard &rarr; Magazzino &rarr; Inventario Consumabili.

Schede disponibili: **Inventario**, **Nuovo Articolo**, **Movimenti**, **Report**.

### 5.1 Inventario
- Elenco articoli raggruppati per fornitore/marca, con quantit&agrave; e stato scorte.
- Ricerca per nome, codice o barcode; filtro per marca; ordinamento.
- Pulsanti per riga: &#10133; carico, &#10134; scarico, &#9997; modifica (admin), &#128465; elimina (admin).
- Gli articoli sotto la soglia minima sono evidenziati.

### 5.2 Nuovo articolo
Compila codice, nome, barcode (facoltativo), marca/fornitore, quantit&agrave; iniziale, soglia minima, note e i campi prezzo/IVA previsti dal modulo. Se la quantit&agrave; iniziale &egrave; maggiore di zero viene registrato in automatico un movimento di carico.

### 5.3 Carico e scarico
Premi &#10133; o &#10134; sulla riga, indica la quantit&agrave; e (facoltativo) una nota. Lo scarico non pu&ograve; superare la quantit&agrave; disponibile.

### 5.4 Movimenti
Storico di tutti i carichi/scarichi con data, utente, articolo, quantit&agrave; e note. Filtri per tipo e per periodo. Su smartphone l'utente &egrave; mostrato con le **iniziali**.

### 5.5 Report
Report generale, per fornitore o per singolo articolo, nel periodo scelto, con tasto di stampa.

---

## 6. INVENTARIO RICAMBI STOCK

Percorso: Dashboard &rarr; Magazzino &rarr; Inventario Ricambi Stock.

Schede: **Inventario**, **Nuovo Ricambio**, **Import Excel**, **Movimenti**, **Report**.

### 6.1 Inventario ricambi
- Ricambi con quantit&agrave; maggiore di zero, raggruppabili per fornitore.
- I ricambi a quantit&agrave; zero finiscono nella sezione **Ricambi Esauriti** (a fondo pagina, da aprire cliccando). Da l&igrave; si possono **ricaricare** per riportarli in inventario.
- Ricerca per nome, codice, barcode, fornitore, note.

### 6.2 Nuovo ricambio
Campi: codice articolo, nome, barcode, fornitore, quantit&agrave;, note. Il codice articolo deve essere unico.

### 6.3 Import da Excel (solo admin)
- Formato **.xlsx**, prima riga = intestazioni (viene saltata).
- **Massimo 100 righe** per file.
- Colonne, in ordine:

| Colonna | Contenuto | Obbligatorio |
|---------|-----------|--------------|
| A | Codice articolo | S&igrave; |
| B | Nome | S&igrave; |
| C | Barcode | No |
| D | Quantit&agrave; da caricare (maggiore di 0) | S&igrave; |
| E | Fornitore | S&igrave; |
| F | Note | No |

- Se il codice **esiste gi&agrave;** (anche a quantit&agrave; zero) la quantit&agrave; viene **sommata** e registrato un carico; se non esiste viene **creato**.
- A fine import compare un riepilogo con ricambi inseriti, aggiornati ed eventuali errori riga per riga.

### 6.4 Movimenti e report ricambi
Come per i consumabili: storico con filtri e report generale / per fornitore / per ricambio. Se non ci sono movimenti nel periodo il report lo segnala chiaramente; in caso di errore compare un messaggio con il dettaglio.

---

## 7. SCANNER (SOLO MOBILE)

Percorso: Dashboard &rarr; Magazzino &rarr; Scanner. La card &egrave; nascosta su PC.

1. Consenti l'uso della fotocamera quando richiesto.
2. Inquadra il codice a barre.
3. Lo scanner cerca **sia tra gli Articoli consumabili sia tra i Ricambi**.
4. Dal risultato puoi fare subito carico o scarico.

Uscendo dalla sezione Scanner la fotocamera si spegne automaticamente.
Su iPhone serve connessione sicura (HTTPS): il sito su Vercel &egrave; gi&agrave; HTTPS.

---

## 8. VENDITE

- **Listino Vendite**: listino macchine con filtri, import Excel con anteprima, storico netti e articoli cancellati. Admin e operatori hanno gli stessi permessi.
- **Listini Fornitori**: listini e cataloghi PDF dei fornitori, presi da Google Drive (vedi 8.3).

### 8.1 Notifiche delle modifiche al listino (v4.9.0)
Ogni modifica al listino (modifica di un articolo, nuovo articolo, spostamento nei cancellati, ripristino, import Excel) viene registrata e notificata a tutti:

- **Campanella in alto** (accanto al ruolo, solo da PC): il numerino rosso conta le notifiche degli *altri* utenti che non hai ancora visto. Si aggiorna da sola, senza ricaricare la pagina. Da telefono non c'&egrave;: bastano l'avviso a comparsa e Telegram.
- **Avviso a comparsa**: quando un altro utente modifica il listino compare un riquadro in alto; toccandolo si apre l'elenco.
- **Elenco notifiche**: mostra solo le novit&agrave; non ancora viste, con chi, quando e cosa (es. *NETTO 1: &euro; 284,00 &rarr; &euro; 300,00*). Quando chiudi la finestra spariscono. Il pulsante *Vai all'articolo* apre il listino gi&agrave; filtrato. I netti sono sfocati come nel listino (clic per vederli).
- **Telegram**: lo stesso messaggio arriva nel gruppo Telegram. Un import Excel manda un solo messaggio di riepilogo.
- Se salvi un articolo senza cambiare nulla, non parte nessuna notifica. Le tue modifiche non fanno salire il tuo numerino.
- Gli admin hanno nell'elenco il pulsante **Prova Telegram** per controllare che il bot funzioni.

### 8.2 Promemoria ordini: articoli sotto soglia ed esauriti (v4.9.5)
Quando un carico/scarico (anche dallo Scanner) o una modifica fa scendere un articolo di magazzino al limite, parte un avviso a tutti, in app (campanella da PC, avviso a comparsa anche da telefono) e su Telegram:

- **Consumabili**: *Sotto soglia - da ordinare* quando la quantit&agrave; scende alla soglia minima o sotto; *Esaurito - da ordinare* quando arriva a 0.
- **Ricambi stock**: solo *Esaurito - da ordinare* (la soglia dei ricambi &egrave; fissa e non si gestisce).
- L'avviso parte solo nel momento in cui si supera il limite, non a ogni scarico successivo. I carichi non generano avvisi.
- *Vai all'articolo* apre Consumabili o Ricambi gi&agrave; filtrati sul codice dell'articolo.

### 8.3 Listini Fornitori (v4.10.0)
I PDF stanno su **Google Drive**, nella cartella aziendale dei listini, condivisa con i colleghi. L'app legge le cartelle da sola: per aggiungere fornitori o listini **non si modifica l'app**.

- **Cartelle**: `FORNITORE / file` per i fornitori diretti, `IMPORTATORE / MARCHIO / file` per gli importatori.
- **Nomi dei file**: `LISTINO 2026`, `CATALOGO 2026`, con un'eventuale nota dopo l'anno (`LISTINO 2026 RICAMBI`).
- Per ogni marchio l'app mette in evidenza listino e catalogo dell'**anno pi&ugrave; recente**; gli altri anni (e i file in una sottocartella `ARCHIVIO`) vanno in **Archivio**.
- I file con il nome fuori regola si vedono lo stesso, con un avviso. I file lasciati nella cartella principale vengono segnalati.
- Toccando un file si apre su Google Drive (da telefono nell'app Drive: sfogliare, cercare, salvare offline).
- **Telegram**: lo script Google controlla ogni 15 minuti se ci sono file nuovi o aggiornati e manda un messaggio al gruppo.
- La guida per caricare e aggiornare i listini &egrave; scritta anche nell'app, in cima alla sezione.

Configurazione (una volta sola): vedi `GUIDA_LISTINI_FORNITORI.md`. Pezzi: script Google `google/listini-drive.gs` (account aziendale, pubblicato come App web), funzione Supabase `listini-drive` (file `supabase/listini-drive.ts`) con i secrets `DRIVE_SCRIPT_URL` e `DRIVE_SCRIPT_KEY`.

Configurazione notifiche: tabella `listino_notifiche` (script `supabase/listino-notifiche-setup.sql`), funzione Supabase `notifica-telegram` (file `supabase/notifica-telegram.ts`) con i secrets `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID`.

---

## 8bis. TECNICI &rarr; INTERVENTI ESTERNI (v6.0.0)

Percorso: Dashboard &rarr; Tecnici &rarr; Interventi Esterni. Modificano **admin e operatori**; i **tecnici** vedono soltanto.

### 8bis.1 Elenco settimane
- Settimane da luned&igrave; a sabato, divise per mese, dal 2 novembre 2026. In alto si sceglie l'anno.
- "QUESTA SETTIMANA" in evidenza; su ogni settimana il numero di interventi e un pallino rosso se ci sono righe rosse (assenze).

### 8bis.2 Planning della settimana
- **PC**: una tabella per tecnico (GIORNO, ORA, TIPO, ESITO, CLIENTE), 4 righe la mattina e 4 il pomeriggio (separate da una linea tratteggiata). Pulsanti *Settimane*, *Prec.*, *Oggi*, *Succ.*
- **Telefono**: un giorno alla volta (linguette LUN...SAB), parte dal giorno di oggi.
- **Modificare una riga**: toccarla. Ora (testo libero), Tipo (INT / SOP / MONT), Esito (? / NR / OK / NO), Cliente, Colore. **NO** = intervento annullato (riga barrata). *Svuota riga* cancella testo e colore.
- **Colori** (rosso = assente, giallo, verde, blu):
  - una riga: dalla finestra di modifica;
  - pi&ugrave; righe: **Pennello** (scegli il colore e tocca le righe; la X = gomma, toglie il colore);
  - mezza giornata / giornata intera: toccare la casella del giorno (da telefono "Colora").
- **Tecnici**: pulsante *Tecnici* nella settimana. "Tutte le settimane" = compare sempre; altrimenti "In questa settimana" lo aggiunge solo alla settimana aperta. Si pu&ograve; rinominare e disattivare (resta dove ha gi&agrave; interventi). Per eliminarlo del tutto: SQL su Supabase (vedi sotto).
- Le modifiche dei colleghi compaiono da sole (tempo reale).

### 8bis.3 Telegram: pulsante "Invia a Telegram"
- Salvando le righe **non parte nulla**: le modifiche si accumulano e il pulsante &#128232; *Invia a Telegram* diventa azzurro con il numero di modifiche.
- Premendolo (anteprima + conferma) parte **un solo messaggio** nel gruppo "Interventi esterni" (bot @interventiesterni_bot), raggruppato per tecnico: *Interventi aggiunti per...*, *modificati* (ora/tipo/cliente, con prima &rarr; dopo), *riprogrammati* (tolto l'esito NO), *cancellati* (esito NO o riga svuotata). Arriva solo lo stato finale delle righe.
- **Esito "?"** (cliente non ancora chiamato): la riga resta in attesa e parte quando l'esito cambia; se viene svuotata non parte nulla.
- Non generano avvisi: colori, esiti NR/OK, giorni passati.
- Admin: pulsante *Prova Telegram* nella finestra Tecnici.

### 8bis.4 Assenze da Google Calendar
- Uno script Google (account agrimacchricambi) legge ogni 2 minuti il calendario condiviso delle assenze e lo passa alla funzione Supabase `assenze-tecnici`.
- Per ogni assenza nuova o modificata di un tecnico arriva a Donny (chat privata con @interventiesterni_bot) un messaggio con la parte di giornata capita e i pulsanti *Come proposto / Solo mattina / Solo pomeriggio / Giornata intera / No*: premendo, il planning si colora di rosso da solo.
- Titoli: serve una parola di assenza (assente, assenza, ferie, malattia, permesso, esce, uscita) e il tecnico (nome e cognome in qualsiasi ordine, o solo nome/cognome se nessun altro tecnico ce l'ha). Persone che non sono tecnici: ignorate. Giornata 8-19: mattina 8-13, pomeriggio 13-19. "Esce ore X": mattina o pomeriggio secondo l'ora.
- Dopo le 7:00 il resoconto "Assenze di oggi"; se un evento viene tolto dal calendario arriva l'avviso con *Togli il rosso*.
- Configurazione completa: `GUIDA_ASSENZE_CALENDARIO.md`.

### 8bis.5 Archivio di fine anno (solo admin)
Nell'elenco settimane: **Archivia anno** scarica `INTERVENTI_ESTERNI_anno.xlsx` (tutte le righe con colori e filtri), chiede di controllare il file e, solo dopo aver scritto l'anno per conferma, svuota il server. Farlo da PC.

### 8bis.6 Configurazione (gi&agrave; fatta)
- Script SQL eseguiti su Supabase: `interventi-esterni-setup.sql`, `tecnici-ruolo-setup.sql`, `interventi-telegram-setup.sql`, `assenze-tecnici-setup.sql`.
- Funzioni Supabase (Verify JWT spento): `notifica-interventi` (file `supabase/notifica-interventi.ts`) e `assenze-tecnici` (file `supabase/assenze-tecnici.ts`). Ogni volta che cambia il file va reincollato e ripubblicato (Deploy).
- Secrets: `TELEGRAM_BOT_TOKEN_INTERVENTI`, `TELEGRAM_CHAT_ID_INTERVENTI`, `ASSENZE_CHAT_ID`, `ASSENZE_SCRIPT_KEY`, `ASSENZE_WEBHOOK_SECRET`, `ASSENZE_SERVICE_KEY`.
- Il bot @interventiesterni_bot ha il webhook verso `assenze-tecnici`: `getUpdates` non funziona pi&ugrave;; per sapere il chat id di una chat scrivere `/id` al bot.
- Eliminare un tecnico (SQL Editor):
```
delete from public.interventi where tecnico_id = (select id from public.tecnici where nome = 'NOME COGNOME');
delete from public.tecnici where nome = 'NOME COGNOME';
```

---

## 9. GESTIONE UTENTI (SOLO ADMIN)

Percorso: Dashboard &rarr; Gestione Utenti.

- **Aggiungere** un utente: email, password iniziale, ruolo (admin / operatore / **tecnico**) e **iniziali** (usate nelle tabelle movimenti su mobile).
- **Modificare** ruolo e iniziali con &#9997;.
- **Eliminare** un utente con &#128465;. Attenzione: cancella solo il ruolo, l'account resta in Supabase &rarr; Authentication &rarr; Users. Per riusare la stessa email eliminare anche l'account da l&igrave; (o con SQL: `delete from auth.users where lower(email) = lower('email@esempio.it');`).

---

## 10. FUNZIONI AUTOMATICHE DELL'APP

- **Maiuscolo automatico:** tutti i campi di testo vengono salvati in MAIUSCOLO (esclusi email, password e date).
- **Persistenza sessione:** l'app ricorda sezione e scheda quando cambi finestra, fino a refresh manuale o logout.
- **Pop-up novit&agrave;:** quando esce una nuova versione compare una finestra con le novit&agrave;, **una sola volta per utente**. Il "gi&agrave; visto" &egrave; salvato sul dispositivo e nel profilo utente su Supabase, cos&igrave; non ricompare ad ogni login (anche su mobile).
- **Filtri:** tornando in una sezione i filtri ripartono dai valori predefiniti.

---

## 11. MANUTENZIONE: FILE E COMANDI DA TERMINALE

### 11.1 File principali (cartella `magazzino-app`)
| File | Contenuto |
|------|-----------|
| `index.html` | Struttura delle pagine, dashboard, sezioni, finestre |
| `style.css` | Stili e adattamento mobile |
| `app.js` | Login, navigazione, consumabili, scanner, utenti, pop-up novit&agrave; |
| `ricambi-functions.js` | Tutta la logica dei ricambi stock |
| `listino-functions.js`, `listino.css` | Listino Vendite e notifiche (campanella) |
| `fornitori-functions.js`, `fornitori.css` | Listini Fornitori (cartelle Google Drive) |
| `interventi-functions.js`, `interventi.css` | Tecnici &rarr; Interventi Esterni (planning, Telegram, archivio) |
| `supabase/` | Script SQL e codice delle funzioni Supabase (notifica-telegram, listini-drive, notifica-interventi, assenze-tecnici) |
| `google/listini-drive.gs` | Script Google dei listini (si incolla su script.google.com) |
| `google/assenze-calendario.gs` | Script Google delle assenze dei tecnici (account agrimacchricambi) |
| `GUIDA_LISTINI_FORNITORI.md` | Guida di configurazione Drive + script + Supabase |
| `GUIDA_ASSENZE_CALENDARIO.md` | Guida di configurazione assenze: calendario + script + Supabase + Telegram |
| `manifest.json` | Impostazioni per installare l'app sul telefono |
| `VERSION.md` | Storico versioni |
| `push-all.sh`, `update-version.sh`, `start-https-server.sh` | Script di aiuto |

### 11.2 Caricare le modifiche online
```
cd ~/Desktop/magazzino-app
./push-all.sh
```
Lo script mostra i file modificati, chiede conferma, carica su GitHub; Vercel ripubblica in 1-2 minuti.

### 11.3 Cambiare versione
```
cd ~/Desktop/magazzino-app
./update-version.sh
```
Serve per far comparire il pop-up novit&agrave; agli utenti.

### 11.4 Provare l'app in locale (HTTPS)
```
cd ~/Desktop/magazzino-app
bash start-https-server.sh
```
Per fermare il server: **Ctrl + C**.

### 11.5 Certificati locali
`localhost.pem` e `localhost-key.pem` servono solo per il test locale e **non devono finire su GitHub**: sono elencati nel file `.gitignore`. Se risultassero gi&agrave; caricati:
```
cd ~/Desktop/magazzino-app
git ls-files | grep pem
git rm --cached localhost.pem localhost-key.pem
./push-all.sh
```

---

## 12. SUPABASE: CHIAVI E SICUREZZA

- L'app usa la nuova **chiave pubblicabile** (`sb_publishable_...`) al posto della vecchia chiave `anon`. &Egrave; pensata per stare nel codice del sito; la sicurezza dei dati dipende dalle regole **RLS** del database.
- Le vecchie chiavi (`anon` / `service_role`) saranno dismesse da Supabase entro fine 2026. Dopo alcuni giorni di funzionamento regolare della nuova chiave si possono disattivare da: *Supabase &rarr; Project Settings &rarr; API Keys &rarr; Legacy API Keys*.
- **Mai** inserire nel codice la chiave segreta (`sb_secret_...` / `service_role`).
- Controllo periodico consigliato: *Supabase &rarr; Advisors &rarr; Security*.
- Librerie esterne usate: supabase-js v2, SheetJS 0.20.1 (Excel), html5-qrcode 2.3.8 (scanner).

---

## 13. REGOLE PER CHI MODIFICA IL CODICE

- **Niente emoji diretti**: usare i codici HTML (es. `&#128230;`).
- **Accenti italiani con codici HTML** (`&agrave; &egrave; &ograve; &ugrave;`) per evitare caratteri corrotti.
- Controllare sempre lo **z-index** quando si aggiungono finestre sovrapposte.
- Fornire e sostituire **file completi**, non frammenti.
- Il deploy &egrave; su **Vercel**; il database &egrave; **Supabase**.
- Dopo una modifica: provare in locale, poi `./push-all.sh`.

---

## 14. PROBLEMI COMUNI E SOLUZIONI

| Problema | Soluzione |
|----------|-----------|
| Non vedo le ultime modifiche | Attendi 1-2 minuti dopo il push, poi aggiorna la pagina (su iPhone chiudi e riapri l'app) |
| Il pop-up novit&agrave; ricompare | Aggiorna all'ultima versione; se persiste, controlla di aver caricato `app.js` e `index.html` aggiornati |
| Login non funziona | Verifica email/password; controlla su Supabase che l'utente esista e sia confermato |
| Scanner non parte | Consenti la fotocamera nelle impostazioni del browser; usa HTTPS |
| L'import Excel rifiuta il file | Controlla formato .xlsx, massimo 100 righe, colonne A, B, D, E compilate |
| Caratteri strani (&Atilde;...) | Sostituire accenti ed emoji con codici HTML |
| Un report sembra vuoto | Allarga il periodo o lascia vuoti i campi Da/A |
| Un'azione d&agrave; errore sui dati | Premi F12 per aprire la Console e leggi il dettaglio |
| Telegram non riceve le notifiche | Campanella &rarr; *Prova Telegram* (admin): il messaggio d'errore dice cosa manca (funzione, &quot;Verify JWT&quot; spento, secrets) |
| "Invia a Telegram" d&agrave; errore | Finestra Tecnici &rarr; *Prova Telegram* (admin): l'errore dice cosa manca (funzione `notifica-interventi`, secrets `TELEGRAM_BOT_TOKEN_INTERVENTI` / `TELEGRAM_CHAT_ID_INTERVENTI`) |
| Non arrivano gli avvisi delle assenze | Apps Script &rarr; esegui `controllaAdesso` e leggi il log (una riga per evento). Vedi `GUIDA_ASSENZE_CALENDARIO.md` |
| Email gi&agrave; registrata creando un utente | L'account &egrave; ancora in Supabase &rarr; Authentication &rarr; Users: eliminarlo da l&igrave; |
| La campanella non si aggiorna da sola | Controlla di aver eseguito `listino-notifiche-setup.sql` (attiva il tempo reale); riaprendo l'app il conteggio si aggiorna comunque |

---

## 15. STORICO MODIFICHE PRINCIPALI

- **v6.0.0 (ott 2026)** - Nuova sezione **Tecnici &rarr; Interventi Esterni**: planning settimanale (4 righe mattina + 4 pomeriggio per tecnico), colori con pennello, tecnici per settimana, tempo reale; ruolo utente **Tecnico** (sola lettura, solo questa sezione); riepilogo Telegram con il pulsante "Invia a Telegram"; assenze lette da Google Calendar con conferma su Telegram e colorazione automatica; archivio di fine anno in Excel.
- **v4.10.0 (ott 2026)** - Listini Fornitori: PDF su Google Drive letti in automatico dall'app (fornitori, marchi, pi&ugrave; recenti e archivio), guida in app, avvisi Telegram dei file nuovi o aggiornati.
- **v4.9.5 (ott 2026)** - Promemoria ordini: notifiche (app e Telegram) per consumabili sotto soglia o esauriti e ricambi esauriti; filtri che restano dopo carico/scarico; ordinamento per codice articolo; finestre con pulsanti sempre visibili; prezzo "No promo" da mobile; pulsante "Dashboard" accanto a "Torna a Magazzino/Vendite".
- **v4.9.0 (ott 2026)** - Notifiche delle modifiche al listino: campanella in app con avvisi in tempo reale e messaggi Telegram.
- **v4.8.0 (ott 2026)** - Listino Vendite completo (import Excel, storico netti, articoli cancellati), aperto anche agli operatori.
- **v4.7.5 (2026)** - Pop-up novit&agrave; non ricompare pi&ugrave; ad ogni login su mobile; passaggio alla nuova chiave pubblicabile Supabase; password non pi&ugrave; salvata nel browser; nuova Dashboard con categorie **Magazzino** e **Vendite**; correzione ripristino scheda Ricambi dopo refresh; spegnimento fotocamera uscendo dallo Scanner.
- **v4.7.0 (gen 2026)** - Aggiornamenti 2026.
- **v4.5.x (dic 2025)** - Aggiornamenti vari, sicurezza e login.
- **v4.3.6 (nov 2025)** - Gestione utenti e pulsanti azioni in griglia.
- **v1.0.0 (gen 2025)** - Prima versione.

Storico completo in `VERSION.md`.