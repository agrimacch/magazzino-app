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
// Gia' esiste? (v7.8): "Crea" controlla prima il Listino Agrimacch (lfCandidatiPerFornitore); un articolo creato a mano
// nel Listino Agrimacch propone i codici dei fornitori da collegare (lfCandidatiPerArticolo, lfDopoAvvisoSalvataggio).
// Prezzo cliente "pubblico consigliato" per listino (v7.8, colonna lf_listini.prezzo_cliente): lfUsaPubblico / lfPrezzoCliente.
// Carica file anche da PDF di testo (v7.8): pdf.js -> tabella (lfPdfTabella) -> foglio "PDF" -> solito percorso.
// Proponi collegamenti (v7.7): coppie fornitore / Listino Agrimacch per codice a barre, codice articolo o modello.
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
    const v = Number(n);
    // intero se tondo (ricarico), con i centesimi se no (prezzo al pubblico consigliato)
    return '&#8364;&nbsp;' + (Math.round(v) === v ? v.toLocaleString('it-IT', { maximumFractionDigits: 0 })
        : v.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
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

// Come si calcola il prezzo cliente di un listino (v7.8): 'RICARICO' = netto + ricarico, IVA, all'euro;
// 'PUBBLICO' = prezzo al pubblico consigliato del fornitore (colonna Listino IVA esclusa) + IVA, con i centesimi.
function lfUsaPubblico(l) {
    return !!l && l.prezzo_cliente === 'PUBBLICO';
}

function lfPrezzoClientePubblico(listinoEscl) {
    const n = lfNum(listinoEscl);
    return n === null ? null : Math.round(n * LF_IVA * 100) / 100;
}

function lfPrezzoCliente(prezzo) {
    const l = lfListino(prezzo.listino_id);
    if (lfUsaPubblico(l)) {
        const pubb = lfPrezzoClientePubblico(prezzo.listino_escl);
        if (pubb !== null) return pubb;
    }
    const netto = lfNum(prezzo.netto_escl);
    if (netto === null) return null;
    const ric = l ? lfNum(l.ricarico) : null;
    return Math.round(netto * (1 + (ric === null ? LF_RICARICO_DEFAULT : ric) / 100) * LF_IVA);
}

// Testo breve del calcolo, per le righe dei prezzi
function lfTestoCalcolo(l) {
    return lfUsaPubblico(l) ? 'pubblico consigliato' : 'ric. ' + String(lfNum(l ? l.ricarico : null));
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
    // arrivo da un import del Listino Agrimacch: apro subito le proposte di collegamento
    if (sessionStorage.getItem('lfApriProposte')) {
        sessionStorage.removeItem('lfApriProposte');
        lfSwitchTab('elenco');
        lfApriProposte();
    }
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
                ' &middot; <span class="netto-val">netto ' + listinoFormatEuro(lfIvato(p.netto_escl)) + ' &middot; ' + listinoEsc(lfTestoCalcolo(l)) + (lfUsaPubblico(l) ? '' : '%') + '</span></span>' +
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

// "Crea": prima controlla se nel Listino Agrimacch c'e' gia' (stesso EAN, codice o modello): se si' propone di collegarlo
function lfCreaInListino(id) {
    const a = lfArticolo(id);
    if (!a || typeof openListinoEdit !== 'function' || !lfPuoCollegare()) return;
    const cand = lfCandidatiPerFornitore(a).slice(0, 6);
    if (cand.length) { lfApriSimiliCrea(a, cand); return; }
    lfApriNuovoDaFornitore(id);
}

// Apre la finestra Nuovo articolo del Listino Agrimacch gia' compilata (prezzi dal listino migliore)
function lfApriNuovoDaFornitore(id) {
    const a = lfArticolo(id);
    if (!a || typeof openListinoEdit !== 'function') return;
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
        metti('vendita-no-promo', lfPrezzoCliente(p) ? listinoNumeroPerForm(lfPrezzoCliente(p)) : '');
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
let lfDaProporreDopo = null;   // articolo nuovo creato a mano nel Listino Agrimacch: si propone il collegamento dopo l'avviso "Salvato"

function lfDopoSalvataggioListino(articoloId, nuovo) {
    const id = lfInCreazione;
    lfInCreazione = null;
    if (!nuovo || !articoloId) return;
    if (id) { lfSalvaCollegamento(id, articoloId); return; }
    // creato a mano dalla sezione Listino Agrimacch (non dal carico macchine o dal carico a raffica)
    const sez = document.getElementById('section-listino-vendite');
    if (sez && !sez.classList.contains('hidden') && lfPuoCollegare()) lfDaProporreDopo = articoloId;
}

// Chiamata da saveListinoEdit() dopo l'avviso "Articolo aggiunto"
async function lfDopoAvvisoSalvataggio() {
    const id = lfDaProporreDopo;
    lfDaProporreDopo = null;
    if (!id) return;
    if (!lfArticoli.length) {
        try { await lfCaricaDati(); } catch (err) { console.warn('Listini fornitori non caricati:', err); return; }
    }
    const art = listinoArticoli.find(x => x.id === id);
    if (!art) return;
    const cand = lfCandidatiPerArticolo(art).slice(0, 8);
    if (cand.length) lfApriSimiliArticolo(art, cand);
}

// ========================================
// GIA' ESISTE? / VUOI COLLEGARLO? (v7.8)
// Stessa logica di Proponi collegamenti: stesso codice a barre o codice articolo = 200 punti;
// tutte le sigle del modello Agrimacch (MS182, 30CM...) nella descrizione del fornitore = 50 + 10 per sigla;
// SET contro singola = -30. Si mostrano i candidati da 50 punti in su (o SET contro singola, con l'avviso).
// ========================================
let lfSimili = null;   // { modo: 'crea' | 'articolo', lfId, artId, cand }

function lfPunteggio(x, a) {
    if (x.ean && a.codice_barre && listinoStessoCodiceBarre(a.codice_barre, x.ean)) return { punti: 200, motivo: 'stesso codice a barre' };
    if (a.codice_articolo && lfCodiceNorm(a.codice_articolo) === lfCodiceNorm(x.codice)) return { punti: 200, motivo: 'stesso codice articolo' };
    const f = lfFornitore(x.fornitore_id);
    if (!f || listinoPulisciTesto(a.marchio) !== listinoPulisciTesto(f.marchio || f.nome)) return null;
    const sigle = lfSigle(a.modello);
    if (!sigle.length) return null;
    const tok = lfToken(x.descrizione);
    if (!sigle.every(s => tok.has(s))) return null;
    if (lfHaSet(a.modello) !== lfHaSet(x.descrizione)) return { punti: 20 + 10 * sigle.length, motivo: 'stesso modello, ma uno dei due &egrave; un SET' };
    return { punti: 50 + 10 * sigle.length, motivo: 'stesso modello' };
}

// Articoli del Listino Agrimacch che potrebbero essere questo articolo del fornitore
function lfCandidatiPerFornitore(x) {
    const out = [];
    listinoArticoli.forEach(a => {
        if (!a.attivo) return;
        const p = lfPunteggio(x, a);
        if (p) out.push(Object.assign({ art: a }, p));
    });
    return out.sort((p, q) => q.punti - p.punti || listinoConfronta(macNome(p.art), macNome(q.art)));
}

// Articoli dei listini fornitori (non ancora collegati, con prezzi) che potrebbero essere questo articolo Agrimacch
function lfCandidatiPerArticolo(art) {
    const out = [];
    lfArticoli.forEach(x => {
        if (x.articolo_id || !(lfPrezziDi[x.id] || []).length) return;
        const p = lfPunteggio(x, art);
        if (p) out.push(Object.assign({ x: x }, p));
    });
    return out.sort((p, q) => q.punti - p.punti || listinoConfronta(p.x.descrizione, q.x.descrizione));
}

function lfSimiliPrezzoLf(x) {
    const p = lfPrezzoMigliore(x);
    return p ? '<small>listino ' + listinoFormatEuro(lfIvato(p.listino_escl)) + ' &middot; cliente ' + lfEuroIntero(lfPrezzoCliente(p)) + '</small>' : '';
}

function lfSimiliMotivo(c) {
    return '<span class="lf-simili-motivo' + (c.punti >= 200 ? ' lf-simili-sicuro' : '') + '">' + c.motivo + '</span>';
}

// Da "Crea": l'articolo del fornitore c'e' forse gia' nel Listino Agrimacch
function lfApriSimiliCrea(x, cand) {
    lfSimili = { modo: 'crea', lfId: x.id, cand: cand };
    document.getElementById('lf-simili-titolo').innerHTML = '&#128270; Esiste gi&agrave;?';
    document.getElementById('lf-simili-info').innerHTML = '<strong>' + listinoEsc(x.descrizione || '') + '</strong><br><small>' +
        listinoEsc(lfNomeFornitore(x) + ' ' + x.codice) + (x.ean ? ' &middot; EAN ' + listinoEsc(x.ean) : '') + '</small><br>' + lfSimiliPrezzoLf(x) +
        '<p class="mac-aiuto">Nel Listino Agrimacch ci sono gi&agrave; articoli che sembrano questo. Se &egrave; uno di loro <strong>collegalo</strong> invece di crearne un doppione (i prezzi del Listino Agrimacch non cambiano).</p>';
    document.getElementById('lf-simili-lista').innerHTML = cand.map((c, i) =>
        '<div class="lf-simili-riga"><div class="lf-simili-testo"><strong>' + listinoEsc(macNome(c.art)) + '</strong><br>' +
            lfPrezzoArtHtml(c.art) + (c.art.codice_articolo ? '<br><small>cod. ' + listinoEsc(c.art.codice_articolo) + '</small>' : '') + '<br>' + lfSimiliMotivo(c) + '</div>' +
        '<button type="button" class="btn-primary mac-btn-piccolo" data-lf-simili="' + i + '">&#128279; Collega a questo</button></div>').join('');
    document.getElementById('lf-simili-nuovo').classList.remove('hidden');
    document.getElementById('lf-simili-annulla').innerHTML = 'Annulla';
    document.getElementById('lf-simili-modal').classList.remove('hidden');
}

// Dopo aver creato a mano un articolo nel Listino Agrimacch: c'e' nei listini dei fornitori?
function lfApriSimiliArticolo(art, cand) {
    lfSimili = { modo: 'articolo', artId: art.id, cand: cand };
    document.getElementById('lf-simili-titolo').innerHTML = '&#128279; Vuoi collegarlo a un listino fornitore?';
    document.getElementById('lf-simili-info').innerHTML = '<strong>' + listinoEsc(macNome(art)) + '</strong><br>' + lfPrezzoArtHtml(art) +
        '<p class="mac-aiuto">Questo articolo sembra presente nei listini dei fornitori. Collegandolo vedi i loro prezzi e scadenze; ' +
        'l\'EAN va nel codice a barre e il codice del fornitore nel codice articolo, solo se sono vuoti. I prezzi del Listino Agrimacch non cambiano.</p>';
    document.getElementById('lf-simili-lista').innerHTML = cand.map((c, i) =>
        '<div class="lf-simili-riga"><div class="lf-simili-testo"><strong>' + listinoEsc(c.x.descrizione || '') + '</strong><br><small>' +
            listinoEsc(lfNomeFornitore(c.x) + ' ' + c.x.codice) + (c.x.ean ? ' &middot; EAN ' + listinoEsc(c.x.ean) : '') + '</small><br>' +
            lfSimiliPrezzoLf(c.x) + '<br>' + lfSimiliMotivo(c) + '</div>' +
        '<button type="button" class="btn-primary mac-btn-piccolo" data-lf-simili="' + i + '">&#128279; Collega</button></div>').join('');
    document.getElementById('lf-simili-nuovo').classList.add('hidden');
    document.getElementById('lf-simili-annulla').innerHTML = 'No, grazie';
    document.getElementById('lf-simili-modal').classList.remove('hidden');
}

function lfChiudiSimili() {
    document.getElementById('lf-simili-modal').classList.add('hidden');
    lfSimili = null;
}

async function lfSimiliCollega(i) {
    const s = lfSimili;
    if (!s || !s.cand[i]) return;
    const c = s.cand[i];
    if (s.modo === 'crea') {
        lfChiudiSimili();
        lfCollegaId = s.lfId;
        await lfCollegaScelto(c.art);
        return;
    }
    // modo 'articolo': collega questo codice del fornitore all'articolo appena creato (si possono collegarne piu' d'uno)
    const art = listinoArticoli.find(a => a.id === s.artId);
    if (!art) { lfChiudiSimili(); return; }
    const btn = document.querySelector('[data-lf-simili="' + i + '"]');
    if (btn) btn.disabled = true;
    if (!(await lfSalvaCollegamento(c.x.id, art.id))) { if (btn) btn.disabled = false; return; }
    const esito = await lfPassaEan(c.x, art);
    if (btn) btn.outerHTML = '<span class="lf-simili-fatto">&#10004; Collegato' + (esito === 'messo' ? ' (EAN nel codice a barre)' : '') + '</span>';
    document.getElementById('lf-simili-annulla').innerHTML = 'Chiudi';
}

function lfSimiliCreaNuovo() {
    const s = lfSimili;
    lfChiudiSimili();
    if (s && s.lfId) lfApriNuovoDaFornitore(s.lfId);
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
        '<th>Listino</th><th>Scadenza</th><th>Articoli</th><th>Prezzo cliente</th><th>File caricato</th>' + (admin ? '<th></th>' : '') + '</tr></thead><tbody>' +
        listini.map(l => {
            const st = lfStatoScadenza(l);
            return '<tr class="lf-riga-' + st + '">' +
                '<td><strong>' + listinoEsc(l.nome) + '</strong></td>' +
                '<td class="lf-col-scad"><span class="lf-scad lf-' + st + '">' + listinoEsc(lfTestoScadenza(l)) + '</span>' +
                    (admin ? '<div class="lf-scad-riga"><input type="date" class="lf-scad-input" data-lf-scad-input="' + l.id + '" value="' + (l.scadenza ? String(l.scadenza).slice(0, 10) : '') + '">' +
                        '<button type="button" class="btn-back mac-btn-piccolo" data-lf-scad="' + l.id + '">Salva</button></div>' : '') + '</td>' +
                '<td class="mac-raf-num">' + (conta[l.id] || 0) + '</td>' +
                '<td class="sti-col-ric-mod">' + (admin
                    ? '<select class="lf-calcolo-sel" data-lf-calcolo-sel="' + l.id + '">' +
                        '<option value="RICARICO"' + (lfUsaPubblico(l) ? '' : ' selected') + '>Netto + ricarico</option>' +
                        '<option value="PUBBLICO"' + (lfUsaPubblico(l) ? ' selected' : '') + '>Pubblico consigliato</option></select>' +
                      '<div class="lf-scad-riga"><input type="text" inputmode="decimal" class="sti-ric-input" data-lf-ric-input="' + l.id + '" value="' + listinoEsc(String(lfNum(l.ricarico)).replace('.', ',')) + '"' + (lfUsaPubblico(l) ? ' disabled' : '') + '> % ' +
                      '<button type="button" class="btn-back mac-btn-piccolo" data-lf-ric="' + l.id + '">Applica</button></div>'
                    : (lfUsaPubblico(l) ? 'Pubblico consigliato' : listinoEsc(String(lfNum(l.ricarico))) + '%')) + '</td>' +
                '<td><small>' + listinoVal(l.file_nome) + '<br>' + listinoEsc(macDataOra(l.caricato_il)) + ' ' + listinoEsc(macChi(l.caricato_da)) + '</small></td>' +
                (admin ? '<td><button type="button" class="btn-danger mac-btn-piccolo" data-lf-elimina-listino="' + l.id + '">&#128465;</button></td>' : '') +
            '</tr>';
        }).join('') + '</tbody></table></div>' +
        '<p class="mac-aiuto"><span class="cw-n">Rosso</span><span class="cw-d">Arancio scuro</span> = scaduto (si consulta lo stesso), <span class="cw-n">arancione</span><span class="cw-d">giallo</span> = scade entro ' + LF_GIORNI_AVVISO + ' giorni. ' +
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
    const sel = document.querySelector('[data-lf-calcolo-sel="' + id + '"]');
    const calcolo = sel && sel.value === 'PUBBLICO' ? 'PUBBLICO' : 'RICARICO';
    const l = lfListino(id);
    const aggiorna = { prezzo_cliente: calcolo };
    if (calcolo === 'RICARICO') {
        const ric = listinoParseNumero(input ? input.value : '');
        if (typeof ric !== 'number' || isNaN(ric) || ric < 0 || ric > 500) { await showCustomAlert('Ricarico non valido', 'Controlla i dati', '&#9888;&#65039;'); return; }
        aggiorna.ricarico = ric;
        if (!window.confirm('Applicare il ricarico ' + ric + '% a tutto il listino ' + (l ? l.nome : '') + '?')) return;
    } else {
        const senza = lfPrezzi.filter(p => p.listino_id === id && lfNum(p.listino_escl) === null).length;
        if (!window.confirm('Usare il prezzo al pubblico consigliato del fornitore (colonna Listino + IVA) come prezzo cliente per tutto il listino ' + (l ? l.nome : '') + '?' +
            (senza ? '\n\n' + senza + ' articoli non hanno il prezzo al pubblico: per loro resta netto + ricarico.' : ''))) return;
    }
    const { error } = await supabaseClient.from('lf_listini').update(aggiorna).eq('id', id);
    if (error) {
        await showCustomAlert('Non salvato:<br>' + listinoEsc(error.message) + (/prezzo_cliente/.test(error.message) ? '<br><br>Esegui prima su Supabase lo script <strong>supabase/lf-prezzo-pubblico.sql</strong>.' : ''), 'Errore', '&#10060;');
        return;
    }
    if (l) Object.assign(l, aggiorna);
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
// ========================================
// LISTINO IN PDF -> TABELLA (v7.8)
// ----------------------------------------
// Solo PDF "di testo" (generati da un programma), non scansionati.
// pdf.js da' i pezzi di testo con la posizione. Per ogni pagina:
//   1. i pezzi si uniscono in righe (stessa altezza) e, nella riga, in celle (pezzi vicini);
//   2. righe "articolo" = quelle con almeno un prezzo in euro (1.299,99 EUR);
//   3. colonne = zone orizzontali occupate dalle celle delle righe articolo (le celle della stessa colonna
//      si sovrappongono, anche se il testo e' centrato o allineato a destra);
//   4. nome delle colonne = le righe di intestazione della pagina (CODICE, EAN, MODELLO, PREZZO...);
//   5. descrizione andata a capo: testo delle righe subito sopra/sotto che cade nelle colonne vuote.
// Le colonne delle varie pagine si uniscono per nome. Il risultato (titoli + righe) diventa un foglio
// Excel "virtuale" e passa nel solito Carica file (scelta colonne, ricarico, scadenza, anteprima).
// ========================================
const LF_PDF_EURO = /^-?\d{1,3}(?:\.\d{3})*,\d{2}\s*(?:€|EUR)?$|^(?:€|EUR)\s*-?\d{1,3}(?:\.\d{3})*,\d{2}$/;
const LF_PDF_TITOLO = /(CODICE|COD\.|SAP|ERP|EAN|MODELLO|DESCRIZ|ARTICOLO|PREZZO|PUBBL|LISTINO|NETTO|STATUS|NOTE|VOLTAGGIO|ADATTO|CATEG|IVA|RIVENDITORE|CONSIGLIATO|MATERIAL|INCLUSA|ESCLUSA)/i;

function lfPdfEuro(t) {
    return LF_PDF_EURO.test(String(t || '').trim());
}

function lfPdfLinee(items, np) {
    const pezzi = items.filter(it => it.str && it.str.trim()).map(it => ({ s: it.str, x: it.x, x2: it.x + it.w, y: it.y, h: it.h || 8 }));
    pezzi.sort((a, b) => b.y - a.y || a.x - b.x);
    const linee = [];
    pezzi.forEach(p => {
        const l = linee.find(l => Math.abs(l.y - p.y) <= Math.max(2, p.h * 0.4));
        if (l) l.pezzi.push(p); else linee.push({ y: p.y, h: p.h, pezzi: [p], pagina: np });
    });
    linee.forEach(l => {
        l.pezzi.sort((a, b) => a.x - b.x);
        const celle = [];
        l.pezzi.forEach(p => {
            const c = celle[celle.length - 1];
            const spazio = c ? p.x - c.x2 : 999;
            const sep = Math.max(2.5, p.h * 0.6);
            if (c && spazio < sep && /^\s*(€|EUR)\s*$/.test(p.s) && /\d,\d{2}\s*$/.test(c.s)) {
                c.s += ' €'; c.x2 = p.x2;
            } else if (c && spazio < sep && !lfPdfEuro(p.s) && !lfPdfEuro(c.s)) {
                c.s += (spazio > p.h * 0.15 ? ' ' : '') + p.s;
                c.x2 = Math.max(c.x2, p.x2);
            } else {
                celle.push({ s: p.s, x: p.x, x2: p.x2 });
            }
        });
        celle.forEach(c => { c.s = c.s.replace(/\s+/g, ' ').trim(); });
        l.celle = celle.filter(c => c.s && !/^(\u20ac|EUR)$/.test(c.s));
        l.prezzo = l.celle.some(c => lfPdfEuro(c.s));
        // nella stessa riga, "169,99" senza simbolo e' un prezzo anche lui
        if (l.prezzo) l.celle.forEach(c => { if (/^\d{1,3}(?:\.\d{3})*,\d{2}$/.test(c.s)) c.s += ' \u20ac'; });
    });
    linee.sort((a, b) => b.y - a.y);
    return linee;
}

// Zone delle colonne: unione degli intervalli [x, x2] delle celle che si sovrappongono
function lfPdfZone(celle) {
    const iv = celle.map(c => ({ a: c.x, b: c.x2, euro: lfPdfEuro(c.s) ? 1 : 0, n: 1 })).sort((p, q) => p.a - q.a);
    const zone = [];
    iv.forEach(i => {
        const z = zone[zone.length - 1];
        if (z && i.a <= z.b - 1) { z.b = Math.max(z.b, i.b); z.euro += i.euro; z.n++; }
        else zone.push({ a: i.a, b: i.b, euro: i.euro, n: 1 });
    });
    zone.forEach(z => { z.prezzo = z.euro > z.n / 2; });
    return zone;
}

function lfPdfZonaDi(zone, c) {
    let best = -1, ov = -1;
    zone.forEach((z, i) => {
        const o = Math.min(z.b, c.x2) - Math.max(z.a, c.x);
        if (o > ov) { ov = o; best = i; }
    });
    if (ov <= 0) {
        let d = 1e9;
        zone.forEach((z, i) => { const dd = Math.min(Math.abs(c.x - z.b), Math.abs(c.x2 - z.a)); if (dd < d) { d = dd; best = i; } });
    }
    return best;
}

// pagine = [[{ str, x, y, w, h }]] (y dal basso, come pdf.js) -> { titoli: [...], righe: [[...]] }
function lfPdfTabella(pagine) {
    const righe = [];                 // { nome colonna: testo }
    const prezziTitoli = [];
    let zonePrec = null, nomiPrec = null;
    let incompleti = 0;               // righe con meno prezzi delle altre (da controllare)

    pagine.forEach((items, np) => {
        const linee = lfPdfLinee(items, np);
        const dati = linee.filter(l => l.prezzo);
        if (!dati.length) return;
        // zone: righe articolo di questa pagina (celle prezzo comprese)
        let zone = lfPdfZone([].concat(...dati.map(l => l.celle)));
        // intestazione: righe sopra la prima riga articolo con parole da titolo
        const iPrima = linee.indexOf(dati[0]);
        const testa = [];
        for (let i = iPrima - 1; i >= 0 && i >= iPrima - 10; i--) {
            const l = linee[i];
            if (l.prezzo) break;
            if (l.celle.some(c => LF_PDF_TITOLO.test(c.s)) && l.celle.length >= 2) testa.unshift(l);
        }
        // righe di titolo con un solo pezzo (es. "Prezzo" sopra e "Cons." sotto) dentro il blocco dei titoli
        if (testa.length) {
            const alto = Math.max(...testa.map(l => l.y)) + testa[0].h * 1.6;
            const basso = Math.min(...testa.map(l => l.y)) - testa[0].h * 1.6;
            for (let i = iPrima - 1; i >= 0 && i >= iPrima - 12; i--) {
                const l = linee[i];
                if (l.prezzo || testa.indexOf(l) !== -1 || l.celle.length !== 1) continue;
                if (l.y <= alto && l.y >= basso && l.y > dati[0].y) testa.push(l);
            }
            testa.sort((p, q) => q.y - p.y);
        }
        let nomi;
        if (testa.length) {
            const parti = zone.map(() => []);
            // pezzi singoli (non le celle unite: titoli vicini come "CONSIGLIATO IVA" + "RIVENDITORE IVA" restano separati);
            // un titolo che non sta sopra nessuna colonna di dati (es. Status vuoto) si ignora
            testa.forEach(l => l.pezzi.forEach(c => {
                const i = lfPdfZonaDi(zone, c);
                if (i !== -1 && Math.min(zone[i].b, c.x2) - Math.max(zone[i].a, c.x) > 0) parti[i].push(c.s.trim());
            }));
            nomi = parti.map(p => p.join(' ').replace(/\s+/g, ' ').trim().toUpperCase().slice(0, 60));
        } else if (zonePrec) {
            // pagina senza intestazione: stesse colonne della pagina prima
            zone = zonePrec;
            nomi = nomiPrec;
        } else {
            nomi = zone.map(() => '');
        }
        // ruolo di ogni colonna di testo (le colonne dei prezzi si numerano riga per riga)
        const ruoli = nomi.map((n, i) => zone[i].prezzo ? null : lfPdfRuolo(n, dati, zone, i));
        const contaRuolo = {};
        const nomiRuolo = ruoli.map(r => {
            if (!r) return null;
            contaRuolo[r] = (contaRuolo[r] || 0) + 1;
            return contaRuolo[r] > 1 ? r + ' ' + contaRuolo[r] : r;
        });
        // titoli dei prezzi (dalla prima pagina che li ha): servono solo come promemoria
        const titoliPrezzi = nomi.filter((n, i) => zone[i].prezzo);
        titoliPrezzi.forEach((t, k) => { if (t && !prezziTitoli[k]) prezziTitoli[k] = t; });
        zonePrec = zone;
        nomiPrec = nomi;

        const maxPrezzi = Math.max(...dati.map(l => l.celle.filter(c => lfPdfEuro(c.s)).length));
        const usate = new Set();
        dati.forEach(l => {
            const val = zone.map(() => '');
            const prezzi = [];
            l.celle.forEach(c => {
                if (lfPdfEuro(c.s)) { prezzi.push(c); return; }
                const i = lfPdfZonaDi(zone, c);
                if (i !== -1) val[i] = val[i] ? val[i] + ' ' + c.s : c.s;
            });
            // descrizione a capo: righe vicine senza prezzi, tutto nelle colonne vuote (di testo)
            const vuote = val.map((v, i) => (!v && !zone[i].prezzo) ? i : -1).filter(i => i >= 0);
            if (vuote.length) {
                const k = linee.indexOf(l);
                [linee[k - 1], linee[k + 1]].forEach((v, sopra) => {
                    if (!v || v.prezzo || usate.has(v) || testa.indexOf(v) !== -1) return;
                    if (Math.abs(v.y - l.y) > l.h * 1.9) return;
                    const cols = v.celle.map(c => lfPdfZonaDi(zone, c));
                    if (!cols.every(ci => vuote.indexOf(ci) !== -1)) return;
                    usate.add(v);
                    v.celle.forEach((c, j) => {
                        const ci = cols[j];
                        val[ci] = sopra === 0 ? (c.s + (val[ci] ? ' ' + val[ci] : '')) : ((val[ci] ? val[ci] + ' ' : '') + c.s);
                    });
                });
            }
            const r = {};
            nomiRuolo.forEach((n, i) => {
                if (!n || !val[i]) return;
                if (n.indexOf('CODICE+MODELLO') === 0) {
                    // "2950107 ALM-KEY60V-GW" -> codice + modello
                    const parti = val[i].split(' ');
                    if (!r.CODICE) r.CODICE = parti.shift();
                    if (parti.length && !r.MODELLO) r.MODELLO = parti.join(' ');
                    return;
                }
                r[n] = r[n] ? r[n] + ' ' + val[i] : val[i];
            });
            // ogni prezzo nella sua colonna, per posizione (se una riga non ha il primo o l'ultimo prezzo gli altri non scivolano)
            const zonePrezzo = zone.map((z, i) => z.prezzo ? i : -1).filter(i => i >= 0);
            const usateZ = new Set();
            prezzi.sort((p, q) => p.x - q.x).forEach((c, k) => {
                let n = -1;
                if (zonePrezzo.length >= maxPrezzi) {
                    const zi = lfPdfZonaDi(zonePrezzo.map(i => zone[i]), c);
                    if (zi !== -1 && !usateZ.has(zi)) n = zi;
                }
                if (n === -1) n = k + Math.max(0, maxPrezzi - prezzi.length);   // ripiego: allineati a destra
                usateZ.add(n);
                r['PREZZO ' + (n + 1)] = c.s;
            });
            if (prezzi.length < maxPrezzi) incompleti++;
            // senza colonna descrizione (alcune pagine): le altre colonne di testo, o il modello
            if (!r.DESCRIZIONE) {
                const altre = Object.keys(r).filter(k => k.indexOf('ALTRO') === 0).map(k => r[k]).filter(v => !/^\d+\s*(pc|pcs|pz)$/i.test(v));
                r.DESCRIZIONE = altre.join(' ') || r.MODELLO || '';
            }
            righe.push(r);
        });
    });
    // colonne: prima i ruoli noti, poi le altre, poi i prezzi
    const ordine = ['CODICE', 'MODELLO', 'EAN', 'DESCRIZIONE', 'CATEGORIA', 'NOTE'];
    const tutte = [];
    righe.forEach(r => Object.keys(r).forEach(k => { if (tutte.indexOf(k) === -1) tutte.push(k); }));
    const peso = (k) => {
        if (/^PREZZO \d+$/.test(k)) return 1000 + Number(k.slice(7));
        const base = k.replace(/ \d+$/, '');
        const i = ordine.indexOf(base);
        return (i === -1 ? 500 : i * 10) + (k === base ? 0 : Number(k.slice(base.length + 1)));
    };
    tutte.sort((p, q) => peso(p) - peso(q));
    const titoli = tutte.map(k => /^PREZZO \d+$/.test(k) && prezziTitoli[Number(k.slice(7)) - 1]
        ? k + ' - ' + prezziTitoli[Number(k.slice(7)) - 1] : k);
    const numero = (v) => {
        const t = String(v).replace(/\u20ac|EUR/g, '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
        const n = Number(t);
        return isFinite(n) ? n : v;
    };
    return { titoli: titoli, righe: righe.map(r => tutte.map(k => /^PREZZO \d+$/.test(k) && r[k] ? numero(r[k]) : (r[k] || ''))), incompleti: incompleti };
}

// Ruolo di una colonna dal suo titolo (o dal contenuto, per il codice a barre)
function lfPdfRuolo(nome, dati, zone, i) {
    const n = String(nome || '').toUpperCase();
    if (/\bEAN\b|BARCODE|CODICE A BARRE/.test(n)) return 'EAN';
    if (/DESCRIZ|DESCRIPTION/.test(n)) return 'DESCRIZIONE';
    if (/CODICE|\bSAP\b|\bERP\b/.test(n) && /MODELLO/.test(n)) return 'CODICE+MODELLO';   // due titoli finiti nella stessa colonna
    if (/MODELLO|MODEL\b/.test(n)) return 'MODELLO';
    if (/CODICE|COD\.|\bSAP\b|\bERP\b|MATERIAL|ARTICOLO/.test(n)) return 'CODICE';
    if (/CATEG/.test(n)) return 'CATEGORIA';
    if (/STATUS|NOTE/.test(n)) return 'NOTE';
    // dal contenuto: numeri di 12-14 cifre = EAN
    const vals = dati.map(l => l.celle.filter(c => lfPdfZonaDi(zone, c) === i).map(c => c.s).join(' ')).filter(Boolean);
    if (vals.length && vals.filter(v => /^\d{12,14}$/.test(v)).length >= vals.length * 0.7) return 'EAN';
    return n ? 'ALTRO ' + n.slice(0, 30) : 'ALTRO';
}

// pdf.js (caricato solo quando serve, come Leaflet)
const LF_PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
let lfPdfJsPromessa = null;

function lfCaricaPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (lfPdfJsPromessa) return lfPdfJsPromessa;
    lfPdfJsPromessa = new Promise((ok, ko) => {
        const s = document.createElement('script');
        s.src = LF_PDFJS + 'pdf.min.js';
        s.onload = () => {
            if (!window.pdfjsLib) { ko(new Error('pdf.js non disponibile')); return; }
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = LF_PDFJS + 'pdf.worker.min.js';
            ok(window.pdfjsLib);
        };
        s.onerror = () => { lfPdfJsPromessa = null; ko(new Error('Non riesco a scaricare il lettore PDF (serve internet)')); };
        document.head.appendChild(s);
    });
    return lfPdfJsPromessa;
}

// File PDF -> cartella Excel "virtuale" con un foglio "PDF" (riga 1 = titoli)
async function lfPdfInCartella(buffer, avanzamento) {
    const pdfjs = await lfCaricaPdfJs();
    const doc = await pdfjs.getDocument({ data: buffer }).promise;
    const pagine = [];
    for (let i = 1; i <= doc.numPages; i++) {
        if (avanzamento) avanzamento(i, doc.numPages);
        const pg = await doc.getPage(i);
        const tc = await pg.getTextContent();
        pagine.push(tc.items.map(it => ({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width, h: Math.abs(it.transform[3]) || it.height })));
    }
    const t = lfPdfTabella(pagine);
    if (!t.righe.length) throw new Error('Nel PDF non trovo righe con prezzi in euro. &Egrave; un PDF scansionato (immagine)? Serve un PDF di testo o l\'Excel.');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([t.titoli].concat(t.righe)), 'PDF');
    return { wb: wb, righe: t.righe.length, pagine: doc.numPages };
}

// ========================================
// CARICA FILE: colonne
// ========================================
const LF_CAMPI = [
    { campo: 'codice', titolo: 'Codice articolo', obbligatorio: true, indovina: h => h === 'CODICE' || h === 'CODICE ARTICOLO' || h === 'COD ARTICOLO' },
    { campo: 'descrizione', titolo: 'Descrizione', obbligatorio: true, indovina: h => h.indexOf('DESCRIZIONE') === 0 },
    { campo: 'listino', titolo: 'Listino IVA esclusa', obbligatorio: false,
        indovina: h => h.indexOf('LISTINO') !== -1 || (h.indexOf('PUBBL') !== -1 && (h.indexOf('ESCLUSA') !== -1 || h.indexOf('NETTO IVA') !== -1)) },
    { campo: 'netto', titolo: 'Netto IVA esclusa (prezzo promo)', obbligatorio: true, indovina: h => h.indexOf('PROMO') !== -1 || ((h.indexOf('NETTO') !== -1 || h.indexOf('RIVENDIT') !== -1) && h.indexOf('PUBBL') === -1) },
    { campo: 'categoria', titolo: 'Categoria (facoltativa)', obbligatorio: false, indovina: h => h.indexOf('CATEG') === 0 },
    { campo: 'ean', titolo: 'EAN / codice a barre (facoltativo)', obbligatorio: false, indovina: h => h === 'EAN' || h.indexOf('EAN ') === 0 || h.indexOf('BARCODE') !== -1 }
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
    const pdf = /\.pdf$/i.test(file.name);
    const nomeBox = document.getElementById('lf-file-nome');
    const reader = new FileReader();
    reader.onload = async (ev) => {
        let infoPdf = null;
        try {
            if (pdf) {
                nomeBox.innerHTML = '&#8987; Lettura del PDF...';
                infoPdf = await lfPdfInCartella(new Uint8Array(ev.target.result), (i, n) => { nomeBox.innerHTML = '&#8987; Lettura del PDF: pagina ' + i + ' di ' + n + '...'; });
                lfWb = infoPdf.wb;
            } else {
                lfWb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
            }
        } catch (err) {
            console.error('Errore lettura file fornitore:', err);
            nomeBox.innerHTML = '';
            showCustomAlert('Non riesco a leggere il file:<br>' + (pdf ? err.message : listinoEsc(err.message)), 'Errore', '&#10060;');
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
        nomeBox.innerHTML = '&#128196; <strong>' + listinoEsc(file.name) + '</strong> &middot; ' + (infoPdf
            ? 'PDF: ' + infoPdf.pagine + ' pagine, ' + infoPdf.righe + ' righe con prezzi. <strong>Controlla bene le colonne e l\'anteprima</strong> (i PDF sono impaginati in tanti modi).'
            : lfWb.SheetNames.length + ' fogl' + (lfWb.SheetNames.length === 1 ? 'io' : 'i'));
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
    document.getElementById('lf-calcolo').value = lfUsaPubblico(mod) ? 'PUBBLICO' : 'RICARICO';
    lfCalcoloCambiato();
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
        calcolo: document.getElementById('lf-calcolo').value === 'PUBBLICO' ? 'PUBBLICO' : 'RICARICO',
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
    if (imp.calcolo === 'PUBBLICO') {
        if (imp.colonne.listino === null || imp.colonne.listino === undefined) errori.push('Con &quot;prezzo al pubblico consigliato&quot; scegli la colonna: Listino IVA esclusa');
        // ricarico non obbligatorio: serve solo per gli articoli senza prezzo al pubblico
        if (typeof imp.ricarico !== 'number' || isNaN(imp.ricarico) || imp.ricarico < 0 || imp.ricarico > 500) imp.ricarico = LF_RICARICO_DEFAULT;
    } else if (typeof imp.ricarico !== 'number' || isNaN(imp.ricarico) || imp.ricarico < 0 || imp.ricarico > 500) errori.push('Ricarico non valido');
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
            ean: imp.colonne.ean !== null && imp.colonne.ean !== undefined ? lfEanPulisci(lfTestoCella(ws, r, imp.colonne.ean)) : null,
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

// Prezzo cliente in anteprima, secondo il calcolo scelto
function lfPrezzoClienteAnteprima(x, imp) {
    if (imp.calcolo === 'PUBBLICO') {
        const pubb = lfPrezzoClientePubblico(x.listino_escl);
        if (pubb !== null) return pubb;
    }
    return lfPrezzoClienteRic(x.netto_escl, imp.ricarico);
}

// Carica file: con "pubblico consigliato" il ricarico non serve
function lfCalcoloCambiato() {
    const pubb = document.getElementById('lf-calcolo').value === 'PUBBLICO';
    const ric = document.getElementById('lf-ricarico');
    ric.disabled = pubb;
    const lab = document.getElementById('lf-ricarico-label');
    if (lab) lab.innerHTML = pubb ? 'Ricarico % <small>(non serve)</small>' : 'Ricarico % *';
}

function lfRigaAnteprima(x, ric, extra) {
    return '<tr><td class="sti-col-codice">' + listinoEsc(x.codice) + '</td><td>' + listinoVal(x.descrizione) + '</td>' +
        '<td class="listino-col-prezzo">' + listinoFormatEuro(lfIvato(x.listino_escl)) + '</td>' +
        '<td class="listino-col-prezzo">' + listinoFormatEuro(lfIvato(x.netto_escl)) + '</td>' +
        '<td class="listino-col-prezzo"><strong>' + lfEuroIntero(typeof ric === 'object' ? lfPrezzoClienteAnteprima(x, ric) : lfPrezzoClienteRic(x.netto_escl, ric)) + '</strong></td>' +
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
    const ric = p.imp;     // lfRigaAnteprima calcola il prezzo cliente con il calcolo scelto
    let html = '<div class="sti-riepilogo">' +
        '<div><strong>' + p.righe.length + '</strong> articoli nel file</div>' +
        '<div class="sti-ok"><strong>' + p.nuovi.length + '</strong> nuovi</div>' +
        (p.imp.destinazione ? '<div class="sti-mod"><strong>' + p.cambiati.length + '</strong> con prezzo cambiato</div>' +
            '<div><strong>' + p.uguali.length + '</strong> invariati</div>' +
            '<div class="sti-err"><strong>' + p.tolti.length + '</strong> tolti dal listino</div>' : '') +
        (p.scartate.length ? '<div class="sti-err"><strong>' + p.scartate.length + '</strong> righe scartate</div>' : '') +
        '</div>';
    // controllo colonne (v7.8): netto uguale o piu' alto del listino, o colonne IVA inclusa = colonne scambiate
    const avvisiCol = [];
    const conEntrambi = p.righe.filter(x => x.listino_escl !== null && x.netto_escl !== null && x.listino_escl > 0);
    const nettoAlto = conEntrambi.filter(x => x.netto_escl >= x.listino_escl * 0.99).length;
    if (conEntrambi.length && nettoAlto > conEntrambi.length / 2) {
        avvisiCol.push('In ' + nettoAlto + ' articoli su ' + conEntrambi.length + ' il <strong>netto &egrave; uguale o pi&ugrave; alto del listino</strong>: forse le colonne Listino e Netto sono scambiate o sbagliate.');
    }
    const titoloCol = (campo) => lfNormIntestazione((p.imp.titoli || {})[campo] || '');
    ['listino', 'netto'].forEach(campo => {
        const t = titoloCol(campo);
        if (t.indexOf('INCLUSA') !== -1 && t.indexOf('ESCLUSA') === -1) {
            avvisiCol.push('La colonna <strong>' + (campo === 'listino' ? 'Listino' : 'Netto') + '</strong> scelta &egrave; <strong>IVA inclusa</strong> (' + listinoEsc((p.imp.titoli || {})[campo]) + '): qui serve quella IVA esclusa, l\'app aggiunge l\'IVA da sola.');
        }
    });
    if (avvisiCol.length) html += '<div class="lf-avviso-colonne">&#9888;&#65039; ' + avvisiCol.join('<br>&#9888;&#65039; ') + '<br>Controlla le colonne prima di confermare.</div>';
    html += '<p class="mac-aiuto">Listino <strong>' + listinoEsc(p.imp.nome) + '</strong>' +
        (p.imp.scadenza ? ', valido fino al <strong>' + lfDataIt(p.imp.scadenza) + '</strong>' : ', <strong>senza scadenza</strong>') + '. ' +
        (p.imp.calcolo === 'PUBBLICO'
            ? 'Prezzo cliente = <strong>prezzo al pubblico consigliato</strong> del fornitore (colonna Listino) + IVA 22%' +
              (p.righe.some(x => x.listino_escl === null) ? '; dove manca: netto + ' + listinoEsc(String(p.imp.ricarico)) + '%, IVA, all\'euro' : '') + '. '
            : 'Prezzo cliente = netto + ' + listinoEsc(String(p.imp.ricarico)) + '%, poi IVA 22%, arrotondato all\'euro. ') +
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
    let riepilogo = p.righe.length + ' articoli' + (p.imp.destinazione ? ', ' + p.nuovi.length + ' nuovi, ' + p.cambiati.length + ' con prezzo cambiato, ' + p.tolti.length + ' tolti' : '') + '.';
    lfPiano = null;
    lfWb = null;
    document.getElementById('lf-anteprima').innerHTML = '';
    document.getElementById('lf-impostazioni').classList.add('hidden');
    document.getElementById('lf-file-nome').innerHTML = '';
    // calcolo del prezzo cliente (colonna aggiunta in v7.8, fuori dalla funzione lf_carica_listino)
    const idListino = listinoId || p.imp.destinazione;
    let avvisoCalcolo = '';
    if (idListino) {
        const { error: errCalc } = await supabaseClient.from('lf_listini').update({ prezzo_cliente: p.imp.calcolo }).eq('id', idListino);
        if (errCalc) {
            console.warn('Calcolo prezzo cliente non salvato:', errCalc.message);
            if (p.imp.calcolo === 'PUBBLICO') avvisoCalcolo = '<br><br>&#9888;&#65039; Il &quot;prezzo al pubblico consigliato&quot; non &egrave; stato salvato: esegui su Supabase <strong>supabase/lf-prezzo-pubblico.sql</strong>, poi sceglilo nella scheda Listini.';
        }
    }
    await lfCaricaDati();
    // EAN dal file (colonna facoltativa): solo agli articoli che non ne hanno gia' uno
    const conEan = p.righe.filter(x => x.ean);
    let eanMessi = 0;
    if (conEan.length) {
        const daMettere = conEan.filter(x => { const a = lfArticoli.find(y => y.fornitore_id === f.id && y.codice === x.codice); return a && !a.ean; })
            .map(x => ({ fornitore_id: f.id, codice: x.codice, ean: x.ean, updated_at: new Date().toISOString(), updated_by: listinoEmailUtente() }));
        for (let i = 0; i < daMettere.length; i += 300) {
            const { error: errEan } = await supabaseClient.from('lf_articoli').upsert(daMettere.slice(i, i + 300), { onConflict: 'fornitore_id,codice' });
            if (errEan) { console.warn('EAN dal listino non salvati:', errEan.message); break; }
            eanMessi += Math.min(300, daMettere.length - i);
        }
        if (eanMessi) await lfCaricaDati();
    }
    lfRenderTutto();
    lfSwitchTab('elenco');
    if (eanMessi) riepilogo += '<br>' + eanMessi + ' codici EAN presi dal file.';
    riepilogo += avvisoCalcolo;
    await showCustomAlert('<strong>' + listinoEsc(p.imp.nome) + '</strong> caricato (' + listinoEsc(f.nome) + ').<br>' + riepilogo, 'Listino aggiornato', '&#10004;');
    // codici nuovi: proposte di collegamento con il Listino Agrimacch
    if (lfPuoCollegare()) {
        const n = lfCalcolaProposte(f).length;
        if (n && window.confirm('Ci sono ' + n + ' proposte di collegamento con il Listino Agrimacch.\n\nVuoi vederle adesso?')) lfApriProposte();
    }
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
// PROPONI COLLEGAMENTI (v7.7)
// ----------------------------------------
// Per il fornitore scelto confronta i suoi articoli NON collegati con il Listino Agrimacch dello stesso marchio:
//   - stesso codice a barre (EAN)       -> sicura
//   - stesso codice articolo            -> sicura
//   - stesso modello (es. "FSA 50", "MS 182 30CM": tutte le sigle con numeri del modello Agrimacch
//     si ritrovano nella descrizione del fornitore) -> sicura se e' l'unica coppia possibile, altrimenti da controllare
// Gli articoli gia' collegati non vengono toccati. Ogni riga mostra i prezzi dei due listini per il confronto.
// "Collega le spuntate" = lf_collega per ognuna (+ EAN nel codice a barre se vuoto, codice articolo dal trigger).
// Si apre dal pulsante in Listino, dopo un caricamento (Carica file) e dopo un import Excel del Listino Agrimacch.
// ========================================
let lfProposte = [];

function lfToken(s) {
    const base = String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
    const out = new Set(base);
    for (let i = 0; i < base.length - 1; i++) {
        const a = base[i], b = base[i + 1];
        if (/^[A-Z]+$/.test(a) && /^\d/.test(b)) out.add(a + b);          // MS 182 -> MS182
        if (/^\d+$/.test(a) && /^[A-Z]{1,3}$/.test(b) && b !== 'SET' && b !== 'KIT') out.add(a + b);    // 30 CM -> 30CM (non "50 SET")
    }
    return out;
}

// Sigle "di modello" di un testo: con almeno una cifra (MS182, FSA50, 30CM, 140)
function lfSigle(s) {
    const t = lfToken(s);
    const sigle = [...t].filter(x => /\d/.test(x));
    // se c'e' la forma unita (MS182) tolgo i pezzi separati (182) per non contarli due volte
    return sigle.filter(x => !(/^\d+$/.test(x) && sigle.some(y => y !== x && y.endsWith(x) && /^[A-Z]/.test(y))));
}

function lfHaSet(s) {
    return /\b(SET|KIT)\b/.test(String(s || '').toUpperCase());
}

function lfCalcolaProposte(fornitore) {
    const f = fornitore;
    if (!f) return [];
    const marchio = listinoPulisciTesto(f.marchio || f.nome);
    const arts = listinoArticoli.filter(a => a.attivo && listinoPulisciTesto(a.marchio) === marchio);
    const giaUsati = new Set(lfArticoli.filter(x => x.fornitore_id === f.id && x.articolo_id).map(x => x.articolo_id));
    const daFare = lfArticoli.filter(x => x.fornitore_id === f.id && !x.articolo_id && (lfPrezziDi[x.id] || []).length);
    const sigleArt = new Map(arts.map(a => [a.id, lfSigle(a.modello)]));
    const righe = [];
    daFare.forEach(x => {
        const cand = [];
        const tokLf = lfToken(x.descrizione);
        listinoArticoli.forEach(a => {
            if (!a.attivo) return;
            if (x.ean && a.codice_barre && listinoStessoCodiceBarre(a.codice_barre, x.ean)) cand.push({ art: a, punti: 200, motivo: 'stesso codice a barre' });
            else if (a.codice_articolo && lfCodiceNorm(a.codice_articolo) === lfCodiceNorm(x.codice)) cand.push({ art: a, punti: 200, motivo: 'stesso codice articolo' });
        });
        if (!cand.length) {
            arts.forEach(a => {
                if (giaUsati.has(a.id)) return;
                const sigle = sigleArt.get(a.id);
                if (!sigle || !sigle.length || !sigle.every(s => tokLf.has(s))) return;
                let punti = 50 + 10 * sigle.length;
                let motivo = 'stesso modello';
                if (lfHaSet(a.modello) !== lfHaSet(x.descrizione)) { punti -= 30; motivo = 'stesso modello, ma uno dei due &egrave; un SET'; }
                cand.push({ art: a, punti: punti, motivo: motivo });
            });
        }
        if (!cand.length) return;
        cand.sort((p, q) => q.punti - p.punti || listinoConfronta(macNome(p.art), macNome(q.art)));
        righe.push({ lf: x, cand: cand, scelto: cand[0].art.id, sicura: false, spunta: false });
    });
    // sicura: codice/EAN, oppure modello con un solo candidato migliore e che non e' il migliore anche per altri codici
    const migliorePer = {};
    righe.forEach(r => {
        if (r.cand[0].punti < 60) return;     // le coppie "SET contro singola" non tolgono la sicurezza alle altre
        const id = r.cand[0].art.id;
        migliorePer[id] = (migliorePer[id] || 0) + 1;
    });
    righe.forEach(r => {
        const top = r.cand[0];
        const pari = r.cand.filter(c => c.punti === top.punti).length;
        r.sicura = top.punti >= 200 || (pari === 1 && migliorePer[top.art.id] === 1 && top.punti >= 60 && top.motivo === 'stesso modello');
        r.spunta = r.sicura;
    });
    righe.sort((p, q) => (q.sicura ? 1 : 0) - (p.sicura ? 1 : 0) || listinoConfronta(p.lf.descrizione, q.lf.descrizione));
    return righe;
}

function lfPrezzoArtHtml(a) {
    if (!a) return '';
    const v = a.vendita_promo && !listinoPromoScaduta(a.scadenza_promo) ? a.vendita_promo : a.vendita_no_promo;
    return '<small>listino ' + (a.listino !== null && a.listino !== undefined && a.listino !== '' ? listinoFormatEuro(Number(a.listino)) : '-') +
        ' &middot; vendita ' + listinoEsc(v || '-') + '</small>';
}

function lfApriProposte() {
    const f = lfFornitoreCorrente();
    if (!f || !lfPuoCollegare()) return;
    lfProposte = lfCalcolaProposte(f);
    document.getElementById('lf-prop-titolo').innerHTML = '&#128279; Proponi collegamenti - ' + listinoEsc(f.nome);
    lfRenderProposte();
    document.getElementById('lf-prop-modal').classList.remove('hidden');
}

function lfChiudiProposte() {
    document.getElementById('lf-prop-modal').classList.add('hidden');
    lfProposte = [];
}

function lfRenderProposte() {
    const box = document.getElementById('lf-prop-lista');
    const btn = document.getElementById('lf-prop-collega');
    const sicure = lfProposte.filter(r => r.sicura).length;
    const spuntate = lfProposte.filter(r => r.spunta).length;
    document.getElementById('lf-prop-conta').innerHTML = lfProposte.length
        ? '<strong>' + lfProposte.length + '</strong> proposte: <strong>' + sicure + '</strong> sicure (gi&agrave; spuntate), <strong>' +
          (lfProposte.length - sicure) + '</strong> da controllare. Gli articoli gi&agrave; collegati non compaiono.'
        : '';
    btn.innerHTML = '&#128279; Collega le spuntate (' + spuntate + ')';
    btn.disabled = !spuntate;
    if (!lfProposte.length) {
        box.innerHTML = '<p class="mac-aiuto">Nessuna proposta: gli articoli del fornitore sono gi&agrave; collegati, oppure i modelli non si trovano nel Listino Agrimacch. ' +
            'Quelli che restano li colleghi a mano con <strong>Collega</strong>, o li crei con <strong>Crea</strong>.</p>';
        return;
    }
    const max = 600;
    box.innerHTML = '<div class="table-container"><table class="listino-table lf-prop-tab"><thead><tr>' +
        '<th></th><th>Fornitore</th><th>Prezzi fornitore <small>(IVA incl.)</small></th><th>Listino Agrimacch</th><th>Perch&eacute;</th>' +
        '</tr></thead><tbody>' + lfProposte.slice(0, max).map((r, i) => {
            const p = lfPrezzoMigliore(r.lf);
            const c = r.cand.find(x => x.art.id === r.scelto) || r.cand[0];
            const sel = r.cand.length > 1
                ? '<select data-lf-prop-scelta="' + i + '">' + r.cand.map(x => '<option value="' + x.art.id + '"' + (x.art.id === r.scelto ? ' selected' : '') + '>' +
                    listinoEsc(macNome(x.art)) + '</option>').join('') + '</select>'
                : '<strong>' + listinoEsc(macNome(c.art)) + '</strong>';
            return '<tr class="' + (r.sicura ? 'lf-prop-sicura' : 'lf-prop-dubbia') + '">' +
                '<td><input type="checkbox" data-lf-prop="' + i + '"' + (r.spunta ? ' checked' : '') + '></td>' +
                '<td><strong>' + listinoEsc(r.lf.descrizione || '') + '</strong><br><small>' + listinoEsc(r.lf.codice) + (r.lf.ean ? ' &middot; EAN ' + listinoEsc(r.lf.ean) : '') + '</small></td>' +
                '<td class="lf-prop-prezzi">' + (p ? 'listino ' + listinoFormatEuro(lfIvato(p.listino_escl)) + '<br><small>cliente ' + lfEuroIntero(lfPrezzoCliente(p)) + '</small>' : '-') + '</td>' +
                '<td>' + sel + '<br>' + lfPrezzoArtHtml(c.art) +
                    (c.art.codice_articolo ? '<br><small>cod. ' + listinoEsc(c.art.codice_articolo) + '</small>' : '') + '</td>' +
                '<td><small>' + c.motivo + (r.sicura ? '' : (r.cand.length > 1 ? '<br>' + r.cand.length + ' possibili' : '<br>da controllare')) + '</small></td>' +
            '</tr>';
        }).join('') + '</tbody></table></div>' +
        (lfProposte.length > max ? '<p class="mac-aiuto">... e altre ' + (lfProposte.length - max) + ': collega queste e riapri le proposte.</p>' : '');
}

async function lfCollegaProposte() {
    const scelte = lfProposte.filter(r => r.spunta).map(r => ({ lf: r.lf, art: listinoArticoli.find(a => a.id === r.scelto) })).filter(x => x.art);
    if (!scelte.length) return;
    const conta = {};
    scelte.forEach(x => { conta[x.art.id] = (conta[x.art.id] || 0) + 1; });
    const doppi = Object.keys(conta).filter(id => conta[id] > 1).length;
    if (!window.confirm('Collegare ' + scelte.length + ' articoli al Listino Agrimacch?' +
        (doppi ? '\n\nAttenzione: ' + doppi + ' articoli Agrimacch verrebbero collegati a pi\u00f9 codici del fornitore.' : '') +
        '\n\nCodice articolo e codice a barre passano solo dove sono vuoti.')) return;
    const btn = document.getElementById('lf-prop-collega');
    btn.disabled = true;
    let fatti = 0, eanMessi = 0;
    const errori = [];
    for (const x of scelte) {
        btn.innerHTML = '&#8987; ' + (fatti + 1) + ' di ' + scelte.length + '...';
        const { error } = await supabaseClient.rpc('lf_collega', { p_id: x.lf.id, p_articolo: x.art.id });
        if (error) { errori.push(x.lf.codice + ': ' + error.message); continue; }
        x.lf.articolo_id = x.art.id;
        if (!x.art.codice_articolo && Object.prototype.hasOwnProperty.call(x.art, 'codice_articolo')) x.art.codice_articolo = x.lf.codice;
        if ((await lfPassaEan(x.lf, x.art)) === 'messo') eanMessi++;
        fatti++;
    }
    lfChiudiProposte();
    lfRenderElenco();
    await showCustomAlert(fatti + ' articoli collegati.' + (eanMessi ? '<br>' + eanMessi + ' codici a barre aggiunti nel Listino Agrimacch.' : '') +
        (errori.length ? '<br><br>Non collegati:<br>' + errori.slice(0, 10).map(listinoEsc).join('<br>') : ''), 'Collegamenti', '&#10004;');
}

// Dopo un import Excel del Listino Agrimacch (listino-functions.js): propone di aprire le proposte
async function lfDopoImportListino() {
    if (!lfPuoCollegare()) return;
    try { if (!lfCaricato) await lfCaricaDati(); } catch (e) { return; }
    let migliore = null, quante = 0;
    lfFornitori.forEach(f => {
        const n = lfCalcolaProposte(f).length;
        if (n > quante) { quante = n; migliore = f; }
    });
    if (!migliore || !quante) return;
    if (!window.confirm('Ci sono ' + quante + ' proposte di collegamento con il listino ' + migliore.nome + '.\n\nVuoi vederle adesso?')) return;
    sessionStorage.setItem('lfFornitore', String(migliore.id));
    sessionStorage.setItem('lfApriProposte', '1');
    if (typeof openSection === 'function') openSection('listini-prezzi');
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

    // Esiste gia'? / Vuoi collegarlo?
    document.getElementById('lf-simili-lista').addEventListener('click', (e) => {
        const b = e.target.closest('[data-lf-simili]');
        if (b) lfSimiliCollega(parseInt(b.dataset.lfSimili, 10));
    });
    document.getElementById('lf-simili-nuovo').addEventListener('click', lfSimiliCreaNuovo);
    document.getElementById('lf-simili-annulla').addEventListener('click', lfChiudiSimili);
    document.getElementById('lf-simili-close').addEventListener('click', lfChiudiSimili);

    // Listini e scadenze
    document.getElementById('lf-listini').addEventListener('change', (e) => {
        const sel = e.target.closest('[data-lf-calcolo-sel]');
        if (!sel) return;
        const inp = document.querySelector('[data-lf-ric-input="' + sel.dataset.lfCalcoloSel + '"]');
        if (inp) inp.disabled = sel.value === 'PUBBLICO';
    });
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
    document.getElementById('lf-calcolo').addEventListener('change', () => { lfCalcoloCambiato(); lfAnnullaAnteprima(); });
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

    // Proponi collegamenti
    document.getElementById('lf-proponi').addEventListener('click', lfApriProposte);
    document.getElementById('lf-prop-close').addEventListener('click', lfChiudiProposte);
    document.getElementById('lf-prop-annulla').addEventListener('click', lfChiudiProposte);
    document.getElementById('lf-prop-collega').addEventListener('click', lfCollegaProposte);
    const prop = document.getElementById('lf-prop-lista');
    prop.addEventListener('change', (e) => {
        const cb = e.target.closest('[data-lf-prop]');
        if (cb) { const r = lfProposte[parseInt(cb.dataset.lfProp, 10)]; if (r) r.spunta = cb.checked; lfRenderProposte(); return; }
        const s = e.target.closest('[data-lf-prop-scelta]');
        if (s) { const r = lfProposte[parseInt(s.dataset.lfPropScelta, 10)]; if (r) { r.scelto = Number(s.value); r.spunta = true; } lfRenderProposte(); }
    });
    document.getElementById('lf-prop-tutte').addEventListener('click', () => { lfProposte.forEach(r => { r.spunta = true; }); lfRenderProposte(); });
    document.getElementById('lf-prop-nessuna').addEventListener('click', () => { lfProposte.forEach(r => { r.spunta = false; }); lfRenderProposte(); });

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
window.lfDopoAvvisoSalvataggio = lfDopoAvvisoSalvataggio;
window.lfControllaScadenze = lfControllaScadenze;
window.lfDopoImportListino = lfDopoImportListino;
