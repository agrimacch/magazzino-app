GUIDA - BACKUP GIORNALIERO SU GOOGLE DRIVE
==========================================

COSA FA
Ogni notte (dopo le 2) tutti i dati dell'app (tutte le tabelle del database: listino, magazzino,
macchine, ordini, buoni, interventi, richieste...) vengono copiati su Google Drive:

  BACKUP AGRIDESK / 2026-11-18 / articoli.json
                                 listino_articoli.json
                                 macchine_pezzi.json
                                 ...
                                 LEGGIMI.txt   (quante righe ha ogni tabella, eventuali errori)

Restano le ultime 14 cartelle (2 settimane): quelle piu' vecchie vanno da sole nel cestino di Drive.
Le tabelle nuove che aggiungeremo in futuro entrano nel backup da sole.

NON vengono copiati: utenti e password (stanno in Supabase > Authentication) e i file dello Storage.

La cartella BACKUP AGRIDESK e' PRIVATA: non condividerla con nessuno (ci sono i dati dei clienti).

E' un sistema SEPARATO (funzione Supabase e script Google propri): le altre funzioni non vengono toccate.

File: supabase/backup-dati.ts   (funzione Supabase)
      google/backup-drive.gs     (script Google con l'orario)

------------------------------------------------------------
CONFIGURAZIONE (una volta sola, in quest'ordine)
------------------------------------------------------------
1. SUPABASE - SECRET (Edge Functions > Secrets > Add new secret)
   BACKUP_SCRIPT_KEY = una parola segreta NUOVA e lunga (almeno 30 tra lettere e numeri,
                       NON una gia' usata per gli altri script)
   ORG_SERVICE_KEY c'e' gia': non toccarlo.

2. SUPABASE - FUNZIONE
   Edge Functions > Deploy a new function > Via Editor > nome: backup-dati
   Incolla supabase/backup-dati.ts > Deploy. Poi nelle impostazioni della funzione "Verify JWT" SPENTO.

3. GOOGLE - SCRIPT NUOVO (con l'account aziendale)
   script.google.com > Nuovo progetto > nome "AGRIDESK backup"
   Incolla google/backup-drive.gs, scrivi CHIAVE = la stessa parola di BACKUP_SCRIPT_KEY, salva.

4. PROVA
   Esegui "provaBackup" (la prima volta: Consenti i permessi).
   Su Drive compare la cartella BACKUP AGRIDESK / data di oggi con i file .json e LEGGIMI.txt.
   Apri LEGGIMI.txt: ogni tabella con il suo numero di righe, in fondo "0 errori".

5. ATTIVATORE
   Esegui "installaAttivatore" (una volta sola). Da domani il backup si fa da solo ogni notte.

------------------------------------------------------------
SE SERVE RECUPERARE DEI DATI
------------------------------------------------------------
- Ogni file .json e' il contenuto completo di una tabella quel giorno (si apre come testo).
- Per rimettere nel database una riga o una tabella cancellata per errore: scegli la cartella del
  giorno giusto e chiedi a Claude, dicendo quale tabella e cosa recuperare.

------------------------------------------------------------
PROBLEMI
------------------------------------------------------------
- Nessuna cartella nuova: Apps Script > Esecuzioni per vedere gli errori; "provaBackup" lo rifa' subito.
- "Chiave non valida": CHIAVE nello script diversa dal secret BACKUP_SCRIPT_KEY.
- "Manca il secret BACKUP_SCRIPT_KEY": il secret non e' stato creato (punto 1).
- Una tabella con ERRORE nel LEGGIMI: le altre sono salvate lo stesso; manda il messaggio a Claude.
