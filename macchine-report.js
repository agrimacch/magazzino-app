// ========================================
// REPORT VENDITE MACCHINE (Inventario Macchine > scheda Report)
// ----------------------------------------
// "Venduta" = macchina CONSEGNATA, alla data di consegna.
// - Filtri: periodo, marchio, attrezzo, ricerca libera
// - Raggruppa per: marchio, attrezzo, modello, operatore, mese
// - Pezzi, ricavo (dal prezzo della riga dell'ordine), costo (netto di carico), margine
//   Il prezzo di una riga con piu' macchine (o di un set) viene diviso tra le
//   macchine in proporzione al loro netto.
//   Tutti i prezzi (vendita e netti) sono IVA inclusa. Casellina "mostra senza IVA":
//   toglie il 22% sia dal ricavo sia dal costo (il margine % non cambia).
// - Dettaglio macchina per macchina
// - Download Excel (fogli RIEPILOGO e DETTAGLIO) e PDF compatto (si apre in una nuova scheda)
// Usa i dati di macchine-functions.js (macPezzi, listino) e ordini-functions.js (ordini e righe).
// ========================================

const REP_IVA = 22;
const REP_RAGGRUPPA = {
    marchio:   { titolo: 'Marchio' },
    attrezzo:  { titolo: 'Attrezzo' },
    modello:   { titolo: 'Modello' },
    operatore: { titolo: 'Operatore' },
    mese:      { titolo: 'Mese' }
};
const REP_MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

let repOrdiniCaricati = false;
let repUltimo = null;   // ultimo report calcolato (per Excel e stampa)

function repIsoLocale(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function repLeggiPreferenzaIva() {
    try { return localStorage.getItem('repPrezziIvaInclusa') !== 'no'; } catch (e) { return true; }
}

function repSalvaPreferenzaIva(v) {
    try { localStorage.setItem('repPrezziIvaInclusa', v ? 'si' : 'no'); } catch (e) { /* niente */ }
}

// Periodo predefinito
function repImpostaPeriodo(scelta) {
    const oggi = new Date();
    let da, a;
    if (scelta === 'anno') { da = new Date(oggi.getFullYear(), 0, 1); a = new Date(oggi.getFullYear(), 11, 31); }
    else if (scelta === 'anno-scorso') { da = new Date(oggi.getFullYear() - 1, 0, 1); a = new Date(oggi.getFullYear() - 1, 11, 31); }
    else if (scelta === 'mese') { da = new Date(oggi.getFullYear(), oggi.getMonth(), 1); a = new Date(oggi.getFullYear(), oggi.getMonth() + 1, 0); }
    else if (scelta === 'mese-scorso') { da = new Date(oggi.getFullYear(), oggi.getMonth() - 1, 1); a = new Date(oggi.getFullYear(), oggi.getMonth(), 0); }
    else if (scelta === 'tutto') { document.getElementById('rep-da').value = ''; document.getElementById('rep-a').value = ''; return; }
    else return;
    document.getElementById('rep-da').value = repIsoLocale(da);
    document.getElementById('rep-a').value = repIsoLocale(a);
}

async function repApri() {
    if (!document.getElementById('rep-periodo').dataset.pronto) {
        document.getElementById('rep-periodo').dataset.pronto = '1';
        repImpostaPeriodo('anno');
        document.getElementById('rep-iva').checked = repLeggiPreferenzaIva();
    }
    // Ordini (per prezzi e operatore): se la sezione ordini non e' ancora configurata il report funziona lo stesso
    if (typeof ordCaricaDati === 'function') {
        try { await ordCaricaDati(); repOrdiniCaricati = true; } catch (e) { repOrdiniCaricati = false; }
    }
    repPopolaFiltri();
    repRender();
}

function repPopolaFiltri() {
    const consegnate = macPezzi.filter(p => p.stato === 'CONSEGNATA');
    const art = consegnate.map(p => macArticolo(p.articolo_id)).filter(Boolean);
    [['rep-f-marchio', 'marchio', 'Tutti i marchi'], ['rep-f-attrezzo', 'attrezzo', 'Tutti gli attrezzi']].forEach(([id, campo, etichetta]) => {
        const sel = document.getElementById(id);
        const corrente = sel.value;
        const valori = [...new Set(art.map(a => a[campo]).filter(Boolean))].sort(listinoConfronta);
        sel.innerHTML = '<option value="">' + etichetta + '</option>' + valori.map(v => '<option value="' + macEsc(v) + '">' + macEsc(v) + '</option>').join('');
        sel.value = valori.indexOf(corrente) !== -1 ? corrente : '';
    });
}

// ---------- Calcolo ----------
function repRicaviPerPezzo() {
    // ricavo di ogni macchina: prezzo della riga d'ordine diviso in proporzione ai netti
    const ricavi = {};
    if (!repOrdiniCaricati || typeof ordRighe === 'undefined') return ricavi;
    const perRiga = {};
    macPezzi.forEach(p => {
        if (!p.ordine_riga_id) return;
        (perRiga[p.ordine_riga_id] = perRiga[p.ordine_riga_id] || []).push(p);
    });
    ordRighe.forEach(r => {
        const pezzi = perRiga[r.id];
        if (!pezzi || r.prezzo_totale === null || r.prezzo_totale === undefined) return;
        const pesi = pezzi.map(p => {
            let n = p.netto_carico;
            if (n === null || n === undefined) { const a = macArticolo(p.articolo_id); n = a ? a.netto_1 : null; }
            return Number(n) > 0 ? Number(n) : 0;
        });
        const somma = pesi.reduce((s, x) => s + x, 0);
        pezzi.forEach((p, i) => {
            ricavi[p.id] = somma > 0 ? Number(r.prezzo_totale) * pesi[i] / somma : Number(r.prezzo_totale) / pezzi.length;
        });
    });
    return ricavi;
}

function repCalcola() {
    const da = document.getElementById('rep-da').value;
    const a = document.getElementById('rep-a').value;
    const marchio = document.getElementById('rep-f-marchio').value;
    const attrezzo = document.getElementById('rep-f-attrezzo').value;
    const ricerca = listinoPulisciTesto(document.getElementById('rep-search').value) || '';
    const gruppo = document.getElementById('rep-gruppo').value;
    const ivaInclusa = document.getElementById('rep-iva').checked;
    const ricavi = repRicaviPerPezzo();
    const ordini = {};
    if (repOrdiniCaricati && typeof ordOrdini !== 'undefined') ordOrdini.forEach(o => { ordini[o.id] = o; });

    const righe = [];
    macPezzi.forEach(p => {
        if (p.stato !== 'CONSEGNATA' || !p.data_consegna) return;
        const giorno = repIsoLocale(new Date(p.data_consegna));
        if (da && giorno < da) return;
        if (a && giorno > a) return;
        const art = macArticolo(p.articolo_id);
        if (marchio && (!art || art.marchio !== marchio)) return;
        if (attrezzo && (!art || art.attrezzo !== attrezzo)) return;
        const ordine = p.ordine_id ? ordini[p.ordine_id] : null;
        if (ricerca) {
            const testo = [art ? art.attrezzo : '', art ? art.marchio : '', art ? art.modello : '', art ? art.note : '',
                p.cliente, p.matricola, ordine ? ordine.operatore : '', ordine ? ordNumero(ordine) : ''].filter(Boolean).join(' ').toUpperCase();
            if (!ricerca.split(' ').every(x => testo.indexOf(x) !== -1)) return;
        }
        let netto = p.netto_carico;
        if (netto === null || netto === undefined) netto = art ? art.netto_1 : null;
        let ricavo = ricavi[p.id];
        // Prezzi e netti sono IVA inclusa: "senza IVA" toglie il 22% da entrambi
        if (ricavo !== undefined && ivaInclusa) ricavo = ricavo / (1 + REP_IVA / 100);
        if (netto !== null && netto !== undefined && ivaInclusa) netto = Number(netto) / (1 + REP_IVA / 100);
        righe.push({
            pezzo: p, art: art, ordine: ordine, giorno: giorno,
            netto: (netto === null || netto === undefined) ? null : Math.round(Number(netto) * 100) / 100,
            ricavo: ricavo === undefined ? null : Math.round(ricavo * 100) / 100
        });
    });
    righe.sort((x, y) => x.giorno < y.giorno ? -1 : x.giorno > y.giorno ? 1 : x.pezzo.id - y.pezzo.id);

    // Raggruppamento
    const gruppi = {};
    righe.forEach(r => {
        let chiave;
        if (gruppo === 'marchio') chiave = (r.art && r.art.marchio) || 'SENZA MARCHIO';
        else if (gruppo === 'attrezzo') chiave = (r.art && r.art.attrezzo) || 'SENZA ATTREZZO';
        else if (gruppo === 'modello') chiave = r.art ? macNome(r.art) : 'ARTICOLO NON TROVATO';
        else if (gruppo === 'operatore') chiave = (r.ordine && r.ordine.operatore) || 'SENZA ORDINE';
        else chiave = r.giorno.slice(0, 7);
        const g = gruppi[chiave] = gruppi[chiave] || { nome: chiave, pezzi: 0, ricavo: 0, costo: 0, margine: 0, conPrezzo: 0, senzaPrezzo: 0, costoConPrezzo: 0 };
        g.pezzi++;
        if (r.netto !== null) g.costo += r.netto;
        if (r.ricavo !== null) {
            g.ricavo += r.ricavo;
            g.conPrezzo++;
            if (r.netto !== null) { g.margine += r.ricavo - r.netto; g.costoConPrezzo += r.netto; }
        } else {
            g.senzaPrezzo++;
        }
    });
    let elenco = Object.values(gruppi);
    if (gruppo === 'mese') {
        elenco.sort((x, y) => x.nome < y.nome ? -1 : 1);
        elenco.forEach(g => { const [aa, mm] = g.nome.split('-'); g.etichetta = REP_MESI[Number(mm) - 1] + ' ' + aa; });
    } else {
        elenco.sort((x, y) => (y.pezzi - x.pezzi) || listinoConfronta(x.nome, y.nome));
        elenco.forEach(g => { g.etichetta = g.nome; });
    }

    const tot = elenco.reduce((t, g) => {
        t.pezzi += g.pezzi; t.ricavo += g.ricavo; t.costo += g.costo; t.margine += g.margine;
        t.senzaPrezzo += g.senzaPrezzo; t.costoConPrezzo += g.costoConPrezzo;
        return t;
    }, { pezzi: 0, ricavo: 0, costo: 0, margine: 0, senzaPrezzo: 0, costoConPrezzo: 0 });

    return { da: da, a: a, marchio: marchio, attrezzo: attrezzo, ricerca: ricerca, gruppo: gruppo, ivaInclusa: ivaInclusa, righe: righe, gruppi: elenco, tot: tot };
}

function repPercentuale(margine, costo) {
    // margine sul ricavo (ricarico rispetto al prezzo di vendita)
    const ricavo = margine + costo;
    if (!(ricavo > 0)) return '-';
    return (margine / ricavo * 100).toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
}

function repPeriodoTesto(r) {
    if (!r.da && !r.a) return 'tutte le date';
    return (r.da ? 'dal ' + ordDataIt(r.da) : '') + (r.da && r.a ? ' ' : '') + (r.a ? 'al ' + ordDataIt(r.a) : '');
}

// ---------- Visualizzazione ----------
function repRender() {
    const box = document.getElementById('rep-risultato');
    if (!box || !macCaricato) return;
    const r = repCalcola();
    repUltimo = r;

    if (r.righe.length === 0) {
        box.innerHTML = '<div class="card"><p style="text-align:center">Nessuna macchina consegnata ' + macEsc(repPeriodoTesto(r)) +
            ' con questi filtri.</p><p class="mac-aiuto" style="text-align:center">Nel report entrano le macchine CONSEGNATE (croce nel quaderno), alla data di consegna.</p></div>';
        return;
    }

    const max = Math.max.apply(null, r.gruppi.map(g => g.pezzi));
    const titoloGruppo = REP_RAGGRUPPA[r.gruppo].titolo;
    const righeGruppi = r.gruppi.map(g =>
        '<tr>' +
            '<td><strong>' + macEsc(g.etichetta) + '</strong></td>' +
            '<td class="rep-barra-cella"><div class="rep-barra"><span style="width:' + Math.max(3, Math.round(g.pezzi / max * 100)) + '%"></span></div></td>' +
            '<td class="rep-num"><strong>' + g.pezzi + '</strong></td>' +
            '<td class="rep-num">' + macEuro(Math.round(g.ricavo * 100) / 100) + (g.senzaPrezzo ? '<small class="rep-senza" title="Macchine consegnate senza prezzo (non da un ordine)"> +' + g.senzaPrezzo + ' s.p.</small>' : '') + '</td>' +
            '<td class="rep-num rep-solo-pc">' + macEuro(Math.round(g.costo * 100) / 100) + '</td>' +
            '<td class="rep-num">' + (g.conPrezzo ? macEuro(Math.round(g.margine * 100) / 100) : '-') + '</td>' +
            '<td class="rep-num rep-solo-pc">' + (g.conPrezzo ? repPercentuale(g.margine, g.costoConPrezzo) : '-') + '</td>' +
        '</tr>'
    ).join('');

    const t = r.tot;
    const dettaglio = r.righe.map(x =>
        '<tr>' +
            '<td>' + ordDataIt(x.giorno) + '</td>' +
            '<td>' + listinoVal(x.art ? x.art.marchio : '') + '</td>' +
            '<td><strong>' + listinoVal(x.art ? (x.art.modello || x.art.note) : '') + '</strong>' + (x.art && x.art.modello && x.art.note ? ' <small>' + macEsc(x.art.note) + '</small>' : '') + '</td>' +
            '<td>' + listinoVal(x.pezzo.cliente) + '</td>' +
            '<td>' + listinoVal(x.pezzo.matricola) + '</td>' +
            '<td>' + (x.ordine ? ordNumero(x.ordine) : '-') + '</td>' +
            '<td>' + listinoVal(x.ordine ? x.ordine.operatore : '') + '</td>' +
            '<td class="rep-num">' + (x.ricavo !== null ? macEuro(x.ricavo) : '-') + '</td>' +
            '<td class="rep-num">' + (x.netto !== null ? macEuro(x.netto) : '-') + '</td>' +
        '</tr>'
    ).join('');

    box.innerHTML =
        '<div class="rep-testata">' +
            '<div class="mac-riep-box"><div><strong>' + t.pezzi + '</strong><span>Macchine vendute</span></div></div>' +
            '<div class="mac-riep-box"><div><strong>' + macEuro(Math.round(t.ricavo * 100) / 100) + '</strong><span>Ricavo' + (r.ivaInclusa ? ' (senza IVA)' : ' (IVA inclusa)') + '</span></div></div>' +
            '<div class="mac-riep-box"><div><strong>' + macEuro(Math.round(t.costo * 100) / 100) + '</strong><span>Costo netti' + (r.ivaInclusa ? ' (senza IVA)' : ' (IVA inclusa)') + '</span></div></div>' +
            '<div class="mac-riep-box mac-riep-valore"><div><strong>' + macEuro(Math.round(t.margine * 100) / 100) + '</strong><span>Margine ' + repPercentuale(t.margine, t.costoConPrezzo) + '</span></div></div>' +
        '</div>' +
        (t.senzaPrezzo ? '<p class="mac-aiuto">&#9888;&#65039; ' + (t.senzaPrezzo === 1 ? '1 macchina consegnata' : t.senzaPrezzo + ' macchine consegnate') +
            ' senza prezzo (segnate a mano nel quaderno, non da un ordine): contano nei pezzi e nel costo, non nel ricavo e nel margine.</p>' : '') +
        '<div class="card rep-card">' +
            '<h3>Per ' + titoloGruppo.toLowerCase() + ' <small>' + macEsc(repPeriodoTesto(r)) + '</small></h3>' +
            '<div class="table-container"><table class="listino-table rep-table">' +
                '<thead><tr><th>' + titoloGruppo + '</th><th class="rep-barra-cella"></th><th class="rep-num">Pezzi</th><th class="rep-num">Ricavo</th><th class="rep-num rep-solo-pc">Costo</th><th class="rep-num">Margine</th><th class="rep-num rep-solo-pc">%</th></tr></thead>' +
                '<tbody>' + righeGruppi + '</tbody>' +
                '<tfoot><tr><td><strong>TOTALE</strong></td><td class="rep-barra-cella"></td><td class="rep-num"><strong>' + t.pezzi + '</strong></td>' +
                    '<td class="rep-num"><strong>' + macEuro(Math.round(t.ricavo * 100) / 100) + '</strong></td>' +
                    '<td class="rep-num rep-solo-pc"><strong>' + macEuro(Math.round(t.costo * 100) / 100) + '</strong></td>' +
                    '<td class="rep-num"><strong>' + macEuro(Math.round(t.margine * 100) / 100) + '</strong></td>' +
                    '<td class="rep-num rep-solo-pc"><strong>' + repPercentuale(t.margine, t.costoConPrezzo) + '</strong></td></tr></tfoot>' +
            '</table></div>' +
        '</div>' +
        '<details class="card rep-card rep-dettaglio"><summary>&#128203; Dettaglio macchine (' + r.righe.length + ')</summary>' +
            '<div class="table-container"><table class="listino-table rep-table">' +
                '<thead><tr><th>Consegna</th><th>Marchio</th><th>Modello</th><th>Cliente</th><th>Matricola</th><th>Ordine</th><th>Operatore</th><th class="rep-num">Ricavo</th><th class="rep-num">Netto</th></tr></thead>' +
                '<tbody>' + dettaglio + '</tbody>' +
            '</table></div>' +
        '</details>';
}

// ---------- Excel ----------
function repScaricaExcel() {
    const r = repUltimo;
    if (!r || r.righe.length === 0) {
        showCustomAlert('Niente da scaricare: il report &egrave; vuoto.', 'Report', '&#9888;&#65039;');
        return;
    }
    if (typeof XLSX === 'undefined') {
        showCustomAlert('Libreria Excel non caricata: aggiorna la pagina e riprova.', 'Errore', '&#10060;');
        return;
    }
    const arr = n => Math.round(n * 100) / 100;
    const titolo = REP_RAGGRUPPA[r.gruppo].titolo.toUpperCase();
    const filtri = ['Periodo: ' + repPeriodoTesto(r)];
    if (r.marchio) filtri.push('Marchio: ' + r.marchio);
    if (r.attrezzo) filtri.push('Attrezzo: ' + r.attrezzo);
    if (r.ricerca) filtri.push('Ricerca: ' + r.ricerca);
    filtri.push(r.ivaInclusa ? 'Importi SENZA IVA (tolto il ' + REP_IVA + '% da prezzi e netti)' : 'Importi IVA inclusa');

    const riep = [['REPORT VENDITE MACCHINE (macchine consegnate)'], [filtri.join(' - ')], [],
        [titolo, 'PEZZI', 'RICAVO', 'COSTO (NETTI)', 'MARGINE', 'MARGINE %', 'PEZZI SENZA PREZZO']];
    r.gruppi.forEach(g => {
        const ric = g.margine + g.costoConPrezzo;
        riep.push([g.etichetta, g.pezzi, arr(g.ricavo), arr(g.costo), g.conPrezzo ? arr(g.margine) : null,
            (g.conPrezzo && ric > 0) ? arr(g.margine / ric * 100) : null, g.senzaPrezzo]);
    });
    const t = r.tot;
    const ricT = t.margine + t.costoConPrezzo;
    riep.push(['TOTALE', t.pezzi, arr(t.ricavo), arr(t.costo), arr(t.margine), ricT > 0 ? arr(t.margine / ricT * 100) : null, t.senzaPrezzo]);

    const dett = [['DATA CONSEGNA', 'ATTREZZO', 'MARCHIO', 'MODELLO', 'NOTE', 'CLIENTE', 'MATRICOLA', 'ORDINE', 'OPERATORE', 'RICAVO', 'NETTO']];
    r.righe.forEach(x => {
        dett.push([ordDataIt(x.giorno), x.art ? x.art.attrezzo : '', x.art ? x.art.marchio : '', x.art ? x.art.modello : '', x.art ? x.art.note : '',
            x.pezzo.cliente || '', x.pezzo.matricola || '', x.ordine ? ordNumero(x.ordine) : '', x.ordine ? (x.ordine.operatore || '') : '',
            x.ricavo, x.netto]);
    });

    const ws1 = XLSX.utils.aoa_to_sheet(riep);
    ws1['!cols'] = [36, 9, 14, 15, 14, 12, 18].map(w => ({ wch: w }));
    const ws2 = XLSX.utils.aoa_to_sheet(dett);
    ws2['!cols'] = [13, 18, 14, 22, 26, 24, 18, 11, 11, 12, 12].map(w => ({ wch: w }));
    ws2['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: dett.length - 1, c: dett[0].length - 1 } }) };
    // formato euro sulle colonne dei soldi
    const formatta = (ws, colonne, daRiga) => {
        const range = XLSX.utils.decode_range(ws['!ref']);
        for (let rr = daRiga; rr <= range.e.r; rr++) {
            colonne.forEach(c => {
                const cell = ws[XLSX.utils.encode_cell({ r: rr, c: c })];
                if (cell && typeof cell.v === 'number') cell.z = '#,##0.00 \u20AC';
            });
        }
    };
    formatta(ws1, [2, 3, 4], 4);
    formatta(ws2, [9, 10], 1);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws1, 'RIEPILOGO');
    XLSX.utils.book_append_sheet(wb, ws2, 'DETTAGLIO');
    const nome = 'REPORT_VENDITE_MACCHINE_' + (r.da || 'INIZIO') + '_' + (r.a || 'OGGI') + '_PER_' + titolo + '.xlsx';
    XLSX.writeFile(wb, nome);
}

// ---------- PDF (documento compatto, senza le scritte del browser) ----------
// Costruisce un documento A4 da una descrizione:
// { titolo, sottotitolo, kpi: [{ v, e }], sezioni: [{ titolo, colonne: [{ t, num }], righe: [[...]], totale: [...] }], nota }
function rptHtml(doc) {
    const cella = (v, num) => '<td' + (num ? ' class="rpt-n"' : '') + '>' + (v === null || v === undefined ? '' : v) + '</td>';
    return '<div class="rpt-pagina">' +
        '<table class="rpt-testa"><tr>' +
            '<td class="rpt-testa-logo"><img src="logo.png" alt="" class="rpt-logo"></td>' +
            '<td class="rpt-titoli"><div class="rpt-titolo">' + doc.titolo + '</div><div class="rpt-sotto">' + doc.sottotitolo + '</div></td>' +
        '</tr></table>' +
        '<div class="rpt-kpi">' + doc.kpi.map(k => '<div><span>' + k.e + '</span><strong>' + k.v + '</strong></div>').join('') + '</div>' +
        (doc.nota ? '<p class="rpt-nota">' + doc.nota + '</p>' : '') +
        doc.sezioni.map(sz =>
            '<div class="rpt-sezione">' + sz.titolo + '</div>' +
            '<table class="rpt-tab' + (sz.piccola ? ' rpt-tab-piccola' : '') + '"><thead><tr>' +
                sz.colonne.map(c => '<th' + (c.num ? ' class="rpt-n"' : '') + (c.w ? ' style="width:' + c.w + '"' : '') + '>' + c.t + '</th>').join('') +
            '</tr></thead><tbody>' +
                sz.righe.map(r => '<tr>' + r.map((v, i) => cella(v, sz.colonne[i].num)).join('') + '</tr>').join('') +
            '</tbody>' +
            (sz.totale ? '<tfoot><tr>' + sz.totale.map((v, i) => cella(v, sz.colonne[i].num)).join('') + '</tr></tfoot>' : '') +
            '</table>'
        ).join('') +
    '</div>';
}

async function rptCreaPdfBlob(doc) {
    const pdf = await pdfCreaDaHtml(rptHtml(doc), {
        margini: { alto: 10, sx: 10, basso: 12, dx: 10 },
        numeriPagina: true,
        tagli: 'tr, .rpt-kpi, .rpt-sezione, .rpt-nota, .rpt-testa'
    });
    return pdf.output('blob');
}

function repEuroPdf(n) {
    if (n === null || n === undefined) return '-';
    return '&#8364; ' + Number(n).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function repStampa() {
    const r = repUltimo;
    if (!r || r.righe.length === 0) {
        showCustomAlert('Niente da stampare: il report &egrave; vuoto.', 'Report', '&#9888;&#65039;');
        return;
    }
    const t = r.tot;
    const titoloGruppo = REP_RAGGRUPPA[r.gruppo].titolo;
    const filtri = [repPeriodoTesto(r)];
    if (r.marchio) filtri.push('marchio ' + macEsc(r.marchio));
    if (r.attrezzo) filtri.push('attrezzo ' + macEsc(r.attrezzo));
    if (r.ricerca) filtri.push('ricerca &quot;' + macEsc(r.ricerca) + '&quot;');
    filtri.push(r.ivaInclusa ? 'importi senza IVA' : 'importi IVA inclusa');
    const oggi = new Date();
    const doc = {
        titolo: 'Report vendite macchine',
        sottotitolo: 'Macchine consegnate ' + filtri.join(' &middot; ') + '<br>Creato il ' + ordDataIt(repIsoLocale(oggi)),
        kpi: [
            { e: 'Macchine vendute', v: t.pezzi },
            { e: 'Ricavo', v: repEuroPdf(t.ricavo) },
            { e: 'Costo netti', v: repEuroPdf(t.costo) },
            { e: 'Margine', v: repEuroPdf(t.margine) + ' <small>' + repPercentuale(t.margine, t.costoConPrezzo) + '</small>' }
        ],
        nota: t.senzaPrezzo ? (t.senzaPrezzo === 1 ? '1 macchina consegnata' : t.senzaPrezzo + ' macchine consegnate') +
            ' senza ordine (senza prezzo): contano nei pezzi e nel costo, non nel ricavo e nel margine.' : '',
        sezioni: [{
            titolo: 'Per ' + titoloGruppo.toLowerCase(),
            colonne: [{ t: titoloGruppo, w: '38%' }, { t: 'Pezzi', num: true }, { t: 'Ricavo', num: true }, { t: 'Costo', num: true }, { t: 'Margine', num: true }, { t: '%', num: true }],
            righe: r.gruppi.map(g => [macEsc(g.etichetta), g.pezzi, repEuroPdf(g.ricavo) + (g.senzaPrezzo ? ' <small>+' + g.senzaPrezzo + ' s.p.</small>' : ''),
                repEuroPdf(g.costo), g.conPrezzo ? repEuroPdf(g.margine) : '-', g.conPrezzo ? repPercentuale(g.margine, g.costoConPrezzo) : '-']),
            totale: ['TOTALE', t.pezzi, repEuroPdf(t.ricavo), repEuroPdf(t.costo), repEuroPdf(t.margine), repPercentuale(t.margine, t.costoConPrezzo)]
        }, {
            titolo: 'Dettaglio macchine',
            piccola: true,
            colonne: [{ t: 'Consegna' }, { t: 'Marchio' }, { t: 'Modello', w: '24%' }, { t: 'Cliente' }, { t: 'Matricola' }, { t: 'Ordine' }, { t: 'Op.' }, { t: 'Ricavo', num: true }, { t: 'Netto', num: true }],
            righe: r.righe.map(x => [ordDataIt(x.giorno), macEsc(x.art ? x.art.marchio || '' : ''),
                macEsc(x.art ? [x.art.modello, x.art.note].filter(Boolean).join(' ') : ''), macEsc(x.pezzo.cliente || ''), macEsc(x.pezzo.matricola || ''),
                x.ordine ? ordNumero(x.ordine) : '', macEsc(x.ordine ? x.ordine.operatore || '' : ''), x.ricavo !== null ? repEuroPdf(x.ricavo) : '-', x.netto !== null ? repEuroPdf(x.netto) : '-'])
        }]
    };
    pdfApriInScheda(() => rptCreaPdfBlob(doc), 'REPORT VENDITE MACCHINE ' + (r.da || 'INIZIO') + ' ' + (r.a || 'OGGI') + '.pdf');
}

// ========================================
// VALORE DEL MAGAZZINO (Inventario Macchine > scheda Valore)
// ----------------------------------------
// - "Adesso": le macchine IN CASA (disponibili + gia' assegnate a clienti, non consegnate)
// - "A una data": le macchine che quel giorno erano in casa:
//   caricate entro quella data e non ancora consegnate quel giorno
//   (le righe cancellate dal quaderno non si possono ricostruire)
// Valore = netto di carico (se manca: netto 1 del listino). Netti IVA inclusa:
// la casellina "senza IVA" toglie il 22%.
// ========================================
let valUltimo = null;

function valApri() {
    const quando = document.getElementById('val-quando');
    if (!quando.dataset.pronto) {
        quando.dataset.pronto = '1';
        const oggi = new Date();
        document.getElementById('val-data').value = repIsoLocale(new Date(oggi.getFullYear() - 1, 11, 31));
        document.getElementById('val-iva').checked = repLeggiPreferenzaIva();
    }
    valPopolaFiltri();
    valRender();
}

function valPopolaFiltri() {
    const art = macPezzi.filter(p => p.stato === 'IN_CASA' || p.stato === 'CONSEGNATA').map(p => macArticolo(p.articolo_id)).filter(Boolean);
    [['val-f-marchio', 'marchio', 'Tutti i marchi'], ['val-f-attrezzo', 'attrezzo', 'Tutti gli attrezzi']].forEach(([id, campo, etichetta]) => {
        const sel = document.getElementById(id);
        const corrente = sel.value;
        const valori = [...new Set(art.map(a => a[campo]).filter(Boolean))].sort(listinoConfronta);
        sel.innerHTML = '<option value="">' + etichetta + '</option>' + valori.map(v => '<option value="' + macEsc(v) + '">' + macEsc(v) + '</option>').join('');
        sel.value = valori.indexOf(corrente) !== -1 ? corrente : '';
    });
}

function valCalcola() {
    const adesso = document.getElementById('val-quando').value === 'adesso';
    const data = document.getElementById('val-data').value;
    const marchio = document.getElementById('val-f-marchio').value;
    const attrezzo = document.getElementById('val-f-attrezzo').value;
    const ricerca = listinoPulisciTesto(document.getElementById('val-search').value) || '';
    const gruppo = document.getElementById('val-gruppo').value;
    const senzaIva = document.getElementById('val-iva').checked;
    const giorno = iso => iso ? repIsoLocale(new Date(iso)) : null;

    const righe = [];
    let senzaData = 0;
    macPezzi.forEach(p => {
        if (adesso) {
            if (p.stato !== 'IN_CASA') return;
        } else {
            if (!data || (p.stato !== 'IN_CASA' && p.stato !== 'CONSEGNATA')) return;
            const caricata = giorno(p.data_carico);
            if (!caricata) { senzaData++; return; }
            if (caricata > data) return;
            const consegnata = giorno(p.data_consegna);
            if (p.stato === 'CONSEGNATA' && consegnata && consegnata <= data) return;
        }
        const art = macArticolo(p.articolo_id);
        if (marchio && (!art || art.marchio !== marchio)) return;
        if (attrezzo && (!art || art.attrezzo !== attrezzo)) return;
        if (ricerca) {
            const testo = [art ? art.attrezzo : '', art ? art.marchio : '', art ? art.modello : '', art ? art.note : '', p.cliente, p.matricola]
                .filter(Boolean).join(' ').toUpperCase();
            if (!ricerca.split(' ').every(x => testo.indexOf(x) !== -1)) return;
        }
        let netto = p.netto_carico;
        if (netto === null || netto === undefined) netto = art ? art.netto_1 : null;
        if (netto !== null && netto !== undefined) {
            netto = Number(netto);
            if (senzaIva) netto = netto / (1 + REP_IVA / 100);
            netto = Math.round(netto * 100) / 100;
        } else {
            netto = null;
        }
        righe.push({ pezzo: p, art: art, netto: netto, carico: giorno(p.data_carico), assegnata: adesso && !!p.cliente });
    });
    righe.sort((x, y) => listinoConfronta(x.art ? macNome(x.art) : '', y.art ? macNome(y.art) : '') || ((x.carico || '') < (y.carico || '') ? -1 : 1));

    const gruppi = {};
    righe.forEach(r => {
        let chiave;
        if (gruppo === 'marchio') chiave = (r.art && r.art.marchio) || 'SENZA MARCHIO';
        else if (gruppo === 'attrezzo') chiave = (r.art && r.art.attrezzo) || 'SENZA ATTREZZO';
        else chiave = r.art ? macNome(r.art) : 'ARTICOLO NON TROVATO';
        const g = gruppi[chiave] = gruppi[chiave] || { nome: chiave, pezzi: 0, valore: 0, assegnate: 0, senzaNetto: 0 };
        g.pezzi++;
        if (r.assegnata) g.assegnate++;
        if (r.netto !== null) g.valore += r.netto; else g.senzaNetto++;
    });
    const elenco = Object.values(gruppi).sort((x, y) => (y.valore - x.valore) || listinoConfronta(x.nome, y.nome));
    const tot = elenco.reduce((t, g) => { t.pezzi += g.pezzi; t.valore += g.valore; t.assegnate += g.assegnate; t.senzaNetto += g.senzaNetto; return t; },
        { pezzi: 0, valore: 0, assegnate: 0, senzaNetto: 0 });
    return { adesso: adesso, data: data, marchio: marchio, attrezzo: attrezzo, ricerca: ricerca, gruppo: gruppo, senzaIva: senzaIva,
        righe: righe, gruppi: elenco, tot: tot, senzaData: senzaData };
}

function valQuandoTesto(v) {
    return v.adesso ? 'adesso (' + ordDataIt(repIsoLocale(new Date())) + ')' : 'al ' + ordDataIt(v.data);
}

function valRender() {
    const box = document.getElementById('val-risultato');
    if (!box || !macCaricato) return;
    document.getElementById('val-data-box').classList.toggle('hidden', document.getElementById('val-quando').value === 'adesso');
    const v = valCalcola();
    valUltimo = v;
    if (v.righe.length === 0) {
        box.innerHTML = '<div class="card"><p style="text-align:center">Nessuna macchina in casa ' + macEsc(valQuandoTesto(v)) + ' con questi filtri.</p></div>';
        return;
    }
    const t = v.tot;
    const max = Math.max.apply(null, v.gruppi.map(g => g.valore)) || 1;
    const titoloGruppo = REP_RAGGRUPPA[v.gruppo].titolo;
    const iva = v.senzaIva ? ' (senza IVA)' : ' (IVA inclusa)';
    const perc = g => t.valore > 0 ? (g.valore / t.valore * 100).toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%' : '-';
    const note = [];
    if (t.senzaNetto) note.push((t.senzaNetto === 1 ? '1 macchina' : t.senzaNetto + ' macchine') + ' senza netto (non conteggiate nel valore): aggiungi il netto dal quaderno o nel listino.');
    if (!v.adesso && v.senzaData) note.push(v.senzaData + ' macchine senza data di carico non sono considerate per le date passate.');

    box.innerHTML =
        '<div class="rep-testata">' +
            '<div class="mac-riep-box"><div><strong>' + t.pezzi + '</strong><span>Macchine in casa ' + macEsc(valQuandoTesto(v)) + '</span></div></div>' +
            '<div class="mac-riep-box mac-riep-valore"><div><strong>' + macEuro(Math.round(t.valore * 100) / 100) + '</strong><span>Valore' + iva + '</span></div></div>' +
            (v.adesso ? '<div class="mac-riep-box"><div><strong>' + (t.pezzi - t.assegnate) + '</strong><span>Disponibili</span></div></div>' +
                        '<div class="mac-riep-box"><div><strong>' + t.assegnate + '</strong><span>Gi&agrave; assegnate a clienti</span></div></div>' : '') +
        '</div>' +
        (note.length ? '<p class="mac-aiuto">&#9888;&#65039; ' + note.join('<br>&#9888;&#65039; ') + '</p>' : '') +
        '<div class="card rep-card">' +
            '<h3>Per ' + titoloGruppo.toLowerCase() + ' <small>' + macEsc(valQuandoTesto(v)) + '</small></h3>' +
            '<div class="table-container"><table class="listino-table rep-table">' +
                '<thead><tr><th>' + titoloGruppo + '</th><th class="rep-barra-cella"></th><th class="rep-num">Pezzi</th>' +
                    (v.adesso ? '<th class="rep-num rep-solo-pc">Di cui assegnate</th>' : '') + '<th class="rep-num">Valore</th><th class="rep-num rep-solo-pc">%</th></tr></thead>' +
                '<tbody>' + v.gruppi.map(g =>
                    '<tr><td><strong>' + macEsc(g.nome) + '</strong></td>' +
                    '<td class="rep-barra-cella"><div class="rep-barra"><span style="width:' + Math.max(3, Math.round(g.valore / max * 100)) + '%"></span></div></td>' +
                    '<td class="rep-num"><strong>' + g.pezzi + '</strong></td>' +
                    (v.adesso ? '<td class="rep-num rep-solo-pc">' + (g.assegnate || '-') + '</td>' : '') +
                    '<td class="rep-num">' + macEuro(Math.round(g.valore * 100) / 100) + (g.senzaNetto ? '<small class="rep-senza"> +' + g.senzaNetto + ' s.n.</small>' : '') + '</td>' +
                    '<td class="rep-num rep-solo-pc">' + perc(g) + '</td></tr>'
                ).join('') + '</tbody>' +
                '<tfoot><tr><td><strong>TOTALE</strong></td><td class="rep-barra-cella"></td><td class="rep-num"><strong>' + t.pezzi + '</strong></td>' +
                    (v.adesso ? '<td class="rep-num rep-solo-pc"><strong>' + t.assegnate + '</strong></td>' : '') +
                    '<td class="rep-num"><strong>' + macEuro(Math.round(t.valore * 100) / 100) + '</strong></td><td class="rep-num rep-solo-pc"><strong>100%</strong></td></tr></tfoot>' +
            '</table></div>' +
        '</div>' +
        '<details class="card rep-card rep-dettaglio"><summary>&#128203; Dettaglio macchine (' + v.righe.length + ')</summary>' +
            '<div class="table-container"><table class="listino-table rep-table">' +
                '<thead><tr><th>Carico</th><th>Attrezzo</th><th>Marchio</th><th>Modello</th><th>Matricola</th>' + (v.adesso ? '<th>Cliente</th>' : '') + '<th class="rep-num">Netto</th></tr></thead>' +
                '<tbody>' + v.righe.map(x =>
                    '<tr><td>' + (x.carico ? ordDataIt(x.carico) : '-') + '</td><td>' + listinoVal(x.art ? x.art.attrezzo : '') + '</td>' +
                    '<td>' + listinoVal(x.art ? x.art.marchio : '') + '</td>' +
                    '<td><strong>' + listinoVal(x.art ? (x.art.modello || x.art.note) : '') + '</strong>' + (x.art && x.art.modello && x.art.note ? ' <small>' + macEsc(x.art.note) + '</small>' : '') + '</td>' +
                    '<td>' + listinoVal(x.pezzo.matricola) + '</td>' + (v.adesso ? '<td>' + listinoVal(x.pezzo.cliente) + '</td>' : '') +
                    '<td class="rep-num">' + (x.netto !== null ? macEuro(x.netto) : '-') + '</td></tr>'
                ).join('') + '</tbody>' +
            '</table></div>' +
        '</details>';
}

function valFiltriTesto(v) {
    const f = [];
    if (v.marchio) f.push('marchio ' + v.marchio);
    if (v.attrezzo) f.push('attrezzo ' + v.attrezzo);
    if (v.ricerca) f.push('ricerca "' + v.ricerca + '"');
    f.push(v.senzaIva ? 'valori senza IVA' : 'valori IVA inclusa');
    return f;
}

function valScaricaExcel() {
    const v = valUltimo;
    if (!v || v.righe.length === 0) {
        showCustomAlert('Niente da scaricare: nessuna macchina in casa con questi filtri.', 'Valore magazzino', '&#9888;&#65039;');
        return;
    }
    if (typeof XLSX === 'undefined') {
        showCustomAlert('Libreria Excel non caricata: aggiorna la pagina e riprova.', 'Errore', '&#10060;');
        return;
    }
    const arr = n => Math.round(n * 100) / 100;
    const titolo = REP_RAGGRUPPA[v.gruppo].titolo.toUpperCase();
    const riep = [['VALORE MAGAZZINO MACCHINE - ' + valQuandoTesto(v).toUpperCase()], [valFiltriTesto(v).join(' - ')], [],
        [titolo, 'PEZZI'].concat(v.adesso ? ['DI CUI ASSEGNATE'] : []).concat(['VALORE', '% SUL TOTALE', 'PEZZI SENZA NETTO'])];
    v.gruppi.forEach(g => riep.push([g.nome, g.pezzi].concat(v.adesso ? [g.assegnate] : [])
        .concat([arr(g.valore), v.tot.valore > 0 ? arr(g.valore / v.tot.valore * 100) : null, g.senzaNetto])));
    riep.push(['TOTALE', v.tot.pezzi].concat(v.adesso ? [v.tot.assegnate] : []).concat([arr(v.tot.valore), 100, v.tot.senzaNetto]));

    const dett = [['DATA CARICO', 'ATTREZZO', 'MARCHIO', 'MODELLO', 'NOTE', 'MATRICOLA'].concat(v.adesso ? ['CLIENTE'] : []).concat(['NETTO'])];
    v.righe.forEach(x => dett.push([x.carico ? ordDataIt(x.carico) : '', x.art ? x.art.attrezzo : '', x.art ? x.art.marchio : '', x.art ? x.art.modello : '',
        x.art ? x.art.note : '', x.pezzo.matricola || ''].concat(v.adesso ? [x.pezzo.cliente || ''] : []).concat([x.netto])));

    const ws1 = XLSX.utils.aoa_to_sheet(riep);
    ws1['!cols'] = [36, 9].concat(v.adesso ? [16] : []).concat([15, 12, 18]).map(w => ({ wch: w }));
    const ws2 = XLSX.utils.aoa_to_sheet(dett);
    ws2['!cols'] = [12, 18, 14, 22, 26, 18].concat(v.adesso ? [22] : []).concat([12]).map(w => ({ wch: w }));
    ws2['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: dett.length - 1, c: dett[0].length - 1 } }) };
    const euro = (ws, col, daRiga) => {
        const range = XLSX.utils.decode_range(ws['!ref']);
        for (let rr = daRiga; rr <= range.e.r; rr++) {
            const cell = ws[XLSX.utils.encode_cell({ r: rr, c: col })];
            if (cell && typeof cell.v === 'number') cell.z = '#,##0.00 \u20AC';
        }
    };
    euro(ws1, v.adesso ? 3 : 2, 4);
    euro(ws2, dett[0].length - 1, 1);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws1, 'RIEPILOGO');
    XLSX.utils.book_append_sheet(wb, ws2, 'DETTAGLIO');
    XLSX.writeFile(wb, 'VALORE_MAGAZZINO_MACCHINE_' + (v.adesso ? repIsoLocale(new Date()) : v.data) + '_PER_' + titolo + '.xlsx');
}

function valPdf() {
    const v = valUltimo;
    if (!v || v.righe.length === 0) {
        showCustomAlert('Niente da stampare: nessuna macchina in casa con questi filtri.', 'Valore magazzino', '&#9888;&#65039;');
        return;
    }
    const t = v.tot;
    const titoloGruppo = REP_RAGGRUPPA[v.gruppo].titolo;
    const perc = g => t.valore > 0 ? (g.valore / t.valore * 100).toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%' : '-';
    const kpi = [{ e: 'Macchine in casa', v: t.pezzi }, { e: 'Valore', v: repEuroPdf(t.valore) }];
    if (v.adesso) kpi.push({ e: 'Disponibili', v: t.pezzi - t.assegnate }, { e: 'Assegnate a clienti', v: t.assegnate });
    const doc = {
        titolo: 'Valore magazzino macchine',
        sottotitolo: 'Macchine in casa ' + macEsc(valQuandoTesto(v)) + ' &middot; ' + valFiltriTesto(v).map(macEsc).join(' &middot; ') +
            '<br>Creato il ' + ordDataIt(repIsoLocale(new Date())),
        kpi: kpi,
        nota: t.senzaNetto ? (t.senzaNetto === 1 ? '1 macchina' : t.senzaNetto + ' macchine') + ' senza netto, non conteggiate nel valore.' : '',
        sezioni: [{
            titolo: 'Per ' + titoloGruppo.toLowerCase(),
            colonne: [{ t: titoloGruppo, w: '46%' }, { t: 'Pezzi', num: true }].concat(v.adesso ? [{ t: 'Assegnate', num: true }] : [])
                .concat([{ t: 'Valore', num: true }, { t: '%', num: true }]),
            righe: v.gruppi.map(g => [macEsc(g.nome), g.pezzi].concat(v.adesso ? [g.assegnate || '-'] : []).concat([repEuroPdf(g.valore), perc(g)])),
            totale: ['TOTALE', t.pezzi].concat(v.adesso ? [t.assegnate] : []).concat([repEuroPdf(t.valore), '100%'])
        }, {
            titolo: 'Dettaglio macchine',
            piccola: true,
            colonne: [{ t: 'Carico' }, { t: 'Attrezzo' }, { t: 'Marchio' }, { t: 'Modello', w: '28%' }, { t: 'Matricola' }]
                .concat(v.adesso ? [{ t: 'Cliente' }] : []).concat([{ t: 'Netto', num: true }]),
            righe: v.righe.map(x => [x.carico ? ordDataIt(x.carico) : '-', macEsc(x.art ? x.art.attrezzo || '' : ''), macEsc(x.art ? x.art.marchio || '' : ''),
                macEsc(x.art ? [x.art.modello, x.art.note].filter(Boolean).join(' ') : ''), macEsc(x.pezzo.matricola || '')]
                .concat(v.adesso ? [macEsc(x.pezzo.cliente || '')] : []).concat([x.netto !== null ? repEuroPdf(x.netto) : '-']))
        }]
    };
    pdfApriInScheda(() => rptCreaPdfBlob(doc), 'VALORE MAGAZZINO MACCHINE ' + (v.adesso ? repIsoLocale(new Date()) : v.data) + '.pdf');
}

// ========================================
// EVENT LISTENERS
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    const periodo = document.getElementById('rep-periodo');
    if (!periodo) return;
    periodo.addEventListener('change', () => { repImpostaPeriodo(periodo.value); repRender(); });
    ['rep-da', 'rep-a'].forEach(id => document.getElementById(id).addEventListener('change', () => {
        periodo.value = 'personalizzato';
        repRender();
    }));
    ['rep-f-marchio', 'rep-f-attrezzo', 'rep-gruppo'].forEach(id => document.getElementById(id).addEventListener('change', repRender));
    document.getElementById('rep-iva').addEventListener('change', (e) => { repSalvaPreferenzaIva(e.target.checked); repRender(); });
    let attesa = null;
    document.getElementById('rep-search').addEventListener('input', () => { clearTimeout(attesa); attesa = setTimeout(repRender, 250); });
    document.getElementById('rep-excel').addEventListener('click', repScaricaExcel);
    document.getElementById('rep-stampa').addEventListener('click', repStampa);

    // Valore magazzino
    ['val-quando', 'val-data', 'val-f-marchio', 'val-f-attrezzo', 'val-gruppo'].forEach(id =>
        document.getElementById(id).addEventListener('change', valRender));
    document.getElementById('val-iva').addEventListener('change', (e) => { repSalvaPreferenzaIva(e.target.checked); valRender(); });
    let attesaVal = null;
    document.getElementById('val-search').addEventListener('input', () => { clearTimeout(attesaVal); attesaVal = setTimeout(valRender, 250); });
    document.getElementById('val-excel').addEventListener('click', valScaricaExcel);
    document.getElementById('val-pdf').addEventListener('click', valPdf);
});

window.repApri = repApri;
window.valApri = valApri;
