// ========================================
// ORDINI > ORDINI MACCHINE (il libro degli ordini al fornitore, come OneNote)
// ----------------------------------------
// - Divisori = MARCHI del listino. Dentro ogni marchio: la pagina ORDINI NORMALE
//   e le sezioni create al bisogno (prestagionali: OPG, TRATTORINI 2026...).
// - ORDINI NORMALE > "Da ordinare": arrivano da soli dagli ordini clienti (macchine DA ORDINARE).
//   Si spuntano le righe, si sceglie quante, e "Segna come ordinate" (data + iniziali, eventuale
//   sezione prestagionale e consegna prevista). Le macchine diventano ORDINATE: nel quaderno
//   quadratino bianco con l'angolino verde.
// - Sezioni: "Nuovo ordine" con righe senza cliente (prestagionale): macchine ORDINATE libere,
//   il primo ordine cliente di quel modello le prende (In arrivo).
// - Ogni ordine fatto e' un blocco: righe con quantita', codice, descrizione, clienti, e in fondo
//   data + iniziali (+ consegna). Riga arrivata = spunta verde.
// Righe da ordinare = macchine DA ORDINARE (senza data e iniziali).
// Righe da ordinare per il magazzino (v7.5.1): "Aggiungi riga" in Da ordinare = macchine DA_ORDINARE senza cliente,
// si ordinano insieme alle altre (diventano ORDINATE libere). Nell'elenco vanno dopo i clienti.
// Macchine in piu' per il magazzino (v7.5): in "quante" si puo' scrivere piu' delle richieste dei clienti
// (le altre arrivano libere), "Nuovo ordine" anche in ORDINI NORMALE, righe libere in ogni ordine,
// e nella finestra di una riga "Aggiungi in arrivo libere".
// Sezioni: "Carica Excel" (file del fornitore con le quantita' per mese di consegna): un ordine per mese
// con data = oggi, iniziali di chi carica, consegna = mese. Funzioni omXls*.
// Usa: macchine-functions.js (macPezzi, macOrdiniFornitore, macOfSezioni, macSegnaOrdinate...)
// Tabelle: macchine_of_ordini, macchine_of_sezioni, macchine_pezzi.ordine_fornitore_id
// (supabase/ordini-macchine-setup.sql)
// ========================================

// Chi vede la sezione Ordini Macchine: admin e operatori (dal 9/11/2026)
const ORDINI_RUOLI = ['admin', 'operatore'];

function omPuoVedere() {
    return ORDINI_RUOLI.includes(currentUserRole) && typeof macPuoGestire === 'function' && macPuoGestire();
}

const OM_NORMALE = 'NORMALE';     // pagina ORDINI NORMALE (ordini senza sezione)
let omCaricato = false;
let omSelezione = {};             // articolo_id -> quantita' da ordinare (righe spuntate)
let omOfInModifica = null;        // ordine al fornitore aperto nella finestra (null = nuovo)
let omOfRighe = [];               // righe nuove della finestra: [{ art, n }]
let omSezioneInModifica = null;
let omRigaAperta = null;          // { ofId, articoloId }

// ========================================
// UTILITA'
// ========================================
function omMarchioDi(p) {
    const a = macArticolo(p.articolo_id);
    return (a && a.marchio) || 'SENZA MARCHIO';
}

function omOrdineCliente(p) {
    const o = p.ordine_id ? macOrdiniInfo[p.ordine_id] : null;
    return o ? o.numero + '/' + o.anno : '';
}

function omOggiISO() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// Da ordinare: prima i clienti (dal piu' vecchio), in fondo le righe per il magazzino
function omConfrontaDaOrd(x, y) {
    const a = x.cliente ? 0 : 1, b = y.cliente ? 0 : 1;
    return a !== b ? a - b : macConfrontaAttesa(x, y);
}

function omDaOrdinare(marchio) {
    return macPezzi.filter(p => p.stato === 'DA_ORDINARE' && (!marchio || omMarchioDi(p) === marchio));
}

function omArrivato(p) {
    return p.stato === 'IN_CASA' || p.stato === 'CONSEGNATA';
}

function omPezziOf(of) {
    return macPezzi.filter(p => p.ordine_fornitore_id === of.id);
}

// Ordine completamente arrivato (nessuna macchina ancora ordinata)
function omOfArrivato(of) {
    const pezzi = omPezziOf(of);
    return pezzi.length > 0 && pezzi.every(omArrivato);
}

function omSessione(nome, valore) {
    return macSessione(nome, valore);
}

function omSezioniMarchio(marchio) {
    return macOfSezioni.filter(s => s.marchio === marchio)
        .sort((a, b) => (a.chiusa === b.chiusa ? listinoConfronta(a.nome, b.nome) : (a.chiusa ? 1 : -1)));
}

// "1x ROSSI (45/2026)"
function omClienteTesto(lista) {
    const per = {};
    const ordine = [];
    lista.forEach(p => {
        const chiave = (p.cliente || '') + '|' + (p.ordine_id || '') + '|' + (macMontaggioDi(p) || '');
        if (!per[chiave]) { per[chiave] = { p: p, n: 0 }; ordine.push(chiave); }
        per[chiave].n++;
    });
    return ordine.map(k => {
        const x = per[k];
        const num = omOrdineCliente(x.p);
        const m = macPuoMontaggio() ? macMontaggioDi(x.p) : null;
        if (!x.p.cliente) return x.n + 'x <em class="om-magazzino">per il magazzino</em>';
        return x.n + 'x ' + macEsc(x.p.cliente) + (num ? ' <small>(' + num + ')</small>' : '') +
            (m ? ' <span class="om-mont om-mont-' + m.toLowerCase() + '">' + MAC_MONTAGGIO[m].breve + '</span>' : '');
    }).join(', ');
}

// Raggruppa pezzi per articolo, nell'ordine del listino
function omPerArticolo(pezzi) {
    const per = {};
    pezzi.forEach(p => { (per[p.articolo_id] = per[p.articolo_id] || []).push(p); });
    const articoli = listinoOrdina(Object.keys(per).map(id => macArticolo(Number(id))).filter(Boolean));
    const senza = Object.keys(per).filter(id => !macArticolo(Number(id)));
    return articoli.map(a => ({ art: a, pezzi: per[a.id] })).concat(senza.map(id => ({ art: null, pezzi: per[id] })));
}

// "TOSASIEPI <b>HSA 140 T</b> SENZA BATTERIA  STIHA02-011-3515" (attrezzo, modello in grassetto, note, codice articolo)
function omDescrizioneHtml(a) {
    if (!a) return 'ARTICOLO NON PIU&#39; NEL LISTINO';
    return (a.attrezzo ? macEsc(a.attrezzo) + ' ' : '') + '<span class="om-codice">' + macEsc(a.modello || '') + '</span>' +
        (a.note ? ' ' + macEsc(a.note) : '') +
        (a.codice_articolo ? ' <span class="om-codart" title="Codice articolo">' + macEsc(a.codice_articolo) + '</span>'
            : ' <span class="om-codart om-codart-manca" title="Manca il codice articolo: scrivilo nel Listino Agrimacch (Modifica articolo)">cod. ?</span>');
}

// ========================================
// APERTURA
// ========================================
async function openOrdiniMacchine() {
    if (!omPuoVedere()) return;
    const pagina = document.getElementById('om-pagina');
    if (pagina && !omCaricato) pagina.innerHTML = '<p class="mac-q-vuoto">&#8987; Caricamento ordini...</p>';
    try {
        if (!listinoCaricato) await loadListino();
        await macCaricaDati();
        if (typeof loadAllUsers === 'function' && Object.keys(userInitials || {}).length === 0) await loadAllUsers();
    } catch (error) {
        console.error('Errore caricamento ordini macchine:', error);
        if (pagina) pagina.innerHTML = '<p class="mac-q-vuoto">&#10060; Errore: ' + macEsc(error.message) + '</p>';
        return;
    }
    omCaricato = true;
    omPopolaVaiMarchio();
    omRender();
}

async function omRicarica() {
    try { await macCaricaDati(); } catch (e) { console.error('Errore ricarica ordini macchine:', e); }
    omRender();
}

// ========================================
// IL LIBRO
// ========================================
function omMarchi() {
    const conta = {};
    const aggiungi = m => { if (!(m in conta)) conta[m] = 0; };
    omDaOrdinare().forEach(p => { const m = omMarchioDi(p); conta[m] = (conta[m] || 0) + 1; });
    const mostraArrivati = document.getElementById('om-mostra-arrivati') && document.getElementById('om-mostra-arrivati').checked;
    macOrdiniFornitore.forEach(of => { if (mostraArrivati || !omOfArrivato(of)) aggiungi(of.marchio); });
    macOfSezioni.forEach(s => { if (!s.chiusa) aggiungi(s.marchio); });
    // Marchio aperto con "Vai al marchio": resta solo se e' ancora un marchio del listino
    // (un marchio di prova cancellato non deve restare tra i divisori)
    const scelto = omSessione('omMarchio');
    if (scelto && listinoArticoli.some(a => a.attivo && a.marchio === scelto)) aggiungi(scelto);
    return conta;
}

function omRender() {
    const pagina = document.getElementById('om-pagina');
    const divisori = document.getElementById('om-divisori');
    if (!pagina || !divisori || !omCaricato) return;

    const avviso = document.getElementById('om-avviso-sql');
    if (avviso) avviso.classList.toggle('hidden', macOfPronto);

    const conta = omMarchi();
    const marchi = Object.keys(conta).sort(listinoConfronta);
    let marchio = omSessione('omMarchio');
    if (!marchio || marchi.indexOf(marchio) === -1) {
        marchio = marchi.find(m => conta[m] > 0) || marchi[0] || '';
        if (marchio) omSessione('omMarchio', marchio);
    }

    // Riepilogo in alto: marchi con ordini da fare
    const daFare = marchi.filter(m => conta[m] > 0);
    const riep = document.getElementById('om-riepilogo');
    if (riep) {
        riep.innerHTML = daFare.length
            ? '&#128276; Ordini da fare: ' + daFare.map(m => '<button type="button" class="om-riep-marchio" data-om-marchio="' + macEsc(m) + '">' +
                macEsc(m) + ' <span>' + conta[m] + '</span></button>').join(' ')
            : '&#9989; Nessuna macchina da ordinare.';
    }

    divisori.innerHTML = marchi.map(m =>
        '<button type="button" class="mac-divisorio' + (m === marchio ? ' active' : '') + '" data-om-marchio="' + macEsc(m) + '">' +
            '<span>' + macEsc(m) + '</span>' + (conta[m] ? '<span class="om-badge">' + conta[m] + '</span>' : '') + '</button>'
    ).join('');

    if (!marchio) {
        pagina.innerHTML = '<p class="mac-q-vuoto">Nessun ordine.<br>Le macchine <strong>da ordinare</strong> degli ordini clienti compaiono qui da sole, divise per marchio.<br>' +
            'Per un prestagionale scegli il marchio da <strong>Vai al marchio</strong> e crea una sezione.</p>';
        return;
    }
    pagina.innerHTML = omHtmlMarchio(marchio);
}

function omHtmlMarchio(marchio) {
    const sezioni = omSezioniMarchio(marchio);
    let sezione = omSessione('omSezione') || OM_NORMALE;
    const sezScelta = sezione !== OM_NORMALE ? sezioni.find(s => String(s.id) === String(sezione)) : null;
    if (sezione !== OM_NORMALE && !sezScelta) sezione = OM_NORMALE;
    const daOrdinare = omDaOrdinare(marchio);

    let html = '<div class="om-testa"><h3 class="mac-evidenziatore">' + macEsc(marchio) + '</h3></div>';
    // Pagine del marchio (come le pagine di OneNote)
    html += '<div class="om-pagine">' +
        '<button type="button" class="om-pagina-btn' + (sezione === OM_NORMALE ? ' active' : '') + '" data-om-sezione="' + OM_NORMALE + '">ORDINI NORMALE' +
            (daOrdinare.length ? ' <span class="om-badge">' + daOrdinare.length + '</span>' : '') + '</button>' +
        sezioni.map(s => '<button type="button" class="om-pagina-btn' + (String(s.id) === String(sezione) ? ' active' : '') + (s.chiusa ? ' om-chiusa' : '') +
            '" data-om-sezione="' + s.id + '">' + macEsc(s.nome) + '</button>').join('') +
        (macOfPronto ? '<button type="button" class="om-pagina-btn om-pagina-nuova" data-om-azione="nuova-sezione">&#10133; Sezione</button>' : '') +
    '</div>';

    if (sezione === OM_NORMALE) {
        html += '<div class="om-sez-testa"><div class="mac-aiuto">Ordini senza consegna programmata. Le macchine da ordinare dei clienti arrivano da sole; ' +
            'per il magazzino usa <strong>&#10133; Aggiungi riga</strong> (si ordina insieme alle altre), scrivi in <strong>quante</strong> pi&ugrave; di quelle richieste, ' +
            'oppure <strong>Nuovo ordine</strong> per un ordine gi&agrave; fatto solo per il magazzino.</div>' +
            '<div class="om-sez-azioni">' + (macOfPronto ? '<button type="button" class="btn-primary mac-btn-piccolo" data-om-azione="nuovo-of">&#10133; Nuovo ordine</button>' : '') + '</div></div>';
        html += omHtmlDaOrdinare(daOrdinare);
        html += omHtmlOrdiniFatti(marchio, null);
    } else {
        html += '<div class="om-sez-testa">' +
            '<div><strong>' + macEsc(sezScelta.nome) + '</strong>' + (sezScelta.chiusa ? ' <span class="om-tag-chiusa">chiusa</span>' : '') +
                (sezScelta.note ? '<div class="om-sez-note">' + macEsc(sezScelta.note) + '</div>' : '') + '</div>' +
            '<div class="om-sez-azioni">' +
                (!sezScelta.chiusa ? '<button type="button" class="btn-primary mac-btn-piccolo" data-om-azione="nuovo-of">&#10133; Nuovo ordine</button>' +
                    '<button type="button" class="btn-back mac-btn-piccolo" data-om-azione="carica-xls">&#128229; Carica Excel</button>' : '') +
                '<button type="button" class="btn-back mac-btn-piccolo" data-om-azione="modifica-sezione">&#9997;&#65039; Sezione</button>' +
            '</div>' +
        '</div>';
        html += '<p class="mac-aiuto">Ordini con consegna programmata (prestagionali). Le righe senza cliente sono macchine <strong>in arrivo libere</strong>: ' +
            'il primo ordine cliente di quel modello le prende da solo. Le macchine da ordinare dei clienti si mettono qui da <strong>ORDINI NORMALE</strong> &rarr; Segna come ordinate &rarr; scegli la sezione.</p>';
        html += omHtmlOrdiniFatti(marchio, sezScelta.id);
    }
    return html;
}

// ---------- Righe da ordinare (macchine DA ORDINARE dei clienti) ----------
function omHtmlDaOrdinare(pezzi) {
    if (pezzi.length === 0) {
        return '<div class="om-blocco om-blocco-daord"><div class="om-blocco-titolo">&#9989; Niente da ordinare per questo marchio' +
            (macOfPronto ? '<button type="button" class="btn-back mac-btn-piccolo om-dao-btn" data-om-azione="aggiungi-dao">&#10133; Aggiungi riga</button>' : '') + '</div></div>';
    }
    const gruppi = omPerArticolo(pezzi);
    // tolgo dalla selezione articoli che non ci sono piu'
    Object.keys(omSelezione).forEach(id => { if (!gruppi.some(g => g.art && String(g.art.id) === id)) delete omSelezione[id]; });
    const totSel = Object.keys(omSelezione).reduce((t, id) => t + omSelezione[id], 0);
    let html = '<div class="om-blocco om-blocco-daord">' +
        '<div class="om-blocco-titolo">&#128203; Da ordinare <small>(dagli ordini clienti, dal pi&ugrave; vecchio)</small>' +
            (macOfPronto ? '<button type="button" class="btn-back mac-btn-piccolo om-dao-btn" data-om-azione="aggiungi-dao" title="Aggiungi un modello da ordinare per il magazzino">&#10133; Aggiungi riga</button>' : '') +
            '<label class="mac-check om-tutte"><input type="checkbox" id="om-sel-tutte"' + (gruppi.every(g => g.art && omSelezione[g.art.id]) ? ' checked' : '') + '> tutte</label></div>';
    gruppi.forEach(g => {
        const lista = g.pezzi.slice().sort(omConfrontaDaOrd);
        const a = g.art;
        const magazzino = lista.filter(p => !p.cliente).length;
        const id = a ? a.id : 0;
        const sel = a && omSelezione[id];
        const extra = sel ? Math.max(0, omSelezione[id] - lista.length) : 0;
        html += '<div class="om-riga' + (sel ? ' om-riga-sel' : '') + '">' +
            '<label class="om-riga-check">' + (a ? '<input type="checkbox" data-om-sel="' + id + '"' + (sel ? ' checked' : '') + '>' : '') +
                '<span class="mac-quadro st-daordinare"></span></label>' +
            '<div class="om-riga-testo"><strong class="om-qta">' + lista.length + '</strong> ' +
                omDescrizioneHtml(a) +
                '<div class="om-clienti">' + omClienteTesto(lista) +
                    (magazzino && a ? ' <button type="button" class="mac-link om-dao-togli" data-om-dao-togli="' + a.id + '" title="Togli le righe per il magazzino di questo modello">togli</button>' : '') +
                '</div></div>' +
            (sel ? '<label class="om-quante" title="Puoi scriverne pi&ugrave; di quelle richieste: le altre arrivano libere (per il magazzino)">quante <input type="number" min="1" max="' +
                MAC_MAX_QTA + '" value="' + omSelezione[id] + '" data-om-quante="' + id + '" inputmode="numeric">' +
                (extra ? '<small class="om-extra">+' + extra + ' per il magazzino</small>' : '') + '</label>' : '') +
        '</div>';
    });
    html += '<div class="om-blocco-piede">' +
        '<button type="button" class="btn-primary" data-om-azione="segna-ordinate"' + (totSel && macOfPronto ? '' : ' disabled') + '>&#9745;&#65039; Segna come ordinate' +
            (totSel ? ' (' + totSel + ')' : '') + '</button>' +
        '<small>Se ne ordini meno di quelle richieste vanno a chi ha ordinato per primo; se ne scrivi di pi&ugrave;, le altre arrivano libere per il magazzino.</small>' +
    '</div></div>';
    return html;
}

// ---------- Ordini fatti (blocchi con data e iniziali) ----------
function omHtmlOrdiniFatti(marchio, sezioneId) {
    const mostraArrivati = document.getElementById('om-mostra-arrivati') && document.getElementById('om-mostra-arrivati').checked;
    const tutti = macOrdiniFornitore.filter(of => of.marchio === marchio && (of.sezione_id || null) === (sezioneId || null))
        .sort((a, b) => (String(b.data) + String(b.id).padStart(9, '0')).localeCompare(String(a.data) + String(a.id).padStart(9, '0')));
    const visibili = tutti.filter(of => mostraArrivati || !omOfArrivato(of));
    const nascosti = tutti.length - visibili.length;
    let html = '<div class="om-fatti-titolo">Ordini fatti' + (nascosti ? ' <small>(' + nascosti + ' gi&agrave; arrivati nascosti)</small>' : '') + '</div>';
    if (visibili.length === 0) {
        html += '<p class="mac-aiuto">' + (sezioneId ? 'Nessun ordine in questa sezione: usa <strong>Nuovo ordine</strong>.' : 'Nessun ordine in corso.') + '</p>';
        return html;
    }
    visibili.forEach(of => { html += omHtmlOf(of); });
    return html;
}

function omHtmlOf(of) {
    const pezzi = omPezziOf(of);
    const gruppi = omPerArticolo(pezzi);
    const arrivato = omOfArrivato(of);
    let html = '<div class="om-blocco' + (arrivato ? ' om-blocco-arrivato' : '') + '">';
    if (gruppi.length === 0) html += '<p class="mac-aiuto">Nessuna riga.</p>';
    gruppi.forEach(g => {
        const a = g.art;
        const arrivate = g.pezzi.filter(omArrivato);
        const attesa = g.pezzi.filter(p => !omArrivato(p));
        const conCliente = g.pezzi.filter(p => p.cliente);
        const libere = attesa.filter(p => !p.cliente).length;
        const tutto = arrivate.length === g.pezzi.length;
        const quadro = tutto ? '<span class="mac-quadro om-quadro-ok">&#10003;</span>' : '<span class="mac-quadro st-ordinata"></span>';
        html += '<button type="button" class="om-riga om-riga-of" data-om-riga="' + of.id + '|' + (a ? a.id : 0) + '">' +
            '<span class="om-riga-check">' + quadro + '</span>' +
            '<span class="om-riga-testo"><strong class="om-qta">' + g.pezzi.length + '</strong> ' +
                omDescrizioneHtml(a) +
                (arrivate.length && !tutto ? ' <span class="om-arrivate">(arrivat' + (arrivate.length === 1 ? 'a 1' : 'e ' + arrivate.length) + ' su ' + g.pezzi.length + ')</span>' : '') +
                ((conCliente.length || libere) ? '<span class="om-clienti">' + omClienteTesto(conCliente) +
                    (libere ? (conCliente.length ? ' &middot; ' : '') + '<em>' + libere + ' in arrivo ' + (libere === 1 ? 'libera' : 'libere') + '</em>' : '') + '</span>' : '') +
            '</span>' +
        '</button>';
    });
    html += '<div class="om-firma"><span class="om-firma-data">' + macDataCorta(of.data) + ' ' + macEsc(of.operatore || '') + '</span>' +
        (of.consegna ? ' <span class="om-consegna">&#128666; ' + macEsc(of.consegna) + '</span>' : '') +
        (of.note ? ' <span class="om-of-note">' + macEsc(of.note) + '</span>' : '') +
        '<button type="button" class="mac-link om-of-modifica" data-om-of="' + of.id + '">&#9997;&#65039; modifica</button></div>';
    html += '</div>';
    return html;
}

// ========================================
// SEGNA COME ORDINATE (righe spuntate)
// ========================================
function omPezziSelezionati(marchio) {
    const scelti = [];
    Object.keys(omSelezione).forEach(id => {
        const lista = omDaOrdinare(marchio).filter(p => p.articolo_id === Number(id)).sort(omConfrontaDaOrd);
        lista.slice(0, omSelezione[id]).forEach(p => scelti.push(p));
    });
    return scelti;
}

function omApriSegna() {
    const marchio = omSessione('omMarchio');
    const pezzi = omPezziSelezionati(marchio);
    if (!pezzi.length) return;
    omOfInModifica = null;
    omOfRighe = [];
    omApriFinestraOf('segna', marchio, pezzi);
}

// ========================================
// FINESTRA ORDINE AL FORNITORE
//   modo 'segna'    : righe da ordinare dei clienti -> ordinate (si sceglie la sezione)
//   modo 'nuovo'    : nuovo ordine in una sezione, righe senza cliente
//   modo 'modifica' : data, iniziali, consegna, note di un ordine fatto (+ righe senza cliente in piu')
// ========================================
let omFinestraModo = null;
let omFinestraPezzi = [];

function omApriFinestraOf(modo, marchio, pezzi) {
    omFinestraModo = modo;
    omFinestraPezzi = pezzi || [];
    const of = omOfInModifica;
    const sezioneCorrente = omSessione('omSezione');
    const sezioni = omSezioniMarchio(marchio).filter(s => !s.chiusa || (of && s.id === of.sezione_id));
    document.getElementById('om-of-titolo').innerHTML = modo === 'segna' ? '&#9745;&#65039; Segna come ordinate - ' + macEsc(marchio)
        : modo === 'nuovo' ? '&#10133; Nuovo ordine - ' + macEsc(marchio) : '&#9997;&#65039; Ordine del ' + macDataCorta(of.data) + ' - ' + macEsc(marchio);
    document.getElementById('om-of-data').value = of ? String(of.data).slice(0, 10) : omOggiISO();
    document.getElementById('om-of-operatore').value = of ? (of.operatore || '') : macIniziali();
    document.getElementById('om-of-consegna').value = of ? (of.consegna || '') : '';
    document.getElementById('om-of-note').value = of ? (of.note || '') : '';
    const sel = document.getElementById('om-of-sezione');
    let scelta = of ? (of.sezione_id || OM_NORMALE) : (modo === 'nuovo' ? sezioneCorrente : OM_NORMALE);
    sel.innerHTML = '<option value="' + OM_NORMALE + '">ORDINI NORMALE</option>' +
        sezioni.map(s => '<option value="' + s.id + '">' + macEsc(s.nome) + '</option>').join('');
    sel.value = String(scelta);
    if (!sel.value) sel.value = OM_NORMALE;
    sel.disabled = modo === 'nuovo';

    // Riepilogo delle macchine (modo segna)
    const riep = document.getElementById('om-of-riepilogo');
    if (modo === 'segna') {
        const extra = omExtraSelezione(marchio);
        riep.innerHTML = '<strong>Vengono ordinate:</strong><ul>' + omPerArticolo(omFinestraPezzi).map(g => {
            const x = g.art ? extra.find(e => e.art.id === g.art.id) : null;
            return '<li><strong>' + (g.pezzi.length + (x ? x.n : 0)) + '</strong> ' + macEsc(g.art ? macNome(g.art) : '-') +
                (g.art && g.art.codice_articolo ? ' <small>(' + macEsc(g.art.codice_articolo) + ')</small>' : '') + ' &mdash; ' + omClienteTesto(g.pezzi.slice().sort(macConfrontaAttesa)) +
                (x ? ' &middot; <em>' + x.n + ' per il magazzino (in arrivo ' + (x.n === 1 ? 'libera' : 'libere') + ')</em>' : '') + '</li>';
        }).join('') + '</ul>';
        riep.classList.remove('hidden');
    } else {
        riep.innerHTML = '';
        riep.classList.add('hidden');
    }
    // Righe senza cliente (macchine per il magazzino, in arrivo libere): in ogni modo
    document.getElementById('om-of-righe-box').classList.remove('hidden');
    document.getElementById('om-of-righe-titolo').innerHTML = modo === 'nuovo' ? 'Righe dell\'ordine (macchine in arrivo libere)'
        : 'Aggiungi altri modelli per il magazzino <small>(in arrivo liberi)</small>';
    document.getElementById('om-of-art-search').value = '';
    omRenderOfRighe();
    document.getElementById('om-of-elimina').classList.toggle('hidden', modo !== 'modifica');
    document.getElementById('om-of-salva').disabled = false;
    document.getElementById('om-of-modal').classList.remove('hidden');
}

function omChiudiFinestraOf() {
    document.getElementById('om-of-modal').classList.add('hidden');
    macPickerChiudi('om-of-art-search');
    omOfInModifica = null;
    omOfRighe = [];
    omFinestraPezzi = [];
}

function omRenderOfRighe() {
    const box = document.getElementById('om-of-righe');
    if (!box) return;
    if (omOfRighe.length === 0) {
        box.innerHTML = '<p class="mac-aiuto">Cerca qui sotto i modelli da ordinare.</p>';
        return;
    }
    box.innerHTML = omOfRighe.map((r, i) =>
        '<div class="mac-set-riga">' +
            '<input type="number" class="mac-set-qta" min="1" max="' + MAC_MAX_QTA + '" value="' + r.n + '" data-om-of-qta="' + i + '" inputmode="numeric">' +
            '<span class="mac-set-riga-nome">' + macNomeHtml(r.art) + (macIsSet(r.art.id) ? ' <small>(set: ' + macEsc(macDescrizioneComponenti(r.art.id)) + ')</small>' : '') + '</span>' +
            '<button type="button" class="mac-set-togli" data-om-of-togli="' + i + '" title="Togli">&times;</button>' +
        '</div>'
    ).join('');
}

function omOfAggiungiArticolo(a) {
    document.getElementById('om-of-art-search').value = '';
    const r = omOfRighe.find(x => x.art.id === a.id);
    if (r) r.n++;
    else omOfRighe.push({ art: a, n: 1 });
    omRenderOfRighe();
}

async function omSalvaFinestraOf() {
    const marchio = omSessione('omMarchio');
    const data = document.getElementById('om-of-data').value;
    const operatore = listinoPulisciTesto(document.getElementById('om-of-operatore').value);
    const consegna = listinoPulisciTesto(document.getElementById('om-of-consegna').value);
    const note = listinoPulisciTesto(document.getElementById('om-of-note').value);
    const selSez = document.getElementById('om-of-sezione').value;
    const sezioneId = selSez && selSez !== OM_NORMALE ? Number(selSez) : null;
    const errori = [];
    if (!data) errori.push('Scegli la data dell\'ordine');
    if (!operatore) errori.push('Scrivi le iniziali di chi ha fatto l\'ordine');
    if (omFinestraModo === 'nuovo' && omOfRighe.length === 0) errori.push('Aggiungi almeno una riga');
    if (errori.length) { await showCustomAlert(errori.join('<br>'), 'Controlla', '&#9888;&#65039;'); return; }

    const btn = document.getElementById('om-of-salva');
    btn.disabled = true;
    const adesso = new Date().toISOString();
    const utente = macUtente();
    try {
        if (omFinestraModo === 'segna') {
            // ricontrollo: devono essere ancora da ordinare
            const ancora = omFinestraPezzi.filter(p => p.stato === 'DA_ORDINARE');
            // macchine in piu' (quante > richieste) + altri modelli aggiunti: stesse righe libere dell'ordine
            const libere = omExtraSelezione(marchio);
            omOfRighe.forEach(r => {
                const x = libere.find(e => e.art.id === r.art.id);
                if (x) x.n += r.n; else libere.push({ art: r.art, n: r.n });
            });
            let of = null;
            if (ancora.length) {
                const creati = await macSegnaOrdinate(ancora, { data: data, operatore: operatore, sezione_id: sezioneId, consegna: consegna, note: note });
                of = creati.find(o => o.marchio === marchio) || creati[0] || null;
            }
            if (libere.length) {
                if (!of) of = await omCreaOf(marchio, sezioneId, data, operatore, consegna, note);
                await omAggiungiRigheLibere(of, libere);
            }
            omSelezione = {};
        } else {
            let of = omOfInModifica;
            if (!of) {
                of = await omCreaOf(marchio, sezioneId, data, operatore, consegna, note);
            } else {
                const agg = { data: data, operatore: operatore, consegna: consegna, note: note, sezione_id: sezioneId, updated_at: adesso, updated_by: utente };
                const { error } = await supabaseClient.from('macchine_of_ordini').update(agg).eq('id', of.id);
                if (error) throw error;
                Object.assign(of, agg);
            }
            await omAggiungiRigheLibere(of, omOfRighe);
        }
    } catch (error) {
        console.error('Errore ordine fornitore:', error);
        btn.disabled = false;
        await showCustomAlert('Errore:<br>' + macEsc(error.message), 'Errore', '&#10060;');
        await omRicarica();
        return;
    }
    omChiudiFinestraOf();
    await omRicarica();
}

// ========================================
// RIGHE DA ORDINARE PER IL MAGAZZINO (senza cliente)
// ========================================
let omDaoRighe = [];

function omApriDao() {
    omDaoRighe = [];
    document.getElementById('om-dao-titolo').innerHTML = '&#10133; Da ordinare per il magazzino - ' + macEsc(omSessione('omMarchio') || '');
    document.getElementById('om-dao-search').value = '';
    omRenderDao();
    document.getElementById('om-dao-modal').classList.remove('hidden');
    setTimeout(() => document.getElementById('om-dao-search').focus(), 50);
}

function omChiudiDao() {
    document.getElementById('om-dao-modal').classList.add('hidden');
    macPickerChiudi('om-dao-search');
    omDaoRighe = [];
}

function omRenderDao() {
    const box = document.getElementById('om-dao-righe');
    if (!omDaoRighe.length) {
        box.innerHTML = '<p class="mac-aiuto">Cerca qui sotto il modello: si aggiunge alle righe <strong>Da ordinare</strong> e lo ordini insieme alle altre.</p>';
        return;
    }
    box.innerHTML = omDaoRighe.map((r, i) =>
        '<div class="mac-set-riga">' +
            '<input type="number" class="mac-set-qta" min="1" max="' + MAC_MAX_QTA + '" value="' + r.n + '" data-om-dao-qta="' + i + '" inputmode="numeric">' +
            '<span class="mac-set-riga-nome">' + macNomeHtml(r.art) + '</span>' +
            '<button type="button" class="mac-set-togli" data-om-dao-x="' + i + '" title="Togli">&times;</button>' +
        '</div>').join('');
}

function omDaoAggiungi(a) {
    document.getElementById('om-dao-search').value = '';
    const r = omDaoRighe.find(x => x.art.id === a.id);
    if (r) r.n++; else omDaoRighe.push({ art: a, n: 1 });
    omRenderDao();
}

async function omSalvaDao() {
    if (!omDaoRighe.length) { await showCustomAlert('Cerca e aggiungi almeno un modello.', 'Da ordinare', '&#9888;&#65039;'); return; }
    const btn = document.getElementById('om-dao-salva');
    btn.disabled = true;
    const adesso = new Date().toISOString();
    const utente = macUtente();
    const nuovi = [];
    omDaoRighe.forEach(r => {
        const elenco = macIsSet(r.art.id)
            ? macComponenti(r.art.id).map(c => ({ art: macArticolo(c.componente_id), n: c.quantita * r.n })).filter(x => x.art)
            : [{ art: r.art, n: r.n }];
        elenco.forEach(x => {
            for (let k = 0; k < x.n; k++) nuovi.push({ articolo_id: x.art.id, stato: 'DA_ORDINARE', cliente: null, updated_at: adesso, updated_by: utente });
        });
    });
    try {
        const { data, error } = await supabaseClient.from('macchine_pezzi').insert(nuovi).select('*');
        if (error) throw error;
        await macRegistra((data || []).map(p => ({
            pezzo_id: p.id, articolo_id: p.articolo_id, tipo: 'ORDINE', stato_prima: null, stato_dopo: 'DA_ORDINARE',
            cliente: null, matricola: null, netto: null, dettaglio: 'DA ORDINARE PER IL MAGAZZINO'
        })));
    } catch (error) {
        console.error('Errore righe da ordinare:', error);
        btn.disabled = false;
        await showCustomAlert('Errore:<br>' + macEsc(error.message), 'Errore', '&#10060;');
        return;
    }
    btn.disabled = false;
    omChiudiDao();
    await omRicarica();
}

// Togli le righe per il magazzino (ancora da ordinare) di un modello
async function omTogliDao(articoloId) {
    const pezzi = omDaOrdinare(omSessione('omMarchio')).filter(p => p.articolo_id === articoloId && !p.cliente);
    const a = macArticolo(articoloId);
    if (!pezzi.length) return;
    if (!window.confirm('Togliere ' + pezzi.length + ' ' + (a ? macNome(a) : '') + ' da ordinare per il magazzino?\n\nI clienti non vengono toccati.')) return;
    try {
        const { error } = await supabaseClient.from('macchine_pezzi').delete().in('id', pezzi.map(p => p.id));
        if (error) throw error;
        await macRegistra(pezzi.map(p => ({
            pezzo_id: p.id, articolo_id: p.articolo_id, tipo: 'CANCELLATA', stato_prima: 'DA_ORDINARE', stato_dopo: null,
            cliente: null, matricola: null, netto: null, dettaglio: 'TOLTA DA ORDINARE PER IL MAGAZZINO'
        })));
    } catch (error) {
        console.error('Errore togli righe magazzino:', error);
        await showCustomAlert('Errore:<br>' + macEsc(error.message), 'Errore', '&#10060;');
    }
    delete omSelezione[articoloId];
    await omRicarica();
}

// Macchine in piu' scritte in "quante" (oltre quelle richieste dai clienti): [{ art, n }]
function omExtraSelezione(marchio) {
    const out = [];
    Object.keys(omSelezione).forEach(id => {
        const richieste = omDaOrdinare(marchio).filter(p => p.articolo_id === Number(id)).length;
        const extra = omSelezione[id] - richieste;
        const a = macArticolo(Number(id));
        if (a && extra > 0) out.push({ art: a, n: extra });
    });
    return out;
}

async function omCreaOf(marchio, sezioneId, data, operatore, consegna, note) {
    const utente = macUtente();
    const { data: nuovo, error } = await supabaseClient.from('macchine_of_ordini').insert([{
        marchio: marchio, sezione_id: sezioneId || null, data: data, operatore: operatore, consegna: consegna || null, note: note || null,
        created_by: utente, updated_by: utente
    }]).select('*').single();
    if (error) throw error;
    macOrdiniFornitore.push(nuovo);
    return nuovo;
}

// Righe senza cliente in un ordine al fornitore: macchine ORDINATE libere (un set = i suoi componenti)
async function omAggiungiRigheLibere(of, righe) {
    if (!righe.length) return;
    const adesso = new Date().toISOString();
    const utente = macUtente();
    const nuovi = [];
    righe.forEach(r => {
        const elenco = macIsSet(r.art.id)
            ? macComponenti(r.art.id).map(c => ({ art: macArticolo(c.componente_id), n: c.quantita * r.n })).filter(x => x.art)
            : [{ art: r.art, n: r.n }];
        elenco.forEach(x => {
            for (let k = 0; k < x.n; k++) {
                nuovi.push({ articolo_id: x.art.id, stato: 'ORDINATA', cliente: null, ordine_fornitore_id: of.id, updated_at: adesso, updated_by: utente });
            }
        });
    });
    if (!nuovi.length) return;
    const { data, error } = await supabaseClient.from('macchine_pezzi').insert(nuovi).select('*');
    if (error) throw error;
    const sez = macOfSezione(of.sezione_id);
    await macRegistra((data || []).map(p => ({
        pezzo_id: p.id, articolo_id: p.articolo_id, tipo: 'ORDINE', stato_prima: null, stato_dopo: 'ORDINATA',
        cliente: null, matricola: null, netto: null,
        dettaglio: 'ORDINE FORNITORE ' + macDataCorta(of.data) + ' ' + of.operatore + (sez ? ' - ' + sez.nome : '') +
            (of.consegna ? ' - ' + of.consegna : '') + ' - IN ARRIVO LIBERA'
    })));
}

// Elimina un ordine al fornitore: i clienti tornano DA ORDINARE, le righe libere si tolgono.
// Le macchine gia' arrivate restano come sono (perdono solo il collegamento all'ordine).
async function omEliminaOf() {
    const of = omOfInModifica;
    if (!of) return;
    const pezzi = omPezziOf(of);
    const attesa = pezzi.filter(p => p.stato === 'ORDINATA');
    const clienti = attesa.filter(p => p.cliente).length;
    const libere = attesa.length - clienti;
    const arrivate = pezzi.length - attesa.length;
    if (!window.confirm('Eliminare l\'ordine del ' + macDataCorta(of.data) + ' ' + of.operatore + '?\n\n' +
        (clienti ? '- ' + clienti + ' macchine dei clienti tornano DA ORDINARE\n' : '') +
        (libere ? '- ' + libere + ' righe in arrivo libere vengono tolte\n' : '') +
        (arrivate ? '- ' + arrivate + ' macchine gia\' arrivate restano come sono\n' : '') +
        '\nL\'operazione non si pu\u00f2 annullare.')) return;
    try {
        await macRiportaDaOrdinare(attesa, 'ORDINE FORNITORE ELIMINATO', false);
        const { error } = await supabaseClient.from('macchine_of_ordini').delete().eq('id', of.id);
        if (error) throw error;
    } catch (error) {
        console.error('Errore eliminazione ordine fornitore:', error);
        await showCustomAlert('Errore:<br>' + macEsc(error.message), 'Errore', '&#10060;');
        await omRicarica();
        return;
    }
    omChiudiFinestraOf();
    await omRicarica();
}

// ========================================
// FINESTRA RIGA (macchine di un articolo dentro un ordine fatto)
// ========================================
function omApriRiga(ofId, articoloId) {
    const of = macOf(ofId);
    if (!of) return;
    omRigaAperta = { ofId: ofId, articoloId: articoloId };
    const a = macArticolo(articoloId);
    const pezzi = omPezziOf(of).filter(p => p.articolo_id === articoloId).sort(macConfrontaAttesa);
    document.getElementById('om-riga-titolo').innerHTML = macEsc(a ? macNome(a) : 'Riga');
    const sez = macOfSezione(of.sezione_id);
    document.getElementById('om-riga-info').innerHTML = 'Ordine del <strong>' + macDataCorta(of.data) + ' ' + macEsc(of.operatore || '') + '</strong>' +
        (sez ? ' &middot; ' + macEsc(sez.nome) : '') + (of.consegna ? ' &middot; ' + macEsc(of.consegna) : '');
    document.getElementById('om-riga-corpo').innerHTML = pezzi.map(p => {
        const st = MAC_STATI[p.stato];
        const inAttesa = p.stato === 'ORDINATA';
        const num = omOrdineCliente(p);
        return '<label class="om-riga-pezzo' + (inAttesa ? '' : ' om-riga-pezzo-arrivato') + '">' +
            (inAttesa ? '<input type="checkbox" data-om-pezzo="' + p.id + '">' : '<span class="om-spazio"></span>') +
            '<span class="mac-quadro mac-quadro-mini ' + st.classe + '">' + (p.stato === 'CONSEGNATA' ? '&#10005;' : '') + '</span>' +
            '<span>' + (p.cliente ? '<strong>' + macEsc(p.cliente) + '</strong>' + (num ? ' <small>ord. ' + num + '</small>' : '') : '<em>in arrivo libera</em>') +
                ' &middot; ' + macEsc(st.etichetta) + (p.matricola ? ' <small>matr. ' + macEsc(p.matricola) + '</small>' : '') + '</span>' +
        '</label>';
    }).join('') || '<p class="mac-aiuto">Nessuna macchina.</p>';
    document.getElementById('om-riga-piu').value = '1';
    document.getElementById('om-riga-piu-box').classList.toggle('hidden', !a || !macOfPronto);
    document.getElementById('om-riga-tieni').checked = true;
    document.getElementById('om-riga-tieni-box').classList.toggle('hidden', !pezzi.some(p => p.cliente && p.stato === 'ORDINATA'));
    document.getElementById('om-riga-aiuto').innerHTML =
        'Spunta e premi il pulsante: le macchine <strong>con cliente</strong> tornano <strong>da ordinare</strong> (es. il cliente non pu&ograve; aspettare la consegna e va fatto un altro ordine), ' +
        'quelle <strong>in arrivo libere</strong> vengono tolte dall\'ordine.';
    document.getElementById('om-riga-modal').classList.remove('hidden');
}

function omChiudiRiga() {
    document.getElementById('om-riga-modal').classList.add('hidden');
    omRigaAperta = null;
}

// "Aggiungi N in arrivo libere" a questa riga (es. 2 per i clienti + 1 per il magazzino)
async function omRigaAggiungi() {
    if (!omRigaAperta) return;
    const of = macOf(omRigaAperta.ofId);
    const a = macArticolo(omRigaAperta.articoloId);
    const n = parseInt(document.getElementById('om-riga-piu').value, 10);
    if (!of || !a) return;
    if (!(n >= 1 && n <= MAC_MAX_QTA)) { await showCustomAlert('Scrivi quante macchine aggiungere (da 1 a ' + MAC_MAX_QTA + ')', 'Riga', '&#9888;&#65039;'); return; }
    if (!window.confirm('Aggiungere ' + n + ' ' + macNome(a) + ' a questo ordine?\n\nArrivano libere (per il magazzino): se nel frattempo un cliente ordina questo modello, la prende lui.')) return;
    try {
        await omAggiungiRigheLibere(of, [{ art: a, n: n }]);
    } catch (error) {
        console.error('Errore aggiunta righe libere:', error);
        await showCustomAlert('Errore:<br>' + macEsc(error.message), 'Errore', '&#10060;');
    }
    omChiudiRiga();
    await omRicarica();
}

async function omRigaRiporta() {
    const ids = Array.from(document.querySelectorAll('#om-riga-corpo [data-om-pezzo]:checked')).map(el => parseInt(el.dataset.omPezzo, 10));
    const pezzi = macPezzi.filter(p => ids.indexOf(p.id) !== -1 && p.stato === 'ORDINATA');
    if (!pezzi.length) { await showCustomAlert('Spunta almeno una macchina.', 'Riga', '&#8505;&#65039;'); return; }
    const conCliente = pezzi.filter(p => p.cliente).length;
    const libere = pezzi.length - conCliente;
    const tieniTesto = document.getElementById('om-riga-tieni').checked
        ? '(restano ordinate al fornitore senza cliente: arriveranno libere)\n' : '(non restano ordinate al fornitore)\n';
    if (!window.confirm((conCliente ? conCliente + ' macchin' + (conCliente === 1 ? 'a torna' : 'e tornano') + ' DA ORDINARE\n' + tieniTesto : '') +
        (libere ? libere + ' riga' + (libere === 1 ? '' : 'he') + ' in arrivo liber' + (libere === 1 ? 'a viene tolta' : 'e vengono tolte') + '\n' : '') + '\nConfermi?')) return;
    const tieni = document.getElementById('om-riga-tieni').checked;
    try {
        await macRiportaDaOrdinare(pezzi, 'DAL LIBRO ORDINI', tieni);
    } catch (error) {
        console.error('Errore riporta da ordinare:', error);
        await showCustomAlert('Errore:<br>' + macEsc(error.message), 'Errore', '&#10060;');
    }
    omChiudiRiga();
    await omRicarica();
}

// ========================================
// SEZIONI (prestagionali)
// ========================================
function omApriSezione(sezione) {
    omSezioneInModifica = sezione || null;
    document.getElementById('om-sez-titolo').innerHTML = sezione ? '&#9997;&#65039; Sezione ' + macEsc(sezione.nome) : '&#10133; Nuova sezione - ' + macEsc(omSessione('omMarchio') || '');
    document.getElementById('om-sez-nome').value = sezione ? sezione.nome : '';
    document.getElementById('om-sez-note').value = sezione ? (sezione.note || '') : '';
    document.getElementById('om-sez-chiusa').checked = !!(sezione && sezione.chiusa);
    document.getElementById('om-sez-chiusa-box').classList.toggle('hidden', !sezione);
    document.getElementById('om-sez-elimina').classList.toggle('hidden', !sezione);
    document.getElementById('om-sez-modal').classList.remove('hidden');
    setTimeout(() => document.getElementById('om-sez-nome').focus(), 50);
}

function omChiudiSezione() {
    document.getElementById('om-sez-modal').classList.add('hidden');
    omSezioneInModifica = null;
}

async function omSalvaSezione() {
    const marchio = omSessione('omMarchio');
    const nome = listinoPulisciTesto(document.getElementById('om-sez-nome').value);
    const note = listinoPulisciTesto(document.getElementById('om-sez-note').value);
    const chiusa = document.getElementById('om-sez-chiusa').checked;
    if (!nome) { await showCustomAlert('Scrivi il nome della sezione (es. OPG, TRATTORINI 2026)', 'Sezione', '&#9888;&#65039;'); return; }
    if (nome === 'ORDINI NORMALE' || omSezioniMarchio(marchio).some(s => s.nome === nome && (!omSezioneInModifica || s.id !== omSezioneInModifica.id))) {
        await showCustomAlert('C\'&egrave; gi&agrave; una sezione con questo nome in ' + macEsc(marchio), 'Sezione', '&#9888;&#65039;');
        return;
    }
    const utente = macUtente();
    try {
        if (omSezioneInModifica) {
            const { error } = await supabaseClient.from('macchine_of_sezioni').update({ nome: nome, note: note, chiusa: chiusa }).eq('id', omSezioneInModifica.id);
            if (error) throw error;
        } else {
            const { data, error } = await supabaseClient.from('macchine_of_sezioni').insert([{ marchio: marchio, nome: nome, note: note, created_by: utente }]).select('*').single();
            if (error) throw error;
            omSessione('omSezione', String(data.id));
        }
    } catch (error) {
        console.error('Errore sezione:', error);
        await showCustomAlert('Errore:<br>' + macEsc(error.message), 'Errore', '&#10060;');
        return;
    }
    omChiudiSezione();
    await omRicarica();
}

async function omEliminaSezione() {
    const s = omSezioneInModifica;
    if (!s) return;
    if (macOrdiniFornitore.some(of => of.sezione_id === s.id)) {
        await showCustomAlert('La sezione <strong>' + macEsc(s.nome) + '</strong> contiene degli ordini: eliminali prima, oppure spunta <strong>Sezione chiusa</strong> per metterla in fondo.', 'Sezione', '&#9888;&#65039;');
        return;
    }
    if (!window.confirm('Eliminare la sezione ' + s.nome + '?')) return;
    const { error } = await supabaseClient.from('macchine_of_sezioni').delete().eq('id', s.id);
    if (error) { await showCustomAlert('Errore:<br>' + macEsc(error.message), 'Errore', '&#10060;'); return; }
    omSessione('omSezione', OM_NORMALE);
    omChiudiSezione();
    await omRicarica();
}

// ========================================
// VAI AL MARCHIO (anche senza ordini, per creare un prestagionale)
// ========================================
function omPopolaVaiMarchio() {
    const sel = document.getElementById('om-vai-marchio');
    if (!sel) return;
    const marchi = [...new Set(listinoArticoli.filter(a => a.attivo && a.marchio).map(a => a.marchio))].sort(listinoConfronta);
    sel.innerHTML = '<option value="">&#128269; Vai al marchio...</option>' + marchi.map(m => '<option value="' + macEsc(m) + '">' + macEsc(m) + '</option>').join('');
}

function omScegliMarchio(m) {
    if (!m) return;
    if (m !== omSessione('omMarchio')) {
        omSessione('omMarchio', m);
        omSessione('omSezione', OM_NORMALE);
        omSelezione = {};
    }
    omRender();
    const pagina = document.getElementById('om-pagina');
    if (pagina && window.innerWidth < 768) pagina.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ========================================
// SEZIONI: CARICA EXCEL (file del fornitore con le quantita' per mese di consegna)
// ----------------------------------------
// Es. STIHL OPM: foglio "OPM", riga dei titoli con "Codice" e "Descrizione Prod.", qualche riga sopra
// i mesi (Jul-26, Aug-26, Sep-26...) sulle colonne delle quantita'. Le colonne dei valori in euro
// (stessi mesi ma importi) vengono scartate da sole.
// Per ogni mese con almeno una quantita': un ordine nella sezione, data = oggi, iniziali di chi carica,
// consegna = "CONSEGNA SETTEMBRE 2026", righe = macchine in arrivo libere.
// Modello: riconosciuto dal codice articolo del Listino Agrimacch, poi da Listini Fornitori (articoli collegati).
// Se non lo trova si sceglie dalla tendina (e il codice viene scritto nell'articolo, se non ne ha uno).
// ========================================
const OM_MESI = ['GENNAIO', 'FEBBRAIO', 'MARZO', 'APRILE', 'MAGGIO', 'GIUGNO', 'LUGLIO', 'AGOSTO', 'SETTEMBRE', 'OTTOBRE', 'NOVEMBRE', 'DICEMBRE'];
function omXlsData(v) {
    return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime());
}

const OM_MESI_BREVI = {
    GEN: 0, JAN: 0, FEB: 1, MAR: 2, APR: 3, MAG: 4, MAY: 4, GIU: 5, JUN: 5, LUG: 6, JUL: 6, AGO: 7, AUG: 7,
    SET: 8, SEP: 8, OTT: 9, OCT: 9, NOV: 10, DIC: 11, DEC: 11
};

let omXlsWb = null;
let omXlsFile = '';
let omXlsPiano = null;

function omXlsCella(ws, r, c) {
    return ws[XLSX.utils.encode_cell({ r: r, c: c })] || null;
}

function omXlsTesto(ws, r, c) {
    const cell = omXlsCella(ws, r, c);
    if (!cell || cell.v === null || cell.v === undefined) return '';
    if (omXlsData(cell.v)) return cell.w || '';
    return String(cell.w !== undefined && typeof cell.v !== 'string' ? cell.w : cell.v).replace(/\s+/g, ' ').trim();
}

function omXlsNorm(t) {
    return String(t || '').toUpperCase().replace(/[.()]/g, ' ').replace(/\s+/g, ' ').trim();
}

function omCodiceNorm(c) {
    return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Mese di una cella: data (Jul-26) o testo (LUGLIO, SETTEMBRE 2026, SEP-26) -> { m: 0..11, anno }
function omXlsMese(cell) {
    if (!cell || cell.v === null || cell.v === undefined || cell.v === '') return null;
    if (omXlsData(cell.v)) {
        const d = new Date(cell.v.getTime() + 12 * 3600 * 1000);   // il file e' in ora italiana: mezzanotte del 1 = 22:00 del giorno prima
        return { m: d.getUTCMonth(), anno: d.getUTCFullYear() };
    }
    if (typeof cell.v !== 'string') return null;
    const t = omXlsNorm(cell.v);
    const annoM = t.match(/(20\d\d)|[-\/ ]'?(\d\d)$/);
    const anno = annoM ? (annoM[1] ? Number(annoM[1]) : 2000 + Number(annoM[2])) : null;
    for (let i = 0; i < 12; i++) if (t.indexOf(OM_MESI[i]) === 0) return { m: i, anno: anno };
    const b = t.match(/^([A-Z]{3})(?:[A-Z]*)?[\s\-\/']*\d{0,4}$/);
    if (b && b[1] in OM_MESI_BREVI) return { m: OM_MESI_BREVI[b[1]], anno: anno };
    return null;
}

function omXlsMeseTesto(x) {
    return OM_MESI[x.m] + (x.anno ? ' ' + x.anno : '');
}

function omXlsRange(ws) {
    return ws && ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : null;
}

function omXlsNascosto(wb, nome) {
    try {
        const s = ((wb.Workbook && wb.Workbook.Sheets) || []).find(x => x.name === nome);
        return !!(s && s.Hidden);
    } catch (e) { return false; }
}

// Riga dei titoli: quella con "CODICE" e almeno una colonna di mesi sopra (o nella stessa riga)
function omXlsTrovaTitoli(ws) {
    const rg = omXlsRange(ws);
    if (!rg) return -1;
    for (let r = rg.s.r; r <= Math.min(rg.e.r, rg.s.r + 100); r++) {
        let codice = false;
        for (let c = rg.s.c; c <= Math.min(rg.e.c, 80); c++) {
            const h = omXlsNorm(omXlsTesto(ws, r, c));
            if (h === 'CODICE' || h === 'CODICE ARTICOLO' || h === 'COD ARTICOLO' || h === 'MATERIAL' || h === 'ARTICOLO') { codice = true; break; }
        }
        if (codice && omXlsColonneMesi(ws, r).length) return r;
    }
    return -1;
}

// Colonne con un mese nelle 6 righe sopra i titoli (o nei titoli) e quantita' (non importi in euro) sotto
function omXlsColonneMesi(ws, rTitoli) {
    const rg = omXlsRange(ws);
    if (!rg) return [];
    const out = [];
    for (let c = rg.s.c; c <= rg.e.c; c++) {
        let mese = null, rMese = -1;
        for (let r = rTitoli; r >= Math.max(rg.s.r, rTitoli - 6); r--) {
            const m = omXlsMese(omXlsCella(ws, r, c));
            if (m) { mese = m; rMese = r; break; }
        }
        if (!mese) continue;
        // sotto: niente euro, solo numeri interi (o vuoto / trattino)
        let euro = false, numeri = 0, decimali = 0;
        for (let r = rTitoli + 1; r <= Math.min(rg.e.r, rTitoli + 400); r++) {
            const cell = omXlsCella(ws, r, c);
            if (!cell || cell.v === null || cell.v === '' ) continue;
            if (String(cell.w || '').indexOf('\u20ac') !== -1 || String(cell.z || '').indexOf('\u20ac') !== -1) { euro = true; break; }
            if (typeof cell.v === 'number') {
                numeri++;
                if (Math.abs(cell.v - Math.round(cell.v)) > 0.0001) decimali++;
            }
        }
        if (euro || decimali > 0) continue;
        out.push({ col: c, mese: mese, rMese: rMese, numeri: numeri });
    }
    return out;
}

function omXlsApri() {
    const marchio = omSessione('omMarchio');
    const sez = macOfSezione(Number(omSessione('omSezione')));
    if (!sez || sez.chiusa) return;
    omXlsWb = null;
    omXlsPiano = null;
    omXlsFile = '';
    document.getElementById('om-xls-titolo').innerHTML = '&#128229; Carica Excel - ' + macEsc(marchio) + ' &middot; ' + macEsc(sez.nome);
    document.getElementById('om-xls-file-nome').innerHTML = '';
    document.getElementById('om-xls-impostazioni').classList.add('hidden');
    document.getElementById('om-xls-anteprima').innerHTML = '';
    document.getElementById('om-xls-conferma').classList.add('hidden');
    document.getElementById('om-xls-modal').classList.remove('hidden');
}

function omXlsChiudi() {
    document.getElementById('om-xls-modal').classList.add('hidden');
    omXlsWb = null;
    omXlsPiano = null;
}

function omXlsFileScelto(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    omXlsFile = file.name;
    const box = document.getElementById('om-xls-file-nome');
    box.innerHTML = '&#8987; Lettura del file...';
    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            omXlsWb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array', cellDates: true });
        } catch (err) {
            box.innerHTML = '';
            showCustomAlert('Non riesco a leggere il file:<br>' + macEsc(err.message), 'Errore', '&#10060;');
            return;
        }
        const conTitoli = omXlsWb.SheetNames.filter(n => omXlsTrovaTitoli(omXlsWb.Sheets[n]) !== -1);
        const scelto = conTitoli.find(n => !omXlsNascosto(omXlsWb, n)) || conTitoli[0] || omXlsWb.SheetNames[0];
        const sel = document.getElementById('om-xls-foglio');
        sel.innerHTML = omXlsWb.SheetNames.map(n => '<option value="' + macEsc(n) + '">' + macEsc(n) + (omXlsNascosto(omXlsWb, n) ? ' (nascosto)' : '') + '</option>').join('');
        sel.value = scelto;
        box.innerHTML = '&#128196; <strong>' + macEsc(file.name) + '</strong>';
        document.getElementById('om-xls-impostazioni').classList.remove('hidden');
        omXlsFoglioCambiato();
    };
    reader.readAsArrayBuffer(file);
}

function omXlsFoglioCambiato() {
    const ws = omXlsWb.Sheets[document.getElementById('om-xls-foglio').value];
    const r = omXlsTrovaTitoli(ws);
    document.getElementById('om-xls-riga').value = r === -1 ? '' : String(r + 1);
    omXlsRigaCambiata();
}

function omXlsRigaCambiata() {
    omXlsPiano = null;
    document.getElementById('om-xls-anteprima').innerHTML = '';
    document.getElementById('om-xls-conferma').classList.add('hidden');
    const ws = omXlsWb.Sheets[document.getElementById('om-xls-foglio').value];
    const riga = parseInt(document.getElementById('om-xls-riga').value, 10) - 1;
    const rg = omXlsRange(ws);
    const box = document.getElementById('om-xls-colonne');
    const intest = [];
    if (rg && riga >= 0) {
        for (let c = rg.s.c; c <= rg.e.c; c++) {
            const t = omXlsTesto(ws, riga, c);
            if (t) intest.push({ col: c, testo: t, norm: omXlsNorm(t) });
        }
    }
    if (!intest.length) {
        box.innerHTML = '<p class="mac-aiuto">&#9888;&#65039; Scrivi il numero della riga con i titoli delle colonne (quella con &quot;Codice&quot;).</p>';
        return;
    }
    const campi = [
        { campo: 'codice', titolo: 'Codice articolo *', indovina: h => h === 'CODICE' || h === 'CODICE ARTICOLO' || h === 'COD ARTICOLO' || h === 'MATERIAL' },
        { campo: 'descrizione', titolo: 'Descrizione', indovina: h => h.indexOf('DESCRIZ') === 0 || h === 'DESCRIPTION' }
    ];
    const opz = (scelta) => intest.map(h => '<option value="' + h.col + '"' + (scelta && scelta.col === h.col ? ' selected' : '') + '>' +
        XLSX.utils.encode_col(h.col) + ' &middot; ' + macEsc(h.testo) + '</option>').join('');
    let html = '<div class="om-xls-griglia">' + campi.map(f => {
        const scelta = intest.find(h => f.indovina(h.norm));
        return '<div><label>' + f.titolo + '</label><select data-om-xls="' + f.campo + '"><option value="">- scegli -</option>' + opz(scelta) + '</select></div>';
    }).join('') + '</div>';
    const mesi = omXlsColonneMesi(ws, riga);
    html += '<label>Quantit&agrave; per mese di consegna <small>(colonne trovate: togli la spunta a quelle da non usare)</small></label>';
    html += mesi.length ? '<div class="om-xls-mesi">' + mesi.map(m =>
        '<label class="mac-check"><input type="checkbox" data-om-xls-mese="' + m.col + '" data-mese="' + m.mese.m + '" data-anno="' + (m.mese.anno || '') + '" checked> ' +
            '<strong>' + macEsc(omXlsMeseTesto(m.mese)) + '</strong> <small>(colonna ' + XLSX.utils.encode_col(m.col) + ')</small></label>').join('') + '</div>'
        : '<p class="mac-aiuto">&#9888;&#65039; Non trovo colonne di mesi sopra la riga dei titoli: controlla foglio e riga.</p>';
    box.innerHTML = html;
}

// Articolo del Listino Agrimacch per un codice del fornitore
function omXlsArticoloDaCodice(codice) {
    const n = omCodiceNorm(codice);
    if (!n) return null;
    const diretto = listinoArticoli.find(a => a.attivo && a.codice_articolo && omCodiceNorm(a.codice_articolo) === n);
    if (diretto) return diretto;
    if (typeof lfArticoli !== 'undefined' && Array.isArray(lfArticoli)) {
        const lf = lfArticoli.find(x => x.articolo_id && omCodiceNorm(x.codice) === n);
        if (lf) return listinoArticoli.find(a => a.attivo && a.id === lf.articolo_id) || null;
    }
    return null;
}

async function omXlsAnteprima() {
    if (!omXlsWb) return;
    const ws = omXlsWb.Sheets[document.getElementById('om-xls-foglio').value];
    const riga = parseInt(document.getElementById('om-xls-riga').value, 10) - 1;
    const colCod = document.querySelector('#om-xls-colonne select[data-om-xls="codice"]');
    const colDes = document.querySelector('#om-xls-colonne select[data-om-xls="descrizione"]');
    const mesi = Array.from(document.querySelectorAll('#om-xls-colonne [data-om-xls-mese]:checked')).map(el => ({
        col: parseInt(el.dataset.omXlsMese, 10), m: parseInt(el.dataset.mese, 10), anno: el.dataset.anno ? parseInt(el.dataset.anno, 10) : null
    }));
    if (!(riga >= 0) || !colCod || colCod.value === '' || !mesi.length) {
        await showCustomAlert('Scegli la riga dei titoli, la colonna del codice e almeno un mese.', 'Controlla', '&#9888;&#65039;');
        return;
    }
    // Listini Fornitori: servono per riconoscere i codici degli articoli collegati
    if (typeof lfCaricaDati === 'function' && typeof lfPuoVedere === 'function' && lfPuoVedere() && typeof lfCaricato !== 'undefined' && !lfCaricato) {
        try { await lfCaricaDati(); } catch (e) { console.warn('Listini Fornitori non disponibili:', e.message); }
    }
    const cC = parseInt(colCod.value, 10);
    const cD = colDes && colDes.value !== '' ? parseInt(colDes.value, 10) : null;
    const rg = omXlsRange(ws);
    const righe = [];
    for (let r = riga + 1; r <= rg.e.r; r++) {
        const codice = listinoPulisciTesto(omXlsTesto(ws, r, cC));
        if (!codice || codice === '0' || codice === '-' || omCodiceNorm(codice).length < 3) continue;
        const qta = {};
        let tot = 0;
        mesi.forEach(m => {
            const cell = omXlsCella(ws, r, m.col);
            let v = cell ? cell.v : null;
            if (typeof v === 'string') v = parseFloat(v.replace(',', '.'));
            const n = typeof v === 'number' && isFinite(v) ? Math.round(v) : 0;
            if (n > 0) { qta[m.col] = n; tot += n; }
        });
        if (!tot) continue;
        righe.push({ riga: r + 1, codice: codice, descrizione: cD !== null ? listinoPulisciTesto(omXlsTesto(ws, r, cD)) : '', qta: qta, tot: tot,
            art: omXlsArticoloDaCodice(codice), scelto: null });
    }
    omXlsPiano = { mesi: mesi, righe: righe };
    omXlsRenderAnteprima();
}

function omXlsArticoloRiga(x) {
    return x.art || (x.scelto ? macArticolo(x.scelto) : null);
}

function omXlsRenderAnteprima() {
    const p = omXlsPiano;
    const box = document.getElementById('om-xls-anteprima');
    const conferma = document.getElementById('om-xls-conferma');
    if (!p) { box.innerHTML = ''; conferma.classList.add('hidden'); return; }
    if (!p.righe.length) {
        box.innerHTML = '<p class="mac-aiuto">&#9888;&#65039; Nessuna quantit&agrave; nei mesi scelti.</p>';
        conferma.classList.add('hidden');
        return;
    }
    const marchio = omSessione('omMarchio');
    const sez = macOfSezione(Number(omSessione('omSezione')));
    const gia = macOrdiniFornitore.filter(of => sez && of.sezione_id === sez.id).length;
    const opzioni = listinoOrdina(listinoArticoli.filter(a => a.attivo && a.marchio === marchio))
        .map(a => '<option value="' + a.id + '">' + macEsc(macNome(a)) + '</option>').join('');
    const nonTrovati = p.righe.filter(x => !x.art);
    let html = '';
    if (gia) html += '<p class="om-xls-avviso">&#9888;&#65039; In questa sezione ci sono gi&agrave; ' + gia + ' ordini: il file ne <strong>aggiunge</strong> altri, non sostituisce. ' +
        'Se lo stai ricaricando corretto, elimina prima gli ordini vecchi (&#9997;&#65039; modifica &rarr; Elimina).</p>';
    if (nonTrovati.length) {
        html += '<div class="om-xls-mancano"><strong>&#10067; ' + nonTrovati.length + ' codici non trovati nel Listino Agrimacch</strong> ' +
            '<small>(scegli il modello oppure lascia &quot;salta&quot;; il codice viene scritto nell\'articolo scelto, se non ne ha uno)</small>' +
            nonTrovati.map(x => '<div class="om-xls-manca"><span><strong>' + macEsc(x.codice) + '</strong> ' + macEsc(x.descrizione || '') + ' <small>(' + x.tot + ' pz)</small></span>' +
                '<select data-om-xls-scegli="' + x.riga + '"><option value="">- salta -</option>' + opzioni + '</select></div>').join('') + '</div>';
    }
    p.mesi.forEach(m => {
        const lista = p.righe.filter(x => x.qta[m.col]);
        const pezzi = lista.reduce((t, x) => t + x.qta[m.col], 0);
        html += '<div class="om-xls-mese"><div class="om-xls-mese-titolo">&#128666; ' + macEsc(omXlsMeseTesto(m)) +
            (lista.length ? ' &middot; <strong>' + pezzi + ' pz</strong>' : ' &middot; <em>nessuna consegna</em>') + '</div>' +
            (lista.length ? '<ul>' + lista.map(x => {
                const a = omXlsArticoloRiga(x);
                return '<li' + (a ? '' : ' class="om-xls-saltata"') + '><strong>' + x.qta[m.col] + '</strong> ' +
                    (a ? macEsc(macNome(a)) : macEsc(x.descrizione || '') + ' <em>(salta)</em>') + ' <small>' + macEsc(x.codice) + '</small></li>';
            }).join('') + '</ul>' : '') + '</div>';
    });
    box.innerHTML = html;
    p.righe.forEach(x => {
        const s = box.querySelector('[data-om-xls-scegli="' + x.riga + '"]');
        if (s && x.scelto) s.value = String(x.scelto);
    });
    const ordini = p.mesi.filter(m => p.righe.some(x => x.qta[m.col] && omXlsArticoloRiga(x))).length;
    conferma.innerHTML = '&#10004; Crea ' + ordini + (ordini === 1 ? ' ordine' : ' ordini');
    conferma.disabled = !ordini;
    conferma.classList.remove('hidden');
}

async function omXlsConferma() {
    const p = omXlsPiano;
    if (!p) return;
    const marchio = omSessione('omMarchio');
    const sez = macOfSezione(Number(omSessione('omSezione')));
    if (!sez) return;
    const data = omOggiISO();
    const operatore = macIniziali();
    const perMese = p.mesi.map(m => ({
        m: m,
        righe: p.righe.filter(x => x.qta[m.col] && omXlsArticoloRiga(x)).map(x => ({ art: omXlsArticoloRiga(x), n: x.qta[m.col] }))
    })).filter(x => x.righe.length);
    if (!perMese.length) return;
    const pezzi = perMese.reduce((t, x) => t + x.righe.reduce((s, r) => s + r.n, 0), 0);
    if (!window.confirm('Creare ' + perMese.length + ' ordini in ' + sez.nome + ' (' + pezzi + ' macchine in arrivo libere)?\n\n' +
        perMese.map(x => '- CONSEGNA ' + omXlsMeseTesto(x.m) + ': ' + x.righe.reduce((s, r) => s + r.n, 0) + ' pz').join('\n') +
        '\n\nData ' + macDataCorta(data) + ', iniziali ' + operatore + '.')) return;
    const btn = document.getElementById('om-xls-conferma');
    btn.disabled = true;
    btn.innerHTML = '&#8987; Salvataggio...';
    try {
        // Codici scelti a mano: li scrivo nell'articolo (solo se non ne ha gia' uno), cosi' la prossima volta lo riconosce
        for (const x of p.righe) {
            if (x.art || !x.scelto) continue;
            const a = macArticolo(x.scelto);
            if (a && !a.codice_articolo && typeof listinoHaCodiceArticolo === 'function' && listinoHaCodiceArticolo()) {
                const { error } = await supabaseClient.from('listino_articoli').update({ codice_articolo: x.codice }).eq('id', a.id);
                if (!error) a.codice_articolo = x.codice;
            }
        }
        for (const x of perMese) {
            const of = await omCreaOf(marchio, sez.id, data, operatore, 'CONSEGNA ' + omXlsMeseTesto(x.m), 'DA EXCEL: ' + omXlsFile.toUpperCase().slice(0, 80));
            await omAggiungiRigheLibere(of, x.righe);
        }
    } catch (error) {
        console.error('Errore caricamento Excel ordini:', error);
        await showCustomAlert('Errore durante il salvataggio:<br>' + macEsc(error.message) + '<br><br>Controlla la sezione: gli ordini creati fino all\'errore restano.', 'Errore', '&#10060;');
        omXlsChiudi();
        await omRicarica();
        return;
    }
    omXlsChiudi();
    await omRicarica();
    await showCustomAlert(perMese.length + ' ordini creati in <strong>' + macEsc(sez.nome) + '</strong> (' + pezzi + ' macchine in arrivo libere).', 'Fatto', '&#10004;');
}

// ========================================
// EVENT LISTENERS
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    const section = document.getElementById('section-ordini-macchine');
    if (!section) return;

    section.addEventListener('click', (e) => {
        const bm = e.target.closest('[data-om-marchio]');
        if (bm) { omScegliMarchio(bm.dataset.omMarchio); return; }
        const bs = e.target.closest('[data-om-sezione]');
        if (bs) { omSessione('omSezione', bs.dataset.omSezione); omRender(); return; }
        const bt = e.target.closest('[data-om-dao-togli]');
        if (bt) { e.preventDefault(); omTogliDao(Number(bt.dataset.omDaoTogli)); return; }
        const br = e.target.closest('[data-om-riga]');
        if (br) {
            const [ofId, artId] = br.dataset.omRiga.split('|').map(Number);
            omApriRiga(ofId, artId);
            return;
        }
        const bo = e.target.closest('[data-om-of]');
        if (bo) {
            const of = macOf(parseInt(bo.dataset.omOf, 10));
            if (!of) return;
            omOfInModifica = of;
            omOfRighe = [];
            omApriFinestraOf('modifica', of.marchio, []);
            return;
        }
        const ba = e.target.closest('[data-om-azione]');
        if (!ba) return;
        const az = ba.dataset.omAzione;
        if (az === 'segna-ordinate') omApriSegna();
        else if (az === 'nuova-sezione') omApriSezione(null);
        else if (az === 'modifica-sezione') omApriSezione(macOfSezione(Number(omSessione('omSezione'))));
        else if (az === 'carica-xls') omXlsApri();
        else if (az === 'aggiungi-dao') omApriDao();
        else if (az === 'nuovo-of') {
            omOfInModifica = null;
            omOfRighe = [];
            omApriFinestraOf('nuovo', omSessione('omMarchio'), []);
        }
    });

    section.addEventListener('change', (e) => {
        const el = e.target;
        if (el.id === 'om-mostra-arrivati') { omRender(); return; }
        if (el.id === 'om-vai-marchio') { const m = el.value; el.value = ''; omScegliMarchio(m); return; }
        if (el.id === 'om-sel-tutte') {
            const marchio = omSessione('omMarchio');
            omSelezione = {};
            if (el.checked) omPerArticolo(omDaOrdinare(marchio)).forEach(g => { if (g.art) omSelezione[g.art.id] = g.pezzi.length; });
            omRender();
            return;
        }
        if (el.dataset.omSel !== undefined) {
            const id = Number(el.dataset.omSel);
            if (el.checked) omSelezione[id] = omDaOrdinare(omSessione('omMarchio')).filter(p => p.articolo_id === id).length;
            else delete omSelezione[id];
            omRender();
            return;
        }
        if (el.dataset.omQuante !== undefined) {
            const id = Number(el.dataset.omQuante);
            const q = parseInt(el.value, 10);
            omSelezione[id] = Math.min(MAC_MAX_QTA, Math.max(1, q || 1));
            omRender();
        }
    });

    // Finestra ordine
    macPickerImposta('om-of-art-search', 'om-of-art-results', a => a.marchio === omSessione('omMarchio'), omOfAggiungiArticolo);
    document.getElementById('om-of-close').addEventListener('click', omChiudiFinestraOf);
    document.getElementById('om-of-annulla').addEventListener('click', omChiudiFinestraOf);
    document.getElementById('om-of-salva').addEventListener('click', omSalvaFinestraOf);
    document.getElementById('om-of-elimina').addEventListener('click', omEliminaOf);
    const righe = document.getElementById('om-of-righe');
    righe.addEventListener('change', (e) => {
        const i = e.target.dataset.omOfQta;
        if (i === undefined) return;
        const r = omOfRighe[parseInt(i, 10)];
        const q = parseInt(e.target.value, 10);
        if (r) r.n = (q >= 1 && q <= MAC_MAX_QTA) ? q : 1;
        omRenderOfRighe();
    });
    righe.addEventListener('click', (e) => {
        const b = e.target.closest('[data-om-of-togli]');
        if (!b) return;
        omOfRighe.splice(parseInt(b.dataset.omOfTogli, 10), 1);
        omRenderOfRighe();
    });

    // Finestra riga
    document.getElementById('om-riga-close').addEventListener('click', omChiudiRiga);
    document.getElementById('om-riga-chiudi').addEventListener('click', omChiudiRiga);
    document.getElementById('om-riga-riporta').addEventListener('click', omRigaRiporta);
    document.getElementById('om-riga-aggiungi').addEventListener('click', omRigaAggiungi);

    // Finestra sezione
    document.getElementById('om-sez-close').addEventListener('click', omChiudiSezione);
    document.getElementById('om-sez-annulla').addEventListener('click', omChiudiSezione);
    document.getElementById('om-sez-salva').addEventListener('click', omSalvaSezione);
    document.getElementById('om-sez-elimina').addEventListener('click', omEliminaSezione);

    // Righe da ordinare per il magazzino
    macPickerImposta('om-dao-search', 'om-dao-results', a => a.marchio === omSessione('omMarchio'), omDaoAggiungi);
    document.getElementById('om-dao-close').addEventListener('click', omChiudiDao);
    document.getElementById('om-dao-annulla').addEventListener('click', omChiudiDao);
    document.getElementById('om-dao-salva').addEventListener('click', omSalvaDao);
    const dao = document.getElementById('om-dao-righe');
    dao.addEventListener('change', (e) => {
        const i = e.target.dataset.omDaoQta;
        if (i === undefined) return;
        const r = omDaoRighe[parseInt(i, 10)];
        const q = parseInt(e.target.value, 10);
        if (r) r.n = (q >= 1 && q <= MAC_MAX_QTA) ? q : 1;
        omRenderDao();
    });
    dao.addEventListener('click', (e) => {
        const b = e.target.closest('[data-om-dao-x]');
        if (!b) return;
        omDaoRighe.splice(parseInt(b.dataset.omDaoX, 10), 1);
        omRenderDao();
    });

    // Carica Excel (sezioni)
    document.getElementById('om-xls-close').addEventListener('click', omXlsChiudi);
    document.getElementById('om-xls-annulla').addEventListener('click', omXlsChiudi);
    document.getElementById('om-xls-btn-file').addEventListener('click', () => document.getElementById('om-xls-file').click());
    document.getElementById('om-xls-file').addEventListener('change', omXlsFileScelto);
    document.getElementById('om-xls-foglio').addEventListener('change', omXlsFoglioCambiato);
    document.getElementById('om-xls-riga').addEventListener('change', omXlsRigaCambiata);
    document.getElementById('om-xls-colonne').addEventListener('change', () => {
        omXlsPiano = null;
        document.getElementById('om-xls-anteprima').innerHTML = '';
        document.getElementById('om-xls-conferma').classList.add('hidden');
    });
    document.getElementById('om-xls-btn-anteprima').addEventListener('click', omXlsAnteprima);
    document.getElementById('om-xls-conferma').addEventListener('click', omXlsConferma);
    document.getElementById('om-xls-anteprima').addEventListener('change', (e) => {
        const s = e.target.closest('[data-om-xls-scegli]');
        if (!s || !omXlsPiano) return;
        const x = omXlsPiano.righe.find(r => String(r.riga) === s.dataset.omXlsScegli);
        if (x) x.scelto = s.value ? Number(s.value) : null;
        omXlsRenderAnteprima();
    });

    // Guida
    const apriGuida = () => document.getElementById('om-guida-modal').classList.remove('hidden');
    const chiudiGuida = () => document.getElementById('om-guida-modal').classList.add('hidden');
    document.getElementById('om-guida-btn').addEventListener('click', apriGuida);
    document.getElementById('om-guida-close').addEventListener('click', chiudiGuida);
    document.getElementById('om-guida-chiudi').addEventListener('click', chiudiGuida);
});

window.openOrdiniMacchine = openOrdiniMacchine;
window.omPuoVedere = omPuoVedere;
