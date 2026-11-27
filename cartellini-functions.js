// ========================================
// CARTELLINI NEGOZIO (v8.3.0)
// ----------------------------------------
// Cartellini da appendere in negozio, creati dal Listino Agrimacch:
// - BIANCO 10,5 x 14,85 cm: un quarto di A4, si stampa solo davanti e si piega il foglio in quattro.
//   Logo della marca, tipo, modello, caratteristiche, prezzo LISTINO barrato,
//   riquadro "Per promozioni in corso chiedere al personale", garanzia e assistenza della marca.
// - PROMO 10 x 10,5 cm: 4 per foglio A4 di carta GIALLA (si stampa solo il testo nero e si taglia).
//   FINO AL <data dalla SCADENZA PROMO>, prezzo VENDITA PROMO, (salvo esaurimento scorte).
// I prezzi si leggono SEMPRE dal listino: dopo l'import di un nuovo Excel basta ristampare.
// Per ogni modello si salvano solo tipo, nome e caratteristiche (tabella cartellini_negozio);
// logo, garanzia e assistenza valgono per tutta la marca (tabella cartellini_marche).
// L'app segna quando un cartellino e' stato stampato e cosi' sa quali sono da ristampare
// (prezzo, promo, scheda o marca cambiati dopo la stampa) o da togliere (promo finita).
// Per ora solo admin: CART_RUOLI qui e cartellini_puo_gestire() su Supabase (supabase/cartellini-setup.sql).
// Il PDF si crea con html2canvas + jsPDF (pdfCaricaLibrerie / pdfApriInScheda in ordini-functions.js).
// ========================================

const CART_RUOLI = ['admin'];
const CART_MAX_ELENCO = 300;
// Cartellino bianco: angolo del foglio A4 (mm) in cui si stampa
const CART_POSIZIONI_BIANCO = { as: [0, 0], ad: [105, 0], bs: [0, 148.5], bd: [105, 148.5] };
// Cartellini promo: 4 posti sul foglio giallo (mm)
const CART_POSTI_PROMO = [[5, 43.5], [105, 43.5], [5, 148.5], [105, 148.5]];

let cartSchede = {};        // articolo_id -> riga di cartellini_negozio
let cartMarche = {};        // MARCHIO -> riga di cartellini_marche
let cartCaricato = false;
let cartTab = sessionStorage.getItem('cartTab') || 'modelli';
let cartFiltro = 'tutti';
let cartCerca = '';
let cartSel = new Set();    // articoli selezionati per la stampa
let cartAperto = null;      // articolo nella finestra
let cartDaAprire = null;    // articolo da aprire appena caricato (pulsante nel listino)
let cartToastTimer = null;

function cartPuoVedere() {
    return typeof currentUserRole !== 'undefined' && CART_RUOLI.includes(currentUserRole);
}

// ---------- Utilita' ----------
function cartEsc(v) {
    return String(v === null || v === undefined ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function cartNorm(v) {
    return String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function cartChiaveMarca(m) { return String(m || '').trim().toUpperCase(); }
function cartEmail() { return typeof listinoEmailUtente === 'function' ? (listinoEmailUtente() || null) : null; }
function cartVal(id) { const el = document.getElementById(id); return el ? String(el.value || '') : ''; }

function cartNum(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof listinoParseNumero === 'function' ? listinoParseNumero(v) : Number(v);
    return (n === null || typeof n !== 'number' || !isFinite(n)) ? null : n;
}
function cartStessoNum(a, b) {
    const x = cartNum(a), y = cartNum(b);
    if (x === null || y === null) return x === null && y === null;
    return Math.abs(x - y) < 0.005;
}
// "EUR 719" se intero, "EUR 719,90" con i centesimi
function cartEuro(n) {
    const intero = Math.abs(n - Math.round(n)) < 0.005;
    return '&#8364;&nbsp;' + Number(n).toLocaleString('it-IT', {
        minimumFractionDigits: intero ? 0 : 2, maximumFractionDigits: intero ? 0 : 2
    });
}
function cartDataTesto(d) {
    if (!d) return '';
    return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
}
function cartDopo(a, b) { return !!(a && b && new Date(a).getTime() > new Date(b).getTime() + 1000); }
function cartRighe(testo) { return String(testo || '').split(/\r?\n/).map(r => r.trim()).filter(Boolean); }

function cartPref(nome, def) { try { return localStorage.getItem(nome) || def; } catch (e) { return def; } }
function cartSalvaPref(nome, valore) { try { localStorage.setItem(nome, valore); } catch (e) { /* niente */ } }

function cartToast(html) {
    let t = document.getElementById('cart-toast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'cart-toast';
        t.className = 'cart-toast';
        document.body.appendChild(t);
    }
    t.innerHTML = html;
    t.classList.add('show');
    clearTimeout(cartToastTimer);
    cartToastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

function cartTabelleMancanti(err) {
    const m = String((err && (err.message || err.details)) || err || '');
    return /cartellini_(negozio|marche)/i.test(m) && /(does not exist|schema cache|not find)/i.test(m);
}
function cartErrore(err, cosa) {
    console.error('Cartellini - ' + cosa + ':', err);
    const msg = cartTabelleMancanti(err)
        ? 'Mancano le tabelle: esegui su Supabase lo script <strong>supabase/cartellini-setup.sql</strong>.'
        : cartEsc(err && err.message ? err.message : err);
    if (typeof showCustomAlert === 'function') showCustomAlert('Errore ' + cosa + ':<br>' + msg, 'Cartellini negozio', '&#10060;');
}

// ---------- Dati di un articolo ----------
function cartArticoli() {
    const tutti = (typeof listinoArticoli !== 'undefined' && listinoArticoli) ? listinoArticoli : [];
    const attivi = tutti.filter(a => a.attivo !== false);
    return typeof listinoOrdina === 'function' ? listinoOrdina(attivi) : attivi;
}
function cartArticolo(id) {
    const tutti = (typeof listinoArticoli !== 'undefined' && listinoArticoli) ? listinoArticoli : [];
    return tutti.find(a => a.id === id) || null;
}
function cartScheda(a) { return cartSchede[a.id] || null; }
function cartMarca(a) { return cartMarche[cartChiaveMarca(a.marchio)] || null; }
function cartTipoListino(a) { return String(a.attrezzo || '').trim().toUpperCase(); }
function cartTitoloListino(a) { return String(a.modello || a.note || '').trim().toUpperCase(); }
function cartTipo(a) { const s = cartScheda(a); return (s && s.tipo) || cartTipoListino(a); }
function cartTitolo(a) { const s = cartScheda(a); return (s && s.titolo) || cartTitoloListino(a); }
function cartGaranzia(a) { const m = cartMarca(a); return m && m.garanzia ? m.garanzia : ''; }
function cartAssistenza(a) {
    const m = cartMarca(a);
    if (!m || m.assistenza === null || m.assistenza === undefined) return 'ASSISTENZA DIRETTA';
    return m.assistenza;
}

// Promo dal listino: prezzo VENDITA PROMO (solo se e' un numero) e data presa da SCADENZA PROMO
function cartPromo(a) {
    const prezzo = cartNum(a.vendita_promo);
    if (prezzo === null || prezzo <= 0) return null;
    const d = typeof listinoDataScadenza === 'function' ? listinoDataScadenza(a.scadenza_promo) : null;
    return { prezzo: prezzo, data: cartDataTesto(d), scaduta: d !== null && d < new Date() };
}
function cartPromoAttiva(a) { const p = cartPromo(a); return !!(p && !p.scaduta); }

// Stato del cartellino bianco: 'mai' | 'ok' | 'ristampa'
function cartStatoBianco(a) {
    const s = cartScheda(a);
    if (!s || !s.bianco_stampato_at) return 'mai';
    const m = cartMarca(a);
    if (!cartStessoNum(s.bianco_prezzo, a.listino) ||
        cartDopo(s.dati_modificati_at, s.bianco_stampato_at) ||
        (m && cartDopo(m.updated_at, s.bianco_stampato_at))) return 'ristampa';
    return 'ok';
}
// Stato del cartellino promo: 'nessuna' | 'mai' | 'ok' | 'ristampa' | 'togliere'
function cartStatoPromo(a) {
    const p = cartPromo(a);
    const s = cartScheda(a);
    const stampata = !!(s && s.promo_stampato_at);
    if (!p || p.scaduta) return stampata ? 'togliere' : 'nessuna';
    if (!stampata) return 'mai';
    if (!cartStessoNum(s.promo_prezzo, p.prezzo) || String(s.promo_scadenza || '') !== p.data) return 'ristampa';
    return 'ok';
}
// Da fare in negozio: bianco cambiato, promo cambiata o finita, promo nuova su un modello gia' esposto
function cartDaFare(a) {
    const b = cartStatoBianco(a), p = cartStatoPromo(a);
    return b === 'ristampa' || p === 'ristampa' || p === 'togliere' || (p === 'mai' && b !== 'mai');
}

// ---------- Caricamento ----------
async function cartCarica() {
    if (typeof listinoArticoliAggiorna === 'function') await listinoArticoliAggiorna();
    const [schede, marche] = await Promise.all([
        typeof listinoFetchAll === 'function'
            ? listinoFetchAll('cartellini_negozio')
            : supabaseClient.from('cartellini_negozio').select('*').then(r => { if (r.error) throw r.error; return r.data || []; }),
        supabaseClient.from('cartellini_marche').select('*').then(r => { if (r.error) throw r.error; return r.data || []; })
    ]);
    cartSchede = {};
    (schede || []).forEach(r => { cartSchede[r.articolo_id] = r; });
    cartMarche = {};
    (marche || []).forEach(r => { cartMarche[cartChiaveMarca(r.marchio)] = r; });
    cartCaricato = true;
}

async function openCartellini() {
    const box = document.getElementById('cart-contenuto');
    if (box && !cartCaricato) box.innerHTML = '<p class="cart-vuoto">&#8987; Caricamento...</p>';
    try {
        await cartCarica();
    } catch (err) {
        if (box) {
            box.innerHTML = '<p class="cart-vuoto">&#10060; ' + (cartTabelleMancanti(err)
                ? 'Mancano le tabelle: esegui su Supabase lo script <strong>supabase/cartellini-setup.sql</strong>.'
                : cartEsc(err && err.message ? err.message : err)) + '</p>';
        }
        console.error('Cartellini - caricamento:', err);
        return;
    }
    cartRender();
    if (cartDaAprire) {
        const id = cartDaAprire;
        cartDaAprire = null;
        cartApri(id);
    }
}

// Pulsante "cartellino" su una riga del listino
function cartApriDaListino(id) {
    cartDaAprire = id;
    cartTab = 'modelli';
    sessionStorage.setItem('cartTab', 'modelli');
    openSection('cartellini');
}

// ---------- Disegno della sezione ----------
function cartCambiaTab(tab) {
    cartTab = tab === 'marche' ? 'marche' : 'modelli';
    sessionStorage.setItem('cartTab', cartTab);
    cartRender();
}

function cartRender() {
    document.querySelectorAll('#cart-tabs [data-cart-tab]').forEach(b => b.classList.toggle('active', b.dataset.cartTab === cartTab));
    const box = document.getElementById('cart-contenuto');
    if (!box) return;
    if (cartTab === 'marche') {
        box.innerHTML = cartHtmlMarche();
    } else {
        box.innerHTML = cartHtmlModelli();
        cartRenderElenco();
    }
}

function cartRidisegna() {
    const sez = document.getElementById('section-cartellini');
    if (!sez || sez.classList.contains('hidden')) return;
    if (cartTab === 'modelli') cartRenderElenco();
}

function cartHtmlModelli() {
    const filtri = [['tutti', 'Tutti i modelli'], ['scheda', 'Con caratteristiche'], ['fare', 'Da ristampare / togliere'], ['promo', 'Con promo attiva']];
    const posizioni = [['as', 'in alto a sinistra'], ['ad', 'in alto a destra'], ['bs', 'in basso a sinistra'], ['bd', 'in basso a destra']];
    const posB = cartPref('cartPosBianco', 'as');
    const posP = cartPref('cartPosPromo', '1');
    return '<div class="cart-strumenti">' +
            '<input type="search" class="cart-cerca" placeholder="Cerca marca, modello, tipo..." value="' + cartEsc(cartCerca) + '" oninput="cartCerca = this.value; cartRenderElenco()">' +
            '<select class="cart-filtro" onchange="cartFiltro = this.value; cartRenderElenco()">' +
                filtri.map(f => '<option value="' + f[0] + '"' + (cartFiltro === f[0] ? ' selected' : '') + '>' + f[1] + '</option>').join('') +
            '</select>' +
        '</div>' +
        '<div class="cart-stampa-opz">' +
            '<label>&#128196; Cartellino bianco sul foglio <select onchange="cartSalvaPref(\'cartPosBianco\', this.value)">' +
                posizioni.map(p => '<option value="' + p[0] + '"' + (posB === p[0] ? ' selected' : '') + '>' + p[1] + '</option>').join('') +
            '</select></label>' +
            '<label>&#128993; Foglio giallo: primo posto libero <select onchange="cartSalvaPref(\'cartPosPromo\', this.value)">' +
                ['1', '2', '3', '4'].map(n => '<option value="' + n + '"' + (posP === n ? ' selected' : '') + '>' + n + ' (' + ['alto sx', 'alto dx', 'basso sx', 'basso dx'][Number(n) - 1] + ')</option>').join('') +
            '</select></label>' +
        '</div>' +
        '<div id="cart-azioni" class="cart-azioni"></div>' +
        '<p id="cart-conta" class="cart-conta"></p>' +
        '<div id="cart-elenco" class="cart-elenco"></div>';
}

function cartFiltrati() {
    const parole = cartNorm(cartCerca).split(/\s+/).filter(Boolean);
    return cartArticoli().filter(a => {
        if (cartFiltro === 'scheda') {
            const s = cartScheda(a);
            if (!s || !cartRighe(s.caratteristiche).length) return false;
        } else if (cartFiltro === 'fare') {
            if (!cartDaFare(a)) return false;
        } else if (cartFiltro === 'promo') {
            if (!cartPromoAttiva(a)) return false;
        }
        if (parole.length) {
            const t = cartNorm([a.marchio, a.modello, a.note, a.attrezzo, cartTitolo(a), cartTipo(a), a.codice_articolo].join(' '));
            if (!parole.every(p => t.indexOf(p) !== -1)) return false;
        }
        return true;
    });
}

function cartRenderElenco() {
    const el = document.getElementById('cart-elenco');
    if (!el) return;
    const lista = cartFiltrati();
    const conta = document.getElementById('cart-conta');
    if (conta) {
        conta.innerHTML = lista.length + (lista.length === 1 ? ' modello' : ' modelli') +
            (lista.length > CART_MAX_ELENCO ? ' &middot; ne mostro ' + CART_MAX_ELENCO + ': scrivi nella ricerca per trovare gli altri' : '');
    }
    el.innerHTML = lista.length
        ? lista.slice(0, CART_MAX_ELENCO).map(cartHtmlRiga).join('')
        : '<p class="cart-vuoto">Nessun modello.</p>';
    cartAggiornaAzioni();
}

function cartHtmlRiga(a) {
    const s = cartScheda(a);
    const p = cartPromo(a);
    const sb = cartStatoBianco(a);
    const sp = cartStatoPromo(a);
    const nCar = s ? cartRighe(s.caratteristiche).length : 0;
    const badge = [];
    if (!nCar) badge.push('<span class="cart-badge cart-badge-grigio">senza caratteristiche</span>');
    if (sb === 'ok') badge.push('<span class="cart-badge cart-badge-ok">&#10004; stampato</span>');
    if (sb === 'ristampa') badge.push('<span class="cart-badge cart-badge-rosso">&#128260; da ristampare</span>');
    if (sp === 'mai') badge.push('<span class="cart-badge cart-badge-giallo">promo da stampare</span>');
    if (sp === 'ok') badge.push('<span class="cart-badge cart-badge-ok">&#10004; promo stampata</span>');
    if (sp === 'ristampa') badge.push('<span class="cart-badge cart-badge-rosso">&#128260; promo cambiata</span>');
    if (sp === 'togliere') badge.push('<span class="cart-badge cart-badge-rosso">&#9888;&#65039; togli il giallo</span>');
    const listino = cartNum(a.listino);
    return '<div class="cart-riga" onclick="cartApri(' + a.id + ')">' +
        '<input type="checkbox" class="cart-sel"' + (cartSel.has(a.id) ? ' checked' : '') +
            ' onclick="event.stopPropagation()" onchange="cartSeleziona(' + a.id + ', this.checked)" title="Seleziona per la stampa">' +
        '<div class="cart-riga-testo">' +
            '<div class="cart-riga-nome"><span class="cart-riga-marca">' + cartEsc(a.marchio) + '</span> <strong>' + cartEsc(cartTitolo(a)) + '</strong></div>' +
            '<div class="cart-riga-sub">' + cartEsc(cartTipo(a)) + '</div>' +
            '<div class="cart-riga-badge">' + badge.join('') + '</div>' +
        '</div>' +
        '<div class="cart-riga-prezzi">' +
            '<div><span>Listino</span> ' + (listino !== null ? cartEuro(listino) : '-') + '</div>' +
            (p ? '<div class="' + (p.scaduta ? 'cart-promo-scaduta' : 'cart-promo-prezzo') + '"><span>Promo</span> ' + cartEuro(p.prezzo) +
                (p.data ? ' <small>al ' + p.data + '</small>' : '') + '</div>' : '') +
        '</div>' +
    '</div>';
}

// ---------- Selezione e stampa di piu' cartellini ----------
function cartSeleziona(id, si) {
    if (si) cartSel.add(id); else cartSel.delete(id);
    cartAggiornaAzioni();
}
function cartSelezionaVisibili() {
    cartFiltrati().slice(0, CART_MAX_ELENCO).forEach(a => cartSel.add(a.id));
    cartRenderElenco();
}
function cartSelezionePulisci() {
    cartSel.clear();
    cartRenderElenco();
}
function cartSelezionati() { return cartArticoli().filter(a => cartSel.has(a.id)); }

function cartAggiornaAzioni() {
    const box = document.getElementById('cart-azioni');
    if (!box) return;
    const sel = cartSelezionati();
    const nPromo = sel.filter(cartPromoAttiva).length;
    box.innerHTML =
        '<button type="button" class="btn-back cart-btn" onclick="cartSelezionaVisibili()">&#9745;&#65039; Seleziona quelli in elenco</button>' +
        (sel.length ? '<button type="button" class="btn-back cart-btn" onclick="cartSelezionePulisci()">&#10006; Togli selezione (' + sel.length + ')</button>' : '') +
        '<button type="button" class="btn-primary cart-btn"' + (sel.length ? '' : ' disabled') +
            ' onclick="cartStampaSelezionati(\'bianco\')">&#128424;&#65039; Cartellini bianchi (' + sel.length + ')</button>' +
        '<button type="button" class="btn-primary cart-btn cart-btn-giallo"' + (nPromo ? '' : ' disabled') +
            ' onclick="cartStampaSelezionati(\'promo\')">&#128424;&#65039; Promo gialli (' + nPromo + ')</button>';
}

function cartStampaSelezionati(tipo) {
    let lista = cartSelezionati();
    if (tipo === 'promo') lista = lista.filter(cartPromoAttiva);
    if (!lista.length) return;
    cartStampa(tipo, lista, null);
}

function cartNomeFile(tipo, lista) {
    const base = tipo === 'promo' ? 'Cartellini promo' : 'Cartellini';
    const nome = lista.length === 1 ? base + ' ' + cartChiaveMarca(lista[0].marchio) + ' ' + cartTitolo(lista[0]) : base + ' (' + lista.length + ')';
    return nome.replace(/[\/\\:*?"<>|]+/g, '-').trim() + '.pdf';
}

// prima: funzione eseguita prima di creare il PDF (es. salvare la scheda aperta)
function cartStampa(tipo, lista, prima) {
    if (typeof pdfApriInScheda !== 'function') {
        showCustomAlert('Funzione PDF non trovata: ricarica la pagina.', 'Cartellini negozio', '&#10060;');
        return;
    }
    // la scheda del PDF si apre subito (dentro al clic), poi si salva e si crea il PDF
    return pdfApriInScheda(async () => {
        if (prima) {
            const ok = await prima();
            if (ok === false) throw new Error('cartellino non salvato');
        }
        const blob = await cartCreaPdf(tipo, lista);
        await cartSegnaStampati(tipo, lista);
        return blob;
    }, cartNomeFile(tipo, lista));
}

// ---------- HTML dei cartellini ----------
// dati (facoltativo): valori della finestra non ancora salvati { tipo, titolo, car }
function cartHtmlBianco(a, dati) {
    dati = dati || {};
    const s = cartScheda(a) || {};
    const tipo = dati.tipo !== undefined ? (dati.tipo || cartTipoListino(a)) : cartTipo(a);
    const titolo = dati.titolo !== undefined ? (dati.titolo || cartTitoloListino(a)) : cartTitolo(a);
    const righe = cartRighe(dati.car !== undefined ? dati.car : s.caratteristiche);
    const m = cartMarca(a);
    const listino = cartNum(a.listino);
    const garanzia = cartGaranzia(a);
    const assistenza = cartAssistenza(a);
    return '<div class="cart-bianco">' +
        '<div class="cart-bi-logo">' + (m && m.logo
            ? '<img src="' + cartEsc(m.logo) + '" alt="">'
            : '<span class="cart-bi-marca" data-cart-fit="1">' + cartEsc(cartChiaveMarca(a.marchio)) + '</span>') + '</div>' +
        '<div class="cart-bi-titolo">' +
            '<span class="cart-bi-tipo" data-cart-fit="1">' + cartEsc(tipo) + '</span>' +
            '<span class="cart-bi-modello" data-cart-fit="1">' + cartEsc(titolo) + '</span>' +
        '</div>' +
        '<div class="cart-bi-car">' + (righe.length
            ? '<div class="cart-bi-car-tit">Caratteristiche:</div>' + righe.map(r => '<div>' + cartEsc(r) + '</div>').join('')
            : '') + '</div>' +
        (listino !== null
            ? '<div class="cart-bi-listino"><span>LISTINO</span><span class="cart-bi-prezzo">' + cartEuro(listino) + '</span></div>'
            : '') +
        '<div class="cart-bi-promo">PER PROMOZIONI IN CORSO<br>CHIEDERE AL PERSONALE</div>' +
        (garanzia ? '<div class="cart-bi-icona"><span class="cart-bi-ic">&#128221;</span><span>' + cartEsc(garanzia) + '</span></div>' : '') +
        (assistenza ? '<div class="cart-bi-icona"><span class="cart-bi-ic">&#128736;&#65039;</span><span>' + cartEsc(assistenza) + '</span></div>' : '') +
    '</div>';
}

function cartHtmlPromo(a) {
    const p = cartPromo(a);
    if (!p) return '<div class="cart-promo"><div class="cart-pr-vuota">Nessun prezzo promo nel listino</div></div>';
    return '<div class="cart-promo">' +
        (p.data ? '<div class="cart-pr-fino">FINO AL</div><div class="cart-pr-data">' + p.data + '</div>' : '<div></div>') +
        '<div class="cart-pr-prezzo" data-cart-fit="1">' + cartEuro(p.prezzo) + '</div>' +
        '<div class="cart-pr-scorte">( SALVO ESAURIMENTO SCORTE )</div>' +
    '</div>';
}

// Rimpicciolisce i testi che non ci stanno (modello lungo, tante caratteristiche, prezzo lungo)
function cartAdattaRiga(el) {
    el.style.fontSize = '';
    const iniziale = parseFloat(getComputedStyle(el).fontSize) || 16;
    let px = iniziale;
    let giri = 0;
    while (el.scrollWidth > el.clientWidth + 1 && px > 8 && giri++ < 80) {
        px -= 0.5;
        el.style.fontSize = px + 'px';
    }
    return px / iniziale;
}

function cartAdatta(card) {
    if (!card) return;
    // tipo e modello lunghi: invece di farli piccolissimi li metto su due righe
    const titolo = card.querySelector('.cart-bi-titolo');
    if (titolo) {
        titolo.classList.remove('cart-bi-titolo-due');
        const t = titolo.querySelector('.cart-bi-tipo');
        const m = titolo.querySelector('.cart-bi-modello');
        const rt = t ? cartAdattaRiga(t) : 1;
        const rm = m ? cartAdattaRiga(m) : 1;
        if (rt < 0.85 || rm < 0.75) titolo.classList.add('cart-bi-titolo-due');
    }
    card.querySelectorAll('[data-cart-fit]').forEach(cartAdattaRiga);
    const car = card.querySelector('.cart-bi-car');
    if (car) {
        car.style.fontSize = '';
        let px = parseFloat(getComputedStyle(car).fontSize) || 14;
        let giri = 0;
        while (car.scrollHeight > car.clientHeight + 1 && px > 8 && giri++ < 60) {
            px -= 0.25;
            car.style.fontSize = px + 'px';
        }
    }
}

// ---------- PDF ----------
async function cartCreaPdf(tipo, lista) {
    await pdfCaricaLibrerie();
    const velo = document.createElement('div');
    velo.className = 'pdf-velo';
    velo.innerHTML = '<div>&#8987; Creazione dei cartellini...</div>';
    const foglio = document.createElement('div');
    foglio.className = 'pdf-foglio cart-foglio';
    foglio.innerHTML = lista.map(a => tipo === 'promo' ? cartHtmlPromo(a) : cartHtmlBianco(a)).join('');
    document.body.appendChild(foglio);
    document.body.appendChild(velo);
    try {
        const immagini = Array.from(foglio.querySelectorAll('img'));
        await Promise.all(immagini.map(img => img.complete ? Promise.resolve() : new Promise(r => { img.onload = r; img.onerror = r; })));
        if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) { /* niente */ } }
        window.scrollTo(0, 0);
        const carte = Array.from(foglio.children);
        carte.forEach(cartAdatta);
        const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
        const foto = el => window.html2canvas(el, { scale: 3, backgroundColor: '#ffffff', useCORS: true, logging: false, scrollX: 0, scrollY: 0 });
        if (tipo === 'promo') {
            let posto = Math.max(0, Math.min(3, (parseInt(cartPref('cartPosPromo', '1'), 10) || 1) - 1));
            for (let i = 0; i < carte.length; i++) {
                if (posto > 3) { pdf.addPage('a4', 'portrait'); posto = 0; }
                const canvas = await foto(carte[i]);
                const xy = CART_POSTI_PROMO[posto];
                pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', xy[0], xy[1], 100, 105);
                cartLineaTaglio(pdf, xy[0], xy[1], 100, 105);
                posto++;
            }
        } else {
            const xy = CART_POSIZIONI_BIANCO[cartPref('cartPosBianco', 'as')] || CART_POSIZIONI_BIANCO.as;
            for (let i = 0; i < carte.length; i++) {
                if (i > 0) pdf.addPage('a4', 'portrait');
                const canvas = await foto(carte[i]);
                pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', xy[0], xy[1], 105, 148.5);
                cartSegniPiega(pdf);
            }
        }
        pdf.setProperties({ title: cartNomeFile(tipo, lista).replace(/\.pdf$/, '') });
        return pdf.output('blob');
    } finally {
        foglio.remove();
        velo.remove();
    }
}

// Riquadro tratteggiato grigio chiaro dove tagliare il cartellino promo
function cartLineaTaglio(pdf, x, y, w, h) {
    pdf.setDrawColor(170, 170, 170);
    pdf.setLineWidth(0.2);
    if (typeof pdf.setLineDashPattern === 'function') pdf.setLineDashPattern([1.5, 1.5], 0);
    pdf.rect(x, y, w, h);
    if (typeof pdf.setLineDashPattern === 'function') pdf.setLineDashPattern([], 0);
}
// Segnetti sui bordi del foglio dove piegare in quattro
function cartSegniPiega(pdf) {
    pdf.setDrawColor(190, 190, 190);
    pdf.setLineWidth(0.2);
    pdf.line(105, 4, 105, 10);
    pdf.line(105, 287, 105, 293);
    pdf.line(4, 148.5, 10, 148.5);
    pdf.line(200, 148.5, 206, 148.5);
}

// Dopo la stampa: ricordo prezzo e data stampati (per sapere quando ristampare)
async function cartSegnaStampati(tipo, lista) {
    const ora = new Date().toISOString();
    const righe = lista.map(a => {
        const r = { articolo_id: a.id, updated_by: cartEmail() };
        if (tipo === 'promo') {
            const p = cartPromo(a);
            r.promo_stampato_at = ora;
            r.promo_prezzo = p ? p.prezzo : null;
            r.promo_scadenza = p ? p.data : null;
        } else {
            r.bianco_stampato_at = ora;
            r.bianco_prezzo = cartNum(a.listino);
        }
        return r;
    });
    try {
        const { data, error } = await supabaseClient.from('cartellini_negozio').upsert(righe, { onConflict: 'articolo_id' }).select();
        if (error) throw error;
        (data || []).forEach(r => { cartSchede[r.articolo_id] = r; });
    } catch (err) {
        console.warn('Cartellini: stampa non segnata', err);
        cartToast('&#9888;&#65039; PDF creato, ma non segnato come stampato');
        return;
    }
    cartRidisegna();
    if (cartAperto) cartAggiornaStatoFinestra();
}

// ---------- Finestra del modello ----------
function cartApri(id) {
    const a = cartArticolo(id);
    if (!a) return;
    cartAperto = id;
    const s = cartScheda(a) || {};
    const listino = cartNum(a.listino);
    const p = cartPromo(a);
    const m = cartMarca(a);
    const vaiMarche = '<a href="#" onclick="cartChiudi(); cartCambiaTab(\'marche\'); return false;">Marche e loghi</a>';
    const avvisi = [];
    if (listino === null) avvisi.push('Nel listino manca il prezzo <strong>LISTINO</strong>: la riga del prezzo non viene stampata.');
    if (!m || !m.logo) avvisi.push('La marca non ha il logo: al suo posto si stampa il nome. Caricalo nella scheda ' + vaiMarche + '.');
    if (!cartGaranzia(a)) avvisi.push('Manca il testo della <strong>garanzia</strong> della marca (scheda ' + vaiMarche + ').');
    if (p && p.scaduta) avvisi.push('La promo del listino &#232; <strong>scaduta</strong>: il cartellino giallo non si stampa.');
    if (p && !p.data && !p.scaduta) avvisi.push('Nella SCADENZA PROMO del listino non c&#39;&#232; una data: sul giallo non si stampa &quot;FINO AL&quot;.');

    document.getElementById('cart-m-titolo').innerHTML = '&#127991;&#65039; ' + cartEsc(a.marchio) + ' ' + cartEsc(a.modello || a.note || '');
    document.getElementById('cart-m-corpo').innerHTML =
        '<div class="cart-m-griglia">' +
            '<div class="cart-m-form">' +
                '<p class="cart-m-info">Dal listino: <strong>listino ' + (listino !== null ? cartEuro(listino) : '-') + '</strong>' +
                    (p ? ' &middot; promo <strong>' + cartEuro(p.prezzo) + '</strong>' + (p.data ? ' fino al ' + p.data : '') : ' &middot; nessuna promo') + '</p>' +
                (avvisi.length ? '<div class="cart-m-avvisi">' + avvisi.map(x => '<div>&#9888;&#65039; ' + x + '</div>').join('') + '</div>' : '') +
                '<label for="cart-m-tipo">Tipo</label>' +
                '<input type="text" id="cart-m-tipo" value="' + cartEsc(s.tipo || cartTipoListino(a)) + '" placeholder="ES. POTATORE" oninput="cartAnteprima()">' +
                '<label for="cart-m-nome">Nome del modello</label>' +
                '<input type="text" id="cart-m-nome" value="' + cartEsc(s.titolo || cartTitoloListino(a)) + '" oninput="cartAnteprima()">' +
                '<label for="cart-m-car">Caratteristiche <small>(una per riga)</small></label>' +
                '<textarea id="cart-m-car" rows="8" placeholder="CILINDRATA 21,2cc&#10;POTENZA 1 CV&#10;PESO A SECCO 7,7 kg" oninput="cartAnteprima()">' + cartEsc(s.caratteristiche || '') + '</textarea>' +
                '<div id="cart-m-stato" class="cart-m-stato"></div>' +
            '</div>' +
            '<div class="cart-m-anteprime">' +
                '<div class="cart-m-ant"><div class="cart-m-ant-tit">Cartellino bianco 10,5 &times; 14,85 cm</div><div class="cart-zoom" id="cart-ant-bianco"></div></div>' +
                '<div class="cart-m-ant"><div class="cart-m-ant-tit">Promo 10 &times; 10,5 cm (carta gialla)</div><div class="cart-zoom cart-zoom-giallo" id="cart-ant-promo"></div></div>' +
            '</div>' +
        '</div>' +
        '<div class="modal-buttons cart-m-pulsanti" id="cart-m-pulsanti"></div>';
    document.getElementById('cart-modal').classList.remove('hidden');
    cartAggiornaStatoFinestra();
    cartAnteprima();
}

function cartChiudi() {
    const modal = document.getElementById('cart-modal');
    if (modal) modal.classList.add('hidden');
    cartAperto = null;
}

function cartDatiForm() {
    return {
        tipo: cartVal('cart-m-tipo').trim().toUpperCase(),
        titolo: cartVal('cart-m-nome').trim().toUpperCase(),
        car: cartVal('cart-m-car')
    };
}

function cartAnteprima() {
    const a = cartArticolo(cartAperto);
    if (!a) return;
    const b = document.getElementById('cart-ant-bianco');
    if (b) { b.innerHTML = cartHtmlBianco(a, cartDatiForm()); cartAdatta(b.firstElementChild); }
    const p = document.getElementById('cart-ant-promo');
    if (p) { p.innerHTML = cartHtmlPromo(a); cartAdatta(p.firstElementChild); }
}

function cartQuando(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return cartDataTesto(d) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function cartAggiornaStatoFinestra() {
    const a = cartArticolo(cartAperto);
    if (!a) return;
    const s = cartScheda(a) || {};
    const sb = cartStatoBianco(a);
    const sp = cartStatoPromo(a);
    const testoB = {
        mai: 'mai stampato',
        ok: 'stampato il ' + cartQuando(s.bianco_stampato_at),
        ristampa: '<strong>da ristampare</strong> (cambiato dopo la stampa del ' + cartQuando(s.bianco_stampato_at) + ')'
    }[sb];
    const testoP = {
        nessuna: 'nessuna promo',
        mai: '<strong>da stampare</strong>',
        ok: 'stampata il ' + cartQuando(s.promo_stampato_at),
        ristampa: '<strong>da ristampare</strong>: prezzo o data cambiati',
        togliere: '<strong>promo finita: togli il cartellino giallo</strong>'
    }[sp];
    const stato = document.getElementById('cart-m-stato');
    if (stato) stato.innerHTML = '&#128196; Bianco: ' + testoB + '<br>&#128993; Promo: ' + testoP;
    const puls = document.getElementById('cart-m-pulsanti');
    if (puls) {
        puls.innerHTML =
            '<button type="button" class="btn-primary" onclick="cartSalva()">&#128190; Salva</button>' +
            '<button type="button" class="btn-primary" onclick="cartStampaAperto(\'bianco\')">&#128424;&#65039; Stampa bianco</button>' +
            (cartPromoAttiva(a) ? '<button type="button" class="btn-primary cart-btn-giallo" onclick="cartStampaAperto(\'promo\')">&#128424;&#65039; Stampa promo</button>' : '') +
            (sp === 'togliere' ? '<button type="button" class="btn-back" onclick="cartPromoTolta()">&#10004; Giallo tolto</button>' : '') +
            '<button type="button" class="btn-secondary" onclick="cartChiudi()">Chiudi</button>';
    }
}

// silenzioso: nessun messaggio (salvataggio prima della stampa). Ritorna false se non salvato.
async function cartSalva(silenzioso) {
    const a = cartArticolo(cartAperto);
    if (!a) return false;
    const d = cartDatiForm();
    const s = cartScheda(a);
    // se uguali al listino salvo vuoto: cosi' il cartellino segue il listino
    const tipo = d.tipo && d.tipo !== cartTipoListino(a) ? d.tipo : null;
    const titolo = d.titolo && d.titolo !== cartTitoloListino(a) ? d.titolo : null;
    const car = cartRighe(d.car).join('\n') || null;
    const cambiato = !s || (s.tipo || null) !== tipo || (s.titolo || null) !== titolo || (s.caratteristiche || null) !== car;
    if (!cambiato) {
        if (!silenzioso) cartToast('Nessuna modifica da salvare');
        return true;
    }
    const riga = {
        articolo_id: a.id, tipo: tipo, titolo: titolo, caratteristiche: car,
        dati_modificati_at: new Date().toISOString(), updated_by: cartEmail()
    };
    const { data, error } = await supabaseClient.from('cartellini_negozio').upsert([riga], { onConflict: 'articolo_id' }).select().single();
    if (error) { cartErrore(error, 'salvataggio cartellino'); return false; }
    cartSchede[a.id] = data;
    if (!silenzioso) cartToast('&#10004; Cartellino salvato');
    cartRidisegna();
    cartAggiornaStatoFinestra();
    return true;
}

function cartStampaAperto(tipo) {
    const a = cartArticolo(cartAperto);
    if (!a) return;
    if (tipo === 'promo' && !cartPromoAttiva(a)) return;
    cartStampa(tipo, [a], () => cartSalva(true));
}

async function cartPromoTolta() {
    const a = cartArticolo(cartAperto);
    if (!a) return;
    const { data, error } = await supabaseClient.from('cartellini_negozio')
        .update({ promo_stampato_at: null, promo_prezzo: null, promo_scadenza: null, updated_by: cartEmail() })
        .eq('articolo_id', a.id).select().single();
    if (error) { cartErrore(error, 'aggiornamento'); return; }
    cartSchede[a.id] = data;
    cartToast('&#10004; Segnato: cartellino giallo tolto');
    cartRidisegna();
    cartAggiornaStatoFinestra();
}

// ---------- Marche e loghi ----------
function cartMarcheElenco() {
    const conta = new Map();
    cartArticoli().forEach(a => {
        const k = cartChiaveMarca(a.marchio);
        if (k) conta.set(k, (conta.get(k) || 0) + 1);
    });
    Object.keys(cartMarche).forEach(k => { if (!conta.has(k)) conta.set(k, 0); });
    return Array.from(conta.entries()).sort((x, y) => x[0].localeCompare(y[0], 'it'));
}

function cartHtmlMarche() {
    const voci = cartMarcheElenco();
    if (!voci.length) return '<p class="cart-vuoto">Nessuna marca nel listino.</p>';
    return '<p class="cart-aiuto">Logo, garanzia e assistenza valgono per tutti i cartellini della marca. ' +
            'Il logo viene meglio in <strong>PNG con lo sfondo trasparente</strong>. Lascia vuota la garanzia o l&#39;assistenza per non stamparla.</p>' +
        '<div class="cart-marche">' + voci.map((v, i) => {
            const k = v[0];
            const m = cartMarche[k] || {};
            const ass = (m.assistenza === null || m.assistenza === undefined) ? 'ASSISTENZA DIRETTA' : m.assistenza;
            return '<div class="cart-marca" id="cart-marca-' + i + '" data-marca="' + cartEsc(k) + '">' +
                '<div class="cart-marca-testa"><strong>' + cartEsc(k) + '</strong><span>' + v[1] + (v[1] === 1 ? ' modello' : ' modelli') + '</span></div>' +
                '<div class="cart-marca-logo">' + (m.logo ? '<img src="' + cartEsc(m.logo) + '" alt="">' : '<span>Nessun logo</span>') + '</div>' +
                '<div class="cart-marca-logo-btn">' +
                    '<label class="btn-back cart-btn">&#128444;&#65039; Carica logo<input type="file" accept="image/*" class="hidden" onchange="cartMarcaLogo(this, ' + i + ')"></label>' +
                    (m.logo ? '<button type="button" class="btn-back cart-btn" onclick="cartMarcaTogliLogo(' + i + ')">&#10006; Togli</button>' : '') +
                '</div>' +
                '<label>Garanzia</label>' +
                '<input type="text" class="cart-marca-gar" placeholder="ES. GARANZIA FINO A 5 ANNI" value="' + cartEsc(m.garanzia || '') + '">' +
                '<label>Assistenza</label>' +
                '<input type="text" class="cart-marca-ass" placeholder="ES. ASSISTENZA DIRETTA" value="' + cartEsc(ass) + '">' +
                '<button type="button" class="btn-primary cart-btn" onclick="cartMarcaSalva(' + i + ')">&#128190; Salva</button>' +
            '</div>';
        }).join('') + '</div>';
}

function cartMarcaChiave(i) {
    const el = document.getElementById('cart-marca-' + i);
    return el ? { el: el, marchio: el.dataset.marca } : null;
}

async function cartMarcaScrivi(riga, messaggio) {
    riga.updated_by = cartEmail();
    const { data, error } = await supabaseClient.from('cartellini_marche').upsert([riga], { onConflict: 'marchio' }).select().single();
    if (error) { cartErrore(error, 'salvataggio marca'); return false; }
    cartMarche[cartChiaveMarca(data.marchio)] = data;
    cartToast(messaggio);
    if (cartTab === 'marche') cartRender();
    return true;
}

function cartMarcaSalva(i) {
    const x = cartMarcaChiave(i);
    if (!x) return;
    cartMarcaScrivi({
        marchio: x.marchio,
        garanzia: x.el.querySelector('.cart-marca-gar').value.trim().toUpperCase() || null,
        assistenza: x.el.querySelector('.cart-marca-ass').value.trim().toUpperCase()
    }, '&#10004; ' + cartEsc(x.marchio) + ' salvata');
}

function cartLogoDaFile(file) {
    return new Promise((ok, ko) => {
        const fr = new FileReader();
        fr.onload = () => {
            const img = new Image();
            img.onload = () => {
                let w = img.naturalWidth || 900, h = img.naturalHeight || 300;
                const f = Math.min(1, 900 / Math.max(w, h));
                w = Math.max(1, Math.round(w * f));
                h = Math.max(1, Math.round(h * f));
                const c = document.createElement('canvas');
                c.width = w;
                c.height = h;
                c.getContext('2d').drawImage(img, 0, 0, w, h);
                ok(c.toDataURL('image/png'));
            };
            img.onerror = () => ko(new Error('immagine non valida'));
            img.src = fr.result;
        };
        fr.onerror = () => ko(fr.error || new Error('file non letto'));
        fr.readAsDataURL(file);
    });
}

async function cartMarcaLogo(input, i) {
    const x = cartMarcaChiave(i);
    const file = input && input.files && input.files[0];
    if (!x || !file) return;
    let logo;
    try { logo = await cartLogoDaFile(file); } catch (err) { cartErrore(err, 'lettura del logo'); return; }
    const m = cartMarche[x.marchio] || {};
    cartMarcaScrivi({ marchio: x.marchio, logo: logo, garanzia: m.garanzia || null, assistenza: (m.assistenza === undefined ? null : m.assistenza) },
        '&#10004; Logo di ' + cartEsc(x.marchio) + ' caricato');
}

function cartMarcaTogliLogo(i) {
    const x = cartMarcaChiave(i);
    if (!x) return;
    if (!window.confirm('Togliere il logo di ' + x.marchio + '?')) return;
    const m = cartMarche[x.marchio] || {};
    cartMarcaScrivi({ marchio: x.marchio, logo: null, garanzia: m.garanzia || null, assistenza: (m.assistenza === undefined ? null : m.assistenza) },
        'Logo di ' + cartEsc(x.marchio) + ' tolto');
}

// Chiusura della finestra cliccando fuori
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('cart-modal');
    if (modal) modal.addEventListener('click', e => { if (e.target === modal) cartChiudi(); });
});
