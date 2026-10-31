// ========================================
// INVENTARIO MACCHINE - FUNZIONI DEDICATE (fase 1)
// ----------------------------------------
// Sezione dentro MAGAZZINO. Collegato al Listino Vendite: ogni macchina fisica e' una riga di
// macchine_pezzi legata a un articolo di listino_articoli.
// - Inventario: stesse colonne/suddivisione del listino (senza prezzi e note prezzi)
// - Quaderno: riproduce il quadernone cartaceo (divisori per marchio,
//   quadratini colorati + nome cliente)
// - Carico macchine: con assegnazione automatica ai clienti in attesa
// - Set: composizione dei set (macchina + batteria + caricatore...)
// - Movimenti: registro di tutte le operazioni
// - Nel Listino Vendite compare in piccolo "in casa N" (solo per chi
//   puo' gestire l'inventario macchine)
// Tabelle Supabase: macchine_pezzi, macchine_composizione, macchine_movimenti
// Usa le funzioni di utilita' di listino-functions.js (listinoEsc, ...)
// ========================================

// Inventario Macchine e Ordini Clienti.
// false = SOLO ADMIN (per ora, finche' le sezioni sono in prova): agli operatori spariscono le card,
//         le sezioni, il carrello "bozza ordine" e il conteggio macchine nel listino.
// true  = admin E operatori (stessi permessi), mai i tecnici.
// Su Supabase la funzione puo_gestire_macchine() accetta gia' admin e operatori (supabase/macchine-operatori.sql).
const MACCHINE_PER_OPERATORI = false;

let macPezzi = [];              // tutti i pezzi
let macComposizione = [];       // righe { set_id, componente_id, quantita }
let macCaricato = false;
let macMovimenti = [];
let macMovimentiCaricati = false;
let macSearchTimeout = null;
// Ordini clienti il cui PDF va rifatto (es. e' arrivata la matricola di una macchina ordinata)
const macOrdiniDaAggiornare = new Set();

// Stati (i colori del quadernone)
const MAC_STATI = {
    DA_ORDINARE: { etichetta: 'Da ordinare', classe: 'st-daordinare', aiuto: 'quadrato bianco + nome' },
    ORDINATA:    { etichetta: 'Ordinata',    classe: 'st-ordinata',   aiuto: 'quadrato blu + nome' },
    IN_CASA:     { etichetta: 'In casa',     classe: 'st-incasa',     aiuto: 'verde: con nome assegnata, senza nome disponibile' },
    CONSEGNATA:  { etichetta: 'Consegnata',  classe: 'st-consegnata', aiuto: 'verde con la croce' }
};
const MAC_ORDINE_STATI = ['DA_ORDINARE', 'ORDINATA', 'IN_CASA', 'CONSEGNATA'];
const MAC_MAX_QTA = 50;

// Parole che fanno pensare a un set nel listino
const MAC_REGEX_SET = /\b(SET|KIT|CPL|COMPLET[AOE])\b/;

// ========================================
// PERMESSI E UTILITA'
// ========================================
function macPuoGestire() {
    return currentUserRole === 'admin' || (MACCHINE_PER_OPERATORI && currentUserRole === 'operatore');
}

function macEsc(v) { return listinoEsc(v); }

function macArticolo(id) {
    return listinoArticoli.find(a => a.id === id) || null;
}

function macNome(a) {
    if (!a) return 'ARTICOLO NON TROVATO';
    return [a.marchio, a.modello, a.note].filter(Boolean).join(' ') || 'ARTICOLO';
}

function macNomeHtml(a) {
    if (!a) return '<em>Articolo non trovato</em>';
    return '<span class="mac-marchio">' + listinoVal(a.marchio) + '</span> <strong>' + listinoVal(a.modello || a.note) + '</strong>' +
        (a.modello && a.note ? ' <span class="mac-art-note">' + macEsc(a.note) + '</span>' : '');
}

function macData(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getFullYear()).slice(-2);
}

function macDataOra(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    return macData(iso) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function macUtente() {
    return currentUser ? currentUser.email : null;
}

function macChi(email) {
    if (!email) return '-';
    if (typeof userInitials === 'object' && userInitials[email]) return userInitials[email];
    return String(email).split('@')[0].toUpperCase();
}

function macEuro(n) {
    return listinoFormatEuro(n);
}

function macSessione(nome, valore) {
    if (valore === undefined) return sessionStorage.getItem(nome);
    if (valore === null) sessionStorage.removeItem(nome);
    else sessionStorage.setItem(nome, valore);
}

// ========================================
// CARICAMENTO DATI
// ========================================
async function macFetchAll(tabella, colonnaOrdine) {
    let tutti = [];
    let da = 0;
    const blocco = 1000;
    while (true) {
        const { data, error } = await supabaseClient
            .from(tabella)
            .select('*')
            .order(colonnaOrdine, { ascending: true })
            .range(da, da + blocco - 1);
        if (error) throw error;
        tutti = tutti.concat(data || []);
        if (!data || data.length < blocco) break;
        da += blocco;
    }
    return tutti;
}

async function macCaricaDati() {
    const pezzi = await macFetchAll('macchine_pezzi', 'id');
    const comp = await macFetchAll('macchine_composizione', 'set_id');
    macPezzi = pezzi;
    macComposizione = comp;
    macCaricato = true;
}

// Chiamata da loadListino(): carica i conteggi per i badge "in casa"
// Se le tabelle non esistono ancora o l'utente non e' autorizzato, nessun badge.
async function macCaricaPerListino() {
    if (!macPuoGestire()) return;
    try {
        await macCaricaDati();
    } catch (error) {
        console.warn('Inventario macchine non disponibile per il listino:', error.message);
        macCaricato = false;
    }
}

// ========================================
// CONTEGGI E SET
// ========================================
function macConteggi(articoloId) {
    const c = { disponibili: 0, assegnate: 0, ordinate: 0, daOrdinare: 0, consegnate: 0, inCasa: 0 };
    macPezzi.forEach(p => {
        if (p.articolo_id !== articoloId) return;
        if (p.stato === 'IN_CASA') {
            c.inCasa++;
            if (p.cliente) c.assegnate++; else c.disponibili++;
        } else if (p.stato === 'ORDINATA') c.ordinate++;
        else if (p.stato === 'DA_ORDINARE') c.daOrdinare++;
        else if (p.stato === 'CONSEGNATA') c.consegnate++;
    });
    return c;
}

function macComponenti(setId) {
    return macComposizione.filter(r => r.set_id === setId);
}

function macIsSet(articoloId) {
    return macComposizione.some(r => r.set_id === articoloId);
}

function macIsComponente(articoloId) {
    return macComposizione.some(r => r.componente_id === articoloId);
}

// Quanti set completi si possono comporre con i componenti disponibili
function macSetComponibili(setId) {
    const comp = macComponenti(setId);
    if (comp.length === 0) return 0;
    let minimo = Infinity;
    comp.forEach(r => {
        const disp = macConteggi(r.componente_id).disponibili;
        minimo = Math.min(minimo, Math.floor(disp / (r.quantita || 1)));
    });
    return isFinite(minimo) ? minimo : 0;
}

function macDescrizioneComponenti(setId) {
    return macComponenti(setId).map(r =>
        (r.quantita > 1 ? r.quantita + ' x ' : '') + macNome(macArticolo(r.componente_id))
    ).join(' + ');
}

// Badge in piccolo nel Listino Vendite
function macBadgeListino(a) {
    if (!macCaricato || !a || !macPuoGestire()) return '';
    if (macIsSet(a.id)) {
        const n = macSetComponibili(a.id);
        return '<span class="mac-badge ' + (n > 0 ? 'mac-badge-ok' : 'mac-badge-zero') + '" title="Set componibili con i pezzi disponibili: ' +
            macEsc(macDescrizioneComponenti(a.id)) + '">&#129513; ' + n + ' set</span>';
    }
    const c = macConteggi(a.id);
    if (c.inCasa === 0 && c.ordinate === 0) return '';
    const titolo = 'In casa disponibili: ' + c.disponibili + ' - In casa assegnate a clienti: ' + c.assegnate + ' - Ordinate: ' + c.ordinate;
    return '<span class="mac-badge ' + (c.disponibili > 0 ? 'mac-badge-ok' : 'mac-badge-zero') + '" title="' + titolo + '">' +
        '&#127968; ' + c.disponibili + (c.assegnate > 0 ? ' <small>&middot; ' + c.assegnate + ' ass.</small>' : '') + '</span>';
}

// ========================================
// APERTURA SEZIONE E SCHEDE
// ========================================
async function openInventarioMacchine() {
    if (!macPuoGestire()) return;
    macSwitchTab(macSessione('macchineTab') || 'inventario', true);
    const container = document.getElementById('mac-inv-container');
    if (container && !macCaricato) {
        container.innerHTML = '<div class="card"><p style="text-align:center">&#8987; Caricamento inventario...</p></div>';
    }
    try {
        if (!listinoCaricato) await loadListino();
        await macCaricaDati();
    } catch (error) {
        console.error('Errore caricamento inventario macchine:', error);
        if (container) {
            container.innerHTML = '<div class="card"><p style="text-align:center">&#10060; Errore caricamento inventario macchine: ' +
                macEsc(error.message) + '</p><p style="text-align:center">Hai eseguito lo script <strong>inventario-macchine-setup.sql</strong> su Supabase?</p></div>';
        }
        return;
    }
    macRenderTutto();
}

function macSwitchTab(tab, senzaRender) {
    if (['inventario', 'quaderno', 'excel', 'set', 'movimenti', 'report', 'valore'].indexOf(tab) === -1) tab = 'inventario';
    macSessione('macchineTab', tab);
    document.querySelectorAll('#tabs-macchine .tab-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.macTab === tab);
    });
    document.querySelectorAll('#section-inventario-macchine .tab-content').forEach(c => {
        c.classList.toggle('active', c.id === 'tab-mac-' + tab);
    });
    if (senzaRender) return;
    if (tab === 'movimenti') macCaricaMovimenti();
    else macRenderTutto();
}

function macRenderTutto() {
    if (!macCaricato) return;
    const tab = macSessione('macchineTab') || 'inventario';
    if (tab === 'inventario') macRenderInventario();
    else if (tab === 'quaderno') macRenderQuaderno();
    else if (tab === 'set') macRenderSet();
    else if (tab === 'excel') macExcelPopolaMarchi();
    else if (tab === 'report' && typeof repApri === 'function') repApri();
    else if (tab === 'valore' && typeof valApri === 'function') valApri();
    else if (tab === 'movimenti') macCaricaMovimenti();
}

async function macRicarica() {
    try {
        await macCaricaDati();
    } catch (error) {
        console.error('Errore ricarica inventario macchine:', error);
    }
    macMovimentiCaricati = false;
    macRenderTutto();
    // PDF degli ordini da rifare (matricola arrivata o cambiata)
    if (macOrdiniDaAggiornare.size && typeof ordAggiornaPdfOrdini === 'function') {
        const ids = Array.from(macOrdiniDaAggiornare);
        macOrdiniDaAggiornare.clear();
        ordAggiornaPdfOrdini(ids);
    }
}

// ========================================
// SCHEDA INVENTARIO (stesse colonne del listino, senza prezzi)
// ========================================
const MAC_FILTRI = [
    { id: 'mac-inv-f-attrezzo', campo: 'attrezzo', etichetta: 'Tutti gli attrezzi' },
    { id: 'mac-inv-f-marchio', campo: 'marchio', etichetta: 'Tutti i marchi' },
    { id: 'mac-inv-f-alimentazione', campo: 'alimentazione', etichetta: 'Tutte le alimentazioni' },
    { id: 'mac-inv-f-tipologia', campo: 'tipologia_alimentazione', etichetta: 'Tutte le tipologie' }
];

function macValoriFiltri() {
    const v = {};
    MAC_FILTRI.forEach(f => {
        const el = document.getElementById(f.id);
        v[f.campo] = el ? el.value : '';
    });
    return v;
}

function macCorrispondeFiltri(a, valori, escludi) {
    return MAC_FILTRI.every(f => {
        if (f.campo === escludi) return true;
        const v = valori[f.campo];
        return !v || (a[f.campo] || '') === v;
    });
}

// Un articolo "conta" nell'inventario se ha pezzi non ancora consegnati
// (oppure e' un set componibile)
function macArticoloHaPezzi(a) {
    if (macIsSet(a.id)) return macSetComponibili(a.id) > 0;
    const c = macConteggi(a.id);
    return (c.inCasa + c.ordinate + c.daOrdinare) > 0;
}

function macPopolaFiltri(base, ricerca, valori) {
    MAC_FILTRI.forEach(f => {
        const select = document.getElementById(f.id);
        if (!select) return;
        const disponibili = base.filter(a => listinoCorrispondeRicerca(a, ricerca) && macCorrispondeFiltri(a, valori, f.campo));
        const opzioni = [...new Set(disponibili.map(a => a[f.campo]).filter(Boolean))].sort(listinoConfronta);
        const corrente = valori[f.campo];
        let html = '<option value="">' + f.etichetta + '</option>';
        opzioni.forEach(o => { html += '<option value="' + macEsc(o) + '">' + macEsc(o) + '</option>'; });
        if (corrente && opzioni.indexOf(corrente) === -1) {
            html += '<option value="' + macEsc(corrente) + '">' + macEsc(corrente) + '</option>';
        }
        select.innerHTML = html;
        select.value = corrente || '';
    });
}

function macRenderInventario() {
    const container = document.getElementById('mac-inv-container');
    if (!container || !macCaricato) return;

    const searchEl = document.getElementById('mac-inv-search');
    const ricerca = listinoPulisciTesto(searchEl ? searchEl.value : '') || '';
    const soloPezziEl = document.getElementById('mac-inv-solo-pezzi');
    const soloPezzi = soloPezziEl ? soloPezziEl.checked : true;
    const valori = macValoriFiltri();

    const attivi = listinoArticoli.filter(a => a.attivo);
    const base = soloPezzi ? attivi.filter(macArticoloHaPezzi) : attivi;
    macPopolaFiltri(base, ricerca, valori);

    const filtrati = base.filter(a => listinoCorrispondeRicerca(a, ricerca) && macCorrispondeFiltri(a, valori, null));

    // Riepilogo generale (tutto l'inventario, non solo il filtro)
    let tot = { disponibili: 0, assegnate: 0, ordinate: 0, daOrdinare: 0, valore: 0, senzaNetto: 0 };
    macPezzi.forEach(p => {
        if (p.stato === 'IN_CASA') {
            if (p.cliente) tot.assegnate++; else tot.disponibili++;
            let netto = p.netto_carico;
            if (netto === null || netto === undefined) {
                const a = macArticolo(p.articolo_id);
                netto = a ? a.netto_1 : null;
            }
            if (netto === null || netto === undefined) tot.senzaNetto++;
            else tot.valore += Number(netto);
        } else if (p.stato === 'ORDINATA') tot.ordinate++;
        else if (p.stato === 'DA_ORDINARE') tot.daOrdinare++;
    });
    const riepilogo = document.getElementById('mac-inv-riepilogo');
    if (riepilogo) {
        riepilogo.innerHTML =
            '<div class="mac-riep-box"><span class="mac-quadro st-incasa"></span><div><strong>' + tot.disponibili + '</strong><span>Disponibili</span></div></div>' +
            '<div class="mac-riep-box"><span class="mac-quadro st-incasa"></span><div><strong>' + tot.assegnate + '</strong><span>In casa assegnate</span></div></div>' +
            '<div class="mac-riep-box"><span class="mac-quadro st-ordinata"></span><div><strong>' + tot.ordinate + '</strong><span>Ordinate</span></div></div>' +
            '<div class="mac-riep-box"><span class="mac-quadro st-daordinare"></span><div><strong>' + tot.daOrdinare + '</strong><span>Da ordinare</span></div></div>' +
            '<div class="mac-riep-box mac-riep-valore"><div><strong>' + macEuro(tot.valore) + '</strong><span>Valore in casa (netti)' +
                (tot.senzaNetto > 0 ? ' &#9888;&#65039; ' + tot.senzaNetto + ' senza netto' : '') + '</span></div></div>';
    }

    const conteggio = document.getElementById('mac-inv-count');
    if (conteggio) conteggio.textContent = filtrati.length + (filtrati.length === 1 ? ' articolo' : ' articoli');

    if (filtrati.length === 0) {
        container.innerHTML = '<div class="card"><p style="text-align:center">' +
            (macPezzi.length === 0 && soloPezzi
                ? '&#128230; L\'inventario &egrave; vuoto. Usa <strong>Carico macchine</strong> per caricare le prime macchine, oppure <strong>Nuova voce</strong> per riportare il quadernone (anche le macchine da ordinare o ordinate per i clienti).'
                : 'Nessun articolo trovato con questi filtri') +
            '</p></div>';
        return;
    }

    // Raggruppa per attrezzo come il listino
    const gruppi = {};
    listinoOrdina(filtrati).forEach(a => {
        const g = a.attrezzo || 'SENZA ATTREZZO';
        if (!gruppi[g]) gruppi[g] = [];
        gruppi[g].push(a);
    });
    const nomi = Object.keys(gruppi).sort((a, b) => {
        if (a === 'SENZA ATTREZZO') return 1;
        if (b === 'SENZA ATTREZZO') return -1;
        return listinoConfronta(a, b);
    });

    const num = (n, classe) => n > 0 ? '<span class="mac-num ' + classe + '">' + n + '</span>' : '<span class="mac-num-zero">-</span>';

    let html = '';
    nomi.forEach(nome => {
        const lista = gruppi[nome];
        let righe = '';
        let schede = '';
        lista.forEach(a => {
            const isSet = macIsSet(a.id);
            const c = macConteggi(a.id);
            const azioni =
                '<button type="button" class="mac-azione" data-carico="' + a.id + '" title="Carica">&#10133;</button>' +
                '<button type="button" class="mac-azione" data-quaderno="' + a.id + '" title="Vedi nel quaderno">&#128210;</button>';
            let numeri;
            if (isSet) {
                const n = macSetComponibili(a.id);
                numeri = '<td colspan="4" class="mac-set-cella">&#129513; <strong>' + n + '</strong> set componibili <small>(' +
                    macEsc(macDescrizioneComponenti(a.id)) + ')</small></td>';
            } else {
                numeri =
                    '<td class="mac-col-num">' + num(c.disponibili, 'mac-num-disp') + '</td>' +
                    '<td class="mac-col-num">' + num(c.assegnate, 'mac-num-ass') + '</td>' +
                    '<td class="mac-col-num">' + num(c.ordinate, 'mac-num-ord') + '</td>' +
                    '<td class="mac-col-num">' + num(c.daOrdinare, 'mac-num-daord') + '</td>';
            }
            righe +=
                '<tr>' +
                '<td>' + listinoVal(a.marchio) + '</td>' +
                '<td>' + listinoVal(a.alimentazione) + '</td>' +
                '<td>' + listinoVal(a.tipologia_alimentazione) + '</td>' +
                '<td><strong>' + listinoVal(a.modello) + '</strong></td>' +
                '<td class="listino-col-note">' + listinoVal(a.note) + '</td>' +
                numeri +
                '<td class="mac-col-azioni">' + (isSet ? '<button type="button" class="mac-azione" data-carico="' + a.id + '" title="Carica set">&#10133;</button>' : azioni) + '</td>' +
                '</tr>';

            const sotto = [a.alimentazione, a.tipologia_alimentazione].filter(Boolean).map(macEsc).join(' &middot; ');
            schede +=
                '<div class="mac-inv-card">' +
                    '<div class="mac-inv-card-top">' +
                        '<div>' + macNomeHtml(a) + (sotto ? '<div class="mac-inv-card-sub">' + sotto + '</div>' : '') + '</div>' +
                        '<div class="mac-inv-card-btns">' + (isSet ? '<button type="button" class="mac-azione" data-carico="' + a.id + '" title="Carica set">&#10133;</button>' : azioni) + '</div>' +
                    '</div>' +
                    (isSet
                        ? '<div class="mac-inv-card-set">&#129513; <strong>' + macSetComponibili(a.id) + '</strong> set componibili<br><small>' + macEsc(macDescrizioneComponenti(a.id)) + '</small></div>'
                        : '<div class="mac-inv-card-num">' +
                            '<div><span>Disponibili</span>' + num(c.disponibili, 'mac-num-disp') + '</div>' +
                            '<div><span>Assegnate</span>' + num(c.assegnate, 'mac-num-ass') + '</div>' +
                            '<div><span>Ordinate</span>' + num(c.ordinate, 'mac-num-ord') + '</div>' +
                            '<div><span>Da ordinare</span>' + num(c.daOrdinare, 'mac-num-daord') + '</div>' +
                          '</div>') +
                '</div>';
        });

        html +=
            '<div class="listino-gruppo">' +
                '<div class="listino-gruppo-header">' +
                    '<h3>' + macEsc(nome) + '</h3>' +
                    '<span class="listino-gruppo-count">' + lista.length + (lista.length === 1 ? ' articolo' : ' articoli') + '</span>' +
                '</div>' +
                '<div class="listino-desktop"><div class="table-container">' +
                    '<table class="listino-table mac-inv-table">' +
                        '<thead><tr><th>Marchio</th><th>Alim.</th><th>Tipologia</th><th>Modello</th><th>Note</th>' +
                        '<th class="mac-col-num">Disponibili</th><th class="mac-col-num">Assegnate</th><th class="mac-col-num">Ordinate</th><th class="mac-col-num">Da ordinare</th><th></th></tr></thead>' +
                        '<tbody>' + righe + '</tbody>' +
                    '</table>' +
                '</div></div>' +
                '<div class="listino-mobile">' + schede + '</div>' +
            '</div>';
    });
    container.innerHTML = html;
}

function macResetFiltriInventario() {
    const s = document.getElementById('mac-inv-search');
    if (s) s.value = '';
    MAC_FILTRI.forEach(f => {
        const el = document.getElementById(f.id);
        if (el) el.value = '';
    });
    macRenderInventario();
}

// ========================================
// SCHEDA QUADERNO (il quadernone cartaceo)
// ========================================
const MAC_SLOT_PER_RIGA = 4;

function macQuadernoMostraConsegnate() {
    const el = document.getElementById('mac-q-consegnate');
    return el ? el.checked : true;
}

function macPezzoCorrispondeRicerca(p, a, ricerca) {
    if (!ricerca) return true;
    const testo = [
        a ? a.attrezzo : '', a ? a.marchio : '', a ? a.modello : '', a ? a.note : '',
        a ? a.alimentazione : '', a ? a.tipologia_alimentazione : '',
        p.cliente, p.matricola, p.note
    ].filter(Boolean).join(' ').toUpperCase();
    return ricerca.split(' ').every(parola => testo.indexOf(parola) !== -1);
}

function macRenderQuaderno() {
    const pagina = document.getElementById('mac-q-pagina');
    const divisori = document.getElementById('mac-q-divisori');
    if (!pagina || !divisori || !macCaricato) return;

    const searchEl = document.getElementById('mac-q-search');
    const ricerca = listinoPulisciTesto(searchEl ? searchEl.value : '') || '';
    const conConsegnate = macQuadernoMostraConsegnate();

    // Pezzi visibili
    const visibili = macPezzi.filter(p => conConsegnate || p.stato !== 'CONSEGNATA');

    // Marchi (divisori): solo quelli che hanno pezzi
    const perMarchio = {};
    visibili.forEach(p => {
        const a = macArticolo(p.articolo_id);
        const m = (a && a.marchio) || 'SENZA MARCHIO';
        perMarchio[m] = (perMarchio[m] || 0) + 1;
    });
    const marchi = Object.keys(perMarchio).sort(listinoConfronta);

    let marchioScelto = macSessione('macchineMarchio');
    if (!marchioScelto || marchi.indexOf(marchioScelto) === -1) marchioScelto = marchi[0] || '';

    divisori.innerHTML = marchi.map(m =>
        '<button type="button" class="mac-divisorio' + (!ricerca && m === marchioScelto ? ' active' : '') + '" data-marchio="' + macEsc(m) + '">' +
            '<span>' + macEsc(m) + '</span></button>'
    ).join('');

    if (visibili.length === 0) {
        pagina.innerHTML = '<p class="mac-q-vuoto">Il quaderno &egrave; ancora vuoto.<br>Usa <strong>Nuova voce</strong> per riportare le righe del quadernone, oppure <strong>Carico macchine</strong> quando arriva la merce.</p>';
        return;
    }

    // Con la ricerca si cerca in tutti i marchi (anche per nome cliente o matricola)
    const pezziPagina = visibili.filter(p => {
        const a = macArticolo(p.articolo_id);
        if (ricerca) return macPezzoCorrispondeRicerca(p, a, ricerca);
        return ((a && a.marchio) || 'SENZA MARCHIO') === marchioScelto;
    });

    if (pezziPagina.length === 0) {
        pagina.innerHTML = '<p class="mac-q-vuoto">Nessuna riga trovata per &quot;' + macEsc(ricerca) + '&quot;</p>';
        return;
    }

    // attrezzo -> articolo -> pezzi
    const perArticolo = {};
    pezziPagina.forEach(p => {
        if (!perArticolo[p.articolo_id]) perArticolo[p.articolo_id] = [];
        perArticolo[p.articolo_id].push(p);
    });
    const articoli = listinoOrdina(Object.keys(perArticolo).map(id => macArticolo(Number(id))).filter(Boolean));
    const perAttrezzo = {};
    articoli.forEach(a => {
        const g = (a.attrezzo || 'SENZA ATTREZZO') + (ricerca ? '|' + (a.marchio || '') : '');
        if (!perAttrezzo[g]) perAttrezzo[g] = [];
        perAttrezzo[g].push(a);
    });

    let html = '';
    Object.keys(perAttrezzo).forEach(chiave => {
        const lista = perAttrezzo[chiave];
        const primo = lista[0];
        const titolo = [(primo.attrezzo || 'SENZA ATTREZZO'), primo.marchio].filter(Boolean).join(' ');
        html += '<div class="mac-q-attrezzo"><h3 class="mac-evidenziatore">' + macEsc(titolo) + '</h3>';
        lista.forEach(a => {
            const pezzi = perArticolo[a.id].slice().sort((x, y) => x.id - y.id);
            const c = macConteggi(a.id);
            const chips = [];
            if (c.disponibili) chips.push('<span class="mac-chip mac-chip-disp">' + c.disponibili + ' disp.</span>');
            if (c.assegnate) chips.push('<span class="mac-chip mac-chip-ass">' + c.assegnate + ' assegn.</span>');
            if (c.ordinate) chips.push('<span class="mac-chip mac-chip-ord">' + c.ordinate + ' ordin.</span>');
            if (c.daOrdinare) chips.push('<span class="mac-chip mac-chip-daord">' + c.daOrdinare + ' da ord.</span>');

            let slot = pezzi.map(macSlotHtml).join('');
            const totale = Math.ceil((pezzi.length + 1) / MAC_SLOT_PER_RIGA) * MAC_SLOT_PER_RIGA;
            for (let i = pezzi.length; i < totale; i++) {
                slot += '<button type="button" class="mac-slot mac-slot-vuoto" data-nuovo="' + a.id + '" title="Aggiungi una riga">' +
                    '<span class="mac-quadro"></span><span class="mac-nome">' + (i === pezzi.length ? '<span class="mac-plus">+</span>' : '') + '</span></button>';
            }

            html +=
                '<div class="mac-q-modello">' +
                    '<div class="mac-q-modello-titolo">' +
                        '<span class="mac-q-pallino"></span>' +
                        '<strong>' + listinoVal(a.modello || a.note) + '</strong>' +
                        (a.modello && a.note ? '<span class="mac-art-note">' + macEsc(a.note) + '</span>' : '') +
                        '<span class="mac-q-chips">' + chips.join('') + '</span>' +
                    '</div>' +
                    '<div class="mac-q-griglia">' + slot + '</div>' +
                '</div>';
        });
        html += '</div>';
    });
    pagina.innerHTML = html;
}

function macSlotHtml(p) {
    const st = MAC_STATI[p.stato] || MAC_STATI.IN_CASA;
    const disponibile = p.stato === 'IN_CASA' && !p.cliente;
    const titolo = [
        st.etichetta + (disponibile ? ' - disponibile' : ''),
        p.cliente ? 'Cliente: ' + p.cliente : '',
        p.matricola ? 'Matricola: ' + p.matricola : '',
        p.set_id ? 'Venduta nel ' + macNome(macArticolo(p.set_id)) : '',
        (p.ordine_id && typeof ordNumeroDiPezzo === 'function' && ordNumeroDiPezzo(p)) ? 'Ordine N. ' + ordNumeroDiPezzo(p) : '',
        p.note ? 'Note: ' + p.note : ''
    ].filter(Boolean).join('\n');
    return '<button type="button" class="mac-slot" data-pezzo="' + p.id + '" title="' + macEsc(titolo) + '">' +
        '<span class="mac-quadro ' + st.classe + '">' + (p.stato === 'CONSEGNATA' ? '&#10005;' : '') + '</span>' +
        '<span class="mac-nome' + (disponibile ? ' mac-nome-libera' : '') + '">' +
            (disponibile ? 'disponibile' : macEsc(p.cliente || '')) +
            (p.set_id ? '<span class="mac-tag-set">SET</span>' : '') +
            (p.matricola ? '<span class="mac-tag-matr" title="Matricola ' + macEsc(p.matricola) + '">&#35;</span>' : '') +
        '</span></button>';
}

function macApriQuadernoArticolo(articoloId) {
    const a = macArticolo(articoloId);
    if (!a) return;
    macSessione('macchineMarchio', a.marchio || 'SENZA MARCHIO');
    const s = document.getElementById('mac-q-search');
    if (s) s.value = '';
    macSwitchTab('quaderno');
    setTimeout(() => {
        const el = document.querySelector('#mac-q-pagina [data-nuovo="' + a.id + '"], #mac-q-pagina [data-pezzo]');
        const blocco = el ? el.closest('.mac-q-modello') : null;
        const tutti = Array.from(document.querySelectorAll('#mac-q-pagina .mac-q-modello'));
        const giusto = tutti.find(b => b.querySelector('[data-nuovo="' + a.id + '"]')) || blocco;
        if (giusto) {
            giusto.scrollIntoView({ behavior: 'smooth', block: 'center' });
            giusto.classList.add('mac-lampeggia');
            setTimeout(() => giusto.classList.remove('mac-lampeggia'), 1800);
        }
    }, 80);
}

// ========================================
// SCELTA ARTICOLO DAL LISTINO (campo di ricerca riutilizzabile)
// ========================================
const macPicker = {}; // id input -> { lista, filtro, onSelect }

// opzioni.onPezzo: se c'e', la ricerca trova anche le macchine in casa per MATRICOLA (es. Ordini Clienti)
function macPickerImposta(inputId, listaId, filtro, onSelect, opzioni) {
    macPicker[inputId] = { listaId: listaId, filtro: filtro, onSelect: onSelect, onPezzo: opzioni && opzioni.onPezzo };
    const input = document.getElementById(inputId);
    const lista = document.getElementById(listaId);
    if (!input || !lista || input.dataset.macPicker) return;
    input.dataset.macPicker = '1';
    input.addEventListener('input', () => macPickerMostra(inputId));
    input.addEventListener('focus', () => macPickerMostra(inputId));
    lista.addEventListener('click', (e) => {
        const cfg = macPicker[inputId];
        const bp = e.target.closest('[data-pezzo]');
        if (bp) {
            const p = macPezzi.find(x => x.id === parseInt(bp.dataset.pezzo, 10));
            lista.classList.add('hidden');
            lista.innerHTML = '';
            if (p && cfg && cfg.onPezzo) cfg.onPezzo(p);
            return;
        }
        const btn = e.target.closest('[data-art]');
        if (!btn) return;
        const a = macArticolo(parseInt(btn.dataset.art, 10));
        lista.classList.add('hidden');
        lista.innerHTML = '';
        if (a && cfg && cfg.onSelect) cfg.onSelect(a);
    });
}

function macPickerMostra(inputId) {
    const cfg = macPicker[inputId];
    const input = document.getElementById(inputId);
    const lista = document.getElementById(cfg ? cfg.listaId : '');
    if (!cfg || !input || !lista) return;
    const ricerca = listinoPulisciTesto(input.value) || '';
    // Elenco solo dopo almeno 2 lettere (cosi' non copre i pulsanti sotto)
    if (ricerca.length < 2) {
        lista.innerHTML = '';
        lista.classList.add('hidden');
        return;
    }
    const trovati = listinoOrdina(listinoArticoli.filter(a =>
        a.attivo && listinoCorrispondeRicerca(a, ricerca) && (!cfg.filtro || cfg.filtro(a))
    ));
    const max = 40;
    let html = trovati.slice(0, max).map(a => {
        const c = macConteggi(a.id);
        const extra = macIsSet(a.id) ? '<span class="mac-picker-set">SET</span>' :
            (c.disponibili > 0 ? '<span class="mac-picker-disp">' + c.disponibili + ' disp.</span>' : '');
        return '<button type="button" class="mac-picker-voce" data-art="' + a.id + '">' +
            '<span class="mac-picker-attrezzo">' + listinoVal(a.attrezzo) + '</span>' +
            '<span>' + macNomeHtml(a) + '</span>' + extra + '</button>';
    }).join('');
    if (trovati.length > max) html += '<div class="mac-picker-vuoto">... altri ' + (trovati.length - max) + ': scrivi di pi&ugrave; per restringere</div>';
    // Ricerca per matricola (macchine del quaderno)
    let htmlPezzi = '';
    if (cfg.onPezzo) {
        const norm = v => String(v || '').toUpperCase().replace(/[\s\-\/.]/g, '');
        const cerca = norm(ricerca);
        const pezzi = cerca.length >= 2 ? macPezzi.filter(p => p.matricola && norm(p.matricola).indexOf(cerca) !== -1)
            .sort((x, y) => (norm(x.matricola) === cerca ? 0 : 1) - (norm(y.matricola) === cerca ? 0 : 1)).slice(0, 10) : [];
        htmlPezzi = pezzi.map(p => {
            const a = macArticolo(p.articolo_id);
            const nome = a ? macNomeHtml(a) : 'articolo non trovato';
            const libera = p.stato === 'IN_CASA' && !p.cliente;
            if (libera) {
                return '<button type="button" class="mac-picker-voce mac-picker-matr" data-pezzo="' + p.id + '">' +
                    '<span class="mac-picker-attrezzo">MATR. ' + macEsc(p.matricola) + '</span><span>' + nome + '</span>' +
                    '<span class="mac-picker-disp">in casa</span></button>';
            }
            const dove = p.stato === 'CONSEGNATA' ? 'consegnata' : (p.stato === 'IN_CASA' ? 'gi&agrave; assegnata' : 'ordinata');
            return '<div class="mac-picker-vuoto">Matr. ' + macEsc(p.matricola) + ' &middot; ' + nome + ' &middot; ' + dove +
                (p.cliente ? ' a ' + macEsc(p.cliente) : '') + '</div>';
        }).join('');
    }
    if (trovati.length === 0) html = htmlPezzi ? '' : '<div class="mac-picker-vuoto">Nessun articolo trovato nel listino</div>';
    html = htmlPezzi + html;
    lista.innerHTML = html;
    lista.classList.remove('hidden');
}

function macPickerChiudi(inputId) {
    const cfg = macPicker[inputId];
    const lista = cfg ? document.getElementById(cfg.listaId) : null;
    if (lista) { lista.classList.add('hidden'); lista.innerHTML = ''; }
}

// Box "articolo scelto" con pulsante Cambia
function macArticoloSceltoHtml(a, cambiaAttr) {
    return '<div class="mac-art-scelto">' +
        '<div><span class="mac-picker-attrezzo">' + listinoVal(a.attrezzo) + '</span>' + macNomeHtml(a) + '</div>' +
        (cambiaAttr ? '<button type="button" class="btn-back mac-btn-piccolo" ' + cambiaAttr + '>Cambia</button>' : '') +
        '</div>';
}

// ========================================
// SCANNER MATRICOLA (QR code / codice a barre)
// ========================================
let macScanner = null;
let macScanTarget = null;

function macScanApri(targetId) {
    macScanTarget = targetId;
    document.getElementById('mac-scan-modal').classList.remove('hidden');
    if (typeof Html5Qrcode === 'undefined') {
        showCustomAlert('Lettore non disponibile su questo dispositivo.', 'Errore', '&#10060;');
        return;
    }
    // Ferma lo scanner principale se fosse acceso
    if (typeof stopScanner === 'function') stopScanner();
    macScanner = new Html5Qrcode('mac-scan-reader');
    macScanner.start(
        { facingMode: 'environment' },
        { fps: 15, qrbox: { width: 260, height: 160 } },
        (testo) => {
            const el = document.getElementById(macScanTarget);
            if (el) {
                el.value = String(testo).trim().toUpperCase();
                el.dispatchEvent(new Event('input'));
            }
            if (navigator.vibrate) navigator.vibrate(80);
            macScanChiudi();
        },
        () => {}
    ).catch(err => {
        console.error('Errore avvio lettore matricola:', err);
        macScanChiudi();
        showCustomAlert('Impossibile avviare la fotocamera.<br>Controlla i permessi, oppure scrivi la matricola a mano.', 'Errore', '&#10060;');
    });
}

function macScanChiudi() {
    document.getElementById('mac-scan-modal').classList.add('hidden');
    if (macScanner) {
        const s = macScanner;
        macScanner = null;
        if (s.isScanning) {
            s.stop().then(() => s.clear()).catch(err => console.error('Errore stop lettore matricola:', err));
        } else {
            try { s.clear(); } catch (e) { /* niente */ }
        }
    }
}

// ========================================
// REGISTRO MOVIMENTI
// ========================================
async function macRegistra(righe) {
    if (!righe || righe.length === 0) return;
    const utente = macUtente();
    righe.forEach(r => { r.utente = utente; });
    const { error } = await supabaseClient.from('macchine_movimenti').insert(righe);
    if (error) console.error('Errore registro movimenti macchine:', error);
    macMovimentiCaricati = false;
}

// ========================================
// FINESTRA PEZZO (nuova voce / modifica riga del quaderno)
// ========================================
let macPezzoInModifica = null;   // pezzo esistente (null = nuova voce)
let macPezzoArticolo = null;     // articolo scelto
let macPezzoStato = 'IN_CASA';

function macApriNuovaVoce(articoloId) {
    macPezzoInModifica = null;
    macPezzoArticolo = articoloId ? macArticolo(articoloId) : null;
    macPezzoStato = 'DA_ORDINARE';
    document.getElementById('mac-pezzo-titolo').innerHTML = '&#10133; Nuova voce';
    ['cliente', 'matricola', 'netto', 'note'].forEach(c => { document.getElementById('mac-pezzo-' + c).value = ''; });
    document.getElementById('mac-pezzo-qta').value = '1';
    document.getElementById('mac-pezzo-qta-box').classList.remove('hidden');
    document.getElementById('mac-pezzo-elimina').classList.add('hidden');
    document.getElementById('mac-pezzo-storico').innerHTML = '';
    document.getElementById('mac-pezzo-art-search').value = '';
    macPezzoAggiornaArticolo();
    macPezzoAggiornaStato();
    document.getElementById('mac-pezzo-modal').classList.remove('hidden');
    if (!macPezzoArticolo) setTimeout(() => document.getElementById('mac-pezzo-art-search').focus(), 50);
}

function macApriPezzo(id) {
    const p = macPezzi.find(x => x.id === id);
    if (!p) return;
    macPezzoInModifica = p;
    macPezzoArticolo = macArticolo(p.articolo_id);
    macPezzoStato = p.stato;
    document.getElementById('mac-pezzo-titolo').innerHTML = '&#9997;&#65039; Riga del quaderno';
    document.getElementById('mac-pezzo-cliente').value = p.cliente || '';
    document.getElementById('mac-pezzo-matricola').value = p.matricola || '';
    document.getElementById('mac-pezzo-netto').value = listinoNumeroPerForm(p.netto_carico);
    document.getElementById('mac-pezzo-note').value = p.note || '';
    document.getElementById('mac-pezzo-qta-box').classList.add('hidden');
    document.getElementById('mac-pezzo-elimina').classList.remove('hidden');
    macPezzoAggiornaArticolo();
    macPezzoAggiornaStato();
    macPezzoCaricaStorico(p.id);
    document.getElementById('mac-pezzo-modal').classList.remove('hidden');
}

function macChiudiPezzo() {
    document.getElementById('mac-pezzo-modal').classList.add('hidden');
    macPickerChiudi('mac-pezzo-art-search');
    macPezzoInModifica = null;
    macPezzoArticolo = null;
}

function macPezzoAggiornaArticolo() {
    const box = document.getElementById('mac-pezzo-art-scelto');
    const ricerca = document.getElementById('mac-pezzo-art-ricerca');
    const setInfo = document.getElementById('mac-pezzo-set-info');
    const a = macPezzoArticolo;
    if (a) {
        box.innerHTML = macArticoloSceltoHtml(a, macPezzoInModifica ? '' : 'data-mac-cambia="pezzo"');
        box.classList.remove('hidden');
        ricerca.classList.add('hidden');
    } else {
        box.innerHTML = '';
        box.classList.add('hidden');
        ricerca.classList.remove('hidden');
    }
    // Set: si creano i componenti
    if (a && !macPezzoInModifica && macIsSet(a.id)) {
        setInfo.innerHTML = '&#129513; &Egrave; un <strong>set</strong>: verr&agrave; creata una riga per ogni componente (' +
            macEsc(macDescrizioneComponenti(a.id)) + '), tutte con lo stesso cliente.';
        setInfo.classList.remove('hidden');
    } else if (macPezzoInModifica && macPezzoInModifica.set_id) {
        setInfo.innerHTML = '&#129513; Venduta nel <strong>' + macEsc(macNome(macArticolo(macPezzoInModifica.set_id))) + '</strong>';
        setInfo.classList.remove('hidden');
    } else {
        setInfo.innerHTML = '';
        setInfo.classList.add('hidden');
    }
    // Netto proposto = netto 1 del listino
    const netto = document.getElementById('mac-pezzo-netto');
    if (a && !macPezzoInModifica && !netto.value) netto.value = listinoNumeroPerForm(a.netto_1);
    document.getElementById('mac-pezzo-netto-box').classList.toggle('hidden', !!(a && !macPezzoInModifica && macIsSet(a.id)));
}

function macPezzoAggiornaStato() {
    document.querySelectorAll('#mac-pezzo-stati [data-stato]').forEach(b => {
        b.classList.toggle('active', b.dataset.stato === macPezzoStato);
    });
    const aiuto = document.getElementById('mac-pezzo-stato-aiuto');
    const st = MAC_STATI[macPezzoStato];
    if (aiuto && st) aiuto.textContent = st.aiuto;
    const serveNome = macPezzoStato !== 'IN_CASA';
    document.getElementById('mac-pezzo-cliente-label').innerHTML = 'Cliente' + (serveNome ? ' *' : ' <small>(vuoto = disponibile alla vendita)</small>');
}

async function macPezzoCaricaStorico(pezzoId) {
    const box = document.getElementById('mac-pezzo-storico');
    box.innerHTML = '';
    const { data, error } = await supabaseClient.from('macchine_movimenti').select('*')
        .eq('pezzo_id', pezzoId).order('created_at', { ascending: false }).limit(20);
    if (error || !data || data.length === 0) return;
    box.innerHTML = '<details><summary>&#128203; Storico di questa riga (' + data.length + ')</summary><ul>' +
        data.map(m => '<li><strong>' + macDataOra(m.created_at) + '</strong> ' + macEsc(m.tipo) +
            (m.dettaglio ? ' - ' + macEsc(m.dettaglio) : '') + ' <small>(' + macEsc(macChi(m.utente)) + ')</small></li>').join('') +
        '</ul></details>';
}

function macStatoTesto(s) {
    return s && MAC_STATI[s] ? MAC_STATI[s].etichetta.toUpperCase() : '-';
}

async function macSalvaPezzo(e) {
    if (e) e.preventDefault();
    const a = macPezzoArticolo;
    const p = macPezzoInModifica;
    const errori = [];
    if (!a) errori.push('Scegli l\'articolo dal listino');

    const cliente = listinoPulisciTesto(document.getElementById('mac-pezzo-cliente').value);
    const matricola = listinoPulisciTesto(document.getElementById('mac-pezzo-matricola').value);
    const note = listinoPulisciTesto(document.getElementById('mac-pezzo-note').value);
    let netto = listinoParseNumero(document.getElementById('mac-pezzo-netto').value);
    if (typeof netto === 'number' && isNaN(netto)) { errori.push('Il netto non &egrave; un numero valido'); netto = null; }
    const stato = macPezzoStato;
    if (stato !== 'IN_CASA' && !cliente) errori.push('Per lo stato &quot;' + MAC_STATI[stato].etichetta + '&quot; serve il nome del cliente');

    let qta = 1;
    if (!p) {
        qta = parseInt(document.getElementById('mac-pezzo-qta').value, 10);
        if (!qta || qta < 1 || qta > MAC_MAX_QTA) errori.push('Quantit&agrave; non valida (da 1 a ' + MAC_MAX_QTA + ')');
        if (matricola && qta > 1) errori.push('Con la matricola la quantit&agrave; deve essere 1');
    }
    if (errori.length) {
        await showCustomAlert(errori.join('<br>'), 'Controlla i dati', '&#9888;&#65039;');
        return;
    }

    const adesso = new Date().toISOString();
    const utente = macUtente();
    const btn = document.getElementById('mac-pezzo-salva');
    btn.disabled = true;
    try {
        if (!p) {
            // NUOVA VOCE (se e' un set: una riga per ogni componente)
            const isSet = macIsSet(a.id);
            const elenco = isSet
                ? macComponenti(a.id).map(r => ({ art: macArticolo(r.componente_id), n: r.quantita * qta }))
                : [{ art: a, n: qta }];
            const nuovi = [];
            elenco.forEach(x => {
                if (!x.art) return;
                for (let i = 0; i < x.n; i++) {
                    const inCasa = stato === 'IN_CASA' || stato === 'CONSEGNATA';
                    nuovi.push({
                        articolo_id: x.art.id,
                        stato: stato,
                        cliente: cliente,
                        matricola: isSet ? null : matricola,
                        netto_carico: inCasa ? (isSet ? (x.art.netto_1 !== undefined ? x.art.netto_1 : null) : netto) : null,
                        set_id: isSet ? a.id : null,
                        note: note,
                        data_carico: inCasa ? adesso : null,
                        data_consegna: stato === 'CONSEGNATA' ? adesso : null,
                        updated_at: adesso,
                        updated_by: utente
                    });
                }
            });
            const { data, error } = await supabaseClient.from('macchine_pezzi').insert(nuovi).select('*');
            if (error) throw error;
            await macRegistra((data || []).map(r => ({
                pezzo_id: r.id, articolo_id: r.articolo_id, tipo: 'NUOVA VOCE', stato_prima: null, stato_dopo: r.stato,
                cliente: r.cliente, matricola: r.matricola, netto: r.netto_carico,
                dettaglio: macStatoTesto(r.stato) + (r.cliente ? ' - ' + r.cliente : ' - DISPONIBILE') + (isSet ? ' (' + macNome(a) + ')' : '')
            })));
        } else {
            // MODIFICA
            const agg = { stato: stato, cliente: cliente, matricola: matricola, netto_carico: netto, note: note, updated_at: adesso, updated_by: utente };
            const eraInCasa = p.stato === 'IN_CASA' || p.stato === 'CONSEGNATA';
            const oraInCasa = stato === 'IN_CASA' || stato === 'CONSEGNATA';
            if (oraInCasa && !eraInCasa) agg.data_carico = adesso;
            if (!oraInCasa) agg.data_carico = null;
            if (stato === 'CONSEGNATA' && p.stato !== 'CONSEGNATA') agg.data_consegna = adesso;
            if (stato !== 'CONSEGNATA') agg.data_consegna = null;
            if (oraInCasa && agg.netto_carico === null && a) agg.netto_carico = a.netto_1;

            const { error } = await supabaseClient.from('macchine_pezzi').update(agg).eq('id', p.id);
            if (error) throw error;
            if (p.ordine_id && (p.matricola || '') !== (matricola || '')) macOrdiniDaAggiornare.add(p.ordine_id);

            const cambi = [];
            if (p.stato !== stato) cambi.push(macStatoTesto(p.stato) + ' \u2192 ' + macStatoTesto(stato));
            if ((p.cliente || '') !== (cliente || '')) cambi.push('CLIENTE ' + (p.cliente || 'NESSUNO') + ' \u2192 ' + (cliente || 'NESSUNO'));
            if ((p.matricola || '') !== (matricola || '')) cambi.push('MATRICOLA ' + (matricola || 'TOLTA'));
            if (!listinoStessoNumero(p.netto_carico, agg.netto_carico)) cambi.push('NETTO ' + (agg.netto_carico === null ? '-' : agg.netto_carico));
            if ((p.note || '') !== (note || '')) cambi.push('NOTE');
            if (cambi.length) {
                await macRegistra([{
                    pezzo_id: p.id, articolo_id: p.articolo_id, tipo: 'MODIFICA', stato_prima: p.stato, stato_dopo: stato,
                    cliente: cliente, matricola: matricola, netto: agg.netto_carico, dettaglio: cambi.join(' - ')
                }]);
            }
        }
    } catch (error) {
        console.error('Errore salvataggio riga quaderno:', error);
        btn.disabled = false;
        await showCustomAlert('Errore durante il salvataggio:<br>' + macEsc(error.message), 'Errore', '&#10060;');
        return;
    }
    btn.disabled = false;
    macChiudiPezzo();
    await macRicarica();
}

async function macEliminaPezzo() {
    const p = macPezzoInModifica;
    if (!p) return;
    const a = macArticolo(p.articolo_id);
    if (!window.confirm('Eliminare questa riga del quaderno?\n\n' + macNome(a) + (p.cliente ? ' - ' + p.cliente : '') +
        '\n\nUsalo solo per correggere un errore (resta comunque nel registro movimenti).')) return;
    const { error } = await supabaseClient.from('macchine_pezzi').delete().eq('id', p.id);
    if (error) {
        await showCustomAlert('Errore durante la cancellazione:<br>' + macEsc(error.message), 'Errore', '&#10060;');
        return;
    }
    await macRegistra([{
        pezzo_id: p.id, articolo_id: p.articolo_id, tipo: 'CANCELLATA', stato_prima: p.stato, stato_dopo: null,
        cliente: p.cliente, matricola: p.matricola, netto: p.netto_carico,
        dettaglio: 'RIGA ELIMINATA (' + macStatoTesto(p.stato) + (p.cliente ? ' - ' + p.cliente : '') + ')'
    }]);
    macChiudiPezzo();
    await macRicarica();
}

// ========================================
// CARICO MACCHINE
// ========================================
let macCaricoArticolo = null;

function macApriCarico(articoloId) {
    macCaricoArticolo = articoloId ? macArticolo(articoloId) : null;
    document.getElementById('mac-carico-qta').value = '1';
    document.getElementById('mac-carico-netto').value = '';
    document.getElementById('mac-carico-assegna').checked = true;
    document.getElementById('mac-carico-art-search').value = '';
    macCaricoAggiorna();
    document.getElementById('mac-carico-modal').classList.remove('hidden');
    if (!macCaricoArticolo) setTimeout(() => document.getElementById('mac-carico-art-search').focus(), 50);
}

function macChiudiCarico() {
    document.getElementById('mac-carico-modal').classList.add('hidden');
    macPickerChiudi('mac-carico-art-search');
    macCaricoArticolo = null;
}

// Pezzi in attesa (clienti che aspettano quella macchina): prima le ORDINATE, poi le DA ORDINARE
function macInAttesa(articoloId) {
    const ordina = (x, y) => x.id - y.id;
    const ordinate = macPezzi.filter(p => p.articolo_id === articoloId && p.stato === 'ORDINATA').sort(ordina);
    const daOrdinare = macPezzi.filter(p => p.articolo_id === articoloId && p.stato === 'DA_ORDINARE').sort(ordina);
    return ordinate.concat(daOrdinare);
}

// Elenco di cosa caricare: [{ art, n, netto }]
function macCaricoElenco() {
    const a = macCaricoArticolo;
    if (!a) return [];
    const qta = parseInt(document.getElementById('mac-carico-qta').value, 10) || 0;
    if (macIsSet(a.id)) {
        return macComponenti(a.id).map(r => {
            const art = macArticolo(r.componente_id);
            return { art: art, n: r.quantita * qta, netto: art ? art.netto_1 : null };
        }).filter(x => x.art);
    }
    const netto = listinoParseNumero(document.getElementById('mac-carico-netto').value);
    return [{ art: a, n: qta, netto: (typeof netto === 'number' && !isNaN(netto)) ? netto : null }];
}

function macCaricoAggiorna() {
    const a = macCaricoArticolo;
    const box = document.getElementById('mac-carico-art-scelto');
    const ricerca = document.getElementById('mac-carico-art-ricerca');
    const dettagli = document.getElementById('mac-carico-dettagli');
    if (!a) {
        box.innerHTML = '';
        box.classList.add('hidden');
        ricerca.classList.remove('hidden');
        dettagli.classList.add('hidden');
        return;
    }
    box.innerHTML = macArticoloSceltoHtml(a, 'data-mac-cambia="carico"');
    box.classList.remove('hidden');
    ricerca.classList.add('hidden');
    dettagli.classList.remove('hidden');

    const isSet = macIsSet(a.id);
    const nettoEl = document.getElementById('mac-carico-netto');
    if (!isSet && !nettoEl.value) nettoEl.value = listinoNumeroPerForm(a.netto_1);
    document.getElementById('mac-carico-netto-box').classList.toggle('hidden', isSet);
    document.getElementById('mac-carico-qta-label').innerHTML = isSet ? 'Quanti set *' : 'Quantit&agrave; *';

    const setInfo = document.getElementById('mac-carico-set-info');
    if (isSet) {
        setInfo.innerHTML = '&#129513; &Egrave; un <strong>set</strong>: in magazzino vengono caricati i singoli componenti, ognuno con il suo netto 1.';
        setInfo.classList.remove('hidden');
    } else {
        setInfo.classList.add('hidden');
    }
    macCaricoMatricole();
    macCaricoAnteprima();
}

// Campi matricola facoltativi (uno per macchina), non per i set
function macCaricoMatricole() {
    const box = document.getElementById('mac-carico-matricole');
    const a = macCaricoArticolo;
    const qta = parseInt(document.getElementById('mac-carico-qta').value, 10) || 0;
    if (!a || macIsSet(a.id) || qta < 1 || qta > MAC_MAX_QTA) {
        box.innerHTML = a && macIsSet(a.id) ? '<p class="mac-aiuto">Le matricole dei componenti si inseriscono dopo, toccando il quadratino nel quaderno.</p>' : '';
        return;
    }
    const vecchi = Array.from(box.querySelectorAll('input')).map(i => i.value);
    let html = '<label>Matricole <small>(facoltative: scrivi, leggi il QR o il codice a barre)</small></label>';
    for (let i = 0; i < qta; i++) {
        html += '<div class="mac-matr-riga">' +
            '<span class="mac-matr-num">' + (i + 1) + '</span>' +
            '<input type="text" id="mac-carico-matr-' + i + '" value="' + macEsc(vecchi[i] || '') + '" placeholder="Matricola" autocomplete="off">' +
            '<button type="button" class="mac-btn-scan" data-scan="mac-carico-matr-' + i + '" title="Leggi con la fotocamera">&#128247;</button>' +
            '</div>';
    }
    box.innerHTML = html;
}

function macCaricoAnteprima() {
    const box = document.getElementById('mac-carico-anteprima');
    const assegna = document.getElementById('mac-carico-assegna').checked;
    const elenco = macCaricoElenco();
    if (elenco.length === 0 || elenco.every(x => x.n < 1)) { box.innerHTML = ''; return; }
    let html = '<strong>Cosa succede:</strong><ul>';
    elenco.forEach(x => {
        const attesa = assegna ? macInAttesa(x.art.id) : [];
        const usati = attesa.slice(0, x.n);
        const liberi = x.n - usati.length;
        html += '<li><strong>' + macEsc(macNome(x.art)) + '</strong>: ' + x.n + ' pezz' + (x.n === 1 ? 'o' : 'i');
        if (usati.length) {
            html += '<br>&#128100; vanno ai clienti che aspettano: ' + usati.map(p =>
                '<span class="mac-anteprima-cliente"><span class="mac-quadro mac-quadro-mini ' + MAC_STATI[p.stato].classe + '"></span>' + macEsc(p.cliente || '-') + '</span>'
            ).join(' ');
        }
        if (liberi > 0) html += '<br>&#9989; ' + liberi + ' disponibil' + (liberi === 1 ? 'e' : 'i') + ' alla vendita';
        if (!assegna && macInAttesa(x.art.id).length) {
            html += '<br><small>&#9888;&#65039; ' + macInAttesa(x.art.id).length + ' clienti in attesa NON verranno assegnati</small>';
        }
        html += '</li>';
    });
    html += '</ul>';
    box.innerHTML = html;
}

// Carica N pezzi di UN articolo: prima ai clienti in attesa (se richiesto), il resto disponibili.
// Aggiorna anche macPezzi in memoria, cosi' piu' carichi di fila non assegnano due volte lo stesso cliente.
// opz: { art, n, netto, matricole: [], assegna, setArt, dettaglio }
async function macCaricaPezzi(opz) {
    const adesso = new Date().toISOString();
    const utente = macUtente();
    const matricole = opz.matricole || [];
    const extra = (opz.setArt ? ' (' + macNome(opz.setArt) + ')' : '') + (opz.dettaglio ? ' - ' + opz.dettaglio : '');
    const attesa = opz.assegna ? macInAttesa(opz.art.id).slice(0, opz.n) : [];
    const log = [];

    // 1. Clienti in attesa: diventano IN CASA (assegnate)
    for (let i = 0; i < attesa.length; i++) {
        const p = attesa[i];
        const statoPrima = p.stato;
        const agg = { stato: 'IN_CASA', data_carico: adesso, netto_carico: opz.netto, updated_at: adesso, updated_by: utente };
        if (matricole[i]) agg.matricola = matricole[i];
        if (p.ordine_id && agg.matricola) macOrdiniDaAggiornare.add(p.ordine_id);
        const { error } = await supabaseClient.from('macchine_pezzi').update(agg).eq('id', p.id);
        if (error) throw error;
        Object.assign(p, agg);
        log.push({
            pezzo_id: p.id, articolo_id: opz.art.id, tipo: 'CARICO', stato_prima: statoPrima, stato_dopo: 'IN_CASA',
            cliente: p.cliente, matricola: p.matricola, netto: opz.netto,
            dettaglio: 'ARRIVATA PER ' + (p.cliente || '-') + extra
        });
    }

    // 2. Il resto: disponibili alla vendita
    const nuovi = [];
    for (let i = attesa.length; i < opz.n; i++) {
        nuovi.push({
            articolo_id: opz.art.id, stato: 'IN_CASA', cliente: null,
            matricola: matricole[i] || null,
            netto_carico: opz.netto, data_carico: adesso, updated_at: adesso, updated_by: utente
        });
    }
    if (nuovi.length) {
        const { data, error } = await supabaseClient.from('macchine_pezzi').insert(nuovi).select('*');
        if (error) throw error;
        (data || []).forEach(r => {
            macPezzi.push(r);
            log.push({
                pezzo_id: r.id, articolo_id: opz.art.id, tipo: 'CARICO', stato_prima: null, stato_dopo: 'IN_CASA',
                cliente: null, matricola: r.matricola, netto: opz.netto, dettaglio: 'DISPONIBILE' + extra
            });
        });
    }
    await macRegistra(log);
    return { clienti: attesa.map(p => p.cliente || '-'), disponibili: nuovi.length };
}

async function macSalvaCarico(e) {
    if (e) e.preventDefault();
    const a = macCaricoArticolo;
    const errori = [];
    if (!a) errori.push('Scegli l\'articolo dal listino');
    const qta = parseInt(document.getElementById('mac-carico-qta').value, 10);
    if (!qta || qta < 1 || qta > MAC_MAX_QTA) errori.push('Quantit&agrave; non valida (da 1 a ' + MAC_MAX_QTA + ')');
    if (a && !macIsSet(a.id)) {
        const n = listinoParseNumero(document.getElementById('mac-carico-netto').value);
        if (typeof n === 'number' && isNaN(n)) errori.push('Il netto non &egrave; un numero valido');
    }
    if (errori.length) {
        await showCustomAlert(errori.join('<br>'), 'Controlla i dati', '&#9888;&#65039;');
        return;
    }

    const assegna = document.getElementById('mac-carico-assegna').checked;
    const isSet = macIsSet(a.id);
    const matricole = [];
    if (!isSet) {
        for (let i = 0; i < qta; i++) {
            const el = document.getElementById('mac-carico-matr-' + i);
            matricole.push(el ? listinoPulisciTesto(el.value) : null);
        }
        const doppie = matricole.filter(Boolean).filter((m, i, arr) => arr.indexOf(m) !== i);
        if (doppie.length) {
            await showCustomAlert('Matricola ripetuta: ' + macEsc(doppie[0]), 'Controlla i dati', '&#9888;&#65039;');
            return;
        }
    }

    const elenco = macCaricoElenco();
    const btn = document.getElementById('mac-carico-salva');
    btn.disabled = true;
    const riepilogo = [];
    try {
        for (const x of elenco) {
            const res = await macCaricaPezzi({
                art: x.art, n: x.n, netto: x.netto, matricole: isSet ? [] : matricole,
                assegna: assegna, setArt: isSet ? a : null
            });
            riepilogo.push('<strong>' + macEsc(macNome(x.art)) + '</strong>: ' + x.n + ' caricat' + (x.n === 1 ? 'o' : 'i') +
                (res.clienti.length ? ' (' + res.clienti.length + ' ai clienti in attesa)' : ''));
        }
    } catch (error) {
        console.error('Errore carico macchine:', error);
        btn.disabled = false;
        await macRicarica();
        await showCustomAlert('Errore durante il carico:<br>' + macEsc(error.message) +
            '<br><br>Controlla nel quaderno cosa &egrave; stato salvato prima di riprovare.', 'Errore', '&#10060;');
        return;
    }
    btn.disabled = false;
    macChiudiCarico();
    await macRicarica();
    await showCustomAlert(riepilogo.join('<br>'), 'Carico registrato', '&#10004;');
}

// Articolo non presente nel listino: si crea dal Listino Vendite (stessa finestra)
function macCreaArticoloListino() {
    if (typeof openListinoEdit !== 'function') return;
    macAttesaNuovoArticolo = true;
    openListinoEdit(null);
}

let macAttesaNuovoArticolo = false;

// Chiamata da saveListinoEdit() dopo il salvataggio di un articolo
function macDopoSalvataggioListino(articoloId, nuovo) {
    if (!macAttesaNuovoArticolo) return;
    macAttesaNuovoArticolo = false;
    if (!nuovo || !articoloId) return;
    const modalCarico = document.getElementById('mac-carico-modal');
    const modalPezzo = document.getElementById('mac-pezzo-modal');
    if (modalCarico && !modalCarico.classList.contains('hidden')) {
        macCaricoArticolo = macArticolo(articoloId);
        document.getElementById('mac-carico-netto').value = '';
        macCaricoAggiorna();
    } else if (modalPezzo && !modalPezzo.classList.contains('hidden') && !macPezzoInModifica) {
        macPezzoArticolo = macArticolo(articoloId);
        document.getElementById('mac-pezzo-netto').value = '';
        macPezzoAggiornaArticolo();
    }
}

// ========================================
// SCHEDA CARICO EXCEL (file unico per tutti i marchi)
// ----------------------------------------
// Colonne: quelle del listino + QUANTITA + MATRICOLE.
// Abbinamento con il listino: MARCHIO + MODELLO + NOTE (come l'import del listino).
// - Articolo non in listino -> viene creato (serve l'ATTREZZO)
// - Netto 1 diverso -> il listino scala netto 1 -> 2 -> 3 e scrive lo storico
// - Prezzi di vendita compilati -> aggiornano il listino (le celle vuote non cancellano niente)
// - QUANTITA vuota o 0 -> la riga aggiorna solo il listino
// ========================================
const MAC_EXCEL_COLONNE = Object.assign({}, LISTINO_COLONNE_EXCEL, {
    'QUANTITA': 'quantita', 'QTA': 'quantita', 'Q TA': 'quantita', 'PEZZI': 'quantita',
    'MATRICOLE': 'matricole', 'MATRICOLA': 'matricole'
});

const MAC_EXCEL_INTESTAZIONI = [
    'ATTREZZO', 'MARCHIO', 'ALIMENTAZIONE', 'TIPOLOGIA ALIM.', 'MODELLO', 'NOTE', 'QUANTITA',
    'NETTO 1', 'NOTE 1', 'VENDITA PROMO', 'SCADENZA PROMO', 'VENDITA IN SCATOLA', 'VENDITA NO PROMO', 'LISTINO', 'MATRICOLE'
];
const MAC_EXCEL_CAMPI = ['attrezzo', 'marchio', 'alimentazione', 'tipologia_alimentazione', 'modello', 'note', 'quantita',
    'netto_1', 'note_1', 'vendita_promo', 'scadenza_promo', 'vendita_scatola', 'vendita_no_promo', 'listino', 'matricole'];
const MAC_EXCEL_PREZZI = ['vendita_promo', 'scadenza_promo', 'vendita_scatola', 'vendita_no_promo', 'listino'];
const MAC_EXCEL_MAX_QTA = 200;

let macExcelRighe = null;     // righe lette dal file
let macExcelNomeFile = '';
let macExcelPiano = null;     // piano calcolato (si ricalcola se cambiano le caselline)

function macExcelIntestazione(h) {
    return listinoNormalizzaIntestazione(h)
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/'/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// ---------- Modello da scaricare ----------
function macExcelPopolaMarchi() {
    const sel = document.getElementById('mac-excel-marchio');
    if (!sel) return;
    const corrente = sel.value;
    const marchi = [...new Set(listinoArticoli.filter(a => a.attivo).map(a => a.marchio).filter(Boolean))].sort(listinoConfronta);
    sel.innerHTML = '<option value="">Modello vuoto</option>' +
        marchi.map(m => '<option value="' + macEsc(m) + '">Con gli articoli ' + macEsc(m) + '</option>').join('');
    sel.value = marchi.indexOf(corrente) !== -1 ? corrente : '';
}

function macExcelScaricaModello() {
    if (typeof XLSX === 'undefined') {
        showCustomAlert('Libreria Excel non caricata: aggiorna la pagina e riprova.', 'Errore', '&#10060;');
        return;
    }
    const marchio = document.getElementById('mac-excel-marchio').value;
    const righe = [MAC_EXCEL_INTESTAZIONI];
    if (marchio) {
        listinoOrdina(listinoArticoli.filter(a => a.attivo && a.marchio === marchio)).forEach(a => {
            const num = v => (v === null || v === undefined || v === '') ? null : (isNaN(Number(v)) ? v : Number(v));
            righe.push([
                a.attrezzo, a.marchio, a.alimentazione, a.tipologia_alimentazione, a.modello, a.note, null,
                num(a.netto_1), a.note_1, num(a.vendita_promo), a.scadenza_promo, num(a.vendita_scatola),
                num(a.vendita_no_promo), num(a.listino), null
            ]);
        });
    }
    const ws = XLSX.utils.aoa_to_sheet(righe);
    ws['!cols'] = [18, 14, 14, 14, 22, 30, 11, 11, 22, 13, 24, 13, 13, 11, 30].map(w => ({ wch: w }));
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(righe.length - 1, 1), c: MAC_EXCEL_INTESTAZIONI.length - 1 } }) };

    const istruzioni = [
        ['CARICO MACCHINE DA EXCEL - ISTRUZIONI'],
        [''],
        ['Si compila il foglio CARICO: una riga per articolo (stesse colonne del Listino Vendite + QUANTITA + MATRICOLE).'],
        ['L\'articolo viene riconosciuto da MARCHIO + MODELLO + NOTE, come nel listino.'],
        ['Se la NOTE e\' vuota e nel listino c\'e\' un solo articolo con quel marchio e modello, viene abbinato a quello.'],
        [''],
        ['QUANTITA: quante macchine sono arrivate. Vuota o 0 = la riga aggiorna solo il listino (netti e prezzi).'],
        ['NETTO 1: il netto della conferma d\'ordine. Se e\' diverso da quello del listino, il listino si aggiorna'],
        ['          (netto 1 -> netto 2 -> netto 3 e storico). Vuoto = si usa il netto 1 del listino.'],
        ['PREZZI DI VENDITA / LISTINO: se compilati aggiornano il listino. Le celle vuote non cancellano niente.'],
        ['MATRICOLE: facoltative, separate da virgola o punto e virgola (al massimo quante la QUANTITA).'],
        [''],
        ['ARTICOLO NUOVO (non presente nel listino): viene creato. Servono ATTREZZO e MODELLO (o NOTE).'],
        ['SET: si carica il set e l\'app carica i singoli componenti (se il set e\' configurato nella scheda Set).'],
        [''],
        ['Le macchine arrivate vanno prima ai clienti che le aspettano (ordinate, poi da ordinare).'],
        ['Prima di salvare l\'app mostra un\'anteprima di tutto: niente viene modificato finche\' non confermi.']
    ];
    const wsIstr = XLSX.utils.aoa_to_sheet(istruzioni);
    wsIstr['!cols'] = [{ wch: 110 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'CARICO');
    XLSX.utils.book_append_sheet(wb, wsIstr, 'ISTRUZIONI');
    const oggi = new Date();
    const data = oggi.getFullYear() + String(oggi.getMonth() + 1).padStart(2, '0') + String(oggi.getDate()).padStart(2, '0');
    XLSX.writeFile(wb, 'CARICO_MACCHINE_' + (marchio ? marchio.replace(/[^A-Z0-9]+/g, '_') + '_' : '') + data + '.xlsx');
}

// ---------- Lettura del file ----------
function macExcelSelezionaFile() {
    macExcelAnnulla();
    document.getElementById('mac-excel-file').click();
}

function macExcelFileScelto(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    macExcelNomeFile = file.name;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
            const letto = macExcelLeggi(wb);
            if (letto.errori.length) {
                showCustomAlert(letto.errori.join('<br>'), 'File non valido', '&#10060;');
                return;
            }
            macExcelRighe = letto.righe;
            macExcelAggiornaAnteprima();
        } catch (err) {
            console.error('Errore lettura Excel carico macchine:', err);
            showCustomAlert('Non riesco a leggere il file:<br>' + macEsc(err.message), 'Errore', '&#10060;');
        }
    };
    reader.readAsArrayBuffer(file);
}

function macExcelLeggi(workbook) {
    const ris = { righe: [], errori: [] };
    let nome = workbook.SheetNames.find(n => macExcelIntestazione(n) === 'CARICO') || workbook.SheetNames[0];
    const ws = workbook.Sheets[nome];
    if (!ws || !ws['!ref']) {
        ris.errori.push('Il foglio &quot;' + macEsc(nome) + '&quot; &egrave; vuoto.');
        return ris;
    }
    const range = XLSX.utils.decode_range(ws['!ref']);
    let rigaInt = -1;
    let mappa = {};
    for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + 15); r++) {
        const m = {};
        for (let c = range.s.c; c <= range.e.c; c++) {
            const cell = listinoLeggiCella(ws, r, c);
            if (!cell) continue;
            const campo = MAC_EXCEL_COLONNE[macExcelIntestazione(cell.v)];
            if (campo && m[campo] === undefined) m[campo] = c;
        }
        if (m.modello !== undefined && m.quantita !== undefined) {
            rigaInt = r;
            mappa = m;
            break;
        }
    }
    if (rigaInt === -1) {
        ris.errori.push('Non trovo la riga delle intestazioni: servono almeno le colonne <strong>MODELLO</strong> e <strong>QUANTITA</strong>.<br>Scarica il modello dalla scheda Carico Excel.');
        return ris;
    }
    for (let r = rigaInt + 1; r <= range.e.r; r++) {
        const riga = { numero: r + 1, valori: {} };
        let piena = false;
        Object.keys(mappa).forEach(campo => {
            const cell = listinoLeggiCella(ws, r, mappa[campo]);
            if (!cell) return;
            riga.valori[campo] = cell.v;
            if (String(cell.v).trim() !== '') piena = true;
        });
        if (piena) ris.righe.push(riga);
    }
    if (ris.righe.length === 0) ris.errori.push('Il file non contiene righe sotto le intestazioni.');
    return ris;
}

// ---------- Piano (cosa succedera') ----------
function macExcelTestoVendita(v) {
    const n = listinoParseNumero(v);
    return (typeof n === 'number' && !isNaN(n)) ? String(n) : listinoPulisciTesto(v);
}

function macExcelCostruisciPiano(righeFile, aggiornaListino, assegna) {
    const piano = { righe: [], invariate: 0, errori: 0 };
    const perChiave = {}; // per unire le righe ripetute

    righeFile.forEach(rf => {
        const v = rf.valori;
        const r = {
            numeri: [rf.numero], errori: [], avvisi: [], art: null, nuovo: false, ripristina: false,
            dati: {}, qta: 0, matricole: [], netto: null, aggListino: null, differenze: [], nettoCambiato: false
        };
        ['attrezzo', 'marchio', 'alimentazione', 'tipologia_alimentazione', 'modello', 'note', 'note_1'].forEach(c => {
            r.dati[c] = listinoPulisciTesto(v[c]);
        });
        MAC_EXCEL_PREZZI.forEach(c => {
            if (c === 'listino') {
                const n = listinoParseNumero(v[c]);
                if (typeof n === 'number' && isNaN(n)) r.errori.push('LISTINO non &egrave; un numero');
                else r.dati[c] = n;
            } else if (c === 'scadenza_promo') {
                r.dati[c] = listinoPulisciTesto(v[c]);
            } else {
                r.dati[c] = macExcelTestoVendita(v[c]);
            }
        });
        const netto = listinoParseNumero(v.netto_1);
        if (typeof netto === 'number' && isNaN(netto)) r.errori.push('NETTO 1 non &egrave; un numero');
        else r.dati.netto_1 = netto;

        // Quantita'
        const qGrezza = v.quantita;
        if (qGrezza === null || qGrezza === undefined || String(qGrezza).trim() === '') {
            r.qta = 0;
        } else {
            const q = Number(String(qGrezza).replace(',', '.'));
            if (!isFinite(q) || q < 0 || Math.floor(q) !== q) r.errori.push('QUANTITA non valida (' + macEsc(qGrezza) + ')');
            else if (q > MAC_EXCEL_MAX_QTA) r.errori.push('QUANTITA troppo alta (massimo ' + MAC_EXCEL_MAX_QTA + ' per riga)');
            else r.qta = q;
        }

        // Matricole
        if (v.matricole !== null && v.matricole !== undefined && String(v.matricole).trim() !== '') {
            r.matricole = String(v.matricole).split(/[,;\n]+/).map(m => listinoPulisciTesto(m)).filter(Boolean);
        }

        if (!r.dati.modello && !r.dati.note) r.errori.push('Manca il MODELLO');

        // Abbinamento con il listino
        if (r.errori.length === 0) {
            const chiave = listinoChiave(r.dati.marchio, r.dati.modello, r.dati.note);
            let art = listinoArticoli.find(a => a.chiave === chiave) || null;
            if (!art && !r.dati.note && r.dati.modello) {
                const simili = listinoArticoli.filter(a => a.attivo && (a.marchio || null) === r.dati.marchio && a.modello === r.dati.modello);
                if (simili.length === 1) {
                    art = simili[0];
                    r.avvisi.push('Abbinato a &quot;' + macEsc(macNome(art)) + '&quot; (nel file manca la NOTE)');
                } else if (simili.length > 1) {
                    r.errori.push('Nel listino ci sono ' + simili.length + ' articoli ' + macEsc(r.dati.modello) +
                        ': scrivi la NOTE giusta (' + simili.map(a => macEsc(a.note || 'senza note')).join(' / ') + ')');
                }
            }
            if (art) {
                r.art = art;
                if (!art.attivo) {
                    r.ripristina = true;
                    r.avvisi.push('Era negli articoli cancellati del listino: verr&agrave; ripristinato');
                }
            } else if (r.errori.length === 0) {
                r.nuovo = true;
                if (!r.dati.attrezzo) r.errori.push('Articolo non presente nel listino: per crearlo serve l\'ATTREZZO');
            }
            r.chiaveUnione = art ? 'ID' + art.id : 'NUOVO|' + chiave;
        }

        // Riga ripetuta: si unisce alla precedente
        if (r.errori.length === 0 && perChiave[r.chiaveUnione]) {
            const prima = perChiave[r.chiaveUnione];
            prima.numeri.push(rf.numero);
            prima.qta += r.qta;
            prima.matricole = prima.matricole.concat(r.matricole);
            Object.keys(r.dati).forEach(c => {
                if (r.dati[c] !== null && r.dati[c] !== undefined) prima.dati[c] = r.dati[c];
            });
            prima.avvisi.push('Riga ' + rf.numero + ' uguale: unita a questa');
            return;
        }
        if (r.errori.length === 0) perChiave[r.chiaveUnione] = r;
        piano.righe.push(r);
    });

    // Controlli finali e calcolo di cosa succede
    const matricoleViste = {};
    const matricoleEsistenti = {};
    macPezzi.forEach(p => { if (p.matricola) matricoleEsistenti[p.matricola] = p; });

    piano.righe.forEach(r => {
        if (r.errori.length) return;
        const art = r.art;
        const isSet = !!(art && macIsSet(art.id));
        r.isSet = isSet;

        if (r.matricole.length) {
            if (isSet) {
                r.avvisi.push('Per i set le matricole si inseriscono dal quaderno: quelle del file vengono ignorate');
                r.matricole = [];
            } else if (r.matricole.length > r.qta) {
                r.errori.push('Ci sono ' + r.matricole.length + ' matricole ma la QUANTITA &egrave; ' + r.qta);
            }
            r.matricole.forEach(m => {
                if (matricoleViste[m]) r.errori.push('Matricola ' + macEsc(m) + ' ripetuta nel file');
                if (matricoleEsistenti[m]) r.errori.push('Matricola ' + macEsc(m) + ' gi&agrave; presente in magazzino');
                matricoleViste[m] = true;
            });
        }
        if (r.errori.length) return;

        // Aggiornamento del listino
        if (r.nuovo) {
            r.aggListino = {};
        } else if (aggiornaListino || r.ripristina) {
            const agg = {};
            if (aggiornaListino) {
                if (r.dati.netto_1 !== null && r.dati.netto_1 !== undefined && !listinoStessoNumero(art.netto_1, r.dati.netto_1)) {
                    agg.netto_1 = r.dati.netto_1;
                    agg.note_1 = r.dati.note_1;
                    if (art.netto_1 !== null && art.netto_1 !== undefined) {
                        agg.netto_2 = art.netto_1; agg.note_2 = art.note_1;
                        agg.netto_3 = art.netto_2; agg.note_3 = art.note_2;
                    }
                    r.nettoCambiato = true;
                } else if (r.dati.note_1 && !listinoStessoTesto(art.note_1, r.dati.note_1)) {
                    agg.note_1 = r.dati.note_1;
                }
                MAC_EXCEL_PREZZI.forEach(c => {
                    const nuovo = r.dati[c];
                    if (nuovo === null || nuovo === undefined || nuovo === '') return;
                    const uguale = c === 'listino' ? listinoStessoNumero(art[c], nuovo) : listinoStessoTesto(art[c], nuovo);
                    if (!uguale) agg[c] = nuovo;
                });
            }
            if (r.ripristina) { agg.attivo = true; agg.data_cancellazione = null; }
            if (Object.keys(agg).length) {
                r.aggListino = agg;
                r.differenze = listinoNotDifferenze(art, Object.assign({}, art, agg));
            }
        }

        // Netto con cui si caricano i pezzi
        r.netto = (r.dati.netto_1 !== null && r.dati.netto_1 !== undefined) ? r.dati.netto_1 : (art ? art.netto_1 : null);

        // Cosa succede ai pezzi
        r.destinazioni = [];
        if (r.qta > 0) {
            const elenco = isSet
                ? macComponenti(art.id).map(c => ({ art: macArticolo(c.componente_id), n: c.quantita * r.qta })).filter(x => x.art)
                : [{ art: art, n: r.qta }];
            elenco.forEach(x => {
                const attesa = (assegna && x.art) ? macInAttesa(x.art.id).slice(0, x.n) : [];
                r.destinazioni.push({ art: x.art, n: x.n, clienti: attesa, liberi: x.n - attesa.length });
            });
        }
        if (r.qta === 0 && !r.aggListino) r.invariata = true;
        if (r.qta === 0 && r.nuovo) r.avvisi.push('QUANTITA vuota: l\'articolo viene solo creato nel listino');
    });

    piano.righe.forEach(r => { if (r.errori.length) piano.errori++; else if (r.invariata) piano.invariate++; });
    return piano;
}

// ---------- Anteprima ----------
function macExcelAggiornaAnteprima() {
    if (!macExcelRighe) return;
    const aggiorna = document.getElementById('mac-excel-aggiorna-listino').checked;
    const assegna = document.getElementById('mac-excel-assegna').checked;
    macExcelPiano = macExcelCostruisciPiano(macExcelRighe, aggiorna, assegna);
    macExcelRenderAnteprima(macExcelPiano);
}

function macExcelRenderAnteprima(piano) {
    const box = document.getElementById('mac-excel-anteprima');
    const valide = piano.righe.filter(r => !r.errori.length && !r.invariata);
    const pezzi = valide.reduce((s, r) => s + r.destinazioni.reduce((t, d) => t + d.n, 0), 0);
    const nuovi = valide.filter(r => r.nuovo).length;
    const netti = valide.filter(r => r.nettoCambiato).length;
    const listino = valide.filter(r => r.aggListino && !r.nuovo).length;

    let html =
        '<div class="mac-excel-testa">' +
            '<div><strong>&#128196; ' + macEsc(macExcelNomeFile) + '</strong></div>' +
            '<div class="mac-excel-contatori">' +
                '<span class="mac-num mac-num-disp">' + pezzi + ' pezzi da caricare</span>' +
                (nuovi ? '<span class="mac-num mac-num-ord">' + nuovi + ' nuovi nel listino</span>' : '') +
                (netti ? '<span class="mac-num mac-num-ass">' + netti + ' netti cambiati</span>' : '') +
                (listino - netti > 0 ? '<span class="mac-num mac-num-ass">' + (listino - netti) + ' altri aggiornamenti listino</span>' : '') +
                (piano.invariate ? '<span class="mac-num mac-num-daord">' + piano.invariate + ' righe senza modifiche</span>' : '') +
                (piano.errori ? '<span class="mac-num mac-num-err">' + piano.errori + ' righe con errori</span>' : '') +
            '</div>' +
        '</div>';

    if (piano.errori) {
        html += '<div class="mac-excel-avviso-err">&#9888;&#65039; Le righe con errori <strong>NON</strong> verranno caricate. Puoi correggere il file e ricaricarlo, oppure confermare solo le righe giuste.</div>';
    }

    html += '<div class="mac-excel-righe">';
    piano.righe.forEach(r => {
        if (r.invariata) return;
        let etichetta, classe;
        if (r.errori.length) { etichetta = 'ERRORE'; classe = 'err'; }
        else if (r.nuovo) { etichetta = 'NUOVO'; classe = 'nuovo'; }
        else if (r.qta === 0) { etichetta = 'SOLO LISTINO'; classe = 'listino'; }
        else { etichetta = 'CARICO'; classe = 'ok'; }

        const nome = r.art ? macNomeHtml(r.art)
            : '<span class="mac-marchio">' + listinoVal(r.dati.marchio) + '</span> <strong>' + listinoVal(r.dati.modello || r.dati.note) + '</strong>' +
              (r.dati.modello && r.dati.note ? ' <span class="mac-art-note">' + macEsc(r.dati.note) + '</span>' : '');

        let corpo = '';
        if (r.errori.length) {
            corpo += '<div class="mac-excel-errori">' + r.errori.map(e => '&#10060; ' + e).join('<br>') + '</div>';
        } else {
            if (r.qta > 0) {
                corpo += '<div><strong>' + r.qta + (r.isSet ? ' set' : ' pz') + '</strong> &middot; ' +
                    (r.isSet ? 'in magazzino entrano i componenti, ognuno con il suo netto 1' : 'netto ' + macEuro(r.netto)) + '</div>';
                r.destinazioni.forEach(d => {
                    corpo += '<div class="mac-excel-dest">' +
                        (r.isSet ? '<span class="mac-excel-comp">' + d.n + ' x ' + macEsc(macNome(d.art)) + ':</span> ' : '') +
                        (d.clienti.length ? '&#128100; ' + d.clienti.map(p =>
                            '<span class="mac-anteprima-cliente"><span class="mac-quadro mac-quadro-mini ' + MAC_STATI[p.stato].classe + '"></span>' + macEsc(p.cliente || '-') + '</span>'
                        ).join(' ') + ' ' : '') +
                        (d.liberi > 0 ? '&#9989; ' + d.liberi + ' disponibil' + (d.liberi === 1 ? 'e' : 'i') : '') +
                        '</div>';
                });
                if (r.matricole.length) corpo += '<div class="mac-excel-matr">Matricole: ' + r.matricole.map(macEsc).join(', ') + '</div>';
            }
            if (r.nuovo) {
                corpo += '<div class="mac-excel-list">&#10133; Nuovo nel listino: ' + macEsc(r.dati.attrezzo) +
                    (r.dati.netto_1 !== null && r.dati.netto_1 !== undefined ? ' &middot; netto 1 ' + macEuro(r.dati.netto_1) : '') + '</div>';
            } else if (r.differenze.length) {
                corpo += '<div class="mac-excel-list">' + r.differenze.map(d =>
                    '&#127991; <strong>' + macEsc(d.e) + '</strong> ' + macEsc(d.v)).join('<br>') + '</div>';
            }
            if (r.avvisi.length) corpo += '<div class="mac-excel-avvisi">' + r.avvisi.map(a => '&#9888;&#65039; ' + a).join('<br>') + '</div>';
        }

        html += '<div class="mac-excel-riga mac-excel-' + classe + '">' +
            '<div class="mac-excel-riga-testa">' +
                '<span class="mac-excel-num">riga ' + r.numeri.join(', ') + '</span>' +
                '<span class="mac-excel-tag">' + etichetta + '</span>' +
                '<span class="mac-excel-nome">' + nome + '</span>' +
            '</div>' +
            corpo +
        '</div>';
    });
    html += '</div>';

    if (valide.length === 0) {
        html += '<p class="mac-aiuto" style="text-align:center">Niente da caricare o aggiornare.</p>';
        html += '<div class="mac-excel-pulsanti"><button type="button" class="btn-secondary" id="mac-excel-annulla">Chiudi</button></div>';
    } else {
        html += '<div class="mac-excel-pulsanti">' +
            '<button type="button" class="btn-primary" id="mac-excel-conferma">&#10004; Conferma (' + valide.length + (valide.length === 1 ? ' riga' : ' righe') + ')</button>' +
            '<button type="button" class="btn-secondary" id="mac-excel-annulla">Annulla</button>' +
        '</div>';
    }
    box.innerHTML = html;
    box.classList.remove('hidden');
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function macExcelAnnulla() {
    macExcelRighe = null;
    macExcelPiano = null;
    const box = document.getElementById('mac-excel-anteprima');
    if (box) { box.innerHTML = ''; box.classList.add('hidden'); }
}

// ---------- Conferma ----------
async function macExcelConferma() {
    const piano = macExcelPiano;
    if (!piano) return;
    const valide = piano.righe.filter(r => !r.errori.length && !r.invariata);
    if (!valide.length) return;
    const assegna = document.getElementById('mac-excel-assegna').checked;
    const btn = document.getElementById('mac-excel-conferma');
    if (btn) { btn.disabled = true; btn.innerHTML = '&#8987; Salvataggio in corso...'; }
    const annulla = document.getElementById('mac-excel-annulla');
    if (annulla) annulla.disabled = true;

    const utente = macUtente();
    const dettaglio = 'EXCEL ' + listinoPulisciTesto(macExcelNomeFile);
    const notifiche = [];
    const riepilogo = { pezzi: 0, clienti: 0, nuovi: 0, listino: 0, righe: 0 };
    let fatte = 0;

    try {
        for (const r of valide) {
            let art = r.art;
            // 1. Listino: nuovo articolo
            if (r.nuovo) {
                const nuovo = {
                    attrezzo: r.dati.attrezzo, marchio: r.dati.marchio, alimentazione: r.dati.alimentazione,
                    tipologia_alimentazione: r.dati.tipologia_alimentazione, modello: r.dati.modello, note: r.dati.note,
                    netto_1: r.dati.netto_1 === undefined ? null : r.dati.netto_1, note_1: r.dati.note_1,
                    netto_2: null, note_2: null, netto_3: null, note_3: null,
                    vendita_promo: r.dati.vendita_promo, scadenza_promo: r.dati.scadenza_promo,
                    vendita_scatola: r.dati.vendita_scatola, vendita_no_promo: r.dati.vendita_no_promo,
                    listino: r.dati.listino === undefined ? null : r.dati.listino,
                    chiave: listinoChiave(r.dati.marchio, r.dati.modello, r.dati.note),
                    attivo: true, data_cancellazione: null
                };
                const { data, error } = await supabaseClient.from('listino_articoli').insert([nuovo]).select('*').single();
                if (error) throw error;
                art = data;
                listinoArticoli.push(art);
                if (nuovo.netto_1 !== null) {
                    await supabaseClient.from('listino_storico_netti').insert([{
                        articolo_id: art.id, modello: art.modello, netto: art.netto_1, note: art.note_1, origine: 'NUOVO ARTICOLO', utente: utente
                    }]);
                }
                notifiche.push({ e: 'NUOVO', v: listinoNotNome(art) });
                riepilogo.nuovi++;
            } else if (r.aggListino) {
                // 2. Listino: aggiornamento netti/prezzi (e ripristino)
                const { error } = await supabaseClient.from('listino_articoli').update(r.aggListino).eq('id', art.id);
                if (error) throw error;
                Object.assign(art, r.aggListino);
                if (r.nettoCambiato) {
                    await supabaseClient.from('listino_storico_netti').insert([{
                        articolo_id: art.id, modello: art.modello, netto: art.netto_1, note: art.note_1, origine: 'CARICO MACCHINE', utente: utente
                    }]);
                }
                if (r.ripristina) notifiche.push({ e: 'RIPRISTINATO', v: listinoNotNome(art) });
                r.differenze.forEach(d => notifiche.push({ e: listinoNotNome(art) + ' - ' + d.e, v: d.v, n: !!d.n }));
                riepilogo.listino++;
            }

            // 3. Carico dei pezzi
            if (r.qta > 0) {
                if (r.isSet) {
                    for (const c of macComponenti(art.id)) {
                        const comp = macArticolo(c.componente_id);
                        if (!comp) continue;
                        const res = await macCaricaPezzi({ art: comp, n: c.quantita * r.qta, netto: comp.netto_1, matricole: [], assegna: assegna, setArt: art, dettaglio: dettaglio });
                        riepilogo.pezzi += c.quantita * r.qta;
                        riepilogo.clienti += res.clienti.length;
                    }
                } else {
                    const res = await macCaricaPezzi({ art: art, n: r.qta, netto: r.netto, matricole: r.matricole, assegna: assegna, dettaglio: dettaglio });
                    riepilogo.pezzi += r.qta;
                    riepilogo.clienti += res.clienti.length;
                }
            }
            fatte++;
        }
    } catch (error) {
        console.error('Errore carico Excel:', error);
        await macExcelChiudiDopo(notifiche);
        await showCustomAlert('Il carico si &egrave; interrotto per un errore:<br><strong>' + macEsc(error.message) + '</strong><br><br>' +
            'Righe completate: ' + fatte + ' di ' + valide.length + '.<br>Controlla nel quaderno e nei movimenti cosa &egrave; stato salvato prima di ricaricare il file.',
            'Errore', '&#10060;');
        return;
    }

    await macExcelChiudiDopo(notifiche);
    await showCustomAlert(
        'Pezzi caricati: <strong>' + riepilogo.pezzi + '</strong>' + (riepilogo.clienti ? ' (' + riepilogo.clienti + ' ai clienti in attesa)' : '') + '<br>' +
        'Nuovi articoli nel listino: <strong>' + riepilogo.nuovi + '</strong><br>' +
        'Articoli del listino aggiornati: <strong>' + riepilogo.listino + '</strong>',
        'Carico completato', '&#10004;'
    );
}

// Dopo la conferma (anche se interrotta): notifica unica, ricarica listino e inventario
async function macExcelChiudiDopo(notifiche) {
    if (notifiche.length && typeof listinoRegistraNotifica === 'function') {
        listinoRegistraNotifica('IMPORT', 'Carico macchine da Excel: ' + (macExcelNomeFile || 'file'), notifiche, null);
    }
    macExcelAnnulla();
    if (typeof listinoStoricoCaricato !== 'undefined') listinoStoricoCaricato = false;
    try { await loadListino(); } catch (e) { console.error(e); }
    await macRicarica();
}

// ========================================
// SCHEDA SET (composizione)
// ========================================
function macRenderSet() {
    const container = document.getElementById('mac-set-container');
    if (!container || !macCaricato) return;

    const idSet = [...new Set(macComposizione.map(r => r.set_id))];
    const configurati = listinoOrdina(idSet.map(macArticolo).filter(Boolean));
    const daConfigurare = listinoOrdina(listinoArticoli.filter(a =>
        a.attivo && idSet.indexOf(a.id) === -1 &&
        MAC_REGEX_SET.test([a.modello, a.note].filter(Boolean).join(' '))
    ));

    let html = '<div class="card"><h2>&#129513; Set configurati (' + configurati.length + ')</h2>';
    if (configurati.length === 0) {
        html += '<p class="mac-aiuto">Nessun set configurato. Scegli qui sotto un set del listino e indica di cosa &egrave; composto.</p>';
    } else {
        html += '<div class="mac-set-lista">' + configurati.map(a => {
            const n = macSetComponibili(a.id);
            return '<div class="mac-set-voce">' +
                '<div class="mac-set-voce-testa">' +
                    '<div><span class="mac-picker-attrezzo">' + listinoVal(a.attrezzo) + '</span>' + macNomeHtml(a) + '</div>' +
                    '<button type="button" class="btn-back mac-btn-piccolo" data-set-modifica="' + a.id + '">&#9997;&#65039; Modifica</button>' +
                '</div>' +
                '<div class="mac-set-comp">' + macComponenti(a.id).map(r => {
                    const comp = macArticolo(r.componente_id);
                    const disp = macConteggi(r.componente_id).disponibili;
                    return '<span class="mac-set-pezzo">' + (r.quantita > 1 ? r.quantita + ' x ' : '') + macEsc(macNome(comp)) +
                        ' <small>(' + disp + ' disp.)</small></span>';
                }).join('<span class="mac-set-piu">+</span>') + '</div>' +
                '<div class="mac-set-componibili ' + (n > 0 ? 'ok' : 'zero') + '">&#129513; ' + n + ' set componibili adesso</div>' +
            '</div>';
        }).join('') + '</div>';
    }
    html += '</div>';

    html += '<div class="card"><h2>&#128269; Set del listino da configurare (' + daConfigurare.length + ')</h2>' +
        '<p class="mac-aiuto">Articoli con SET, KIT, CPL o COMPLETA nel modello o nelle note. Nelle note del listino trovi di cosa sono composti.</p>';
    if (daConfigurare.length === 0) {
        html += '<p class="mac-aiuto">Nessuno: tutti i set riconosciuti sono gi&agrave; configurati.</p>';
    } else {
        html += '<div class="mac-set-lista">' + daConfigurare.map(a =>
            '<div class="mac-set-voce mac-set-da-fare">' +
                '<div class="mac-set-voce-testa">' +
                    '<div><span class="mac-picker-attrezzo">' + listinoVal(a.attrezzo) + '</span>' + macNomeHtml(a) + '</div>' +
                    '<button type="button" class="btn-primary mac-btn-piccolo" data-set-modifica="' + a.id + '">&#10133; Componi</button>' +
                '</div>' +
            '</div>'
        ).join('') + '</div>';
    }
    html += '</div>';
    container.innerHTML = html;
}

let macSetInModifica = null;   // articolo set
let macSetRighe = [];          // [{ componente_id, quantita }]

function macApriSet(setId) {
    const a = macArticolo(setId);
    if (!a) return;
    if (macIsComponente(a.id)) {
        showCustomAlert('Questo articolo &egrave; gi&agrave; un componente di un altro set, quindi non pu&ograve; essere a sua volta un set.', 'Attenzione', '&#9888;&#65039;');
        return;
    }
    macSetInModifica = a;
    macSetRighe = macComponenti(a.id).map(r => ({ componente_id: r.componente_id, quantita: r.quantita }));
    document.getElementById('mac-set-titolo').innerHTML = '&#129513; ' + macEsc(macNome(a));
    document.getElementById('mac-set-note-listino').innerHTML = a.note
        ? '<strong>Note del listino:</strong> ' + macEsc(a.note)
        : '';
    document.getElementById('mac-set-art-search').value = '';
    macSetRenderRighe();
    document.getElementById('mac-set-modal').classList.remove('hidden');
}

function macChiudiSet() {
    document.getElementById('mac-set-modal').classList.add('hidden');
    macPickerChiudi('mac-set-art-search');
    macSetInModifica = null;
    macSetRighe = [];
}

// Legge le quantita' scritte nei campi (prima di ridisegnare l'elenco, altrimenti si perdono)
function macSetLeggiQuantita() {
    document.querySelectorAll('#mac-set-righe [data-set-qta]').forEach(inp => {
        const i = parseInt(inp.dataset.setQta, 10);
        const q = parseInt(inp.value, 10);
        if (macSetRighe[i]) macSetRighe[i].quantita = (q >= 1 && q <= 99) ? q : 1;
    });
}

function macSetRenderRighe() {
    const box = document.getElementById('mac-set-righe');
    if (macSetRighe.length === 0) {
        box.innerHTML = '<p class="mac-aiuto">Nessun componente. Cerca qui sotto la macchina, la batteria, il caricatore... e aggiungili.</p>';
        return;
    }
    box.innerHTML = macSetRighe.map((r, i) =>
        '<div class="mac-set-riga">' +
            '<input type="number" min="1" max="99" class="mac-set-qta" data-set-qta="' + i + '" value="' + r.quantita + '">' +
            '<span class="mac-set-riga-nome">' + macNomeHtml(macArticolo(r.componente_id)) + '</span>' +
            '<button type="button" class="mac-set-togli" data-set-togli="' + i + '" title="Togli">&times;</button>' +
        '</div>'
    ).join('');
}

function macSetAggiungi(a) {
    if (!macSetInModifica) return;
    document.getElementById('mac-set-art-search').value = '';
    if (a.id === macSetInModifica.id) {
        showCustomAlert('Un set non pu&ograve; contenere s&eacute; stesso.', 'Attenzione', '&#9888;&#65039;');
        return;
    }
    if (macIsSet(a.id)) {
        showCustomAlert('Questo articolo &egrave; a sua volta un set: aggiungi i suoi componenti singoli.', 'Attenzione', '&#9888;&#65039;');
        return;
    }
    macSetLeggiQuantita();
    const esiste = macSetRighe.find(r => r.componente_id === a.id);
    if (esiste) esiste.quantita = Math.min(99, esiste.quantita + 1);
    else macSetRighe.push({ componente_id: a.id, quantita: 1 });
    macSetRenderRighe();
}

async function macSalvaSet() {
    const a = macSetInModifica;
    if (!a) return;
    macSetLeggiQuantita();
    if (macSetRighe.length === 1 && macSetRighe[0].quantita === 1) {
        if (!window.confirm('Il set ha un solo componente. Salvare comunque?')) return;
    }
    const btn = document.getElementById('mac-set-salva');
    btn.disabled = true;
    try {
        const { error: errDel } = await supabaseClient.from('macchine_composizione').delete().eq('set_id', a.id);
        if (errDel) throw errDel;
        if (macSetRighe.length) {
            const { error } = await supabaseClient.from('macchine_composizione').insert(
                macSetRighe.map(r => ({ set_id: a.id, componente_id: r.componente_id, quantita: r.quantita }))
            );
            if (error) throw error;
        }
    } catch (error) {
        console.error('Errore salvataggio set:', error);
        btn.disabled = false;
        await showCustomAlert('Errore durante il salvataggio del set:<br>' + macEsc(error.message), 'Errore', '&#10060;');
        return;
    }
    btn.disabled = false;
    macChiudiSet();
    await macRicarica();
}

// ========================================
// SCHEDA MOVIMENTI
// ========================================
async function macCaricaMovimenti() {
    const container = document.getElementById('mac-mov-container');
    if (!container) return;
    if (!macMovimentiCaricati) {
        container.innerHTML = '<div class="card"><p style="text-align:center">&#8987; Caricamento movimenti...</p></div>';
        const { data, error } = await supabaseClient.from('macchine_movimenti').select('*')
            .order('created_at', { ascending: false }).limit(500);
        if (error) {
            container.innerHTML = '<div class="card"><p style="text-align:center">&#10060; Errore: ' + macEsc(error.message) + '</p></div>';
            return;
        }
        macMovimenti = data || [];
        macMovimentiCaricati = true;
    }
    macRenderMovimenti();
}

function macRenderMovimenti() {
    const container = document.getElementById('mac-mov-container');
    if (!container) return;
    const s = document.getElementById('mac-mov-search');
    const ricerca = listinoPulisciTesto(s ? s.value : '') || '';
    const lista = macMovimenti.filter(m => {
        if (!ricerca) return true;
        const a = macArticolo(m.articolo_id);
        const testo = [m.tipo, m.dettaglio, m.cliente, m.matricola, a ? macNome(a) : '', a ? a.attrezzo : '', macChi(m.utente)]
            .filter(Boolean).join(' ').toUpperCase();
        return ricerca.split(' ').every(p => testo.indexOf(p) !== -1);
    });
    const conteggio = document.getElementById('mac-mov-count');
    if (conteggio) conteggio.textContent = lista.length + ' movimenti' + (macMovimenti.length >= 500 ? ' (ultimi 500)' : '');
    if (lista.length === 0) {
        container.innerHTML = '<div class="card"><p style="text-align:center">Nessun movimento</p></div>';
        return;
    }
    const classeTipo = t => t === 'CARICO' ? 'mac-mov-carico' : t === 'CANCELLATA' ? 'mac-mov-cancellata' : t === 'NUOVA VOCE' ? 'mac-mov-nuova' : t === 'ORDINE' ? 'mac-mov-ordine' : 'mac-mov-modifica';
    container.innerHTML = '<div class="card mac-mov-card">' + lista.map(m => {
        const a = macArticolo(m.articolo_id);
        return '<div class="mac-mov-riga">' +
            '<div class="mac-mov-data">' + macDataOra(m.created_at) + '<small>' + macEsc(macChi(m.utente)) + '</small></div>' +
            '<div class="mac-mov-corpo">' +
                '<span class="mac-mov-tipo ' + classeTipo(m.tipo) + '">' + macEsc(m.tipo) + '</span> ' +
                (a ? macNomeHtml(a) : '<em>articolo ' + macEsc(m.articolo_id) + '</em>') +
                '<div class="mac-mov-dett">' + macEsc(m.dettaglio || '') + (m.matricola ? ' &middot; MATR. ' + macEsc(m.matricola) : '') + '</div>' +
            '</div>' +
        '</div>';
    }).join('') + '</div>';
}

// ========================================
// EVENT LISTENERS
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    const section = document.getElementById('section-inventario-macchine');
    if (!section) return;

    // Schede
    document.querySelectorAll('#tabs-macchine .tab-btn').forEach(btn => {
        btn.addEventListener('click', () => macSwitchTab(btn.dataset.macTab));
    });

    // Pulsanti in alto
    document.getElementById('mac-btn-carico').addEventListener('click', () => macApriCarico(null));
    document.getElementById('mac-btn-nuova-voce').addEventListener('click', () => macApriNuovaVoce(null));

    // Inventario: ricerca e filtri
    const invSearch = document.getElementById('mac-inv-search');
    invSearch.addEventListener('input', () => {
        clearTimeout(macSearchTimeout);
        macSearchTimeout = setTimeout(macRenderInventario, 200);
    });
    MAC_FILTRI.forEach(f => {
        const el = document.getElementById(f.id);
        if (el) el.addEventListener('change', macRenderInventario);
    });
    document.getElementById('mac-inv-solo-pezzi').addEventListener('change', macRenderInventario);
    document.getElementById('mac-inv-reset').addEventListener('click', macResetFiltriInventario);

    // Quaderno
    const qSearch = document.getElementById('mac-q-search');
    qSearch.addEventListener('input', () => {
        clearTimeout(macSearchTimeout);
        macSearchTimeout = setTimeout(macRenderQuaderno, 200);
    });
    document.getElementById('mac-q-consegnate').addEventListener('change', macRenderQuaderno);
    document.getElementById('mac-q-divisori').addEventListener('click', (e) => {
        const b = e.target.closest('[data-marchio]');
        if (!b) return;
        macSessione('macchineMarchio', b.dataset.marchio);
        qSearch.value = '';
        macRenderQuaderno();
        const pagina = document.getElementById('mac-q-pagina');
        if (pagina && window.innerWidth <= 768) pagina.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // Movimenti
    document.getElementById('mac-mov-search').addEventListener('input', () => {
        clearTimeout(macSearchTimeout);
        macSearchTimeout = setTimeout(macRenderMovimenti, 200);
    });
    // Carico Excel
    document.getElementById('mac-excel-modello').addEventListener('click', macExcelScaricaModello);
    document.getElementById('mac-excel-seleziona').addEventListener('click', macExcelSelezionaFile);
    document.getElementById('mac-excel-file').addEventListener('change', macExcelFileScelto);
    document.getElementById('mac-excel-aggiorna-listino').addEventListener('change', macExcelAggiornaAnteprima);
    document.getElementById('mac-excel-assegna').addEventListener('change', macExcelAggiornaAnteprima);
    document.getElementById('mac-excel-anteprima').addEventListener('click', (e) => {
        if (e.target.closest('#mac-excel-conferma')) macExcelConferma();
        else if (e.target.closest('#mac-excel-annulla')) macExcelAnnulla();
    });
    const vaiExcel = document.getElementById('mac-carico-vai-excel');
    if (vaiExcel) vaiExcel.addEventListener('click', () => { macChiudiCarico(); macSwitchTab('excel'); });

    document.getElementById('mac-mov-aggiorna').addEventListener('click', () => {
        macMovimentiCaricati = false;
        macCaricaMovimenti();
    });

    // Click delegati nella sezione (tabelle e quaderno vengono ridisegnati)
    section.addEventListener('click', (e) => {
        const t = e.target;
        let el;
        if ((el = t.closest('[data-pezzo]'))) { macApriPezzo(parseInt(el.dataset.pezzo, 10)); return; }
        if ((el = t.closest('[data-nuovo]'))) { macApriNuovaVoce(parseInt(el.dataset.nuovo, 10)); return; }
        if ((el = t.closest('[data-carico]'))) { macApriCarico(parseInt(el.dataset.carico, 10)); return; }
        if ((el = t.closest('[data-quaderno]'))) { macApriQuadernoArticolo(parseInt(el.dataset.quaderno, 10)); return; }
        if ((el = t.closest('[data-set-modifica]'))) { macApriSet(parseInt(el.dataset.setModifica, 10)); return; }
    });

    // Set: scegli un altro articolo da configurare come set
    macPickerImposta('mac-set-nuovo-search', 'mac-set-nuovo-results', null, (a) => {
        document.getElementById('mac-set-nuovo-search').value = '';
        macApriSet(a.id);
    });

    // ----- Finestra pezzo -----
    macPickerImposta('mac-pezzo-art-search', 'mac-pezzo-art-results', null, (a) => {
        macPezzoArticolo = a;
        document.getElementById('mac-pezzo-netto').value = '';
        macPezzoAggiornaArticolo();
    });
    document.getElementById('mac-pezzo-stati').addEventListener('click', (e) => {
        const b = e.target.closest('[data-stato]');
        if (!b) return;
        macPezzoStato = b.dataset.stato;
        macPezzoAggiornaStato();
    });
    document.getElementById('mac-pezzo-form').addEventListener('submit', macSalvaPezzo);
    document.getElementById('mac-pezzo-annulla').addEventListener('click', macChiudiPezzo);
    document.getElementById('mac-pezzo-close').addEventListener('click', macChiudiPezzo);
    document.getElementById('mac-pezzo-elimina').addEventListener('click', macEliminaPezzo);

    // ----- Finestra carico -----
    macPickerImposta('mac-carico-art-search', 'mac-carico-art-results', null, (a) => {
        macCaricoArticolo = a;
        document.getElementById('mac-carico-netto').value = '';
        macCaricoAggiorna();
    });
    document.getElementById('mac-carico-qta').addEventListener('input', () => { macCaricoMatricole(); macCaricoAnteprima(); });
    document.getElementById('mac-carico-netto').addEventListener('input', macCaricoAnteprima);
    document.getElementById('mac-carico-assegna').addEventListener('change', macCaricoAnteprima);
    document.getElementById('mac-carico-form').addEventListener('submit', macSalvaCarico);
    document.getElementById('mac-carico-annulla').addEventListener('click', macChiudiCarico);
    document.getElementById('mac-carico-close').addEventListener('click', macChiudiCarico);
    document.querySelectorAll('.mac-btn-nuovo-listino').forEach(b => b.addEventListener('click', macCreaArticoloListino));

    // ----- Finestra set -----
    macPickerImposta('mac-set-art-search', 'mac-set-art-results', null, macSetAggiungi);
    document.getElementById('mac-set-righe').addEventListener('click', (e) => {
        const b = e.target.closest('[data-set-togli]');
        if (!b) return;
        macSetLeggiQuantita(); // conserva le quantita' scritte prima di ridisegnare
        macSetRighe.splice(parseInt(b.dataset.setTogli, 10), 1);
        macSetRenderRighe();
    });
    document.getElementById('mac-set-salva').addEventListener('click', macSalvaSet);
    document.getElementById('mac-set-annulla').addEventListener('click', macChiudiSet);
    document.getElementById('mac-set-close').addEventListener('click', macChiudiSet);

    // ----- Pulsanti "Cambia" articolo e lettore matricola (nelle finestre) -----
    document.addEventListener('click', (e) => {
        const cambia = e.target.closest('[data-mac-cambia]');
        if (cambia) {
            if (cambia.dataset.macCambia === 'carico') {
                macCaricoArticolo = null;
                document.getElementById('mac-carico-netto').value = '';
                macCaricoAggiorna();
                document.getElementById('mac-carico-art-search').focus();
            } else {
                macPezzoArticolo = null;
                document.getElementById('mac-pezzo-netto').value = '';
                macPezzoAggiornaArticolo();
                document.getElementById('mac-pezzo-art-search').focus();
            }
            return;
        }
        const scan = e.target.closest('[data-scan]');
        if (scan) {
            macScanApri(scan.dataset.scan);
            return;
        }
        // Click fuori dall'elenco articoli: lo chiude
        Object.keys(macPicker).forEach(id => {
            const cfg = macPicker[id];
            const lista = document.getElementById(cfg.listaId);
            const input = document.getElementById(id);
            if (lista && !lista.classList.contains('hidden') && !lista.contains(e.target) && e.target !== input) {
                lista.classList.add('hidden');
            }
        });
    });
    document.getElementById('mac-scan-close').addEventListener('click', macScanChiudi);
    document.getElementById('mac-scan-annulla').addEventListener('click', macScanChiudi);
});

// ========================================
// ESPOSIZIONE GLOBALE
// ========================================
window.openInventarioMacchine = openInventarioMacchine;
window.macPuoGestire = macPuoGestire;
window.macBadgeListino = macBadgeListino;
window.macCaricaPerListino = macCaricaPerListino;
window.macDopoSalvataggioListino = macDopoSalvataggioListino;
window.macSwitchTab = macSwitchTab;
