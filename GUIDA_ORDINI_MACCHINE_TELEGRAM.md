GUIDA - PROMEMORIA TELEGRAM ORDINI MACCHINE (alle 19, dal lunedi' al sabato)
============================================================================

COSA FA
Ogni giorno dal lunedi' al sabato, dopo le 19, nel gruppo Telegram "Ordini Macchine"
arriva l'elenco dei MARCHI che hanno macchine da ordinare (le righe "Da ordinare" del
libro Ordini > Ordini Macchine, cioe' senza data e iniziali), es.:

  ORDINI MACCHINE DA FARE - lun 09/11
  - STIHL - 3 macchine (2 modelli)
  - STIGA - 1 macchina
  Totale: 4 macchine da ordinare

Se non c'e' niente da ordinare NON arriva nessun messaggio. La domenica niente.

E' un sistema SEPARATO (funzione Supabase e script Google propri): le altre notifiche
non vengono toccate. Usa lo STESSO BOT delle notifiche del listino.

File: supabase/promemoria-ordini-macchine.ts (funzione Supabase)
      google/ordini-macchine.gs (script Google con l'orario)

------------------------------------------------------------
CONFIGURAZIONE (una volta sola, in quest'ordine)
------------------------------------------------------------
1. TELEGRAM - GRUPPO
   - Crea il gruppo "Ordini Macchine" e aggiungi il bot delle notifiche del listino
     (lo stesso del gruppo "AGRIMACCH VENDITE") e i colleghi.
   - Scrivi un messaggio qualsiasi nel gruppo (serve per trovare il chat id).

2. SUPABASE - SECRETS (Edge Functions > Secrets > Add new secret)
   OM_SCRIPT_KEY  = una parola segreta nuova inventata (lettere e numeri)
                    (facoltativo: se non lo crei vale ORG_SCRIPT_KEY dell'organizzazione interventi)
   OM_CHAT_ID     = lo metti al punto 5 (la diagnosi te lo dice)
   TELEGRAM_BOT_TOKEN e ORG_SERVICE_KEY ci sono gia': non toccarli.

3. SUPABASE - FUNZIONE
   Edge Functions > Deploy a new function > Via Editor > nome: promemoria-ordini-macchine
   Incolla supabase/promemoria-ordini-macchine.ts > Deploy. "Verify JWT" SPENTO.

4. GOOGLE - SCRIPT NUOVO
   script.google.com > Nuovo progetto > nome "AGRIDESK ordini macchine"
   Incolla google/ordini-macchine.gs, scrivi CHIAVE = OM_SCRIPT_KEY (o ORG_SCRIPT_KEY), salva.

5. CHAT ID
   Esegui "diagnosi" (la prima volta: Consenti). Nel registro compare
     gruppo visto dal bot: "Ordini Macchine"  chat id = -100...
   Copia il numero (col meno) nel secret OM_CHAT_ID su Supabase.
   (Se non compare: scrivi di nuovo nel gruppo e riesegui la diagnosi.)

6. PROVA
   Riesegui "diagnosi": tutte righe OK + messaggio di prova nel gruppo.
   Esegui "provaPromemoria": arriva subito l'elenco (se c'e' qualcosa da ordinare).
   Esegui "installaAttivatore" (una volta sola).

------------------------------------------------------------
PROBLEMI
------------------------------------------------------------
- Non arriva niente alle 19: forse non c'e' niente da ordinare (e' giusto cosi').
  Altrimenti Apps Script > Esecuzioni per vedere gli errori; "rifaiOggi" lo rimanda.
- Gruppo diventato supergruppo: la diagnosi scrive il NUOVO chat id da mettere in OM_CHAT_ID.
- "Chiave non valida": CHIAVE nello script diversa dal secret OM_SCRIPT_KEY (o ORG_SCRIPT_KEY).
