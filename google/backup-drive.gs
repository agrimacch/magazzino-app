// ============================================================
// AGRIDESK - BACKUP GIORNALIERO SU GOOGLE DRIVE
// ------------------------------------------------------------
// Script Google SEPARATO dagli altri.
// (script.google.com > Nuovo progetto > nome "AGRIDESK backup" > incolla tutto)
// Meglio con l'account aziendale (lo stesso degli altri script).
//
// Ogni notte (dopo le 2) chiede alla funzione Supabase "backup-dati" tutte le
// tabelle dell'app e le salva su Drive:
//   BACKUP AGRIDESK / 2026-11-18 / articoli.json, listino_articoli.json, ...
//   + LEGGIMI.txt con il numero di righe di ogni tabella
// Tiene le ultime 14 cartelle (2 settimane): le piu' vecchie vanno nel cestino di Drive.
// La cartella BACKUP AGRIDESK e' privata: NON condividerla (ci sono i dati dei clienti).
//
// DA COMPILARE: la riga CHIAVE qui sotto (uguale al secret BACKUP_SCRIPT_KEY su Supabase).
// Poi: esegui "provaBackup" (la prima volta Consenti i permessi) e controlla la cartella su Drive,
// infine "installaAttivatore" (una volta sola).
// ============================================================

const FUNZIONE_URL = 'https://uiypndhemhgljceylqzl.supabase.co/functions/v1/backup-dati';
const CHIAVE = 'INCOLLA_QUI_LA_CHIAVE';
// Chiave pubblica dell'app (la stessa di app.js, non e' segreta): Supabase la vuole per far passare la chiamata
const SUPABASE_PUBLISHABLE = 'sb_publishable_OVFwbbEr_x9ElXSwu7tNcQ_5qtiUwjE';
const CARTELLA = 'BACKUP AGRIDESK';
const GIORNI_DA_TENERE = 14;
const ORA_BACKUP = 2;          // dalle 2 di notte
const FUSO = 'Europe/Rome';

// Attivatore: ogni ora controlla se il backup di oggi e' gia' stato fatto
function controlla() {
  const adesso = new Date();
  const oggi = Utilities.formatDate(adesso, FUSO, 'yyyy-MM-dd');
  const ora = Number(Utilities.formatDate(adesso, FUSO, 'H'));
  const props = PropertiesService.getScriptProperties();
  if (ora < ORA_BACKUP || props.getProperty('ultimoBackup') === oggi) return;
  if (faiBackup(oggi)) props.setProperty('ultimoBackup', oggi);
}

function chiama(dati) {
  dati.chiave = CHIAVE;
  const res = UrlFetchApp.fetch(FUNZIONE_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: SUPABASE_PUBLISHABLE },
    payload: JSON.stringify(dati),
    muteHttpExceptions: true
  });
  let j = {};
  try { j = JSON.parse(res.getContentText()); } catch (e) { j = { ok: false, errore: res.getContentText().slice(0, 300) }; }
  if (!j.ok) {
    let msg = j.errore || j.message || j.msg || res.getContentText().slice(0, 200) || 'errore';
    if (res.getResponseCode() === 401 && !j.errore) msg += ' -> controlla "Verify JWT" (spento) e la riga SUPABASE_PUBLISHABLE';
    throw new Error('Funzione Supabase (' + res.getResponseCode() + '): ' + msg);
  }
  return j;
}

function cartellaPrincipale() {
  const it = DriveApp.getFoldersByName(CARTELLA);
  return it.hasNext() ? it.next() : DriveApp.createFolder(CARTELLA);
}

// Fa il backup nella cartella del giorno. Restituisce true se tutto e' andato bene.
function faiBackup(giorno) {
  const principale = cartellaPrincipale();
  // se la cartella di oggi esiste gia' (backup rifatto) la sostituisco
  const vecchie = principale.getFoldersByName(giorno);
  while (vecchie.hasNext()) vecchie.next().setTrashed(true);
  const cartella = principale.createFolder(giorno);
  const righeLog = ['BACKUP AGRIDESK del ' + giorno + ' (fatto alle ' + Utilities.formatDate(new Date(), FUSO, 'HH:mm') + ')', ''];
  let errori = 0;
  let tabelle = [];
  try {
    tabelle = chiama({ azione: 'tabelle' }).tabelle || [];
  } catch (e) {
    righeLog.push('ERRORE elenco tabelle: ' + e.message);
    cartella.createFile('LEGGIMI.txt', righeLog.join('\n'), MimeType.PLAIN_TEXT);
    console.log(righeLog.join('\n'));
    return false;
  }
  tabelle.forEach(function (t) {
    try {
      let righe = [];
      for (let da = 0; ; ) {
        const b = chiama({ azione: 'blocco', nome: t.nome, ordine: t.ordine, da: da });
        righe = righe.concat(b.righe || []);
        if (b.finito || !(b.righe || []).length) break;
        da += b.righe.length;
      }
      cartella.createFile(t.nome + '.json', JSON.stringify(righe), MimeType.PLAIN_TEXT);
      righeLog.push(t.nome + ': ' + righe.length + ' righe');
    } catch (e) {
      errori++;
      righeLog.push(t.nome + ': ERRORE ' + e.message);
    }
  });
  righeLog.push('', tabelle.length + ' tabelle, ' + errori + ' errori.');
  righeLog.push('Per recuperare dei dati: aprire il file .json della tabella (testo) oppure chiedere a Claude di rimetterli nel database.');
  cartella.createFile('LEGGIMI.txt', righeLog.join('\n'), MimeType.PLAIN_TEXT);
  pulisci(principale);
  console.log(righeLog.join('\n'));
  return errori === 0;
}

// Tiene solo le ultime GIORNI_DA_TENERE cartelle (nome AAAA-MM-GG): le altre nel cestino
function pulisci(principale) {
  const nomi = [];
  const it = principale.getFolders();
  const cartelle = {};
  while (it.hasNext()) {
    const f = it.next();
    if (/^\d{4}-\d{2}-\d{2}$/.test(f.getName())) { nomi.push(f.getName()); cartelle[f.getName()] = f; }
  }
  nomi.sort().reverse().slice(GIORNI_DA_TENERE).forEach(function (n) { cartelle[n].setTrashed(true); });
}

// ------------------------------------------------------------
// Da eseguire a mano
// ------------------------------------------------------------

// 1. Fa SUBITO un backup (prova): controlla poi la cartella BACKUP AGRIDESK su Drive
function provaBackup() {
  const oggi = Utilities.formatDate(new Date(), FUSO, 'yyyy-MM-dd');
  const ok = faiBackup(oggi);
  if (ok) PropertiesService.getScriptProperties().setProperty('ultimoBackup', oggi);
  console.log(ok ? 'Backup riuscito.' : 'Backup con errori: guarda LEGGIMI.txt nella cartella di oggi.');
}

// 2. Installa l'attivatore ogni ora (se lo riesegui sostituisce quello vecchio)
function installaAttivatore() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'controlla') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('controlla').timeBased().everyHours(1).create();
  console.log('Attivatore installato: un backup al giorno dopo le ' + ORA_BACKUP + ' di notte, tiene ' + GIORNI_DA_TENERE + ' giorni.');
}
