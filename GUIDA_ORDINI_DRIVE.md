# Guida: PDF degli Ordini Clienti su Google Drive

Da fare **una volta sola**, con l'**account Google aziendale** (lo stesso dei listini fornitori). Tempo: circa 15 minuti.

Alla fine:
- ogni ordine cliente salvato nell'app finisce da solo su Google Drive come PDF (stesso aspetto della stampa, con la firma);
- le cartelle si creano da sole: `ORDINI CLIENTI / ORDINI CLIENTI 2026`, poi `ORDINI CLIENTI 2027` al primo ordine del 2027, ecc.;
- se un ordine viene modificato o annullato il PDF viene sostituito; se viene eliminato il PDF va nel cestino di Drive;
- nel dettaglio dell'ordine c'e' il pulsante **Apri** per vederlo su Drive.

Lo script e' **separato** da quello dei listini fornitori: quello dei listini legge soltanto e non viene toccato.

---

## PARTE 0 - Prima di tutto

Su Supabase > **SQL Editor** esegui (anche di nuovo, non fa danni) `supabase/ordini-clienti-setup.sql`: aggiunge le colonne operatore e link di Drive.

---

## PARTE 1 - Script Google

1. Con l'account aziendale apri **script.google.com** e premi **Nuovo progetto**.
2. In alto a sinistra rinomina il progetto **AGRIDESK Ordini**.
3. Nel file `Codice.gs` cancella tutto e incolla **tutto** il contenuto di `google/ordini-drive.gs` (cartella `magazzino-app`).
4. Compila la riga in alto:
   - `CHIAVE_SEGRETA` = una parola segreta **inventata da te**, lunga e senza spazi, **diversa** da quella dei listini (es. `Agrimacch-Ordini-5519-kwp`). **Scrivila da parte**: serve anche su Supabase.
   - `CARTELLA_ID` lasciala vuota: lo script crea da solo la cartella **ORDINI CLIENTI** nel Drive aziendale. (Se preferisci una cartella gia' esistente, ad esempio condivisa con i colleghi, incolla qui il suo ID.)
5. Salva (**Cmd+S**).

### Come sapere se lo script va bene (prova 1)
6. Nel menu a tendina delle funzioni in alto scegli **provaCartella** e premi **Esegui**.
   - La prima volta Google chiede l'autorizzazione: **Rivedi autorizzazioni** > account aziendale > se compare *"Google non ha verificato questa app"*: **Avanzate** > **Vai a AGRIDESK Ordini (non sicuro)** > **Consenti**. E' normale: lo script e' tuo.
   - In basso, nel **Log di esecuzione**, deve comparire `OK - cartella: ORDINI CLIENTI / ORDINI CLIENTI 2026` e il link.
   - Su Drive trovi la cartella **ORDINI CLIENTI** con dentro **ORDINI CLIENTI 2026**.

### Pubblicazione per l'app
7. In alto a destra: **Esegui il deployment** > **Nuovo deployment**.
8. Ingranaggio accanto a *Seleziona tipo* > **App web**.
9. Imposta:
   - Descrizione: `AGRIDESK ordini`
   - **Esegui come: Me** (l'account aziendale)
   - **Chi ha accesso: Chiunque**
10. **Esegui il deployment** e copia l'**URL dell'app web** (finisce con `/exec`).
11. Prova veloce: apri quell'URL nel browser. Deve comparire `{"ok":true,"messaggio":"Script ordini clienti attivo"}`.

> "Chiunque" e' sicuro: senza la chiave segreta lo script risponde solo "Chiave non valida". I PDF restano visibili solo a chi ha accesso alla cartella su Drive.

---

## PARTE 2 - Supabase

1. **Edge Functions** > **Deploy a new function** > **Via Editor**.
2. Nome: **`ordini-drive`** (esatto, con il trattino).
3. Nel file `index.ts` cancella il codice d'esempio e incolla **tutto** `supabase/ordini-drive.ts`. Premi **Deploy**.
4. Nella scheda **Settings** della funzione **spegni "Verify JWT"** e salva (come per listini-drive).
5. **Edge Functions > Secrets**, aggiungi:
   - `ORDINI_SCRIPT_URL` = l'URL dell'app web (Parte 1, punto 10)
   - `ORDINI_SCRIPT_KEY` = la stessa `CHIAVE_SEGRETA` dello script

---

## PARTE 3 - Prova dall'app (prova 2)

1. Con un utente **admin** apri **Vendite > Ordini Clienti**, scheda **Ordini**, e premi **Prova Drive** (in alto a destra dell'elenco; gli operatori non lo vedono).
2. Deve comparire *"Collegamento con Google Drive funzionante"* con il link della cartella.
3. Se compare un errore, il messaggio dice cosa manca:
   - *funzione "ordini-drive" non risponde* = Parte 2, punti 1-3
   - *Mancano i secrets* = Parte 2, punto 5
   - *Chiave non valida* = la chiave su Supabase e nello script non sono uguali
   - *non ha risposto correttamente* = deployment non come App web / accesso non "Chiunque"
4. Crea un ordine di prova: nel dettaglio la riga **PDF su Google Drive** passa da "Salvataggio..." a **Apri**.

---

## Da sapere per il futuro

- Gli ordini creati **prima** di configurare Drive si possono salvare dal dettaglio con **Salva su Drive**.
- Se un giorno cambio lo **script Google**: dopo averlo reincollato vai su *Esegui il deployment > Gestisci deployment* > matita > *Versione: Nuova versione* > *Esegui il deployment*. L'URL resta lo stesso.
- Per far vedere i PDF ai colleghi: su Drive condividi la cartella **ORDINI CLIENTI** (tasto destro > Condividi).
