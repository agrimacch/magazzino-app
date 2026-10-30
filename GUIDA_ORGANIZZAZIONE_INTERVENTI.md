GUIDA - ORGANIZZAZIONE INTERVENTI: PROMEMORIA WHATSAPP + METEO (AGRIMAG v6.1.0)
=================================================================================

E' un sistema SEPARATO: bot, gruppo, funzione Supabase, script Google e secrets propri.
Assenze dal calendario e "Invia a Telegram" del planning NON vengono toccati:
se qui qualcosa non va, il resto continua a funzionare.

COSA FA
- NELL'APP (admin e operatori):
  * riquadro "Promemoria clienti" con gli appuntamenti del giorno lavorativo dopo
    (il sabato: lunedi'): pulsante "Invia promemoria" = si apre WhatsApp con chat e
    messaggio pronti, si preme solo Invia. Poi risulta "inviato" (non si manda doppio).
  * pulsante "Promemoria WhatsApp" anche nella finestra di ogni intervento.
  * cambiando l'ORA di un intervento il segno "inviato" si toglie da solo.
- METEO (tutti gli utenti): su ogni intervento dei prossimi ~9 giorni l'icona del meteo
  della mezza giornata nel paese del cliente; con pioggia il badge e' blu con i mm e il
  giorno ha l'icona della pioggia.
  Mattina 8-13, pomeriggio 13-19. PIOGGIA = almeno 1 mm nella mezza giornata
  (intervento da spostare). Da 0,2 a 1 mm = pioggia debole possibile.
- TELEGRAM, gruppo "Organizzazione interventi" (bot @organizzazioneinterventi_bot),
  ogni giorno dopo le 17 (lun-sab): elenco del giorno lavorativo dopo con
  * avviso "PIOGGIA PREVISTA su N interventi" (da valutare prima del promemoria)
  * per ogni intervento: meteo del suo paese e link "Invia promemoria WhatsApp"
  * gia' inviati, senza cellulare, da confermare (esito ?)

COME SCRIVERE IL CAMPO CLIENTE (per meteo e WhatsApp)
  COGNOME NOME - PAESE - CELLULARE        es.  ROSSI MARIO - MIRA - 3471234567
- Il PAESE: quello dopo il trattino. Se non c'e' il trattino vale l'ultima parola
  prima del telefono ("VANIN MARCO GARDIGIANO - 351..." -> GARDIGIANO).
  Paesi e frazioni vengono cercati su OpenStreetMap una volta sola (zona Veneto).
- Il CELLULARE: 3xx..., anche con spazi o punti, anche con +39. I fissi non vanno su WhatsApp.

IL MESSAGGIO AL CLIENTE
  Buongiorno,
  le ricordiamo l'appuntamento di domani, *martedi' 10 novembre alle ore 8.30*, con un
  nostro tecnico per l'intervento di assistenza.
  Se ha bisogno di spostarlo o annullarlo, la preghiamo di contattarci telefonicamente
  al numero +39 041 5401030.
  La ringraziamo e le porgiamo cordiali saluti.

  *Agrimacch srl*
(INT = l'intervento di assistenza, SOP = il sopralluogo, MONT = il montaggio;
 "14.45/15" -> "tra le ore 14.45 e le 15"; senza ora -> "in mattinata"/"nel pomeriggio")
Il testo e' scritto in DUE file: interventi-functions.js e supabase/organizzazione-interventi.ts.

DA QUALE NUMERO PARTE IL MESSAGGIO
Dal WhatsApp aperto sul dispositivo da cui si tocca il pulsante/link.
Numero aziendale (WhatsApp Business) senza il telefono aziendale:
- PC dell'ufficio: web.whatsapp.com o WhatsApp Desktop collegato al numero aziendale
  (telefono aziendale > WhatsApp Business > Impostazioni > Dispositivi collegati > QR).
- Proprio telefono: app WhatsApp Business collegata come dispositivo al numero aziendale.
  Su iPhone con WhatsApp e WhatsApp Business installati: provare prima quale app si apre.

------------------------------------------------------------
CONFIGURAZIONE (una volta sola, in quest'ordine)
------------------------------------------------------------
1. SUPABASE - TABELLE
   SQL Editor > New query > incolla supabase/organizzazione-setup.sql > Run.

2. TELEGRAM - BOT E GRUPPO
   - Bot @organizzazioneinterventi_bot (gia' creato): token da @BotFather > /mybots > API Token.
   - Gruppo "Organizzazione interventi": aggiungi il bot e scrivi un messaggio.
   - Chat id del gruppo (questo bot NON ha webhook, getUpdates funziona):
     https://api.telegram.org/botTOKEN/getUpdates  -> "chat":{"id":-...
     (se la pagina e' vuota: scrivi /start@organizzazioneinterventi_bot nel gruppo e ricarica)

3. SUPABASE - SECRETS (Edge Functions > Secrets > Add new secret)
   ORG_BOT_TOKEN    = token di @organizzazioneinterventi_bot
   ORG_CHAT_ID      = id del gruppo (numero negativo, col meno)
   ORG_SCRIPT_KEY   = una parola segreta nuova inventata (lettere e numeri)
   ORG_SERVICE_KEY  = la chiave sb_secret_... (puoi crearne una nuova "organizzazione"
                      in Project Settings > API Keys > Secret keys, o riusare la stessa)

4. SUPABASE - FUNZIONE
   Edge Functions > Deploy a new function > Via Editor > nome: organizzazione-interventi
   Incolla supabase/organizzazione-interventi.ts > Deploy. "Verify JWT" SPENTO.

5. GOOGLE - SCRIPT NUOVO (separato da quello delle assenze)
   script.google.com > Nuovo progetto > nome "AGRIMAG organizzazione"
   Incolla google/organizzazione-interventi.gs, scrivi CHIAVE = ORG_SCRIPT_KEY, salva.
   Esegui "diagnosi" (la prima volta: Consenti) -> tutte righe OK + messaggio di prova nel gruppo.
   Esegui "provaPromemoria" -> arriva subito l'elenco di domani.
   Esegui "installaAttivatore" (una volta sola).

6. APP: ricarica forzata (Cmd+Shift+R). Il meteo compare sugli interventi dei prossimi giorni.

------------------------------------------------------------
PROBLEMI
------------------------------------------------------------
- Nessun meteo nell'app: funzione non pubblicata o tabelle mancanti -> script "diagnosi".
- Meteo "paese non trovato": scrivere il paese dopo il trattino (es. "- MIRA");
  le ricerche fallite restano in tabella org_localita (si possono cancellare da Table Editor
  per farle riprovare).
- Gruppo diventato supergruppo: la diagnosi scrive il NUOVO chat id da mettere in ORG_CHAT_ID.
- L'elenco delle 17 non arriva: Apps Script > Esecuzioni per vedere gli errori; "rifaiOggi" lo rimanda.
- Meteo: MET Norway (api.met.no, CC BY 4.0, uso gratuito anche aziendale). Luoghi: OpenStreetMap.
