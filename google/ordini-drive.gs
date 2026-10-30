// ============================================================
// AGRIDESK - Script Google "Ordini clienti" (salvataggio PDF)
// ------------------------------------------------------------
// Va incollato su script.google.com (account Google AZIENDALE),
// in un progetto NUOVO e separato da quello dei listini fornitori.
//
// Cosa fa: riceve dall'app (tramite la funzione Supabase "ordini-drive")
// il PDF di un ordine cliente e lo salva su Google Drive:
//
//   ORDINI CLIENTI / ORDINI CLIENTI 2026 / ORDINE 0001-2026 ROSSI MARIO.pdf
//   ORDINI CLIENTI / ORDINI CLIENTI 2027 / ...
//
// Le cartelle si creano da sole: la cartella "ORDINI CLIENTI" (se non c'e')
// e la cartella dell'anno al primo ordine di quell'anno.
// Se un ordine viene modificato o annullato il vecchio PDF va nel cestino
// e viene salvato quello nuovo (il link nell'app si aggiorna da solo).
//
// DA COMPILARE (una volta sola): la riga CHIAVE_SEGRETA qui sotto.
// CARTELLA_ID e' facoltativa.
// ============================================================

// Una parola segreta inventata da te (lunga, senza spazi), DIVERSA da quella dei listini.
// La stessa va messa su Supabase nel secret ORDINI_SCRIPT_KEY.
const CHIAVE_SEGRETA = 'INVENTA_UNA_CHIAVE_LUNGA';

// FACOLTATIVA. Vuota = lo script usa (o crea) la cartella "ORDINI CLIENTI" nel tuo Drive.
// Se vuoi una cartella precisa (es. dentro una cartella condivisa) incolla qui il suo ID:
// e' la parte finale del link https://drive.google.com/drive/folders/1AbCdEf...  ->  '1AbCdEf...'
const CARTELLA_ID = '';

// ------------------------------------------------------------
// Da qui in giu' non serve modificare nulla
// ------------------------------------------------------------
const NOME_CARTELLA = 'ORDINI CLIENTI';

function doPost(e) {
    let dati = {};
    try {
        dati = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    } catch (err) {
        return rispostaJson({ ok: false, errore: 'Richiesta non leggibile' });
    }
    if (!dati.key || dati.key !== CHIAVE_SEGRETA) {
        return rispostaJson({ ok: false, errore: 'Chiave non valida (controlla il secret ORDINI_SCRIPT_KEY su Supabase)' });
    }

    // Una richiesta alla volta: cosi' la cartella dell'anno non viene creata due volte
    const lock = LockService.getScriptLock();
    try {
        lock.waitLock(30000);
        if (dati.azione === 'prova') {
            const cartella = cartellaAnno(dati.anno || new Date().getFullYear());
            return rispostaJson({ ok: true, cartella: NOME_CARTELLA + ' / ' + cartella.getName(), url: cartella.getUrl() });
        }
        if (dati.azione === 'salva') return rispostaJson(salvaPdf(dati));
        if (dati.azione === 'cestina') {
            if (dati.fileId) DriveApp.getFileById(dati.fileId).setTrashed(true);
            return rispostaJson({ ok: true });
        }
        return rispostaJson({ ok: false, errore: 'Azione sconosciuta: ' + dati.azione });
    } catch (err) {
        return rispostaJson({ ok: false, errore: String(err && err.message ? err.message : err) });
    } finally {
        try { lock.releaseLock(); } catch (e2) { /* niente */ }
    }
}

// Aprendo l'indirizzo dello script nel browser si vede se e' attivo
function doGet() {
    return rispostaJson({ ok: true, messaggio: 'Script ordini clienti attivo' });
}

function rispostaJson(dati) {
    return ContentService.createTextOutput(JSON.stringify(dati)).setMimeType(ContentService.MimeType.JSON);
}

function cartellaPrincipale() {
    if (CARTELLA_ID) return DriveApp.getFolderById(CARTELLA_ID);
    const trovate = DriveApp.getRootFolder().getFoldersByName(NOME_CARTELLA);
    while (trovate.hasNext()) {
        const c = trovate.next();
        if (!c.isTrashed()) return c;
    }
    return DriveApp.getRootFolder().createFolder(NOME_CARTELLA);
}

function cartellaAnno(anno) {
    const principale = cartellaPrincipale();
    const nome = NOME_CARTELLA + ' ' + anno;
    const trovate = principale.getFoldersByName(nome);
    while (trovate.hasNext()) {
        const c = trovate.next();
        if (!c.isTrashed()) return c;
    }
    return principale.createFolder(nome);
}

function salvaPdf(dati) {
    if (!dati.pdf || !dati.nome || !dati.anno) return { ok: false, errore: 'Mancano dati del PDF' };
    const cartella = cartellaAnno(dati.anno);

    // Il PDF vecchio dello stesso ordine va nel cestino
    if (dati.fileId) {
        try { DriveApp.getFileById(dati.fileId).setTrashed(true); } catch (e) { /* gia' cancellato */ }
    }
    const uguali = cartella.getFilesByName(dati.nome);
    while (uguali.hasNext()) uguali.next().setTrashed(true);

    const blob = Utilities.newBlob(Utilities.base64Decode(dati.pdf), 'application/pdf', dati.nome);
    const file = cartella.createFile(blob);
    return { ok: true, url: file.getUrl(), fileId: file.getId(), cartella: cartella.getName() };
}

// ============================================================
// PROVA (dall'editor: scegli "provaCartella" e premi Esegui)
// Nel "Log di esecuzione" compare il link della cartella dell'anno:
// se lo vedi, lo script funziona e ha i permessi su Drive.
// ============================================================
function provaCartella() {
    const cartella = cartellaAnno(new Date().getFullYear());
    Logger.log('OK - cartella: ' + NOME_CARTELLA + ' / ' + cartella.getName());
    Logger.log('Link: ' + cartella.getUrl());
}
