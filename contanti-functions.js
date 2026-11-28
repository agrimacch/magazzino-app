// ========================================
// CONTANTI (v8.3.0) - chi ha in mano i soldi degli ordini clienti
// ----------------------------------------
// Ogni acconto / saldo pagato in CONTANTI e registrato dall'installazione in poi e' un "incasso".
// All'inizio i soldi sono di chi l'ha registrato. Per passarli a un collega:
//   chi DA' preme "Dai contanti" -> l'app mostra un QR che vale 60 secondi;
//   chi RICEVE preme "Ricevo contanti", legge il QR e conferma con "Ricevo EUR ...".
//   Solo chi riceve cambia chi ha i soldi (funzione contanti_ricevi su Supabase).
// Chi ha i soldi (admin o operatore) alla fine segna "Versato in cassa / banca" (solo i suoi).
// Chi riceve i soldi NON compare sul PDF del cliente.
// Admin e operatori (CONT_RUOLI qui, contanti_puo() su Supabase: supabase/contanti-setup.sql), solo da telefono / tablet.
// ========================================

const CONT_RUOLI = ['admin', 'operatore'];
const CONT_PREFISSO_QR = 'AGRICASH:';
const CONT_LIB_QR = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js';

let contIncassi = [];        // contanti_incassi non versati e non spariti
let contPassaggi = [];       // ultimi passaggi
let contOrdini = {};         // ordine_id -> { numero, anno, cliente }
let contSel = new Set();     // miei incassi scelti per il QR / versamento
let contQr = null;           // QR mostrato: { token, scade, timer, poll }
let contScanner = null;
let contLetto = null;        // QR letto da chi riceve: { token, da, importo, n, scade, timer }
let contCaricato = false;

// Solo su smartphone e tablet (v8.3.0): sul PC la sezione non si vede (servono fotocamera e QR a mano)
// iPad recenti si presentano come Mac: li riconosco dallo schermo touch
function contSuTelefono() {
    const ua = navigator.userAgent || '';
    return /iPhone|iPad|iPod|Android/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function contPuoVedere() {
    return typeof currentUserRole !== 'undefined' && CONT_RUOLI.includes(currentUserRole) && contSuTelefono();
}
function contAdmin() { return typeof currentUserRole !== 'undefined' && currentUserRole === 'admin'; }
function contMe() { return String((typeof currentUser !== 'undefined' && currentUser && currentUser.email) || '').toLowerCase(); }
function contEsc(v) {
    return String(v === null || v === undefined ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function contChi(email) {
    if (!email) return '-';
    if (email === 'CASSA') return 'CASSA';
    return typeof macChi === 'function' ? macChi(email) : String(email).split('@')[0].toUpperCase();
}
function contEuro(n) {
    return '&#8364;&nbsp;' + Number(n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function contEuroTesto(n) {
    return 'EUR ' + Number(n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function contData(d) {
    if (!d) return '';
    const p = String(d).slice(0, 10).split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : String(d);
}
function contQuando(iso) {
    const d = new Date(iso);
    return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + ' ' +
        String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
function contSomma(lista) { return Math.round(lista.reduce((t, i) => t + Number(i.importo || 0), 0) * 100) / 100; }
function contMiei() { return contIncassi.filter(i => String(i.detentore).toLowerCase() === contMe()); }

function contErrore(err, cosa) {
    console.error('Contanti - ' + cosa + ':', err);
    const m = String((err && err.message) || err || '');
    const manca = /contanti_|function .* does not exist|schema cache/i.test(m)
        ? '<br><br>Esegui su Supabase gli script <strong>supabase/ordini-incasso.sql</strong> e <strong>supabase/contanti-setup.sql</strong>.' : '';
    if (typeof showCustomAlert === 'function') showCustomAlert(contEsc(m) + manca, 'Contanti', '&#10060;');
}

function contToast(html) {
    if (typeof cartToast === 'function') { cartToast(html); return; }
    if (typeof showCustomAlert === 'function') showCustomAlert(html, 'Contanti', '&#10004;');
}

// ---------- Caricamento ----------
async function contCarica() {
    const s = await supabaseClient.rpc('contanti_sincronizza');
    if (s.error) throw s.error;
    const [inc, pas] = await Promise.all([
        supabaseClient.from('contanti_incassi').select('*').is('versato_at', null).eq('sparito', false).order('data', { ascending: true }).limit(1000),
        supabaseClient.from('contanti_passaggi').select('*').order('at', { ascending: false }).limit(40)
    ]);
    if (inc.error) throw inc.error;
    if (pas.error) throw pas.error;
    contIncassi = inc.data || [];
    contPassaggi = pas.data || [];
    const ids = [...new Set(contIncassi.map(i => i.ordine_id))];
    contOrdini = {};
    if (ids.length) {
        const o = await supabaseClient.from('macchine_ordini').select('id, numero, anno, cliente').in('id', ids);
        if (!o.error) (o.data || []).forEach(x => { contOrdini[x.id] = x; });
    }
    // tengo scelti solo quelli ancora miei (la prima volta: tutti i miei)
    const miei = new Set(contMiei().map(i => i.id));
    if (!contCaricato) contSel = new Set(miei);
    else contSel = new Set([...contSel].filter(id => miei.has(id)));
    contCaricato = true;
}

async function openContanti() {
    const box = document.getElementById('cont-contenuto');
    if (box && !contCaricato) box.innerHTML = '<p class="cont-vuoto">&#8987; Caricamento...</p>';
    try {
        await contCarica();
    } catch (err) {
        if (box) box.innerHTML = '<p class="cont-vuoto">&#10060; Contanti non caricati. Hai eseguito su Supabase <strong>supabase/ordini-incasso.sql</strong> e <strong>supabase/contanti-setup.sql</strong>?</p>';
        console.error('Contanti - caricamento:', err);
        return;
    }
    contRender();
}

// ---------- Disegno ----------
function contTestoIncasso(i) {
    const o = contOrdini[i.ordine_id];
    return '<span class="cont-inc-ord">' + (o ? 'N. ' + contEsc(o.numero + '/' + o.anno) + ' &middot; <strong>' + contEsc(o.cliente) + '</strong>' : 'Ordine ' + i.ordine_id) + '</span>' +
        '<span class="cont-inc-sub">' + (i.tipo === 'SALDO' ? 'Saldo' : 'Acconto') + (i.data ? ' del ' + contData(i.data) : '') +
        ' &middot; registrato da ' + contEsc(contChi(i.registrato_da)) + '</span>';
}

function contRender() {
    const box = document.getElementById('cont-contenuto');
    if (!box) return;
    const miei = contMiei();
    const scelti = miei.filter(i => contSel.has(i.id));
    const totScelti = contSomma(scelti);

    // contanti di tutti, per persona
    const perChi = {};
    contIncassi.forEach(i => {
        const k = String(i.detentore).toLowerCase();
        (perChi[k] = perChi[k] || []).push(i);
    });
    const persone = Object.keys(perChi).sort((a, b) => contSomma(perChi[b]) - contSomma(perChi[a]));

    box.innerHTML =
        '<div class="cont-mio">' +
            '<div class="cont-mio-et">&#128181; I tuoi contanti</div>' +
            '<div class="cont-mio-tot">' + contEuro(contSomma(miei)) + '</div>' +
            '<div class="cont-mio-n">' + miei.length + (miei.length === 1 ? ' incasso' : ' incassi') + '</div>' +
            '<div class="cont-pulsanti">' +
                '<button type="button" class="btn-primary cont-btn-dai"' + (scelti.length ? '' : ' disabled') + ' onclick="contDai()">&#128228; Dai contanti ' + contEuro(totScelti) + '</button>' +
                '<button type="button" class="btn-primary cont-btn-ricevi" onclick="contApriLettore()">&#128229; Ricevo contanti</button>' +
                '<button type="button" class="btn-back cont-btn-versa"' + (scelti.length ? '' : ' disabled') + ' onclick="contVersa()">&#127974; Versato in cassa / banca</button>' +
            '</div>' +
        '</div>' +
        (miei.length
            ? '<div class="cont-lista">' + miei.map(i =>
                '<label class="cont-inc">' +
                    '<input type="checkbox"' + (contSel.has(i.id) ? ' checked' : '') + ' onchange="contScegli(' + i.id + ', this.checked)">' +
                    '<span class="cont-inc-testo">' + contTestoIncasso(i) + '</span>' +
                    '<strong class="cont-inc-euro">' + contEuro(i.importo) + '</strong>' +
                '</label>').join('') + '</div>'
            : '<p class="cont-vuoto">Non hai contanti in mano.</p>') +

        '<h3 class="cont-tit">&#128101; Contanti in giro</h3>' +
        (persone.length
            ? '<div class="cont-persone">' + persone.map(k =>
                '<details class="cont-persona"' + (k === contMe() ? ' open' : '') + '>' +
                    '<summary><span class="cont-chi">' + contEsc(contChi(k)) + '</span><strong>' + contEuro(contSomma(perChi[k])) + '</strong>' +
                        '<small>' + perChi[k].length + (perChi[k].length === 1 ? ' incasso' : ' incassi') + '</small></summary>' +
                    perChi[k].map(i => '<div class="cont-inc cont-inc-sola">' +
                        '<span class="cont-inc-testo">' + contTestoIncasso(i) + '</span><strong class="cont-inc-euro">' + contEuro(i.importo) + '</strong></div>').join('') +
                '</details>').join('') + '</div>'
            : '<p class="cont-vuoto">Nessun contante da versare.</p>') +

        '<h3 class="cont-tit">&#128260; Ultimi passaggi</h3>' +
        (contPassaggi.length
            ? '<div class="cont-passaggi">' + contPassaggi.map(p =>
                '<div class="cont-pass' + (p.tipo === 'VERSATO' ? ' cont-pass-versato' : '') + '">' +
                    '<span class="cont-pass-quando">' + contQuando(p.at) + '</span>' +
                    '<span class="cont-pass-chi">' + contEsc(contChi(p.da_email)) + ' &#10140; ' +
                        (p.tipo === 'VERSATO' ? '&#127974; VERSATO' : contEsc(contChi(p.a_email))) + '</span>' +
                    '<strong>' + contEuro(p.importo) + '</strong>' +
                '</div>').join('') + '</div>'
            : '<p class="cont-vuoto">Nessun passaggio.</p>') +
        '<p class="cont-aiuto">Contano gli acconti e i saldi in <strong>contanti</strong> registrati da quando la sezione &#232; attiva. ' +
            'I soldi passano a un collega solo quando lui legge il QR e preme &quot;Ricevo&quot;.</p>';
}

function contScegli(id, si) {
    if (si) contSel.add(id); else contSel.delete(id);
    contRender();
}

// ---------- Chi DA': QR per 60 secondi ----------
function contCaricaLibQr() {
    if (typeof window.qrcode === 'function') return Promise.resolve();
    return new Promise((ok, ko) => {
        const s = document.createElement('script');
        s.src = CONT_LIB_QR;
        s.onload = () => ok();
        s.onerror = () => ko(new Error('Libreria QR non caricata (connessione?)'));
        document.head.appendChild(s);
    });
}

async function contDai() {
    const scelti = contMiei().filter(i => contSel.has(i.id));
    if (!scelti.length) return;
    try {
        await contCaricaLibQr();
        const { data, error } = await supabaseClient.rpc('contanti_crea_qr', { p_incassi: scelti.map(i => i.id) });
        if (error) throw error;
        const r = Array.isArray(data) ? data[0] : data;
        if (!r || !r.qr_token) throw new Error('QR non creato');
        contMostraQr(r.qr_token, Number(r.qr_importo), new Date(r.qr_scade), scelti.length);
    } catch (err) {
        contErrore(err, 'creazione QR');
        openContanti();
    }
}

function contMostraQr(token, importo, scade, n) {
    contChiudiQr(true);
    const qr = window.qrcode(0, 'M');
    qr.addData(CONT_PREFISSO_QR + token);
    qr.make();
    document.getElementById('cont-qr-corpo').innerHTML =
        '<div class="cont-qr-euro">' + contEuro(importo) + '</div>' +
        '<div class="cont-qr-n">' + n + (n === 1 ? ' incasso' : ' incassi') + '</div>' +
        '<div class="cont-qr-img">' + qr.createSvgTag(8, 2) + '</div>' +
        '<div class="cont-qr-aiuto">Fai leggere questo QR a chi riceve i soldi<br>(Contanti &#10140; <strong>Ricevo contanti</strong>)</div>' +
        '<div id="cont-qr-tempo" class="cont-qr-tempo"></div>';
    document.getElementById('cont-qr-modal').classList.remove('hidden');
    contQr = { token: token, scade: scade, timer: null, poll: null };
    const tick = () => {
        const s = Math.max(0, Math.ceil((contQr.scade.getTime() - Date.now()) / 1000));
        const el = document.getElementById('cont-qr-tempo');
        if (el) el.innerHTML = s > 0 ? '&#9203; Vale ancora <strong>' + s + '</strong> secondi' : '&#8987; QR scaduto';
        if (s <= 0) contQrScaduto();
    };
    tick();
    contQr.timer = setInterval(tick, 500);
    contQr.poll = setInterval(contControllaQr, 2000);
}

async function contControllaQr() {
    if (!contQr) return;
    const token = contQr.token;
    const { data, error } = await supabaseClient.rpc('contanti_leggi_qr', { p_token: token });
    if (error || !contQr || contQr.token !== token) return;
    const r = Array.isArray(data) ? data[0] : data;
    if (r && r.q_usato) {
        contChiudiQr(true);
        document.getElementById('cont-qr-corpo').innerHTML =
            '<div class="cont-qr-fatto">&#9989;</div>' +
            '<div class="cont-qr-euro">' + contEuro(r.q_importo) + '</div>' +
            '<div class="cont-qr-aiuto">Ricevuti da <strong>' + contEsc(contChi(r.q_a)) + '</strong>.<br>Non sono pi&ugrave; in mano a te.</div>';
        openContanti();
    }
}

function contQrScaduto() {
    if (!contQr) return;
    clearInterval(contQr.timer);
    contQr.timer = null;
    // un ultimo controllo: magari l'ha letto proprio all'ultimo
    contControllaQr();
    const corpo = document.getElementById('cont-qr-corpo');
    const img = corpo && corpo.querySelector('.cont-qr-img');
    if (img) img.classList.add('cont-qr-scaduto');
    const el = document.getElementById('cont-qr-tempo');
    if (el) el.innerHTML = '&#8987; QR scaduto. <button type="button" class="btn-primary cont-btn-piccolo" onclick="contDai()">&#128260; Nuovo QR</button>';
    setTimeout(() => { if (contQr && !contQr.timer) { clearInterval(contQr.poll); contQr.poll = null; } }, 2500);
}

// soloTimer: ferma i controlli ma lascia aperta la finestra
function contChiudiQr(soloTimer) {
    if (contQr) {
        clearInterval(contQr.timer);
        clearInterval(contQr.poll);
        contQr = null;
    }
    if (!soloTimer) document.getElementById('cont-qr-modal').classList.add('hidden');
}

// ---------- Chi RICEVE: legge il QR e conferma ----------
function contApriLettore() {
    contLetto = null;
    document.getElementById('cont-ricevi-corpo').innerHTML =
        '<div id="cont-reader" class="cont-reader"></div>' +
        '<p class="cont-qr-aiuto">Inquadra il QR sul telefono di chi ti d&agrave; i soldi.</p>';
    document.getElementById('cont-ricevi-modal').classList.remove('hidden');
    if (typeof Html5Qrcode === 'undefined') {
        document.getElementById('cont-ricevi-corpo').innerHTML = '<p class="cont-vuoto">&#10060; Lettore non disponibile su questo dispositivo.</p>';
        return;
    }
    if (typeof stopScanner === 'function') stopScanner();
    contScanner = new Html5Qrcode('cont-reader');
    contScanner.start(
        { facingMode: 'environment' },
        { fps: 12, qrbox: { width: 240, height: 240 } },
        (testo) => {
            const t = String(testo || '').trim();
            if (t.indexOf(CONT_PREFISSO_QR) !== 0) return;   // non e' un QR dei contanti: continuo a cercare
            if (navigator.vibrate) navigator.vibrate(80);
            contFermaLettore();
            contQrLetto(t.slice(CONT_PREFISSO_QR.length));
        },
        () => {}
    ).catch(err => {
        console.error('Contanti - fotocamera:', err);
        contFermaLettore();
        document.getElementById('cont-ricevi-corpo').innerHTML = '<p class="cont-vuoto">&#10060; Non riesco ad avviare la fotocamera. Controlla i permessi.</p>';
    });
}

function contFermaLettore() {
    if (!contScanner) return;
    const s = contScanner;
    contScanner = null;
    if (s.isScanning) s.stop().then(() => s.clear()).catch(e => console.error(e));
    else { try { s.clear(); } catch (e) { /* niente */ } }
}

async function contQrLetto(token) {
    const corpo = document.getElementById('cont-ricevi-corpo');
    corpo.innerHTML = '<p class="cont-vuoto">&#8987; Controllo il QR...</p>';
    const { data, error } = await supabaseClient.rpc('contanti_leggi_qr', { p_token: token });
    const r = !error && (Array.isArray(data) ? data[0] : data);
    if (!r) { corpo.innerHTML = '<p class="cont-vuoto">&#10060; QR non valido.</p>' + contBtnRiprova(); return; }
    if (r.q_usato) { corpo.innerHTML = '<p class="cont-vuoto">&#10060; Questo QR &#232; gi&agrave; stato usato.</p>' + contBtnRiprova(); return; }
    if (String(r.q_da).toLowerCase() === contMe()) { corpo.innerHTML = '<p class="cont-vuoto">&#10060; Questo QR &#232; tuo: deve leggerlo chi riceve i soldi.</p>' + contBtnRiprova(); return; }
    contLetto = { token: token, da: r.q_da, importo: Number(r.q_importo), n: r.q_n, scade: new Date(r.q_scade), timer: null };
    corpo.innerHTML =
        '<div class="cont-qr-aiuto">Da <strong>' + contEsc(contChi(r.q_da)) + '</strong> &middot; ' + r.q_n + (r.q_n === 1 ? ' incasso' : ' incassi') + '</div>' +
        '<button type="button" class="btn-primary cont-btn-ricevo" id="cont-btn-ricevo" onclick="contRicevo()">&#128229; Ricevo ' + contEuro(r.q_importo) + '</button>' +
        '<div id="cont-ricevi-tempo" class="cont-qr-tempo"></div>' +
        '<p class="cont-qr-aiuto">Conta i soldi prima di premere: da quel momento li hai tu.</p>';
    const tick = () => {
        if (!contLetto) return;
        const s = Math.max(0, Math.ceil((contLetto.scade.getTime() - Date.now()) / 1000));
        const el = document.getElementById('cont-ricevi-tempo');
        if (el) el.innerHTML = s > 0 ? '&#9203; ' + s + ' secondi per confermare' : '&#8987; QR scaduto: fatti mostrare un QR nuovo';
        const b = document.getElementById('cont-btn-ricevo');
        if (s <= 0 && b) { b.disabled = true; clearInterval(contLetto.timer); }
    };
    tick();
    contLetto.timer = setInterval(tick, 500);
}

function contBtnRiprova() {
    return '<button type="button" class="btn-primary cont-btn-piccolo" onclick="contApriLettore()">&#128247; Leggi di nuovo</button>';
}

async function contRicevo() {
    if (!contLetto) return;
    const b = document.getElementById('cont-btn-ricevo');
    if (b) b.disabled = true;
    const l = contLetto;
    const { data, error } = await supabaseClient.rpc('contanti_ricevi', { p_token: l.token });
    clearInterval(l.timer);
    contLetto = null;
    const corpo = document.getElementById('cont-ricevi-corpo');
    if (error) {
        corpo.innerHTML = '<p class="cont-vuoto">&#10060; ' + contEsc(error.message) + '</p>' + contBtnRiprova();
        return;
    }
    corpo.innerHTML = '<div class="cont-qr-fatto">&#9989;</div><div class="cont-qr-euro">' + contEuro(data) + '</div>' +
        '<div class="cont-qr-aiuto">Ricevuti da <strong>' + contEsc(contChi(l.da)) + '</strong>: ora li hai tu.</div>';
    openContanti();
}

function contChiudiRicevi() {
    contFermaLettore();
    if (contLetto) { clearInterval(contLetto.timer); contLetto = null; }
    document.getElementById('cont-ricevi-modal').classList.add('hidden');
}

// ---------- Versato in cassa / banca (v8.4.0: admin e operatori, solo i soldi che ha in mano chi preme) ----------
async function contVersa() {
    const scelti = contMiei().filter(i => contSel.has(i.id));
    if (!scelti.length) return;
    if (!window.confirm('Segnare come VERSATI in cassa / banca ' + contEuroTesto(contSomma(scelti)) + ' (' + scelti.length + ' incassi)?')) return;
    const { data, error } = await supabaseClient.rpc('contanti_versa', { p_incassi: scelti.map(i => i.id) });
    if (error) { contErrore(error, 'versamento'); return; }
    contToast('&#127974; Versati ' + contEuro(data));
    openContanti();
}

// Uscendo dalla sezione si spegne la fotocamera
document.addEventListener('DOMContentLoaded', () => {
    ['cont-qr-modal', 'cont-ricevi-modal'].forEach(id => {
        const m = document.getElementById(id);
        if (m) m.addEventListener('click', e => {
            if (e.target !== m) return;
            if (id === 'cont-qr-modal') contChiudiQr(); else contChiudiRicevi();
        });
    });
});
