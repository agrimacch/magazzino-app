ISTRUZIONI PROGETTO AGRIDESK (ex AGRIMAG) - RIEPILOGO v6.3.5 (3 novembre 2026)
Si aggiunge a RIEPILOGO_AGRIDESK_v6.2.0.md: regole, stile documenti, struttura e note tecniche restano quelle.
Regole di sempre: niente emoji dirette (HTML entities), accenti come entities, controllare gli z-index, file completi,
deploy su VERCEL, database Supabase. Se la chat e' collegata al Mac: file scritti direttamente in ~/Desktop/magazzino-app,
riletti prima e ricontrollati dopo (la scrittura a volte arriva vecchia: rifarla con un nome di appoggio nuovo).
Le funzioni Supabase che gia' funzionano NON si toccano: le cose nuove vanno in Edge Function separate.
Dopo ogni modifica: ./update-version.sh (cambia il ?v= dei file, altrimenti Safari del telefono tiene i .js vecchi) e ./push-all.sh.
Prove in locale: start-https-server.sh (https://localhost:8443, dal telefono https://192.168.1.141:8443).

==================================================================
NOVITA' DALLA v6.2.1 ALLA v6.3.5
==================================================================

1. ASSISTENZA (ex card "Tecnici")
- Card Dashboard "Assistenza" (id dashboard-tecnici-card, sezione 'assistenza'; il vecchio nome 'tecnici' viene convertito).
  Dentro: Interventi Esterni, Richieste interventi robot, Richieste interventi (trattori ecc., IN COSTRUZIONE),
  Richieste tagliandi (IN COSTRUZIONE).
- Permessi (app.js SEZIONI_ASSISTENZA_RUOLI):
    richieste-robot       = admin, operatore, tecnico (TUTTI la vedono e la modificano)
    organizzazione-robot  = solo admin (si apre col pulsante mappamondo in alto accanto alla campanella, id org-btn)
    richieste-interventi / richieste-tagliandi = solo admin (in costruzione)
  Modifica richieste: RR_RUOLI_MODIFICA in richieste-robot-functions.js + richieste_robot_puo_modificare() su Supabase
  (supabase/richieste-robot-operatori.sql: admin, operatore, tecnico). ESEGUITO.

2. RICHIESTE INTERVENTI ROBOT (richieste-robot-functions.js, richieste.css, supabase/richieste-robot-setup.sql ESEGUITO)
- Tabella come il foglio Excel "INTERVENTI ROBOT": OP, DATA, COGNOME NOME, INDIRIZZO, TELEFONO, NOTE, TIPO, URG., ESITO.
  Intestazioni bloccate (sticky), ordinata per DATA della chiamata crescente (piu' recenti IN FONDO, si apre gia' in fondo).
- Nuova richiesta: OP = iniziali utente, data = oggi; obbligatori cognome nome, indirizzo, telefono.
  Suggerimenti indirizzo OpenStreetMap: Photon (photon.komoot.io, a volte rifiuta: 1 nuovo tentativo) poi Nominatim;
  numero civico rimesso se OSM conosce solo la via; Invio = cerca subito; messaggi "Cerco / Nessun indirizzo / non raggiungibile".
- Tipo dedotto dalle note (SOPRALLUOGO -> SOP, MONTAGGIO/INSTALLAZIONE -> MONT, altro INT), modificabile.
- Urgenza Un = entro n giorni lavorativi (U1 = in giornata); esclusi sabato, domenica, festivi italiani + Pasquetta e
  SANTO PATRONO 3 ottobre (RR_FESTIVI_FISSI in richieste-robot-functions.js, rrNomeFestivo).
  Barra in alto: SCADUTE / in scadenza OGGI / DOMANI; numerino rosso sulla card Assistenza.
- Esito: vuoto = da organizzare, "-" = organizzato, OK, NR, NO.
- Admin: PDF anno e Pulizia fine anno (PDF, poi cancella SOLO OK e NO).
- Ordini clienti con robot/antizanzare (attrezzo del listino o descrizione con ROBOT/ZANZAR) SENZA "senza installazione"
  = richiesta di MONTAGGIO automatica (RPC richieste_robot_da_ordine dopo salvataggio, modifica e annullo; trigger su eliminazione).

3. ORGANIZZAZIONE INTERVENTI ROBOT (solo admin, pulsante mappamondo)
- Mappa Leaflet: sfondo SATELLITE Esri (con nomi strade/paesi) o Mappa stradale OSM (scelta ricordata), zoom iniziale 12
  (RR_ZOOM_INIZIALE), cerchi gialli ogni 10 km dalla sede (indirizzo Dati aziendali).
- Pallini: rosso INT / blu MONT / giallo SOP, piu' intensi = piu' urgenti; verde = organizzato ("-"), bianco = NR,
  bordo nero = scaduta. Legenda con spunte per nascondere i tipi.
- Contenitori 0-10 / 10-20 / 20-30 / 30-40 / oltre 40 km (linea d'aria) divisi per urgenza; "-" e NR barrati; "Posizione sconosciuta".

4. INTERVENTI ESTERNI (planning)
- Scrivendo il cliente compaiono le richieste robot aperte: scegliendone una la casella si aggancia (interventi.richiesta_id).
  Trigger Supabase: ? -> "-", NR -> NR, OK -> OK, NO/svuotata -> torna da organizzare ("Archivia anno" non riapre gli OK).
- Telefono e paese cliccabili per tutti (chiamata / Google Maps), anche nel riquadro Promemoria.
- Festivi e santo patrono: righe ROSSE di default (solo aspetto, niente salvato) e scritta FESTA sul giorno.
- Promemoria clienti: "tutti inviati" solo se davvero tutti; esito ? e NR non contano come "da inviare".
- Da telefono: in alto due pulsanti tondi col numerino (Promemoria clienti, Invia a Telegram); "Archivia anno" solo da PC.

5. MAGAZZINO / VENDITE
- Inventario Macchine e Ordini Clienti aperti agli OPERATORI (MACCHINE_PER_OPERATORI = true + supabase/macchine-operatori.sql ESEGUITO).
- supabase/pulizia-prove-macchine.sql corretto (DELETE invece di TRUNCATE, per il collegamento con richieste_robot). ESEGUITO.

6. VENDITE > BUONI REGALO (NUOVO, ADMIN E OPERATORI)
- File: buoni-functions.js, buoni.css, supabase/buoni-regalo-setup.sql (ESEGUITO). Permessi: BUONI_RUOLI = ['admin','operatore']
  in app.js + buoni_puo_gestire() su Supabase = admin e operatori (supabase/buoni-regalo-operatori.sql, da eseguire 3/11).
  ATTENZIONE: rieseguire buoni-regalo-setup.sql riporta la funzione a solo admin -> poi rilanciare buoni-regalo-operatori.sql.
- Campi: data emissione, operatore, cliente*, telefono*, intestato a (vuoto = cliente), importo*, scadenza* (pulsanti 3/6/12/24 mesi), note.
  Numero progressivo che riparte da 1 ogni anno (2026/1 ...). Stati: Valido, In scadenza (30 gg), Scaduto, Utilizzato, Annullato.
- PDF: foglio A4, buono nella META' SUPERIORE (da tagliare), copia per il negozio sotto. Grafica v6.3.5: fascia verde a sinistra
  (logo senza sfondo con il puntino della "i" ROSSO - ricolorato al momento, logo.png non cambia -, pacco regalo,
  dati aziendali su righe singole), nastro rosso con fiocco rosso disegnato (SVG), titolo Kalam, importo in NERO
  (1.250,00 col punto delle migliaia), intestato a, date, spazio per la dedica, condizioni, timbro. Zone a misura fissa.
- Google Drive come gli ordini, ma SEPARATO: Edge Function "buoni-drive" (supabase/buoni-drive.ts, Verify JWT spento,
  secrets BUONI_SCRIPT_URL / BUONI_SCRIPT_KEY) + script Google "AGRIDESK Buoni" (google/buoni-drive.gs) -> cartelle
  BUONI REGALO / BUONI REGALO <anno>. Salvato da solo alla creazione, rifatto dopo modifica/annullo/ripristino, cestinato se eliminato.
  Guida: GUIDA_BUONI_DRIVE.md. CONFIGURATO E FUNZIONANTE (3/11).

==================================================================
DA FARE PIU' AVANTI
==================================================================
- Richieste interventi (trattori, trattorini rasaerba...) e Richieste tagliandi: Donny spieghera' come lavorano (foglio Excel, regole).
- Chiavi legacy Supabase: prima lanciare le due "diagnosi" (script assenze e "AGRIMAG organizzazione") e controllare che la
  riga "Chiave di servizio" dica ASSENZE_SERVICE_KEY (sb_secret_...) e ORG_SERVICE_KEY; poi Project Settings > API Keys >
  Legacy API Keys > disattiva; poi provare login, Invia a Telegram, listini fornitori, PDF ordini/buoni su Drive.
- Netlify: doppione ELIMINATO (2/11). La richiesta di nuovi permessi della GitHub App di Vercel (Actions/Workflows) non serve: ignorata.
