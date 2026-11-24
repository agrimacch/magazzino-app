# Guida: PDF dei Rapportini di intervento su Google Drive

Da fare **una volta sola**, con l'**account Google aziendale** (lo stesso degli ordini clienti). Tempo: circa 15 minuti.
E' la stessa procedura degli ordini (GUIDA_ORDINI_DRIVE.md), ma con uno script e una funzione **separati**:
quelli di ordini e buoni non vengono toccati e continuano a funzionare come prima.

Alla fine:
- ogni rapportino salvato nell'app (Magazzino esterno mezzi) finisce da solo su Google Drive come PDF (lo stesso che si stampa, senza il nome del tecnico);
- le cartelle si creano da sole: `RAPPORTINI INTERVENTO / RAPPORTINI INTERVENTO 2026`, poi `RAPPORTINI INTERVENTO 2027` al primo rapportino del 2027, ecc.;
- se un rapportino viene modificato il PDF viene sostituito; se viene eliminato il PDF va nel cestino di Drive;
- nella finestra del rapportino c'e' **Apri** per vederlo su Drive; nell'elenco c'e' l'icona della cartella.

---

## PARTE 0 - Prima di tutto

Su Supabase > **SQL Editor** esegui `supabase/mezzi-setup.sql` (se non l'hai gia' fatto): crea le tabelle, comprese le colonne del link di Drive.

---

## PARTE 1 - Script Google

1. Con l'account aziendale apri **script.google.com** e premi **Nuovo progetto**.
2. In alto a sinistra rinomina il progetto **AGRIDESK Rapportini**.
3. Nel file `Codice.gs` cancella tutto e incolla **tutto** il contenuto di `google/rapportini-drive.gs` (cartella `magazzino-app`).
4. Compila la riga in alto:
   - `CHIAVE_SEGRETA` = una parola segreta **inventata da te**, lunga e senza spazi, **diversa** da quelle di listini, ordini e buoni
     (es. `Agrimacch-Rapportini-4821-kpw`). **Scrivila da parte**: serve anche su Supabase.
   - `CARTELLA_ID` lasciala vuota: lo script crea da solo la cartella **RAPPORTINI INTERVENTO** nel Drive aziendale.
     (Se preferisci una cartella gia' esistente, ad esempio condivisa, incolla qui il suo ID.)
5. Salva (**Cmd+S**).

### Prova 1: lo script funziona?
6. Nel menu a tendina delle funzioni in alto scegli **provaCartella** e premi **Esegui**.
   - La prima volta Google chiede l'autorizzazione: **Rivedi autorizzazioni** > account aziendale > se compare
     *"Google non ha verificato questa app"*: **Avanzate** > **Vai a AGRIDESK Rapportini (non sicuro)** > **Consenti**. E' normale: lo script e' tuo.
   - In basso, nel **Log di esecuzione**, deve comparire `OK - cartella: RAPPORTINI INTERVENTO / RAPPORTINI INTERVENTO 2026` e il link.

### Pubblicazione per l'app
7. In alto a destra: **Esegui il deployment** > **Nuovo deployment**.
8. Ingranaggio accanto a *Seleziona tipo* > **App web**.
9. Imposta:
   - Descrizione: `AGRIDESK rapportini`
   - **Esegui come: Me** (l'account aziendale)
   - **Chi ha accesso: Chiunque**
10. **Esegui il deployment** e copia l'**URL dell'app web** (finisce con `/exec`).
11. Prova veloce: apri quell'URL nel browser. Deve comparire `{"ok":true,"messaggio":"Script rapportini intervento attivo"}`.

> "Chiunque" e' sicuro: senza la chiave segreta lo script risponde solo "Chiave non valida".

---

## PARTE 2 - Supabase

1. **Edge Functions** > **Deploy a new function** > **Via Editor**.
2. Nome: **`rapportini-drive`** (esatto, con il trattino).
3. Nel file `index.ts` cancella il codice d'esempio e incolla **tutto** `supabase/rapportini-drive.ts`. Premi **Deploy**.
4. Nelle impostazioni (**Settings**) della funzione **spegni "Verify JWT"** e salva (come per ordini-drive e buoni-drive).
5. **Edge Functions > Secrets**, aggiungi:
   - `RAPPORTINI_SCRIPT_URL` = l'URL dell'app web (Parte 1, punto 10)
   - `RAPPORTINI_SCRIPT_KEY` = la stessa `CHIAVE_SEGRETA` dello script

---

## PARTE 3 - Prova dall'app (prova 2)

1. Apri **Magazzino > Magazzino esterno mezzi > Rapportini** e premi **Prova Drive**.
2. Deve comparire *"Collegamento con Google Drive funzionante"* con il link della cartella.
3. Se compare un errore, il messaggio dice cosa manca:
   - *funzione "rapportini-drive" non risponde* = Parte 2, punti 1-3
   - *Mancano i secrets* = Parte 2, punto 5
   - *Chiave non valida* = la chiave su Supabase e nello script non sono uguali
   - *non ha risposto correttamente* = deployment non come App web / accesso non "Chiunque"
4. I rapportini salvati **prima** di configurare Drive: apri il rapportino e premi **Salva su Drive**.

---

## Da sapere per il futuro

- Se un giorno cambio lo **script Google**: dopo averlo reincollato vai su *Esegui il deployment > Gestisci deployment* > matita >
  *Versione: Nuova versione* > *Esegui il deployment*. L'URL resta lo stesso.
- Per far vedere i PDF ai colleghi: su Drive condividi la cartella **RAPPORTINI INTERVENTO** (tasto destro > Condividi).
- Quando la sezione verra' aperta a operatori e tecnici, la funzione `rapportini-drive` li fara' salvare da sola (controlla `mezzi_puo_gestire()`).
