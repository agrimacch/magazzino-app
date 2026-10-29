# Guida: configurare i Listini Fornitori (v4.10.0)

Da fare **una volta sola**, con l'**account Google aziendale**. Tempo: circa 20 minuti.

Alla fine:
- i listini stanno su Google Drive, in una cartella condivisa con i colleghi;
- l'app li mostra da sola nella sezione **Vendite > Listini Fornitori**;
- quando qualcuno carica o aggiorna un file, entro 15 minuti arriva un messaggio nel gruppo Telegram.

Ti servono: il token del bot Telegram (da @BotFather > /mybots > il bot > API Token) e il numero del gruppo (`-5318188950`).

---

## PARTE 1 - Google Drive

1. Con l'account aziendale apri **drive.google.com**.
2. Crea la cartella principale, ad esempio **LISTINI FORNITORI**.
3. Dentro, crea le cartelle dei fornitori:
   - fornitore diretto: `HONDA`, `JOHN DEERE`, ... con dentro i PDF;
   - importatore: `ROSSI SRL`, con dentro una cartella per ogni marchio (`STIHL`, `ECHO`, ...) e i PDF dentro i marchi.
4. Nomi dei PDF: `LISTINO 2026`, `CATALOGO 2026`, eventualmente con una nota dopo l'anno (`LISTINO 2026 RICAMBI`).
5. **Condividi** la cartella principale: tasto destro > **Condividi** > aggiungi le email dei colleghi come **Editor** (cosi' possono caricare e aggiornare i file).
6. Apri la cartella principale e guarda l'indirizzo nel browser:
   `https://drive.google.com/drive/folders/1AbCdEfGh...`
   La parte dopo `folders/` e' l'**ID della cartella**: copiala da parte.

Bastano anche solo 1-2 fornitori per provare: gli altri li aggiungi quando vuoi.

---

## PARTE 2 - Script Google

1. Sempre con l'account aziendale apri **script.google.com** e premi **Nuovo progetto**.
2. In alto a sinistra clicca su *Progetto senza titolo* e rinominalo **AGRIMAG Listini**.
3. Nel file `Codice.gs` cancella tutto e incolla **tutto** il contenuto di `google/listini-drive.gs` (nella cartella `magazzino-app`).
4. Compila le 4 righe in alto, tra gli apici `'...'`:
   - `CARTELLA_ID` = l'ID della cartella (Parte 1, punto 6)
   - `CHIAVE_SEGRETA` = una parola segreta **inventata da te**, lunga e senza spazi (es. `Agrimacch-Listini-8273-xqz`). **Scrivila da parte**: serve anche su Supabase.
   - `TELEGRAM_BOT_TOKEN` = il token del bot
   - `TELEGRAM_CHAT_ID` = `-5318188950`
5. Salva (**Cmd+S**).

### Prove e autorizzazione
6. Nella barra in alto, nel menu a tendina delle funzioni, scegli **provaElenco** e premi **Esegui**.
   - La prima volta Google chiede l'autorizzazione: **Rivedi autorizzazioni** > scegli l'account aziendale.
   - Se compare *"Google non ha verificato questa app"*: **Avanzate** > **Vai a AGRIMAG Listini (non sicuro)** > **Consenti**. E' normale: l'app e' tua e Google non l'ha "certificata".
   - In basso, nel **Log di esecuzione**, devono comparire i tuoi fornitori.
7. Scegli **provaTelegram** > **Esegui**: nel gruppo arriva il messaggio di prova.
8. Scegli **installaControllo** > **Esegui**: attiva il controllo dei file nuovi ogni 15 minuti.

### Pubblicazione per l'app
9. In alto a destra: **Esegui il deployment** > **Nuovo deployment**.
10. Clicca sull'ingranaggio accanto a *Seleziona tipo* > **App web**.
11. Imposta:
    - Descrizione: `AGRIMAG listini`
    - **Esegui come: Me** (l'account aziendale)
    - **Chi ha accesso: Chiunque**
12. **Esegui il deployment** e copia l'**URL dell'app web** (finisce con `/exec`).

> "Chiunque" e' sicuro: senza la chiave segreta lo script risponde solo "Chiave non valida", e anche con la chiave restituisce solo nomi e link. I PDF restano visibili solo a chi ha accesso alla cartella su Drive.
> Se l'opzione **"Chiunque"** non c'e' (alcuni account aziendali la bloccano), fermati e scrivimelo: c'e' una strada alternativa.

---

## PARTE 3 - Supabase

1. **Edge Functions** > **Deploy a new function** > **Via Editor**.
2. Nome: **`listini-drive`** (esatto, con il trattino).
3. Nel file `index.ts` cancella il codice d'esempio e incolla **tutto** `supabase/listini-drive.ts`. Premi **Deploy**.
4. Nella scheda **Settings** della funzione **spegni "Verify JWT"** e salva (come per notifica-telegram).
5. **Edge Functions > Secrets**, aggiungi:
   - `DRIVE_SCRIPT_URL` = l'URL dell'app web (Parte 2, punto 12)
   - `DRIVE_SCRIPT_KEY` = la stessa `CHIAVE_SEGRETA` dello script

---

## PARTE 4 - App

1. Terminale: `./update-version.sh` con versione **4.10.0** (consiglio "s" al pop-up, es. *"Listini fornitori"*).
2. Dopo 1-2 minuti apri **Vendite > Listini Fornitori**: devono comparire le cartelle di Drive.

Se compare un errore, il riquadro rosso dice cosa manca (secrets, deployment, ecc.): mandami una foto.

---

## Da sapere per il futuro

- **Nuovo fornitore** = nuova cartella su Drive. Nell'app non si tocca niente.
- **Nuovo listino** = PDF caricato nella cartella con il nuovo anno (`LISTINO 2027`). Il vecchio va da solo in Archivio.
- **Correggere un PDF** dello stesso anno: su Drive tasto destro > *Informazioni sul file* > *Gestisci versioni* > *Carica nuova versione*.
- Se un giorno cambio lo **script Google**: dopo averlo reincollato vai su *Esegui il deployment > Gestisci deployment* > matita > *Versione: Nuova versione* > *Esegui il deployment*. L'URL resta lo stesso.
- Se cambia il **token del bot** o il **gruppo Telegram**, va aggiornato sia su Supabase sia nelle righe in alto dello script Google.
