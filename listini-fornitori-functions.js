// ========================================
// LISTINI VENDITE > LISTINI FORNITORI (listini "paralleli" al Listino Agrimacch)
// ----------------------------------------
// Generalizza il Listino STIHL a piu' fornitori. Per ogni FORNITORE (una scheda in alto):
//   - piu' LISTINI (es. OPG, OPM), ognuno con il suo file, la sua SCADENZA e i suoi prezzi.
//     Un codice puo' stare in piu' listini: nella riga compaiono tutti i suoi prezzi, uno sotto l'altro,
//     con il nome del listino e la scadenza. In evidenza il prezzo cliente piu' basso tra i listini non scaduti.
//   - Scadenze: barra in alto con tutti i listini (rosso = scaduto, arancione = scade entro 7 giorni).
//     Un listino scaduto si consulta lo stesso.
//   - Collegamento con il Listino Agrimacch, codice a barre (EAN) e codice articolo: valgono per il CODICE,
//     quindi per tutti i listini del fornitore.
//   - Carica file (solo admin): file -> foglio -> riga dei titoli -> listino (esistente = lo SOSTITUISCE
//     per intero, oppure nuovo) -> scadenza -> ricarico -> colonne -> anteprima -> conferma.
//   - Codici EAN da un catalogo del fornitore (solo admin): si tengono solo gli EAN degli articoli dei listini.
// Prezzi IVA inclusa: listino x 1,22; netto x 1,22 (oscurabile); cliente = netto + ricarico, x 1,22, all'euro.
// Avvisi scadenze: riquadro in dashboard e in Listini Vendite + pallino sulle card (lfControllaScadenze, da showDashboard).
// Filtro "fuori listino": articoli collegati che non sono piu' in nessun listino (modelli usciti di produzione).
// Permessi (a regime): vedere, Collega e Crea = admin e operatori; fornitori, caricamenti, scadenze, ricarico, EAN = admin.
// Tabelle: lf_fornitori, lf_listini, lf_articoli, lf_prezzi (supabase/listini-fornitori-setup.sql)
// Usa listino-functions.js (listinoEsc, listinoFetchAll, ...) e macPickerImposta (macchine-functions.js).
// ========================================

// Dal 9/11/2026: vedere, Collega e Crea = admin e operatori; caricamenti, fornitori, scadenze, ricarico, EAN = solo admin.
// Su Supabase: lf_puo_vedere() / lf_collega() = admin e operatori, lf_puo_caricare() = admin.
const LF_RUOLI_VEDERE = ['admin', 'operatore'];
const LF_RUOLI_CARICARE = ['admin'];
const LF_RUOLI_COLLEGARE = ['admin', 'operatore'];   // Collega / Crea (deve corrispondere a lf_collega() su Supabase)
const LF_IVA = 1.22;
const LF_RICARICO_DEFAULT = 30;
const LF_GIORNI_AVVISO = 7;
const LF_MAX_RIGHE_VISTA = 400;
const LF_NUOVO = 'NUOVO';

let lfFornitori = [];
let lfListini = [];
let lfArticoli = [];
let lfPrezzi = [];
let lfPrezziDi = {};          // id articolo -> [prezzi]
let lfCaricato = false;
let lfNettiVisibili = false;
let lfSearchTimeout = null;
let lfWb = null;
let lfFileNome = '';
let lfPiano = null;
let lfInCreazione = null;     // articolo del fornitore per cui si sta creando l'articolo nel Listino Agrimacch
let lfCollegaId = null;
let lfEanWb = null;
let lfEanPiano = null;
let lfFornitoreInModifica = null;

function lfRuolo(lista) {
    return typeof currentUserRole !== 'undefined' && lista.indexOf(currentUserRole) !== -1;
}
function lfPuoVedere() { return lfRuolo(LF_RUOLI_VEDERE); }
function lfPuoCaricare() { return lfRuolo(LF_RUOLI_CARICARE); }
function lfPuoCollegare() { return lfRuolo(LF_RUOLI_COLLEGARE); }

// ========================================
// UTILITA' E PREZZI
// ========================================
function lfNum(v) {
    return (v === null || v === undefined || v === '') ? null : Number(v);
}

function lfIvato(n) {
    n = lfNum(n);
    return n === null ? null : Math.round(n * LF_IVA * 100) / 100;
}

function lfEuroIntero(n) {
    if (n === null || n === undefined) return '-';
    return '&#8364;&nbsp;' + Number(n).toLocaleString('it-IT', { maximumFractionDigits: 0 });
}

function lfCodiceNorm(c) {
    return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function lfFornitore(id) { return lfFornitori.find(f => f.id === id) || null; }
function lfListino(id) { return lfListini.find(l => l.id === id) || null; }
function lfArticolo(id) { return lfArticoli.find(a => a.id === id) || null; }

function lfFornitoreCorrente() {
    const id = Number(sessionStorage.getItem('lfFornitore'));
    return lfFornitore(id) || lfFornitoriOrdinati()[0] || null;
}

function lfFornitoriOrdinati() {
    return lfFornitori.slice().sort((a, b) => listinoConfronta(a.nome, b.nome));
}

function lfListiniDi(fornitoreId) {
    return lfListini.filter(l => l.fornitore_id === fornitoreId).sort((a, b) => listinoConfronta(a.nome, b.nome));
}

function lfPrezzoCliente(prezzo) {
    const l = lfListino(prezzo.listino_id);
    const netto = lfNum(prezzo.netto_escl);
    if (netto === null) return null;
    const ric = l ? lfNum(l.ricarico) : null;
    return Math.round(netto * (1 + (ric === null ? LF_RICARICO_DEFAULT : ric) / 100) * LF_IVA);
}

function lfOggiISO() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function lfDataIt(iso) {
    if (!iso) return '';
    const p = String(iso).slice(0, 10).split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso;
}

// 'scaduto' | 'presto' (entro 7 giorni) | 'ok' | 'nessuna' (senza scadenza)
function lfStatoScadenza(l) {
    if (!l || !l.scadenza) return 'nessuna';
    const oggi = lfOggiISO();
    const s = String(l.scadenza).slice(0, 10);
    if (s < oggi) return 'scaduto';
    const tra = new Date(oggi + 'T12:00:00');
    tra.setDate(tra.getDate() + LF_GIORNI_AVVISO);
    const limite = tra.getFullYear() + '-' + String(tra.getMonth() + 1).padStart(2, '0') + '-' + String(tra.getDate()).padStart(2, '0');
    return s <= limite ? 'presto' : 'ok';
}

// Giorni da oggi alla scadenza (0 = scade oggi, negativo = scaduto)
function lfGiorniAllaScadenza(l) {
    if (!l || !l.scadenza) return null;
    const a = new Date(lfOggiISO() + 'T12:00:00');
    const b = new Date(String(l.scadenza).slice(0, 10) + 'T12:00:00');
    return Math.round((b - a) / 86400000);
}

function lfTestoScadenza(l) {
    if (!l || !l.scadenza) return 'senza scadenza';
    const st = lfStatoScadenza(l);
    if (st === 'scaduto') return 'scaduto il ' + lfDataIt(l.scadenza);
    if (st === 'presto') {
        const g = lfGiorniAllaScadenza(l);
        return 'scade il ' + lfDataIt(l.scadenza) + (g === 0 ? ' (oggi)' : g === 1 ? ' (domani)' : ' (tra ' + g + ' giorni)');
    }
    return 'fino al ' + lfDataIt(l.scadenza);
}

// Prezzi di un articolo: il migliore (prezzo cliente piu' basso tra i listini non scaduti) per primo
function lfPrezziArticolo(a, soloListino) {
    let lista = (lfPrezziDi[a.id] || []).filter(p => lfListino(p.listino_id));
    if (soloListino) lista = lista.filter(p => p.listino_id === soloListino);
    const valido = p => lfStatoScadenza(lfListino(p.listino_id)) !== 'scaduto';
    return lista.slice().sort((x, y) => {
        const vx = valido(x) ? 0 : 1, vy = valido(y) ? 0 : 1;
        if (vx !== vy) return vx - vy;
        const cx = lfPrezzoCliente(x), cy = lfPrezzoCliente(y);
        if (cx === null && cy !== null) return 1;
        if (cy === null && cx !== null) return -1;
        return (cx || 0) - (cy || 0) || listinoConfronta(lfListino(x.listino_id).nome, lfListino(y.listino_id).nome);
    });
}

function lfPrezzoMigliore(a) {
    return lfPrezziArticolo(a)[0] || null;
}

function lfArticoloListino(a) {
    if (!a || !a.articolo_id) return null;
    return listinoArticoli.find(x => x.id === a.articolo_id && x.attivo) || null;
}

// Per il Carico a raffica: articolo di un fornitore con questo EAN
function lfArticoloDaEan(codice) {
    if (!lfCaricato || !codice) return null;
    return lfArticoli.find(a => a.ean && listinoStessoCodiceBarre(a.ean, codice)) || null;
}

function lfNomeFornitore(a) {
    const f = a ? lfFornitore(a.fornitore_id) : null;
    return f ? f.nome : '';
}

// ========================================
// CARICAMENTO DATI E APERTURA
// ========================================
async function lfCaricaDati() {
    const [f, l, a, p] = await Promise.all([
        listinoFetchAll('lf_fornitori'), listinoFetchAll('lf_listini'), listinoFetchAll('lf_articoli'), listinoFetchAll('lf_prezzi')
    ]);
    lfFornitori = f;
    lfListini = l;
    lfArticoli = a;
    lfPrezzi = p;
    const per = {};
    p.forEach(x => { (per[x.articolo_id] = per[x.articolo_id] || []).push(x); });
    lfPrezziDi = per;
    lfCaricato = true;
}

async function openListiniFornitoriPrezzi() {
    if (!lfPuoVedere()) return;
    if (!lfPuoCaricare() && ['carica'].indexOf(sessionStorage.getItem('lfTab')) !== -1) sessionStorage.removeItem('lfTab');
    lfNettiVisibili = listinoLeggiPreferenza('lfNettiVisibili');
    lfApplicaNetti();
    document.querySelectorAll('#section-listini-prezzi .lf-solo-carica').forEach(b => b.classList.toggle('hidden', !lfPuoCaricare()));
    document.querySelectorAll('#section-listini-prezzi .lf-solo-collega').forEach(b => b.classList.toggle('hidden', !lfPuoCollegare()));
    lfSwitchTab(sessionStorage.getItem('lfTab') || 'elenco', true);
    const box = document.getElementById('lf-container');
    if (box && !lfCaricato) box.innerHTML = '<div class="card"><p style="text-align:center">&#8987; Caricamento listini fornitori...</p></div>';
    try {
        if (!listinoCaricato) await loadListino();
        await lfCaricaDati();
    } catch (error) {
        console.error('Errore caricamento listini fornitori:', error);
        if (box) box.innerHTML = '<div class="card"><p style="text-align:center">&#10060; Errore caricamento listini fornitori: ' +
            listinoEsc(error.message) + '</p><p style="text-align:center">Hai eseguito lo script <strong>listini-fornitori-setup.sql</strong> su Supabase?</p></div>';
        return;
    }
    lfRenderTutto();
}

function lfSwitchTab(tab, senzaRender) {
    if (['elenco', 'carica', 'listini'].indexOf(tab) === -1) tab = 'elenco';
    if (tab === 'carica' && !lfPuoCaricare()) tab = 'elenco';
    sessionStorage.setItem('lfTab', tab);
    document.querySelectorAll('#tabs-lf .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.lfTab === tab));
    document.querySelectorAll('#section-listini-prezzi .tab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-lf-' + tab));
    document.getElementById('lf-toolbar').classList.toggle('hidden', tab !== 'elenco');
    if (senzaRender) return;
    if (tab === 'listini') lfRenderListini();
    if (tab === 'carica') lfPreparaCarica();
}

// ========================================
// AVVISI SCADENZE (dashboard e menu Listini Vendite)
// Listini scaduti (rosso) o che scadono entro LF_GIORNI_AVVISO giorni (arancione), per chi vede Listini Fornitori.
// I dati sono quelli della sezione se e' gia' stata aperta, altrimenti una lettura leggera (al massimo ogni 5 minuti).
// ========================================
let lfAvvisoDati = null;      // { listini, fornitori, letto }

async function lfControllaScadenze(forza) {
    if (!lfPuoVedere()) { lfMostraAvvisi([]); return; }
    let listini, fornitori;
    if (lfCaricato) {
        listini = lfListini;
        fornitori = lfFornitori;
    } else {
        if (forza || !lfAvvisoDati || Date.now() - lfAvvisoDati.letto > 5 * 60 * 1000) {
            try {
                const [l, f] = await Promise.all([
                    supabaseClient.from('lf_listini').select('id, fornitore_id, nome, scadenza'),
                    supabaseClient.from('lf_fornitori').select('id, nome')
                ]);
                if (l.error || f.error) throw (l.error || f.error);
                lfAvvisoDati = { listini: l.data || [], fornitori: f.data || [], letto: Date.now() };
            } catch (e) {
                console.warn('Avvisi scadenze listini non disponibili:', e.message || e);
                return;
            }
        }
        listini = lfAvvisoDati.listini;
        fornitori = lfAvvisoDati.fornitori;
    }
    const nomeF = id => { const f = fornitori.find(x => x.id === id); return f ? f.nome : ''; };
    const avvisi = listini.map(l => ({ l: l, st: lfStatoScadenza(l), fornitore: nomeF(l.fornitore_id) }))
        .filter(x => x.st === 'scaduto' || x.st === 'presto')
        .sort((x, y) => String(x.l.scadenza).localeCompare(String(y.l.scadenza)));
    lfMostraAvvisi(avvisi);
}

function lfMostraAvvisi(avvisi) {
    const firma = avvisi.map(x => x.l.id + ':' + x.l.scadenza).join(',');
    const chiuso = sessionStorage.getItem('lfAvvisoChiuso') === firma;
    const scaduti = avvisi.some(x => x.st === 'scaduto');
    const html = avvisi.length ? '<div class="lf-avviso-testo"><strong>' + (scaduti ? '&#9888;&#65039; Listini fornitori da aggiornare' : '&#9203; Listini fornitori in scadenza') + '</strong>' +
        '<ul>' + avvisi.map(x => '<li class="lf-avviso-' + x.st + '"><strong>' + listinoEsc(x.fornitore + ' ' + x.l.nome) + '</strong>: ' +
            listinoEsc(lfTestoScadenza(x.l)) + '</li>').join('') + '</ul>' +
        '<small>Tocca per aprire Listini Fornitori</small></div>' +
        '<button type="button" class="lf-avviso-chiudi" data-lf-avviso-chiudi="1" title="Nascondi fino al prossimo accesso">&times;</button>' : '';
    document.querySelectorAll('.lf-avviso-box').forEach(box => {
        box.innerHTML = html;
        box.dataset.firma = firma;
        box.classList.toggle('hidden', !avvisi.length || chiuso);
        box.classList.toggle('lf-avviso-rosso', scaduti);
    });
    // pallino sulle card Listini Vendite e Listini Fornitori
    ['dashboard-vendite-card', 'vendite-lf-card'].forEach(id => {
        const card = document.getElementById(id);
        if (!card) return;
        let p = card.querySelector('.lf-card-pallino');
        if (!avvisi.length) { if (p) p.remove(); return; }
        if (!p) { p = document.createElement('span'); card.appendChild(p); }
        p.className = 'lf-card-pallino ' + (scaduti ? 'lf-scaduto' : 'lf-presto');
        p.title = scaduti ? 'Ci sono listini fornitori scaduti' : 'Ci sono listini fornitori in scadenza';
    });
}

function lfRenderTutto() {
    if (!lfCaricato) return;
    lfControllaScadenze();
    lfRenderFornitori();
    lfRenderScadenze();
    lfPopolaFiltri();
    lfRenderElenco();
    lfRenderListini();
    lfPreparaCarica();
}

function lfApplicaNetti() {
    const s = document.getElementById('section-listini-prezzi');
    if (s) s.classList.toggle('netti-nascosti', !lfNettiVisibili);
    const t = document.getElementById('lf-toggle-netti');
    if (t) t.checked = lfNettiVisibili;
}

// Schede dei fornitori in alto
function lfRenderFornitori() {
    const box = document.getElementById('lf-fornitori');
    if (!box) return;
    const corrente = lfFornitoreCorrente();
    box.innerHTML = lfFornitoriOrdinati().map(f =>
        '<button type="button" class="lf-forn-btn' + (corrente && f.id === corrente.id ? ' active' : '') + '" data-lf-fornitore="' + f.id + '">' +
            listinoEsc(f.nome) + lfBadgeFornitore(f) + '</button>'
    ).join('') +
        (lfPuoCaricare() ? '<button type="button" class="lf-forn-btn lf-forn-nuovo" data-lf-azione="nuovo-fornitore">&#10133; Fornitore</button>' : '') +
        (lfPuoCaricare() && corrente ? '<button type="button" class="mac-link lf-forn-modifica" data-lf-azione="modifica-fornitore">&#9997;&#65039; ' + listinoEsc(corrente.nome) + '</button>' : '');
    const titolo = document.getElementById('lf-titolo-fornitore');
    if (titolo) titolo.textContent = corrente ? corrente.nome : '';
}

// Pallino rosso/arancione sul fornitore se ha listini scaduti o in scadenza
function lfBadgeFornitore(f) {
    const st = lfListiniDi(f.id).map(lfStatoScadenza);
    if (st.indexOf('scaduto') !== -1) return ' <span class="lf-pallino lf-scaduto" title="Un listino &egrave; scaduto"></span>';
    if (st.indexOf('presto') !== -1) return ' <span class="lf-pallino lf-presto" title="Un listino scade entro ' + LF_GIORNI_AVVISO + ' giorni"></span>';
    return '';
}

// Barra delle scadenze dei listini del fornitore
function lfRenderScadenze() {
    const box = document.getElementById('lf-scadenze');
    if (!box) return;
    const f = lfFornitoreCorrente();
    const listini = f ? lfListiniDi(f.id) : [];
    if (!listini.length) {
        box.innerHTML = f ? '<span class="mac-aiuto">Nessun listino per ' + listinoEsc(f.nome) + (lfPuoCaricare() ? ': caricalo da <strong>Carica file</strong>.' : '.') + '</span>' : '';
        return;
    }
    box.innerHTML = listini.map(l => {
        const st = lfStatoScadenza(l);
        return '<span class="lf-scad lf-' + st + '"><strong>' + listinoEsc(l.nome) + '</strong> &middot; ' + listinoEsc(lfTestoScadenza(l)) +
            (st === 'scaduto' ? ' &#9888;&#65039;' : st === 'presto' ? ' &#9203;' : '') + '</span>';
    }).join('');
}

// ========================================
// ELENCO
// ========================================
function lfPopolaFiltri() {
    const f = lfFornitoreCorrente();
    const cat = document.getElementById('lf-filtro-categoria');
    const lis = document.getElementById('lf-filtro-listino');
    if (!cat || !lis) return;
    const arts = f ? lfArticoli.filter(a => a.fornitore_id === f.id) : [];
    const corrCat = cat.value;
    const categorie = [...new Set(arts.map(a => a.categoria).filter(Boolean))].sort(listinoConfronta);
    cat.innerHTML = '<option value="">Tutte le categorie</option>' + categorie.map(c => '<option value="' + listinoEsc(c) + '">' + listinoEsc(c) + '</option>').join('');
    cat.value = categorie.indexOf(corrCat) !== -1 ? corrCat : '';
    const corrLis = lis.value;
    const listini = f ? lfListiniDi(f.id) : [];
    lis.innerHTML = '<option value="">Tutti i listini</option>' + listini.map(l => '<option value="' + l.id + '">' + listinoEsc(l.nome) +
        ' (' + listinoEsc(lfTestoScadenza(l)) + ')</option>').join('');
    lis.value = listini.some(l => String(l.id) === corrLis) ? corrLis : '';
}

function lfFiltrati() {
    const f = lfFornitoreCorrente();
    if (!f) return [];
    const ricerca = listinoPulisciTesto(document.getElementById('lf-search').value) || '';
    const categoria = document.getElementById('lf-filtro-categoria').value;
    const listino = Number(document.getElementById('lf-filtro-listino').value) || null;
    const collegati = document.getElementById('lf-filtro-collegati').value;
    const parole = ricerca.split(' ').filter(Boolean);
    return lfArticoli.filter(a => {
        if (a.fornitore_id !== f.id) return false;
        const coll = !!lfArticoloListino(a);
        if (collegati === 'fuori') {
            // collegati al Listino Agrimacch ma non piu' in nessun listino del fornitore (modelli usciti di produzione)
            if (!coll || lfPrezziArticolo(a).length) return false;
        } else {
            const prezzi = lfPrezziArticolo(a, listino);
            if (!prezzi.length) return false;  // articoli che non sono in nessun listino (tolti dai file nuovi): non si vedono
        }
        if (categoria && a.categoria !== categoria) return false;
        if (collegati === 'si' && !coll) return false;
        if (collegati === 'no' && coll) return false;
        if (!parole.length) return true;
        const testo = [a.codice, lfCodiceNorm(a.codice), a.descrizione, a.categoria, a.ean].filter(Boolean).join(' ').toUpperCase();
        return parole.every(p => testo.indexOf(p) !== -1 || (lfCodiceNorm(p).length >= 4 && testo.indexOf(lfCodiceNorm(p)) !== -1));
    });
}

function lfAzioniHtml(a) {
    const coll = lfArticoloListino(a);
    if (!lfPuoCollegare()) return coll ? '<span class="sti-btn-collegato sti-solo-info">&#10004; Nel listino</span>' : '';
    if (coll) {
        return '<button type="button" class="sti-btn-collegato" data-lf-apri="' + coll.id + '" title="Apri l\'articolo nel Listino Agrimacch">&#10004; Nel listino</button>' +
            '<button type="button" class="sti-btn-scollega" data-lf-scollega="' + a.id + '" title="Togli il collegamento">&#10006;</button>';
    }
    return '<button type="button" class="btn-back mac-btn-piccolo" data-lf-collega="' + a.id + '" title="Collega a un articolo che hai gi&agrave; nel Listino Agrimacch">&#128279; Collega</button>' +
        '<button type="button" class="btn-back mac-btn-piccolo" data-lf-crea="' + a.id + '" title="Crea l\'articolo nel Listino Agrimacch">&#10133; Crea</button>';
}

// Le righe di prezzo di un articolo (una per listino), la migliore in evidenza
function lfPrezziHtml(a, soloListino) {
    const prezzi = lfPrezziArticolo(a, soloListino);
    if (!prezzi.length) return '<span class="lf-fuori">&#128683; Non &egrave; pi&ugrave; in nessun listino del fornitore</span>';
    return prezzi.map((p, i) => {
        const l = lfListino(p.listino_id);
        const st = lfStatoScadenza(l);
        const migliore = i === 0 && prezzi.length > 1 && st !== 'scaduto';
        return '<div class="lf-pr lf-pr-' + st + (migliore ? ' lf-pr-migliore' : '') + '">' +
            '<span class="lf-pr-listino lf-' + st + '" title="' + listinoEsc(lfTestoScadenza(l)) + '">' + listinoEsc(l.nome) +
                (l.scadenza ? ' <small>' + (st === 'scaduto' ? 'scad. ' : 'al ') + lfDataIt(l.scadenza).slice(0, 5) + '</small>' : '') + '</span>' +
            '<span class="lf-pr-cliente" title="Prezzo cliente IVA incl.">' + lfEuroIntero(lfPrezzoCliente(p)) + '</span>' +
            '<span class="lf-pr-dett">list. ' + listinoFormatEuro(lfIvato(p.listino_escl)) +
                ' &middot; <span class="netto-val">netto ' + listinoFormatEuro(lfIvato(p.netto_escl)) + ' &middot; ric. ' + listinoEsc(String(lfNum(l.ricarico))) + '%</span></span>' +
            (migliore ? '<span class="lf-pr-stella" title="Prezzo cliente pi&ugrave; basso tra i listini validi">&#9733;</span>' : '') +
        '</div>';
    }).join('');
}

function lfRenderElenco() {
    const box = document.getElementById('lf-container');
    const conta = document.getElementById('lf-count');
    if (!box) return;
    const f = lfFornitoreCorrente();
    if (!f) {
        box.innerHTML = '<div class="card listino-vuoto"><p><strong>Nessun fornitore.</strong></p>' +
            (lfPuoCaricare() ? '<p>Premi <strong>&#10133; Fornitore</strong> in alto per crearne uno.</p>' : '') + '</div>';
        if (conta) conta.textContent = '';
        return;
    }
    const totale = lfArticoli.filter(a => a.fornitore_id === f.id && (lfPrezziDi[a.id] || []).length).length;
    if (!totale) {
        box.innerHTML = '<div class="card listino-vuoto"><p><strong>&#128203; Nessun articolo per ' + listinoEsc(f.nome) + '.</strong></p>' +
            (lfPuoCaricare() ? '<p>Vai nella scheda <strong>Carica file</strong> e carica il file Excel del fornitore.</p>' : '') + '</div>';
        if (conta) conta.textContent = '';
        return;
    }
    const soloListino = Number(document.getElementById('lf-filtro-listino').value) || null;
    const fuori = document.getElementById('lf-filtro-collegati').value === 'fuori';
    const filtrati = lfFiltrati().sort((x, y) =>
        listinoConfronta(x.categoria || 'ZZZ', y.categoria || 'ZZZ') || listinoConfronta(x.descrizione, y.descrizione));
    if (conta) conta.textContent = fuori ? filtrati.length + ' articoli fuori listino'
        : filtrati.length === totale ? totale + ' articoli' : filtrati.length + ' di ' + totale + ' articoli';
    if (!filtrati.length) {
        box.innerHTML = '<div class="card"><p style="text-align:center">' + (fuori
            ? 'Nessun articolo collegato &egrave; uscito dai listini del fornitore'
            : 'Nessun articolo trovato con questi filtri') + '</p></div>';
        return;
    }
    const mostrati = filtrati.slice(0, LF_MAX_RIGHE_VISTA);
    const gruppi = {};
    const ordine = [];
    mostrati.forEach(a => {
        const g = a.categoria || 'SENZA CATEGORIA';
        if (!gruppi[g]) { gruppi[g] = []; ordine.push(g); }
        gruppi[g].push(a);
    });
    let html = '';
    ordine.forEach(nome => {
        const lista = gruppi[nome];
        const righe = lista.map(a =>
            '<tr>' +
                '<td class="sti-col-codice">' + listinoVal(a.codice) + (a.ean ? '<br><small class="sti-ean" title="Codice a barre EAN">&#9646;&#9647;&#9646; ' + listinoEsc(a.ean) + '</small>' : '') + '</td>' +
                '<td><strong>' + listinoVal(a.descrizione) + '</strong></td>' +
                '<td class="lf-col-prezzi">' + lfPrezziHtml(a, soloListino) + '</td>' +
                '<td class="sti-col-azioni">' + lfAzioniHtml(a) + '</td>' +
            '</tr>').join('');
        const schede = lista.map(a => '<div class="listino-card">' +
            '<div class="listino-card-top"><div class="listino-card-title"><strong>' + listinoVal(a.descrizione) + '</strong></div></div>' +
            '<div class="listino-card-sub">' + listinoVal(a.codice) + (a.ean ? ' &middot; EAN ' + listinoEsc(a.ean) : '') + '</div>' +
            '<div class="lf-card-prezzi">' + lfPrezziHtml(a, soloListino) + '</div>' +
            '<div class="sti-card-azioni">' + lfAzioniHtml(a) + '</div>' +
            '</div>').join('');
        html += '<div class="listino-gruppo">' +
            '<div class="listino-gruppo-header"><h3>' + listinoEsc(nome) + '</h3>' +
            '<span class="listino-gruppo-count">' + lista.length + (lista.length === 1 ? ' articolo' : ' articoli') + '</span></div>' +
            '<div class="listino-desktop"><div class="table-container"><table class="listino-table sti-table lf-table"><thead><tr>' +
            '<th>Codice</th><th>Descrizione</th><th>Prezzi per listino <small>(cliente IVA incl. &middot; listino &middot; netto)</small></th><th>Listino Agrimacch</th>' +
            '</tr></thead><tbody>' + righe + '</tbody></table></div></div>' +
            '<div class="listino-mobile">' + schede + '</div>' +
            '</div>';
    });
    if (filtrati.length > mostrati.length) {
        html += '<div class="card"><p style="text-align:center">... altri ' + (filtrati.length - mostrati.length) +
            ' articoli: scrivi nella ricerca o scegli una categoria per vederli.</p></div>';
    }
    box.innerHTML = html;
    lfApplicaNetti();
}

// ========================================
// COLLEGAMENTO CON IL LISTINO AGRIMACCH
// ========================================
function lfProprietarioEan(ean, tranneId) {
    if (!ean) return null;
    return listinoArticoli.find(x => x.id !== tranneId && listinoStessoCodiceBarre(x.codice_barre, ean)) || null;
}

// Mette l'EAN nel codice a barre dell'articolo del Listino Agrimacch, solo se e' vuoto e nessun altro lo usa
async function lfPassaEan(a, art) {
    if (!a || !a.ean || !art) return 'niente';
    if (art.codice_barre) return listinoStessoCodiceBarre(art.codice_barre, a.ean) ? 'uguale' : 'diverso';
    if (lfProprietarioEan(a.ean, art.id)) return 'conflitto';
    const { error } = await supabaseClient.from('listino_articoli').update({ codice_barre: a.ean }).eq('id', art.id);
    if (error) {
        console.error('Errore codice a barre dal listino fornitore:', error);
        return 'conflitto';
    }
    art.codice_barre = a.ean;
    return 'messo';
}

async function lfSalvaCollegamento(id, articoloId) {
    const { error } = await supabaseClient.rpc('lf_collega', { p_id: id, p_articolo: articoloId });
    if (error) {
        console.error('Errore collegamento listino fornitore:', error);
        await showCustomAlert('Collegamento non salvato:<br>' + listinoEsc(error.message), 'Errore', '&#10060;');
        return false;
    }
    const a = lfArticolo(id);
    if (a) a.articolo_id = articoloId;
    // il codice del fornitore passa nel codice articolo (lo fa Supabase): lo aggiorno anche qui
    const art = articoloId ? listinoArticoli.find(x => x.id === articoloId) : null;
    if (a && art && !art.codice_articolo && Object.prototype.hasOwnProperty.call(art, 'codice_articolo')) art.codice_articolo = a.codice;
    lfRenderElenco();
    return true;
}

function lfApriCollega(id) {
    if (!lfPuoCollegare()) return;
    const a = lfArticolo(id);
    if (!a) return;
    lfCollegaId = id;
    const p = lfPrezzoMigliore(a);
    document.getElementById('lf-collega-articolo').innerHTML = '<strong>' + listinoEsc(a.descrizione || '') + '</strong><br><small>' +
        listinoEsc(lfNomeFornitore(a) + ' ' + a.codice) + (p ? ' &middot; prezzo cliente ' + lfEuroIntero(lfPrezzoCliente(p)) : '') + '</small>';
    const cerca = document.getElementById('lf-collega-search');
    const m = String(a.descrizione || '').match(/^[A-Z]+\s?\d+[\.\d]*/);
    cerca.value = m ? m[0] : '';
    document.getElementById('lf-collega-modal').classList.remove('hidden');
    setTimeout(() => { cerca.focus(); if (cerca.value && typeof macPickerMostra === 'function') macPickerMostra('lf-collega-search'); }, 50);
}

function lfChiudiCollega() {
    document.getElementById('lf-collega-modal').classList.add('hidden');
    if (typeof macPickerChiudi === 'function') macPickerChiudi('lf-collega-search');
    lfCollegaId = null;
}

async function lfCollegaScelto(art) {
    const id = lfCollegaId;
    if (!id) return;
    const a = lfArticolo(id);
    const giaUsato = lfArticoli.find(x => x.articolo_id === art.id && x.id !== id);
    if (giaUsato && !window.confirm('"' + macNome(art) + '" \u00e8 gi\u00e0 collegato al codice ' + giaUsato.codice +
        '.\n\nCollegarlo anche a questo?')) return;
    // Codice articolo gia' scritto e diverso: forse e' il modello sbagliato o un modello vecchio. Non viene cambiato.
    if (a && art.codice_articolo && lfCodiceNorm(art.codice_articolo) !== lfCodiceNorm(a.codice) &&
        !window.confirm('"' + macNome(art) + '" ha gi\u00e0 il codice articolo ' + art.codice_articolo +
            ', diverso da ' + a.codice + '.\n\nForse \u00e8 un altro modello (o il modello vecchio): se \u00e8 un modello nuovo usa Crea.' +
            '\n\nCollegarlo lo stesso? Il codice articolo ' + art.codice_articolo + ' resta com\'\u00e8.')) return;
    if (!(await lfSalvaCollegamento(id, art.id))) return;
    lfChiudiCollega();
    const esito = await lfPassaEan(a, art);
    if (esito === 'messo') await showCustomAlert('Collegato. L\'EAN &egrave; stato messo anche nel <strong>codice a barre</strong> di ' +
        listinoEsc(macNome(art)) + ': il lettore lo riconosce subito.', 'Fatto', '&#10004;');
    else if (esito === 'diverso') await showCustomAlert('Collegato. Attenzione: ' + listinoEsc(macNome(art)) + ' ha gi&agrave; un codice a barre diverso (' +
        listinoEsc(art.codice_barre) + '), non l\'ho cambiato.', 'Fatto', '&#9888;&#65039;');
    else if (esito === 'conflitto') await showCustomAlert('Collegato. L\'EAN &egrave; gi&agrave; usato da un altro articolo del Listino Agrimacch, quindi non l\'ho messo.', 'Fatto', '&#9888;&#65039;');
}

async function lfScollega(id) {
    const a = lfArticolo(id);
    if (!a) return;
    if (!window.confirm('Togliere il collegamento di ' + a.codice + ' con il Listino Agrimacch?\n\nL\'articolo nel Listino Agrimacch resta com\'\u00e8.')) return;
    await lfSalvaCollegamento(id, null);
}

// "Crea": apre la finestra Nuovo articolo del Listino Agrimacch gia' compilata (prezzi dal listino migliore)
function lfCreaInListino(id) {
    const a = lfArticolo(id);
    if (!a || typeof openListinoEdit !== 'function' || !lfPuoCollegare()) return;
    const f = lfFornitore(a.fornitore_id);
    const p = lfPrezzoMigliore(a);
    const l = p ? lfListino(p.listino_id) : null;
    lfInCreazione = id;
    openListinoEdit(null);
    const metti = (campo, valore) => {
        const el = document.getElementById('listino-edit-' + campo);
        if (el) el.value = valore === null || valore === undefined ? '' : valore;
    };
    metti('marchio', f ? (f.marchio || f.nome) : '');
    metti('modello', a.descrizione || '');
    if (p) {
        metti('netto-1', listinoNumeroPerForm(lfIvato(p.netto_escl)));
        metti('vendita-no-promo', String(lfPrezzoCliente(p) || ''));
        metti('listino', listinoNumeroPerForm(lfIvato(p.listino_escl)));
    }
    metti('note-1', (f ? f.nome + ' ' : '') + a.codice + (l ? ' - ' + l.nome : ''));
    if (a.ean && !lfProprietarioEan(a.ean, null)) metti('codice-barre', a.ean);
    metti('codice-articolo', a.codice || '');
    document.getElementById('listino-edit-titolo').innerHTML = '&#10133; Nuovo articolo da ' + listinoEsc(f ? f.nome : '') + ' ' + listinoEsc(a.codice);
    const attrezzo = document.getElementById('listino-edit-attrezzo');
    if (attrezzo) setTimeout(() => attrezzo.focus(), 50);
}

// Chiamata da saveListinoEdit() dopo il salvataggio di un articolo del Listino Agrimacch
function lfDopoSalvataggioListino(articoloId, nuovo) {
    const id = lfInCreazione;
    lfInCreazione = null;
    if (!id || !nuovo || !articoloId) return;
    lfSalvaCollegamento(id, articoloId);
}

// ========================================
// FORNITORI (solo admin)
// ========================================
function lfApriFornitore(f) {
    lfFornitoreInModifica = f || null;
    document.getElementById('lf-forn-titolo').innerHTML = f ? '&#9997;&#65039; Fornitore ' + listinoEsc(f.nome) : '&#10133; Nuovo fornitore';
    document.getElementById('lf-forn-nome').value = f ? f.nome : '';
    document.getElementById('lf-forn-marchio').value = f ? (f.marchio || '') : '';
    document.getElementById('lf-forn-ricarico').value = f ? String(lfNum(f.ricarico_default)).replace('.', ',') : String(LF_RICARICO_DEFAULT);
    document.getElementById('lf-forn-elimina').classList.toggle('hidden', !f);
    document.getElementById('lf-forn-modal').classList.remove('hidden');
    setTimeout(() => document.getElementById('lf-forn-nome').focus(), 50);
}

function lfChiudiFornitore() {
    document.getElementById('lf-forn-modal').classList.add('hidden');
    lfFornitoreInModifica = null;
}

async function lfSalvaFornitore() {
    const nome = listinoPulisciTesto(document.getElementById('lf-forn-nome').value);
    const marchio = listinoPulisciTesto(document.getElementById('lf-forn-marchio').value);
    const ric = listinoParseNumero(document.getElementById('lf-forn-ricarico').value);
    if (!nome) { await showCustomAlert('Scrivi il nome del fornitore', 'Fornitore', '&#9888;&#65039;'); return; }
    if (typeof ric !== 'number' || isNaN(ric) || ric < 0 || ric > 500) { await showCustomAlert('Ricarico non valido', 'Fornitore', '&#9888;&#65039;'); return; }
    if (lfFornitori.some(f => f.nome === nome && (!lfFornitoreInModifica || f.id !== lfFornitoreInModifica.id))) {
        await showCustomAlert('C\'&egrave; gi&agrave; un fornitore ' + listinoEsc(nome), 'Fornitore', '&#9888;&#65039;');
        return;
    }
    const dati = { nome: nome, marchio: marchio, ricarico_default: ric };
    let res;
    if (lfFornitoreInModifica) res = await supabaseClient.from('lf_fornitori').update(dati).eq('id', lfFornitoreInModifica.id).select('*').single();
    else res = await supabaseClient.from('lf_fornitori').insert([Object.assign(dati, { created_by: listinoEmailUtente() })]).select('*').single();
    if (res.error) { await showCustomAlert('Errore:<br>' + listinoEsc(res.error.message), 'Errore', '&#10060;'); return; }
    sessionStorage.setItem('lfFornitore', String(res.data.id));
    lfChiudiFornitore();
    await lfCaricaDati();
    lfRenderTutto();
}

async function lfEliminaFornitore() {
    const f = lfFornitoreInModifica;
    if (!f) return;
    const n = lfArticoli.filter(a => a.fornitore_id === f.id).length;
    if (!window.confirm('Eliminare il fornitore ' + f.nome + ' con tutti i suoi listini (' + lfListiniDi(f.id).length + ') e i suoi ' + n +
        ' articoli?\n\nGli articoli del Listino Agrimacch restano come sono. Non si pu\u00f2 annullare.')) return;
    const { error } = await supabaseClient.from('lf_fornitori').delete().eq('id', f.id);
    if (error) { await showCustomAlert('Errore:<br>' + listinoEsc(error.message), 'Errore', '&#10060;'); return; }
    sessionStorage.removeItem('lfFornitore');
    lfChiudiFornitore();
    await lfCaricaDati();
    lfRenderTutto();
}

// ========================================
// LISTINI E SCADENZE
// ========================================
function lfRenderListini() {
    const box = document.getElementById('lf-listini');
    if (!box) return;
    const f = lfFornitoreCorrente();
    const listini = f ? lfListiniDi(f.id) : [];
    if (!listini.length) {
        box.innerHTML = '<p class="mac-aiuto">Nessun listino' + (f ? ' per ' + listinoEsc(f.nome) : '') + '.' +
            (lfPuoCaricare() ? ' Caricalo dalla scheda <strong>Carica file</strong>.' : '') + '</p>';
        return;
    }
    const conta = {};
    lfPrezzi.forEach(p => { conta[p.listino_id] = (conta[p.listino_id] || 0) + 1; });
    const admin = lfPuoCaricare();
    box.innerHTML = '<div class="table-container"><table class="listino-table sti-table"><thead><tr>' +
        '<th>Listino</th><th>Scadenza</th><th>Articoli</th><th>Ricarico</th><th>File caricato</th>' + (admin ? '<th></th>' : '') + '</tr></thead><tbody>' +
        listini.map(l => {
            const st = lfStatoScadenza(l);
            return '<tr class="lf-riga-' + st + '">' +
                '<td><strong>' + listinoEsc(l.nome) + '</strong></td>' +
                '<td class="lf-col-scad"><span class="lf-scad lf-' + st + '">' + listinoEsc(lfTestoScadenza(l)) + '</span>' +
                    (admin ? '<div class="lf-scad-riga"><input type="date" class="lf-scad-input" data-lf-scad-input="' + l.id + '" value="' + (l.scadenza ? String(l.scadenza).slice(0, 10) : '') + '">' +
                        '<button type="button" class="btn-back mac-btn-piccolo" data-lf-scad="' + l.id + '">Salva</button></div>' : '') + '</td>' +
                '<td class="mac-raf-num">' + (conta[l.id] || 0) + '</td>' +
                '<td class="sti-col-ric-mod">' + (admin
                    ? '<div class="lf-scad-riga"><input type="text" inputmode="decimal" class="sti-ric-input" data-lf-ric-input="' + l.id + '" value="' + listinoEsc(String(lfNum(l.ricarico)).replace('.', ',')) + '"> % ' +
                      '<button type="button" class="btn-back mac-btn-piccolo" data-lf-ric="' + l.id + '">Applica</button></div>'
                    : listinoEsc(String(lfNum(l.ricarico))) + '%') + '</td>' +
                '<td><small>' + listinoVal(l.file_nome) + '<br>' + listinoEsc(macDataOra(l.caricato_il)) + ' ' + listinoEsc(macChi(l.caricato_da)) + '</small></td>' +
                (admin ? '<td><button type="button" class="btn-danger mac-btn-piccolo" data-lf-elimina-listino="' + l.id + '">&#128465;</button></td>' : '') +
            '</tr>';
        }).join('') + '</tbody></table></div>' +
        '<p class="mac-aiuto">Rosso = scaduto (si consulta lo stesso), arancione = scade entro ' + LF_GIORNI_AVVISO + ' giorni. ' +
        (admin ? 'Un listino nuovo con lo stesso nome si carica da <strong>Carica file</strong> e sostituisce quello vecchio per intero.' : '') + '</p>';
}

async function lfSalvaScadenza(id) {
    const input = document.querySelector('[data-lf-scad-input="' + id + '"]');
    const val = input ? input.value : '';
    const { error } = await supabaseClient.from('lf_listini').update({ scadenza: val || null }).eq('id', id);
    if (error) { await showCustomAlert('Scadenza non salvata:<br>' + listinoEsc(error.message), 'Errore', '&#10060;'); return; }
    const l = lfListino(id);
    if (l) l.scadenza = val || null;
    lfRenderTutto();
}

async function lfCambiaRicarico(id) {
    const input = document.querySelector('[data-lf-ric-input="' + id + '"]');
    const ric = listinoParseNumero(input ? input.value : '');
    if (typeof ric !== 'number' || isNaN(ric) || ric < 0 || ric > 500) { await showCustomAlert('Ricarico non valido', 'Controlla i dati', '&#9888;&#65039;'); return; }
    const l = lfListino(id);
    if (!window.confirm('Applicare il ricarico ' + ric + '% a tutto il listino ' + (l ? l.nome : '') + '?')) return;
    const { error } = await supabaseClient.from('lf_listini').update({ ricarico: ric }).eq('id', id);
    if (error) { await showCustomAlert('Ricarico non salvato:<br>' + listinoEsc(error.message), 'Errore', '&#10060;'); return; }
    if (l) l.ricarico = ric;
    lfRenderTutto();
}

async function lfEliminaListino(id) {
    const l = lfListino(id);
    if (!l) return;
    if (!window.confirm('Eliminare il listino ' + l.nome + ' con tutti i suoi prezzi?\n\nGli articoli (con EAN e collegamenti) restano. Non si pu\u00f2 annullare.')) return;
    const { error } = await supabaseClient.from('lf_listini').delete().eq('id', id);
    if (error) { await showCustomAlert('Errore:<br>' + listinoEsc(error.message), 'Errore', '&#10060;'); return; }
    await lfCaricaDati();
    lfRenderTutto();
}

// ========================================
// CARICA FILE (solo admin)
// ========================================
const LF_CAMPI = [
    { campo: 'codice', titolo: 'Codice articolo', obbligatorio: true, indovina: h => h === 'CODICE' || h === 'CODICE ARTICOLO' || h === 'COD ARTICOLO' },
    { campo: 'descrizione', titolo: 'Descrizione', obbligatorio: true, indovina: h => h.indexOf('DESCRIZIONE') === 0 },
    { campo: 'listino', titolo: 'Listino IVA esclusa', obbligatorio: false, indovina: h => h.indexOf('LISTINO') !== -1 },
    { campo: 'netto', titolo: 'Netto IVA esclusa (prezzo promo)', obbligatorio: true, indovina: h => h.indexOf('PROMO') !== -1 || h.indexOf('NETTO') !== -1 },
    { campo: 'categoria', titolo: 'Categoria (facoltativa)', obbligatorio: false, indovina: h => h.indexOf('CATEG') === 0 }
];

function lfTestoCella(ws, r, c) {
    const cell = ws[XLSX.utils.encode_cell({ r: r, c: c })];
    if (!cell || cell.v === null || cell.v === undefined) return '';
    if (cell.v instanceof Date) return '';
    const v = typeof cell.v === 'string' ? cell.v : (cell.w !== undefined ? cell.w : String(cell.v));
    return String(v).replace(/\s+/g, ' ').trim();
}

function lfNormIntestazione(t) {
    return listinoNormalizzaIntestazione(String(t || '').replace(/[()]/g, ' '));
}

function lfRange(ws) {
    return ws && ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : null;
}

function lfTrovaIntestazioni(ws) {
    const rg = lfRange(ws);
    if (!rg) return -1;
    for (let r = rg.s.r; r <= Math.min(rg.e.r, rg.s.r + 80); r++) {
        let codice = false, prezzo = false;
        for (let c = rg.s.c; c <= Math.min(rg.e.c, 60); c++) {
            const h = lfNormIntestazione(lfTestoCella(ws, r, c));
            if (h === 'CODICE' || h === 'CODICE ARTICOLO' || h === 'COD ARTICOLO') codice = true;
            if (h.indexOf('LISTINO') !== -1 || h.indexOf('PROMO') !== -1 || h.indexOf('NETTO') !== -1 || h.indexOf('PREZZO') !== -1) prezzo = true;
        }
        if (codice && prezzo) return r;
    }
    return -1;
}

function lfFoglioNascosto(wb, nome) {
    try {
        const info = (wb.Workbook && wb.Workbook.Sheets) || [];
        const s = info.find(x => x.name === nome);
        return !!(s && s.Hidden);
    } catch (e) { return false; }
}

// Scheda Carica file: titolo con il fornitore e tendina dei listini
function lfPreparaCarica() {
    const f = lfFornitoreCorrente();
    const t = document.getElementById('lf-carica-fornitore');
    if (t) t.textContent = f ? f.nome : '';
    const t2 = document.getElementById('lf-ean-fornitore');
    if (t2) t2.textContent = f ? f.nome : '';
    lfPopolaDestinazione();
}

function lfPopolaDestinazione() {
    const sel = document.getElementById('lf-destinazione');
    if (!sel) return;
    const f = lfFornitoreCorrente();
    const corr = sel.value;
    const listini = f ? lfListiniDi(f.id) : [];
    sel.innerHTML = listini.map(l => '<option value="' + l.id + '">Sostituisci ' + listinoEsc(l.nome) + ' (' + listinoEsc(lfTestoScadenza(l)) + ')</option>').join('') +
        '<option value="' + LF_NUOVO + '">&#10133; Nuovo listino</option>';
    sel.value = (corr && (corr === LF_NUOVO || listini.some(l => String(l.id) === corr))) ? corr : LF_NUOVO;
}

function lfFileScelto(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!lfFornitoreCorrente()) { showCustomAlert('Crea prima il fornitore.', 'Fornitore', '&#9888;&#65039;'); return; }
    lfFileNome = file.name;
    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            lfWb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
        } catch (err) {
            console.error('Errore lettura Excel fornitore:', err);
            showCustomAlert('Non riesco a leggere il file:<br>' + listinoEsc(err.message), 'Errore', '&#10060;');
            return;
        }
        lfPiano = null;
        document.getElementById('lf-anteprima').innerHTML = '';
        const conIntest = lfWb.SheetNames.filter(n => lfTrovaIntestazioni(lfWb.Sheets[n]) !== -1);
        const scelto = conIntest.find(n => !lfFoglioNascosto(lfWb, n)) || conIntest[0] || null;
        const sel = document.getElementById('lf-foglio');
        sel.innerHTML = lfWb.SheetNames.map(n => '<option value="' + listinoEsc(n) + '">' + listinoEsc(n) +
            (lfFoglioNascosto(lfWb, n) ? ' (nascosto)' : '') + '</option>').join('');
        sel.value = scelto || lfWb.SheetNames[0];
        document.getElementById('lf-file-nome').innerHTML = '&#128196; <strong>' + listinoEsc(file.name) + '</strong> &middot; ' +
            lfWb.SheetNames.length + ' fogl' + (lfWb.SheetNames.length === 1 ? 'io' : 'i');
        document.getElementById('lf-impostazioni').classList.remove('hidden');
        lfPopolaDestinazione();
        lfFoglioCambiato(true);
    };
    reader.readAsArrayBuffer(file);
}

// Listino che fa da modello per colonne e ricarico: quello scelto, oppure l'ultimo con lo stesso foglio
function lfModello() {
    const f = lfFornitoreCorrente();
    const dest = document.getElementById('lf-destinazione').value;
    if (dest && dest !== LF_NUOVO) return lfListino(Number(dest));
    const foglio = document.getElementById('lf-foglio').value;
    return (f ? lfListiniDi(f.id) : []).slice().sort((x, y) => y.id - x.id).find(l => l.foglio === foglio && l.colonne) || null;
}

function lfFoglioCambiato(proponiNome) {
    const foglio = document.getElementById('lf-foglio').value;
    const ws = lfWb.Sheets[foglio];
    const r = lfTrovaIntestazioni(ws);
    document.getElementById('lf-riga').value = r === -1 ? '' : String(r + 1);
    // Proposta: se il nome del file/PO corrisponde a un listino che c'e' gia', lo propongo da sostituire
    if (proponiNome) {
        const nome = lfPropostaNome(ws);
        const f = lfFornitoreCorrente();
        const esiste = f ? lfListiniDi(f.id).find(l => l.nome === nome || nome.indexOf(l.nome) === 0 || l.nome.indexOf(nome) === 0) : null;
        document.getElementById('lf-destinazione').value = esiste ? String(esiste.id) : LF_NUOVO;
        document.getElementById('lf-nome').value = esiste ? esiste.nome : nome;
    }
    lfDestinazioneCambiata(false);
}

function lfDestinazioneCambiata(cambiaNome) {
    const dest = document.getElementById('lf-destinazione').value;
    const l = dest !== LF_NUOVO ? lfListino(Number(dest)) : null;
    const f = lfFornitoreCorrente();
    if (l) {
        if (cambiaNome !== false) document.getElementById('lf-nome').value = l.nome;
        document.getElementById('lf-scadenza').value = l.scadenza ? String(l.scadenza).slice(0, 10) : '';
    } else if (cambiaNome !== false) {
        document.getElementById('lf-scadenza').value = '';
    }
    const mod = lfModello();
    document.getElementById('lf-ricarico').value = String(lfNum(mod ? mod.ricarico : (f ? f.ricarico_default : LF_RICARICO_DEFAULT))).replace('.', ',');
    document.getElementById('lf-sostituisci-avviso').classList.toggle('hidden', !l);
    lfRigaCambiata();
}

function lfPropostaNome(ws) {
    const rg = lfRange(ws);
    if (rg) {
        for (let r = rg.s.r; r <= Math.min(rg.e.r, rg.s.r + 40); r++) {
            for (let c = rg.s.c; c <= Math.min(rg.e.c, 30); c++) {
                if (lfNormIntestazione(lfTestoCella(ws, r, c)).indexOf('PO NUMBER') === 0) {
                    for (let k = c + 1; k <= c + 4; k++) {
                        const v = lfTestoCella(ws, r, k);
                        if (v) return v.toUpperCase();
                    }
                }
            }
        }
    }
    return lfFileNome.replace(/\.[^.]+$/, '').toUpperCase().slice(0, 60);
}

function lfIntestazioni() {
    const ws = lfWb.Sheets[document.getElementById('lf-foglio').value];
    const riga = parseInt(document.getElementById('lf-riga').value, 10) - 1;
    const rg = lfRange(ws);
    if (!rg || isNaN(riga) || riga < 0) return [];
    const out = [];
    for (let c = rg.s.c; c <= rg.e.c; c++) {
        const t = lfTestoCella(ws, riga, c);
        if (t) out.push({ col: c, testo: t, norm: lfNormIntestazione(t) });
    }
    return out;
}

function lfRigaCambiata() {
    lfAnnullaAnteprima();
    if (!lfWb) return;
    const intest = lfIntestazioni();
    const mod = lfModello();
    const box = document.getElementById('lf-colonne');
    if (!intest.length) {
        box.innerHTML = '<p class="mac-aiuto">&#9888;&#65039; In questa riga non ci sono intestazioni: scrivi il numero della riga con i titoli delle colonne (es. 19).</p>';
        return;
    }
    box.innerHTML = LF_CAMPI.map(c => {
        let scelta = null;
        const salvato = mod && mod.colonne ? mod.colonne[c.campo] : null;
        if (salvato) scelta = intest.find(h => h.norm === lfNormIntestazione(salvato));
        if (!scelta && !(mod && mod.colonne && c.campo in mod.colonne && !salvato)) scelta = intest.find(h => c.indovina(h.norm));
        return '<div class="sti-colonna"><label>' + c.titolo + (c.obbligatorio ? ' *' : '') + '</label>' +
            '<select data-lf-campo="' + c.campo + '"><option value="">' + (c.obbligatorio ? '- scegli -' : '- nessuna -') + '</option>' +
            intest.map(h => '<option value="' + h.col + '"' + (scelta && scelta.col === h.col ? ' selected' : '') + '>' +
                XLSX.utils.encode_col(h.col) + ' &middot; ' + listinoEsc(h.testo) + '</option>').join('') +
            '</select></div>';
    }).join('');
}

function lfLeggiImpostazioni() {
    const colonne = {};
    const titoli = {};
    const intest = lfIntestazioni();
    document.querySelectorAll('#lf-colonne select[data-lf-campo]').forEach(s => {
        const c = s.value === '' ? null : parseInt(s.value, 10);
        colonne[s.dataset.lfCampo] = c;
        const h = intest.find(x => x.col === c);
        titoli[s.dataset.lfCampo] = h ? h.testo : null;
    });
    const dest = document.getElementById('lf-destinazione').value;
    return {
        destinazione: dest === LF_NUOVO ? null : Number(dest),
        foglio: document.getElementById('lf-foglio').value,
        riga: parseInt(document.getElementById('lf-riga').value, 10),
        nome: listinoPulisciTesto(document.getElementById('lf-nome').value),
        scadenza: document.getElementById('lf-scadenza').value || null,
        ricarico: listinoParseNumero(document.getElementById('lf-ricarico').value),
        colonne: colonne,
        titoli: titoli
    };
}

function lfNumeroCella(ws, r, c) {
    if (c === null || c === undefined) return null;
    const cell = ws[XLSX.utils.encode_cell({ r: r, c: c })];
    if (!cell || cell.v === null || cell.v === undefined || cell.v === '') return null;
    if (typeof cell.v === 'number') return cell.v;
    const n = listinoParseNumero(String(cell.v));
    return typeof n === 'number' ? n : NaN;
}

async function lfAnteprima() {
    if (!lfWb) return;
    const f = lfFornitoreCorrente();
    const imp = lfLeggiImpostazioni();
    const errori = [];
    if (!imp.nome) errori.push('Scrivi il nome del listino (es. OPG 2026)');
    if (imp.nome && f && lfListiniDi(f.id).some(l => l.nome === imp.nome && l.id !== imp.destinazione)) {
        errori.push('C\'&egrave; gi&agrave; un listino ' + listinoEsc(imp.nome) + ': sceglilo in &quot;Dove va&quot; per sostituirlo, oppure cambia nome');
    }
    if (!imp.riga || imp.riga < 1) errori.push('Scrivi la riga delle intestazioni');
    if (typeof imp.ricarico !== 'number' || isNaN(imp.ricarico) || imp.ricarico < 0 || imp.ricarico > 500) errori.push('Ricarico non valido');
    LF_CAMPI.forEach(c => { if (c.obbligatorio && imp.colonne[c.campo] === null) errori.push('Scegli la colonna: ' + c.titolo); });
    if (errori.length) { await showCustomAlert(errori.join('<br>'), 'Controlla i dati', '&#9888;&#65039;'); return; }

    const ws = lfWb.Sheets[imp.foglio];
    const rg = lfRange(ws);
    const perCodice = {};
    const scartate = [];
    let doppie = 0;
    for (let r = imp.riga; r <= rg.e.r; r++) {
        const descr = listinoPulisciTesto(lfTestoCella(ws, r, imp.colonne.descrizione));
        const codice = listinoPulisciTesto(lfTestoCella(ws, r, imp.colonne.codice));
        if (!codice || codice === '0' || codice === '-') {
            if (descr && descr !== '0' && descr !== '-') scartate.push({ riga: r + 1, motivo: 'codice mancante', testo: descr });
            continue;
        }
        if (!/[A-Z0-9]/.test(codice) || lfCodiceNorm(codice).length < 3) {
            scartate.push({ riga: r + 1, motivo: 'codice non valido', testo: codice + (descr ? ' - ' + descr : '') });
            continue;
        }
        const netto = lfNumeroCella(ws, r, imp.colonne.netto);
        const listino = lfNumeroCella(ws, r, imp.colonne.listino);
        if (netto === null || isNaN(netto) || netto <= 0) {
            scartate.push({ riga: r + 1, motivo: 'netto mancante o non valido', testo: codice + (descr ? ' - ' + descr : '') });
            continue;
        }
        if (perCodice[codice]) doppie++;
        perCodice[codice] = {
            codice: codice,
            descrizione: descr,
            categoria: imp.colonne.categoria !== null ? listinoPulisciTesto(lfTestoCella(ws, r, imp.colonne.categoria)) : null,
            listino_escl: (listino === null || isNaN(listino)) ? null : Math.round(listino * 10000) / 10000,
            netto_escl: Math.round(netto * 10000) / 10000
        };
    }
    const righe = Object.keys(perCodice).map(k => perCodice[k]);
    // Confronto con il listino che viene sostituito
    const vecchi = {};
    if (imp.destinazione) {
        lfPrezzi.filter(p => p.listino_id === imp.destinazione).forEach(p => {
            const a = lfArticolo(p.articolo_id);
            if (a) vecchi[a.codice] = { a: a, p: p };
        });
    }
    const nuovi = [], cambiati = [], uguali = [];
    righe.forEach(x => {
        const v = vecchi[x.codice];
        if (!v) { nuovi.push(x); return; }
        const diff = [];
        if (!listinoStessoNumero(lfNum(v.p.netto_escl), x.netto_escl)) diff.push('netto ' + listinoFormatEuro(lfIvato(v.p.netto_escl)) + ' &#8594; ' + listinoFormatEuro(lfIvato(x.netto_escl)));
        if (!listinoStessoNumero(lfNum(v.p.listino_escl), x.listino_escl)) diff.push('listino ' + listinoFormatEuro(lfIvato(v.p.listino_escl)) + ' &#8594; ' + listinoFormatEuro(lfIvato(x.listino_escl)));
        if ((v.a.descrizione || '') !== (x.descrizione || '')) diff.push('descrizione');
        if (diff.length) cambiati.push({ x: x, diff: diff }); else uguali.push(x);
    });
    const tolti = Object.keys(vecchi).filter(c => !perCodice[c]).map(c => vecchi[c].a);
    lfPiano = { imp: imp, righe: righe, nuovi: nuovi, cambiati: cambiati, uguali: uguali, tolti: tolti, scartate: scartate, doppie: doppie };
    lfRenderAnteprima();
}

function lfPrezzoClienteRic(netto, ric) {
    return netto === null ? null : Math.round(netto * (1 + ric / 100) * LF_IVA);
}

function lfRigaAnteprima(x, ric, extra) {
    return '<tr><td class="sti-col-codice">' + listinoEsc(x.codice) + '</td><td>' + listinoVal(x.descrizione) + '</td>' +
        '<td class="listino-col-prezzo">' + listinoFormatEuro(lfIvato(x.listino_escl)) + '</td>' +
        '<td class="listino-col-prezzo">' + listinoFormatEuro(lfIvato(x.netto_escl)) + '</td>' +
        '<td class="listino-col-prezzo"><strong>' + lfEuroIntero(lfPrezzoClienteRic(x.netto_escl, ric)) + '</strong></td>' +
        (extra !== undefined ? '<td>' + extra + '</td>' : '') + '</tr>';
}

function lfTabellaAnteprima(righe, conDiff) {
    return '<div class="table-container"><table class="listino-table sti-table"><thead><tr><th>Codice</th><th>Descrizione</th>' +
        '<th>Listino<br><small>IVA incl.</small></th><th>Netto<br><small>IVA incl.</small></th><th>Prezzo cliente<br><small>IVA incl.</small></th>' +
        (conDiff ? '<th>Cosa cambia</th>' : '') + '</tr></thead><tbody>' + righe + '</tbody></table></div>';
}

function lfRenderAnteprima() {
    const p = lfPiano;
    const box = document.getElementById('lf-anteprima');
    if (!p) { box.innerHTML = ''; return; }
    const max = 200;
    const ric = p.imp.ricarico;
    let html = '<div class="sti-riepilogo">' +
        '<div><strong>' + p.righe.length + '</strong> articoli nel file</div>' +
        '<div class="sti-ok"><strong>' + p.nuovi.length + '</strong> nuovi</div>' +
        (p.imp.destinazione ? '<div class="sti-mod"><strong>' + p.cambiati.length + '</strong> con prezzo cambiato</div>' +
            '<div><strong>' + p.uguali.length + '</strong> invariati</div>' +
            '<div class="sti-err"><strong>' + p.tolti.length + '</strong> tolti dal listino</div>' : '') +
        (p.scartate.length ? '<div class="sti-err"><strong>' + p.scartate.length + '</strong> righe scartate</div>' : '') +
        '</div>';
    html += '<p class="mac-aiuto">Listino <strong>' + listinoEsc(p.imp.nome) + '</strong>' +
        (p.imp.scadenza ? ', valido fino al <strong>' + lfDataIt(p.imp.scadenza) + '</strong>' : ', <strong>senza scadenza</strong>') + '. ' +
        'Prezzo cliente = netto + ' + listinoEsc(String(ric)) + '%, poi IVA 22%, arrotondato all\'euro. ' +
        (p.doppie ? p.doppie + ' codici ripetuti nel file: vale l\'ultima riga. ' : '') +
        (p.imp.destinazione ? 'Il file <strong>sostituisce per intero</strong> il listino: i prezzi vecchi spariscono. ' : '') +
        'Collegamenti con il Listino Agrimacch ed EAN restano.</p>';
    const label = p.imp.destinazione ? 'Nuovi nel listino' : 'Articoli';
    if (p.nuovi.length) {
        html += '<details' + (p.imp.destinazione ? ' open' : '') + '><summary>&#10133; ' + label + ' (' + p.nuovi.length + ')</summary>' +
            lfTabellaAnteprima(p.nuovi.slice(0, max).map(x => lfRigaAnteprima(x, ric)).join(''), false) +
            (p.nuovi.length > max ? '<p class="mac-aiuto">... e altri ' + (p.nuovi.length - max) + '</p>' : '') + '</details>';
    }
    if (p.cambiati.length) {
        html += '<details open><summary>&#9998;&#65039; Prezzo cambiato (' + p.cambiati.length + ')</summary>' +
            lfTabellaAnteprima(p.cambiati.slice(0, max).map(c => lfRigaAnteprima(c.x, ric, c.diff.join('<br>'))).join(''), true) + '</details>';
    }
    if (p.tolti.length) {
        html += '<details><summary>&#10006; Tolti da questo listino (' + p.tolti.length + ')</summary><ul class="sti-scartate">' +
            p.tolti.slice(0, 300).map(a => '<li><strong>' + listinoEsc(a.codice) + '</strong> ' + listinoEsc(a.descrizione || '') + '</li>').join('') + '</ul></details>';
    }
    if (p.scartate.length) {
        html += '<details><summary>&#9888;&#65039; Righe scartate (' + p.scartate.length + ')</summary><ul class="sti-scartate">' +
            p.scartate.slice(0, 300).map(s => '<li>Riga ' + s.riga + ': ' + listinoEsc(s.motivo) + ' &middot; ' + listinoEsc(s.testo) + '</li>').join('') +
            '</ul></details>';
    }
    html += '<div class="listino-import-pulsanti">' +
        '<button type="button" class="btn-primary" id="lf-conferma"' + (p.righe.length ? '' : ' disabled') + '>&#10004; Conferma caricamento</button>' +
        '<button type="button" class="btn-back" id="lf-annulla">Annulla</button></div>';
    box.innerHTML = html;
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function lfConferma() {
    const p = lfPiano;
    const f = lfFornitoreCorrente();
    if (!p || !p.righe.length || !f) return;
    if (!window.confirm((p.imp.destinazione ? 'Sostituire il listino ' : 'Creare il listino ') + p.imp.nome + ' di ' + f.nome + '?\n\n' +
        p.righe.length + ' articoli' + (p.imp.destinazione ? ' (' + p.tolti.length + ' tolti)' : '') + '.')) return;
    const btn = document.getElementById('lf-conferma');
    btn.disabled = true;
    btn.innerHTML = '&#8987; Caricamento...';
    const meta = {
        id: p.imp.destinazione || null, nome: p.imp.nome, scadenza: p.imp.scadenza, file_nome: lfFileNome,
        foglio: p.imp.foglio, riga: p.imp.riga, colonne: p.imp.titoli, ricarico: p.imp.ricarico
    };
    const { data: listinoId, error } = await supabaseClient.rpc('lf_carica_listino', { p_fornitore: f.id, p_listino: meta, p_righe: p.righe });
    if (error) {
        console.error('Errore caricamento listino fornitore:', error);
        btn.disabled = false;
        btn.innerHTML = '&#10004; Conferma caricamento';
        await showCustomAlert('Errore durante il caricamento:<br>' + listinoEsc(error.message), 'Errore', '&#10060;');
        return;
    }
    const riepilogo = p.righe.length + ' articoli' + (p.imp.destinazione ? ', ' + p.nuovi.length + ' nuovi, ' + p.cambiati.length + ' con prezzo cambiato, ' + p.tolti.length + ' tolti' : '') + '.';
    lfPiano = null;
    lfWb = null;
    document.getElementById('lf-anteprima').innerHTML = '';
    document.getElementById('lf-impostazioni').classList.add('hidden');
    document.getElementById('lf-file-nome').innerHTML = '';
    await lfCaricaDati();
    lfRenderTutto();
    lfSwitchTab('elenco');
    await showCustomAlert('<strong>' + listinoEsc(p.imp.nome) + '</strong> caricato (' + listinoEsc(f.nome) + ').<br>' + riepilogo, 'Listino aggiornato', '&#10004;');
    if (listinoId === null) console.warn('lf_carica_listino senza id');
}

function lfAnnullaAnteprima() {
    lfPiano = null;
    const box = document.getElementById('lf-anteprima');
    if (box) box.innerHTML = '';
}

// ========================================
// CODICI EAN DA UN CATALOGO (solo admin, per il fornitore corrente)
// ========================================
function lfTrovaIntestazioniEan(ws) {
    const rg = lfRange(ws);
    if (!rg) return -1;
    for (let r = rg.s.r; r <= Math.min(rg.e.r, rg.s.r + 40); r++) {
        let codice = false, ean = false;
        for (let c = rg.s.c; c <= Math.min(rg.e.c, 60); c++) {
            const h = lfNormIntestazione(lfTestoCella(ws, r, c));
            if (h === 'CODICE' || h === 'CODICE ARTICOLO') codice = true;
            if (h === 'EAN' || h.indexOf('EAN') === 0 || h.indexOf('BARCODE') !== -1 || h.indexOf('CODICE A BARRE') !== -1) ean = true;
        }
        if (codice && ean) return r;
    }
    return -1;
}

function lfEanFileScelto(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const box = document.getElementById('lf-ean-file-nome');
    box.innerHTML = '&#8987; Lettura del file in corso (i file grandi richiedono qualche secondo)...';
    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            lfEanWb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
        } catch (err) {
            box.innerHTML = '';
            showCustomAlert('Non riesco a leggere il file:<br>' + listinoEsc(err.message), 'Errore', '&#10060;');
            return;
        }
        lfEanPiano = null;
        document.getElementById('lf-ean-anteprima').innerHTML = '';
        const conIntest = lfEanWb.SheetNames.filter(n => lfTrovaIntestazioniEan(lfEanWb.Sheets[n]) !== -1);
        const scelto = conIntest.find(n => !lfFoglioNascosto(lfEanWb, n)) || conIntest[0] || lfEanWb.SheetNames[0];
        const sel = document.getElementById('lf-ean-foglio');
        sel.innerHTML = lfEanWb.SheetNames.map(n => '<option value="' + listinoEsc(n) + '">' + listinoEsc(n) +
            (lfFoglioNascosto(lfEanWb, n) ? ' (nascosto)' : '') + '</option>').join('');
        sel.value = scelto;
        box.innerHTML = '&#128196; <strong>' + listinoEsc(file.name) + '</strong>';
        document.getElementById('lf-ean-impostazioni').classList.remove('hidden');
        lfEanFoglioCambiato();
    };
    reader.readAsArrayBuffer(file);
}

function lfEanFoglioCambiato() {
    const ws = lfEanWb.Sheets[document.getElementById('lf-ean-foglio').value];
    const r = lfTrovaIntestazioniEan(ws);
    document.getElementById('lf-ean-riga').value = r === -1 ? '' : String(r + 1);
    lfEanRigaCambiata();
}

function lfEanRigaCambiata() {
    lfEanPiano = null;
    document.getElementById('lf-ean-anteprima').innerHTML = '';
    const ws = lfEanWb.Sheets[document.getElementById('lf-ean-foglio').value];
    const riga = parseInt(document.getElementById('lf-ean-riga').value, 10) - 1;
    const rg = lfRange(ws);
    const intest = [];
    if (rg && !isNaN(riga) && riga >= 0) {
        for (let c = rg.s.c; c <= rg.e.c; c++) {
            const t = lfTestoCella(ws, riga, c);
            if (t) intest.push({ col: c, testo: t, norm: lfNormIntestazione(t) });
        }
    }
    const box = document.getElementById('lf-ean-colonne');
    if (!intest.length) {
        box.innerHTML = '<p class="mac-aiuto">&#9888;&#65039; In questa riga non ci sono intestazioni: scrivi il numero della riga con i titoli delle colonne (es. 1).</p>';
        return;
    }
    const campi = [
        { campo: 'codice', titolo: 'Codice articolo *', indovina: h => h === 'CODICE' || h === 'CODICE ARTICOLO' },
        { campo: 'ean', titolo: 'EAN / codice a barre *', indovina: h => h === 'EAN' || h.indexOf('EAN') === 0 || h.indexOf('BARCODE') !== -1 || h.indexOf('CODICE A BARRE') !== -1 }
    ];
    box.innerHTML = campi.map(f => {
        const scelta = intest.find(h => f.indovina(h.norm));
        return '<div class="sti-colonna"><label>' + f.titolo + '</label><select data-lf-ean="' + f.campo + '"><option value="">- scegli -</option>' +
            intest.map(h => '<option value="' + h.col + '"' + (scelta && scelta.col === h.col ? ' selected' : '') + '>' +
                XLSX.utils.encode_col(h.col) + ' &middot; ' + listinoEsc(h.testo) + '</option>').join('') + '</select></div>';
    }).join('');
}

function lfEanPulisci(v) {
    const s = String(v === null || v === undefined ? '' : v).replace(/\s+/g, '').toUpperCase();
    return /^\d{8,14}$/.test(s) ? s : null;
}

async function lfEanAnteprima() {
    if (!lfEanWb) return;
    const f = lfFornitoreCorrente();
    const ws = lfEanWb.Sheets[document.getElementById('lf-ean-foglio').value];
    const riga = parseInt(document.getElementById('lf-ean-riga').value, 10);
    const colCod = document.querySelector('#lf-ean-colonne select[data-lf-ean="codice"]');
    const colEan = document.querySelector('#lf-ean-colonne select[data-lf-ean="ean"]');
    if (!riga || !colCod || !colEan || colCod.value === '' || colEan.value === '') {
        await showCustomAlert('Scegli la riga dei titoli e le due colonne (codice ed EAN).', 'Controlla i dati', '&#9888;&#65039;');
        return;
    }
    const arts = f ? lfArticoli.filter(a => a.fornitore_id === f.id) : [];
    if (!arts.length) {
        await showCustomAlert('Il fornitore non ha articoli: carica prima i suoi listini.', 'Nessun articolo', '&#9888;&#65039;');
        return;
    }
    const cC = parseInt(colCod.value, 10), cE = parseInt(colEan.value, 10);
    const rg = lfRange(ws);
    const catalogo = {};
    let righeCatalogo = 0;
    for (let r = riga; r <= rg.e.r; r++) {
        const codice = listinoPulisciTesto(lfTestoCella(ws, r, cC));
        if (!codice) continue;
        righeCatalogo++;
        const ean = lfEanPulisci(lfTestoCella(ws, r, cE));
        if (ean) catalogo[codice] = ean;
    }
    const nuovi = [], cambiati = [], uguali = [], mancanti = [];
    arts.forEach(a => {
        const ean = catalogo[a.codice];
        if (!ean) { mancanti.push(a); return; }
        if (!a.ean) nuovi.push({ a: a, ean: ean });
        else if (listinoStessoCodiceBarre(a.ean, ean)) uguali.push({ a: a, ean: ean });
        else cambiati.push({ a: a, ean: ean });
    });
    const listino = { messi: [], uguali: [], diversi: [], conflitti: [] };
    nuovi.concat(cambiati, uguali).forEach(x => {
        const art = lfArticoloListino(x.a);
        if (!art) return;
        if (art.codice_barre) {
            if (listinoStessoCodiceBarre(art.codice_barre, x.ean)) listino.uguali.push({ x: x, art: art });
            else listino.diversi.push({ x: x, art: art });
        } else if (lfProprietarioEan(x.ean, art.id)) listino.conflitti.push({ x: x, art: art });
        else listino.messi.push({ x: x, art: art });
    });
    lfEanPiano = { righeCatalogo: righeCatalogo, totale: arts.length, nuovi: nuovi, cambiati: cambiati, uguali: uguali, mancanti: mancanti, listino: listino };
    lfEanRenderAnteprima();
}

function lfEanRenderAnteprima() {
    const p = lfEanPiano;
    const box = document.getElementById('lf-ean-anteprima');
    if (!p) { box.innerHTML = ''; return; }
    const voce = x => '<li><strong>' + listinoEsc(x.a.codice) + '</strong> ' + listinoEsc(x.a.descrizione || '') + ' &#8594; ' + listinoEsc(x.ean) +
        (x.a.ean && !listinoStessoCodiceBarre(x.a.ean, x.ean) ? ' <small>(prima ' + listinoEsc(x.a.ean) + ')</small>' : '') + '</li>';
    const L = p.listino;
    let html = '<div class="sti-riepilogo">' +
        '<div><strong>' + p.righeCatalogo.toLocaleString('it-IT') + '</strong> righe nel catalogo</div>' +
        '<div class="sti-ok"><strong>' + p.nuovi.length + '</strong> EAN nuovi</div>' +
        '<div class="sti-mod"><strong>' + p.cambiati.length + '</strong> EAN cambiati</div>' +
        '<div><strong>' + p.uguali.length + '</strong> gi&agrave; giusti</div>' +
        '<div class="sti-err"><strong>' + p.mancanti.length + '</strong> articoli non nel catalogo</div>' +
        '</div>' +
        '<p class="mac-aiuto">Vengono salvati solo gli EAN dei ' + p.totale + ' articoli del fornitore: il resto del catalogo non entra nel database.</p>';
    html += '<h4 class="sti-sottotitolo">Listino Agrimacch (articoli collegati)</h4><ul class="sti-scartate">' +
        '<li>&#10004; Codice a barre da aggiungere: <strong>' + L.messi.length + '</strong></li>' +
        '<li>Gi&agrave; giusto: ' + L.uguali.length + '</li>' +
        (L.diversi.length ? '<li>&#9888;&#65039; Hanno gi&agrave; un codice a barre diverso (non lo cambio): ' + L.diversi.map(d => listinoEsc(macNome(d.art))).join(', ') + '</li>' : '') +
        (L.conflitti.length ? '<li>&#9888;&#65039; EAN gi&agrave; usato da un altro articolo (non lo metto): ' + L.conflitti.map(d => listinoEsc(macNome(d.art))).join(', ') + '</li>' : '') +
        '</ul>';
    if (p.nuovi.length) html += '<details><summary>&#10133; EAN nuovi (' + p.nuovi.length + ')</summary><ul class="sti-scartate">' + p.nuovi.map(voce).join('') + '</ul></details>';
    if (p.cambiati.length) html += '<details open><summary>&#9998;&#65039; EAN cambiati (' + p.cambiati.length + ')</summary><ul class="sti-scartate">' + p.cambiati.map(voce).join('') + '</ul></details>';
    if (p.mancanti.length) html += '<details><summary>&#10067; Articoli non trovati nel catalogo (' + p.mancanti.length + ')</summary><ul class="sti-scartate">' +
        p.mancanti.slice(0, 500).map(a => '<li><strong>' + listinoEsc(a.codice) + '</strong> ' + listinoEsc(a.descrizione || '') + '</li>').join('') +
        '</ul><p class="mac-aiuto">Per questi l\'EAN si impara dalla scatola con il lettore (Carico a raffica).</p></details>';
    const daFare = p.nuovi.length + p.cambiati.length + L.messi.length;
    html += '<div class="listino-import-pulsanti">' +
        '<button type="button" class="btn-primary" id="lf-ean-conferma"' + (daFare ? '' : ' disabled') + '>&#10004; Salva gli EAN</button>' +
        '<button type="button" class="btn-back" id="lf-ean-annulla">Annulla</button></div>';
    box.innerHTML = html;
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function lfEanConferma() {
    const p = lfEanPiano;
    const f = lfFornitoreCorrente();
    if (!p || !f) return;
    const daSalvare = p.nuovi.concat(p.cambiati);
    if (!window.confirm('Salvare ' + daSalvare.length + ' EAN di ' + f.nome + ' e ' + p.listino.messi.length +
        ' codici a barre nel Listino Agrimacch?')) return;
    const btn = document.getElementById('lf-ean-conferma');
    btn.disabled = true;
    btn.innerHTML = '&#8987; Salvataggio...';
    const adesso = new Date().toISOString();
    const utente = listinoEmailUtente();
    let listinoMessi = 0;
    try {
        for (let i = 0; i < daSalvare.length; i += 300) {
            const blocco = daSalvare.slice(i, i + 300).map(x => ({ fornitore_id: f.id, codice: x.a.codice, ean: x.ean, updated_at: adesso, updated_by: utente }));
            const { error } = await supabaseClient.from('lf_articoli').upsert(blocco, { onConflict: 'fornitore_id,codice' });
            if (error) throw error;
        }
        daSalvare.forEach(x => { x.a.ean = x.ean; });
        for (const m of p.listino.messi) {
            if (lfProprietarioEan(m.x.ean, m.art.id) || m.art.codice_barre) continue;
            const { error } = await supabaseClient.from('listino_articoli').update({ codice_barre: m.x.ean }).eq('id', m.art.id);
            if (error) throw error;
            m.art.codice_barre = m.x.ean;
            listinoMessi++;
        }
    } catch (error) {
        console.error('Errore salvataggio EAN:', error);
        btn.disabled = false;
        btn.innerHTML = '&#10004; Salva gli EAN';
        await showCustomAlert('Errore durante il salvataggio:<br>' + listinoEsc(error.message), 'Errore', '&#10060;');
        return;
    }
    lfEanPiano = null;
    lfEanWb = null;
    document.getElementById('lf-ean-anteprima').innerHTML = '';
    document.getElementById('lf-ean-impostazioni').classList.add('hidden');
    document.getElementById('lf-ean-file-nome').innerHTML = '';
    await lfCaricaDati();
    lfRenderTutto();
    await showCustomAlert(daSalvare.length + ' EAN salvati.<br>' + listinoMessi + ' codici a barre aggiunti nel Listino Agrimacch.' +
        (p.mancanti.length ? '<br><br>' + p.mancanti.length + ' articoli non erano nel catalogo: il loro EAN si impara dalla scatola con il lettore.' : ''),
        'EAN aggiornati', '&#10004;');
}

// ========================================
// AVVIO
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    // Avvisi delle scadenze: clic = apre Listini Fornitori, X = nasconde fino al prossimo accesso (o a una scadenza nuova)
    document.querySelectorAll('.lf-avviso-box').forEach(box => box.addEventListener('click', (e) => {
        if (e.target.closest('[data-lf-avviso-chiudi]')) {
            e.stopPropagation();
            sessionStorage.setItem('lfAvvisoChiuso', box.dataset.firma || '');
            document.querySelectorAll('.lf-avviso-box').forEach(b => b.classList.add('hidden'));
            return;
        }
        if (typeof openSection === 'function') openSection('listini-prezzi');
    }));

    const section = document.getElementById('section-listini-prezzi');
    if (!section) return;

    document.querySelectorAll('#tabs-lf .tab-btn').forEach(b => b.addEventListener('click', () => lfSwitchTab(b.dataset.lfTab)));
    document.getElementById('lf-toggle-netti').addEventListener('change', (e) => {
        lfNettiVisibili = e.target.checked;
        lfApplicaNetti();
        listinoSalvaPreferenza('lfNettiVisibili', lfNettiVisibili);
    });

    // Fornitori (schede in alto)
    document.getElementById('lf-fornitori').addEventListener('click', (e) => {
        const b = e.target.closest('[data-lf-fornitore]');
        if (b) {
            sessionStorage.setItem('lfFornitore', b.dataset.lfFornitore);
            lfAnnullaAnteprima();
            lfRenderTutto();
            return;
        }
        const a = e.target.closest('[data-lf-azione]');
        if (!a) return;
        if (a.dataset.lfAzione === 'nuovo-fornitore') lfApriFornitore(null);
        else if (a.dataset.lfAzione === 'modifica-fornitore') lfApriFornitore(lfFornitoreCorrente());
    });
    document.getElementById('lf-forn-close').addEventListener('click', lfChiudiFornitore);
    document.getElementById('lf-forn-annulla').addEventListener('click', lfChiudiFornitore);
    document.getElementById('lf-forn-salva').addEventListener('click', lfSalvaFornitore);
    document.getElementById('lf-forn-elimina').addEventListener('click', lfEliminaFornitore);

    // Filtri
    document.getElementById('lf-search').addEventListener('input', () => {
        clearTimeout(lfSearchTimeout);
        lfSearchTimeout = setTimeout(lfRenderElenco, 200);
    });
    ['lf-filtro-categoria', 'lf-filtro-listino', 'lf-filtro-collegati'].forEach(id => document.getElementById(id).addEventListener('change', lfRenderElenco));
    document.getElementById('lf-reset').addEventListener('click', () => {
        document.getElementById('lf-search').value = '';
        ['lf-filtro-categoria', 'lf-filtro-listino', 'lf-filtro-collegati'].forEach(id => { document.getElementById(id).value = ''; });
        lfRenderElenco();
    });

    // Azioni sulle righe
    document.getElementById('lf-container').addEventListener('click', (e) => {
        let el;
        if ((el = e.target.closest('[data-lf-collega]'))) { lfApriCollega(parseInt(el.dataset.lfCollega, 10)); return; }
        if ((el = e.target.closest('[data-lf-crea]'))) { lfCreaInListino(parseInt(el.dataset.lfCrea, 10)); return; }
        if ((el = e.target.closest('[data-lf-scollega]'))) { lfScollega(parseInt(el.dataset.lfScollega, 10)); return; }
        if ((el = e.target.closest('[data-lf-apri]'))) { if (typeof openListinoEdit === 'function') openListinoEdit(parseInt(el.dataset.lfApri, 10)); }
    });

    // Listini e scadenze
    document.getElementById('lf-listini').addEventListener('click', (e) => {
        let el;
        if ((el = e.target.closest('[data-lf-scad]'))) { lfSalvaScadenza(parseInt(el.dataset.lfScad, 10)); return; }
        if ((el = e.target.closest('[data-lf-ric]'))) { lfCambiaRicarico(parseInt(el.dataset.lfRic, 10)); return; }
        if ((el = e.target.closest('[data-lf-elimina-listino]'))) lfEliminaListino(parseInt(el.dataset.lfEliminaListino, 10));
    });

    // Carica file
    document.getElementById('lf-btn-file').addEventListener('click', () => document.getElementById('lf-file').click());
    document.getElementById('lf-file').addEventListener('change', lfFileScelto);
    document.getElementById('lf-foglio').addEventListener('change', () => lfFoglioCambiato(false));
    document.getElementById('lf-riga').addEventListener('change', lfRigaCambiata);
    document.getElementById('lf-destinazione').addEventListener('change', () => lfDestinazioneCambiata(true));
    ['lf-nome', 'lf-scadenza', 'lf-ricarico'].forEach(id => document.getElementById(id).addEventListener('change', lfAnnullaAnteprima));
    document.getElementById('lf-colonne').addEventListener('change', lfAnnullaAnteprima);
    document.getElementById('lf-btn-anteprima').addEventListener('click', lfAnteprima);
    document.getElementById('lf-anteprima').addEventListener('click', (e) => {
        if (e.target.closest('#lf-conferma')) lfConferma();
        else if (e.target.closest('#lf-annulla')) lfAnnullaAnteprima();
    });

    // Catalogo EAN
    document.getElementById('lf-ean-btn-file').addEventListener('click', () => document.getElementById('lf-ean-file').click());
    document.getElementById('lf-ean-file').addEventListener('change', lfEanFileScelto);
    document.getElementById('lf-ean-foglio').addEventListener('change', lfEanFoglioCambiato);
    document.getElementById('lf-ean-riga').addEventListener('change', lfEanRigaCambiata);
    document.getElementById('lf-ean-colonne').addEventListener('change', () => { lfEanPiano = null; document.getElementById('lf-ean-anteprima').innerHTML = ''; });
    document.getElementById('lf-ean-btn-anteprima').addEventListener('click', lfEanAnteprima);
    document.getElementById('lf-ean-anteprima').addEventListener('click', (e) => {
        if (e.target.closest('#lf-ean-conferma')) lfEanConferma();
        else if (e.target.closest('#lf-ean-annulla')) { lfEanPiano = null; document.getElementById('lf-ean-anteprima').innerHTML = ''; }
    });

    // Guida
    const chiudiGuida = () => document.getElementById('lf-guida-modal').classList.add('hidden');
    document.getElementById('lf-guida-btn').addEventListener('click', () => document.getElementById('lf-guida-modal').classList.remove('hidden'));
    document.getElementById('lf-guida-close').addEventListener('click', chiudiGuida);
    document.getElementById('lf-guida-chiudi').addEventListener('click', chiudiGuida);

    // Finestra "Collega"
    if (typeof macPickerImposta === 'function') macPickerImposta('lf-collega-search', 'lf-collega-results', null, lfCollegaScelto);
    document.getElementById('lf-collega-close').addEventListener('click', lfChiudiCollega);
    document.getElementById('lf-collega-annulla').addEventListener('click', lfChiudiCollega);

    // Finestra Nuovo articolo chiusa senza salvare: niente collegamento
    document.addEventListener('click', (e) => {
        if (lfInCreazione && e.target.closest('#listino-edit-modal .modal-close, #listino-edit-annulla')) lfInCreazione = null;
    }, true);
});

window.openListiniFornitoriPrezzi = openListiniFornitoriPrezzi;
window.lfPuoVedere = lfPuoVedere;
window.lfDopoSalvataggioListino = lfDopoSalvataggioListino;
window.lfControllaScadenze = lfControllaScadenze;
