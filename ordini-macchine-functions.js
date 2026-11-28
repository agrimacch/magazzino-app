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
// Ordina come set (v7.8): su una riga Da ordinare di un modello che fa parte di uno o piu' set, il tasto "come set"
// sceglie il set e quanti; si apre la solita finestra Segna come ordinate con: le righe del modello (clienti per primi),
// gli altri componenti del set come righe libere (arrivano disponibili) e la nota "COME SET". Il netto non cambia
// (la divisione del prezzo del set tra i componenti e' da decidere). Funzioni omSet*.
// Sposta righe (v7.11.5): nella finestra di una riga di un ordine fatto si spuntano le macchine ancora in arrivo e
// "Sposta" le mette in un altro ordine dello stesso marchio (ORDINI NORMALE o una sezione/prestagionale), esistente
// oppure nuovo (stessa data e iniziali). Clienti e stato non cambiano; l'ordine rimasto vuoto si elimina.
// Per spostare un ORDINE INTERO basta "modifica" e cambiare la sezione. Funzioni omSposta*.
// Da ordinare nelle sezioni (v7.11.6): le righe ANCORA DA ORDINARE si possono spostare da ORDINI NORMALE in una sezione
// (es. PRESTAGIONALE) e viceversa: colonna macchine_pezzi.sezione_da_ordinare (script supabase/ordini-fornitore-da-ordinare.sql).
// Ogni pagina ha il suo blocco "Da ordinare"; "Segna come ordinate" propone la sezione della pagina e poi la colonna si svuota.
// I nuovi "da ordinare" degli ordini clienti arrivano sempre in ORDINI NORMALE. Funzioni omDaoSposta*.
// Fornitori con piu' marchi (v8.3.0): tabella of_fornitori_marchi (es. ECHO, AS MOTOR, WEIBANG -> CORMIK), compilata
// dall'app (pulsante Fornitori). Libro per FORNITORE (default) o per MARCHIO (interruttore). Gli ordini restano uno per
// marchio, ma quelli fatti insieme hanno lo stesso "gruppo" e sono UN blocco. Pagina = marchio oppure 'F:' + fornitore;
// sezioni del fornitore: macchine_of_sezioni.marchio = 'F:CORMIK' (supabase/ordini-fornitore-fornitori.sql). Funzioni omForn*.
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
// FORNITORI CON PIU' MARCHI (v8.3.0)
// ========================================
let omFornMarchi = {};            // MARCHIO -> FORNITORE
let omFornPronto = false;         // false = script ordini-fornitore-fornitori.sql non eseguito: solo vista per marchio

async function omCaricaFornitori() {
    const { data, error } = await supabaseClient.from('of_fornitori_marchi').select('*');
    if (error) {
        omFornPronto = false;
        omFornMarchi = {};
        console.log('Fornitori dei marchi non caricati (manca supabase/ordini-fornitore-fornitori.sql?):', error.message);
        return;
    }
    omFornMarchi = {};
    (data || []).forEach(r => { omFornMarchi[r.marchio] = r.fornitore; });
    omFornPronto = true;
}
// Vista del libro: 'fornitore' (default) o 'marchio'
function omVista() { return omFornPronto && omSessione('omVista') !== 'marchio' ? 'fornitore' : 'marchio'; }
function omEFornitore(k) { return String(k || '').indexOf('F:') === 0; }
function omNomePagina(k) { return omEFornitore(k) ? String(k).slice(2) : String(k || ''); }
function omFornitoreDi(marchio) { return omFornMarchi[marchio] || null; }
// Pagina (linguetta) di un marchio nella vista attuale
function omChiaveDi(marchio) {
    const f = omVista() === 'fornitore' ? omFornitoreDi(marchio) : null;
    return f ? 'F:' + f : marchio;
}
// Marchi di una pagina
function omMarchiDi(k) {
    if (!omEFornitore(k)) return [k];
    const f = omNomePagina(k);
    return Object.keys(omFornMarchi).filter(m => omFornMarchi[m] === f).sort(listinoConfronta);
}
function omInPagina(marchio, k) { return omMarchiDi(k).indexOf(marchio) !== -1; }
function omChiave() { return omSessione('omMarchio') || ''; }
function omNuovoGruppo() { return 'G' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
// Ordini fatti insieme (stesso gruppo)
function omOrdiniGruppo(of) {
    return of && of.gruppo ? macOrdiniFornitore.filter(o => o.gruppo === of.gruppo) : (of ? [of] : []);
}
// Sezioni che si vedono in una pagina: quelle della pagina, e (fornitore) quelle vecchie dei suoi marchi,
// (marchio) quelle del suo fornitore
function omSezioneInPagina(s, k) {
    if (s.marchio === k) return true;
    if (omEFornitore(k)) return omInPagina(s.marchio, k);
    const f = omFornitoreDi(k);
    return !!f && s.marchio === 'F:' + f;
}
function omNomeSezione(s, k) {
    if (!s) return 'ORDINI NORMALE';
    return s.marchio === k ? s.nome : s.nome + ' (' + omNomePagina(s.marchio) + ')';
}

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

// Pagina aperta nel marchio: null = ORDINI NORMALE, altrimenti id della sezione
function omPaginaCorrente() {
    const s = omSessione('omSezione');
    return s && s !== OM_NORMALE ? Number(s) : null;
}

// Macchine DA ORDINARE. Con il marchio: solo quelle della pagina (pagina non indicata = pagina aperta).
// Senza marchio: tutte (per i numeri sui divisori)
function omDaOrdinare(marchio, pagina) {
    if (!marchio) return macPezzi.filter(p => p.stato === 'DA_ORDINARE');
    const pg = pagina === undefined ? omPaginaCorrente() : pagina;
    return macPezzi.filter(p => p.stato === 'DA_ORDINARE' && omInPagina(omMarchioDi(p), marchio) && (Number(p.sezione_da_ordinare) || null) === pg);
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
    return macOfSezioni.filter(s => omSezioneInPagina(s, marchio))
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
    // pagina di un fornitore: i modelli raggruppati per marchio
    if (omEFornitore(omChiave())) articoli.sort((x, y) => listinoConfronta(x.marchio, y.marchio));
    const senza = Object.keys(per).filter(id => !macArticolo(Number(id)));
    return articoli.map(a => ({ art: a, pezzi: per[a.id] })).concat(senza.map(id => ({ art: null, pezzi: per[id] })));
}

// "TOSASIEPI <b>HSA 140 T</b> SENZA BATTERIA  STIHA02-011-3515" (attrezzo, modello in grassetto, note, codice articolo)
function omDescrizioneHtml(a) {
    if (!a) return 'ARTICOLO NON PIU&#39; NEL LISTINO';
    return (omEFornitore(omChiave()) && a.marchio ? '<span class="om-marca-tag">' + macEsc(a.marchio) + '</span> ' : '') + (a.attrezzo ? macEsc(a.attrezzo) + ' ' : '') + '<span class="om-codice">' + macEsc(a.modello || '') + '</span>' +
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
        await listinoArticoliAggiorna();   // v8.8.2: sempre gli articoli aggiornati
        await macCaricaDati();
        await omCaricaFornitori();
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
    const aggiungi = k => { if (k && !(k in conta)) conta[k] = 0; };
    omDaOrdinare().forEach(p => { const k = omChiaveDi(omMarchioDi(p)); conta[k] = (conta[k] || 0) + 1; });
    const mostraArrivati = document.getElementById('om-mostra-arrivati') && document.getElementById('om-mostra-arrivati').checked;
    macOrdiniFornitore.forEach(of => { if (mostraArrivati || !omOfArrivato(of)) aggiungi(omChiaveDi(of.marchio)); });
    macOfSezioni.forEach(s => {
        if (s.chiusa) return;
        if (omEFornitore(s.marchio)) { if (omVista() === 'fornitore' && omMarchiDi(s.marchio).length) aggiungi(s.marchio); }
        else aggiungi(omChiaveDi(s.marchio));
    });
    // Pagina aperta con "Vai a...": resta se e' ancora un marchio del listino o un fornitore con marchi
    // (un marchio di prova cancellato non deve restare tra i divisori)
    const scelto = omChiave();
    if (scelto && (omEFornitore(scelto) ? omMarchiDi(scelto).length > 0 : listinoArticoli.some(a => a.attivo && a.marchio === scelto))) aggiungi(scelto);
    return conta;
}

// Pagina salvata adattata alla vista (marchio di un fornitore -> pagina del fornitore e viceversa)
function omAdattaChiave() {
    let k = omChiave();
    if (!k) return;
    if (!omEFornitore(k) && omVista() === 'fornitore') k = omChiaveDi(k);
    else if (omEFornitore(k) && omVista() === 'marchio') k = omMarchiDi(k)[0] || '';
    if (k !== omChiave()) omSessione('omMarchio', k || null);
}

function omRender() {
    const pagina = document.getElementById('om-pagina');
    const divisori = document.getElementById('om-divisori');
    if (!pagina || !divisori || !omCaricato) return;

    const avviso = document.getElementById('om-avviso-sql');
    if (avviso) avviso.classList.toggle('hidden', macOfPronto);

    omAdattaChiave();
    omAggiornaBarraVista();
    omPopolaVaiMarchio();
    const conta = omMarchi();
    const marchi = Object.keys(conta).sort((a, b) => listinoConfronta(omNomePagina(a), omNomePagina(b)));
    let marchio = omChiave();
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
                (omEFornitore(m) ? '&#127970; ' : '') + macEsc(omNomePagina(m)) + ' <span>' + conta[m] + '</span></button>').join(' ')
            : '&#9989; Nessuna macchina da ordinare.';
    }

    const colori = typeof macColoriDivisori === 'function' ? macColoriDivisori(marchi) : {};
    divisori.innerHTML = marchi.map(m =>
        '<button type="button" class="mac-divisorio' + (m === marchio ? ' active' : '') + '" data-om-marchio="' + macEsc(m) + '"' +
            (colori[m] ? ' style="' + colori[m] + '"' : '') + (omEFornitore(m) ? ' title="' + macEsc(omMarchiDi(m).join(', ')) + '"' : '') + '>' +
            '<span>' + macEsc(omNomePagina(m)) + '</span>' + (conta[m] ? '<span class="om-badge">' + conta[m] + '</span>' : '') + '</button>'
    ).join('');

    if (!marchio) {
        pagina.innerHTML = '<p class="mac-q-vuoto">Nessun ordine.<br>Le macchine <strong>da ordinare</strong> degli ordini clienti compaiono qui da sole, divise per ' + (omVista() === 'fornitore' ? 'fornitore' : 'marchio') + '.<br>' +
            'Per un prestagionale scegli il fornitore o il marchio da <strong>Vai a...</strong> e crea una sezione.</p>';
        return;
    }
    pagina.innerHTML = omHtmlMarchio(marchio);
}

function omHtmlMarchio(marchio) {
    const sezioni = omSezioniMarchio(marchio);
    let sezione = omSessione('omSezione') || OM_NORMALE;
    const sezScelta = sezione !== OM_NORMALE ? sezioni.find(s => String(s.id) === String(sezione)) : null;
    if (sezione !== OM_NORMALE && !sezScelta) { sezione = OM_NORMALE; omSessione('omSezione', OM_NORMALE); }
    const daOrdinare = omDaOrdinare(marchio, null);

    let html = '<div class="om-testa"><h3 class="mac-evidenziatore">' + (omEFornitore(marchio) ? '&#127970; ' : '') + macEsc(omNomePagina(marchio)) + '</h3>' +
        (omEFornitore(marchio)
            ? '<div class="om-forn-marchi">' + omMarchiDi(marchio).map(m => '<span class="om-marca-tag">' + macEsc(m) + '</span>').join(' ') +
                ' <button type="button" class="mac-link" data-om-azione="fornitori">&#9881;&#65039; marchi</button></div>'
            : (omFornPronto && omVista() === 'fornitore' && !omFornitoreDi(marchio)
                ? '<div class="om-forn-marchi"><button type="button" class="mac-link" data-om-azione="assegna-fornitore">&#127970; Assegna a un fornitore</button></div>' : '')) +
        '</div>';
    // Pagine del marchio (come le pagine di OneNote)
    html += '<div class="om-pagine">' +
        '<button type="button" class="om-pagina-btn' + (sezione === OM_NORMALE ? ' active' : '') + '" data-om-sezione="' + OM_NORMALE + '">ORDINI NORMALE' +
            (daOrdinare.length ? ' <span class="om-badge">' + daOrdinare.length + '</span>' : '') + '</button>' +
        sezioni.map(s => {
            const n = omDaOrdinare(marchio, s.id).length;
            return '<button type="button" class="om-pagina-btn' + (String(s.id) === String(sezione) ? ' active' : '') + (s.chiusa ? ' om-chiusa' : '') +
                '" data-om-sezione="' + s.id + '">' + macEsc(omNomeSezione(s, marchio)) + (n ? ' <span class="om-badge">' + n + '</span>' : '') + '</button>';
        }).join('') +
        (macOfPronto ? '<button type="button" class="om-pagina-btn om-pagina-nuova" data-om-azione="nuova-sezione">&#10133; Sezione</button>' : '') +
    '</div>';

    if (sezione === OM_NORMALE) {
        html += '<div class="om-sez-testa"><div class="mac-aiuto">Ordini senza consegna programmata. Le macchine da ordinare dei clienti arrivano da sole; ' +
            'per il magazzino usa <strong>&#10133; Aggiungi riga</strong> (si ordina insieme alle altre), scrivi in <strong>quante</strong> pi&ugrave; di quelle richieste, ' +
            'oppure <strong>Nuovo ordine</strong> per un ordine gi&agrave; fatto solo per il magazzino.</div>' +
            '<div class="om-sez-azioni">' + (macOfPronto ? '<button type="button" class="btn-primary mac-btn-piccolo" data-om-azione="nuovo-of">&#10133; Nuovo ordine</button>' : '') + '</div></div>';
        // v8.3.0: prima gli ordini fatti (dal piu' vecchio), in fondo le macchine ancora da ordinare
        html += omHtmlOrdiniFatti(marchio, null);
        html += omHtmlDaOrdinare(daOrdinare, null);
    } else {
        html += '<div class="om-sez-testa">' +
            '<div><strong>' + macEsc(omNomeSezione(sezScelta, marchio)) + '</strong>' + (sezScelta.chiusa ? ' <span class="om-tag-chiusa">chiusa</span>' : '') +
                (sezScelta.note ? '<div class="om-sez-note">' + macEsc(sezScelta.note) + '</div>' : '') + '</div>' +
            '<div class="om-sez-azioni">' +
                (!sezScelta.chiusa ? '<button type="button" class="btn-primary mac-btn-piccolo" data-om-azione="nuovo-of">&#10133; Nuovo ordine</button>' +
                    '<button type="button" class="btn-back mac-btn-piccolo" data-om-azione="carica-xls">&#128229; Carica Excel</button>' : '') +
                '<button type="button" class="btn-back mac-btn-piccolo" data-om-azione="modifica-sezione">&#9997;&#65039; Sezione</button>' +
            '</div>' +
        '</div>';
        html += '<p class="mac-aiuto">Ordini con consegna programmata (prestagionali). Le righe senza cliente sono macchine <strong>in arrivo libere</strong>: ' +
            'il primo ordine cliente di quel modello le prende da solo. Le macchine ancora da ordinare si portano qui da <strong>ORDINI NORMALE</strong>: spunta le righe e <strong>Sposta in</strong> questa sezione; quando le ordini, <strong>Segna come ordinate</strong>.</p>';
        html += omHtmlOrdiniFatti(marchio, sezScelta.id);
        html += omHtmlDaOrdinare(omDaOrdinare(marchio, sezScelta.id), sezScelta);
    }
    return html;
}

// ---------- Righe da ordinare (macchine DA ORDINARE dei clienti) ----------
function omHtmlDaOrdinare(pezzi, sezione) {
    if (pezzi.length === 0) {
        if (sezione && sezione.chiusa) return '';
        return '<div class="om-blocco om-blocco-daord"><div class="om-blocco-titolo">&#9989; Niente da ordinare ' + (sezione ? 'in questa sezione' : (omEFornitore(omChiave()) ? 'per questo fornitore' : 'per questo marchio')) +
            (macOfPronto ? '<button type="button" class="btn-back mac-btn-piccolo om-dao-btn" data-om-azione="aggiungi-dao">&#10133; Aggiungi riga</button>' : '') + '</div></div>';
    }
    const gruppi = omPerArticolo(pezzi);
    // tolgo dalla selezione articoli che non ci sono piu'
    Object.keys(omSelezione).forEach(id => { if (!gruppi.some(g => g.art && String(g.art.id) === id)) delete omSelezione[id]; });
    const totSel = Object.keys(omSelezione).reduce((t, id) => t + omSelezione[id], 0);
    let html = '<div class="om-blocco om-blocco-daord">' +
        '<div class="om-blocco-titolo">&#128203; Da ordinare <small>(' + (sezione ? 'spostate in questa sezione' : 'dagli ordini clienti') + ', dal pi&ugrave; vecchio)</small>' +
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
                    (a && macOfPronto && omSetCheContengono(a.id).length ? ' <button type="button" class="mac-link om-come-set" data-om-come-set="' + a.id + '" title="Ordina questo modello dentro un set: gli altri pezzi del set arrivano liberi">&#129513; ordina come set</button>' : '') +
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
    '</div>' + omHtmlDaoSposta(totSel, sezione) + '</div>';
    return html;
}

// Sposta le righe spuntate (ancora da ordinare) in un'altra pagina del marchio (v7.11.6)
function omHtmlDaoSposta(totSel, sezione) {
    if (!macOfPronto) return '';
    const marchio = omSessione('omMarchio');
    const qui = sezione ? sezione.id : null;
    const pagine = [{ id: null, nome: 'ORDINI NORMALE' }].concat(omSezioniMarchio(marchio).filter(s => !s.chiusa).map(s => ({ id: s.id, nome: omNomeSezione(s, marchio) })))
        .filter(pg => pg.id !== qui);
    if (!pagine.length) return '';
    return '<div class="om-dao-sposta">' +
        '<label for="om-dao-sposta-dove">&#10145;&#65039; Sposta le spuntate' + (totSel ? ' (' + totSel + ')' : '') + ' in</label>' +
        '<select id="om-dao-sposta-dove">' + pagine.map(pg => '<option value="' + (pg.id || OM_NORMALE) + '">' + macEsc(pg.nome) + '</option>').join('') + '</select>' +
        '<button type="button" class="btn-back mac-btn-piccolo" data-om-azione="dao-sposta"' + (totSel ? '' : ' disabled') + '>Sposta</button>' +
        '<small>Restano <strong>da ordinare</strong> (non vengono ordinate): le ritrovi in quella pagina. ' +
            (pagine.length === 1 && !sezione ? 'Per un prestagionale crea prima la sezione con <strong>&#10133; Sezione</strong>.' : '') + '</small>' +
    '</div>';
}

async function omDaoSposta() {
    const marchio = omSessione('omMarchio');
    const pezzi = omPezziSelezionati(marchio);
    if (!pezzi.length) { await showCustomAlert('Spunta le righe da spostare.', 'Sposta', '&#8505;&#65039;'); return; }
    const v = document.getElementById('om-dao-sposta-dove').value;
    const dest = v && v !== OM_NORMALE ? Number(v) : null;
    const sez = dest ? macOfSezione(dest) : null;
    const nome = sez ? sez.nome : 'ORDINI NORMALE';
    if (!window.confirm('Spostare ' + pezzi.length + (pezzi.length === 1 ? ' macchina' : ' macchine') + ' da ordinare in ' + nome + '?\n\n' +
        'Restano DA ORDINARE (non vengono ordinate): le ritrovi in quella pagina.')) return;
    const adesso = new Date().toISOString();
    const utente = macUtente();
    try {
        const { error } = await supabaseClient.from('macchine_pezzi')
            .update({ sezione_da_ordinare: dest, updated_at: adesso, updated_by: utente }).in('id', pezzi.map(p => p.id));
        if (error) throw error;
        pezzi.forEach(p => { p.sezione_da_ordinare = dest; });
        await macRegistra(pezzi.map(p => ({
            pezzo_id: p.id, articolo_id: p.articolo_id, tipo: 'ORDINE', stato_prima: 'DA_ORDINARE', stato_dopo: 'DA_ORDINARE',
            cliente: p.cliente || null, matricola: null, netto: null, dettaglio: 'DA ORDINARE SPOSTATA IN ' + nome
        })));
    } catch (error) {
        console.error('Errore sposta da ordinare:', error);
        const manca = /sezione_da_ordinare/i.test(String(error.message || ''));
        await showCustomAlert('Errore:<br>' + macEsc(error.message) +
            (manca ? '<br><br>Esegui su Supabase lo script <strong>supabase/ordini-fornitore-da-ordinare.sql</strong>.' : ''), 'Errore', '&#10060;');
        await omRicarica();
        return;
    }
    omSelezione = {};
    omSessione('omSezione', dest ? String(dest) : OM_NORMALE);   // si va nella pagina di destinazione
    await omRicarica();
}

// ---------- Ordini fatti (blocchi con data e iniziali) ----------
function omHtmlOrdiniFatti(marchio, sezioneId) {
    const mostraArrivati = document.getElementById('om-mostra-arrivati') && document.getElementById('om-mostra-arrivati').checked;
    const tutti = macOrdiniFornitore.filter(of => omInPagina(of.marchio, marchio) && (of.sezione_id || null) === (sezioneId || null));
    // v8.3.0: gli ordini fatti insieme (stesso gruppo, piu' marchi dello stesso fornitore) sono UN blocco
    const blocchi = [];
    const perGruppo = {};
    tutti.forEach(of => {
        if (!of.gruppo) { blocchi.push([of]); return; }
        if (!perGruppo[of.gruppo]) { perGruppo[of.gruppo] = []; blocchi.push(perGruppo[of.gruppo]); }
        perGruppo[of.gruppo].push(of);
    });
    // dal piu' vecchio (in alto) al piu' recente (in basso)
    const chiave = b => String(b[0].data) + String(Math.min.apply(null, b.map(o => o.id))).padStart(9, '0');
    blocchi.sort((a, b) => chiave(a).localeCompare(chiave(b)));
    const visibili = blocchi.filter(b => mostraArrivati || !b.every(omOfArrivato));
    const nascosti = blocchi.length - visibili.length;
    let html = '<div class="om-fatti-titolo">Ordini fatti' + (nascosti ? ' <small>(' + nascosti + ' gi&agrave; arrivati nascosti)</small>' : '') + '</div>';
    if (visibili.length === 0) {
        html += '<p class="mac-aiuto">' + (sezioneId ? 'Nessun ordine in questa sezione: usa <strong>Nuovo ordine</strong>.' : 'Nessun ordine in corso.') + '</p>';
        return html;
    }
    visibili.forEach(b => { html += omHtmlOf(b); });
    return html;
}

// lista: un ordine o gli ordini dello stesso gruppo (uno per marchio)
function omHtmlOf(lista) {
    if (!Array.isArray(lista)) lista = [lista];
    lista = lista.slice().sort((x, y) => listinoConfronta(x.marchio, y.marchio));
    const of = lista[0];
    const arrivato = lista.every(omOfArrivato);
    let html = '<div class="om-blocco' + (arrivato ? ' om-blocco-arrivato' : '') + '">';
    let nRighe = 0;
    lista.forEach(o => {
    const gruppi = omPerArticolo(omPezziOf(o));
    nRighe += gruppi.length;
    gruppi.forEach(g => {
        const a = g.art;
        const arrivate = g.pezzi.filter(omArrivato);
        const attesa = g.pezzi.filter(p => !omArrivato(p));
        const conCliente = g.pezzi.filter(p => p.cliente);
        const libere = attesa.filter(p => !p.cliente).length;
        const tutto = arrivate.length === g.pezzi.length;
        const quadro = tutto ? '<span class="mac-quadro om-quadro-ok">&#10003;</span>' : '<span class="mac-quadro st-ordinata"></span>';
        html += '<button type="button" class="om-riga om-riga-of" data-om-riga="' + o.id + '|' + (a ? a.id : 0) + '">' +
            '<span class="om-riga-check">' + quadro + '</span>' +
            '<span class="om-riga-testo"><strong class="om-qta">' + g.pezzi.length + '</strong> ' +
                omDescrizioneHtml(a) +
                (arrivate.length && !tutto ? ' <span class="om-arrivate">(arrivat' + (arrivate.length === 1 ? 'a 1' : 'e ' + arrivate.length) + ' su ' + g.pezzi.length + ')</span>' : '') +
                ((conCliente.length || libere) ? '<span class="om-clienti">' + omClienteTesto(conCliente) +
                    (libere ? (conCliente.length ? ' &middot; ' : '') + '<em>' + libere + ' in arrivo ' + (libere === 1 ? 'libera' : 'libere') + '</em>' : '') + '</span>' : '') +
            '</span>' +
        '</button>';
    });
    });
    if (nRighe === 0) html += '<p class="mac-aiuto">Nessuna riga.</p>';
    html += '<div class="om-firma"><span class="om-firma-data">' + macDataCorta(of.data) + ' ' + macEsc(of.operatore || '') + '</span>' +
        (lista.length > 1 ? ' <span class="om-of-marchi">' + lista.map(o => macEsc(o.marchio)).join(' + ') + '</span>' : '') +
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
    const nomeTit = modo === 'modifica' ? omOrdiniGruppo(of).map(o => o.marchio).join(' + ') : omNomePagina(marchio);
    document.getElementById('om-of-titolo').innerHTML = modo === 'segna' ? '&#9745;&#65039; Segna come ordinate - ' + macEsc(nomeTit)
        : modo === 'nuovo' ? '&#10133; Nuovo ordine - ' + macEsc(nomeTit) : '&#9997;&#65039; Ordine del ' + macDataCorta(of.data) + ' - ' + macEsc(nomeTit);
    document.getElementById('om-of-data').value = of ? String(of.data).slice(0, 10) : omOggiISO();
    document.getElementById('om-of-operatore').value = of ? (of.operatore || '') : macIniziali();
    document.getElementById('om-of-consegna').value = of ? (of.consegna || '') : '';
    document.getElementById('om-of-note').value = of ? (of.note || '') : '';
    const sel = document.getElementById('om-of-sezione');
    // v7.11.6: anche "Segna come ordinate" propone la pagina aperta (le righe da ordinare di una sezione restano li')
    let scelta = of ? (of.sezione_id || OM_NORMALE) : ((modo === 'nuovo' || modo === 'segna') ? (sezioneCorrente || OM_NORMALE) : OM_NORMALE);
    sel.innerHTML = '<option value="' + OM_NORMALE + '">ORDINI NORMALE</option>' +
        sezioni.map(s => '<option value="' + s.id + '">' + macEsc(omNomeSezione(s, marchio)) + '</option>').join('');
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
    const veloce = document.getElementById('om-of-veloce');
    if (veloce) veloce.value = '';
    omRenderOfRighe();
    document.getElementById('om-of-elimina').classList.toggle('hidden', modo !== 'modifica');
    document.getElementById('om-of-salva').disabled = false;
    document.getElementById('om-of-modal').classList.remove('hidden');
}

function omChiudiFinestraOf() {
    document.getElementById('om-of-modal').classList.add('hidden');
    if (omComeSet) { omComeSet = null; omSelezione = {}; }
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

// ---------- Inserimento veloce di piu' righe (v8.3.0) ----------
// Una riga per modello: "5 HRM1500", "HRM1500 5", "HRM1500 x 5" oppure il codice articolo.
// Senza numero = 1. Si cercano solo i modelli del marchio aperto.
function omOfVeloceRighe(testo) {
    return String(testo || '').split(/\r?\n|;/).map(r => r.trim()).filter(Boolean).map(riga => {
        let n = 1;
        let nome = riga;
        let m = riga.match(/^(\d{1,3})\s*(?:X|PZ|PZ\.)?\s+(.+)$/i);
        if (m) { n = parseInt(m[1], 10); nome = m[2]; }
        else {
            m = riga.match(/^(.+?)\s+(?:X\s*|QTA\s*|Q\.?\s*)?(\d{1,3})\s*(?:PZ\.?)?$/i);
            if (m) { nome = m[1]; n = parseInt(m[2], 10); }
        }
        // numero in fondo: potrebbe essere parte del modello ("MIIMO 520"), lo controllo dopo
        return { riga: riga, nome: listinoPulisciTesto(nome) || '', n: n, coda: !!m && nome !== riga && !/^\d/.test(riga) };
    });
}

function omOfVeloceTrova(nome) {
    const marchio = omChiave();
    const tutti = listinoArticoli.filter(a => a.attivo && omInPagina(a.marchio, marchio));
    const norm = t => String(t || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const n = norm(nome);
    if (!n) return { art: null, quanti: 0 };
    // 1) codice articolo esatto  2) modello o nome esatto  3) ricerca con un solo risultato
    let trovati = tutti.filter(a => norm(a.codice_articolo) === n);
    if (!trovati.length) trovati = tutti.filter(a => norm(a.modello) === n || norm(macNome(a)) === n);
    if (!trovati.length) trovati = tutti.filter(a => listinoCorrispondeRicerca(a, nome));
    return { art: trovati.length === 1 ? trovati[0] : null, quanti: trovati.length };
}

async function omOfVeloceAggiungi() {
    const area = document.getElementById('om-of-veloce');
    const righe = omOfVeloceRighe(area.value);
    if (!righe.length) { await showCustomAlert('Scrivi una riga per modello, es. <strong>5 HRM1500</strong>.', 'Inserimento veloce', '&#9888;&#65039;'); return; }
    const restano = [];
    const problemi = [];
    let aggiunte = 0;
    righe.forEach(r => {
        if (r.coda) {
            // "MIIMO 520": se la riga intera e' un modello, il numero fa parte del nome (quantita' 1)
            const intero = omOfVeloceTrova(listinoPulisciTesto(r.riga));
            const n = String(r.riga).toUpperCase().replace(/[^A-Z0-9]/g, '');
            if (intero.art && [intero.art.codice_articolo, intero.art.modello, macNome(intero.art)].some(x => String(x || '').toUpperCase().replace(/[^A-Z0-9]/g, '') === n)) {
                r.nome = listinoPulisciTesto(r.riga);
                r.n = 1;
            }
        }
        if (!(r.n >= 1 && r.n <= MAC_MAX_QTA)) { restano.push(r.riga); problemi.push(macEsc(r.riga) + ': quantit&agrave; da 1 a ' + MAC_MAX_QTA); return; }
        const t = omOfVeloceTrova(r.nome);
        if (!t.art) {
            restano.push(r.riga);
            problemi.push(macEsc(r.riga) + ': ' + (t.quanti > 1 ? t.quanti + ' modelli trovati, scrivi il codice o il nome completo' : (omEFornitore(omChiave()) ? 'modello non trovato tra i marchi di questo fornitore' : 'modello non trovato in questo marchio')));
            return;
        }
        const gia = omOfRighe.find(x => x.art.id === t.art.id);
        if (gia) gia.n = Math.min(MAC_MAX_QTA, gia.n + r.n);
        else omOfRighe.push({ art: t.art, n: r.n });
        aggiunte++;
    });
    area.value = restano.join('\n');
    omRenderOfRighe();
    if (problemi.length) {
        await showCustomAlert((aggiunte ? '<strong>' + aggiunte + '</strong> righe aggiunte.<br><br>' : '') +
            'Da sistemare (sono rimaste nel riquadro):<br>' + problemi.join('<br>'), 'Inserimento veloce', '&#9888;&#65039;');
    }
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
        // v8.3.0: nella pagina di un fornitore gli ordini (uno per marchio) fatti insieme hanno lo stesso gruppo
        const gruppoNuovo = omFornPronto && omEFornitore(marchio) ? omNuovoGruppo() : null;
        const base = { sezioneId: sezioneId, data: data, operatore: operatore, consegna: consegna, note: note, gruppo: gruppoNuovo };
        if (omFinestraModo === 'segna') {
            // ricontrollo: devono essere ancora da ordinare
            const ancora = omFinestraPezzi.filter(p => p.stato === 'DA_ORDINARE');
            // macchine in piu' (quante > richieste) + altri modelli aggiunti: stesse righe libere dell'ordine
            const libere = omExtraSelezione(marchio);
            omOfRighe.forEach(r => {
                const x = libere.find(e => e.art.id === r.art.id);
                if (x) x.n += r.n; else libere.push({ art: r.art, n: r.n });
            });
            let creati = [];
            if (ancora.length) {
                const dati = { data: data, operatore: operatore, sezione_id: sezioneId, consegna: consegna, note: note };
                if (gruppoNuovo) dati.gruppo = gruppoNuovo;
                creati = await macSegnaOrdinate(ancora, dati);
                // ordinate: non sono piu' "da ordinare" di una sezione (se tornano da ordinare vanno in ORDINI NORMALE)
                const conSez = ancora.filter(p => p.sezione_da_ordinare);
                if (conSez.length) {
                    const { error: eSez } = await supabaseClient.from('macchine_pezzi').update({ sezione_da_ordinare: null }).in('id', conSez.map(p => p.id));
                    if (eSez) console.log('sezione_da_ordinare non svuotata:', eSez.message);
                    else conSez.forEach(p => { p.sezione_da_ordinare = null; });
                }
            }
            if (libere.length) await omRigheLiberePerMarchio(libere, base, creati);
            omSelezione = {};
        } else if (omFinestraModo === 'nuovo') {
            await omRigheLiberePerMarchio(omOfRighe, base, []);
        } else {
            // modifica: data, iniziali, consegna, note e sezione valgono per tutto il gruppo
            const of = omOfInModifica;
            const gruppo = omOrdiniGruppo(of);
            const agg = { data: data, operatore: operatore, consegna: consegna, note: note, sezione_id: sezioneId, updated_at: adesso, updated_by: utente };
            const { error } = await supabaseClient.from('macchine_of_ordini').update(agg).in('id', gruppo.map(o => o.id));
            if (error) throw error;
            gruppo.forEach(o => Object.assign(o, agg));
            if (omOfRighe.length) {
                // righe di un altro marchio dello stesso fornitore: nuovo ordine nello stesso gruppo
                const altroMarchio = omOfRighe.some(r => !gruppo.some(o => o.marchio === (r.art.marchio || 'SENZA MARCHIO')));
                if (altroMarchio && !of.gruppo && omFornPronto) {
                    const g = omNuovoGruppo();
                    const { error: eG } = await supabaseClient.from('macchine_of_ordini').update({ gruppo: g }).eq('id', of.id);
                    if (eG) throw eG;
                    of.gruppo = g;
                }
                await omRigheLiberePerMarchio(omOfRighe, { sezioneId: sezioneId, data: data, operatore: operatore, consegna: consegna, note: note, gruppo: of.gruppo || null }, gruppo);
            }
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
    document.getElementById('om-dao-titolo').innerHTML = '&#10133; Da ordinare per il magazzino - ' + macEsc(omNomePagina(omChiave()));
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
            for (let k = 0; k < x.n; k++) {
                const riga = { articolo_id: x.art.id, stato: 'DA_ORDINARE', cliente: null, updated_at: adesso, updated_by: utente };
                if (omPaginaCorrente()) riga.sezione_da_ordinare = omPaginaCorrente();   // aggiunta da una sezione: resta li'
                nuovi.push(riga);
            }
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

// ========================================
// ORDINA COME SET (v7.8)
// ========================================
let omComeSet = null;   // { comp, set, nSet } mentre la finestra dell'ordine e' aperta

// Set attivi che contengono questo modello: [{ set, q }] (q = quanti di quel modello in un set)
function omSetCheContengono(articoloId) {
    const visti = {};
    const out = [];
    macComposizione.filter(r => r.componente_id === articoloId).forEach(r => {
        const s = macArticolo(r.set_id);
        if (!s || !s.attivo || visti[s.id]) return;
        visti[s.id] = true;
        out.push({ set: s, q: r.quantita || 1 });
    });
    return out.sort((x, y) => listinoConfronta(macNome(x.set), macNome(y.set)));
}

function omEuro(n) {
    if (n === null || n === undefined || n === '') return '-';
    const v = Number(n);
    return isNaN(v) ? '-' : listinoFormatEuro(v);
}

function omApriComeSet(articoloId) {
    const a = macArticolo(articoloId);
    if (!a) return;
    const marchio = omSessione('omMarchio');
    const richieste = omDaOrdinare(marchio).filter(p => p.articolo_id === a.id).length;
    const sets = omSetCheContengono(a.id);
    omComeSet = { comp: a, set: null, nSet: Math.max(1, richieste) };
    document.getElementById('om-set-titolo').innerHTML = '&#129513; Ordina come set - ' + macEsc(macNome(a));
    document.getElementById('om-set-info').innerHTML = '<strong>' + richieste + '</strong> da ordinare di ' + omDescrizioneHtml(a) +
        '<br><small>Netto del modello da solo: <strong>' + omEuro(a.netto_1) + '</strong></small>';
    document.getElementById('om-set-lista').innerHTML = sets.map((x, i) =>
        '<label class="om-set-voce"><input type="radio" name="om-set-scelta" value="' + x.set.id + '"' + (i === 0 ? ' checked' : '') + '>' +
            '<span><strong>' + macEsc(macNome(x.set)) + '</strong>' + (x.set.codice_articolo ? ' <small>(' + macEsc(x.set.codice_articolo) + ')</small>' : '') +
            '<br><small>' + macEsc(macDescrizioneComponenti(x.set.id)) + '</small>' +
            '<br><small>Netto del set: <strong>' + omEuro(x.set.netto_1) + '</strong>' + (x.q > 1 ? ' &middot; contiene ' + x.q + ' pezzi di questo modello' : '') + '</small></span></label>'
    ).join('');
    document.getElementById('om-set-quanti').value = String(Math.max(1, richieste));
    document.getElementById('om-set-modal').classList.remove('hidden');
}

function omChiudiComeSet(tieni) {
    document.getElementById('om-set-modal').classList.add('hidden');
    if (!tieni) omComeSet = null;
}

// Prosegui: la finestra "Segna come ordinate" gia' compilata con il set
function omComeSetProsegui() {
    const s = omComeSet;
    if (!s) return;
    const scelta = document.querySelector('input[name="om-set-scelta"]:checked');
    const set = scelta ? macArticolo(Number(scelta.value)) : null;
    const nSet = Math.min(MAC_MAX_QTA, Math.max(1, parseInt(document.getElementById('om-set-quanti').value, 10) || 1));
    if (!set) return;
    const comp = macComponenti(set.id);
    const riga = comp.find(r => r.componente_id === s.comp.id);
    const qComp = (riga ? riga.quantita || 1 : 1) * nSet;
    s.set = set;
    s.nSet = nSet;
    omChiudiComeSet(true);
    const marchio = omSessione('omMarchio');
    // il modello: tanti quanti ne arrivano nei set (clienti per primi; se avanzano, arrivano liberi)
    omSelezione = {};
    omSelezione[s.comp.id] = qComp;
    const pezzi = omPezziSelezionati(marchio);
    omOfInModifica = null;
    // gli altri componenti del set: righe libere (arrivano disponibili)
    omOfRighe = comp.filter(r => r.componente_id !== s.comp.id).map(r => ({ art: macArticolo(r.componente_id), n: (r.quantita || 1) * nSet })).filter(r => r.art);
    omApriFinestraOf('segna', marchio, pezzi);
    document.getElementById('om-of-titolo').innerHTML = '&#129513; Ordina come set - ' + macEsc(omNomePagina(marchio));
    document.getElementById('om-of-note').value = 'COME SET: ' + nSet + ' X ' + macNome(set) + (set.codice_articolo ? ' (' + set.codice_articolo + ')' : '');
    const riep = document.getElementById('om-of-riepilogo');
    riep.innerHTML = '<div class="om-set-avviso">&#129513; Al fornitore ordini <strong>' + nSet + ' x ' + macEsc(macNome(set)) + '</strong>' +
        (set.codice_articolo ? ' <small>(' + macEsc(set.codice_articolo) + ')</small>' : '') + '. ' +
        'Nel magazzino arrivano i pezzi singoli: ' + macEsc(s.comp.modello || macNome(s.comp)) + ' per i clienti, gli altri pezzi <strong>liberi</strong> (disponibili).' +
        '<br><small>Il netto non viene diviso tra i pezzi: lo scrivi al carico come sempre.</small></div>' + riep.innerHTML;
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

async function omCreaOf(marchio, sezioneId, data, operatore, consegna, note, gruppo) {
    const utente = macUtente();
    const riga = {
        marchio: marchio, sezione_id: sezioneId || null, data: data, operatore: operatore, consegna: consegna || null, note: note || null,
        created_by: utente, updated_by: utente
    };
    if (gruppo) riga.gruppo = gruppo;
    const { data: nuovo, error } = await supabaseClient.from('macchine_of_ordini').insert([riga]).select('*').single();
    if (error) throw error;
    macOrdiniFornitore.push(nuovo);
    return nuovo;
}

// Righe libere di piu' marchi (pagina del fornitore): ognuna nell'ordine del suo marchio.
// ordini: ordini gia' fatti insieme (si cerca li' quello del marchio, altrimenti se ne crea uno con i dati di base)
async function omRigheLiberePerMarchio(righe, base, ordini) {
    const per = {};
    righe.forEach(r => { const m = (r.art && r.art.marchio) || 'SENZA MARCHIO'; (per[m] = per[m] || []).push(r); });
    for (const m of Object.keys(per)) {
        let of = ordini.find(o => o.marchio === m);
        if (!of) {
            of = await omCreaOf(m, base.sezioneId, base.data, base.operatore, base.consegna, base.note, base.gruppo);
            ordini.push(of);
        }
        await omAggiungiRigheLibere(of, per[m]);
    }
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
    const gruppo = omOrdiniGruppo(of);   // v8.3.0: ordine di piu' marchi = si elimina tutto
    const pezzi = [].concat.apply([], gruppo.map(omPezziOf));
    const attesa = pezzi.filter(p => p.stato === 'ORDINATA');
    const clienti = attesa.filter(p => p.cliente).length;
    const libere = attesa.length - clienti;
    const arrivate = pezzi.length - attesa.length;
    if (!window.confirm('Eliminare l\'ordine del ' + macDataCorta(of.data) + ' ' + of.operatore +
        (gruppo.length > 1 ? ' (' + gruppo.map(o => o.marchio).join(' + ') + ')' : '') + '?\n\n' +
        (clienti ? '- ' + clienti + ' macchine dei clienti tornano DA ORDINARE\n' : '') +
        (libere ? '- ' + libere + ' righe in arrivo libere vengono tolte\n' : '') +
        (arrivate ? '- ' + arrivate + ' macchine gia\' arrivate restano come sono\n' : '') +
        '\nL\'operazione non si pu\u00f2 annullare.')) return;
    try {
        await macRiportaDaOrdinare(attesa, 'ORDINE FORNITORE ELIMINATO', false);
        const { error } = await supabaseClient.from('macchine_of_ordini').delete().in('id', gruppo.map(o => o.id));
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
    omRigaPreparaSposta(of, pezzi);
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

// ---------- Sposta in un altro ordine / sezione (v7.11.5) ----------
// Elenco delle destinazioni: ordini in corso dello stesso marchio (tranne questo) e "nuovo ordine" per ogni pagina
function omRigaPreparaSposta(of, pezzi) {
    const box = document.getElementById('om-riga-sposta-box');
    const sel = document.getElementById('om-riga-sposta-dove');
    if (!box || !sel) return;
    const inAttesa = pezzi.filter(p => p.stato === 'ORDINATA').length;
    box.classList.toggle('hidden', !inAttesa || !macOfPronto);
    if (!inAttesa) return;
    const pagine = [{ id: null, nome: 'ORDINI NORMALE' }].concat(omSezioniMarchio(of.marchio).filter(s => !s.chiusa || s.id === of.sezione_id)
        .map(s => ({ id: s.id, nome: s.nome })));
    let html = '<option value="">- scegli dove spostarle -</option>';
    pagine.forEach(pg => {
        const ordini = macOrdiniFornitore.filter(o => o.marchio === of.marchio && o.id !== of.id && (o.sezione_id || null) === pg.id && !omOfArrivato(o))
            .sort((a, b) => String(b.data).localeCompare(String(a.data)));
        html += '<optgroup label="' + macEsc(pg.nome) + '">' +
            '<option value="nuovo|' + (pg.id || '') + '">&#10133; Nuovo ordine in ' + macEsc(pg.nome) + '</option>' +
            ordini.map(o => '<option value="of|' + o.id + '">Ordine del ' + macDataCorta(o.data) + ' ' + macEsc(o.operatore || '') +
                (o.consegna ? ' - ' + macEsc(o.consegna) : '') + '</option>').join('') +
        '</optgroup>';
    });
    sel.innerHTML = html;
}

async function omRigaSposta() {
    if (!omRigaAperta) return;
    const of = macOf(omRigaAperta.ofId);
    if (!of) return;
    const ids = Array.from(document.querySelectorAll('#om-riga-corpo [data-om-pezzo]:checked')).map(el => parseInt(el.dataset.omPezzo, 10));
    const pezzi = macPezzi.filter(p => ids.indexOf(p.id) !== -1 && p.stato === 'ORDINATA' && p.ordine_fornitore_id === of.id);
    if (!pezzi.length) { await showCustomAlert('Spunta le macchine da spostare.', 'Sposta', '&#8505;&#65039;'); return; }
    const dove = document.getElementById('om-riga-sposta-dove').value;
    if (!dove) { await showCustomAlert('Scegli dove spostarle.', 'Sposta', '&#8505;&#65039;'); return; }
    const [tipo, valore] = dove.split('|');
    let meta = null, sezNome = '';
    if (tipo === 'of') {
        meta = macOf(Number(valore));
        if (!meta) return;
        const s = macOfSezione(meta.sezione_id);
        sezNome = s ? s.nome : 'ORDINI NORMALE';
    } else {
        const s = valore ? macOfSezione(Number(valore)) : null;
        sezNome = s ? s.nome : 'ORDINI NORMALE';
    }
    const resta = omPezziOf(of).length - pezzi.length;
    const descr = tipo === 'of' ? 'nell\'ordine del ' + macDataCorta(meta.data) + ' ' + (meta.operatore || '') + ' (' + sezNome + ')'
        : 'in un NUOVO ordine in ' + sezNome + ' (data ' + macDataCorta(of.data) + ', ' + (of.operatore || '') + ')';
    if (!window.confirm('Spostare ' + pezzi.length + (pezzi.length === 1 ? ' macchina ' : ' macchine ') + descr + '?\n\n' +
        'Clienti e stato non cambiano.' + (resta === 0 ? '\nL\'ordine del ' + macDataCorta(of.data) + ' resta vuoto e viene eliminato.' : ''))) return;
    const btn = document.getElementById('om-riga-sposta');
    btn.disabled = true;
    try {
        if (!meta) {
            const s = valore ? Number(valore) : null;
            meta = await omCreaOf(of.marchio, s, String(of.data).slice(0, 10), of.operatore || macIniziali(), null, null);
        }
        const adesso = new Date().toISOString();
        const utente = macUtente();
        const { error } = await supabaseClient.from('macchine_pezzi')
            .update({ ordine_fornitore_id: meta.id, updated_at: adesso, updated_by: utente }).in('id', pezzi.map(p => p.id));
        if (error) throw error;
        pezzi.forEach(p => { p.ordine_fornitore_id = meta.id; });
        const daSez = macOfSezione(of.sezione_id);
        await macRegistra(pezzi.map(p => ({
            pezzo_id: p.id, articolo_id: p.articolo_id, tipo: 'ORDINE', stato_prima: p.stato, stato_dopo: p.stato,
            cliente: p.cliente || null, matricola: p.matricola || null, netto: p.netto_carico || null,
            dettaglio: 'ORDINE FORNITORE SPOSTATO: DA ' + macDataCorta(of.data) + ' ' + (of.operatore || '') + ' (' + (daSez ? daSez.nome : 'ORDINI NORMALE') + ')' +
                ' A ' + macDataCorta(meta.data) + ' ' + (meta.operatore || '') + ' (' + sezNome + ')'
        })));
        if (resta === 0) {
            const { error: e2 } = await supabaseClient.from('macchine_of_ordini').delete().eq('id', of.id);
            if (e2) throw e2;
        }
    } catch (error) {
        console.error('Errore sposta righe:', error);
        await showCustomAlert('Errore:<br>' + macEsc(error.message), 'Errore', '&#10060;');
    }
    btn.disabled = false;
    omChiudiRiga();
    // si va alla pagina di destinazione, cosi' si vede dove sono finite
    omSessione('omSezione', meta && meta.sezione_id ? String(meta.sezione_id) : OM_NORMALE);
    await omRicarica();
}

// ========================================
// SEZIONI (prestagionali)
// ========================================
function omApriSezione(sezione) {
    omSezioneInModifica = sezione || null;
    document.getElementById('om-sez-titolo').innerHTML = sezione ? '&#9997;&#65039; Sezione ' + macEsc(sezione.nome) : '&#10133; Nuova sezione - ' + macEsc(omNomePagina(omChiave()));
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
        await showCustomAlert('C\'&egrave; gi&agrave; una sezione con questo nome in ' + macEsc(omNomePagina(marchio)), 'Sezione', '&#9888;&#65039;');
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
    let html = '';
    if (omVista() === 'fornitore') {
        const fornitori = [...new Set(Object.values(omFornMarchi))].sort(listinoConfronta);
        const liberi = marchi.filter(m => !omFornitoreDi(m));
        html = '<option value="">&#128269; Vai a fornitore / marchio...</option>' +
            (fornitori.length ? '<optgroup label="Fornitori">' + fornitori.map(f => '<option value="F:' + macEsc(f) + '">' + macEsc(f) + ' (' +
                macEsc(omMarchiDi('F:' + f).join(', ')) + ')</option>').join('') + '</optgroup>' : '') +
            '<optgroup label="Marchi senza fornitore">' + liberi.map(m => '<option value="' + macEsc(m) + '">' + macEsc(m) + '</option>').join('') + '</optgroup>';
    } else {
        html = '<option value="">&#128269; Vai al marchio...</option>' + marchi.map(m => '<option value="' + macEsc(m) + '">' + macEsc(m) + '</option>').join('');
    }
    sel.innerHTML = html;
}

// Interruttore Per fornitore / Per marchio e pulsante Fornitori
function omAggiornaBarraVista() {
    const box = document.getElementById('om-vista');
    if (!box) return;
    box.classList.toggle('hidden', !omFornPronto);
    box.querySelectorAll('[data-om-vista]').forEach(b => b.classList.toggle('active', b.dataset.omVista === omVista()));
}

function omCambiaVista(v) {
    if (v === omVista()) return;
    omSessione('omVista', v === 'marchio' ? 'marchio' : 'fornitore');
    omSelezione = {};
    omRender();
}

// ========================================
// FORNITORI E MARCHI (finestra): si compila man mano che serve
// ========================================
function omApriFornitori(marchio) {
    if (!omFornPronto) {
        showCustomAlert('Per raggruppare i marchi per fornitore esegui su Supabase lo script <strong>supabase/ordini-fornitore-fornitori.sql</strong>.', 'Fornitori', '&#8505;&#65039;');
        return;
    }
    const marchi = [...new Set(listinoArticoli.filter(a => a.attivo && a.marchio).map(a => a.marchio))].sort(listinoConfronta);
    document.getElementById('om-forn-marchio').innerHTML = '<option value="">- marchio -</option>' +
        marchi.map(m => '<option value="' + macEsc(m) + '">' + macEsc(m) + (omFornitoreDi(m) ? ' (' + macEsc(omFornitoreDi(m)) + ')' : '') + '</option>').join('');
    const sel = document.getElementById('om-forn-marchio');
    sel.value = marchio && !omEFornitore(marchio) ? marchio : '';
    // pagina di un fornitore: il nome e' gia' scritto (per aggiungere un marchio)
    document.getElementById('om-forn-nome').value = omEFornitore(marchio) ? omNomePagina(marchio) : (marchio && omFornitoreDi(marchio)) || '';
    omRenderFornitori();
    document.getElementById('om-forn-modal').classList.remove('hidden');
}

function omChiudiFornitori() {
    document.getElementById('om-forn-modal').classList.add('hidden');
}

function omRenderFornitori() {
    const fornitori = [...new Set(Object.values(omFornMarchi))].sort(listinoConfronta);
    document.getElementById('om-forn-lista-nomi').innerHTML = fornitori.map(f => '<option value="' + macEsc(f) + '">').join('');
    document.getElementById('om-forn-elenco').innerHTML = fornitori.length
        ? fornitori.map(f => '<div class="om-forn-voce"><strong>&#127970; ' + macEsc(f) + '</strong><div class="om-forn-tag">' +
            omMarchiDi('F:' + f).map(m => '<span class="om-marca-tag">' + macEsc(m) +
                ' <button type="button" class="om-forn-x" data-om-forn-togli="' + macEsc(m) + '" title="Togli ' + macEsc(m) + ' da ' + macEsc(f) + '">&times;</button></span>').join(' ') +
            '</div></div>').join('')
        : '<p class="mac-aiuto">Nessun fornitore ancora. Scegli un marchio, scrivi il fornitore e premi <strong>Assegna</strong>.</p>';
}

async function omFornAssegna() {
    const marchio = document.getElementById('om-forn-marchio').value;
    const fornitore = listinoPulisciTesto(document.getElementById('om-forn-nome').value);
    if (!marchio || !fornitore) { await showCustomAlert('Scegli il marchio e scrivi il fornitore (es. CORMIK).', 'Fornitori', '&#9888;&#65039;'); return; }
    if (fornitore.indexOf('F:') === 0) return;
    const prima = omFornitoreDi(marchio);
    if (prima && prima !== fornitore && !window.confirm(marchio + ' adesso e\' di ' + prima + '. Passarlo a ' + fornitore + '?\n\nGli ordini gia\' fatti non cambiano.')) return;
    const { error } = await supabaseClient.from('of_fornitori_marchi')
        .upsert([{ marchio: marchio, fornitore: fornitore, updated_at: new Date().toISOString(), updated_by: macUtente() }], { onConflict: 'marchio' });
    if (error) { await showCustomAlert('Errore:<br>' + macEsc(error.message), 'Fornitori', '&#10060;'); return; }
    omFornMarchi[marchio] = fornitore;
    document.getElementById('om-forn-marchio').value = '';
    omApriFornitori('F:' + fornitore);
    omRender();
}

async function omFornTogli(marchio) {
    const f = omFornitoreDi(marchio);
    if (!f || !window.confirm('Togliere ' + marchio + ' da ' + f + '?\n\nTorna una linguetta da sola. Gli ordini non cambiano.')) return;
    const { error } = await supabaseClient.from('of_fornitori_marchi').delete().eq('marchio', marchio);
    if (error) { await showCustomAlert('Errore:<br>' + macEsc(error.message), 'Fornitori', '&#10060;'); return; }
    delete omFornMarchi[marchio];
    omRenderFornitori();
    omRender();
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
    document.getElementById('om-xls-titolo').innerHTML = '&#128229; Carica Excel - ' + macEsc(omNomePagina(marchio)) + ' &middot; ' + macEsc(sez.nome);
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
    const gia = new Set(macOrdiniFornitore.filter(of => sez && of.sezione_id === sez.id).map(of => of.gruppo || ('#' + of.id))).size;
    const opzioni = listinoOrdina(listinoArticoli.filter(a => a.attivo && omInPagina(a.marchio, marchio)))
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
            // pagina di un fornitore: un ordine per marchio, legati nello stesso gruppo
            await omRigheLiberePerMarchio(x.righe, {
                sezioneId: sez.id, data: data, operatore: operatore, consegna: 'CONSEGNA ' + omXlsMeseTesto(x.m),
                note: 'DA EXCEL: ' + omXlsFile.toUpperCase().slice(0, 80), gruppo: omFornPronto && omEFornitore(marchio) ? omNuovoGruppo() : null
            }, []);
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
        const bv = e.target.closest('[data-om-vista]');
        if (bv) { omCambiaVista(bv.dataset.omVista); return; }
        const bm = e.target.closest('[data-om-marchio]');
        if (bm) { omScegliMarchio(bm.dataset.omMarchio); return; }
        const bs = e.target.closest('[data-om-sezione]');
        if (bs) { omSessione('omSezione', bs.dataset.omSezione); omRender(); return; }
        const bcs = e.target.closest('[data-om-come-set]');
        if (bcs) { e.preventDefault(); omApriComeSet(Number(bcs.dataset.omComeSet)); return; }
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
        else if (az === 'fornitori') omApriFornitori(omChiave());
        else if (az === 'assegna-fornitore') omApriFornitori(omChiave());
        else if (az === 'dao-sposta') omDaoSposta();
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

    // Ordina come set
    document.getElementById('om-set-close').addEventListener('click', () => omChiudiComeSet(false));
    document.getElementById('om-set-annulla').addEventListener('click', () => omChiudiComeSet(false));
    document.getElementById('om-set-prosegui').addEventListener('click', omComeSetProsegui);

    // Finestra ordine
    macPickerImposta('om-of-art-search', 'om-of-art-results', a => omInPagina(a.marchio, omChiave()), omOfAggiungiArticolo);
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
    document.getElementById('om-riga-sposta').addEventListener('click', omRigaSposta);

    // Finestra sezione
    document.getElementById('om-sez-close').addEventListener('click', omChiudiSezione);
    document.getElementById('om-sez-annulla').addEventListener('click', omChiudiSezione);
    document.getElementById('om-sez-salva').addEventListener('click', omSalvaSezione);
    document.getElementById('om-sez-elimina').addEventListener('click', omEliminaSezione);

    // Righe da ordinare per il magazzino
    macPickerImposta('om-dao-search', 'om-dao-results', a => omInPagina(a.marchio, omChiave()), omDaoAggiungi);

    // Fornitori e marchi
    const fm = document.getElementById('om-forn-modal');
    if (fm) {
        fm.addEventListener('click', (e) => {
            if (e.target === fm) { omChiudiFornitori(); return; }
            const t = e.target.closest('[data-om-forn-togli]');
            if (t) omFornTogli(t.dataset.omFornTogli);
        });
    }
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
