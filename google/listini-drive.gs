// ============================================================
// AGRIMAG - Script Google "Listini fornitori" (v4.10.0)
// ------------------------------------------------------------
// Va incollato su script.google.com (account Google AZIENDALE,
// lo stesso che possiede la cartella dei listini).
//
// Fa due cose:
// 1. ELENCO: quando l'app AGRIMAG lo chiede (tramite Supabase),
//    restituisce fornitori, marchi e file della cartella dei listini.
//    Restituisce solo nomi e link: i PDF restano privati su Drive.
// 2. TELEGRAM: ogni 15 minuti controlla se ci sono file nuovi o
//    aggiornati e manda un messaggio al gruppo Telegram.
//
// Struttura attesa su Drive:
//   LISTINI FORNITORI / FORNITORE / file          (fornitore diretto)
//   LISTINI FORNITORI / IMPORTATORE / MARCHIO / file
//
// DA COMPILARE (una volta sola): le 4 righe qui sotto.
// ============================================================

// Id della cartella principale: e' la parte finale del link della cartella
// es. https://drive.google.com/drive/folders/1AbCdEf...  ->  '1AbCdEf...'
const CARTELLA_ID = 'INCOLLA_QUI_ID_CARTELLA';

// Una parola segreta inventata da te (lunga, senza spazi).
// La stessa va messa su Supabase nel secret DRIVE_SCRIPT_KEY.
const CHIAVE_SEGRETA = 'INVENTA_UNA_CHIAVE_LUNGA';

// Gli stessi valori dei secrets su Supabase (bot e gruppo gia' in uso)
const TELEGRAM_BOT_TOKEN = 'INCOLLA_QUI_TOKEN_BOT';
const TELEGRAM_CHAT_ID = 'INCOLLA_QUI_ID_GRUPPO';

// ------------------------------------------------------------
// Da qui in giu' non serve modificare nulla
// ------------------------------------------------------------
const CACHE_SECONDI = 600;          // l'elenco viene ricordato 10 minuti (piu' veloce)
const PROFONDITA_MASSIMA = 4;       // sottocartelle lette dentro ogni marchio (es. ARCHIVIO)
const MINUTI_CONTROLLO = 15;        // ogni quanto cercare file nuovi per Telegram

// ============================================================
// 1. ELENCO PER L'APP
// ============================================================
function doGet(e) {
    const parametri = (e && e.parameter) || {};
    if (!parametri.key || parametri.key !== CHIAVE_SEGRETA) {
        return rispostaJson({ ok: false, errore: 'Chiave non valida' });
    }
    try {
        const cache = CacheService.getScriptCache();
        if (parametri.aggiorna !== '1') {
            const salvato = cache.get('elenco');
            if (salvato) return ContentService.createTextOutput(salvato).setMimeType(ContentService.MimeType.JSON);
        }
        const testo = JSON.stringify(leggiElenco());
        if (testo.length < 95000) cache.put('elenco', testo, CACHE_SECONDI);
        return ContentService.createTextOutput(testo).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
        return rispostaJson({ ok: false, errore: String(err && err.message ? err.message : err) });
    }
}

function rispostaJson(dati) {
    return ContentService.createTextOutput(JSON.stringify(dati)).setMimeType(ContentService.MimeType.JSON);
}

function leggiElenco() {
    const radice = DriveApp.getFolderById(CARTELLA_ID);
    const fornitori = [];

    const cartelle = radice.getFolders();
    while (cartelle.hasNext()) {
        const cartellaFornitore = cartelle.next();
        if (cartellaFornitore.isTrashed()) continue;

        const fornitore = {
            nome: cartellaFornitore.getName(),
            url: cartellaFornitore.getUrl(),
            marchi: []
        };

        // File messi direttamente nella cartella del fornitore (fornitore diretto)
        const fileDiretti = fileDellaCartella(cartellaFornitore);
        if (fileDiretti.length > 0) {
            fornitore.marchi.push({ nome: fornitore.nome, url: fornitore.url, diretto: true, file: fileDiretti });
        }

        // Sottocartelle = marchi (importatore). I file nelle cartelle piu' interne
        // (es. MARCHIO / ARCHIVIO) vengono contati nel marchio.
        const sottocartelle = cartellaFornitore.getFolders();
        while (sottocartelle.hasNext()) {
            const cartellaMarchio = sottocartelle.next();
            if (cartellaMarchio.isTrashed()) continue;
            fornitore.marchi.push({
                nome: cartellaMarchio.getName(),
                url: cartellaMarchio.getUrl(),
                diretto: false,
                file: fileRicorsivi(cartellaMarchio, 1, '')
            });
        }

        fornitori.push(fornitore);
    }

    // File lasciati nella cartella principale (fuori da un fornitore)
    const sparsi = fileDellaCartella(radice);

    return {
        ok: true,
        aggiornato: new Date().toISOString(),
        cartella: { nome: radice.getName(), url: radice.getUrl() },
        fornitori: fornitori,
        fuoriPosto: sparsi
    };
}

function descriviFile(f, percorso) {
    return {
        id: f.getId(),
        nome: f.getName(),
        url: f.getUrl(),
        tipo: f.getMimeType(),
        dimensione: f.getSize(),
        modificato: f.getLastUpdated().toISOString(),
        creato: f.getDateCreated().toISOString(),
        cartella: percorso || ''
    };
}

function fileDellaCartella(cartella) {
    const elenco = [];
    const it = cartella.getFiles();
    while (it.hasNext()) {
        const f = it.next();
        if (f.isTrashed()) continue;
        elenco.push(descriviFile(f, ''));
    }
    return elenco;
}

function fileRicorsivi(cartella, livello, percorso) {
    let elenco = [];
    const it = cartella.getFiles();
    while (it.hasNext()) {
        const f = it.next();
        if (f.isTrashed()) continue;
        elenco.push(descriviFile(f, percorso));
    }
    if (livello < PROFONDITA_MASSIMA) {
        const sotto = cartella.getFolders();
        while (sotto.hasNext()) {
            const c = sotto.next();
            if (c.isTrashed()) continue;
            elenco = elenco.concat(fileRicorsivi(c, livello + 1, (percorso ? percorso + ' / ' : '') + c.getName()));
        }
    }
    return elenco;
}

// ============================================================
// 2. AVVISI TELEGRAM (file nuovi o aggiornati)
// ============================================================
// Viene eseguita in automatico ogni 15 minuti (vedi installaControllo).
// Confronta le date dei file con quella dell'ultimo controllo.
function controllaNuoviFile() {
    const proprieta = PropertiesService.getScriptProperties();
    const adesso = new Date();
    const ultimo = proprieta.getProperty('ULTIMO_CONTROLLO');
    proprieta.setProperty('ULTIMO_CONTROLLO', adesso.toISOString());
    if (!ultimo) return; // primo giro: segna solo l'ora, nessun messaggio

    const daQuando = new Date(ultimo);
    const novita = [];
    const elenco = leggiElenco();

    elenco.fornitori.forEach(function (fornitore) {
        fornitore.marchi.forEach(function (marchio) {
            marchio.file.forEach(function (f) {
                const creato = new Date(f.creato);
                const modificato = new Date(f.modificato);
                let stato = null;
                if (creato > daQuando) stato = 'NUOVO';
                else if (modificato > daQuando) stato = 'AGGIORNATO';
                if (!stato) return;
                novita.push({
                    stato: stato,
                    percorso: marchio.diretto ? fornitore.nome : fornitore.nome + ' \u203A ' + marchio.nome,
                    nome: f.nome,
                    url: f.url
                });
            });
        });
    });

    if (novita.length === 0) return;
    CacheService.getScriptCache().remove('elenco'); // l'app vedra' subito i file nuovi
    inviaTelegram(testoNovita(novita));
}

function testoNovita(novita) {
    const max = 20;
    let msg = '\uD83D\uDCC2 <b>AGRIMAG - Listini fornitori</b>\n';
    novita.slice(0, max).forEach(function (n) {
        msg += (n.stato === 'NUOVO' ? '\uD83C\uDD95 ' : '\uD83D\uDD04 ') +
            (n.stato === 'NUOVO' ? 'Nuovo: ' : 'Aggiornato: ') +
            esc(n.percorso) + '\n    <a href="' + esc(n.url) + '">' + esc(n.nome) + '</a>\n';
    });
    if (novita.length > max) msg += '<i>... e altri ' + (novita.length - max) + ' file</i>\n';
    return msg;
}

function esc(testo) {
    return String(testo === null || testo === undefined ? '' : testo)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function inviaTelegram(testo) {
    const risposta = UrlFetchApp.fetch('https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage', {
        method: 'post',
        contentType: 'application/json',
        muteHttpExceptions: true,
        payload: JSON.stringify({
            chat_id: TELEGRAM_CHAT_ID,
            text: testo,
            parse_mode: 'HTML',
            disable_web_page_preview: true
        })
    });
    const corpo = risposta.getContentText();
    if (risposta.getResponseCode() !== 200) {
        throw new Error('Telegram ha risposto: ' + corpo);
    }
    return corpo;
}

// ============================================================
// FUNZIONI DA ESEGUIRE A MANO DALL'EDITOR (menu in alto: scegli e premi "Esegui")
// ============================================================

// 1) Controlla che la cartella si legga: il risultato compare nel "Log di esecuzione"
function provaElenco() {
    const elenco = leggiElenco();
    Logger.log('Cartella: ' + elenco.cartella.nome);
    elenco.fornitori.forEach(function (f) {
        Logger.log('- ' + f.nome + ': ' + f.marchi.map(function (m) {
            return m.nome + ' (' + m.file.length + ' file)';
        }).join(', '));
    });
    if (elenco.fuoriPosto.length > 0) Logger.log('File fuori da un fornitore: ' + elenco.fuoriPosto.length);
}

// 2) Manda un messaggio di prova nel gruppo Telegram
function provaTelegram() {
    inviaTelegram('\uD83D\uDCC2 <b>AGRIMAG - Listini fornitori</b>\n\uD83E\uDDEA Messaggio di prova dallo script Google: gli avvisi dei listini funzionano.');
    Logger.log('Messaggio inviato');
}

// 3) Attiva il controllo automatico ogni 15 minuti (eseguire UNA volta)
function installaControllo() {
    ScriptApp.getProjectTriggers().forEach(function (t) {
        if (t.getHandlerFunction() === 'controllaNuoviFile') ScriptApp.deleteTrigger(t);
    });
    ScriptApp.newTrigger('controllaNuoviFile').timeBased().everyMinutes(MINUTI_CONTROLLO).create();
    PropertiesService.getScriptProperties().setProperty('ULTIMO_CONTROLLO', new Date().toISOString());
    Logger.log('Controllo automatico attivato: ogni ' + MINUTI_CONTROLLO + ' minuti');
}
