# &#128230; AGRIMAG - Manuale d'uso e di manutenzione

**Versione app:** 7.1.3
**Ultimo aggiornamento manuale:** 7 novembre 2026
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
8bis. Assistenza (ex Tecnici) &rarr; Interventi Esterni, Richieste e Organizzazione interventi robot
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
  |     |-- Inventario Macchine (quaderno, carico, carico a raffica, report)
  |
  |-- Vendite
  |     |-- Listino Agrimacch
  |     |-- Cataloghi Fornitori  (PDF su Google Drive; prima si chiamava Listini Fornitori)
  |     |-- Listini Fornitori    (prezzi per fornitore e listino, con scadenze; admin e operatori, caricamenti solo admin)
  |     |-- Ordini Clienti
  |     |-- Buoni Regalo
  |
  |-- Assistenza (ex Tecnici)
  |     |-- Interventi Esterni   (planning settimanale dei tecnici)
  |     |-- Richieste interventi robot
  |     |-- Organizzazione interventi robot (solo admin, pulsante mappamondo)
  |
  |-- Dati aziendali             (solo admin)
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

- **Sessione che non cade** (v7.4.1): all'apertura e quando si torna sull'app (telefono sbloccato, PC risvegliato) se la rete non &egrave; ancora pronta l'app riprova per qualche secondo prima di mandare al login (`authRecuperaSessione()` in app.js). Al login si va solo se la sessione non c'&egrave; pi&ugrave; davvero; se la chiude Supabase compare &quot;La sessione &egrave; scaduta&quot;. Tornando sulla scheda l'app non ricarica pi&ugrave; tutto. Le finestre di navigazione **privata** cancellano la sessione quando si chiudono: l&igrave; bisogna rientrare ogni volta.

### 3.2bis Colori per daltonici (v7.4.1)
Pulsante con l'**occhio** in alto (accanto al ruolo). Per chi confonde rosso e verde: il verde con un significato (disponibile, in casa, valido, ok) diventa **blu**, il rosso (scaduto, da ordinare, errore) **arancio scuro**, l'arancione (in scadenza, attenzione) **giallo**; in pi&ugrave; alcuni simboli (&#10004; &#9203; &#9888;&#65039;) accanto ai colori. Il verde dell'app (pulsanti, intestazioni) resta. Cambiano anche le parole delle legende e delle guide. Si ricorda per ogni utente (profilo Supabase `user_metadata.daltonici`, vale su tutti i dispositivi); al logout si torna ai colori normali. File `daltonici.css` (caricato per ultimo) e funzioni `dalt*` in app.js; nelle legende le parole dei colori si scrivono `<span class="cw-n">verde</span><span class="cw-d">blu</span>`.

### 3.3 Ruoli
| Ruolo | Cosa pu&ograve; fare |
|-------|---------------------|
| **Admin** | Tutto: modificare ed eliminare articoli/ricambi, import Excel, gestire utenti |
| **Operatore** | Consultare, caricare e scaricare, usare scanner e report. Non pu&ograve; modificare/eliminare n&eacute; gestire utenti |
| **Tecnico** | Vede **solo** Assistenza: Interventi Esterni in sola lettura (tutte le settimane, tutti i tecnici; pu&ograve; registrare l'esito delle telefonate TEL) e Richieste interventi robot (le modifica). Entra direttamente nel planning; niente pop-up novit&agrave; n&eacute; campanella. Bloccato anche nel database fuori da questa sezione |

La sezione **Vendite** &egrave; visibile ad admin e operatori. La sezione **Tecnici** ad admin, operatori e tecnici (admin e operatori possono modificare).

### 3.4 Password dimenticata
Chiedi a un admin di reimpostarla da Gestione Utenti oppure dal pannello Supabase (Authentication &rarr; Users).

---

## 4. DASHBOARD

Dopo il login compare la Dashboard con le card:

- &#127981; **Magazzino** - apre le tre sottocategorie (Consumabili, Ricambi Stock, Scanner)
- &#128176; **Listini Vendite** - apre Cataloghi Fornitori, Listini Fornitori e Listino Agrimacch
- &#128722; **Ordini** - apre Buoni Regalo, Ordini Clienti e Ordini Macchine (il libro degli ordini ai fornitori; admin e operatori)
- &#128119; **Tecnici** - apre Interventi Esterni (il tecnico vede solo questa)
- &#128101; **Gestione Utenti** - visibile solo agli admin

Le card (anche dentro i menu) sono sempre in **ordine alfabetico** (`ordinaCardAlfabetico()` in `app.js`). Cliccando su una card si entra nella sezione. Se cambi finestra del browser o torni all'app, **l'app ricorda in quale sezione e scheda eri** (fino a refresh manuale o logout).

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
Report generale, per fornitore o per singolo articolo, nel periodo scelto. Il tasto **Stampa** crea il PDF nello stile dei report (vedi sezione 10).

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

- **Listino Agrimacch**: listino macchine con filtri, import Excel con anteprima, storico netti e articoli cancellati. Admin e operatori hanno gli stessi permessi.
- **Cataloghi Fornitori**: listini e cataloghi PDF dei fornitori, presi da Google Drive (vedi 8.3). Fino alla v7.2 si chiamava &quot;Listini Fornitori&quot;.
- **Listini Fornitori**: prezzi dei fornitori caricati dai loro Excel, pi&ugrave; listini per fornitore con la scadenza (vedi 8.4bis).

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

### 8.3 Cataloghi Fornitori (ex Listini Fornitori, v4.10.0)
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

### 8.4bis Listini Fornitori con i prezzi (v7.3.0; admin e operatori dal 9/11/2026)
Ha preso il posto del vecchio Listino STIHL (tolto in v7.3.1) e vale per qualsiasi fornitore. File `listini-fornitori-functions.js` e `listini-fornitori.css`; tabelle `lf_fornitori`, `lf_listini`, `lf_articoli`, `lf_prezzi`. Configurazione: eseguire una volta `supabase/listini-fornitori-setup.sql` (dopo `listino-codice-articolo.sql`): crea le tabelle e la prima volta ha copiato i dati del vecchio Listino STIHL. Poi `supabase/pulizia-vecchio-listino-stihl.sql` ha ricopiato gli ultimi collegamenti/EAN e cancellato le tabelle `stihl_*` (il Listino Agrimacch non viene toccato).
- **Fornitori**: una scheda in alto per ognuno (pallino rosso/arancione se ha un listino scaduto o in scadenza). Admin: **&#10133; Fornitore** (nome, marchio da usare con Crea, ricarico proposto) e &#9997;&#65039; per modificarlo o eliminarlo.
- **Pi&ugrave; listini per fornitore** (es. STIHL OPG e OPM) attivi insieme, ognuno con file, nome, **scadenza** e ricarico suoi. Sotto i fornitori la barra delle scadenze: verde valido, arancione entro 7 giorni, rosso scaduto (si consulta lo stesso, con il riquadro rosso).
- **Stesso codice in pi&ugrave; listini**: nella riga compare un prezzo per listino, uno sotto l'altro (cliente IVA incl., listino, netto e ricarico oscurabili). &#9733; = prezzo cliente pi&ugrave; basso tra i listini non scaduti. Filtri: listino, categoria, collegati s&igrave;/no, ricerca anche per EAN.
- **Collegamento, EAN e codice articolo** valgono per il codice (tabella `lf_articoli`), quindi per tutti i listini del fornitore. **Collega** lega il codice a un articolo che c'&egrave; gi&agrave; nel Listino Agrimacch (gli passa l'EAN nel codice a barre se &egrave; vuoto); **Crea** apre Nuovo articolo del Listino Agrimacch gi&agrave; compilato (marchio del fornitore, modello = descrizione, netto 1, vendita no promo = prezzo cliente, listino, note 1 = codice e listino, codice a barre = EAN, codice articolo) con i prezzi del listino migliore: si sceglie l'attrezzo e si salva, e resta collegato. &quot;Nel listino&quot; apre l'articolo collegato. Funzione Supabase `lf_collega()` (cambia solo `articolo_id`; un trigger copia il codice nel `codice_articolo` del Listino Agrimacch se &egrave; vuoto).
- **Carica file** (solo admin): file &#8594; **Dove va** (Nuovo listino o **Sostituisci** uno esistente, proposto da solo se il PO Number corrisponde) &#8594; nome, scadenza, ricarico, foglio, riga, colonne &#8594; anteprima (nuovi, prezzo cambiato, invariati, tolti, scartati) &#8594; conferma. L'app propone foglio (il primo visibile con le intestazioni), riga dei titoli (STIHL OPG riga 19, OPM riga 28), nome (cella accanto a &quot;PO Number&quot;) e colonne (Codice, Descrizione, Listino IVA esclusa, Netto IVA esclusa = Prezzo Promo, Categoria facoltativa); ricorda le colonne del listino. Sostituisci = il file rimpiazza **per intero** i prezzi di quel listino, senza storico (funzione `lf_carica_listino()`, tutto in un colpo). Gli articoli tolti da tutti i listini non si vedono pi&ugrave; ma tengono EAN e collegamento.
- **Codici EAN da un catalogo** (solo admin, per il fornitore scelto): catalogo con codice ed EAN (per STIHL il Superlistino, foglio &quot;Listino GENERALE&quot;, riga 1). Si salvano SOLO gli EAN degli articoli dei listini del fornitore; agli articoli collegati del Listino Agrimacch l'EAN passa nel codice a barre solo se &egrave; vuoto (mai sovrascritto, EAN gi&agrave; usato da un altro articolo = segnalato e non messo). Si carica dopo i listini. Gli articoli non nel catalogo: EAN imparato dalla scatola con il lettore.
- **Codici a barre con lo zero davanti**: in tutta l'app un codice numerico lungo (11-14 cifre) vale uguale con o senza zeri davanti (UPC-A STIHL 886661774678 = EAN-13 0886661774678).
- **Listini e scadenze**: tutti vedono scadenze, numero di articoli e file; l'admin cambia la scadenza, applica un ricarico nuovo, elimina un listino.
- **Carico a raffica**: chi vede Listini Fornitori ha gli EAN riconosciuti da qui (scatola &quot;FORNITORE ... non &egrave; nel tuo listino&quot; e Crea nel listino da qui). Gli altri hanno il normale &quot;Crea nuovo&quot;.
- **Guida rapida**: pulsante &quot;i&quot; accanto al titolo.
- **Permessi** (dal 9/11/2026): admin e operatori vedono i listini, gli avvisi delle scadenze e usano **Collega** / **Crea**; caricamenti, fornitori, scadenze, ricarico, EAN ed eliminazioni solo admin (`LF_RUOLI_VEDERE`, `LF_RUOLI_COLLEGARE`, `LF_RUOLI_CARICARE` in `listini-fornitori-functions.js`; su Supabase `lf_puo_vedere()` / `lf_puo_caricare()`).
- **Dopo la pulizia** ricaricare OPG e OPM con &quot;Sostituisci&quot; e mettere le scadenze (il vecchio listino teneva un solo prezzo per codice e non aveva scadenze).
- **Avvisi scadenze** (v7.3.2): se un listino scade entro 7 giorni o &egrave; scaduto compare un riquadro in **Dashboard** e nel menu **Listini Vendite** (arancione = in scadenza, rosso = scaduto, con fornitore, nome e data); tocca = apre Listini Fornitori, X = nascosto fino al prossimo accesso o a una scadenza nuova. Pallino rosso/arancione sulle card Listini Vendite e Listini Fornitori. Lo vede chi vede Listini Fornitori (per ora l'admin; con l'apertura anche gli operatori). Funzione `lfControllaScadenze()` chiamata da `showDashboard()` e dopo il login.
- **Codice articolo ed EAN su Collega**: vengono scritti nel Listino Agrimacch solo se sono vuoti, mai sovrascritti. Se il codice articolo c'&egrave; ed &egrave; diverso l'app avvisa (forse &egrave; un altro modello) e lo lascia com'&egrave;. **Modello nuovo** del fornitore (codice ed EAN nuovi) = **Crea** un articolo nuovo; il vecchio resta per le macchine in casa (le scatole vecchie si riconoscono ancora) e quando &egrave; finito si sposta tra i cancellati.
- **Filtro &quot;Collegati ma non pi&ugrave; in nessun listino&quot;**: articoli collegati il cui codice &egrave; uscito da tutti i listini del fornitore (fuori produzione).

---

### 8.4 Inventario Macchine (admin e operatori)
Si apre da **Magazzino &rarr; Inventario Macchine** (la sezione sta in Magazzino; gli Ordini Clienti in Vendite). &Egrave; collegato al Listino Agrimacch: ogni macchina fisica &egrave; una riga legata a un articolo del listino (stessa suddivisione: attrezzo, marchio, alimentazione, tipologia, modello, note), senza prezzi.

**Stati (i colori del quadernone)**
| Quadratino | Significato |
|---|---|
| Bianco + nome | Da ordinare (venduta, non ancora ordinata al fornitore) |
| Bianco con l'angolino verde + nome | Ordinata al fornitore per quel cliente (senza nome = in arrivo libera, es. prestagionale) |
| Verde + nome | In casa, assegnata al cliente |
| Verde senza nome | In casa, disponibile alla vendita |
| Verde con la croce | Consegnata |

**Schede**
- **Inventario**: per ogni articolo **venduti nell'anno** (v7.3.3: consegnate dal 1 gennaio + in casa gi&agrave; assegnate a un cliente; le ordinate o da ordinare per un cliente non contano; si azzera ogni 1 gennaio) / disponibili / assegnate / ordinate (in arrivo dal fornitore, per clienti e libere) / da ordinare, stessi filtri del listino, riepilogo in alto con il valore in casa (somma dei netti al carico). Casellina "Solo articoli con pezzi" (mostra anche gli articoli esauriti ma venduti nell'anno).
- **Quaderno**: riproduce il raccoglitore. Divisori per marchio (da PC a destra, da telefono in alto), evidenziatore giallo con attrezzo + marchio, per ogni modello la tabella a quadratini con il nome del cliente. Tocca un quadratino per cambiare stato, cliente, matricola, netto o note; tocca il "+" per aggiungere una riga. La ricerca cerca in tutti i marchi anche per **nome cliente** e **matricola**.
- **Carico Excel**: un file unico per tutti i marchi (colonne del listino + QUANTITA + MATRICOLE + CODICE A BARRE). Si scarica il modello (vuoto oppure gi&agrave; compilato con il listino di un marchio), si scrivono quantit&agrave;, netti e prezzi della conferma d'ordine e si ricarica. Abbinamento MARCHIO + MODELLO + NOTE (se manca la NOTE e c'&egrave; un solo articolo con quel modello viene abbinato a quello). Articolo non in listino = creato (serve l'ATTREZZO); netto 1 diverso = listino aggiornato con scalamento e storico (origine &quot;Carico macchine (Excel)&quot;); prezzi compilati = aggiornati (le celle vuote non cancellano niente); QUANTITA vuota o 0 = solo listino; righe ripetute unite; matricole separate da virgola, punto e virgola o a capo (per 10 macchine uguali: una riga con QUANTITA 10 e le 10 matricole nella stessa cella, oppure 10 righe con QUANTITA 1 e una matricola ciascuna; con QUANTITA vuota si caricano tante macchine quante matricole). Anteprima riga per riga (CARICO / NUOVO / SOLO LISTINO / ERRORE): le righe con errori non vengono caricate. Una sola notifica di riepilogo (campanella + Telegram).
- **Set**: dice di cosa &egrave; fatto ogni set del listino (es. SET BGA110 = BGA110 + AP30 + caricatore). In magazzino si caricano solo i componenti singoli; i set componibili vengono calcolati da soli. L'app propone gli articoli con SET, KIT, CPL o COMPLETA nel nome/note.
- **Movimenti**: registro di carichi, nuove voci, modifiche e cancellazioni (chi e quando).
- **Report**: vendite = macchine **consegnate**, alla **data di consegna**. Filtri: periodo (quest'anno, anno scorso, mese, date a scelta), marchio, attrezzo, ricerca (modello, cliente, matricola, operatore). Raggruppa per marchio, attrezzo, modello, operatore o mese. Per ogni gruppo: pezzi, ricavo (prezzo della riga dell'ordine; per una riga con piu' macchine o un set il prezzo si divide in proporzione ai netti), costo (netto di carico), margine e margine % sul prezzo. Tutti i prezzi (vendita e netti) sono IVA inclusa; casellina &quot;mostra gli importi senza IVA&quot; (attiva di default, scelta ricordata): toglie il 22% sia dal ricavo sia dal costo (il margine % non cambia). Le macchine consegnate senza ordine (segnate a mano) contano nei pezzi e nel costo ma non nel ricavo (&quot;s.p.&quot; = senza prezzo). Dettaglio macchina per macchina; **Scarica Excel** (fogli RIEPILOGO e DETTAGLIO) e **PDF / Stampa** (documento A4 compatto che si apre in una nuova scheda: da l&igrave; si stampa o si salva, senza le scritte del browser in alto e in fondo).
- **Valore**: valore del magazzino macchine **adesso** (macchine in casa, comprese quelle gi&agrave; assegnate a clienti e non consegnate) oppure **a una data** (es. 31/12: le macchine caricate entro quella data e non ancora consegnate quel giorno; le righe cancellate dal quaderno non si possono ricostruire). Valore = netto di carico (se manca, netto 1 del listino); casellina &quot;senza IVA&quot; come nel report. Raggruppa per marchio, attrezzo o modello; filtri; dettaglio; Excel e PDF.

**Carico macchine**: scegli l'articolo, quantit&agrave;, netto (proposto il netto 1) e, se vuoi, le matricole (scritte o lette con la fotocamera da QR/codice a barre). Con la casellina attiva le macchine arrivate vanno **prima ai clienti che le aspettano, a chi ha ordinato per primo** (data dell'ordine cliente, ordinate o da ordinare: non conta da quale ordine al fornitore arrivano), poi alle ordinate senza cliente (prestagionali liberi); l'anteprima "Cosa succede" lo mostra prima di salvare. Se la macchina va a un cliente che era ancora da ordinare, un posto ordinato in piu' non serve: si toglie prima una ordinata senza cliente, altrimenti la ordinata del cliente arrivato per ultimo torna **da ordinare** (l'anteprima e il riepilogo lo dicono). Caricando un set si caricano i suoi componenti. Se l'articolo non c'&egrave; nel listino: "Non c'&egrave; nel listino? Crealo" apre la finestra Nuovo articolo del listino (con netti e prezzi) e poi lo seleziona da solo.

**Carico con il lettore di codici a barre (v6.4.0)**: ogni articolo del listino pu&ograve; avere un **codice a barre per modello** (colonna `codice_barre` di `listino_articoli`, facoltativo, senza doppioni). Il codice non compare nella tabella del listino: si vede e si corregge nella finestra Modifica articolo, e la ricerca lo trova. Il lettore collegato al PC (USB o Bluetooth) funziona come una tastiera: scrive il codice e preme Invio (deve essere impostato con l'Invio finale, di solito lo &egrave; gi&agrave;). Con la finestra **Carico macchine** aperta:
- prima scatola: l'articolo viene scelto da solo, quantit&agrave; 1;
- ogni altra scatola dello stesso modello: quantit&agrave; +1 (massimo 50 per carico);
- scatola di un altro modello: avviso, prima si salva il carico in corso;
- codice non ancora associato: si sceglie l'articolo dall'elenco (oppure lo si crea: il codice &egrave; gi&agrave; scritto nel nuovo articolo) e il codice resta salvato su quell'articolo. Se l'articolo &egrave; gi&agrave; scelto e non ha un codice, l'app chiede se associarlo;
- nel campo matricola un codice che non &egrave; di un modello viene scritto come matricola e il cursore passa alla matricola successiva;
- Invio nella finestra Carico non salva mai: si salva solo con il pulsante **Carica**.
Il lettore viene riconosciuto dalla velocit&agrave; (almeno 4 caratteri, meno di 50 ms l'uno): se un lettore molto lento non viene riconosciuto, il codice scritto nel campo di ricerca funziona comunque premendo Invio.
Nei file Excel (listino e Carico Excel) c'&egrave; la colonna **CODICE A BARRE** (l'ultima): facoltativa, la cella vuota non cancella il codice gi&agrave; salvato, un codice usato per due articoli blocca l'import del listino (e d&agrave; errore sulla riga nel Carico Excel). Nel Carico Excel il codice basta anche da solo per riconoscere l'articolo. Nei codici a barre l'apostrofo vale come trattino e viene salvato come trattino (un lettore impostato con la tastiera americana su un computer italiano scrive 800293'01 invece di 800293-01): il codice si trova con tutte e due le impostazioni del lettore. Il codice a barre non genera notifiche. Configurazione: eseguire una volta `supabase/listino-codice-barre.sql`.

**Carico a raffica (lettore di codici a barre, pi&ugrave; modelli insieme)**: pulsante **&#9889; Carico a raffica** in alto nell'Inventario Macchine (file `macchine-raffica.js`). Si leggono tutte le scatole arrivate una dopo l'altra, anche di modelli diversi, senza scegliere niente: codice del modello (il codice a barre salvato sull'articolo del listino) e matricola, nell'ordine che si vuole.
- **Ordine di lettura**: Automatico (prova sia "prima il modello, poi la matricola" sia "prima la matricola, poi il modello" e tiene quello che lascia meno scatole incomplete) oppure fissato a mano.
- Un codice che non &egrave; di nessun modello &egrave; una **matricola**. Matricole gi&agrave; nel magazzino o gi&agrave; lette vengono scartate con un avviso.
- Lo **stesso codice sconosciuto su pi&ugrave; scatole** &egrave; quasi certamente il codice di un **modello nuovo**: "Scegli modello" + spunta "&egrave; il codice a barre del modello" lo salva sull'articolo del listino e tutte le scatole si riabbinano da sole alle loro matricole.
- Elenco con riepilogo per modello (pezzi, matricole, clienti in attesa) e scatole lette: Cambia/Scegli modello, togli matricola, elimina scatola, **Annulla ultima operazione**, Svuota.
- Le letture restano salvate nel browser (anche chiudendo la finestra o ricaricando la pagina) finch&eacute; non si conferma o si svuota; il pulsante mostra "N letture in sospeso".
- **Conferma carico**: stesso salvataggio del Carico macchine (prima ai clienti in attesa se la casellina &egrave; attiva, il resto disponibili, netto = netto 1 del listino, i set caricano i componenti). Nei movimenti il dettaglio riporta "CARICO A RAFFICA". In caso di errore i modelli gi&agrave; caricati vengono tolti dall'elenco (niente doppi).
- **Carico iniziale** (casellina in alto): per caricare le macchine gi&agrave; fisicamente in magazzino ma non (o solo in parte) nel quaderno. Nessuna assegnazione ai clienti; le matricole gi&agrave; nel quaderno (in casa) non vengono scartate ma confermate; per ogni modello si usano prima le macchine in casa del quaderno (a quelle senza matricola viene aggiunta la matricola letta, movimento MODIFICA "CARICO INIZIALE"), solo le scatole in pi&ugrave; diventano macchine nuove (dettaglio "CARICO INIZIALE"). Il riepilogo mostra per modello: gi&agrave; nel quaderno / matricole aggiunte / nuove / nel quaderno ma non lette (queste restano come sono: si tolgono dalla scheda Correzioni se mancano davvero). Matricole del quaderno di un altro modello o non in casa bloccano la conferma finch&eacute; non si correggono. Si pu&ograve; fare un marchio alla volta.
- **Articolo non nel listino, creato dal carico**: se il codice letto &egrave; l'EAN di un articolo di **Listini Fornitori**, la scatola mostra "STIHL ... non &egrave; nel tuo listino" (nome del fornitore) con **Crea nel listino** (finestra Nuovo articolo gi&agrave; compilata come con Crea; l'articolo resta collegato). Per gli altri marchi **Crea nuovo** (sulla scatola o nel pannello Scegli modello) apre Nuovo articolo con il codice a barre gi&agrave; messo se &egrave; il codice del modello: basta marchio, modello e attrezzo, **netto e prezzi si possono lasciare vuoti** e completare dopo dal Listino Agrimacch. Dopo il salvataggio le scatole di quel modello si sistemano da sole con le loro matricole (`rafDopoSalvataggioListino`, chiamata da `saveListinoEdit`). Gli EAN dei fornitori vengono riconosciuti nel carico solo per chi vede Listini Fornitori.
- **Guida rapida** (pulsante tondo &quot;i&quot; accanto al titolo della finestra): istruzioni passo passo per impostare il lettore, carico vicino al PC, giro con il lettore staccato, scatole in rosso, carico iniziale e cosa fare se qualcosa non va.
- **Codici del lettore** (pulsante nella finestra): foglio con i codici di impostazione del lettore NETUM U820, disegnati dall'app (Code 128) e stampabili: giro di raccolta (Svuota memoria, Modalit&agrave; memoria, Scarica i dati, Modalit&agrave; normale), impostazioni da fare una volta (tastiera italiana, Invio finale, Windows/Mac/Android, memoria automatica, standby 10 minuti), collegamento (chiavetta 2.4G, abbinamento, Bluetooth tastiera) e utili (grilletto/continua, volume, codici in memoria, batteria, ripristino di fabbrica). Con il foglio aperto i codici letti non finiscono nel carico.
- **Memoria del lettore** (lettore U820): si leggono le scatole con il lettore staccato in modalit&agrave; memoria, poi con la finestra aperta si legge "Upload storage data" (pag. 5 del manuale): i codici arrivano tutti di fila. Dopo la conferma si svuota la memoria con "Clear stored barcode" (pag. 6). Traduzione italiana del manuale del lettore: documento "Manuale lettore U820 - traduzione italiana".

**Correzione inventario (v6.4.3, solo admin)**: scheda **Correzioni** dell'Inventario Macchine. Serve a togliere una macchina caricata per errore **come se non fosse mai entrata**: sparisce dal quaderno, dai movimenti e dal valore del magazzino. Si legge col lettore la **matricola** (QR) o il **codice a barre** della scatola (Invio = cerca), oppure si scrive il modello; con il codice del modello compaiono le macchine in casa di quel modello (in cima l'ultima caricata). Si possono togliere solo macchine **in casa, senza cliente e senza ordine**. Prima di togliere c'&egrave; il riepilogo con la conferma (motivo facoltativo). Ogni correzione resta nel **Registro correzioni** (solo admin: quando, chi, macchina, matricola, data di carico, netto, motivo; nel database anche la copia completa della riga e dei movimenti tolti, tabella `macchine_correzioni`). Configurazione: eseguire una volta `supabase/macchine-correzioni.sql`.

**Nuova voce**: serve per riportare il quadernone (e per i casi senza carico): articolo, stato, cliente, quantit&agrave;, matricola. Se l'articolo &egrave; un set crea una riga per ogni componente con lo stesso cliente.

**Nel Listino Agrimacch** (admin e operatori) accanto al modello compare in piccolo &#127968; N (disponibili in casa, pi&ugrave; quelle gi&agrave; assegnate) oppure &#129513; N set componibili.

**Configurazione**: eseguire una volta `supabase/inventario-macchine-setup.sql` (Supabase &rarr; SQL Editor). Dal 2/11/2026 Inventario Macchine e Ordini Clienti sono aperti anche agli **operatori** (stessi permessi dell'admin, tranne Correzioni ed Elimina ordine; i tecnici no): `MACCHINE_PER_OPERATORI = true` in `macchine-functions.js` e su Supabase `supabase/macchine-operatori.sql` (funzione `puo_gestire_macchine()` con `role in ('admin', 'operatore')`).

### 8.5 Ordini Clienti (admin e operatori)
Si apre da **Ordini &rarr; Ordini Clienti**. Sostituisce il blocchetto delle commissioni (niente preventivi: solo ordini).

**Nuovo ordine** (come il modulo cartaceo): data, **operatore** che fa il contratto (proposto chi &egrave; collegato, si pu&ograve; cambiare; compare sulla stampa), Sig./Sig.ra (cliente, obbligatorio), indirizzo, tel/cell, e-mail, C.F., P.IVA, note, pagamento (testo libero). Il numero viene assegnato al salvataggio: progressivo, riparte da 1 ogni anno (es. 12/2026).
- **Articoli dal listino**: per ogni riga scegli **Disponibile** (l'app prende una macchina in casa e la assegna al cliente: nel quaderno diventa verde con il nome) oppure **Da ordinare** (nel quaderno compare il quadratino bianco con il nome). Se in casa non ce ne sono abbastanza l'app lo dice e propone &quot;Da ordinare&quot;. I set assegnano/creano i singoli componenti.
- **Scelta della macchina (matricola)**: sulle righe Disponibile compaiono tutte le macchine libere in casa (matricola, oppure &quot;senza matricola&quot;, e data di carico): spunta quelle che consegni. &Egrave; **obbligatorio**: l'app non sceglie mai da sola, e non salva finch&eacute; le macchine spuntate non sono tante quante la quantit&agrave; (spuntandone di pi&ugrave; la quantit&agrave; sale da sola). Per i set si sceglie ogni componente.
- **Cerca per matricola**: nel campo di ricerca degli articoli si pu&ograve; scrivere anche la matricola (bastano alcune cifre, spazi e trattini non contano): la macchina in casa compare come &quot;MATR. ...&quot; e toccandola entra nell'ordine gi&agrave; scelta. Se la matricola &egrave; gi&agrave; assegnata, ordinata o consegnata l'app lo dice (e a chi). La matricola compare sul PDF sotto l'articolo; se arriva dopo (carico di una macchina ordinata, o modifica nel quaderno) il PDF su Drive viene rifatto da solo.
- **Prezzo proposto**: vendita promo (se c'&egrave; e non &egrave; scaduta), altrimenti vendita no promo, altrimenti prezzo di listino; il prezzo &quot;in scatola&quot; non viene mai usato. Si pu&ograve; sempre cambiare (&egrave; il prezzo totale della riga: quantit&agrave; x prezzo).
- **Bozza dal listino**: nel Listino Agrimacch il carrello &#128722; su ogni articolo lo mette nella **bozza ordine** (toccandolo di nuovo la quantit&agrave; sale). La barra verde in cima al listino mostra la bozza: **Crea l'ordine** apre Ordini Clienti con le macchine gi&agrave; nel nuovo ordine (poi si scrivono i dati del cliente, la firma ecc.), **Svuota** la cancella. La bozza &egrave; legata all'utente: si ritrova anche da un altro dispositivo, e si vede anche in cima agli Ordini Clienti.
- **Riga libera**: accessori, olio, servizi... non tocca il magazzino.
- **Firma per accettazione** delle condizioni di vendita: il cliente firma sullo schermo con il dito o la penna.
- **Sconto sul totale**: campo sotto gli articoli; si scrive in euro (50) o in percentuale (10%). Le righe restano a prezzo pieno: sul PDF e nel dettaglio compaiono Totale articoli, Sconto e TOTALE scontato. Nel report vendite lo sconto viene tolto dal ricavo delle macchine (diviso sulle righe in proporzione al prezzo). Serve una volta lo script `supabase/ordini-sconto.sql` su Supabase.
- **Senza servizio di installazione** (robot e prodotti che il cliente monta da s&eacute;): casellina sotto il totale, spenta di default. Spuntandola compare la dichiarazione (il cliente acquista senza installazione e il venditore non risponde di danni dovuti a un'installazione errata) con una **seconda firma**. Sul PDF (come sulla commissione robot) la dichiarazione e la sua firma stanno dentro il riquadro dell'ordine, sopra Disponibile / Totale; le condizioni di vendita e la loro firma restano sotto, fuori dal riquadro. In elenco questi ordini hanno l'etichetta NO INST. La casellina si pu&ograve; cambiare anche con &quot;Modifica dati cliente / firma&quot;. Serve una volta lo script `supabase/ordini-senza-installazione.sql` su Supabase.

**Elenco ordini**: filtri per anno e stato, ricerca per cliente, numero, modello o matricola. Stato calcolato dalle macchine collegate: Da ordinare &rarr; Ordinato &rarr; In casa &rarr; Consegnato (oppure Annullato).

**Dettaglio ordine** (tocca un ordine):
- **Stampa / PDF**: apre in una nuova scheda il PDF dell'ordine, nello stesso stile dei report (logo, intestazione, tabelle verdi; stessi campi del modulo Agrimacch, con condizioni di vendita e firma): da l&igrave; si stampa o si salva, senza le scritte del browser. Tutti i nuovi documenti generati dall'app usano questo stile.
- **Ordinate al fornitore**: si segnano solo dal libro **Ordini &rarr; Ordini Macchine** (il vecchio pulsante &quot;Ordinato al fornitore&quot; del dettaglio &egrave; stato tolto). Nel dettaglio sotto ogni macchina ordinata compaiono data, iniziali e consegna prevista.
- **Correggi lo stato** (admin e operatori): per ogni macchina si sceglie lo stato giusto tra Da ordinare &harr; Ordinata e In casa &harr; Consegnata (es. &quot;consegnato&quot; premuto per sbaglio &rarr; In casa). Con la spunta &quot;restano ordinate al fornitore&quot; le ordinate riportate da ordinare lasciano una macchina in arrivo libera nello stesso ordine al fornitore (cliente con fretta); senza spunta l'ordine al fornitore non c'era (segnato per sbaglio). Una macchina in casa non torna da ordinare: se caricata per errore si toglie da Correzioni. Ordini con sole righe libere: Consegnato / Non ancora consegnato.
- **In arrivo** (nel modulo dell'ordine): se in casa non c'&egrave; ma c'&egrave; una macchina **ordinata senza cliente** (prestagionale), la riga propone da sola **In arrivo (gi&agrave; ordinata)** e mostra data dell'ordine e consegna prevista: al salvataggio il cliente prende quella macchina (non finisce negli ordini da fare). Se la consegna non va bene si sceglie **Da ordinare**. Sul PDF vale come &quot;Da ordinare&quot;.
- Quando arrivano, il **Carico macchine** (o il Carico Excel) le assegna da solo al cliente dell'ordine.
- **Consegnato al cliente**: le macchine in casa diventano consegnate (croce nel quaderno).
- **Modifica dati cliente / firma / pagamento**: si cambiano anche le **righe**: togliere una riga, cambiare quantit&agrave; (il prezzo segue la quantit&agrave; finch&eacute; non lo cambi a mano), prezzo, descrizione e codice, aggiungere articoli o righe libere. Per cambiare articolo: togli la riga e aggiungi quello giusto. Macchine tolte: prima le da ordinare (spariscono dal quaderno), poi le ordinate (restano ordinate al fornitore senza cliente, in arrivo libere), poi quelle in casa (tornano disponibili); le consegnate non si possono togliere. Macchine aggiunte: in casa (scegli la matricola), in arrivo o da ordinare, come in un ordine nuovo. Cambiando il nome si aggiorna anche nel quaderno. Il PDF su Drive viene rifatto.
- **Annulla ordine**: le macchine in casa tornano disponibili, le righe da ordinare spariscono, quelle gi&agrave; ordinate al fornitore restano ordinate senza cliente. Il numero resta usato (l'ordine si vede barrato, il PDF viene rifatto con la scritta ANNULLATO).
- **Pagamento (acconto e pagato)**: nel modulo dell'ordine (nuovo o "Modifica dati cliente / firma / pagamento") ci sono **Acconto versato** (euro, non pi&ugrave; del totale) e la casellina **Pagato**. Con l'acconto il PDF mostra sotto il TOTALE "Acconto versato" e "DA SALDARE" (totale - acconto). Con Pagato il PDF ha il **timbro PAGATO** (largo 150 px, inclinato) al centro della tabella articoli (immagine `timbro-pagato.png` nella cartella dell'app; se manca, un timbro scritto verde). **Metodo di pagamento** (CONTANTI, CARTA DI CREDITO, BONIFICO, BONIFICO ANTICIPATO, ASSEGNO): quello complessivo e, se c'&egrave; un acconto, quello dell'acconto e del saldo (colonne `metodo_pagamento`, `metodo_acconto`, `metodo_saldo`); nel PDF compaiono nel riquadro Pagamento e sotto &quot;Acconto versato&quot; / &quot;DA SALDARE&quot;. Nei totali del PDF le caselle Disponibile / Da ordinare stanno in basso a sinistra in un'unica cella. Dal dettaglio dell'ordine c'&egrave; anche il pulsante **Segna come pagato / Togli "Pagato"** (il PDF su Drive viene rifatto). Colonne `acconto` e `pagato` di `macchine_ordini`: eseguire una volta `supabase/ordini-pagamento.sql`.
- **Documenti (ordini, report, valore)**: logo grande il doppio (68 px nei report, 88 px negli ordini) e data pi&ugrave; grande.
- **Elimina ordine (solo admin, `ORD_RUOLI_ELIMINA` in `ordini-functions.js`)**: come l'annullo, ma l'ordine sparisce del tutto, il PDF va nel cestino di Drive e vengono tolti anche tutti i movimenti con quel numero d'ordine (funzione Supabase `ordine_elimina_tracce`, script `supabase/ordini-elimina-admin.sql` da eseguire una volta): non resta traccia. Le macchine vere restano (in casa = tornano disponibili, ordinate = restano ordinate senza cliente, consegnate = restano consegnate). Se era l'ultimo dell'anno il numero viene riusato, altrimenti resta un buco nella numerazione (l'app avvisa prima). Gli operatori non vedono il pulsante: possono solo annullare.
- **PDF su Google Drive**: salvato da solo a ogni nuovo ordine (e rifatto dopo modifica o annullo) in `ORDINI CLIENTI / ORDINI CLIENTI <anno>`; le cartelle si creano da sole. Nel dettaglio: Apri / Salva di nuovo / Riprova. Pulsante **Prova Drive** sopra l'elenco (solo admin, come tutti i pulsanti di prova). Configurazione: `GUIDA_ORDINI_DRIVE.md`.

**Configurazione**: eseguire una volta `supabase/ordini-clienti-setup.sql` (dopo quello dell'inventario macchine). I dati aziendali e le condizioni stampate sono in cima a `ordini-functions.js` (ORD_AZIENDA, ORD_CONDIZIONI).

**Pulizia delle prove**: `supabase/pulizia-prove-macchine.sql` svuota quaderno, movimenti e ordini e fa ripartire i numeri (non tocca listino, consumabili, ricambi, utenti). I PDF di prova su Drive si cancellano a mano.

**Prossime fasi**: Telegram (da decidere).

### 8.7 Ordini &rarr; Ordini Fornitore (ex Ordini Macchine; admin e operatori dal 9/11/2026)
Dal 9/11/2026 la card si chiama **Ordini Fornitore** (nel codice resta `ordini-macchine`: file, id della sezione, tabelle `macchine_of_*`; il gruppo Telegram resta &quot;Ordini Macchine&quot;).

Card **Ordini** in dashboard &rarr; **Ordini Macchine**. Sostituisce OneNote per gli ordini delle macchine ai fornitori (OneNote resta per i ricambi). File `ordini-macchine-functions.js`, `ordini-macchine.css`; tabelle `macchine_of_ordini` (un ordine al fornitore: marchio, sezione, data, iniziali, consegna, note) e `macchine_of_sezioni` (sezioni dei marchi), colonna `ordine_fornitore_id` di `macchine_pezzi`. Configurazione: eseguire una volta `supabase/ordini-macchine-setup.sql`. Chi la vede: `ORDINI_RUOLI` in `ordini-macchine-functions.js` (per aprirla agli operatori aggiungere `'operatore'`; su Supabase i permessi sono gi&agrave; quelli dell'inventario macchine).
- **Il libro**: un divisorio per **marchio del listino** con il numero rosso delle macchine da ordinare; in alto &quot;Ordini da fare&quot; con i marchi; **Vai al marchio** per aprire un marchio che non ha ancora ordini. Dentro ogni marchio la pagina **ORDINI NORMALE** e le **sezioni** (prestagionali: OPG, TRATTORINI 2026...).
- **Da ordinare** (ORDINI NORMALE): le macchine DA ORDINARE degli ordini clienti, raggruppate per modello (quantit&agrave;, attrezzo, modello, note, &quot;1x ROSSI (45/2026)&quot;). Un ordine da fare = una riga senza data e iniziali. Si spuntano le righe (con **quante** se ne ordinano meno: vanno a chi ha ordinato per primo) e **Segna come ordinate**: data (oggi), iniziali, sezione (normale o prestagionale), consegna prevista (testo libero), note.
- **Ordini fatti**: un blocco per ogni ordine al fornitore, come su OneNote: righe con quadratino (angolino verde = da arrivare, spunta verde = arrivata, &quot;arrivate 1 su 3&quot;), clienti e righe in arrivo libere, in fondo data + iniziali + consegna. Gli ordini tutti arrivati si nascondono (**Mostra ordini gi&agrave; arrivati**). **modifica** sotto l'ordine: data, iniziali, consegna, note, sezione; nelle sezioni si aggiungono righe; **Elimina questo ordine** (clienti di nuovo da ordinare, righe libere tolte, arrivate come sono).
- **Sezioni** (&#10133; Sezione): nome e note (condizioni). **Nuovo ordine** nella sezione: data, iniziali, consegna (ogni consegna diversa = un ordine diverso) e modelli con quantit&agrave; (solo del marchio). Diventano macchine **ordinate senza cliente** (in arrivo libere, nel quaderno senza nome): il primo ordine cliente di quel modello le prende (riga **In arrivo**). Sezione finita: **Sezione chiusa** (in fondo, in grigio, niente nuovi ordini). Una sezione si elimina solo se vuota.
- **Tocca una riga** di un ordine fatto: elenco delle macchine (cliente, numero d'ordine, stato). Spunta e **Riporta da ordinare / togli**: con cliente torna da ordinare (con la spunta &quot;resta ordinata al fornitore&quot; la macchina resta in arrivo libera per il prossimo cliente), senza cliente la riga si toglie.
- **Arrivo**: si carica come sempre; le macchine arrivate restano legate all'ordine al fornitore (spunta nel libro).
- **Codice articolo** del fornitore: colonna `codice_articolo` di `listino_articoli` (script `supabase/listino-codice-articolo.sql`). Si scrive nel Listino Agrimacch (Modifica articolo, campo &quot;Codice articolo del fornitore&quot;) o nella colonna **CODICE ARTICOLO** dell'Excel del listino (ultima colonna, facoltativa; la cella vuota non cancella il codice salvato). Per gli articoli collegati in Listini Fornitori viene preso da solo (a ogni Collega / Crea). Nel libro compare accanto al modello; se manca c'&egrave; &quot;cod. ?&quot; in arancione. La ricerca del listino lo trova.
- **Pulizia delle prove**: per le prove si usano articoli con marchio **PROVA** e clienti PROVA. Alla fine: in Ordini Clienti &rarr; Elimina ordine per ogni ordine di prova, poi `supabase/pulizia-prove-ordini-macchine.sql` (toglie macchine, movimenti, correzioni, ordini al fornitore, sezioni, storico netti, notifiche e articoli del marchio PROVA; si ferma se c'&egrave; ancora un ordine cliente con articoli PROVA). `supabase/pulizia-prove-macchine.sql` (svuota tutto) ora svuota anche il libro.
- **Guida rapida**: pulsante tondo &quot;i&quot; accanto al titolo.
- **Montata / in scatola** (admin e operatori dal 9/11/2026: `MAC_MONTAGGIO_RUOLI` in `macchine-functions.js`): nel modulo dell'ordine cliente, sotto ogni riga con articolo, i riquadrini **Montata pronta all'uso** / **In scatola** (uno solo dei due, si pu&ograve; lasciare vuoto). Si vede nel dettaglio dell'ordine, nel PDF (sotto l'articolo) e nel libro accanto al cliente. Colonna `montaggio` di `macchine_ordini_righe`: eseguire una volta `supabase/ordini-montaggio.sql`.
- **Report arrivo merce** (stessi ruoli): dopo ogni carico (Carico macchine, a raffica, Excel) si apre &quot;Arrivo merce: cosa fare&quot;: **da montare** (cliente, ordine, macchina, matricola), **da tenere in scatola**, montaggio non indicato, **in casa disponibili** (pezzi e matricole per modello). **Stampa / PDF** per il magazzino. Non si apre con il carico iniziale.
- **Telegram alle 19** (lun-sab, gruppo &quot;Ordini Macchine&quot;, stesso bot del listino): i marchi con macchine da ordinare; niente messaggio se non c'&egrave; nulla. Funzione `supabase/promemoria-ordini-macchine.ts` + script `google/ordini-macchine.gs`; configurazione in `GUIDA_ORDINI_MACCHINE_TELEGRAM.md`.
- **Arrivata al posto di...** (admin e operatori dal 9/11/2026: `MAC_SOSTITUZIONE_RUOLI` in `macchine-functions.js`): nel **Carico macchine** (non a raffica, non Excel, non per i set) la casella &quot;Arrivata al posto di un'altra macchina ordinata&quot; mostra le macchine ordinate o da ordinare di altri modelli dello stesso marchio (ricerca per modello, cliente, numero d'ordine; &quot;tutti i marchi&quot; per allargare). Si spuntano quelle sostituite (al massimo la quantit&agrave; caricata, prendono le prime matricole). Per ognuna: il cliente prende la macchina arrivata (in casa), la vecchia si toglie dal quaderno, la riga dell'ordine cliente passa al nuovo modello (se la riga aveva pi&ugrave; pezzi si divide: una in meno sulla vecchia e una riga nuova con lo stesso prezzo a pezzo e lo stesso montata / in scatola), il PDF su Drive viene rifatto e l'ordine al fornitore passa alla macchina arrivata. Le altre macchine del carico si caricano normalmente. Nei movimenti: &quot;SOSTITUITA&quot; e &quot;ARRIVATA AL POSTO DI&quot;.
- **Righe da ordinare per il magazzino** (v7.5.1): in ORDINI NORMALE &rarr; Da ordinare &rarr; **&#10133; Aggiungi riga**: modello e quantit&agrave; senza cliente = macchine DA_ORDINARE senza cliente (&quot;per il magazzino&quot;, in fondo alla riga dopo i clienti; **togli** le cancella). Si ordinano con Segna come ordinate insieme alle altre e diventano in arrivo libere. Nel quaderno: quadratino bianco &quot;da ordinare&quot;. Al carico non prendono macchine (non sono ancora ordinate).
- **Macchine per il magazzino** (v7.5.0): in ORDINI NORMALE &rarr; **quante** si pu&ograve; scrivere pi&ugrave; delle richieste dei clienti (es. 2 clienti, scrivi 3: la terza arriva libera); nella finestra Segna come ordinate e in **modifica** di qualsiasi ordine si aggiungono altri modelli (in arrivo liberi); **&#10133; Nuovo ordine** anche in ORDINI NORMALE (ordine solo per il magazzino); nella finestra di una riga **Aggiungi a questa riga** N in arrivo libere. Le libere vanno al primo cliente che ordina il modello, altrimenti al carico restano disponibili.
- **Carica Excel nelle sezioni** (v7.5.0, `omXls*` in `ordini-macchine-functions.js`): file del fornitore con le quantit&agrave; per mese di consegna (es. STIHL OPM: foglio OPM, riga dei titoli 28 con &quot;Codice&quot;, mesi Jul-26...Nov-26 sulla riga 25 colonne I-M). L'app trova foglio, riga, codice, descrizione e le colonne dei mesi (data o nome del mese nelle 6 righe sopra i titoli; scarta le colonne in euro e con decimali); si possono correggere. Anteprima per mese; **un ordine per ogni mese con quantit&agrave;**: data = oggi, iniziali di chi carica, consegna = &quot;CONSEGNA SETTEMBRE 2026&quot;, note = &quot;DA EXCEL: nome file&quot;, righe = macchine in arrivo libere. Modello dal **codice articolo** del Listino Agrimacch, poi da Listini Fornitori (articoli collegati); i codici non trovati si scelgono dalla tendina (articoli del marchio) o si saltano, e il codice viene scritto nell'articolo scelto se non ne ha uno (la volta dopo lo riconosce). Ricaricare **aggiunge** ordini (avviso se la sezione ne ha gi&agrave;): per sostituire eliminare prima i vecchi.

### 8.6 Buoni Regalo (admin e operatori)
Si apre da **Ordini &rarr; Buoni Regalo**.
- **&#10133; Nuovo buono**: data di emissione (oggi), operatore (le tue iniziali), **cliente** e **telefono** (obbligatori),
  **intestato a** (chi riceve il regalo; se vuoto si stampa il nome del cliente), **importo**, **scadenza** (di base 1 anno;
  pulsanti 3 mesi / 6 mesi / 1 anno / 2 anni), note (solo sulla copia per il negozio).
- **Numero progressivo** che riparte da 1 ogni anno (2026/1, 2026/2 ... 2027/1), come gli ordini clienti.
- Salvando si apre subito il **PDF del buono**: foglio A4 con il **buono regalo nella met&agrave; superiore** (da tagliare sulla
  linea tratteggiata) e la **copia per il negozio** nella met&agrave; inferiore (dati del cliente, firma, data di utilizzo).
  Grafica (v6.4.1): fascia verde a sinistra con logo, regalo e dati aziendali; nastro rosso con fiocco; a destra titolo,
  numero, importo, intestato a, date, spazio per la dedica scritta a mano, condizioni e timbro. Zone a misura fissa: niente
  si sovrappone; i nomi lunghi diventano pi&ugrave; piccoli. Logo e dati dai Dati aziendali.
- Elenco con riepilogo (buoni da usare, valore da usare, in scadenza entro 30 giorni), ricerca, filtri per stato e anno.
  Stati: Valido, In scadenza, Scaduto, Utilizzato, Annullato.
- Clic su un buono: modifica, **Stampa buono**, **Segna utilizzato** (o "Non ancora utilizzato"), **Annulla buono**
  (il numero resta usato, il PDF esce con la scritta ANNULLATO), **Elimina** (meglio annullare: eliminando resta un buco nella numerazione,
  tranne per l'ultimo dell'anno).
- **PDF su Google Drive** come gli ordini: salvato da solo alla creazione, rifatto dopo modifica / annullo / ripristino,
  nel cestino di Drive se il buono viene eliminato. Cartelle `BUONI REGALO / BUONI REGALO <anno>`. Nella finestra del buono:
  Apri / Salva di nuovo; nell'elenco l'icona &#128193;. Pulsante **Prova Drive** accanto ai filtri.
  Script e funzione SEPARATI da quelli degli ordini: `google/buoni-drive.gs` + Edge Function `buoni-drive`
  (`supabase/buoni-drive.ts`, secrets BUONI_SCRIPT_URL e BUONI_SCRIPT_KEY). Configurazione: `GUIDA_BUONI_DRIVE.md`.
- Configurazione (una volta): Supabase &rarr; SQL Editor &rarr; `supabase/buoni-regalo-setup.sql` &rarr; Run.
  Dal 3/11/2026 li usano admin e operatori: `BUONI_RUOLI` in `app.js` + funzione `buoni_puo_gestire()` (`supabase/buoni-regalo-operatori.sql`).

## 8bis. ASSISTENZA (ex TECNICI) &rarr; INTERVENTI ESTERNI (v6.0.0)

Dalla v6.3.0 la card **Tecnici** si chiama **ASSISTENZA** e contiene: Interventi Esterni (tutti; tecnici in sola lettura),
Richieste interventi robot, Organizzazione interventi robot, Richieste interventi, Richieste tagliandi (vedi 8bis.7).

Percorso: Dashboard &rarr; Assistenza &rarr; Interventi Esterni. Modificano **admin e operatori**; i **tecnici** vedono soltanto.

### 8bis.1 Elenco settimane
- Settimane da luned&igrave; a sabato, divise per mese, dal 2 novembre 2026. In alto si sceglie l'anno.
- "QUESTA SETTIMANA" in evidenza; su ogni settimana il numero di interventi e un pallino rosso se ci sono righe rosse (assenze).

### 8bis.2 Planning della settimana
- **PC**: una tabella per tecnico (GIORNO, ORA, TIPO, ESITO, CLIENTE), 4 righe la mattina e 4 il pomeriggio (separate da una linea tratteggiata). Pulsanti *Settimane*, *Prec.*, *Oggi*, *Succ.*
- **Telefono**: un giorno alla volta (linguette LUN...SAB), parte dal giorno di oggi.
- **Modificare una riga**: toccarla. Ora (testo libero), Tipo (INT / SOP / MONT / **TEL** = telefonare al cliente), Esito (? / NR / OK / NO), Cliente, Colore. **NO** = intervento annullato (riga barrata). *Svuota riga* cancella testo e colore.
- **Colori** (rosso = assente, giallo, verde, blu):
  - una riga: dalla finestra di modifica;
  - pi&ugrave; righe: **Pennello** (scegli il colore e tocca le righe; la X = gomma, toglie il colore);
  - mezza giornata / giornata intera: toccare la casella del giorno (da telefono "Colora").
- **Tecnici**: pulsante *Tecnici* nella settimana. "Tutte le settimane" = compare sempre; altrimenti "In questa settimana" lo aggiunge solo alla settimana aperta. Si pu&ograve; rinominare e disattivare (resta dove ha gi&agrave; interventi). Per eliminarlo del tutto: SQL su Supabase (vedi sotto).
- Le modifiche dei colleghi compaiono da sole (tempo reale).
- **Tecnici (v7.1.0)**: toccando una riga (o, per tutti, l'icona &#128279; di una riga agganciata) si apre la finestra **Richiesta del cliente**
  con data della chiamata, cliente (telefono e paese cliccabili) e note della richiesta. Se la riga non &egrave; agganciata a una richiesta lo dice.
- **Telefonate TEL (v7.1.0)**: riga con tipo TEL = il tecnico deve chiamare il cliente. Il tecnico tocca la riga e sceglie
  **&#9989; Ha risposto (OK)**: scrive cosa si &egrave; detto con il cliente (campo &quot;Cosa ci siamo detti io e il cliente&quot;) e, salvando, arriva **da solo** nel gruppo Telegram il messaggio "Chiamata eseguita";
  oppure **&#128245; Non risponde (NR)**: viene segnata data e ora del tentativo (si pu&ograve; richiamare pi&ugrave; volte, i tentativi restano in elenco).
  Admin e operatori lo fanno dal pulsante *Registra la telefonata* nella finestra della riga. L'esito passa alla richiesta agganciata come per gli altri tipi
  (OK = chiusa). Sulla riga compare &#128172; quando la telefonata &egrave; registrata; nell'Excel di fine anno c'&egrave; la colonna TELEFONATA.
  Le telefonate non hanno promemoria WhatsApp n&eacute; meteo. Serve lo script `supabase/telefonate-setup.sql`.

### 8bis.3 Telegram: pulsante "Invia a Telegram"
- Salvando le righe **non parte nulla**: le modifiche si accumulano e il pulsante &#128232; *Invia a Telegram* diventa azzurro con il numero di modifiche.
- Premendolo (anteprima + conferma) parte **un solo messaggio** nel gruppo "Interventi esterni" (bot @interventiesterni_bot), raggruppato per tecnico: *Interventi aggiunti per...*, *modificati* (ora/tipo/cliente, con prima &rarr; dopo), *riprogrammati* (tolto l'esito NO), *cancellati* (esito NO o riga svuotata). Arriva solo lo stato finale delle righe.
- **Esito "?"** (cliente non ancora chiamato) e **NR** (non risponde, dal 6/11/2026): la riga resta in attesa e parte quando l'esito cambia (es. NR &rarr; OK); se viene svuotata non parte nulla.
- Non generano avvisi: colori, esito OK, giorni passati. Le telefonate TEL chiuse con OK mandano da sole il loro messaggio "Chiamata eseguita".
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
- Script SQL eseguiti su Supabase: `interventi-esterni-setup.sql`, `tecnici-ruolo-setup.sql`, `interventi-telegram-setup.sql`, `assenze-tecnici-setup.sql`, `organizzazione-setup.sql`, `promemoria-setup.sql`; dalla v7.1.0 `telefonate-setup.sql` (telefonate TEL).
- Funzioni Supabase (Verify JWT spento): `notifica-interventi` (file `supabase/notifica-interventi.ts`, v7.1.0 con le telefonate), `organizzazione-interventi` (file `supabase/organizzazione-interventi.ts`, messaggio delle 17) e `assenze-tecnici` (file `supabase/assenze-tecnici.ts`). Ogni volta che cambia il file va reincollato e ripubblicato (Deploy).
- Secrets: `TELEGRAM_BOT_TOKEN_INTERVENTI`, `TELEGRAM_CHAT_ID_INTERVENTI`, `ASSENZE_CHAT_ID`, `ASSENZE_SCRIPT_KEY`, `ASSENZE_WEBHOOK_SECRET`, `ASSENZE_SERVICE_KEY`.
- Il bot @interventiesterni_bot ha il webhook verso `assenze-tecnici`: `getUpdates` non funziona pi&ugrave;; per sapere il chat id di una chat scrivere `/id` al bot.
- Eliminare un tecnico (SQL Editor):
```
delete from public.interventi where tecnico_id = (select id from public.tecnici where nome = 'NOME COGNOME');
delete from public.tecnici where nome = 'NOME COGNOME';
```

---

### 8bis.7 Richieste e Organizzazione interventi robot (v6.3.0)

**Chi le vede (dal 2/11/2026):** Richieste interventi robot = tutti, e tutti le modificano (tecnici compresi);
Organizzazione = solo admin, si apre con il pulsante **&#127758; mappamondo** in alto accanto alla campanella (niente card in Assistenza). Richieste interventi e Richieste tagliandi ("in costruzione") = solo admin.
Si cambia in `app.js` (`SEZIONI_ASSISTENZA_RUOLI`), in `richieste-robot-functions.js` (`RR_RUOLI_MODIFICA`) e su Supabase
(`supabase/richieste-robot-operatori.sql`: admin, operatori e tecnici).

**Richieste interventi robot** (come il foglio Excel "INTERVENTI ROBOT"):
- Tabella con intestazioni bloccate (v7.1.0: la tabella arriva al fondo dello schermo e scorre al suo interno, la riga gialla resta sempre in vista): OP, DATA, COGNOME NOME, INDIRIZZO, TELEFONO, NOTE, TIPO, URG., ESITO. In ordine di data della chiamata: le pi&ugrave; vecchie in alto, le pi&ugrave; recenti in fondo (la tabella si apre gi&agrave; in fondo).
- **&#10133; Nuova richiesta**: OP = iniziali di chi &egrave; collegato, data = oggi (si possono cambiare). Cognome e nome, indirizzo e telefono obbligatori.
  Scrivendo l'indirizzo (meglio via + numero + paese, es. VIA ROMA 5 MIRANO; Invio = cerca subito) compaiono i **suggerimenti**
  (OpenStreetMap: Photon, e Nominatim se Photon non trova nulla). Sceglierne uno compila anche il **paese** e mette la richiesta sulla mappa;
  se OpenStreetMap conosce solo la via, il numero civico scritto viene rimesso dopo la via. Se non trova nulla lo dice: l'indirizzo si pu&ograve; lasciare scritto a mano.
- **Tipo**: dedotto dalle note (inizia con SOPRALLUOGO = SOP, con MONTAGGIO = MONT, con TELEFONARE / RICHIAMARE = TEL, altrimenti INT = assistenza); si pu&ograve; cambiare a mano.
  **TEL** (telefonata, v7.1.0): basta il telefono, via e paese non sono obbligatori; non va sulla mappa ma nel contenitore viola **&#128222; Da telefonare** dell'Organizzazione.
- **Nascondi le OK** (v7.1.0, sempre attiva quando si apre la sezione): le richieste confermate restano salvate ma non si vedono; sotto la ricerca c'&egrave; quante sono nascoste. Togliendo la spunta (o scegliendo il filtro "Confermate (OK)") ricompaiono.
- **Urgenza** Un = da fare entro n giorni lavorativi (U1 = in giornata): non contano sabato, domenica, festivi italiani (Capodanno, Epifania, Pasquetta, 25 aprile, 1 maggio, 2 giugno, Ferragosto, Ognissanti, 8 dicembre, Natale, Santo Stefano) e il **santo patrono (3 ottobre)**. Elenco in `RR_FESTIVI_FISSI` (richieste-robot-functions.js). Sotto si vede la scadenza.
- **Barra in alto** (e numerino rosso sulle card ASSISTENZA): richieste SCADUTE, in scadenza OGGI e DOMANI (solo quelle ancora da organizzare o NR). "Mostra" filtra la tabella.
- **Esito**: vuoto = da organizzare, **-** = organizzato in attesa di conferma, **OK** = confermato, **NR** = non risponde, **NO** = annullato.
- Clic su telefono = chiamata; clic su indirizzo = Google Maps. Clic sulla riga = modifica / elimina.
- **Fine anno (solo admin)**: *PDF anno* scarica il PDF di tutte le richieste dell'anno. *Pulizia fine anno*: crea il PDF (da salvare su Drive),
  poi chiede di scrivere l'anno e cancella dal server SOLO le richieste chiuse (OK e NO). Quelle ancora aperte restano.

**Organizzazione interventi robot**:
- Mappa OpenStreetMap con un pallino per ogni richiesta aperta: **rosso** assistenza, **blu** montaggio, **giallo** sopralluogo
  (colore pi&ugrave; intenso = pi&ugrave; urgente: U1, U2, U3, U4, U5+, senza urgenza), **verde** = organizzato (esito ? nel planning),
  **bianco** = non risponde (NR), **bordo nero** = scaduta. Casa = sede, cerchi tratteggiati ogni 10 km. Legenda sotto la mappa
  (con le spunte si nascondono i tipi). Clic sul pallino = scheda con telefono, Google Maps e Modifica.
- Sotto: contenitori per distanza in linea d'aria dalla sede (0-10, 10-20, 20-30, 30-40, oltre 40 km), divisi per urgenza.
  Organizzati e NR restano ma barrati; OK e NO spariscono. Clic sul cliente = lo mostra sulla mappa.
- "Posizione sconosciuta": indirizzi non trovati, da correggere nella richiesta.
- La sede &egrave; l'indirizzo dei **Dati aziendali**.

**Collegamenti automatici**:
- **Interventi Esterni**: nella finestra della casella, scrivendo il cliente (cognome nome o nome cognome) compaiono le richieste aperte.
  Scegliendone una si compilano "COGNOME NOME - PAESE - TELEFONO" e il tipo, e la casella resta **agganciata** (&#128279;; "Scollega" per toglierla).
  Esito della casella &rarr; richiesta: **?** &rarr; "-" (pallino verde), **NR** &rarr; NR (pallino bianco), **OK** &rarr; OK (sparisce),
  **NO** o casella svuotata &rarr; esito vuoto (torna da organizzare). Una richiesta messa a NO a mano sparisce dalla mappa.
  Lo fa Supabase (trigger), quindi vale anche per gli operatori. "Archivia anno" del planning non riapre le richieste gi&agrave; OK.
- Nel planning (PC, telefono e riquadro Promemoria) **telefono e paese sono link** per tutti, tecnici compresi: chiamata e Google Maps
  (indirizzo completo se la casella &egrave; agganciata; se manca il paese compare &#128205;).
- Planning: nei giorni di **festa** (festivi italiani e santo patrono, 3 ottobre) le righe sono **rosse di default** con la scritta FESTA
  sul giorno (da telefono: pallino rosso sulla linguetta del giorno). &Egrave; solo l'aspetto: non viene salvato nulla, e una riga colorata a mano tiene il suo colore.
- Riquadro **Promemoria clienti**: "tutti inviati" solo se sono davvero stati inviati tutti; altrimenti dice quanti sono da inviare,
  da confermare (?), NR, senza cellulare e gi&agrave; inviati. Le righe con esito **?** o **NR** non contano come "da inviare".
- **Da telefono**: in alto a destra due pulsanti tondi con il numerino: &#128242; promemoria clienti (apre/chiude il riquadro)
  e &#128232; Invia a Telegram. "Archivia anno" si vede solo da PC.
- **Ordini clienti**: un ordine con un **robot** o un **antizanzare** (categoria/attrezzo del listino o descrizione con ROBOT / ZANZAR)
  e SENZA la spunta "senza servizio di installazione" crea da solo la richiesta di **MONTAGGIO** (note "MONTAGGIO ... - ORDINE anno/numero").
  Modificando l'ordine si aggiornano cliente, indirizzo e telefono; ordine annullato, eliminato o con la spunta "senza installazione" messa dopo:
  la richiesta non ancora organizzata viene tolta (se era gi&agrave; organizzata diventa NO).

**Configurazione (una volta)**: Supabase &rarr; SQL Editor &rarr; incolla `supabase/richieste-robot-setup.sql` &rarr; Run.
Finch&eacute; non &egrave; eseguito il planning funziona come prima (senza suggerimenti n&eacute; aggancio).

---

**Indirizzo e posizione (v6.4.0)**: due campi scritti a mano (niente suggerimenti): **Via e civico** e sotto **Paese**, tutti e due obbligatori (il paese non va ripetuto nella via). L'indirizzo completo (link Google Maps, PDF, fumetto sulla mappa) &egrave; l'unione dei due. Sulla mappa dell'Organizzazione la richiesta va al **centro del paese** (OpenStreetMap trova sempre i paesi; pi&ugrave; richieste nello stesso paese si affiancano); le distanze dalla sede sono calcolate dal paese. Il meteo del planning usa il paese (campo Cliente). Il link dell'indirizzo (tabella, fumetto sulla mappa, planning Interventi esterni) apre **Google Maps con l'indirizzo preciso**: &egrave; un link normale, gratis, senza chiavi. Le richieste vecchie posizionate con l'indirizzo si spostano da sole al centro del paese la prima volta che si apre la sezione. Nessun servizio Google a pagamento.

## 8ter. DATI AZIENDALI (SOLO ADMIN)

Dalla Dashboard, card **Dati aziendali** (la vede solo l'admin). Si compilano ragione sociale, indirizzo, telefono, telefono/WhatsApp, e-mail, partita IVA, codice fiscale, codice univoco (SDI), sito web e il **logo** (PNG consigliato; viene rimpicciolito da solo). Sotto c'&egrave; l'anteprima dell'intestazione. **Salva** e i dati valgono per tutti gli utenti: compaiono nell'intestazione di ordini clienti, report vendite e valore macchine, report consumabili e ricambi, storico netti. Senza logo caricato si usa il logo dell'app.

Configurazione: eseguire una volta `supabase/dati-azienda-setup.sql` (crea la tabella `impostazioni_azienda` con i dati attuali; lettura per tutti, modifica solo admin).

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
- **Aggiornamento automatico (v7.1.0, ogni 2 minuti dalla v7.1.2):** ogni 2 minuti, e ogni volta che si torna sull'app, l'app controlla se su Vercel c'&egrave; una versione nuova (il numero vX.Y.Z di `index.html`, cambiato da `./update-version.sh`). Se l'app era in secondo piano o si sta riaprendo, si ricarica da sola (sezione e scheda restano); se si sta lavorando (finestra aperta o campo in scrittura) compare in alto la barra blu *&Egrave; disponibile la versione... Aggiorna ora*. Funziona solo se la versione &egrave; stata cambiata con `./update-version.sh` prima di `./push-all.sh`.
- **Documenti PDF (tutti nello stesso stile):** ordini clienti, report vendite e valore macchine, report consumabili e ricambi, storico netti del listino. Il PDF si apre in una nuova scheda con in alto il nome del file, **Scarica PDF** (salva il file con il nome giusto, es. &quot;ORDINE 0012-2026 ROSSI MARIO.pdf&quot;, &quot;REPORT RICAMBI NGK.pdf&quot;) e **Stampa**. Su iPhone/iPad ci sono &quot;Scarica PDF&quot; e &quot;Apri il PDF&quot; (da l&igrave; si stampa o si condivide). Niente scritte del browser in alto e in fondo alla pagina. Il fax non compare in nessuna intestazione.

---

## 11. MANUTENZIONE: FILE E COMANDI DA TERMINALE

### 11.1 File principali (cartella `magazzino-app`)
| File | Contenuto |
|------|-----------|
| `index.html` | Struttura delle pagine, dashboard, sezioni, finestre |
| `style.css` | Stili e adattamento mobile |
| `app.js` | Login, navigazione, consumabili, scanner, utenti, pop-up novit&agrave; |
| `ricambi-functions.js` | Tutta la logica dei ricambi stock |
| `listino-functions.js`, `listino.css` | Listino Agrimacch e notifiche (campanella) |
| `fornitori-functions.js`, `fornitori.css` | Cataloghi Fornitori (cartelle Google Drive; ex Listini Fornitori) |
| `daltonici.css` | Colori per daltonici (body.daltonici), caricato per ultimo |
| `listini-fornitori-functions.js`, `listini-fornitori.css` | Listini Vendite &rarr; Listini Fornitori (pi&ugrave; fornitori e listini con scadenza, EAN, Collega/Crea) |
| `supabase/listini-fornitori-setup.sql` | Tabelle lf_*, permessi, lf_collega, lf_carica_listino, copia dal vecchio Listino STIHL |
| `supabase/pulizia-vecchio-listino-stihl.sql` | Ricopia gli ultimi collegamenti/EAN e cancella le tabelle e funzioni del vecchio Listino STIHL |
| `interventi-functions.js`, `interventi.css` | Assistenza &rarr; Interventi Esterni (planning, Telegram, archivio, aggancio alle richieste robot) |
| `buoni-functions.js`, `buoni.css` | Ordini &rarr; Buoni Regalo (elenco, numerazione per anno, PDF del buono su mezzo A4) |
| `google/buoni-drive.gs`, `supabase/buoni-drive.ts` | PDF dei buoni regalo su Google Drive (script Google + funzione Supabase) |
| `GUIDA_BUONI_DRIVE.md` | Guida di configurazione del salvataggio buoni su Drive |
| `richieste-robot-functions.js`, `richieste.css` | Assistenza &rarr; Richieste e Organizzazione interventi robot (tabella, mappa, contenitori, PDF e pulizia di fine anno) |
| `supabase/richieste-robot-setup.sql` | Tabella richieste_robot, aggancio al planning, trigger degli esiti, richieste dagli ordini |
| `supabase/telefonate-setup.sql` | Telefonate TEL: colonne della chiamata, tipo TEL nelle richieste, funzione `intervento_chiamata` |
| `macchine-functions.js`, `macchine.css` | Magazzino &rarr; Inventario Macchine (inventario, quaderno, carico, carico Excel, set, movimenti, correzioni) |
| `macchine-raffica.js` | Inventario Macchine &rarr; Carico a raffica con il lettore, carico iniziale, foglio Codici del lettore, guida |
| `timbro-pagato.png` | Timbro PAGATO stampato sui PDF degli ordini |
| `macchine-report.js` | Inventario Macchine &rarr; schede Report (vendite) e Valore (magazzino), Excel e PDF |
| `ordini-functions.js`, `ordini.css` | Ordini &rarr; Ordini Clienti (commissioni con firma, stampa, correggi lo stato) |
| `ordini-macchine-functions.js`, `ordini-macchine.css` | Ordini &rarr; Ordini Macchine (libro degli ordini ai fornitori per marchio, sezioni prestagionali) |
| `supabase/ordini-macchine-setup.sql` | Tabelle macchine_of_ordini e macchine_of_sezioni, colonna ordine_fornitore_id dei pezzi |
| `supabase/ordini-montaggio.sql` | Colonna montaggio (montata / in scatola) delle righe degli ordini clienti |
| `supabase/promemoria-ordini-macchine.ts`, `google/ordini-macchine.gs` | Telegram delle 19 con i marchi da ordinare (funzione Supabase + script Google) |
| `GUIDA_ORDINI_MACCHINE_TELEGRAM.md` | Guida di configurazione del promemoria Telegram degli ordini macchine |
| `supabase/listino-codice-articolo.sql` | Colonna codice_articolo del listino |
| `supabase/pulizia-prove-ordini-macchine.sql` | Toglie tutte le prove fatte con il marchio PROVA |
| `supabase/` | Script SQL e codice delle funzioni Supabase (notifica-telegram, listini-drive, notifica-interventi, assenze-tecnici) |
| `google/listini-drive.gs` | Script Google dei listini (si incolla su script.google.com) |
| `google/assenze-calendario.gs` | Script Google delle assenze dei tecnici (account agrimacchricambi) |
| `GUIDA_LISTINI_FORNITORI.md` | Guida di configurazione Drive + script + Supabase |
| `google/ordini-drive.gs`, `supabase/ordini-drive.ts` | PDF degli ordini clienti su Google Drive (script Google + funzione Supabase) |
| `GUIDA_ORDINI_DRIVE.md` | Guida di configurazione del salvataggio ordini su Drive |
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
Cambia il numero vX.Y.Z e il `?v=` dei file. Va fatto **prima** di `./push-all.sh`: serve per far arrivare la versione nuova ai telefoni (aggiornamento automatico, vedi sezione 10) e, se attivo, per il pop-up novit&agrave;.

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
| Non vedo le ultime modifiche | Dalla v7.1.0 l'app si aggiorna da sola: entro 2-3 minuti dal push compare la barra blu "Aggiorna ora" (o si ricarica tornando sull'app). Se non succede: controlla di aver fatto `./update-version.sh` prima di `./push-all.sh`, poi aggiorna la pagina a mano |
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
| Inventario Macchine: &quot;Errore caricamento&quot; | Eseguire `supabase/inventario-macchine-setup.sql` su Supabase |
| Ordini Clienti: &quot;Errore caricamento ordini&quot; | Eseguire `supabase/ordini-clienti-setup.sql` su Supabase |
| PDF ordine non salvato su Drive | Pulsante *Prova Drive* (admin): il messaggio dice cosa manca. Vedi `GUIDA_ORDINI_DRIVE.md` |
| La campanella non si aggiorna da sola | Controlla di aver eseguito `listino-notifiche-setup.sql` (attiva il tempo reale); riaprendo l'app il conteggio si aggiorna comunque |

---

## 15. STORICO MODIFICHE PRINCIPALI

- **v7.5.2 (nov 2026)** - La card Ordini Macchine si chiama **Ordini Fornitore**.
- **v7.5.1 (nov 2026)** - Ordini Macchine: **Aggiungi riga** in Da ordinare (macchine per il magazzino da ordinare insieme alle altre).
- **v7.5.0 (nov 2026)** - Ordini Macchine: macchine in pi&ugrave; per il magazzino (quante oltre le richieste, Nuovo ordine in ORDINI NORMALE, Aggiungi a una riga) e **Carica Excel** nelle sezioni (un ordine per mese di consegna).
- **v7.4.1 (nov 2026)** - **Colori per daltonici** (occhio in alto, per utente). Sessione: niente pi&ugrave; uscite al login quando la rete non &egrave; ancora pronta al ritorno sull'app.
- **v7.4.0 (nov 2026)** - Aperti agli **operatori**: Ordini Macchine, Listini Fornitori (consultazione, Collega/Crea, avvisi scadenze), Montata / in scatola, Arrivata al posto di.
- **v7.3.3 (nov 2026)** - Inventario Macchine: colonna **Venduti** dell'anno solare (consegnate quest'anno + in casa assegnate).
- **v7.3.2 (nov 2026)** - Listini Fornitori: avvisi dei listini in scadenza (7 giorni prima) e scaduti in Dashboard e Listini Vendite, pallino sulle card; avviso su Collega se il codice articolo &egrave; diverso; filtro degli articoli collegati fuori listino.
- **v7.3.1 (nov 2026)** - Tolto il vecchio **Listino STIHL** (card, sezione, file `stihl-functions.js` / `stihl.css`, tabelle `stihl_*` su Supabase): STIHL si gestisce solo da Listini Fornitori. Collegamenti ed EAN tenuti.
- **v7.3.0 (nov 2026)** - Nuova card **Listini Vendite &rarr; Listini Fornitori** (per ora solo admin): pi&ugrave; fornitori, pi&ugrave; listini per fornitore con scadenza (es. STIHL OPG e OPM), stesso codice con i prezzi di ogni listino, sostituzione per intero di un listino con un file nuovo, EAN e collegamenti per codice. Dati copiati dal Listino STIHL, che resta come &quot;vecchio&quot;. La sezione PDF su Drive diventa **Cataloghi Fornitori**.

- **v7.2.0 (nov 2026)** - Menu riordinati: card in ordine alfabetico, Vendite diventa **Listini Vendite** (Listino Vendite rinominato **Listino Agrimacch**), Ordini Clienti e Buoni Regalo spostati in **Ordini**. Nuova card **Ordini &rarr; Ordini Macchine** (solo admin): libro degli ordini ai fornitori per marchio con ORDINI NORMALE e sezioni prestagionali, ordini con data + iniziali e consegna prevista, macchine in arrivo libere prese dagli ordini clienti (&quot;In arrivo&quot;). Nel quaderno le ordinate sono bianche con l'angolino verde. Al carico la macchina va a chi ha ordinato per primo. Ordini clienti: **Correggi lo stato** (admin e operatori).

- **v7.1.1 - v7.1.3 (nov 2026)** - Controllo della versione nuova ogni 2 minuti (prima 5); scritta &quot;Cosa ci siamo detti io e il cliente&quot; nella finestra della telefonata; prove dell'aggiornamento automatico.
- **v7.1.0 (nov 2026)** - Aggiornamento automatico dell'app dopo una pubblicazione. Planning: esito NR non va pi&ugrave; su Telegram (resta in attesa come "?"), finestra con data/cliente/note della richiesta per i tecnici, nuovo tipo **TEL** (telefonata con OK + note e Telegram automatico, o NR con data e ora). Richieste robot: intestazioni davvero bloccate, richieste OK nascoste di default, tipo TEL con contenitore "Da telefonare" nell'Organizzazione.
- **v7.0.0 - v7.0.4 (nov 2026)** - Inventario Macchine: **Carico a raffica** con il lettore (pi&ugrave; modelli insieme, memoria del lettore, carico iniziale, foglio Codici del lettore, guida &quot;i&quot;), articoli creati direttamente dal carico. Nuovo **Listino STIHL** (file OPG/OPM, ricarico 30%, prezzo cliente arrotondato, EAN dal Superlistino, Collega/Crea solo admin, operatori in consultazione). Ordini clienti: **Elimina ordine** (solo admin, senza tracce), **acconto, pagato e metodi di pagamento** con timbro PAGATO nel PDF, logo e data pi&ugrave; grandi nei documenti, tolta la scritta sulla fattura.
- **v6.4.1 - v6.4.3 (nov 2026)** - Mappa spostata in Organizzazione interventi, tasti rapidi, scadenze promo, scheda **Correzioni** dell'Inventario Macchine (solo admin).
- **v6.4.0 (nov 2026)** - Richieste robot: indirizzo a mano, paese obbligatorio, mappa per paese. **Codice a barre per modello** nel Listino Agrimacch (non visibile in tabella, usato da ricerca e carico), colonna CODICE A BARRE negli Excel del listino e del Carico Excel, **carico macchine con il lettore di codici a barre** collegato al PC.
- **v6.3.0 (nov 2026)** - La card Tecnici diventa **ASSISTENZA**. Nuove sezioni **Richieste interventi robot** (tabella come il foglio Excel, urgenze con scadenze, suggerimenti indirizzo, PDF e pulizia di fine anno) e **Organizzazione interventi robot** (mappa OpenStreetMap con pallini colorati, contenitori per distanza e urgenza). Planning agganciato alle richieste (esiti automatici), telefono e paese cliccabili. Ordini di robot/antizanzare con installazione = richiesta di montaggio automatica. Planning: festivi e santo patrono (3 ottobre) in rosso. Aperte agli operatori anche Inventario Macchine e Ordini Clienti.
- **v6.0.0 (ott 2026)** - Nuova sezione **Tecnici &rarr; Interventi Esterni**: planning settimanale (4 righe mattina + 4 pomeriggio per tecnico), colori con pennello, tecnici per settimana, tempo reale; ruolo utente **Tecnico** (sola lettura, solo questa sezione); riepilogo Telegram con il pulsante "Invia a Telegram"; assenze lette da Google Calendar con conferma su Telegram e colorazione automatica; archivio di fine anno in Excel.
- **v4.10.0 (ott 2026)** - Listini Fornitori: PDF su Google Drive letti in automatico dall'app (fornitori, marchi, pi&ugrave; recenti e archivio), guida in app, avvisi Telegram dei file nuovi o aggiornati.
- **v4.9.5 (ott 2026)** - Promemoria ordini: notifiche (app e Telegram) per consumabili sotto soglia o esauriti e ricambi esauriti; filtri che restano dopo carico/scarico; ordinamento per codice articolo; finestre con pulsanti sempre visibili; prezzo "No promo" da mobile; pulsante "Dashboard" accanto a "Torna a Magazzino/Vendite".
- **v4.9.0 (ott 2026)** - Notifiche delle modifiche al listino: campanella in app con avvisi in tempo reale e messaggi Telegram.
- **v4.8.0 (ott 2026)** - Listino Agrimacch completo (import Excel, storico netti, articoli cancellati), aperto anche agli operatori.
- **v4.7.5 (2026)** - Pop-up novit&agrave; non ricompare pi&ugrave; ad ogni login su mobile; passaggio alla nuova chiave pubblicabile Supabase; password non pi&ugrave; salvata nel browser; nuova Dashboard con categorie **Magazzino** e **Vendite**; correzione ripristino scheda Ricambi dopo refresh; spegnimento fotocamera uscendo dallo Scanner.
- **v4.7.0 (gen 2026)** - Aggiornamenti 2026.
- **v4.5.x (dic 2025)** - Aggiornamenti vari, sicurezza e login.
- **v4.3.6 (nov 2025)** - Gestione utenti e pulsanti azioni in griglia.
- **v1.0.0 (gen 2025)** - Prima versione.

Storico completo in `VERSION.md`.