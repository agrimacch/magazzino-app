// ========================================
// MACCHINE IN CONTO ESPOSIZIONE (v8.4.0) - Inventario Macchine
// ----------------------------------------
// Macchine nostre (IN CASA, senza cliente) messe in esposizione presso collaboratori / altri negozi.
// - Restano NOSTRE: contano nell'inventario e nel valore di magazzino.
// - NON sono disponibili alla vendita (ordini clienti, set, badge del listino le escludono).
// - Nel quaderno: quadratino GIALLO con "c/o NOME".
// Collaboratori: elenco fisso che si compila man mano (tabella macchine_collaboratori).
// Azioni: Manda in esposizione / Rientrata / Venduta dal collaboratore (la macchina esce dal magazzino
// come CONSEGNATA al collaboratore e si propone di mandargliene un'altra uguale).
// Colonne macchine_pezzi.esposizione_id / esposizione_dal (supabase/macchine-esposizione.sql).
// Il DDT si fa a parte (gestionale).
// ========================================

let macCollaboratori = [];       // { id, nome, note }
let macEspPronto = false;        // false = script supabase/macchine-esposizione.sql non eseguito

async function macEspCarica() {
    const { data, error } = await supabaseClient.from('macchine_collaboratori').select('*').order('nome');
    if (error) {
        macEspPronto = false;
        macCollaboratori = [];
        console.log('Collaboratori non caricati (manca supabase/macchine-esposizione.sql?):', error.message);
        return;
    }
    macCollaboratori = data || [];
    macEspPronto = true;
}

function macEspCollaboratore(id) { return macCollaboratori.find(c => c.id === id) || null; }
function macEspGiorni(dal) {
    if (!dal) return null;
    const d = new Date(String(dal).slice(0, 10) + 'T00:00:00');
    return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
}
function macEspOggi() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function macEspDisponibili(articoloId) {
    return macPezzi.filter(p => p.stato === 'IN_CASA' && !p.cliente && !macInEsposizione(p) && (!articoloId || p.articolo_id === articoloId));
}
function macEspNetto(p) {
    if (p.netto_carico !== null && p.netto_carico !== undefined) return Number(p.netto_carico);
    const a = macArticolo(p.articolo_id);
    return a && a.netto_1 !== null && a.netto_1 !== undefined ? Number(a.netto_1) : 0;
}
function macEspAvvisoSql() {
    showCustomAlert('Per le macchine in conto esposizione esegui su Supabase lo script <strong>supabase/macchine-esposizione.sql</strong>.', 'Esposizione', '&#8505;&#65039;');
}

// ---------- Azioni ----------
async function macEspAggiorna(p, agg, log) {
    const adesso = new Date().toISOString();
    agg.updated_at = adesso;
    agg.updated_by = macUtente();
    const { error } = await supabaseClient.from('macchine_pezzi').update(agg).eq('id', p.id);
    if (error) throw error;
    const prima = p.stato;
    Object.assign(p, agg);
    await macRegistra([Object.assign({
        pezzo_id: p.id, articolo_id: p.articolo_id, stato_prima: prima, stato_dopo: p.stato,
        cliente: p.cliente || null, matricola: p.matricola || null, netto: p.netto_carico
    }, log)]);
}

async function macEspManda(pezzoId, collId, dal) {
    const p = macPezzi.find(x => x.id === pezzoId);
    const c = macEspCollaboratore(collId);
    if (!p || !c) return false;
    if (p.stato !== 'IN_CASA' || p.cliente || macInEsposizione(p)) {
        await showCustomAlert('Questa macchina non &egrave; disponibile: si mandano in esposizione solo le macchine in casa senza cliente.', 'Esposizione', '&#9888;&#65039;');
        return false;
    }
    try {
        await macEspAggiorna(p, { esposizione_id: c.id, esposizione_dal: dal || macEspOggi() },
            { tipo: 'ESPOSIZIONE', dettaglio: 'IN CONTO ESPOSIZIONE PRESSO ' + c.nome + ' DAL ' + macDataCorta(dal || macEspOggi()) });
    } catch (err) {
        console.error('Errore esposizione:', err);
        await showCustomAlert('Errore:<br>' + macEsc(err.message) + (/esposizione/i.test(err.message) ? '<br><br>Esegui su Supabase <strong>supabase/macchine-esposizione.sql</strong>.' : ''), 'Errore', '&#10060;');
        return false;
    }
    return true;
}

async function macEspRientra(pezzoId) {
    const p = macPezzi.find(x => x.id === pezzoId);
    if (!macInEsposizione(p)) return;
    const nome = macEspNome(p);
    if (!window.confirm('La ' + macNome(macArticolo(p.articolo_id)) + (p.matricola ? ' (matr. ' + p.matricola + ')' : '') + ' e\' rientrata da ' + nome + '?\n\nTorna disponibile in negozio.')) return;
    try {
        await macEspAggiorna(p, { esposizione_id: null, esposizione_dal: null }, { tipo: 'ESPOSIZIONE', dettaglio: 'RIENTRATA DA ' + nome + ' - TORNA DISPONIBILE' });
    } catch (err) {
        await showCustomAlert('Errore:<br>' + macEsc(err.message), 'Errore', '&#10060;');
        return;
    }
    macEspDopo();
}

// Venduta dal collaboratore: esce dal magazzino (CONSEGNATA al collaboratore) e si propone il rimpiazzo
async function macEspVenduta(pezzoId) {
    const p = macPezzi.find(x => x.id === pezzoId);
    if (!macInEsposizione(p)) return;
    const c = macEspCollaboratore(p.esposizione_id);
    const nome = c ? c.nome : macEspNome(p);
    const a = macArticolo(p.articolo_id);
    if (!window.confirm(nome + ' ha venduto la ' + macNome(a) + (p.matricola ? ' (matr. ' + p.matricola + ')' : '') + '?\n\n' +
        'Esce dal nostro magazzino (consegnata a ' + nome + ').')) return;
    const adesso = new Date().toISOString();
    try {
        await macEspAggiorna(p, { stato: 'CONSEGNATA', cliente: nome, data_consegna: adesso, esposizione_id: null, esposizione_dal: null },
            { tipo: 'ESPOSIZIONE', dettaglio: 'VENDUTA DA ' + nome + ' (CONTO ESPOSIZIONE) - CONSEGNATA' });
    } catch (err) {
        await showCustomAlert('Errore:<br>' + macEsc(err.message), 'Errore', '&#10060;');
        return;
    }
    // Rimpiazzo: un'altra uguale disponibile (la piu' vecchia)
    const libere = macEspDisponibili(p.articolo_id).sort((x, y) => String(x.data_carico || '').localeCompare(String(y.data_carico || '')) || x.id - y.id);
    if (c && libere.length) {
        const r = libere[0];
        if (window.confirm('Mandare a ' + nome + ' un\'altra ' + macNome(a) + ' al suo posto?\n\n' +
            'In casa ne hai ' + libere.length + ' disponibil' + (libere.length === 1 ? 'e' : 'i') + (r.matricola ? ' (proposta: matr. ' + r.matricola + ')' : '') + '.')) {
            await macEspManda(r.id, c.id, macEspOggi());
        }
    } else if (c) {
        await showCustomAlert('Venduta. Non ci sono altre ' + macEsc(macNome(a)) + ' disponibili da mandare a ' + macEsc(nome) + '.', 'Esposizione', '&#8505;&#65039;');
    }
    macEspDopo();
}

// Dopo un'azione: ridisegno quello che e' aperto
function macEspDopo() {
    if (typeof macChiudiPezzo === 'function' && !document.getElementById('mac-pezzo-modal').classList.contains('hidden')) macChiudiPezzo();
    if (typeof macRenderTutto === 'function') macRenderTutto();
    if (typeof listinoRidisegnaSezioniCollegate === 'function') listinoRidisegnaSezioniCollegate();
}

// ---------- Riquadro nella finestra della macchina ----------
function macEspRenderBox(p) {
    const box = document.getElementById('mac-pezzo-esp');
    if (!box) return;
    if (!p || p.stato !== 'IN_CASA' || p.cliente) { box.innerHTML = ''; box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    if (!macEspPronto) {
        box.innerHTML = '<div class="mac-esp-box"><strong>&#128993; Conto esposizione</strong><p class="mac-aiuto">Esegui su Supabase <strong>supabase/macchine-esposizione.sql</strong> per usarlo.</p></div>';
        return;
    }
    if (macInEsposizione(p)) {
        const g = macEspGiorni(p.esposizione_dal);
        box.innerHTML = '<div class="mac-esp-box mac-esp-attiva"><strong><span class="mac-quadro st-esposizione"></span> In conto esposizione presso ' + macEsc(macEspNome(p)) + '</strong>' +
            '<div class="mac-aiuto">' + (p.esposizione_dal ? 'dal ' + macDataCorta(p.esposizione_dal) + (g !== null ? ' (' + g + (g === 1 ? ' giorno' : ' giorni') + ')' : '') : '') +
                ' &middot; resta nostra, non &egrave; disponibile alla vendita</div>' +
            '<div class="mac-esp-azioni">' +
                '<button type="button" class="btn-back mac-btn-piccolo" onclick="macEspRientra(' + p.id + ')">&#8617;&#65039; Rientrata</button>' +
                '<button type="button" class="btn-primary mac-btn-piccolo" onclick="macEspVenduta(' + p.id + ')">&#129534; Venduta dal collaboratore</button>' +
            '</div></div>';
        return;
    }
    box.innerHTML = '<div class="mac-esp-box"><strong>&#128993; Manda in conto esposizione</strong>' +
        '<div class="mac-esp-form">' +
            '<select id="mac-esp-coll">' + macEspOpzioniCollaboratori() + '</select>' +
            '<input type="date" id="mac-esp-dal" value="' + macEspOggi() + '" max="' + macEspOggi() + '" title="Dal">' +
            '<button type="button" class="btn-primary mac-btn-piccolo" onclick="macEspMandaDaFinestra(' + p.id + ')">Manda</button>' +
        '</div>' +
        '<button type="button" class="mac-link" onclick="macEspNuovoCollaboratore(\'mac-esp-coll\')">&#10133; Nuovo collaboratore</button></div>';
}

function macEspOpzioniCollaboratori() {
    return '<option value="">- collaboratore -</option>' + macCollaboratori.map(c => '<option value="' + c.id + '">' + macEsc(c.nome) + '</option>').join('');
}

async function macEspMandaDaFinestra(pezzoId) {
    const coll = Number(document.getElementById('mac-esp-coll').value);
    const dal = document.getElementById('mac-esp-dal').value || macEspOggi();
    if (!coll) { await showCustomAlert('Scegli il collaboratore.', 'Esposizione', '&#9888;&#65039;'); return; }
    if (await macEspManda(pezzoId, coll, dal)) macEspDopo();
}

// ---------- Collaboratori (elenco fisso, si compila man mano) ----------
async function macEspNuovoCollaboratore(selectId) {
    if (!macEspPronto) { macEspAvvisoSql(); return; }
    const nome = listinoPulisciTesto(window.prompt('Nome del collaboratore / negozio (es. ROSSI GARDEN - MIRANO):') || '');
    if (!nome) return;
    if (macCollaboratori.some(c => c.nome === nome)) { await showCustomAlert(macEsc(nome) + ' &egrave; gi&agrave; nell\'elenco.', 'Collaboratori', '&#8505;&#65039;'); return; }
    const { data, error } = await supabaseClient.from('macchine_collaboratori').insert([{ nome: nome, created_by: macUtente() }]).select('*').single();
    if (error) { await showCustomAlert('Errore:<br>' + macEsc(error.message), 'Collaboratori', '&#10060;'); return; }
    macCollaboratori.push(data);
    macCollaboratori.sort((a, b) => listinoConfronta(a.nome, b.nome));
    const sel = selectId ? document.getElementById(selectId) : null;
    if (sel) { sel.innerHTML = macEspOpzioniCollaboratori(); sel.value = String(data.id); }
    if ((macSessione('macchineTab') || '') === 'esposizione') macEspRender();
}

async function macEspRinomina(id) {
    const c = macEspCollaboratore(id);
    if (!c) return;
    const nome = listinoPulisciTesto(window.prompt('Nuovo nome per ' + c.nome + ':', c.nome) || '');
    if (!nome || nome === c.nome) return;
    const { error } = await supabaseClient.from('macchine_collaboratori').update({ nome: nome }).eq('id', id);
    if (error) { await showCustomAlert('Errore:<br>' + macEsc(error.message), 'Collaboratori', '&#10060;'); return; }
    c.nome = nome;
    macRenderTutto();
}

async function macEspElimina(id) {
    const c = macEspCollaboratore(id);
    if (!c) return;
    if (macPezzi.some(p => p.esposizione_id === id)) {
        await showCustomAlert(macEsc(c.nome) + ' ha ancora macchine in esposizione: falle prima rientrare.', 'Collaboratori', '&#9888;&#65039;');
        return;
    }
    if (!window.confirm('Togliere ' + c.nome + ' dall\'elenco dei collaboratori?')) return;
    const { error } = await supabaseClient.from('macchine_collaboratori').delete().eq('id', id);
    if (error) { await showCustomAlert('Errore:<br>' + macEsc(error.message), 'Collaboratori', '&#10060;'); return; }
    macCollaboratori = macCollaboratori.filter(x => x.id !== id);
    macEspRender();
}

// ---------- Scheda "Esposizione" ----------
function macEspRender() {
    const box = document.getElementById('mac-esp-contenuto');
    if (!box) return;
    if (!macEspPronto) {
        box.innerHTML = '<div class="card"><p>&#8505;&#65039; Per le macchine in conto esposizione esegui su Supabase lo script <strong>supabase/macchine-esposizione.sql</strong>, poi ricarica la pagina.</p></div>';
        return;
    }
    const inEsp = macPezzi.filter(macInEsposizione);
    const valore = inEsp.reduce((t, p) => t + macEspNetto(p), 0);
    const libere = macEspDisponibili(null);
    let html = '<div class="card mac-esp-testa">' +
        '<div class="mac-esp-tot"><span class="mac-quadro st-esposizione"></span><div><strong>' + inEsp.length + '</strong> macchine in conto esposizione' +
            ' &middot; valore <strong>' + macEuro(valore) + '</strong> <small>(gi&agrave; compreso nel valore di magazzino)</small></div></div>' +
        '<p class="mac-aiuto">Restano nostre e contano in magazzino, ma <strong>non sono disponibili</strong> alla vendita. ' +
            'Quando il collaboratore ne vende una: <strong>Venduta</strong> (esce dal magazzino) e l\'app propone di mandargliene un\'altra uguale.</p>' +
        '<div class="mac-esp-form">' +
            '<select id="mac-esp-t-coll">' + macEspOpzioniCollaboratori() + '</select>' +
            '<select id="mac-esp-t-pezzo"><option value="">- macchina disponibile da mandare -</option>' +
                libere.map(p => ({ p: p, a: macArticolo(p.articolo_id) })).sort((x, y) => listinoConfronta(x.a ? macNome(x.a) : '', y.a ? macNome(y.a) : ''))
                    .map(x => '<option value="' + x.p.id + '">' + macEsc(x.a ? (x.a.marchio ? x.a.marchio + ' ' : '') + macNome(x.a) : 'ARTICOLO ' + x.p.articolo_id) +
                        (x.p.matricola ? ' - matr. ' + macEsc(x.p.matricola) : '') + '</option>').join('') + '</select>' +
            '<input type="date" id="mac-esp-t-dal" value="' + macEspOggi() + '" max="' + macEspOggi() + '">' +
            '<button type="button" class="btn-primary mac-btn-piccolo" onclick="macEspMandaDaScheda()">&#128993; Manda in esposizione</button>' +
        '</div>' +
        '<button type="button" class="mac-link" onclick="macEspNuovoCollaboratore(\'mac-esp-t-coll\')">&#10133; Nuovo collaboratore</button>' +
    '</div>';

    if (!macCollaboratori.length) {
        html += '<p class="mac-aiuto">Nessun collaboratore ancora: aggiungilo con <strong>&#10133; Nuovo collaboratore</strong>.</p>';
        box.innerHTML = html;
        return;
    }
    macCollaboratori.forEach(c => {
        const lista = inEsp.filter(p => p.esposizione_id === c.id)
            .sort((x, y) => String(x.esposizione_dal || '').localeCompare(String(y.esposizione_dal || '')));
        html += '<div class="card mac-esp-coll">' +
            '<div class="mac-esp-coll-testa"><strong>&#127978; ' + macEsc(c.nome) + '</strong>' +
                '<span>' + lista.length + (lista.length === 1 ? ' macchina' : ' macchine') + (lista.length ? ' &middot; ' + macEuro(lista.reduce((t, p) => t + macEspNetto(p), 0)) : '') + '</span>' +
                '<span class="mac-esp-coll-az">' +
                    '<button type="button" class="mac-link" onclick="macEspRinomina(' + c.id + ')">&#9997;&#65039; nome</button>' +
                    (lista.length ? '' : '<button type="button" class="mac-link" onclick="macEspElimina(' + c.id + ')">&#128465; togli</button>') +
                '</span></div>' +
            (lista.length ? lista.map(p => {
                const a = macArticolo(p.articolo_id);
                const g = macEspGiorni(p.esposizione_dal);
                return '<div class="mac-esp-riga">' +
                    '<button type="button" class="mac-esp-nome" data-pezzo="' + p.id + '"><span class="mac-quadro st-esposizione"></span>' +
                        '<span>' + (a ? macNomeHtml(a) : 'ARTICOLO ' + p.articolo_id) + (p.matricola ? ' <small>matr. ' + macEsc(p.matricola) + '</small>' : '') + '</span></button>' +
                    '<span class="mac-esp-dal">' + (p.esposizione_dal ? 'dal ' + macDataCorta(p.esposizione_dal) : '') + (g !== null ? ' &middot; ' + g + ' gg' : '') + '</span>' +
                    '<span class="mac-esp-azioni">' +
                        '<button type="button" class="btn-back mac-btn-piccolo" onclick="macEspRientra(' + p.id + ')" title="Rientrata in negozio">&#8617;&#65039; Rientrata</button>' +
                        '<button type="button" class="btn-primary mac-btn-piccolo" onclick="macEspVenduta(' + p.id + ')" title="Venduta dal collaboratore">&#129534; Venduta</button>' +
                    '</span></div>';
            }).join('') : '<p class="mac-aiuto">Nessuna macchina in esposizione.</p>') +
        '</div>';
    });
    box.innerHTML = html;
}

async function macEspMandaDaScheda() {
    const coll = Number(document.getElementById('mac-esp-t-coll').value);
    const pezzo = Number(document.getElementById('mac-esp-t-pezzo').value);
    const dal = document.getElementById('mac-esp-t-dal').value || macEspOggi();
    if (!coll || !pezzo) { await showCustomAlert('Scegli il collaboratore e la macchina.', 'Esposizione', '&#9888;&#65039;'); return; }
    if (await macEspManda(pezzo, coll, dal)) {
        macEspRender();
        const sel = document.getElementById('mac-esp-t-coll');
        if (sel) sel.value = String(coll);   // resta scelto, per mandarne altre allo stesso
    }
}

// Clic su una macchina della scheda: apre la sua finestra
document.addEventListener('DOMContentLoaded', () => {
    const box = document.getElementById('mac-esp-contenuto');
    if (box) box.addEventListener('click', e => {
        const b = e.target.closest('.mac-esp-nome[data-pezzo]');
        if (b && typeof macApriPezzo === 'function') macApriPezzo(Number(b.dataset.pezzo));
    });
});
