// ========================================
// ASSISTENZA - RICHIESTE INTERVENTI ROBOT + ORGANIZZAZIONE (v6.3.0)
// ----------------------------------------
// RICHIESTE INTERVENTI ROBOT (come il foglio Excel "INTERVENTI ROBOT"):
//   OP, data chiamata, cognome nome, indirizzo, telefono, note, urgenza, esito.
//   - Intestazioni della tabella bloccate in alto.
//   - Data = oggi (si puo' cambiare). Operatore = iniziali di chi e' collegato.
//   - Due campi scritti a mano (niente suggerimenti): VIA E CIVICO (colonna indirizzo) + PAESE, tutti e due obbligatori.
//     L'indirizzo completo (link Google Maps, PDF, fumetto) e' la loro unione: rrIndirizzoCompleto().
//     Sulla mappa la richiesta va al centro del PAESE (OpenStreetMap trova sempre i paesi);
//     il link dell'indirizzo apre Google Maps con l'indirizzo preciso (link normale, gratis).
//   - Tipo: dedotto dalle NOTE (SOPRALLUOGO... = SOP, MONTAGGIO... = MONT, altro = INT),
//     si puo' cambiare a mano.
//   - Urgenza Un = entro n giorni lavorativi (U1 = in giornata), sabato e domenica esclusi.
//     Barra in alto con richieste SCADUTE / in scadenza oggi / domani.
//   - Esito: vuoto = da organizzare, "-" = organizzato (in attesa di conferma),
//     OK = confermato, NR = non risponde, NO = annullato.
//   - Fine anno (solo admin): PDF di tutte le richieste dell'anno + pulizia del server.
// ORGANIZZAZIONE INTERVENTI ROBOT:
//   - Mappa OpenStreetMap (Leaflet) con un pallino per richiesta aperta
//     rosso = assistenza, blu = montaggio, giallo = sopralluogo (piu' intenso = piu' urgente)
//     verde = organizzato (esito "-"), bianco = non risponde (NR). Bordo nero = scaduta.
//   - Sotto: contenitori per distanza dalla sede (0-10, 10-20, 20-30, 30-40, oltre 40 km)
//     divisi per urgenza. Organizzati e NR restano ma barrati.
// COLLEGAMENTI:
//   - Interventi esterni: scrivendo il cliente compaiono le richieste aperte; scegliendone
//     una la casella si aggancia (richiesta_id) e l'esito del planning passa da solo
//     alla richiesta (trigger su Supabase, script supabase/richieste-robot-setup.sql).
//   - Ordini clienti con robot / antizanzare senza "senza servizio di installazione"
//     = richiesta di MONTAGGIO automatica (funzione richieste_robot_da_ordine).
// Tabella Supabase: richieste_robot (+ colonna interventi.richiesta_id).
// ========================================

// Chi puo' MODIFICARE le richieste (deve corrispondere a richieste_robot_puo_modificare() su Supabase,
// script supabase/richieste-robot-operatori.sql): tutti, tecnici compresi (2/11/2026).
const RR_RUOLI_MODIFICA = ['admin', 'operatore', 'tecnico'];

const RR_TIPI = { INT: 'Assistenza', SOP: 'Sopralluogo', MONT: 'Montaggio' };
const RR_ESITI = {
    '': { etichetta: 'Da organizzare', classe: 'rr-es-vuoto' },
    '-': { etichetta: 'Organizzato', classe: 'rr-es-org' },
    'NR': { etichetta: 'Non risponde', classe: 'rr-es-nr' },
    'OK': { etichetta: 'Confermato', classe: 'rr-es-ok' },
    'NO': { etichetta: 'Annullato', classe: 'rr-es-no' }
};
// Colori dei pallini: dal piu' urgente (U1) al meno urgente (U5 e oltre / senza urgenza)
const RR_COLORI = {
    INT:  ['#991b1b', '#dc2626', '#f05252', '#f87171', '#fca5a5', '#fecaca'],
    MONT: ['#1e3a8a', '#1d4ed8', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe'],
    SOP:  ['#a16207', '#ca8a04', '#eab308', '#facc15', '#fde047', '#fef08a']
};
const RR_COLORE_ORGANIZZATO = '#16a34a';
const RR_COLORE_NR = '#ffffff';
const RR_FASCE = [
    { da: 0, a: 10, titolo: '0 - 10 km' },
    { da: 10, a: 20, titolo: '10 - 20 km' },
    { da: 20, a: 30, titolo: '20 - 30 km' },
    { da: 30, a: 40, titolo: '30 - 40 km' },
    { da: 40, a: Infinity, titolo: 'Oltre 40 km' }
];
// Sede: posizione di riserva (Martellago) se l'indirizzo dei Dati aziendali non si trova
const RR_SEDE_RISERVA = { lat: 45.5455, lon: 12.1590 };
// Zona di ricerca degli indirizzi (Veneto e dintorni)
const RR_BBOX = '10.5,44.6,13.95,46.8';
// Zoom iniziale della mappa (10 = circa 40 km intorno, 11 = circa 20 km, 12 = circa 10 km): 12 su richiesta di Donny
const RR_ZOOM_INIZIALE = 12;
const RR_LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const RR_LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

let rrRichieste = [];
let rrCaricate = false;
let rrFiltro = 'TUTTE';
let rrCercaTesto = '';
let rrCercaTimer = null;
let rrModifica = null;          // richiesta aperta nella finestra (null = nuova)
let rrTipoManuale = false;      // tipo scelto a mano (non piu' dedotto dalle note)
let rrSuggerimenti = [];        // suggerimenti indirizzo
let rrSuggScelto = null;        // { testo, lat, lon, paese } scelto dai suggerimenti
let rrSuggTimer = null;
let rrSuggUltimaRicerca = '';
let rrSede = null;
let rrMappa = null;
let rrStratoPallini = null;
let rrStratoSede = null;
let rrMarcatori = {};           // id richiesta -> marcatore
let rrNascondiTipi = {};        // tipi nascosti sulla mappa
let rrLeafletPromessa = null;
let rrCanale = null;
let rrRicaricaTimer = null;
let rrGeoInCorso = false;
let rrGeoFalliti = {};          // id -> true (in questa sessione non si riprova)

// ========================================
// UTILITA'
// ========================================
function rrEsc(v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function rrPad(n) { return String(n).padStart(2, '0'); }
function rrIso(d) { return d.getFullYear() + '-' + rrPad(d.getMonth() + 1) + '-' + rrPad(d.getDate()); }
function rrDaIso(iso) {
    const p = String(iso).split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2], 12, 0, 0);
}
function rrOggi() { return rrIso(new Date()); }
function rrDataIt(iso) {
    if (!iso) return '';
    const p = String(iso).split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso;
}
const RR_GIORNI_BREVI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
function rrDataBreve(iso) {
    if (!iso) return '';
    const d = rrDaIso(iso);
    return RR_GIORNI_BREVI[d.getDay()] + ' ' + d.getDate() + '/' + rrPad(d.getMonth() + 1);
}

function rrTesto(v) {
    return String(v || '').trim().replace(/\s+/g, ' ').toUpperCase();
}

function rrNorm(s) {
    return String(s || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function rrPuoModificare() {
    return RR_RUOLI_MODIFICA.includes(currentUserRole);
}

// Salvare la posizione sulla mappa: admin e operatori (funzione richieste_robot_posizione)
function rrPuoPosizionare() {
    return currentUserRole === 'admin' || currentUserRole === 'operatore' || rrPuoModificare();
}

function rrMieIniziali() {
    const email = loggedInUserEmail || (currentUser ? currentUser.email : '');
    if (typeof userInitials === 'object' && userInitials[email]) return String(userInitials[email]).toUpperCase();
    return String(email || '').split('@')[0].slice(0, 3).toUpperCase();
}

function rrErrore(error, dove) {
    console.error('Richieste robot - ' + dove + ':', error);
    const msg = error && error.message ? error.message : String(error);
    let extra = '';
    if (/richieste_robot|richiesta_id|does not exist|schema cache/i.test(msg)) {
        extra = '<br><br>Hai eseguito su Supabase lo script <strong>supabase/richieste-robot-setup.sql</strong>?';
    } else if (/row-level security|violates/i.test(msg)) {
        extra = '<br><br>Non hai il permesso di modificare le richieste.';
    }
    showCustomAlert('Errore (' + rrEsc(dove) + '):<br>' + rrEsc(msg) + extra, 'Errore', '&#10060;');
}

// Piccolo avviso che sparisce da solo (sopra a tutto, anche alle finestre)
function rrToast(html) {
    let el = document.getElementById('rr-toast');
    if (!el) {
        el = document.createElement('div');
        el.id = 'rr-toast';
        el.className = 'rr-toast';
        document.body.appendChild(el);
    }
    el.innerHTML = html;
    el.classList.add('visibile');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove('visibile'), 4500);
}

// ---------- Telefono / mappe ----------
function rrTelHref(tel) {
    let t = String(tel || '').replace(/[^\d+]/g, '');
    if (!t) return '';
    if (t.startsWith('00')) t = '+' + t.slice(2);
    if (!t.startsWith('+')) t = '+39' + t;
    return 'tel:' + t;
}

// Indirizzo completo = via e civico + paese (il paese non si ripete se e' gia' scritto nella via, richieste vecchie)
function rrIndirizzoCompleto(r) {
    if (!r) return '';
    return [r.indirizzo, (r.paese && rrNorm(r.indirizzo).indexOf(rrNorm(r.paese)) < 0) ? r.paese : ''].filter(Boolean).join(', ');
}

// Paese della richiesta: quello salvato, altrimenti dedotto dall'indirizzo
function rrPaese(r) {
    if (!r) return '';
    if (r.paese) return rrTesto(r.paese);
    const ind = rrTesto(r.indirizzo);
    if (!ind) return '';
    const parti = ind.split(',').map(s => s.trim()).filter(Boolean);
    if (parti.length > 1) return parti[parti.length - 1].replace(/^\d{5}\s*/, '').replace(/\s*\([A-Z]{2}\)$/, '');
    if (!/\d/.test(ind) && !/\b(VIA|VIALE|PIAZZA|PIAZZALE|VICOLO|CORSO|STRADA|LOCALITA|LOC)\b/.test(ind)) return ind;
    const parole = ind.split(' ').filter(w => !/\d/.test(w));
    return parole.length > 1 ? parole[parole.length - 1] : '';
}

function rrMapsUrl(r) {
    const q = [r.indirizzo, (r.paese && rrNorm(r.indirizzo).indexOf(rrNorm(r.paese)) < 0) ? r.paese : ''].filter(Boolean).join(', ');
    if (r.lat && r.lon && !q) return 'https://www.google.com/maps/search/?api=1&query=' + r.lat + ',' + r.lon;
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent((q || rrPaese(r)) + ', Italia');
}

// Testo per il planning: COGNOME NOME - PAESE - TELEFONO
function rrTestoPlanning(r) {
    return [rrTesto(r.cliente), rrPaese(r), String(r.telefono || '').trim()].filter(Boolean).join(' - ');
}

// ========================================
// URGENZA E SCADENZE (giorni lavorativi: lunedi' - venerdi', esclusi i festivi italiani)
// ========================================
// Pasqua (calendario gregoriano, algoritmo di Meeus): serve per il Lunedi' dell'Angelo
function rrPasqua(anno) {
    const a = anno % 19, b = Math.floor(anno / 100), c = anno % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mese = Math.floor((h + l - 7 * m + 114) / 31), giorno = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(anno, mese - 1, giorno, 12, 0, 0);
}

const rrFestiviCache = {};
// Festivi italiani + SANTO PATRONO del comune (3 ottobre). Per aggiungere un giorno: 'MM-GG': 'NOME'.
// Valgono per le scadenze delle richieste e per il planning (Interventi esterni: righe rosse di default).
const RR_FESTIVI_FISSI = {
    '01-01': 'CAPODANNO', '01-06': 'EPIFANIA', '04-25': 'FESTA DELLA LIBERAZIONE', '05-01': 'FESTA DEL LAVORO',
    '06-02': 'FESTA DELLA REPUBBLICA', '08-15': 'FERRAGOSTO', '10-03': 'SANTO PATRONO', '11-01': 'OGNISSANTI',
    '12-08': 'IMMACOLATA', '12-25': 'NATALE', '12-26': 'SANTO STEFANO'
};
// Mappa data ISO -> nome della festa per l'anno
function rrFestiviNomi(anno) {
    if (rrFestiviCache[anno]) return rrFestiviCache[anno];
    const m = {};
    Object.keys(RR_FESTIVI_FISSI).forEach(k => { m[anno + '-' + k] = RR_FESTIVI_FISSI[k]; });
    const pasquetta = rrPasqua(anno);
    pasquetta.setDate(pasquetta.getDate() + 1);
    m[rrIso(pasquetta)] = 'PASQUETTA';
    rrFestiviCache[anno] = m;
    return m;
}
function rrFestivi(anno) {
    const m = rrFestiviNomi(anno);
    return { has: iso => Object.prototype.hasOwnProperty.call(m, iso) };
}
// Nome della festa (o null) di una data 'AAAA-MM-GG'
function rrNomeFestivo(iso) {
    const anno = parseInt(String(iso).slice(0, 4), 10);
    if (!anno) return null;
    return rrFestiviNomi(anno)[iso] || null;
}

// Giorno lavorativo: non sabato, non domenica, non festivo
function rrLavorativo(d) {
    const g = d.getDay();
    if (g === 0 || g === 6) return false;
    return !rrFestivi(d.getFullYear()).has(rrIso(d));
}

// U1 = entro il giorno della chiamata, Un = entro n giorni lavorativi (il giorno della chiamata conta come primo)
function rrScadenza(r) {
    const u = parseInt(r && r.urgenza, 10);
    if (!u || !r.data) return null;
    const d = rrDaIso(r.data);
    while (!rrLavorativo(d)) d.setDate(d.getDate() + 1);
    let resto = u - 1;
    while (resto > 0) {
        d.setDate(d.getDate() + 1);
        if (rrLavorativo(d)) resto--;
    }
    return rrIso(d);
}

function rrProssimoLavorativo(iso) {
    const d = rrDaIso(iso);
    do { d.setDate(d.getDate() + 1); } while (!rrLavorativo(d));
    return rrIso(d);
}

// Richiesta ancora da sistemare: esito vuoto o NR (con "-" e' gia' nel planning)
function rrDaGestire(r) {
    return !r.esito || r.esito === 'NR';
}

function rrAperta(r) {
    return r.esito !== 'OK' && r.esito !== 'NO';
}

// 'SCADUTA' / 'OGGI' / 'DOMANI' / null
function rrStatoScadenza(r) {
    if (!rrDaGestire(r)) return null;
    const s = rrScadenza(r);
    if (!s) return null;
    const oggi = rrOggi();
    if (s < oggi) return 'SCADUTA';
    if (s === oggi) return 'OGGI';
    if (s === rrProssimoLavorativo(oggi)) return 'DOMANI';
    return null;
}

function rrConteggiScadenze(lista) {
    const c = { SCADUTA: 0, OGGI: 0, DOMANI: 0 };
    (lista || rrRichieste).forEach(r => {
        const s = rrStatoScadenza(r);
        if (s) c[s]++;
    });
    return c;
}

function rrUrgenzaTesto(r) {
    return r.urgenza ? 'U' + r.urgenza : '';
}

// Tipo dedotto dalle note
function rrTipoDaNote(note) {
    const t = rrNorm(note);
    if (/^SOPRALLUOG/.test(t)) return 'SOP';
    if (/^(MONTAGGI|INSTALLAZION)/.test(t)) return 'MONT';
    return 'INT';
}

// ========================================
// COLORI DEI PALLINI
// ========================================
// 'NASCOSTA' (OK / NO), 'ORGANIZZATA' ("-"), 'NR', 'DA_ORGANIZZARE'
function rrStatoMappa(r) {
    if (r.esito === 'OK' || r.esito === 'NO') return 'NASCOSTA';
    if (r.esito === '-') return 'ORGANIZZATA';
    if (r.esito === 'NR') return 'NR';
    return 'DA_ORGANIZZARE';
}

function rrLivello(r) {
    const u = parseInt(r.urgenza, 10);
    if (!u) return 5;
    return Math.min(u, 5) - 1;
}

function rrColore(r) {
    const stato = rrStatoMappa(r);
    if (stato === 'ORGANIZZATA') return RR_COLORE_ORGANIZZATO;
    if (stato === 'NR') return RR_COLORE_NR;
    const scala = RR_COLORI[r.tipo] || RR_COLORI.INT;
    return scala[rrLivello(r)];
}

function rrPallinoHtml(r, grande) {
    const stato = rrStatoMappa(r);
    const classi = ['rr-pallino'];
    if (grande) classi.push('grande');
    if (stato === 'NR') classi.push('bianco');
    if (rrStatoScadenza(r) === 'SCADUTA') classi.push('scaduto');
    return '<span class="' + classi.join(' ') + '" style="background:' + rrColore(r) + '"></span>';
}

// ========================================
// CARICAMENTO
// ========================================
async function rrCarica() {
    const tutte = [];
    let da = 0;
    const passo = 1000;
    for (;;) {
        const { data, error } = await supabaseClient.from('richieste_robot').select('*')
            .order('data', { ascending: true }).order('id', { ascending: true }).range(da, da + passo - 1);
        if (error) throw error;
        tutte.push(...(data || []));
        if (!data || data.length < passo) break;
        da += passo;
    }
    rrRichieste = tutte;
    rrOrdina();
    rrCaricate = true;
    return tutte;
}

function rrTrova(id) {
    return rrRichieste.find(r => r.id === id) || null;
}

// ========================================
// SEZIONE RICHIESTE INTERVENTI ROBOT
// ========================================
async function openRichiesteRobot() {
    rrAvviaTempoReale();
    const nuova = document.getElementById('rr-btn-nuova');
    if (nuova) nuova.classList.toggle('hidden', !rrPuoModificare());
    document.querySelectorAll('.rr-solo-admin').forEach(el => el.classList.toggle('hidden', currentUserRole !== 'admin'));
    const box = document.getElementById('rr-tabella-box');
    if (!rrCaricate && box) box.innerHTML = '<div class="rr-vuoto">Caricamento...</div>';
    try {
        await rrCarica();
    } catch (err) {
        if (box) box.innerHTML = '<div class="rr-vuoto">Richieste non disponibili.</div>';
        rrErrore(err, 'lettura richieste');
        return;
    }
    rrRenderRichieste();
    rrScorriInFondo();
    rrAggiornaBadge();
    rrGeocodificaMancanti();
}

function rrRenderRichieste() {
    rrRenderAvvisi('rr-avvisi');
    rrRenderTabella();
}

// Ordine per data della chiamata: le piu' vecchie in alto, le piu' recenti in fondo (come nel foglio Excel)
function rrOrdina() {
    rrRichieste.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : a.id - b.id));
}

function rrScorriInFondo() {
    const box = document.getElementById('rr-tabella-box');
    if (box) setTimeout(() => { box.scrollTop = box.scrollHeight; }, 30);
}

function rrRenderAvvisi(boxId) {
    const box = document.getElementById(boxId);
    if (!box) return;
    const c = rrConteggiScadenze();
    const parti = [];
    if (c.SCADUTA) parti.push('<strong>' + c.SCADUTA + (c.SCADUTA === 1 ? ' richiesta SCADUTA' : ' richieste SCADUTE') + '</strong>');
    if (c.OGGI) parti.push('<strong>' + c.OGGI + '</strong> in scadenza OGGI');
    if (c.DOMANI) parti.push('<strong>' + c.DOMANI + '</strong> in scadenza DOMANI');
    if (!parti.length) {
        box.className = 'rr-avvisi hidden';
        box.innerHTML = '';
        return;
    }
    box.className = 'rr-avvisi' + (c.SCADUTA ? ' grave' : '');
    box.innerHTML = '<span class="rr-avvisi-icona">&#9888;&#65039;</span><span>' + parti.join(' &middot; ') + '</span>' +
        (boxId === 'rr-avvisi'
            ? '<button type="button" class="rr-avvisi-btn" onclick="rrImpostaFiltro(\'SCADENZE\')">Mostra</button>'
            : '<button type="button" class="rr-avvisi-btn" onclick="openSection(\'richieste-robot\'); rrImpostaFiltro(\'SCADENZE\')">Vedi richieste</button>');
}

function rrImpostaFiltro(valore) {
    rrFiltro = valore;
    const sel = document.getElementById('rr-filtro');
    if (sel) sel.value = valore;
    rrRenderTabella();
}

function rrCambiaCerca(valore) {
    clearTimeout(rrCercaTimer);
    rrCercaTimer = setTimeout(() => {
        rrCercaTesto = rrNorm(valore);
        rrRenderTabella();
    }, 200);
}

function rrRigheFiltrate() {
    return rrRichieste.filter(r => {
        switch (rrFiltro) {
            case 'APERTE': if (!rrAperta(r)) return false; break;
            case 'VUOTO': if (r.esito) return false; break;
            case '-': case 'NR': case 'OK': case 'NO': if (r.esito !== rrFiltro) return false; break;
            case 'SCADENZE': if (!rrStatoScadenza(r)) return false; break;
            default: break;
        }
        if (rrCercaTesto) {
            const testo = rrNorm([r.operatore, r.cliente, r.indirizzo, r.paese, r.telefono, r.note, rrUrgenzaTesto(r), r.esito].join(' '));
            if (!rrCercaTesto.split(' ').every(p => testo.indexOf(p) >= 0)) return false;
        }
        return true;
    });
}

function rrRenderTabella() {
    const box = document.getElementById('rr-tabella-box');
    if (!box) return;
    const righe = rrRigheFiltrate();
    const conta = document.getElementById('rr-conta');
    if (conta) conta.innerHTML = righe.length + (righe.length === 1 ? ' richiesta' : ' richieste') +
        (righe.length !== rrRichieste.length ? ' su ' + rrRichieste.length : '');
    if (righe.length === 0) {
        box.innerHTML = '<div class="rr-vuoto">' + (rrRichieste.length ? 'Nessuna richiesta con questi filtri.' :
            'Nessuna richiesta.' + (rrPuoModificare() ? ' Usa <strong>&#10133; Nuova richiesta</strong> per aggiungerne una.' : '')) + '</div>';
        return;
    }
    const modificabile = rrPuoModificare();
    let html = '<table class="rr-tabella"><colgroup>' +
        '<col style="width:52px"><col style="width:100px"><col style="width:170px"><col style="width:200px"><col style="width:128px">' +
        '<col><col style="width:64px"><col style="width:110px"><col style="width:70px"></colgroup><thead><tr>' +
        '<th class="rr-c-op">OP</th><th class="rr-c-data">DATA</th><th class="rr-c-cliente">COGNOME NOME</th>' +
        '<th class="rr-c-ind">INDIRIZZO</th><th class="rr-c-tel">TELEFONO</th><th class="rr-c-note">NOTE</th>' +
        '<th class="rr-c-tipo">TIPO</th><th class="rr-c-urg">URG.</th><th class="rr-c-esito">ESITO</th>' +
        '</tr></thead><tbody>';
    righe.forEach(r => {
        const scad = rrStatoScadenza(r);
        const classi = ['rr-riga', 'esito-' + ({ '-': 'org', OK: 'ok', NR: 'nr', NO: 'no' }[r.esito] || 'vuoto')];
        if (scad) classi.push('scad-' + scad.toLowerCase());
        if (modificabile) classi.push('cliccabile');
        const scadenza = rrScadenza(r);
        const esito = RR_ESITI[r.esito || ''] || RR_ESITI[''];
        const tel = String(r.telefono || '').trim();
        html += '<tr class="' + classi.join(' ') + '"' + (modificabile ? ' onclick="rrApriModifica(' + r.id + ')"' : '') + '>' +
            '<td class="rr-c-op">' + rrEsc(r.operatore) + '</td>' +
            '<td class="rr-c-data">' + rrDataIt(r.data) + '</td>' +
            '<td class="rr-c-cliente"><strong>' + rrEsc(r.cliente) + '</strong>' +
                (r.ordine_id ? '<span class="rr-tag-ordine" title="Creata da un ordine cliente">ORDINE</span>' : '') + '</td>' +
            '<td class="rr-c-ind">' + (r.indirizzo || r.paese
                ? '<a href="' + rrEsc(rrMapsUrl(r)) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">' + rrEsc(r.indirizzo || r.paese) + '</a>' +
                  (r.paese && rrNorm(r.indirizzo).indexOf(rrNorm(r.paese)) < 0 ? '<span class="rr-paese">' + rrEsc(r.paese) + '</span>' : '')
                : '') +
                (r.geo_stato === 'NON_TROVATO' ? '<span class="rr-geo-ko" title="Indirizzo non trovato sulla mappa">&#128205;?</span>' : '') + '</td>' +
            '<td class="rr-c-tel">' + (tel ? '<a href="' + rrTelHref(tel) + '" onclick="event.stopPropagation()">' + rrEsc(tel) + '</a>' : '') + '</td>' +
            '<td class="rr-c-note">' + rrEsc(r.note) + '</td>' +
            '<td class="rr-c-tipo"><span class="rr-tipo rr-tipo-' + rrEsc(r.tipo) + '">' + rrEsc(r.tipo) + '</span></td>' +
            '<td class="rr-c-urg">' + (r.urgenza ? '<strong>U' + r.urgenza + '</strong><span class="rr-scad' + (scad ? ' ' + scad.toLowerCase() : '') + '">' +
                (scad === 'SCADUTA' ? 'scaduta ' : scad === 'OGGI' ? 'oggi' : scad === 'DOMANI' ? 'domani' : 'entro ') +
                (scad === 'OGGI' || scad === 'DOMANI' ? '' : rrDataBreve(scadenza)) + '</span>' : '') + '</td>' +
            '<td class="rr-c-esito"><span class="rr-esito ' + esito.classe + '" title="' + esito.etichetta + '">' + rrEsc(r.esito || '') + '</span></td>' +
            '</tr>';
    });
    html += '</tbody></table>';
    box.innerHTML = html;
}

// ========================================
// FINESTRA NUOVA / MODIFICA RICHIESTA
// ========================================
function rrApriNuova() {
    if (!rrPuoModificare()) return;
    rrApriFinestra(null);
}

function rrApriModifica(id) {
    if (!rrPuoModificare()) return;
    const r = rrTrova(id);
    if (r) rrApriFinestra(r);
}

function rrApriFinestra(r) {
    rrModifica = r;
    rrSuggScelto = null;
    rrSuggerimenti = [];
    rrTipoManuale = !!r;
    document.getElementById('rr-modal-titolo').innerHTML = r ? '&#9999;&#65039; Modifica richiesta' : '&#10133; Nuova richiesta';
    document.getElementById('rr-f-operatore').value = r ? (r.operatore || '') : rrMieIniziali();
    document.getElementById('rr-f-data').value = r ? r.data : rrOggi();
    document.getElementById('rr-f-cliente').value = r ? r.cliente : '';
    document.getElementById('rr-f-indirizzo').value = r ? r.indirizzo : '';
    document.getElementById('rr-f-paese').value = r ? (r.paese || '') : '';
    document.getElementById('rr-f-telefono').value = r ? r.telefono : '';
    document.getElementById('rr-f-note').value = r ? (r.note || '') : '';
    document.getElementById('rr-f-urgenza').value = r && r.urgenza ? r.urgenza : '';
    intSelezionaScelta('rr-f-tipo', r ? r.tipo : 'INT');
    intSelezionaScelta('rr-f-esito', r ? (r.esito || '') : '');
    rrNascondiSuggerimenti();
    rrAggiornaScadenzaForm();
    document.getElementById('rr-f-elimina').classList.toggle('hidden', !r);
    rrRenderInfoFinestra(r);
    document.getElementById('rr-modal').classList.remove('hidden');
    if (!r && !(typeof isMobile === 'function' && isMobile())) setTimeout(() => document.getElementById('rr-f-cliente').focus(), 50);
}

async function rrRenderInfoFinestra(r) {
    const box = document.getElementById('rr-f-info');
    if (!box) return;
    if (!r) { box.classList.add('hidden'); box.innerHTML = ''; return; }
    let html = '';
    if (r.ordine_id) html += '<div>&#128221; Creata automaticamente da un <strong>ordine cliente</strong> (montaggio).</div>';
    if (r.geo_stato === 'NON_TROVATO') html += '<div>&#128205; Paese <strong>non trovato</strong> sulla mappa: controlla come &egrave; scritto.</div>';
    box.innerHTML = html;
    box.classList.toggle('hidden', !html);
    // Caselle del planning agganciate
    try {
        const { data, error } = await supabaseClient.from('interventi').select('data, turno, esito, tecnico_id').eq('richiesta_id', r.id).order('data');
        if (error || !data || !data.length || rrModifica !== r) return;
        const { data: tec } = await supabaseClient.from('tecnici').select('id, nome');
        const nomi = {};
        (tec || []).forEach(t => { nomi[t.id] = t.nome; });
        html += '<div>&#128656; Nel planning: ' + data.map(i => '<strong>' + rrDataBreve(i.data) + ' ' + (i.turno === 'M' ? 'mattina' : 'pomeriggio') + '</strong> ' +
            rrEsc(nomi[i.tecnico_id] || '') + (i.esito ? ' (' + rrEsc(i.esito) + ')' : '')).join(' &middot; ') + '</div>';
        box.innerHTML = html;
        box.classList.remove('hidden');
    } catch (e) { /* niente */ }
}

function rrChiudiFinestra() {
    document.getElementById('rr-modal').classList.add('hidden');
    rrNascondiSuggerimenti();
    rrModifica = null;
}

function rrScegliTipo(tipo) {
    rrTipoManuale = true;
    intSelezionaScelta('rr-f-tipo', tipo);
}

function rrNoteCambiate() {
    if (rrTipoManuale) return;
    intSelezionaScelta('rr-f-tipo', rrTipoDaNote(document.getElementById('rr-f-note').value));
}

function rrScegliUrgenza(n) {
    document.getElementById('rr-f-urgenza').value = n || '';
    rrAggiornaScadenzaForm();
}

function rrLeggiUrgenza() {
    const v = String(document.getElementById('rr-f-urgenza').value || '').replace(/[^\d]/g, '');
    const n = parseInt(v, 10);
    return n >= 1 && n <= 99 ? n : null;
}

function rrAggiornaScadenzaForm() {
    const box = document.getElementById('rr-f-scadenza');
    if (!box) return;
    const u = rrLeggiUrgenza();
    const data = document.getElementById('rr-f-data').value || rrOggi();
    document.querySelectorAll('#rr-f-urg-rapide button').forEach(b => b.classList.toggle('attivo', String(u || '') === b.dataset.valore));
    if (!u) { box.innerHTML = 'Senza urgenza: nessuna scadenza.'; return; }
    const s = rrScadenza({ urgenza: u, data: data });
    box.innerHTML = 'Da fare entro <strong>' + rrDataBreve(s) + '</strong>' + (u === 1 ? ' (in giornata)' : ' (' + u + ' giorni lavorativi)');
}

// ---------- Suggerimenti indirizzo (Photon, dati OpenStreetMap) ----------
// Indirizzo scritto a mano: i suggerimenti non ci sono piu' (v6.4.0), la posizione si prende dal PAESE
function rrIndirizzoCambiato() {
    rrSuggScelto = null;
    rrNascondiSuggerimenti();
}

async function rrCercaSuggerimenti(testo, subito) {
    rrSuggUltimaRicerca = testo;
    const box = document.getElementById('rr-f-sugg');
    box.innerHTML = '<div class="rr-sugg-msg">&#8987; Cerco l\'indirizzo...</div>';
    box.classList.remove('hidden');
    let risultati = [];
    let problema = false;
    // Il server pubblico di Photon ogni tanto rifiuta una richiesta: riprovo una volta
    for (let tentativo = 0; tentativo < 2; tentativo++) {
        try {
            risultati = await rrPhoton(testo, 6);
            problema = false;
            break;
        } catch (e) {
            problema = true;
            console.log('Suggerimenti indirizzo (Photon) non disponibili:', e);
            if (tentativo === 0) await new Promise(ok => setTimeout(ok, 600));
            if (rrSuggUltimaRicerca !== testo) return;
        }
    }
    // Nessun risultato (o servizio non raggiungibile): una ricerca su Nominatim (sempre OpenStreetMap)
    if (!risultati.length) {
        if (!subito) await new Promise(ok => setTimeout(ok, 700));
        if (rrSuggUltimaRicerca !== testo) return;
        try {
            risultati = await rrNominatimLista(testo, 5);
            problema = false;
        } catch (e) {
            console.log('Ricerca indirizzo (Nominatim) non disponibile:', e);
        }
    }
    if (rrSuggUltimaRicerca !== testo) return;   // nel frattempo si e' scritto altro
    rrSuggerimenti = rrAggiungiCivico(risultati, testo);
    if (!rrSuggerimenti.length) {
        box.innerHTML = '<div class="rr-sugg-msg">' + (problema
            ? '&#9888;&#65039; Servizio indirizzi non raggiungibile (connessione?). Scrivi l\'indirizzo a mano: la posizione verr&agrave; cercata dopo il salvataggio.'
            : 'Nessun indirizzo trovato. Prova con <strong>via + paese</strong> (es. VIA ROMA MIRANO), oppure lascialo scritto cos&igrave;.') + '</div>';
        box.classList.remove('hidden');
        return;
    }
    box.innerHTML = rrSuggerimenti.map((s, i) =>
        '<button type="button" onmousedown="event.preventDefault()" onclick="rrScegliSuggerimento(' + i + ')">' +
        '<strong>' + rrEsc(s.riga1) + '</strong><span>' + rrEsc(s.riga2) + '</span></button>').join('') +
        '<div class="rr-sugg-fonte">Indirizzi &copy; OpenStreetMap</div>';
    box.classList.remove('hidden');
}

// Invio nel campo indirizzo: cerca subito
function rrIndirizzoTasto(e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const paese = document.getElementById('rr-f-paese');
    if (paese) paese.focus();
}

// Numero civico scritto ma non trovato su OpenStreetMap (succede spesso): lo rimetto dopo la via
function rrAggiungiCivico(lista, testo) {
    // l'ultimo numero scritto (es. "VIA 4 NOVEMBRE 12 MIRANO" -> 12), escluso il CAP
    const tutti = rrTesto(testo).match(/\b\d+\s?[A-Z]?(?:\/\d+)?\b/g) || [];
    const validi = tutti.map(x => x.replace(/\s+/g, '')).filter(x => !/^\d{5}$/.test(x));
    if (!validi.length) return lista;
    const civico = validi[validi.length - 1];
    return lista.map(s => {
        if (!s.via || s.civico) return s;
        if (rrNorm(s.via).split(' ').includes(civico)) return s;   // numero che fa parte del nome della via
        const via = rrTesto(s.via) + ' ' + civico;
        return Object.assign({}, s, {
            riga1: s.riga1 + ' ' + civico,
            testo: rrTesto([via, s.paese].filter(Boolean).join(', ')),
            civico: civico
        });
    });
}

function rrScegliSuggerimento(i) {
    const s = rrSuggerimenti[i];
    if (!s) return;
    rrSuggScelto = s;
    document.getElementById('rr-f-indirizzo').value = s.testo;
    if (s.paese) document.getElementById('rr-f-paese').value = s.paese;
    rrNascondiSuggerimenti();
}

function rrNascondiSuggerimenti() {
    const box = document.getElementById('rr-f-sugg');
    if (box) { box.classList.add('hidden'); box.innerHTML = ''; }
}

function rrPosizioneSede() {
    return rrSede || RR_SEDE_RISERVA;
}

const RR_TIPI_LUOGO = ['city', 'town', 'village', 'hamlet', 'locality', 'district', 'suburb', 'isolated_dwelling', 'neighbourhood'];

async function rrPhoton(testo, quanti) {
    const s = rrPosizioneSede();
    const url = 'https://photon.komoot.io/api/?q=' + encodeURIComponent(testo) + '&limit=' + (quanti || 6) +
        '&lat=' + s.lat + '&lon=' + s.lon + '&bbox=' + RR_BBOX;
    const risp = await fetch(url);
    if (!risp.ok) throw new Error('Photon ' + risp.status);
    const json = await risp.json();
    const visti = {};
    return (json.features || []).map(f => {
        const p = f.properties || {};
        const c = (f.geometry && f.geometry.coordinates) || [];
        const eLuogo = RR_TIPI_LUOGO.includes(p.osm_value) || RR_TIPI_LUOGO.includes(p.type);
        const paese = eLuogo ? (p.name || '') : (p.city || p.district || p.locality || '');
        let via = '';
        if (p.street) via = p.street + (p.housenumber ? ' ' + p.housenumber : '');
        else if (!eLuogo && p.name) via = p.name;
        const riga1 = via || paese || p.name || '';
        const riga2 = [p.postcode, via ? paese : '', p.county || p.state].filter(Boolean).join(' ');
        const testoInd = rrTesto([via, paese].filter(Boolean).join(', '));
        return { riga1: riga1, riga2: riga2, testo: testoInd, paese: rrTesto(paese), lat: c[1], lon: c[0],
            via: p.street || (!eLuogo ? p.name : '') || '', civico: p.housenumber || '' };
    }).filter(x => {
        if (!x.testo || typeof x.lat !== 'number' || visti[x.testo]) return false;
        visti[x.testo] = true;
        return true;
    });
}

async function rrNominatim(testo) {
    const s = rrPosizioneSede();
    const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&countrycodes=it' +
        '&viewbox=' + RR_BBOX + '&bounded=1&q=' + encodeURIComponent(testo);
    const risp = await fetch(url, { headers: { 'Accept-Language': 'it' } });
    if (!risp.ok) throw new Error('Nominatim ' + risp.status);
    const json = await risp.json();
    if (!json || !json.length) return null;
    const a = json[0].address || {};
    return {
        lat: parseFloat(json[0].lat), lon: parseFloat(json[0].lon),
        paese: rrTesto(a.town || a.city || a.village || a.municipality || a.hamlet || a.suburb || ''),
        vicinoA: s
    };
}

// Ricerca con Nominatim (riserva dei suggerimenti): stessa forma dei risultati di Photon
async function rrNominatimLista(testo, quanti) {
    const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&countrycodes=it' +
        '&limit=' + (quanti || 5) + '&viewbox=' + RR_BBOX + '&bounded=1&q=' + encodeURIComponent(testo);
    const risp = await fetch(url, { headers: { 'Accept-Language': 'it' } });
    if (!risp.ok) throw new Error('Nominatim ' + risp.status);
    const json = await risp.json();
    const visti = {};
    return (json || []).map(x => {
        const a = x.address || {};
        const paese = a.town || a.city || a.village || a.municipality || a.hamlet || a.suburb || '';
        const via = a.road || a.pedestrian || '';
        const civico = a.house_number || '';
        const viaCompleta = [via, civico].filter(Boolean).join(' ');
        return {
            riga1: viaCompleta || paese || x.name || '',
            riga2: [a.postcode, viaCompleta ? paese : '', a.county].filter(Boolean).join(' '),
            testo: rrTesto([viaCompleta, paese].filter(Boolean).join(', ')),
            paese: rrTesto(paese), lat: parseFloat(x.lat), lon: parseFloat(x.lon), via: via, civico: civico
        };
    }).filter(x => {
        if (!x.testo || isNaN(x.lat) || visti[x.testo]) return false;
        visti[x.testo] = true;
        return true;
    });
}

// Posizione sulla mappa: il centro del PAESE (se manca il paese, l'indirizzo come prima).
// Photon, poi Nominatim (OpenStreetMap)
async function rrGeocodifica(r) {
    const testo = r.paese ? r.paese
        : [r.indirizzo, (r.paese && rrNorm(r.indirizzo).indexOf(rrNorm(r.paese)) < 0) ? r.paese : ''].filter(Boolean).join(', ');
    if (!testo) return null;
    try {
        const lista = await rrPhoton(testo, 5);
        // Per il paese prendo un luogo (paese, frazione), non una via che si chiama come il paese
        const luogo = r.paese ? (lista.find(x => !x.via) || lista[0]) : lista[0];
        if (luogo) return { lat: luogo.lat, lon: luogo.lon, paese: r.paese ? null : luogo.paese };
    } catch (e) { console.log('Photon non risponde:', e); }
    try {
        await new Promise(ok => setTimeout(ok, 1100));    // Nominatim: massimo 1 richiesta al secondo
        const n = await rrNominatim(testo);
        if (n) return n;
    } catch (e) { console.log('Nominatim non risponde:', e); }
    return null;
}

// Cosa e' stato cercato per la posizione: se cambia, la posizione si ricalcola.
// Con il paese conta solo il paese (le richieste vecchie, posizionate con l'indirizzo, si spostano una volta al centro del paese)
function rrIndirizzoGeo(r) {
    return r.paese ? 'PAESE ' + rrNorm(r.paese) : rrNorm([r.indirizzo, r.paese].join(' '));
}

async function rrSalvaPosizione(r, pos) {
    const { error } = await supabaseClient.rpc('richieste_robot_posizione', {
        p_id: r.id,
        p_lat: pos ? pos.lat : null,
        p_lon: pos ? pos.lon : null,
        p_stato: pos ? 'OK' : 'NON_TROVATO',
        p_indirizzo: rrIndirizzoGeo(r),
        p_paese: pos && pos.paese ? pos.paese : null
    });
    if (error) throw error;
    r.lat = pos ? pos.lat : null;
    r.lon = pos ? pos.lon : null;
    r.geo_stato = pos ? 'OK' : 'NON_TROVATO';
    r.geo_indirizzo = rrIndirizzoGeo(r);
    if (!r.paese && pos && pos.paese) r.paese = pos.paese;
}

// Richieste senza posizione (nuove, da ordini, indirizzo cambiato): una alla volta, in sottofondo
async function rrGeocodificaMancanti() {
    if (rrGeoInCorso || !rrPuoPosizionare()) return;
    const daFare = rrRichieste.filter(r => rrAperta(r) && !rrGeoFalliti[r.id] && (r.indirizzo || r.paese) &&
        (!r.geo_stato || r.geo_indirizzo !== rrIndirizzoGeo(r)));
    if (!daFare.length) return;
    rrGeoInCorso = true;
    let cambiate = 0;
    try {
        for (const r of daFare) {
            const pos = await rrGeocodifica(r);
            try {
                await rrSalvaPosizione(r, pos);
                cambiate++;
            } catch (e) {
                rrGeoFalliti[r.id] = true;
                console.log('Posizione non salvata:', e);
            }
            if (!pos) rrGeoFalliti[r.id] = true;
            await new Promise(ok => setTimeout(ok, 1100));
        }
    } finally {
        rrGeoInCorso = false;
    }
    if (cambiate) rrRidisegnaSezioneAttiva();
}

// ---------- Salva / elimina ----------
async function rrSalva() {
    if (!rrPuoModificare()) return;
    const prima = rrModifica;
    const valori = {
        operatore: rrTesto(document.getElementById('rr-f-operatore').value) || null,
        data: document.getElementById('rr-f-data').value || rrOggi(),
        cliente: rrTesto(document.getElementById('rr-f-cliente').value),
        indirizzo: rrTesto(document.getElementById('rr-f-indirizzo').value),
        paese: rrTesto(document.getElementById('rr-f-paese').value) || null,
        telefono: String(document.getElementById('rr-f-telefono').value || '').trim().replace(/\s+/g, ' '),
        note: rrTesto(document.getElementById('rr-f-note').value) || null,
        tipo: intValoreScelta('rr-f-tipo') || 'INT',
        urgenza: rrLeggiUrgenza(),
        esito: intValoreScelta('rr-f-esito') || null
    };
    const errori = [];
    if (!valori.cliente) errori.push('Scrivi <strong>cognome e nome</strong> del cliente');
    if (!valori.indirizzo) errori.push('Scrivi <strong>via e civico</strong>');
    if (!valori.paese) errori.push('Scrivi il <strong>paese</strong> (serve per la mappa, il planning e il meteo)');
    if (!valori.telefono) errori.push('Scrivi il <strong>telefono</strong>');
    if (String(document.getElementById('rr-f-urgenza').value || '').trim() && !valori.urgenza) errori.push('Urgenza: scrivi un numero da 1 a 99 (es. 2 = U2)');
    if (errori.length) {
        await showCustomAlert(errori.join('<br>'), 'Controlla la richiesta', '&#9888;&#65039;');
        return;
    }

    // Posizione: da cercare (centro del paese) se il paese e' cambiato
    const geoNuovo = rrIndirizzoGeo(valori);
    if (!prima || prima.geo_indirizzo !== geoNuovo) {
        Object.assign(valori, { lat: null, lon: null, geo_stato: null, geo_indirizzo: null });
    }

    const adesso = new Date().toISOString();
    const utente = loggedInUserEmail || null;
    valori.updated_at = adesso;
    valori.updated_by = utente;

    const btn = document.getElementById('rr-f-salva');
    btn.disabled = true;
    let salvata = null;
    try {
        if (prima) {
            const { data, error } = await supabaseClient.from('richieste_robot').update(valori).eq('id', prima.id).select('*').single();
            if (error) throw error;
            salvata = data;
        } else {
            valori.created_by = utente;
            const { data, error } = await supabaseClient.from('richieste_robot').insert([valori]).select('*').single();
            if (error) throw error;
            salvata = data;
        }
    } catch (err) {
        rrErrore(err, 'salvataggio richiesta');
        return;
    } finally {
        btn.disabled = false;
    }
    rrChiudiFinestra();
    const i = rrRichieste.findIndex(x => x.id === salvata.id);
    const nuova = i < 0;
    if (i >= 0) rrRichieste[i] = salvata; else rrRichieste.push(salvata);
    rrOrdina();
    rrRidisegnaSezioneAttiva();
    if (nuova) rrScorriInFondo();
    rrAggiornaBadge();
    if (!salvata.geo_stato) {
        delete rrGeoFalliti[salvata.id];
        rrGeocodificaMancanti();
    }
}

async function rrElimina() {
    const r = rrModifica;
    if (!r || !rrPuoModificare()) return;
    if (!window.confirm('Eliminare la richiesta di ' + r.cliente + '?\n\n' +
        'Se e\' agganciata a una casella del planning, la casella resta ma non e\' piu\' collegata.\n' +
        'Per toglierla solo dalla mappa basta mettere esito NO.')) return;
    const { error } = await supabaseClient.from('richieste_robot').delete().eq('id', r.id);
    if (error) { rrErrore(error, 'eliminazione richiesta'); return; }
    rrChiudiFinestra();
    rrRichieste = rrRichieste.filter(x => x.id !== r.id);
    rrRidisegnaSezioneAttiva();
    rrAggiornaBadge();
}

function rrRidisegnaSezioneAttiva() {
    if (typeof currentSection === 'undefined') return;
    if (currentSection === 'richieste-robot') rrRenderRichieste();
    if (currentSection === 'organizzazione-robot') rrRenderOrganizzazione();
}

// ========================================
// FINE ANNO: PDF + PULIZIA (solo admin)
// ========================================
function rrAnniPresenti() {
    const anni = new Set(rrRichieste.map(r => parseInt(String(r.data).slice(0, 4), 10)).filter(Boolean));
    anni.add(new Date().getFullYear());
    return Array.from(anni).sort((a, b) => b - a);
}

function rrChiediAnno(azione) {
    const anni = rrAnniPresenti();
    const v = window.prompt(azione + '\n\nDi quale anno? (anni presenti: ' + anni.join(', ') + ')', String(anni[0]));
    if (v === null) return null;
    const anno = parseInt(v.trim(), 10);
    if (!anno || anno < 2000 || anno > 2100) {
        showCustomAlert('Anno non valido.', 'Fine anno', '&#9888;&#65039;');
        return null;
    }
    return anno;
}

function rrDocAnno(anno) {
    const righe = rrRichieste.filter(r => String(r.data).slice(0, 4) === String(anno))
        .slice().sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : a.id - b.id));
    const conta = e => righe.filter(r => (r.esito || '') === e).length;
    return {
        righe: righe,
        doc: {
            titolo: 'Richieste interventi robot ' + anno,
            sottotitolo: 'Tutte le richieste con data della chiamata nel ' + anno + '<br>Creato il ' + rptOggiTesto(),
            kpi: [
                { e: 'Richieste', v: righe.length },
                { e: 'Confermate (OK)', v: conta('OK') },
                { e: 'Annullate (NO)', v: conta('NO') },
                { e: 'Ancora aperte', v: righe.filter(rrAperta).length }
            ],
            nota: 'Tipo: INT = assistenza, SOP = sopralluogo, MONT = montaggio. Esito: - = organizzato, OK = confermato, NR = non risponde, NO = annullato.',
            sezioni: [{
                titolo: 'Richieste',
                piccola: true,
                colonne: [{ t: 'OP', w: '5%' }, { t: 'Data', w: '9%' }, { t: 'Cognome nome', w: '15%' }, { t: 'Indirizzo', w: '17%' },
                    { t: 'Telefono', w: '11%' }, { t: 'Note', w: '28%' }, { t: 'Tipo', w: '5%' }, { t: 'Urg.', w: '5%' }, { t: 'Esito', w: '5%' }],
                righe: righe.map(r => [rrEsc(r.operatore), rrDataIt(r.data), rrEsc(r.cliente),
                    rrEsc([r.indirizzo, r.paese && rrNorm(r.indirizzo).indexOf(rrNorm(r.paese)) < 0 ? r.paese : ''].filter(Boolean).join(', ')),
                    rrEsc(r.telefono), rrEsc(r.note), rrEsc(r.tipo), rrUrgenzaTesto(r), rrEsc(r.esito || '')])
            }]
        }
    };
}

async function rrPdfAnno(annoDato) {
    if (currentUserRole !== 'admin') return;
    const anno = annoDato || rrChiediAnno('PDF delle richieste interventi robot.');
    if (!anno) return;
    const x = rrDocAnno(anno);
    if (!x.righe.length) {
        showCustomAlert('Nessuna richiesta nel ' + anno + '.', 'PDF', '&#9888;&#65039;');
        return;
    }
    await pdfApriInScheda(() => rptCreaPdfBlob(x.doc), 'RICHIESTE INTERVENTI ROBOT ' + anno + '.pdf');
}

async function rrPuliziaAnno() {
    if (currentUserRole !== 'admin') return;
    const anno = rrChiediAnno('PULIZIA DI FINE ANNO\nPrima scarico il PDF di tutte le richieste dell\'anno, poi cancello dal server quelle CHIUSE (OK e NO).\nLe richieste ancora aperte restano.');
    if (!anno) return;
    const x = rrDocAnno(anno);
    if (!x.righe.length) {
        showCustomAlert('Nessuna richiesta nel ' + anno + ': niente da fare.', 'Pulizia ' + anno, '&#9888;&#65039;');
        return;
    }
    const chiuse = x.righe.filter(r => !rrAperta(r));
    await pdfApriInScheda(() => rptCreaPdfBlob(x.doc), 'RICHIESTE INTERVENTI ROBOT ' + anno + '.pdf');
    await showCustomAlert(
        'Ho creato il PDF <strong>RICHIESTE INTERVENTI ROBOT ' + anno + '</strong> (' + x.righe.length + ' richieste).<br><br>' +
        'Prima di continuare <strong>scaricalo, controllalo e salvalo su Google Drive</strong> (storico).<br>' +
        'Dopo l\'OK ti chieder&ograve; se cancellare dal server le <strong>' + chiuse.length + '</strong> richieste chiuse (OK e NO).<br>' +
        'Le ' + (x.righe.length - chiuse.length) + ' richieste ancora aperte restano.',
        'Pulizia ' + anno, '&#128230;');
    if (!chiuse.length) {
        showCustomAlert('Nessuna richiesta chiusa da cancellare nel ' + anno + '.', 'Pulizia ' + anno);
        return;
    }
    const conferma = window.prompt(
        'ATTENZIONE: verranno CANCELLATE dal server ' + chiuse.length + ' richieste chiuse (OK e NO) del ' + anno + '.\n' +
        'Non si possono recuperare dall\'app.\n\nHai salvato il PDF? Per confermare scrivi ' + anno + ':');
    if (conferma === null || conferma.trim() !== String(anno)) {
        showCustomAlert('Nessuna richiesta cancellata.', 'Pulizia ' + anno);
        return;
    }
    const ids = chiuse.map(r => r.id);
    for (let i = 0; i < ids.length; i += 200) {
        const { error } = await supabaseClient.from('richieste_robot').delete().in('id', ids.slice(i, i + 200));
        if (error) { rrErrore(error, 'pulizia fine anno'); await openRichiesteRobot(); return; }
    }
    await showCustomAlert(chiuse.length + ' richieste chiuse del ' + anno + ' cancellate.', 'Pulizia ' + anno, '&#9989;');
    await openRichiesteRobot();
}

// ========================================
// SEZIONE ORGANIZZAZIONE INTERVENTI ROBOT (mappa + contenitori)
// ========================================
async function openOrganizzazioneRobot() {
    rrAvviaTempoReale();
    const box = document.getElementById('org-contenitori');
    if (box && !rrCaricate) box.innerHTML = '<div class="rr-vuoto">Caricamento...</div>';
    try {
        await Promise.all([rrCarica(), rrTrovaSede()]);
    } catch (err) {
        rrErrore(err, 'lettura richieste');
        return;
    }
    rrRenderLegenda();
    try {
        await rrCaricaLeaflet();
        rrPreparaMappa();
    } catch (err) {
        const m = document.getElementById('org-mappa');
        if (m) m.innerHTML = '<div class="rr-vuoto">Mappa non disponibile (connessione?). I contenitori qui sotto funzionano lo stesso.</div>';
        console.log('Leaflet non caricato:', err);
    }
    rrRenderOrganizzazione();
    rrAggiornaBadge();
    rrGeocodificaMancanti();
}

function rrCaricaLeaflet() {
    if (window.L && window.L.map) return Promise.resolve();
    if (rrLeafletPromessa) return rrLeafletPromessa;
    rrLeafletPromessa = new Promise((ok, ko) => {
        if (!document.getElementById('rr-leaflet-css')) {
            const css = document.createElement('link');
            css.id = 'rr-leaflet-css';
            css.rel = 'stylesheet';
            css.href = RR_LEAFLET_CSS;
            document.head.appendChild(css);
        }
        const s = document.createElement('script');
        s.src = RR_LEAFLET_JS;
        s.onload = () => ok();
        s.onerror = () => { rrLeafletPromessa = null; ko(new Error('Libreria mappa non caricata')); };
        document.head.appendChild(s);
    });
    return rrLeafletPromessa;
}

// Sede: indirizzo dei Dati aziendali (cercato una volta e ricordato nel browser)
async function rrTrovaSede() {
    if (rrSede) return rrSede;
    const indirizzo = (typeof aziendaDati === 'object' && aziendaDati.indirizzo) ? aziendaDati.indirizzo : '';
    try {
        const salvata = JSON.parse(localStorage.getItem('rrSede') || 'null');
        if (salvata && salvata.indirizzo === indirizzo && salvata.lat) {
            rrSede = { lat: salvata.lat, lon: salvata.lon };
            return rrSede;
        }
    } catch (e) { /* niente */ }
    rrSede = RR_SEDE_RISERVA;
    if (!indirizzo) return rrSede;
    try {
        const pulito = indirizzo.replace(/\s+-\s+/g, ', ').replace(/\(([A-Z]{2})\)/i, '');
        const lista = await rrPhoton(pulito, 1);
        if (lista.length) {
            rrSede = { lat: lista[0].lat, lon: lista[0].lon };
            try { localStorage.setItem('rrSede', JSON.stringify({ indirizzo: indirizzo, lat: rrSede.lat, lon: rrSede.lon })); } catch (e) { /* niente */ }
        }
    } catch (e) {
        console.log('Sede non trovata, uso la posizione di riserva:', e);
    }
    return rrSede;
}

function rrKm(a, b) {
    const R = 6371;
    const rad = x => x * Math.PI / 180;
    const dLat = rad(b.lat - a.lat);
    const dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

function rrHaPosizione(r) {
    return typeof r.lat === 'number' && typeof r.lon === 'number' && !isNaN(r.lat) && !isNaN(r.lon);
}

function rrPreparaMappa() {
    const el = document.getElementById('org-mappa');
    if (!el || !window.L) return;
    const sede = rrPosizioneSede();
    if (!rrMappa) {
        el.innerHTML = '';
        rrMappa = L.map(el, { scrollWheelZoom: false }).setView([sede.lat, sede.lon], RR_ZOOM_INIZIALE);
        // Satellite (Esri World Imagery) con nomi di strade e paesi sopra, oppure mappa stradale OpenStreetMap.
        // La scelta (pulsante in alto a destra della mappa) resta ricordata nel browser.
        const satellite = L.layerGroup([
            L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                maxZoom: 19,
                attribution: 'Satellite &copy; Esri, Maxar, Earthstar Geographics'
            }),
            L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
                maxZoom: 19
            }),
            L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', {
                maxZoom: 19, opacity: 0.8
            })
        ]);
        const stradale = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
        });
        const sfondi = { 'Satellite': satellite, 'Mappa stradale': stradale };
        let scelto = 'Satellite';
        try { if (localStorage.getItem('rrSfondo') === 'Mappa stradale') scelto = 'Mappa stradale'; } catch (e) { /* niente */ }
        sfondi[scelto].addTo(rrMappa);
        L.control.layers(sfondi, null, { position: 'topleft', collapsed: false }).addTo(rrMappa);
        rrMappa.on('baselayerchange', ev => {
            try { localStorage.setItem('rrSfondo', ev.name); } catch (e) { /* niente */ }
        });
        // La sede sta SOTTO ai pallini (pannello piu' basso di quello dei cerchi)
        rrMappa.createPane('rrSede');
        rrMappa.getPane('rrSede').style.zIndex = 350;
        rrStratoSede = L.layerGroup().addTo(rrMappa);
        rrStratoPallini = L.layerGroup().addTo(rrMappa);
        // Rotella del mouse: zoom solo dopo un clic sulla mappa (non blocca lo scorrimento della pagina)
        rrMappa.on('click', () => rrMappa.scrollWheelZoom.enable());
        rrMappa.on('mouseout', () => rrMappa.scrollWheelZoom.disable());
    }
    rrStratoSede.clearLayers();
    RR_FASCE.forEach(f => {
        if (f.a === Infinity) return;
        L.circle([sede.lat, sede.lon], {
            radius: f.a * 1000, color: '#facc15', weight: 2, opacity: 0.9, fill: false, dashArray: '8 6', interactive: false, pane: 'rrSede'
        }).addTo(rrStratoSede);
    });
    L.marker([sede.lat, sede.lon], {
        icon: L.divIcon({ className: 'rr-sede-icona', html: '&#127968;', iconSize: [28, 28], iconAnchor: [14, 14] }),
        title: 'Sede', pane: 'rrSede'
    }).bindPopup('<strong>Sede</strong>' + (typeof aziendaDati === 'object' && aziendaDati.indirizzo ? '<br>' + rrEsc(aziendaDati.indirizzo) : '')).addTo(rrStratoSede);
    // La sezione era nascosta: la mappa deve ricalcolare le dimensioni
    setTimeout(() => { if (rrMappa) rrMappa.invalidateSize(); }, 120);
}

function rrPopupHtml(r) {
    const tel = String(r.telefono || '').trim();
    const scad = rrStatoScadenza(r);
    const stato = rrStatoMappa(r);
    const s = rrPosizioneSede();
    return '<div class="rr-popup">' +
        '<div class="rr-popup-nome">' + rrPallinoHtml(r) + ' <strong>' + rrEsc(r.cliente) + '</strong></div>' +
        '<div><span class="rr-tipo rr-tipo-' + rrEsc(r.tipo) + '">' + rrEsc(r.tipo) + '</span> ' + RR_TIPI[r.tipo] +
            (r.urgenza ? ' &middot; <strong>U' + r.urgenza + '</strong> entro ' + rrDataBreve(rrScadenza(r)) : '') +
            (scad === 'SCADUTA' ? ' <span class="rr-scad scaduta">SCADUTA</span>' : '') + '</div>' +
        (stato === 'ORGANIZZATA' ? '<div class="rr-popup-stato">&#128994; Organizzato, in attesa di conferma</div>' : '') +
        (stato === 'NR' ? '<div class="rr-popup-stato">&#9898; Non risponde (NR)</div>' : '') +
        '<div><a href="' + rrEsc(rrMapsUrl(r)) + '" target="_blank" rel="noopener">&#128205; ' + rrEsc(rrIndirizzoCompleto(r) || r.paese) + '</a>' +
            (rrHaPosizione(r) ? ' <small>(' + rrKm(s, r).toFixed(1).replace('.', ',') + ' km)</small>' : '') + '</div>' +
        (tel ? '<div><a href="' + rrTelHref(tel) + '">&#128222; ' + rrEsc(tel) + '</a></div>' : '') +
        (r.note ? '<div class="rr-popup-note">' + rrEsc(r.note) + '</div>' : '') +
        '<div class="rr-popup-piede">Chiamata del ' + rrDataIt(r.data) + (r.operatore ? ' (' + rrEsc(r.operatore) + ')' : '') + '</div>' +
        (rrPuoModificare() ? '<button type="button" class="rr-popup-btn" onclick="rrApriModifica(' + r.id + ')">&#9999;&#65039; Modifica</button>' : '') +
        '</div>';
}

function rrVisibileInMappa(r) {
    return rrStatoMappa(r) !== 'NASCOSTA' && !rrNascondiTipi[r.tipo];
}

function rrRenderMappaPallini() {
    if (!rrMappa || !rrStratoPallini) return;
    rrStratoPallini.clearLayers();
    rrMarcatori = {};
    const lista = rrRichieste.filter(r => rrVisibileInMappa(r) && rrHaPosizione(r));
    // Piu' richieste nello stesso punto (es. centro del paese): pallini affiancati a spirale
    const perPunto = {};
    // Prima i meno urgenti: i piu' urgenti vengono disegnati sopra
    lista.slice().sort((a, b) => rrLivello(b) - rrLivello(a)).forEach(r => {
        const chiave = r.lat.toFixed(4) + '|' + r.lon.toFixed(4);
        const k = perPunto[chiave] = (perPunto[chiave] || 0) + 1;
        let lat = r.lat, lon = r.lon;
        if (k > 1) {
            const ang = k * 2.4;
            const dist = 0.0009 * Math.sqrt(k);
            lat += dist * Math.sin(ang);
            lon += dist * Math.cos(ang) * 1.4;
        }
        const stato = rrStatoMappa(r);
        const scaduta = rrStatoScadenza(r) === 'SCADUTA';
        const m = L.circleMarker([lat, lon], {
            radius: 9,
            color: scaduta ? '#000000' : (stato === 'NR' ? '#4b5563' : '#1f2937'),
            weight: scaduta ? 3.5 : 1.5,
            fillColor: rrColore(r),
            fillOpacity: 0.95
        }).bindPopup(rrPopupHtml(r), { maxWidth: 280 });
        m.bindTooltip(rrEsc(r.cliente), { direction: 'top', offset: [0, -8] });
        m.addTo(rrStratoPallini);
        rrMarcatori[r.id] = m;
    });
}

function rrRenderLegenda() {
    const box = document.getElementById('org-legenda');
    if (!box) return;
    const scala = (tipo, nome) => '<div class="rr-leg-riga">' +
        '<label class="rr-leg-filtro"><input type="checkbox" ' + (rrNascondiTipi[tipo] ? '' : 'checked ') + 'onchange="rrMostraTipo(\'' + tipo + '\', this.checked)"> ' + nome + '</label>' +
        '<span class="rr-leg-scala">' + RR_COLORI[tipo].map((c, i) =>
            '<span class="rr-leg-voce"><span class="rr-pallino" style="background:' + c + '"></span>' + (i < 4 ? 'U' + (i + 1) : i === 4 ? 'U5+' : 'senza') + '</span>').join('') +
        '</span></div>';
    box.innerHTML =
        scala('INT', 'Assistenza') + scala('MONT', 'Montaggio') + scala('SOP', 'Sopralluogo') +
        '<div class="rr-leg-riga rr-leg-stati">' +
            '<span class="rr-leg-voce"><span class="rr-pallino" style="background:' + RR_COLORE_ORGANIZZATO + '"></span>Organizzato (esito ?)</span>' +
            '<span class="rr-leg-voce"><span class="rr-pallino bianco"></span>Non risponde (NR)</span>' +
            '<span class="rr-leg-voce"><span class="rr-pallino scaduto" style="background:#f87171"></span>Bordo nero = scaduta</span>' +
            '<span class="rr-leg-voce">&#127968; Sede &middot; cerchi ogni 10 km</span>' +
        '</div>';
}

function rrMostraTipo(tipo, mostra) {
    if (mostra) delete rrNascondiTipi[tipo]; else rrNascondiTipi[tipo] = true;
    rrRenderOrganizzazione();
}

function rrRenderOrganizzazione() {
    rrRenderAvvisi('org-avvisi');
    rrRenderMappaPallini();
    rrRenderContenitori();
}

function rrRenderContenitori() {
    const box = document.getElementById('org-contenitori');
    if (!box) return;
    const sede = rrPosizioneSede();
    const lista = rrRichieste.filter(rrVisibileInMappa);
    const conta = document.getElementById('org-conta');
    if (conta) {
        const daOrg = lista.filter(r => rrStatoMappa(r) === 'DA_ORGANIZZARE').length;
        conta.innerHTML = '<strong>' + daOrg + '</strong> da organizzare &middot; ' +
            lista.filter(r => rrStatoMappa(r) === 'ORGANIZZATA').length + ' organizzate &middot; ' +
            lista.filter(r => rrStatoMappa(r) === 'NR').length + ' NR';
    }
    if (!lista.length) {
        box.innerHTML = '<div class="rr-vuoto">Nessuna richiesta aperta. &#127881;</div>';
        return;
    }
    const gruppi = RR_FASCE.map(f => ({ fascia: f, voci: [] }));
    const senzaPos = [];
    lista.forEach(r => {
        if (!rrHaPosizione(r)) { senzaPos.push({ r: r, km: null }); return; }
        const km = rrKm(sede, r);
        const g = gruppi.find(x => km >= x.fascia.da && km < x.fascia.a);
        g.voci.push({ r: r, km: km });
    });

    const html = gruppi.map(g => rrHtmlContenitore(g.fascia.titolo, g.voci, false)).join('') +
        (senzaPos.length ? rrHtmlContenitore('&#128205; Posizione sconosciuta', senzaPos, true) : '');
    box.innerHTML = html;
}

function rrHtmlContenitore(titolo, voci, senzaPosizione) {
    const daOrg = voci.filter(v => rrStatoMappa(v.r) === 'DA_ORGANIZZARE').length;
    let corpo = '';
    if (!voci.length) {
        corpo = '<div class="org-vuoto">Nessun cliente</div>';
    } else {
        // Divisi per urgenza: U1, U2, ... poi senza urgenza
        const perUrg = {};
        voci.forEach(v => {
            const k = v.r.urgenza ? v.r.urgenza : 999;
            (perUrg[k] = perUrg[k] || []).push(v);
        });
        Object.keys(perUrg).map(Number).sort((a, b) => a - b).forEach(k => {
            const elenco = perUrg[k].sort((a, b) => {
                const sa = rrStatoMappa(a.r) === 'DA_ORGANIZZARE' ? 0 : 1;
                const sb = rrStatoMappa(b.r) === 'DA_ORGANIZZARE' ? 0 : 1;
                if (sa !== sb) return sa - sb;
                return (a.km || 0) - (b.km || 0);
            });
            corpo += '<div class="org-urg"><div class="org-urg-titolo">' + (k === 999 ? 'Senza urgenza' : 'U' + k) +
                ' <span>(' + elenco.length + ')</span></div>' + elenco.map(v => rrHtmlVoce(v, senzaPosizione)).join('') + '</div>';
        });
    }
    return '<div class="org-box' + (senzaPosizione ? ' senza-pos' : '') + '">' +
        '<div class="org-box-titolo"><span>' + titolo + '</span><span class="org-box-conta">' + daOrg + (voci.length !== daOrg ? ' / ' + voci.length : '') + '</span></div>' +
        (senzaPosizione ? '<div class="org-nota">Paese non trovato (o in ricerca): controlla il paese nella richiesta.</div>' : '') +
        corpo + '</div>';
}

function rrHtmlVoce(v, senzaPosizione) {
    const r = v.r;
    const stato = rrStatoMappa(r);
    const barrata = stato === 'ORGANIZZATA' || stato === 'NR';
    const scad = rrStatoScadenza(r);
    const tel = String(r.telefono || '').trim();
    const azione = senzaPosizione ? (rrPuoModificare() ? 'rrApriModifica(' + r.id + ')' : '') : 'rrMostraSullaMappa(' + r.id + ')';
    return '<div class="org-voce' + (barrata ? ' barrata' : '') + (scad ? ' scad-' + scad.toLowerCase() : '') + '"' +
        (azione ? ' onclick="' + azione + '"' : '') + '>' +
        rrPallinoHtml(r) +
        '<div class="org-voce-testo">' +
            '<div class="org-voce-nome">' + rrEsc(r.cliente) + '</div>' +
            '<div class="org-voce-info">' + rrEsc(rrPaese(r)) + (v.km !== null ? ' &middot; ' + v.km.toFixed(1).replace('.', ',') + ' km' : '') +
                ' &middot; <span class="rr-tipo rr-tipo-' + rrEsc(r.tipo) + '">' + rrEsc(r.tipo) + '</span>' +
                (stato === 'ORGANIZZATA' ? ' <span class="org-stato">ORGANIZZATO</span>' : '') +
                (stato === 'NR' ? ' <span class="org-stato nr">NR</span>' : '') +
                (scad === 'SCADUTA' ? ' <span class="rr-scad scaduta">SCADUTA</span>' : scad === 'OGGI' ? ' <span class="rr-scad oggi">OGGI</span>' : '') +
            '</div>' +
        '</div>' +
        (tel ? '<a class="org-voce-tel" href="' + rrTelHref(tel) + '" onclick="event.stopPropagation()" title="Chiama ' + rrEsc(tel) + '">&#128222;</a>' : '') +
        '</div>';
}

function rrMostraSullaMappa(id) {
    const m = rrMarcatori[id];
    const el = document.getElementById('org-mappa');
    if (!m || !rrMappa) return;
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    rrMappa.setView(m.getLatLng(), Math.max(rrMappa.getZoom(), 13));
    setTimeout(() => m.openPopup(), 250);
}

function rrCentraSede() {
    if (!rrMappa) return;
    const s = rrPosizioneSede();
    rrMappa.setView([s.lat, s.lon], RR_ZOOM_INIZIALE);
}

// ========================================
// BADGE (scadute + in scadenza oggi) sulle card ASSISTENZA
// ========================================
async function rrAggiornaBadge() {
    if (typeof sezioneConsentita !== 'function' || !sezioneConsentita('richieste-robot')) {
        rrScriviBadge(0);
        return;
    }
    if (!rrCaricate) {
        try { await rrCarica(); } catch (e) { rrScriviBadge(0); return; }
    }
    const c = rrConteggiScadenze();
    rrScriviBadge(c.SCADUTA + c.OGGI, c);
}

function rrScriviBadge(n, c) {
    const titolo = c ? (c.SCADUTA + ' scadute, ' + c.OGGI + ' in scadenza oggi') : '';
    ['ass-badge-dashboard', 'ass-badge-richieste', 'ass-badge-organizzazione'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = n > 99 ? '99+' : String(n);
        el.title = titolo;
        el.classList.toggle('hidden', !n);
    });
}

// ========================================
// TEMPO REALE
// ========================================
function rrAvviaTempoReale() {
    if (rrCanale || typeof supabaseClient === 'undefined') return;
    try {
        rrCanale = supabaseClient
            .channel('richieste-robot')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'richieste_robot' }, () => rrRicaricaDaRemoto())
            .subscribe();
    } catch (err) {
        console.log('Tempo reale richieste non disponibile:', err);
    }
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') rrRicaricaDaRemoto();
    });
}

function rrRicaricaDaRemoto() {
    if (!currentUser) return;
    clearTimeout(rrRicaricaTimer);
    rrRicaricaTimer = setTimeout(async () => {
        const attiva = currentSection === 'richieste-robot' || currentSection === 'organizzazione-robot';
        if (!attiva) { rrCaricate = false; rrAggiornaBadge(); return; }
        try { await rrCarica(); } catch (e) { return; }
        // Finestra aperta: non ridisegno sotto le mani (si aggiorna alla chiusura)
        rrRidisegnaSezioneAttiva();
        rrAggiornaBadge();
    }, 600);
}

// ========================================
// COLLEGAMENTO CON GLI ORDINI CLIENTI
// Dopo il salvataggio / la modifica / l'annullo di un ordine: se ha robot o antizanzare
// e NON e' "senza servizio di installazione" crea (o aggiorna) la richiesta di montaggio.
// ========================================
async function rrSincronizzaOrdine(ordineId) {
    if (!ordineId) return;
    try {
        const { data, error } = await supabaseClient.rpc('richieste_robot_da_ordine', { p_ordine_id: ordineId });
        if (error) throw error;
        if (data === 'CREATA') rrToast('&#129302; Creata la richiesta di <strong>montaggio</strong> in Assistenza &gt; Richieste interventi robot');
        if (data === 'TOLTA' || data === 'ANNULLATA') rrToast('&#129302; Richiesta di montaggio tolta (ordine annullato o senza installazione)');
        if (data && data !== 'NIENTE') { rrCaricate = false; rrAggiornaBadge(); }
    } catch (err) {
        console.log('Richiesta di montaggio dall\'ordine non aggiornata (script richieste-robot-setup.sql eseguito?):', err);
    }
}

// ========================================
// COLLEGAMENTO CON IL PLANNING (Interventi esterni)
// ========================================
// Richieste ancora aperte (esito vuoto, "-" o NR) per i suggerimenti del campo Cliente
async function rrCandidatiPlanning() {
    const { data, error } = await supabaseClient.from('richieste_robot')
        .select('id, data, cliente, indirizzo, paese, telefono, tipo, urgenza, esito, note, lat, lon')
        .or('esito.is.null,esito.not.in.(OK,NO)')
        .order('data', { ascending: false })
        .limit(1000);
    if (error) throw error;
    return data || [];
}

// "rossi mario" o "mario rossi": tutte le parole scritte devono essere l'inizio di una parola del nome
function rrCorrisponde(r, testo) {
    const nome = String(testo || '').split(' - ')[0];
    const parole = rrNorm(nome).split(' ').filter(p => p.length >= 2);
    if (!parole.length) return false;
    const nomi = rrNorm(r.cliente).split(' ');
    return parole.every(p => nomi.some(n => n.startsWith(p)));
}

// ========================================
// FUNZIONI USATE DALL'HTML (onclick)
// ========================================
window.openRichiesteRobot = openRichiesteRobot;
window.openOrganizzazioneRobot = openOrganizzazioneRobot;
window.rrApriNuova = rrApriNuova;
window.rrApriModifica = rrApriModifica;
window.rrChiudiFinestra = rrChiudiFinestra;
window.rrSalva = rrSalva;
window.rrElimina = rrElimina;
window.rrScegliTipo = rrScegliTipo;
window.rrNoteCambiate = rrNoteCambiate;
window.rrScegliUrgenza = rrScegliUrgenza;
window.rrAggiornaScadenzaForm = rrAggiornaScadenzaForm;
window.rrIndirizzoCambiato = rrIndirizzoCambiato;
window.rrIndirizzoTasto = rrIndirizzoTasto;
window.rrScegliSuggerimento = rrScegliSuggerimento;
window.rrNascondiSuggerimenti = rrNascondiSuggerimenti;
window.rrImpostaFiltro = rrImpostaFiltro;
window.rrCambiaCerca = rrCambiaCerca;
window.rrPdfAnno = rrPdfAnno;
window.rrPuliziaAnno = rrPuliziaAnno;
window.rrMostraTipo = rrMostraTipo;
window.rrMostraSullaMappa = rrMostraSullaMappa;
window.rrCentraSede = rrCentraSede;
window.rrAggiornaBadge = rrAggiornaBadge;
window.rrSincronizzaOrdine = rrSincronizzaOrdine;
window.rrNomeFestivo = rrNomeFestivo;
