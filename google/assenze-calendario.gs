// ============================================================
// AGRIMAG - ASSENZE TECNICI DAL CALENDARIO (v5.1.0)
// ------------------------------------------------------------
// Script Google da mettere sull'account che VEDE il calendario condiviso
// delle assenze (script.google.com > Nuovo progetto > incolla tutto).
//
// Ogni 2 minuti legge gli eventi da oggi ai prossimi 60 giorni e li passa
// alla funzione Supabase "assenze-tecnici", che:
//  - riconosce le assenze dei tecnici (assente, ferie, malattia, esce ore...)
//  - manda il messaggio Telegram con "Si', colora" / "No"
//  - segnala gli eventi tolti dal calendario
// Dopo le 7:00 (una volta al giorno) chiede anche il resoconto di oggi.
//
// DA COMPILARE: le 3 righe qui sotto.
// Poi: esegui "provaCollegamento" (la prima volta Google chiede i permessi:
// Consenti), poi esegui "installaAttivatore" UNA volta sola.
// ============================================================

// ID del calendario: Google Calendar > tre puntini sul calendario > Impostazioni e condivisione >
// "Integra calendario" > ID calendario (es. abc123...@group.calendar.google.com oppure un indirizzo email)
const CALENDARIO_ID = 'INCOLLA_QUI_ID_CALENDARIO';

// Indirizzo della funzione Supabase (non cambia)
const FUNZIONE_URL = 'https://uiypndhemhgljceylqzl.supabase.co/functions/v1/assenze-tecnici';

// Parola segreta: la STESSA scritta nel secret ASSENZE_SCRIPT_KEY su Supabase
const CHIAVE = 'INCOLLA_QUI_ASSENZE_SCRIPT_KEY';

const GIORNI_AVANTI = 60;
const ORA_RESOCONTO = 7;   // resoconto del mattino dopo le 7:00
const FUSO = 'Europe/Rome';

// ------------------------------------------------------------
// Attivatore: ogni minuto (Google non permette "ogni 2 minuti"),
// ma lo script lavora solo nei minuti pari = un controllo ogni 2 minuti
// ------------------------------------------------------------
function controllaCalendario() {
  const adesso = new Date();
  const oggi = Utilities.formatDate(adesso, FUSO, 'yyyy-MM-dd');
  const ora = Number(Utilities.formatDate(adesso, FUSO, 'H'));
  const minuto = Number(Utilities.formatDate(adesso, FUSO, 'm'));
  const props = PropertiesService.getScriptProperties();
  const mattina = ora >= ORA_RESOCONTO && props.getProperty('ultimoResoconto') !== oggi;
  if (minuto % 2 !== 0 && !mattina) return;   // minuto dispari: salto

  const risposta = chiamaFunzione(Object.assign({ azione: 'controlla', mattina: mattina, oggi: oggi }, leggiEventi()));
  if (risposta.ok && mattina) props.setProperty('ultimoResoconto', oggi);
}

function leggiEventi() {
  const cal = CalendarApp.getCalendarById(CALENDARIO_ID);
  if (!cal) {
    throw new Error('Calendario non trovato: controlla CALENDARIO_ID (solo l\'ID, non il codice <iframe>) ' +
      'e che il calendario sia condiviso con questo account. Esegui "elencaCalendari" per vedere gli ID disponibili.');
  }
  const inizio = new Date();
  inizio.setHours(0, 0, 0, 0);
  const fine = new Date(inizio.getTime() + GIORNI_AVANTI * 24 * 3600 * 1000);

  const eventi = cal.getEvents(inizio, fine).map(function (e) {
    const tuttoGiorno = e.isAllDayEvent();
    const da = tuttoGiorno ? e.getAllDayStartDate() : e.getStartTime();
    const a = tuttoGiorno ? e.getAllDayEndDate() : e.getEndTime();
    const formato = tuttoGiorno ? 'yyyy-MM-dd' : "yyyy-MM-dd'T'HH:mm";
    return {
      // gli eventi ripetuti hanno lo stesso id: aggiungo l'inizio
      id: e.getId() + (e.isRecurringEvent() ? '_' + Utilities.formatDate(e.getStartTime(), FUSO, 'yyyyMMddHHmm') : ''),
      titolo: e.getTitle(),
      tutto_giorno: tuttoGiorno,
      inizio: Utilities.formatDate(da, FUSO, formato),
      fine: Utilities.formatDate(a, FUSO, formato)
    };
  });
  return { eventi: eventi, fino: Utilities.formatDate(fine, FUSO, 'yyyy-MM-dd') };
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
  } else {
    console.log('OK: eventi letti ' + (j.eventi || 0) + ', messaggi mandati ' + (j.messaggi || 0));
  }
  (j.riepilogo || []).forEach(function (r) { console.log('  ' + r); });
  return j;
}

// ------------------------------------------------------------
// Da eseguire a mano
// ------------------------------------------------------------

// 0. Elenca i calendari che questo account vede, con il loro ID
//    (copia l'ID giusto nella riga CALENDARIO_ID in alto)
function elencaCalendari() {
  console.log('Account: ' + Session.getEffectiveUser().getEmail());
  CalendarApp.getAllCalendars().forEach(function (c) {
    console.log('NOME: ' + c.getName() + '   ->   ID: ' + c.getId());
  });
}

// 1. Prova: controlla calendario + chiave + Telegram (arriva un messaggio di prova)
function provaCollegamento() {
  const dati = leggiEventi();
  console.log('Calendario OK: ' + dati.eventi.length + ' eventi nei prossimi ' + GIORNI_AVANTI + ' giorni.');
  dati.eventi.slice(0, 10).forEach(function (e) { console.log(' - ' + e.inizio + '  ' + e.titolo); });
  const r = chiamaFunzione({ azione: 'prova' });
  console.log(r.ok ? 'Telegram OK: controlla il messaggio di prova.' : 'Problema: ' + r.errore);
}

// 2. Installa l'attivatore (ogni minuto, lavora ogni 2). Se lo riesegui sostituisce quello vecchio.
function installaAttivatore() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'controllaCalendario') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('controllaCalendario').timeBased().everyMinutes(1).create();
  console.log('Attivatore installato: controllaCalendario (controllo ogni 2 minuti).');
}

// 3. Controllo a mano (stessa cosa dell'attivatore, ma subito e con il log completo)
function controllaAdesso() {
  const oggi = Utilities.formatDate(new Date(), FUSO, 'yyyy-MM-dd');
  chiamaFunzione(Object.assign({ azione: 'controlla', mattina: false, oggi: oggi }, leggiEventi()));
}

// 5. DIAGNOSI: controlla secrets, bot, webhook, chat e database (risultato nel log)
//    e manda un messaggio di prova nelle due chat (gruppo interventi e chat assenze)
function diagnosi() {
  chiamaFunzione({ azione: 'diagnosi' });
}

// 4. Se serve rifare il resoconto di oggi (es. per prova)
function rifaiResocontoOggi() {
  PropertiesService.getScriptProperties().deleteProperty('ultimoResoconto');
  controllaCalendario();
}
