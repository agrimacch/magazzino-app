// ========================================
// LISTINO STIHL - FUNZIONI DEDICATE
// ----------------------------------------
// Sezione dentro VENDITE: admin e operatori vedono il listino e possono collegare/creare articoli;
// solo l'admin vede Carica file, Caricamenti e la guida "i" (caricamenti).
// - Listino unico degli articoli STIHL caricato dai file Excel del fornitore (OPG, OPM, ...)
//   Se lo stesso codice c'e' in piu' file vale l'ULTIMO caricato.
// - Caricamento guidato (solo admin): file -> foglio -> riga delle intestazioni -> colonne
//   (codice, descrizione, listino IVA esclusa, netto IVA esclusa = prezzo promo, categoria facoltativa)
//   -> ricarico % (di default 30) -> anteprima -> conferma.
//   Le scelte vengono ricordate per foglio (stihl_fonti) e riproposte la volta dopo.
// - Prezzi mostrati IVA INCLUSA (22%):
//     listino IVA incl.   = listino x 1,22
//     netto IVA incl.     = netto x 1,22 (oscurabile, come nel Listino Vendite)
//     prezzo al cliente   = netto x (1 + ricarico) x 1,22 arrotondato all'euro
// - Collegamento con il Listino Vendite: "Collega" (articolo che c'e' gia') o "Crea" (nuovo articolo
//   gia' compilato: STIHL, descrizione, netto, prezzo, listino; l'attrezzo si sceglie a mano).
//   Il codice a barre (EAN) NON e' nei file delle promo: si prende da un catalogo STIHL (es. Superlistino,
//   foglio "Listino GENERALE": Codice / Descrizione / EAN) con "Codici EAN da un catalogo": vengono presi SOLO
//   gli EAN degli articoli del listino STIHL; agli articoli collegati del Listino Vendite l'EAN passa nel
//   codice a barre (solo se vuoto: un codice gia' presente non viene mai sovrascritto).
// Tabelle Supabase: stihl_articoli, stihl_fonti (supabase/listino-stihl-setup.sql)
// Usa le funzioni di listino-functions.js (listinoEsc, listinoFetchAll, ...) e macPickerImposta.
// ========================================

// Chi vede la sezione e chi carica i file (devono corrispondere a stihl_puo_vedere() / stihl_puo_caricare())
const STIHL_RUOLI_VEDERE = ['admin', 'operatore'];
const STIHL_RUOLI_CARICARE = ['admin'];
const STIHL_IVA = 1.22;
const STIHL_RICARICO_DEFAULT = 30;
const STIHL_MAX_RIGHE_VISTA = 400;

let stiArticoli = [];
let stiFonti = [];
let stiCaricato = false;
let stiNettiVisibili = false;
let stiSearchTimeout = null;
let stiWb = null;            // file Excel aperto nel caricamento
let stiFileNome = '';
let stiPiano = null;         // anteprima in attesa di conferma
let stiInCreazione = null;   // articolo STIHL per cui si sta creando l'articolo nel Listino Vendite
let stiCollegaId = null;     // articolo STIHL da collegare
let stiEanWb = null;         // catalogo EAN aperto
let stiEanFileNome = '';
let stiEanPiano = null;

function stiPuoVedere() {
    return typeof currentUserRole !== 'undefined' && STIHL_RUOLI_VEDERE.indexOf(currentUserRole) !== -1;
}

function stiPuoCaricare() {
    return typeof currentUserRole !== 'undefined' && STIHL_RUOLI_CARICARE.indexOf(currentUserRole) !== -1;
}

// ========================================
// PREZZI
// ========================================
function stiNum(v) {
    return (v === null || v === undefined || v === '') ? null : Number(v);
}

function stiIvato(n) {
    n = stiNum(n);
    return n === null ? null : Math.round(n * STIHL_IVA * 100) / 100;
}

function stiPrezzoCliente(a) {
    const netto = stiNum(a.netto_escl);
    if (netto === null) return null;
    const ric = stiNum(a.ricarico);
    return Math.round(netto * (1 + (ric === null ? STIHL_RICARICO_DEFAULT : ric) / 100) * STIHL_IVA);
}

function stiEuroIntero(n) {
    if (n === null || n === undefined) return '-';
    return '&#8364;&nbsp;' + Number(n).toLocaleString('it-IT', { maximumFractionDigits: 0 });
}

function stiCodiceNorm(c) {
    return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function stiFonte(id) {
    return stiFonti.find(f => f.id === id) || null;
}

function stiArticoloListino(a) {
    if (!a || !a.articolo_id) return null;
    return listinoArticoli.find(x => x.id === a.articolo_id && x.attivo) || null;
}

// ========================================
// CARICAMENTO DATI E APERTURA
// ========================================
async function stiCaricaDati() {
    const articoli = await listinoFetchAll('stihl_articoli');
    const fonti = await listinoFetchAll('stihl_fonti');
    stiArticoli = articoli;
    stiFonti = fonti;
    stiCaricato = true;
}

async function openListinoStihl() {
    if (!stiPuoVedere()) return;
    if (!stiPuoCaricare() && ['carica', 'fonti'].indexOf(sessionStorage.getItem('stihlTab')) !== -1) sessionStorage.removeItem('stihlTab');
    stiNettiVisibili = listinoLeggiPreferenza('stihlNettiVisibili');
    stiApplicaNetti();
    document.querySelectorAll('#section-listino-stihl .sti-solo-carica').forEach(b => b.classList.toggle('hidden', !stiPuoCaricare()));
    stiSwitchTab(sessionStorage.getItem('stihlTab') || 'elenco');
    const box = document.getElementById('sti-container');
    if (box && !stiCaricato) box.innerHTML = '<div class="card"><p style="text-align:center">&#8987; Caricamento listino STIHL...</p></div>';
    try {
        if (!listinoCaricato) await loadListino();
        await stiCaricaDati();
    } catch (error) {
        console.error('Errore caricamento listino STIHL:', error);
        if (box) box.innerHTML = '<div class="card"><p style="text-align:center">&#10060; Errore caricamento listino STIHL: ' +
            listinoEsc(error.message) + '</p><p style="text-align:center">Hai eseguito lo script <strong>listino-stihl-setup.sql</strong> su Supabase?</p></div>';
        return;
    }
    stiRenderTutto();
}

function stiSwitchTab(tab) {
    if (['elenco', 'carica', 'fonti'].indexOf(tab) === -1) tab = 'elenco';
    if (tab !== 'elenco' && !stiPuoCaricare()) tab = 'elenco';
    sessionStorage.setItem('stihlTab', tab);
    document.querySelectorAll('#tabs-stihl .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.stihlTab === tab));
    document.querySelectorAll('#section-listino-stihl .tab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-stihl-' + tab));
    document.getElementById('sti-toolbar').classList.toggle('hidden', tab !== 'elenco');
    if (tab === 'fonti') stiRenderFonti();
}

function stiRenderTutto() {
    if (!stiCaricato) return;
    stiPopolaCategorie();
    stiRenderElenco();
    stiRenderFonti();
}

function stiApplicaNetti() {
    const s = document.getElementById('section-listino-stihl');
    if (s) s.classList.toggle('netti-nascosti', !stiNettiVisibili);
    const t = document.getElementById('sti-toggle-netti');
    if (t) t.checked = stiNettiVisibili;
}

// ========================================
// ELENCO (listino pulito)
// ========================================
function stiPopolaCategorie() {
    const sel = document.getElementById('sti-filtro-categoria');
    if (!sel) return;
    const corrente = sel.value;
    const cat = [...new Set(stiArticoli.map(a => a.categoria).filter(Boolean))].sort(listinoConfronta);
    sel.innerHTML = '<option value="">Tutte le categorie</option>' +
        cat.map(c => '<option value="' + listinoEsc(c) + '">' + listinoEsc(c) + '</option>').join('');
    sel.value = cat.indexOf(corrente) !== -1 ? corrente : '';
}

function stiFiltrati() {
    const ricerca = listinoPulisciTesto(document.getElementById('sti-search').value) || '';
    const categoria = document.getElementById('sti-filtro-categoria').value;
    const collegati = document.getElementById('sti-filtro-collegati').value;
    const parole = ricerca.split(' ').filter(Boolean);
    return stiArticoli.filter(a => {
        if (categoria && a.categoria !== categoria) return false;
        const coll = !!stiArticoloListino(a);
        if (collegati === 'si' && !coll) return false;
        if (collegati === 'no' && coll) return false;
        if (!parole.length) return true;
        const testo = [a.codice, stiCodiceNorm(a.codice), a.descrizione, a.categoria, a.ean].filter(Boolean).join(' ').toUpperCase();
        return parole.every(p => testo.indexOf(p) !== -1 || testo.indexOf(stiCodiceNorm(p)) !== -1 && stiCodiceNorm(p).length >= 4);
    });
}

function stiAzioniHtml(a) {
    const coll = stiArticoloListino(a);
    if (coll) {
        return '<button type="button" class="sti-btn-collegato" data-sti-apri="' + coll.id + '" title="Apri l\'articolo nel Listino Vendite">&#10004; Nel listino</button>' +
            '<button type="button" class="sti-btn-scollega" data-sti-scollega="' + a.id + '" title="Togli il collegamento">&#10006;</button>';
    }
    return '<button type="button" class="btn-back mac-btn-piccolo" data-sti-collega="' + a.id + '" title="Collega a un articolo che hai gi&agrave; nel Listino Vendite">&#128279; Collega</button>' +
        '<button type="button" class="btn-back mac-btn-piccolo" data-sti-crea="' + a.id + '" title="Crea l\'articolo nel Listino Vendite">&#10133; Crea</button>';
}

function stiRenderElenco() {
    const box = document.getElementById('sti-container');
    const conta = document.getElementById('sti-count');
    if (!box) return;
    if (stiArticoli.length === 0) {
        box.innerHTML = '<div class="card listino-vuoto"><p><strong>&#128203; Il listino STIHL &egrave; vuoto.</strong></p>' +
            (stiPuoCaricare() ? '<p>Vai nella scheda <strong>Carica file</strong> e carica il file Excel del fornitore (es. OPG).</p>' : '') + '</div>';
        if (conta) conta.textContent = '';
        return;
    }
    const filtrati = stiFiltrati().sort((x, y) =>
        listinoConfronta(x.categoria || 'ZZZ', y.categoria || 'ZZZ') || listinoConfronta(x.descrizione, y.descrizione));
    if (conta) {
        conta.textContent = filtrati.length === stiArticoli.length ? stiArticoli.length + ' articoli' :
            filtrati.length + ' di ' + stiArticoli.length + ' articoli';
    }
    if (filtrati.length === 0) {
        box.innerHTML = '<div class="card"><p style="text-align:center">Nessun articolo trovato con questi filtri</p></div>';
        return;
    }
    const mostrati = filtrati.slice(0, STIHL_MAX_RIGHE_VISTA);
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
        const righe = lista.map(a => {
            const f = stiFonte(a.fonte_id);
            return '<tr>' +
                '<td class="sti-col-codice">' + listinoVal(a.codice) + (a.ean ? '<br><small class="sti-ean" title="Codice a barre EAN">&#9646;&#9647;&#9646; ' + listinoEsc(a.ean) + '</small>' : '') + '</td>' +
                '<td><strong>' + listinoVal(a.descrizione) + '</strong></td>' +
                '<td class="listino-col-prezzo">' + listinoFormatEuro(stiIvato(a.listino_escl)) + '</td>' +
                '<td class="listino-col-prezzo sti-col-cliente"><strong>' + stiEuroIntero(stiPrezzoCliente(a)) + '</strong></td>' +
                '<td class="listino-col-netto"><span class="netto-val">' + listinoFormatEuro(stiIvato(a.netto_escl)) + '</span></td>' +
                '<td class="sti-col-ric"><span class="netto-val">' + listinoEsc(String(stiNum(a.ricarico))) + '%</span></td>' +
                '<td class="sti-col-fonte">' + (f ? listinoEsc(f.nome) : '-') + '</td>' +
                '<td class="sti-col-azioni">' + stiAzioniHtml(a) + '</td>' +
                '</tr>';
        }).join('');
        const schede = lista.map(a => '<div class="listino-card">' +
            '<div class="listino-card-top"><div class="listino-card-title"><strong>' + listinoVal(a.descrizione) + '</strong></div></div>' +
            '<div class="listino-card-sub">' + listinoVal(a.codice) + (a.ean ? ' &middot; EAN ' + listinoEsc(a.ean) : '') + '</div>' +
            '<div class="listino-card-prezzi">' +
                '<div class="listino-prezzo"><span>Cliente</span><strong>' + stiEuroIntero(stiPrezzoCliente(a)) + '</strong></div>' +
                '<div class="listino-prezzo"><span>Listino</span><strong>' + listinoFormatEuro(stiIvato(a.listino_escl)) + '</strong></div>' +
                '<div class="listino-prezzo"><span>Netto</span><strong><span class="netto-val">' + listinoFormatEuro(stiIvato(a.netto_escl)) + '</span></strong></div>' +
            '</div>' +
            '<div class="sti-card-azioni">' + stiAzioniHtml(a) + '</div>' +
            '</div>').join('');
        html += '<div class="listino-gruppo">' +
            '<div class="listino-gruppo-header"><h3>' + listinoEsc(nome) + '</h3>' +
            '<span class="listino-gruppo-count">' + lista.length + (lista.length === 1 ? ' articolo' : ' articoli') + '</span></div>' +
            '<div class="listino-desktop"><div class="table-container"><table class="listino-table sti-table"><thead><tr>' +
            '<th>Codice</th><th>Descrizione</th><th>Listino<br><small>IVA incl.</small></th><th>Prezzo cliente<br><small>IVA incl.</small></th>' +
            '<th class="listino-th-netto">Netto<br><small>IVA incl.</small></th><th>Ric.</th><th>File</th><th>Listino Vendite</th>' +
            '</tr></thead><tbody>' + righe + '</tbody></table></div></div>' +
            '<div class="listino-mobile">' + schede + '</div>' +
            '</div>';
    });
    if (filtrati.length > mostrati.length) {
        html += '<div class="card"><p style="text-align:center">... altri ' + (filtrati.length - mostrati.length) +
            ' articoli: scrivi nella ricerca o scegli una categoria per vederli.</p></div>';
    }
    box.innerHTML = html;
    stiApplicaNetti();
}

// ========================================
// COLLEGAMENTO CON IL LISTINO VENDITE
// ========================================
// Articolo del Listino Vendite (anche cancellato) che ha gia' questo codice a barre
function stiProprietarioEan(ean, tranneId) {
    if (!ean) return null;
    return listinoArticoli.find(x => x.id !== tranneId && listinoStessoCodiceBarre(x.codice_barre, ean)) || null;
}

// Mette l'EAN nel codice a barre dell'articolo del Listino Vendite, solo se e' vuoto e nessun altro lo usa.
// Ritorna 'messo' | 'uguale' | 'diverso' | 'conflitto' | 'niente'
async function stiPassaEan(stihl, art) {
    if (!stihl || !stihl.ean || !art) return 'niente';
    if (art.codice_barre) return listinoStessoCodiceBarre(art.codice_barre, stihl.ean) ? 'uguale' : 'diverso';
    if (stiProprietarioEan(stihl.ean, art.id)) return 'conflitto';
    const { error } = await supabaseClient.from('listino_articoli').update({ codice_barre: stihl.ean }).eq('id', art.id);
    if (error) {
        console.error('Errore codice a barre da STIHL:', error);
        return 'conflitto';
    }
    art.codice_barre = stihl.ean;
    return 'messo';
}
async function stiSalvaCollegamento(stihlId, articoloId) {
    // Funzione su Supabase: agli operatori permette di cambiare solo il collegamento
    const { error } = await supabaseClient.rpc('stihl_collega', { p_id: stihlId, p_articolo: articoloId });
    if (error) {
        console.error('Errore collegamento STIHL:', error);
        await showCustomAlert('Collegamento non salvato:<br>' + listinoEsc(error.message), 'Errore', '&#10060;');
        return false;
    }
    const a = stiArticoli.find(x => x.id === stihlId);
    if (a) a.articolo_id = articoloId;
    stiRenderElenco();
    return true;
}

function stiApriCollega(id) {
    const a = stiArticoli.find(x => x.id === id);
    if (!a) return;
    stiCollegaId = id;
    document.getElementById('sti-collega-articolo').innerHTML = '<strong>' + listinoEsc(a.descrizione || '') + '</strong><br><small>' +
        listinoEsc(a.codice) + ' &middot; prezzo cliente ' + stiEuroIntero(stiPrezzoCliente(a)) + '</small>';
    const cerca = document.getElementById('sti-collega-search');
    // Proposta di ricerca: la prima parola del modello (es. "MS 170" -> "MS 170")
    const m = String(a.descrizione || '').match(/^[A-Z]+\s?\d+[\.\d]*/);
    cerca.value = m ? m[0] : '';
    document.getElementById('sti-collega-modal').classList.remove('hidden');
    setTimeout(() => { cerca.focus(); if (cerca.value && typeof macPickerMostra === 'function') macPickerMostra('sti-collega-search'); }, 50);
}

function stiChiudiCollega() {
    document.getElementById('sti-collega-modal').classList.add('hidden');
    if (typeof macPickerChiudi === 'function') macPickerChiudi('sti-collega-search');
    stiCollegaId = null;
}

async function stiCollegaScelto(art) {
    const id = stiCollegaId;
    if (!id) return;
    const giaUsato = stiArticoli.find(x => x.articolo_id === art.id && x.id !== id);
    if (giaUsato && !window.confirm('"' + macNome(art) + '" \u00e8 gi\u00e0 collegato al codice STIHL ' + giaUsato.codice +
        '.\n\nCollegarlo anche a questo?')) return;
    if (!(await stiSalvaCollegamento(id, art.id))) return;
    stiChiudiCollega();
    const esito = await stiPassaEan(stiArticoli.find(x => x.id === id), art);
    if (esito === 'messo') await showCustomAlert('Collegato. L\'EAN &egrave; stato messo anche nel <strong>codice a barre</strong> di ' +
        listinoEsc(macNome(art)) + ': il lettore lo riconosce subito.', 'Fatto', '&#10004;');
    else if (esito === 'diverso') await showCustomAlert('Collegato. Attenzione: ' + listinoEsc(macNome(art)) + ' ha gi&agrave; un codice a barre diverso (' +
        listinoEsc(art.codice_barre) + '), non l\'ho cambiato.', 'Fatto', '&#9888;&#65039;');
    else if (esito === 'conflitto') await showCustomAlert('Collegato. L\'EAN &egrave; gi&agrave; usato da un altro articolo del Listino Vendite, quindi non l\'ho messo.', 'Fatto', '&#9888;&#65039;');
}

async function stiScollega(id) {
    const a = stiArticoli.find(x => x.id === id);
    if (!a) return;
    if (!window.confirm('Togliere il collegamento di ' + a.codice + ' con il Listino Vendite?\n\nL\'articolo nel Listino Vendite resta com\'\u00e8.')) return;
    await stiSalvaCollegamento(id, null);
}

// "Crea": apre la finestra Nuovo articolo del Listino Vendite gia' compilata
function stiCreaInListino(id) {
    const a = stiArticoli.find(x => x.id === id);
    if (!a || typeof openListinoEdit !== 'function') return;
    stiInCreazione = id;
    openListinoEdit(null);
    const metti = (campo, valore) => {
        const el = document.getElementById('listino-edit-' + campo);
        if (el) el.value = valore === null || valore === undefined ? '' : valore;
    };
    const f = stiFonte(a.fonte_id);
    metti('marchio', 'STIHL');
    metti('modello', a.descrizione || '');
    metti('netto-1', listinoNumeroPerForm(stiIvato(a.netto_escl)));
    metti('note-1', 'STIHL ' + a.codice + (f ? ' - ' + f.nome : ''));
    metti('vendita-no-promo', String(stiPrezzoCliente(a) || ''));
    metti('listino', listinoNumeroPerForm(stiIvato(a.listino_escl)));
    if (a.ean && !stiProprietarioEan(a.ean, null)) metti('codice-barre', a.ean);
    document.getElementById('listino-edit-titolo').innerHTML = '&#10133; Nuovo articolo da STIHL ' + listinoEsc(a.codice);
    const attrezzo = document.getElementById('listino-edit-attrezzo');
    if (attrezzo) setTimeout(() => attrezzo.focus(), 50);
}

// Chiamata da saveListinoEdit() dopo il salvataggio di un articolo del Listino Vendite
function stihlDopoSalvataggioListino(articoloId, nuovo) {
    const id = stiInCreazione;
    stiInCreazione = null;
    if (!id || !nuovo || !articoloId) return;
    stiSalvaCollegamento(id, articoloId);
}

// ========================================
// CARICAMENTO FILE EXCEL (solo admin)
// ========================================
const STI_CAMPI = [
    { campo: 'codice', titolo: 'Codice articolo', obbligatorio: true, indovina: h => h === 'CODICE' || h === 'CODICE ARTICOLO' || h === 'COD ARTICOLO' },
    { campo: 'descrizione', titolo: 'Descrizione', obbligatorio: true, indovina: h => h.indexOf('DESCRIZIONE') === 0 },
    { campo: 'listino', titolo: 'Listino IVA esclusa', obbligatorio: false, indovina: h => h.indexOf('LISTINO') !== -1 },
    { campo: 'netto', titolo: 'Netto IVA esclusa (prezzo promo)', obbligatorio: true, indovina: h => h.indexOf('PROMO') !== -1 },
    { campo: 'categoria', titolo: 'Categoria (facoltativa)', obbligatorio: false, indovina: h => h.indexOf('CATEG') === 0 }
];

function stiTestoCella(ws, r, c) {
    const cell = ws[XLSX.utils.encode_cell({ r: r, c: c })];
    if (!cell || cell.v === null || cell.v === undefined) return '';
    if (cell.v instanceof Date) return '';
    const v = typeof cell.v === 'string' ? cell.v : (cell.w !== undefined ? cell.w : String(cell.v));
    return String(v).replace(/\s+/g, ' ').trim();
}

function stiNormIntestazione(t) {
    return listinoNormalizzaIntestazione(String(t || '').replace(/[()]/g, ' '));
}

function stiRange(ws) {
    return ws && ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : null;
}

// Riga delle intestazioni: la prima che ha una cella "CODICE" e una con "LISTINO" o "PROMO" (prime 80 righe)
function stiTrovaIntestazioni(ws) {
    const rg = stiRange(ws);
    if (!rg) return -1;
    for (let r = rg.s.r; r <= Math.min(rg.e.r, rg.s.r + 80); r++) {
        let codice = false, prezzo = false;
        for (let c = rg.s.c; c <= Math.min(rg.e.c, 60); c++) {
            const h = stiNormIntestazione(stiTestoCella(ws, r, c));
            if (h === 'CODICE' || h === 'CODICE ARTICOLO') codice = true;
            if (h.indexOf('LISTINO') !== -1 || h.indexOf('PROMO') !== -1) prezzo = true;
        }
        if (codice && prezzo) return r;
    }
    return -1;
}

function stiFoglioNascosto(nome) {
    try {
        const info = (stiWb.Workbook && stiWb.Workbook.Sheets) || [];
        const s = info.find(x => x.name === nome);
        return !!(s && s.Hidden);
    } catch (e) { return false; }
}

function stiSelezionaFile() {
    document.getElementById('sti-file').click();
}

function stiFileScelto(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    stiFileNome = file.name;
    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            stiWb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
        } catch (err) {
            console.error('Errore lettura Excel STIHL:', err);
            showCustomAlert('Non riesco a leggere il file:<br>' + listinoEsc(err.message), 'Errore', '&#10060;');
            return;
        }
        stiPiano = null;
        document.getElementById('sti-anteprima').innerHTML = '';
        // Foglio proposto: il primo VISIBILE con la riga delle intestazioni; se non c'e', il primo con le intestazioni
        const conIntestazioni = stiWb.SheetNames.filter(n => stiTrovaIntestazioni(stiWb.Sheets[n]) !== -1);
        const scelto = conIntestazioni.find(n => !stiFoglioNascosto(n)) || conIntestazioni[0] || null;
        const sel = document.getElementById('sti-foglio');
        sel.innerHTML = stiWb.SheetNames.map(n => '<option value="' + listinoEsc(n) + '">' + listinoEsc(n) +
            (stiFoglioNascosto(n) ? ' (nascosto)' : '') + '</option>').join('');
        sel.value = scelto || stiWb.SheetNames[0];
        document.getElementById('sti-file-nome').innerHTML = '&#128196; <strong>' + listinoEsc(file.name) + '</strong> &middot; ' +
            stiWb.SheetNames.length + ' fogl' + (stiWb.SheetNames.length === 1 ? 'io' : 'i');
        document.getElementById('sti-impostazioni').classList.remove('hidden');
        stiFoglioCambiato(true);
    };
    reader.readAsArrayBuffer(file);
}

// Ultimo caricamento fatto con lo stesso foglio (per riproporre colonne e ricarico)
function stiModelloPrecedente(foglio) {
    return stiFonti.slice().sort((x, y) => y.id - x.id).find(f => f.foglio === foglio && f.colonne) || null;
}

function stiFoglioCambiato(proponiNome) {
    const foglio = document.getElementById('sti-foglio').value;
    const ws = stiWb.Sheets[foglio];
    const r = stiTrovaIntestazioni(ws);
    document.getElementById('sti-riga').value = r === -1 ? '' : String(r + 1);
    const prec = stiModelloPrecedente(foglio);
    document.getElementById('sti-ricarico').value = prec ? String(stiNum(prec.ricarico)).replace('.', ',') : String(STIHL_RICARICO_DEFAULT);
    if (proponiNome) document.getElementById('sti-nome').value = stiPropostaNome(ws, prec);
    stiRigaCambiata();
}

// Nome del caricamento: cella accanto a "PO Number" (es. "OPG 2026"), altrimenti il nome del file
function stiPropostaNome(ws, prec) {
    const rg = stiRange(ws);
    if (rg) {
        for (let r = rg.s.r; r <= Math.min(rg.e.r, rg.s.r + 40); r++) {
            for (let c = rg.s.c; c <= Math.min(rg.e.c, 30); c++) {
                if (stiNormIntestazione(stiTestoCella(ws, r, c)).indexOf('PO NUMBER') === 0) {
                    for (let k = c + 1; k <= c + 4; k++) {
                        const v = stiTestoCella(ws, r, k);
                        if (v) return v.toUpperCase();
                    }
                }
            }
        }
    }
    if (prec) return prec.nome;
    return stiFileNome.replace(/\.[^.]+$/, '').toUpperCase().slice(0, 60);
}

function stiIntestazioni() {
    const ws = stiWb.Sheets[document.getElementById('sti-foglio').value];
    const riga = parseInt(document.getElementById('sti-riga').value, 10) - 1;
    const rg = stiRange(ws);
    if (!rg || isNaN(riga) || riga < 0) return [];
    const out = [];
    for (let c = rg.s.c; c <= rg.e.c; c++) {
        const t = stiTestoCella(ws, riga, c);
        if (t) out.push({ col: c, testo: t, norm: stiNormIntestazione(t) });
    }
    return out;
}

function stiRigaCambiata() {
    const intest = stiIntestazioni();
    const prec = stiModelloPrecedente(document.getElementById('sti-foglio').value);
    const box = document.getElementById('sti-colonne');
    if (!intest.length) {
        box.innerHTML = '<p class="mac-aiuto">&#9888;&#65039; In questa riga non ci sono intestazioni: scrivi il numero della riga con i titoli delle colonne (es. 19).</p>';
        return;
    }
    box.innerHTML = STI_CAMPI.map(f => {
        // Proposta: colonna con lo stesso titolo dell'ultimo caricamento, altrimenti indovinata dal titolo
        let scelta = null;
        const salvato = prec && prec.colonne ? prec.colonne[f.campo] : null;
        if (salvato) scelta = intest.find(h => h.norm === stiNormIntestazione(salvato));
        if (!scelta && !(prec && prec.colonne && f.campo in prec.colonne && !salvato)) scelta = intest.find(h => f.indovina(h.norm));
        return '<div class="sti-colonna"><label>' + f.titolo + (f.obbligatorio ? ' *' : '') + '</label>' +
            '<select data-sti-campo="' + f.campo + '"><option value="">' + (f.obbligatorio ? '- scegli -' : '- nessuna -') + '</option>' +
            intest.map(h => '<option value="' + h.col + '"' + (scelta && scelta.col === h.col ? ' selected' : '') + '>' +
                XLSX.utils.encode_col(h.col) + ' &middot; ' + listinoEsc(h.testo) + '</option>').join('') +
            '</select></div>';
    }).join('');
}

function stiLeggiImpostazioni() {
    const colonne = {};
    const titoli = {};
    const intest = stiIntestazioni();
    document.querySelectorAll('#sti-colonne select[data-sti-campo]').forEach(s => {
        const c = s.value === '' ? null : parseInt(s.value, 10);
        colonne[s.dataset.stiCampo] = c;
        const h = intest.find(x => x.col === c);
        titoli[s.dataset.stiCampo] = h ? h.testo : null;
    });
    const ric = listinoParseNumero(document.getElementById('sti-ricarico').value);
    return {
        foglio: document.getElementById('sti-foglio').value,
        riga: parseInt(document.getElementById('sti-riga').value, 10),
        nome: listinoPulisciTesto(document.getElementById('sti-nome').value),
        ricarico: ric,
        colonne: colonne,
        titoli: titoli
    };
}

function stiNumeroCella(ws, r, c) {
    if (c === null || c === undefined) return null;
    const cell = ws[XLSX.utils.encode_cell({ r: r, c: c })];
    if (!cell || cell.v === null || cell.v === undefined || cell.v === '') return null;
    if (typeof cell.v === 'number') return cell.v;
    const n = listinoParseNumero(String(cell.v));
    return typeof n === 'number' ? n : NaN;
}

async function stiAnteprima() {
    if (!stiWb) return;
    const imp = stiLeggiImpostazioni();
    const errori = [];
    if (!imp.nome) errori.push('Scrivi il nome del caricamento (es. OPG 2026)');
    if (!imp.riga || imp.riga < 1) errori.push('Scrivi la riga delle intestazioni');
    if (typeof imp.ricarico !== 'number' || isNaN(imp.ricarico) || imp.ricarico < 0 || imp.ricarico > 500) errori.push('Ricarico non valido');
    STI_CAMPI.forEach(f => { if (f.obbligatorio && imp.colonne[f.campo] === null) errori.push('Scegli la colonna: ' + f.titolo); });
    if (errori.length) { await showCustomAlert(errori.join('<br>'), 'Controlla i dati', '&#9888;&#65039;'); return; }

    const ws = stiWb.Sheets[imp.foglio];
    const rg = stiRange(ws);
    const perCodice = {};
    const scartate = [];
    let doppie = 0;
    for (let r = imp.riga; r <= rg.e.r; r++) {
        const codiceGrezzo = stiTestoCella(ws, r, imp.colonne.codice);
        const descr = listinoPulisciTesto(stiTestoCella(ws, r, imp.colonne.descrizione));
        const codice = listinoPulisciTesto(codiceGrezzo);
        if (!codice || codice === '0' || codice === '-') {
            // Righe vuote in fondo al file (Excel mostra 0 come "-"): non sono errori
            if (descr && descr !== '0' && descr !== '-') scartate.push({ riga: r + 1, motivo: 'codice mancante', testo: descr });
            continue;
        }
        if (!/[A-Z0-9]/.test(codice) || stiCodiceNorm(codice).length < 4) {
            scartate.push({ riga: r + 1, motivo: 'codice non valido', testo: codice + (descr ? ' - ' + descr : '') });
            continue;
        }
        const netto = stiNumeroCella(ws, r, imp.colonne.netto);
        const listino = stiNumeroCella(ws, r, imp.colonne.listino);
        if (netto === null || isNaN(netto) || netto <= 0) {
            scartate.push({ riga: r + 1, motivo: 'netto mancante o non valido', testo: codice + (descr ? ' - ' + descr : '') });
            continue;
        }
        if (perCodice[codice]) doppie++;
        perCodice[codice] = {
            codice: codice,
            descrizione: descr,
            categoria: imp.colonne.categoria !== null ? listinoPulisciTesto(stiTestoCella(ws, r, imp.colonne.categoria)) : null,
            listino_escl: (listino === null || isNaN(listino)) ? null : Math.round(listino * 10000) / 10000,
            netto_escl: Math.round(netto * 10000) / 10000,
            ricarico: imp.ricarico,
            riga: r + 1
        };
    }
    const righe = Object.keys(perCodice).map(k => perCodice[k]);
    const esistenti = {};
    stiArticoli.forEach(a => { esistenti[a.codice] = a; });
    const nuovi = [], cambiati = [], uguali = [];
    righe.forEach(x => {
        const e = esistenti[x.codice];
        if (!e) { nuovi.push(x); return; }
        const diff = [];
        if (!listinoStessoNumero(stiNum(e.netto_escl), x.netto_escl)) diff.push('netto ' + listinoFormatEuro(stiIvato(e.netto_escl)) + ' &#8594; ' + listinoFormatEuro(stiIvato(x.netto_escl)));
        if (!listinoStessoNumero(stiNum(e.listino_escl), x.listino_escl)) diff.push('listino ' + listinoFormatEuro(stiIvato(e.listino_escl)) + ' &#8594; ' + listinoFormatEuro(stiIvato(x.listino_escl)));
        if (!listinoStessoNumero(stiNum(e.ricarico), x.ricarico)) diff.push('ricarico ' + stiNum(e.ricarico) + '% &#8594; ' + x.ricarico + '%');
        if ((e.descrizione || '') !== (x.descrizione || '')) diff.push('descrizione');
        if (x.categoria !== null && (e.categoria || '') !== (x.categoria || '')) diff.push('categoria');
        if (diff.length) cambiati.push({ x: x, e: e, diff: diff }); else uguali.push(x);
    });
    stiPiano = { imp: imp, righe: righe, nuovi: nuovi, cambiati: cambiati, uguali: uguali, scartate: scartate, doppie: doppie };
    stiRenderAnteprima();
}

function stiRigaAnteprima(x, extra) {
    return '<tr><td class="sti-col-codice">' + listinoEsc(x.codice) + '</td><td>' + listinoVal(x.descrizione) + '</td>' +
        '<td class="listino-col-prezzo">' + listinoFormatEuro(stiIvato(x.listino_escl)) + '</td>' +
        '<td class="listino-col-prezzo">' + listinoFormatEuro(stiIvato(x.netto_escl)) + '</td>' +
        '<td class="listino-col-prezzo"><strong>' + stiEuroIntero(stiPrezzoCliente(x)) + '</strong></td>' +
        (extra !== undefined ? '<td>' + extra + '</td>' : '') + '</tr>';
}

function stiTabellaAnteprima(righe, conDiff) {
    return '<div class="table-container"><table class="listino-table sti-table"><thead><tr><th>Codice</th><th>Descrizione</th>' +
        '<th>Listino<br><small>IVA incl.</small></th><th>Netto<br><small>IVA incl.</small></th><th>Prezzo cliente<br><small>IVA incl.</small></th>' +
        (conDiff ? '<th>Cosa cambia</th>' : '') + '</tr></thead><tbody>' + righe + '</tbody></table></div>';
}

function stiRenderAnteprima() {
    const p = stiPiano;
    const box = document.getElementById('sti-anteprima');
    if (!p) { box.innerHTML = ''; return; }
    const max = 200;
    let html = '<div class="sti-riepilogo">' +
        '<div><strong>' + p.righe.length + '</strong> articoli nel file</div>' +
        '<div class="sti-ok"><strong>' + p.nuovi.length + '</strong> nuovi</div>' +
        '<div class="sti-mod"><strong>' + p.cambiati.length + '</strong> aggiornati</div>' +
        '<div><strong>' + p.uguali.length + '</strong> invariati</div>' +
        (p.scartate.length ? '<div class="sti-err"><strong>' + p.scartate.length + '</strong> righe scartate</div>' : '') +
        '</div>';
    html += '<p class="mac-aiuto">Prezzo cliente = netto + ' + listinoEsc(String(p.imp.ricarico)) + '%, poi IVA 22%, arrotondato all\'euro. ' +
        (p.doppie ? p.doppie + ' codici ripetuti nel file: vale l\'ultima riga. ' : '') +
        'Gli articoli che non sono in questo file restano nel listino STIHL come sono.</p>';
    if (p.nuovi.length) {
        html += '<details open><summary>&#10133; Nuovi (' + p.nuovi.length + ')</summary>' +
            stiTabellaAnteprima(p.nuovi.slice(0, max).map(x => stiRigaAnteprima(x)).join(''), false) +
            (p.nuovi.length > max ? '<p class="mac-aiuto">... e altri ' + (p.nuovi.length - max) + '</p>' : '') + '</details>';
    }
    if (p.cambiati.length) {
        html += '<details open><summary>&#9998;&#65039; Aggiornati (' + p.cambiati.length + ')</summary>' +
            stiTabellaAnteprima(p.cambiati.slice(0, max).map(c => stiRigaAnteprima(c.x, c.diff.join('<br>'))).join(''), true) + '</details>';
    }
    if (p.scartate.length) {
        html += '<details><summary>&#9888;&#65039; Righe scartate (' + p.scartate.length + ')</summary><ul class="sti-scartate">' +
            p.scartate.slice(0, 300).map(s => '<li>Riga ' + s.riga + ': ' + listinoEsc(s.motivo) + ' &middot; ' + listinoEsc(s.testo) + '</li>').join('') +
            '</ul></details>';
    }
    html += '<div class="listino-import-pulsanti">' +
        '<button type="button" class="btn-primary" id="sti-conferma"' + (p.righe.length ? '' : ' disabled') + '>&#10004; Conferma caricamento</button>' +
        '<button type="button" class="btn-back" id="sti-annulla">Annulla</button></div>';
    box.innerHTML = html;
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function stiConferma() {
    const p = stiPiano;
    if (!p || !p.righe.length) return;
    if (!window.confirm('Caricare "' + p.imp.nome + '" nel listino STIHL?\n\n' + p.nuovi.length + ' nuovi, ' + p.cambiati.length +
        ' aggiornati, ' + p.uguali.length + ' invariati.')) return;
    const btn = document.getElementById('sti-conferma');
    btn.disabled = true;
    btn.innerHTML = '&#8987; Caricamento...';
    const utente = listinoEmailUtente();
    const adesso = new Date().toISOString();
    try {
        const { data: fonte, error: e1 } = await supabaseClient.from('stihl_fonti').insert([{
            nome: p.imp.nome, file_nome: stiFileNome, foglio: p.imp.foglio, riga_intestazioni: p.imp.riga,
            colonne: p.imp.titoli, ricarico: p.imp.ricarico, righe: p.righe.length, caricato_da: utente
        }]).select('*').single();
        if (e1) throw e1;
        const righe = p.righe.map(x => {
            const r = {
                codice: x.codice, descrizione: x.descrizione, listino_escl: x.listino_escl, netto_escl: x.netto_escl,
                ricarico: x.ricarico, fonte_id: fonte.id, updated_at: adesso, updated_by: utente
            };
            if (x.categoria !== null) r.categoria = x.categoria;
            return r;
        });
        // Senza categoria nel file: tengo quella che c'era (righe con e senza categoria in due gruppi)
        const conCat = righe.filter(r => 'categoria' in r);
        const senzaCat = righe.filter(r => !('categoria' in r));
        for (const gruppo of [conCat, senzaCat]) {
            for (let i = 0; i < gruppo.length; i += 300) {
                const { error } = await supabaseClient.from('stihl_articoli').upsert(gruppo.slice(i, i + 300), { onConflict: 'codice' });
                if (error) throw error;
            }
        }
    } catch (error) {
        console.error('Errore caricamento listino STIHL:', error);
        btn.disabled = false;
        btn.innerHTML = '&#10004; Conferma caricamento';
        await showCustomAlert('Errore durante il caricamento:<br>' + listinoEsc(error.message), 'Errore', '&#10060;');
        return;
    }
    const riepilogo = p.nuovi.length + ' nuovi, ' + p.cambiati.length + ' aggiornati, ' + p.uguali.length + ' invariati.';
    stiPiano = null;
    stiWb = null;
    document.getElementById('sti-anteprima').innerHTML = '';
    document.getElementById('sti-impostazioni').classList.add('hidden');
    document.getElementById('sti-file-nome').innerHTML = '';
    await stiCaricaDati();
    stiRenderTutto();
    stiSwitchTab('elenco');
    await showCustomAlert('<strong>' + listinoEsc(p.imp.nome) + '</strong> caricato.<br>' + riepilogo, 'Listino STIHL aggiornato', '&#10004;');
}

function stiAnnullaAnteprima() {
    stiPiano = null;
    document.getElementById('sti-anteprima').innerHTML = '';
}

// ========================================
// CARICAMENTI FATTI (fonti)
// ========================================
function stiRenderFonti() {
    const box = document.getElementById('sti-fonti');
    if (!box) return;
    if (!stiFonti.length) {
        box.innerHTML = '<p class="mac-aiuto">Nessun file caricato finora.</p>';
        return;
    }
    const conta = {};
    stiArticoli.forEach(a => { conta[a.fonte_id] = (conta[a.fonte_id] || 0) + 1; });
    box.innerHTML = '<div class="table-container"><table class="listino-table sti-table"><thead><tr>' +
        '<th>Caricato il</th><th>Nome</th><th>File</th><th>Foglio / riga</th><th>Articoli nel file</th><th>Articoli che valgono ora</th><th>Ricarico</th></tr></thead><tbody>' +
        stiFonti.slice().sort((x, y) => y.id - x.id).map(f =>
            '<tr><td>' + listinoEsc(macDataOra(f.caricato_il)) + '<br><small>' + listinoEsc(macChi(f.caricato_da)) + '</small></td>' +
            '<td><strong>' + listinoEsc(f.nome) + '</strong></td><td><small>' + listinoVal(f.file_nome) + '</small></td>' +
            '<td>' + listinoVal(f.foglio) + ' / ' + listinoVal(f.riga_intestazioni) + '</td>' +
            '<td class="mac-raf-num">' + listinoVal(f.righe) + '</td><td class="mac-raf-num">' + (conta[f.id] || 0) + '</td>' +
            '<td class="sti-col-ric-mod">' + (conta[f.id]
                ? '<input type="text" inputmode="decimal" class="sti-ric-input" data-sti-fonte="' + f.id + '" value="' + listinoEsc(String(stiNum(f.ricarico)).replace('.', ',')) + '"> % ' +
                  '<button type="button" class="btn-back mac-btn-piccolo" data-sti-ric="' + f.id + '">Applica</button>'
                : listinoEsc(String(stiNum(f.ricarico))) + '%') + '</td></tr>'
        ).join('') + '</tbody></table></div>' +
        '<p class="mac-aiuto">&quot;Articoli che valgono ora&quot;: quelli il cui prezzo viene da quel file (se un codice &egrave; in pi&ugrave; file vale l\'ultimo caricato). ' +
        'Con &quot;Applica&quot; cambi il ricarico di tutti quegli articoli.</p>';
}

async function stiCambiaRicarico(fonteId) {
    const input = document.querySelector('.sti-ric-input[data-sti-fonte="' + fonteId + '"]');
    const ric = listinoParseNumero(input ? input.value : '');
    if (typeof ric !== 'number' || isNaN(ric) || ric < 0 || ric > 500) {
        await showCustomAlert('Ricarico non valido', 'Controlla i dati', '&#9888;&#65039;');
        return;
    }
    const f = stiFonte(fonteId);
    const n = stiArticoli.filter(a => a.fonte_id === fonteId).length;
    if (!window.confirm('Applicare il ricarico ' + ric + '% ai ' + n + ' articoli di "' + (f ? f.nome : '') + '"?')) return;
    const adesso = new Date().toISOString();
    const { error } = await supabaseClient.from('stihl_articoli').update({ ricarico: ric, updated_at: adesso, updated_by: listinoEmailUtente() }).eq('fonte_id', fonteId);
    if (!error) await supabaseClient.from('stihl_fonti').update({ ricarico: ric }).eq('id', fonteId);
    if (error) {
        await showCustomAlert('Ricarico non salvato:<br>' + listinoEsc(error.message), 'Errore', '&#10060;');
        return;
    }
    await stiCaricaDati();
    stiRenderTutto();
    await showCustomAlert('Ricarico ' + ric + '% applicato a ' + n + ' articoli.', 'Fatto', '&#10004;');
}


// ========================================
// CODICI EAN DA UN CATALOGO (solo admin)
// ----------------------------------------
// Catalogo con codice articolo + EAN (es. Superlistino, 26.000 righe): si tengono SOLO gli EAN
// degli articoli che sono nel listino STIHL. Niente altro viene salvato.
// ========================================
function stiTrovaIntestazioniEan(ws) {
    const rg = stiRange(ws);
    if (!rg) return -1;
    for (let r = rg.s.r; r <= Math.min(rg.e.r, rg.s.r + 40); r++) {
        let codice = false, ean = false;
        for (let c = rg.s.c; c <= Math.min(rg.e.c, 60); c++) {
            const h = stiNormIntestazione(stiTestoCella(ws, r, c));
            if (h === 'CODICE' || h === 'CODICE ARTICOLO') codice = true;
            if (h === 'EAN' || h.indexOf('EAN') === 0 || h.indexOf('BARCODE') !== -1 || h.indexOf('CODICE A BARRE') !== -1) ean = true;
        }
        if (codice && ean) return r;
    }
    return -1;
}

function stiEanFoglioNascosto(nome) {
    try {
        const info = (stiEanWb.Workbook && stiEanWb.Workbook.Sheets) || [];
        const s = info.find(x => x.name === nome);
        return !!(s && s.Hidden);
    } catch (e) { return false; }
}

function stiEanFileScelto(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    stiEanFileNome = file.name;
    const box = document.getElementById('sti-ean-file-nome');
    box.innerHTML = '&#8987; Lettura del file in corso (i file grandi richiedono qualche secondo)...';
    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            stiEanWb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
        } catch (err) {
            console.error('Errore lettura catalogo EAN:', err);
            box.innerHTML = '';
            showCustomAlert('Non riesco a leggere il file:<br>' + listinoEsc(err.message), 'Errore', '&#10060;');
            return;
        }
        stiEanPiano = null;
        document.getElementById('sti-ean-anteprima').innerHTML = '';
        const conIntest = stiEanWb.SheetNames.filter(n => stiTrovaIntestazioniEan(stiEanWb.Sheets[n]) !== -1);
        const scelto = conIntest.find(n => !stiEanFoglioNascosto(n)) || conIntest[0] || stiEanWb.SheetNames[0];
        const sel = document.getElementById('sti-ean-foglio');
        sel.innerHTML = stiEanWb.SheetNames.map(n => '<option value="' + listinoEsc(n) + '">' + listinoEsc(n) +
            (stiEanFoglioNascosto(n) ? ' (nascosto)' : '') + '</option>').join('');
        sel.value = scelto;
        box.innerHTML = '&#128196; <strong>' + listinoEsc(file.name) + '</strong>';
        document.getElementById('sti-ean-impostazioni').classList.remove('hidden');
        stiEanFoglioCambiato();
    };
    reader.readAsArrayBuffer(file);
}

function stiEanFoglioCambiato() {
    const ws = stiEanWb.Sheets[document.getElementById('sti-ean-foglio').value];
    const r = stiTrovaIntestazioniEan(ws);
    document.getElementById('sti-ean-riga').value = r === -1 ? '' : String(r + 1);
    stiEanRigaCambiata();
}

function stiEanIntestazioni() {
    const ws = stiEanWb.Sheets[document.getElementById('sti-ean-foglio').value];
    const riga = parseInt(document.getElementById('sti-ean-riga').value, 10) - 1;
    const rg = stiRange(ws);
    if (!rg || isNaN(riga) || riga < 0) return [];
    const out = [];
    for (let c = rg.s.c; c <= rg.e.c; c++) {
        const t = stiTestoCella(ws, riga, c);
        if (t) out.push({ col: c, testo: t, norm: stiNormIntestazione(t) });
    }
    return out;
}

function stiEanRigaCambiata() {
    stiEanPiano = null;
    document.getElementById('sti-ean-anteprima').innerHTML = '';
    const intest = stiEanIntestazioni();
    const box = document.getElementById('sti-ean-colonne');
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
        return '<div class="sti-colonna"><label>' + f.titolo + '</label><select data-sti-ean="' + f.campo + '"><option value="">- scegli -</option>' +
            intest.map(h => '<option value="' + h.col + '"' + (scelta && scelta.col === h.col ? ' selected' : '') + '>' +
                XLSX.utils.encode_col(h.col) + ' &middot; ' + listinoEsc(h.testo) + '</option>').join('') + '</select></div>';
    }).join('');
}

function stiEanPulisci(v) {
    const s = String(v === null || v === undefined ? '' : v).replace(/\s+/g, '').toUpperCase();
    return /^\d{8,14}$/.test(s) ? s : null;
}

async function stiEanAnteprima() {
    if (!stiEanWb) return;
    const ws = stiEanWb.Sheets[document.getElementById('sti-ean-foglio').value];
    const riga = parseInt(document.getElementById('sti-ean-riga').value, 10);
    const colCod = document.querySelector('#sti-ean-colonne select[data-sti-ean="codice"]');
    const colEan = document.querySelector('#sti-ean-colonne select[data-sti-ean="ean"]');
    if (!riga || !colCod || !colEan || colCod.value === '' || colEan.value === '') {
        await showCustomAlert('Scegli la riga dei titoli e le due colonne (codice ed EAN).', 'Controlla i dati', '&#9888;&#65039;');
        return;
    }
    if (!stiArticoli.length) {
        await showCustomAlert('Il listino STIHL &egrave; vuoto: carica prima i file delle promo (OPG, OPM...).', 'Listino vuoto', '&#9888;&#65039;');
        return;
    }
    const cC = parseInt(colCod.value, 10), cE = parseInt(colEan.value, 10);
    const rg = stiRange(ws);
    // Indice del catalogo: codice -> EAN (solo righe con un EAN valido)
    const catalogo = {};
    let righeCatalogo = 0;
    for (let r = riga; r <= rg.e.r; r++) {
        const codice = listinoPulisciTesto(stiTestoCella(ws, r, cC));
        if (!codice) continue;
        righeCatalogo++;
        const ean = stiEanPulisci(stiTestoCella(ws, r, cE));
        if (ean) catalogo[codice] = ean;
    }
    const nuovi = [], cambiati = [], uguali = [], mancanti = [];
    stiArticoli.forEach(a => {
        const ean = catalogo[a.codice];
        if (!ean) { mancanti.push(a); return; }
        if (!a.ean) nuovi.push({ a: a, ean: ean });
        else if (listinoStessoCodiceBarre(a.ean, ean)) uguali.push({ a: a, ean: ean });
        else cambiati.push({ a: a, ean: ean });
    });
    // Articoli collegati del Listino Vendite: cosa succede al loro codice a barre
    const listino = { messi: [], uguali: [], diversi: [], conflitti: [] };
    nuovi.concat(cambiati, uguali).forEach(x => {
        const art = stiArticoloListino(x.a);
        if (!art) return;
        if (art.codice_barre) {
            if (listinoStessoCodiceBarre(art.codice_barre, x.ean)) listino.uguali.push({ x: x, art: art });
            else listino.diversi.push({ x: x, art: art });
        } else if (stiProprietarioEan(x.ean, art.id)) listino.conflitti.push({ x: x, art: art });
        else listino.messi.push({ x: x, art: art });
    });
    stiEanPiano = { righeCatalogo: righeCatalogo, nuovi: nuovi, cambiati: cambiati, uguali: uguali, mancanti: mancanti, listino: listino };
    stiEanRenderAnteprima();
}

function stiEanRenderAnteprima() {
    const p = stiEanPiano;
    const box = document.getElementById('sti-ean-anteprima');
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
        '<p class="mac-aiuto">Vengono salvati solo gli EAN dei ' + stiArticoli.length + ' articoli del listino STIHL: il resto del catalogo non entra nel database.</p>';
    html += '<h4 class="sti-sottotitolo">Listino Vendite (articoli collegati)</h4><ul class="sti-scartate">' +
        '<li>&#10004; Codice a barre da aggiungere: <strong>' + L.messi.length + '</strong></li>' +
        '<li>Gi&agrave; giusto: ' + L.uguali.length + '</li>' +
        (L.diversi.length ? '<li>&#9888;&#65039; Hanno gi&agrave; un codice a barre diverso (non lo cambio): ' + L.diversi.map(d => listinoEsc(macNome(d.art)) + ' (' + listinoEsc(d.art.codice_barre) + ' / EAN ' + listinoEsc(d.x.ean) + ')').join(', ') + '</li>' : '') +
        (L.conflitti.length ? '<li>&#9888;&#65039; EAN gi&agrave; usato da un altro articolo (non lo metto): ' + L.conflitti.map(d => listinoEsc(macNome(d.art))).join(', ') + '</li>' : '') +
        '</ul>';
    if (p.nuovi.length) html += '<details><summary>&#10133; EAN nuovi (' + p.nuovi.length + ')</summary><ul class="sti-scartate">' + p.nuovi.map(voce).join('') + '</ul></details>';
    if (p.cambiati.length) html += '<details open><summary>&#9998;&#65039; EAN cambiati (' + p.cambiati.length + ')</summary><ul class="sti-scartate">' + p.cambiati.map(voce).join('') + '</ul></details>';
    if (p.mancanti.length) html += '<details><summary>&#10067; Articoli non trovati nel catalogo (' + p.mancanti.length + ')</summary><ul class="sti-scartate">' +
        p.mancanti.map(a => '<li><strong>' + listinoEsc(a.codice) + '</strong> ' + listinoEsc(a.descrizione || '') + '</li>').join('') +
        '</ul><p class="mac-aiuto">Per questi l\'EAN si impara dalla scatola con il lettore (Carico a raffica).</p></details>';
    const daFare = p.nuovi.length + p.cambiati.length + L.messi.length;
    html += '<div class="listino-import-pulsanti">' +
        '<button type="button" class="btn-primary" id="sti-ean-conferma"' + (daFare ? '' : ' disabled') + '>&#10004; Salva gli EAN</button>' +
        '<button type="button" class="btn-back" id="sti-ean-annulla">Annulla</button></div>';
    box.innerHTML = html;
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function stiEanConferma() {
    const p = stiEanPiano;
    if (!p) return;
    const daSalvare = p.nuovi.concat(p.cambiati);
    if (!window.confirm('Salvare ' + daSalvare.length + ' EAN nel listino STIHL e ' + p.listino.messi.length +
        ' codici a barre nel Listino Vendite?')) return;
    const btn = document.getElementById('sti-ean-conferma');
    btn.disabled = true;
    btn.innerHTML = '&#8987; Salvataggio...';
    const adesso = new Date().toISOString();
    const utente = listinoEmailUtente();
    let listinoMessi = 0;
    try {
        for (let i = 0; i < daSalvare.length; i += 300) {
            const blocco = daSalvare.slice(i, i + 300).map(x => ({ codice: x.a.codice, ean: x.ean, updated_at: adesso, updated_by: utente }));
            const { error } = await supabaseClient.from('stihl_articoli').upsert(blocco, { onConflict: 'codice' });
            if (error) throw error;
        }
        daSalvare.forEach(x => { x.a.ean = x.ean; });
        for (const m of p.listino.messi) {
            if (stiProprietarioEan(m.x.ean, m.art.id) || m.art.codice_barre) continue;
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
    stiEanPiano = null;
    stiEanWb = null;
    document.getElementById('sti-ean-anteprima').innerHTML = '';
    document.getElementById('sti-ean-impostazioni').classList.add('hidden');
    document.getElementById('sti-ean-file-nome').innerHTML = '';
    await stiCaricaDati();
    stiRenderTutto();
    await showCustomAlert(daSalvare.length + ' EAN salvati nel listino STIHL.<br>' + listinoMessi + ' codici a barre aggiunti nel Listino Vendite.' +
        (p.mancanti.length ? '<br><br>' + p.mancanti.length + ' articoli non erano nel catalogo: il loro EAN si impara dalla scatola con il lettore.' : ''),
        'EAN aggiornati', '&#10004;');
}

function stiApriGuida() {
    document.getElementById('sti-guida-modal').classList.remove('hidden');
}

function stiChiudiGuida() {
    document.getElementById('sti-guida-modal').classList.add('hidden');
}

// ========================================
// AVVIO
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    const section = document.getElementById('section-listino-stihl');
    if (!section) return;

    document.querySelectorAll('#tabs-stihl .tab-btn').forEach(b => b.addEventListener('click', () => stiSwitchTab(b.dataset.stihlTab)));
    document.getElementById('sti-toggle-netti').addEventListener('change', (e) => {
        stiNettiVisibili = e.target.checked;
        stiApplicaNetti();
        listinoSalvaPreferenza('stihlNettiVisibili', stiNettiVisibili);
    });
    document.getElementById('sti-search').addEventListener('input', () => {
        clearTimeout(stiSearchTimeout);
        stiSearchTimeout = setTimeout(stiRenderElenco, 200);
    });
    document.getElementById('sti-filtro-categoria').addEventListener('change', stiRenderElenco);
    document.getElementById('sti-filtro-collegati').addEventListener('change', stiRenderElenco);
    document.getElementById('sti-reset').addEventListener('click', () => {
        document.getElementById('sti-search').value = '';
        document.getElementById('sti-filtro-categoria').value = '';
        document.getElementById('sti-filtro-collegati').value = '';
        stiRenderElenco();
    });

    // Azioni sulle righe
    document.getElementById('sti-container').addEventListener('click', (e) => {
        let el;
        if ((el = e.target.closest('[data-sti-collega]'))) { stiApriCollega(parseInt(el.dataset.stiCollega, 10)); return; }
        if ((el = e.target.closest('[data-sti-crea]'))) { stiCreaInListino(parseInt(el.dataset.stiCrea, 10)); return; }
        if ((el = e.target.closest('[data-sti-scollega]'))) { stiScollega(parseInt(el.dataset.stiScollega, 10)); return; }
        if ((el = e.target.closest('[data-sti-apri]'))) { if (typeof openListinoEdit === 'function') openListinoEdit(parseInt(el.dataset.stiApri, 10)); return; }
    });

    // Caricamento file
    document.getElementById('sti-btn-file').addEventListener('click', stiSelezionaFile);
    document.getElementById('sti-file').addEventListener('change', stiFileScelto);
    document.getElementById('sti-foglio').addEventListener('change', () => { stiAnnullaAnteprima(); stiFoglioCambiato(false); });
    document.getElementById('sti-riga').addEventListener('change', () => { stiAnnullaAnteprima(); stiRigaCambiata(); });
    document.getElementById('sti-btn-anteprima').addEventListener('click', stiAnteprima);
    document.getElementById('sti-anteprima').addEventListener('click', (e) => {
        if (e.target.closest('#sti-conferma')) stiConferma();
        else if (e.target.closest('#sti-annulla')) stiAnnullaAnteprima();
    });
    document.getElementById('sti-colonne').addEventListener('change', stiAnnullaAnteprima);

    // Catalogo EAN
    document.getElementById('sti-ean-btn-file').addEventListener('click', () => document.getElementById('sti-ean-file').click());
    document.getElementById('sti-ean-file').addEventListener('change', stiEanFileScelto);
    document.getElementById('sti-ean-foglio').addEventListener('change', stiEanFoglioCambiato);
    document.getElementById('sti-ean-riga').addEventListener('change', stiEanRigaCambiata);
    document.getElementById('sti-ean-colonne').addEventListener('change', () => { stiEanPiano = null; document.getElementById('sti-ean-anteprima').innerHTML = ''; });
    document.getElementById('sti-ean-btn-anteprima').addEventListener('click', stiEanAnteprima);
    document.getElementById('sti-ean-anteprima').addEventListener('click', (e) => {
        if (e.target.closest('#sti-ean-conferma')) stiEanConferma();
        else if (e.target.closest('#sti-ean-annulla')) { stiEanPiano = null; document.getElementById('sti-ean-anteprima').innerHTML = ''; }
    });

    // Guida rapida
    document.getElementById('sti-guida-btn').addEventListener('click', () => { if (stiPuoCaricare()) stiApriGuida(); });
    document.getElementById('sti-guida-close').addEventListener('click', stiChiudiGuida);
    document.getElementById('sti-guida-chiudi').addEventListener('click', stiChiudiGuida);

    // Caricamenti: cambio ricarico
    document.getElementById('sti-fonti').addEventListener('click', (e) => {
        const b = e.target.closest('[data-sti-ric]');
        if (b) stiCambiaRicarico(parseInt(b.dataset.stiRic, 10));
    });

    // Finestra "Collega"
    if (typeof macPickerImposta === 'function') macPickerImposta('sti-collega-search', 'sti-collega-results', null, stiCollegaScelto);
    document.getElementById('sti-collega-close').addEventListener('click', stiChiudiCollega);
    document.getElementById('sti-collega-annulla').addEventListener('click', stiChiudiCollega);

    // Finestra Nuovo articolo chiusa senza salvare: niente collegamento
    document.addEventListener('click', (e) => {
        if (stiInCreazione && e.target.closest('#listino-edit-modal .modal-close, #listino-edit-annulla')) stiInCreazione = null;
    }, true);
});

window.openListinoStihl = openListinoStihl;
window.stiPuoVedere = stiPuoVedere;
window.stihlDopoSalvataggioListino = stihlDopoSalvataggioListino;
