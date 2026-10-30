GUIDA - ASSENZE TECNICI DA GOOGLE CALENDAR (AGRIMAG v5.1.0)
============================================================

COME FUNZIONA
- Uno script Google (sull'account che vede il calendario condiviso) ogni 2 minuti legge
  gli eventi da oggi ai prossimi 60 giorni e li passa alla funzione Supabase "assenze-tecnici".
- Se trova un evento NUOVO o MODIFICATO che parla di un'assenza di un tecnico, Donny riceve
  su Telegram (bot @interventiesterni_bot) un messaggio con i pulsanti
  la parte di giornata letta dal titolo e i pulsanti "Come proposto" / "Solo mattina" /
  "Solo pomeriggio" / "Giornata intera" / "No". Premendo un pulsante il planning si colora da solo
  (il testo delle righe resta, cambia solo il colore; l'app si aggiorna in tempo reale).
- Dopo le 7:00 arriva il resoconto "ASSENZE DI OGGI" (solo se ci sono assenze, mai la domenica).
- Se un evento viene tolto dal calendario arriva l'avviso; se era gia' colorato
  si puo' togliere il rosso con un pulsante.
- Eventi di persone che NON sono tecnici: ignorati, nessun messaggio.
  Anche "paolo rossi assente" se Paolo Rossi non e' un tecnico (nome uguale a un tecnico
  ma con un altro cognome accanto).
- Nome che hanno due tecnici (es. "paolo assente" con due Paolo) = messaggio
  "DA CONTROLLARE" senza pulsanti.

COME DEVONO ESSERE SCRITTI GLI EVENTI (maiuscole/minuscole non contano)
- Una parola di assenza: assente, assenti, assenza, ferie, malattia, malato, permesso,
  esce, esco, uscita. Senza una di queste parole l'evento viene ignorato.
- Il tecnico: nome e cognome in qualsiasi ordine ("paolo busato", "busato paolo")
  oppure solo nome / solo cognome se nessun altro tecnico dell'app ce l'ha.
  Vale anche per i tecnici aggiunti in futuro dall'app.
- Esempi:
    "alessandro assente" (tutto il giorno)      -> giornata intera rossa
    "paolo busato assente" dalle 14 alle 19     -> pomeriggio rosso
    "paolo esce ore 16" / "esce alle 10.30"     -> ora di pomeriggio = pomeriggio,
                                                   ora di mattina = mattina
    "ferie zanon" dal 6 al 9 (tutto il giorno)  -> tutti i giorni (domenica esclusa)
- Giornata lavorativa 8:00-19:00: MATTINA 8-13, POMERIGGIO 13-19.

------------------------------------------------------------
CONFIGURAZIONE (una volta sola, in quest'ordine)
------------------------------------------------------------

1. SUPABASE - TABELLA
   SQL Editor > New query > incolla supabase/assenze-tecnici-setup.sql > Run.

2. SUPABASE - CHIAVE SEGRETA PER LA FUNZIONE
   Project Settings > API Keys > "Secret keys" > crea una nuova chiave (nome: assenze).
   Copia la chiave (inizia con sb_secret_...).
   Serve perche' la funzione lavora senza login (la chiamano Google e Telegram).
   NON va mai messa nell'app o nello script Google.

3. SUPABASE - SECRETS (Edge Functions > Secrets > Add new secret)
   ASSENZE_SERVICE_KEY     = la chiave sb_secret_... del punto 2
   ASSENZE_SCRIPT_KEY      = una parola segreta inventata, lunga (es. 30 lettere e numeri a caso)
   ASSENZE_WEBHOOK_SECRET  = un'altra parola segreta inventata (solo lettere, numeri, _ e -)
   (TELEGRAM_BOT_TOKEN_INTERVENTI c'e' gia'. ASSENZE_CHAT_ID si mette al punto 6.)

4. SUPABASE - FUNZIONE
   Edge Functions > Deploy a new function > Via Editor > nome: assenze-tecnici
   Incolla supabase/assenze-tecnici.ts > Deploy.
   Nelle impostazioni della funzione: "Verify JWT" SPENTO.

5. TELEGRAM - COLLEGARE I PULSANTI ALLA FUNZIONE (webhook)
   Apri nel browser (tutto su una riga, senza spazi, con i tuoi valori):
   https://api.telegram.org/botTOKEN_DI_INTERVENTIESTERNI_BOT/setWebhook?url=https://uiypndhemhgljceylqzl.supabase.co/functions/v1/assenze-tecnici&secret_token=ASSENZE_WEBHOOK_SECRET
   Deve rispondere: "Webhook was set".
   NOTA: da adesso per questo bot "getUpdates" non funziona piu' (e' normale):
   per sapere il chat id di una chat si usa il comando /id (punto 6).

6. TELEGRAM - CHAT DELLE ASSENZE
   - In privato (consigliato): apri la chat con @interventiesterni_bot e premi AVVIA (/start).
   - Oppure gruppo "ASSENZE TECNICI": aggiungi il bot e scrivi  /id@interventiesterni_bot
   Il bot risponde "Chat id di questa chat: ...". Copia il numero (col meno se c'e')
   e mettilo nel secret ASSENZE_CHAT_ID su Supabase.

7. GOOGLE - SCRIPT
   Sull'account Google che VEDE il calendario condiviso delle assenze:
   script.google.com > Nuovo progetto > nome "AGRIMAG assenze" > incolla google/assenze-calendario.gs
   Compila le righe in alto:
     CALENDARIO_ID = Google Calendar > tre puntini sul calendario condiviso >
                     Impostazioni e condivisione > "Integra calendario" > ID calendario
     CHIAVE        = la stessa parola di ASSENZE_SCRIPT_KEY
   Salva. Esegui "provaCollegamento" (la prima volta: Consenti i permessi).
   Nel registro devono comparire gli eventi del calendario e su Telegram il messaggio di prova.
   Poi esegui "installaAttivatore" (una volta sola; se lo riesegui sostituisce quello vecchio).
   Per trovare l'ID giusto: esegui "elencaCalendari" e copia l'ID del calendario delle assenze.

8. PROVA FINALE
   Crea nel calendario un evento di domani "paolo assente" (tutto il giorno).
   Entro 2 minuti arriva il messaggio: premi un pulsante e controlla il planning.
   Poi cancella l'evento: arriva "ASSENZA TOLTA DAL CALENDARIO" con "Togli il rosso".

------------------------------------------------------------
PROBLEMI
------------------------------------------------------------
- Nello script "Calendario non trovato": ID sbagliato o calendario non condiviso con quell'account.
- "Chiave non valida": CHIAVE nello script diversa da ASSENZE_SCRIPT_KEY.
- I messaggi arrivano ma premendo i pulsanti non succede nulla: rifare il punto 5
  (webhook) controllando che secret_token sia uguale ad ASSENZE_WEBHOOK_SECRET;
  per controllare: https://api.telegram.org/botTOKEN/getWebhookInfo
- "Non autorizzato" premendo un pulsante: il messaggio e' in una chat diversa da ASSENZE_CHAT_ID.
- Primo avvio: arrivano i messaggi di TUTTE le assenze gia' in calendario nei prossimi 60 giorni
  (una volta sola). Rispondi Si'/No a ognuna.
- Se modifichi un evento gia' colorato arriva "ASSENZA MODIFICATA": il rosso vecchio
  resta, se le date sono cambiate toglilo dall'app (pennello gomma).
- Quando si disattivano le chiavi legacy di Supabase questa funzione continua a funzionare
  perche' usa ASSENZE_SERVICE_KEY (chiave nuova).
