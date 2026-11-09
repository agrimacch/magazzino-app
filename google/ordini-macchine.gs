// ============================================================
// AGRIDESK - PROMEMORIA ORDINI MACCHINE (Telegram alle 19)
// ------------------------------------------------------------
// Script Google SEPARATO dagli altri.
// (script.google.com > Nuovo progetto > nome "AGRIDESK ordini macchine" > incolla tutto)
//
// Dal lunedi' al sabato, dopo le 19:00, chiede alla funzione Supabase
// "promemoria-ordini-macchine" di mandare nel gruppo Telegram "Ordini Macchine"
// i marchi che hanno macchine da ordinare. Se non c'e' niente, nessun messaggio.
// La domenica niente.
//
// DA COMPILARE: la riga CHIAVE qui sotto (uguale al secret OM_SCRIPT_KEY;
// se non l'hai creato, la stessa di ORG_SCRIPT_KEY).
// Poi: esegui "diagnosi" (la prima volta Consenti i permessi), poi
// "provaPromemoria" e infine "installaAttivatore" (una volta sola).
// ============================================================

const FUNZIONE_URL = 'https://uiypndhemhgljceylqzl.supabase.co/functions/v1/promemoria-ordini-macchine';
const CHIAVE = 'INCOLLA_QUI_LA_CHIAVE';
const ORA_PROMEMORIA = 19;
const FUSO = 'Europe/Rome';

// Attivatore: ogni 5 minuti controlla se e' ora di mandare il promemoria (una volta al giorno)
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
    console.log(j.inviato ? 'OK: inviato, marchi ' + j.marchi + ', macchine ' + j.macchine : 'OK: ' + (j.nota || 'niente da inviare'));
  }
  (j.riepilogo || []).forEach(function (r) { console.log('  ' + r); });
  return j;
}

// ------------------------------------------------------------
// Da eseguire a mano
// ------------------------------------------------------------

// 1. Controlla secrets, bot, gruppi visti dal bot (con il chat id), database e manda una prova nel gruppo
function diagnosi() {
  chiamaFunzione({ azione: 'diagnosi' });
}

// 2. Manda SUBITO il promemoria (per prova; non cambia l'invio delle 19)
function provaPromemoria() {
  chiamaFunzione({ azione: 'promemoria', oggi: Utilities.formatDate(new Date(), FUSO, 'yyyy-MM-dd') });
}

// 3. Installa l'attivatore ogni 5 minuti (se lo riesegui sostituisce quello vecchio)
function installaAttivatore() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'controlla') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('controlla').timeBased().everyMinutes(5).create();
  console.log('Attivatore installato: controlla ogni 5 minuti (promemoria una volta al giorno dopo le ' + ORA_PROMEMORIA + ', domenica esclusa).');
}

// 4. Per rimandare il promemoria di oggi (es. dopo una prova)
function rifaiOggi() {
  PropertiesService.getScriptProperties().deleteProperty('ultimoPromemoria');
  controlla();
}
