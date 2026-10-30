// ============================================================
// AGRIMAG - ORGANIZZAZIONE INTERVENTI (v6.1.0)
// ------------------------------------------------------------
// Script Google SEPARATO da quello delle assenze.
// (script.google.com > Nuovo progetto > nome "AGRIMAG organizzazione" > incolla tutto)
//
// Ogni giorno dopo le 17:00 (dal lunedi' al sabato) chiede alla funzione
// Supabase "organizzazione-interventi" di mandare nel gruppo Telegram
// "Organizzazione interventi" l'elenco del giorno lavorativo dopo con
// meteo, avvisi pioggia e link WhatsApp per i promemoria ai clienti.
//
// DA COMPILARE: la riga CHIAVE qui sotto (uguale al secret ORG_SCRIPT_KEY).
// Poi: esegui "diagnosi" (la prima volta Consenti i permessi), poi
// "provaPromemoria" e infine "installaAttivatore" (una volta sola).
// ============================================================

const FUNZIONE_URL = 'https://uiypndhemhgljceylqzl.supabase.co/functions/v1/organizzazione-interventi';
const CHIAVE = 'INCOLLA_QUI_ORG_SCRIPT_KEY';
const ORA_PROMEMORIA = 17;
const FUSO = 'Europe/Rome';

// Attivatore: ogni 5 minuti controlla se e' ora di mandare l'elenco (una volta al giorno)
function controlla() {
  const adesso = new Date();
  const oggi = Utilities.formatDate(adesso, FUSO, 'yyyy-MM-dd');
  const ora = Number(Utilities.formatDate(adesso, FUSO, 'H'));
  const domenica = Utilities.formatDate(adesso, FUSO, 'u') === '7';
  const props = PropertiesService.getScriptProperties();
  if (domenica || ora < ORA_PROMEMORIA || props.getProperty('ultimoPromemoria') === oggi) return;
  const r = chiamaFunzione({ azione: 'promemoria', oggi: oggi });
  if (r.ok) props.setProperty('ultimoPromemoria', oggi);
}

function chiamaFunzione(dati) {
  dati.chiave = CHIAVE;
  const res = UrlFetchApp.fetch(FUNZIONE_URL, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(dati),
    muteHttpExceptions: true
  });
  let j = {};
  try { j = JSON.parse(res.getContentText()); } catch (e) { j = { ok: false, errore: res.getContentText() }; }
  if (!j.ok) {
    console.log('Errore dalla funzione Supabase (' + res.getResponseCode() + '): ' + (j.errore || res.getContentText()));
  } else if (dati.azione === 'promemoria') {
    console.log('OK: ' + j.giorno + ' - appuntamenti ' + j.appuntamenti + ', promemoria da inviare ' + j.da_inviare +
      ', con pioggia ' + j.pioggia);
  }
  (j.riepilogo || []).forEach(function (r) { console.log('  ' + r); });
  return j;
}

// ------------------------------------------------------------
// Da eseguire a mano
// ------------------------------------------------------------

// 1. Controlla secrets, bot, gruppo, database, luoghi e meteo (manda un messaggio di prova nel gruppo)
function diagnosi() {
  chiamaFunzione({ azione: 'diagnosi' });
}

// 2. Manda SUBITO l'elenco del giorno lavorativo dopo (per prova; non cambia l'invio delle 17)
function provaPromemoria() {
  chiamaFunzione({ azione: 'promemoria', oggi: Utilities.formatDate(new Date(), FUSO, 'yyyy-MM-dd') });
}

// 3. Installa l'attivatore ogni 5 minuti (se lo riesegui sostituisce quello vecchio)
function installaAttivatore() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'controlla') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('controlla').timeBased().everyMinutes(5).create();
  console.log('Attivatore installato: controlla ogni 5 minuti (elenco una volta al giorno dopo le ' + ORA_PROMEMORIA + ').');
}

// 4. Per rimandare l'elenco di oggi con l'attivatore (es. dopo una correzione)
function rifaiOggi() {
  PropertiesService.getScriptProperties().deleteProperty('ultimoPromemoria');
  controlla();
}
