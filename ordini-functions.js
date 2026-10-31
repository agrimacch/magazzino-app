// ========================================
// ORDINI CLIENTI (commissioni) - Vendite
// ----------------------------------------
// Sostituisce il blocchetto delle commissioni e alimenta il quaderno:
// - Numero progressivo che riparte ogni anno (es. 12/2026)
// - Dati cliente scritti ogni volta (Sig., indirizzo, tel, e-mail, C.F., P.IVA, note)
// - Pagamento: testo libero
// - Righe: articolo del Listino Vendite (collegato alle macchine del quaderno)
//   oppure riga libera (accessori, olio... non tocca il magazzino)
//   Per ogni riga del listino: DISPONIBILE (prende una macchina in casa e la
//   assegna al cliente) oppure DA ORDINARE (crea la riga bianca nel quaderno)
// - Firma del cliente sullo schermo
// - Stato calcolato dalle macchine: da ordinare -> ordinato -> in casa -> consegnato
// - Stampa (e "Salva come PDF") con lo stesso aspetto del modulo cartaceo
// - Operatore che ha fatto il contratto
// - PDF salvato in automatico su Google Drive (cartella ORDINI CLIENTI / ORDINI CLIENTI <anno>)
//   tramite la Edge Function "ordini-drive" e lo script Google google/ordini-drive.gs
// - Eliminazione dell'ordine (libera le macchine e manda il PDF nel cestino di Drive)
// Tabelle Supabase: macchine_ordini, macchine_ordini_righe (+ macchine_pezzi)
// Permessi: come l'inventario macchine (macPuoGestire: admin e operatori)
// ========================================

// Dati aziendali stampati sull'ordine
const ORD_AZIENDA = {
    nome: 'Agrimacch srl',
    indirizzo: 'Via Castellana, 86 - 30030 Martellago (VE)',
    contatti: 'Tel. 041 5401030',
    web: 'info@agrimacch.it - www.agrimacch.it'
};

const ORD_CONDIZIONI =
    'CONDIZIONI DI VENDITA - Gli ordini pervenuti sia direttamente che tramite Agente sono da considerarsi effettivi solo se approvati ' +
    'dalla ditta venditrice che si riserva comunque la facolt&agrave; di apporre eventuali cambiamenti. I termini di consegna indicati vengono ' +
    'rispettati compatibilmente con le esigenze aziendali, eventuali ritardi non danno comunque diritto a richieste di indennizzo o annullamento ' +
    'di ordini. La merce viaggia per conto e a rischio del committente quando &egrave; fornita in porto assegnato. Non si accettano reclami ' +
    'trascorsi otto giorni dal ricevimento di quanto fornito. Trascorso il termine stabilito per il pagamento, la ditta venditrice resta ' +
    'autorizzata ad emettere tratta a vista per l\'importo spettante, aumentato degli interessi di mora ad un tasso minimo pari a quello ' +
    'corrente applicato dagli Istituti Bancari sugli utilizzi in conto corrente. La vendita sar&agrave; conclusa con patto di riservato dominio. ' +
    'Per qualsiasi controversia quale Autorit&agrave; Giudiziaria competente &egrave; inteso il Tribunale di Venezia. &Egrave; responsabilit&agrave; ' +
    'dell\'acquirente, il quale assume su di s&eacute; ogni onere e responsabilit&agrave; in merito sin d\'ora liberando il venditore, l\'ottenimento ' +
    'di ogni autorizzazione, concessione e/o invio di comunicazioni (ivi compresa denuncia di inizio attivit&agrave;) necessarie per ' +
    'l\'installazione dei prodotti acquistati in base alla vigente legislazione.';

const ORD_STATI = {
    DA_ORDINARE: { etichetta: 'Da ordinare', classe: 'st-daordinare' },
    ORDINATO:    { etichetta: 'Ordinato',    classe: 'st-ordinata' },
    IN_CASA:     { etichetta: 'In casa',     classe: 'st-incasa' },
    CONSEGNATO:  { etichetta: 'Consegnato',  classe: 'st-consegnata' },
    ANNULLATO:   { etichetta: 'Annullato',   classe: 'st-annullato' }
};
const ORD_MIN_RIGHE_STAMPA = 12;      // righe minime della tabella articoli (poi si riempie il foglio)
const ORD_ALTEZZA_A4_PX = 1040;       // altezza utile di un A4 con margini 10 mm (larghezza 718 px)

let ordOrdini = [];
let ordRighe = [];
let ordCaricati = false;
let ordSearchTimeout = null;

// Ordine in compilazione
let ordFormRighe = [];          // [{ articolo_id, descrizione, codice, quantita, prezzo_totale, disponibilita, prezzoManuale }]
let ordInModifica = null;       // ordine esistente (solo dati cliente, pagamento, note, firma)

// ========================================
// UTILITA'
// ========================================
let ordUtenti = [];   // utenti dell'app (per scegliere l'operatore)

function ordNomeUtente(email) {
    if (!email) return '';
    if (typeof userInitials === 'object' && userInitials[email]) return userInitials[email];
    return String(email).split('@')[0].toUpperCase();
}

function ordPopolaOperatori() {
    const lista = document.getElementById('ord-operatori');
    if (!lista) return;
    const nomi = [...new Set(ordUtenti.map(u => ordNomeUtente(u.email)).filter(Boolean))].sort();
    lista.innerHTML = nomi.map(n => '<option value="' + macEsc(n) + '"></option>').join('');
}

function ordNumero(o) {
    return o ? o.numero + '/' + o.anno : '';
}

function ordOggiISO() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function ordDataIt(iso) {
    if (!iso) return '-';
    const p = String(iso).slice(0, 10).split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso;
}

function ordNumeroDiPezzo(p) {
    if (!p || !p.ordine_id) return '';
    const o = ordOrdini.find(x => x.id === p.ordine_id);
    return o ? ordNumero(o) : '';
}

// Prezzo di vendita proposto (unitario): promo valida, altrimenti no promo, altrimenti listino
function ordPrezzoUnitario(a) {
    if (!a) return null;
    const num = v => {
        if (v === null || v === undefined || v === '') return null;
        const s = String(v).trim();
        return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
    };
    const promo = num(a.vendita_promo);
    if (promo !== null && !listinoPromoScaduta(a.scadenza_promo)) return promo;
    const noPromo = num(a.vendita_no_promo);
    if (noPromo !== null) return noPromo;
    return num(a.listino);
}

function ordDescrizioneArticolo(a) {
    return [a.attrezzo, a.marchio, a.modello, a.note].filter(Boolean).join(' ');
}

// Cosa serve dal magazzino per una riga: [{ art, n }] (un set = i suoi componenti)
function ordFabbisogno(riga) {
    const a = macArticolo(riga.articolo_id);
    if (!a) return [];
    if (macIsSet(a.id)) {
        return macComponenti(a.id).map(c => ({ art: macArticolo(c.componente_id), n: c.quantita * riga.quantita })).filter(x => x.art);
    }
    return [{ art: a, n: riga.quantita }];
}

function ordDisponibiliArticolo(articoloId) {
    return macPezzi.filter(p => p.articolo_id === articoloId && p.stato === 'IN_CASA' && !p.cliente)
        .sort((x, y) => x.id - y.id);
}

// ========================================
// CARICAMENTO
// ========================================
async function ordCaricaDati() {
    ordOrdini = await macFetchAll('macchine_ordini', 'id');
    ordRighe = await macFetchAll('macchine_ordini_righe', 'id');
    ordCaricati = true;
}

async function openOrdiniClienti() {
    if (!macPuoGestire()) return;
    // Pulsanti di prova (Drive) solo per l'admin
    const provaDrive = document.getElementById('ord-prova-drive');
    if (provaDrive) provaDrive.classList.toggle('hidden', currentUserRole !== 'admin');
    ordSwitchTab(sessionStorage.getItem('ordiniTab') || 'elenco', true);
    const container = document.getElementById('ord-container');
    if (container && !ordCaricati) {
        container.innerHTML = '<div class="card"><p style="text-align:center">&#8987; Caricamento ordini...</p></div>';
    }
    try {
        if (!listinoCaricato) await loadListino();
        await macCaricaDati();
        await ordCaricaDati();
        if (typeof loadAllUsers === 'function') {
            ordUtenti = await loadAllUsers();
            ordPopolaOperatori();
        }
    } catch (error) {
        console.error('Errore caricamento ordini:', error);
        if (container) {
            container.innerHTML = '<div class="card"><p style="text-align:center">&#10060; Errore caricamento ordini: ' + macEsc(error.message) +
                '</p><p style="text-align:center">Hai eseguito lo script <strong>ordini-clienti-setup.sql</strong> su Supabase?</p></div>';
        }
        return;
    }
    if (!document.getElementById('ord-data').value) ordNuovoModulo();
    ordRenderElenco();
    ordRenderFormRighe();
    ordFirmaAdatta();
}

function ordSwitchTab(tab, senzaRender) {
    if (['elenco', 'nuovo'].indexOf(tab) === -1) tab = 'elenco';
    sessionStorage.setItem('ordiniTab', tab);
    document.querySelectorAll('#tabs-ordini .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.ordTab === tab));
    document.querySelectorAll('#section-ordini-clienti .tab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-ord-' + tab));
    if (senzaRender) return;
    if (tab === 'elenco') ordRenderElenco();
    else { ordRenderFormRighe(); setTimeout(ordFirmaAdatta, 30); }
}

async function ordRicarica() {
    try {
        await macCaricaDati();
        await ordCaricaDati();
    } catch (error) {
        console.error('Errore ricarica ordini:', error);
    }
    ordRenderElenco();
}

// ========================================
// STATO DELL'ORDINE (calcolato dalle macchine collegate)
// ========================================
function ordPezziOrdine(o) {
    return macPezzi.filter(p => p.ordine_id === o.id);
}

function ordStato(o) {
    if (o.annullato_at) return 'ANNULLATO';
    const pezzi = ordPezziOrdine(o);
    if (pezzi.length === 0) return o.consegnato_at ? 'CONSEGNATO' : 'IN_CASA';
    const ordine = ['DA_ORDINARE', 'ORDINATA', 'IN_CASA', 'CONSEGNATA'];
    const minimo = Math.min.apply(null, pezzi.map(p => ordine.indexOf(p.stato)));
    return ['DA_ORDINARE', 'ORDINATO', 'IN_CASA', 'CONSEGNATO'][minimo];
}

function ordBadgeStato(stato) {
    const s = ORD_STATI[stato] || ORD_STATI.IN_CASA;
    return '<span class="ord-stato ord-stato-' + stato.toLowerCase() + '"><span class="mac-quadro mac-quadro-mini ' + s.classe + '">' +
        (stato === 'CONSEGNATO' ? '&#10005;' : '') + '</span>' + s.etichetta + '</span>';
}

function ordRigheOrdine(o) {
    return ordRighe.filter(r => r.ordine_id === o.id).sort((a, b) => a.posizione - b.posizione);
}

// ========================================
// ELENCO ORDINI
// ========================================
function ordRenderElenco() {
    const container = document.getElementById('ord-container');
    if (!container || !ordCaricati) return;

    // Anni disponibili
    const selAnno = document.getElementById('ord-f-anno');
    const annoCorrente = new Date().getFullYear();
    const anni = [...new Set(ordOrdini.map(o => o.anno).concat([annoCorrente]))].sort((a, b) => b - a);
    const annoScelto = selAnno.value || String(annoCorrente);
    selAnno.innerHTML = '<option value="TUTTI">Tutti gli anni</option>' + anni.map(a => '<option value="' + a + '">' + a + '</option>').join('');
    selAnno.value = anni.map(String).indexOf(annoScelto) !== -1 || annoScelto === 'TUTTI' ? annoScelto : String(annoCorrente);

    const stato = document.getElementById('ord-f-stato').value;
    const ricerca = listinoPulisciTesto(document.getElementById('ord-search').value) || '';

    const lista = ordOrdini.filter(o => {
        if (selAnno.value !== 'TUTTI' && String(o.anno) !== selAnno.value) return false;
        if (stato && ordStato(o) !== stato) return false;
        if (!ricerca) return true;
        const testo = [ordNumero(o), o.cliente, o.indirizzo, o.telefono, o.note, o.operatore]
            .concat(ordRigheOrdine(o).map(r => r.descrizione + ' ' + (r.codice || '')))
            .concat(ordPezziOrdine(o).map(p => p.matricola || ''))
            .filter(Boolean).join(' ').toUpperCase();
        return ricerca.split(' ').every(p => testo.indexOf(p) !== -1);
    }).sort((a, b) => (b.anno - a.anno) || (b.numero - a.numero));

    document.getElementById('ord-count').textContent = lista.length + (lista.length === 1 ? ' ordine' : ' ordini');

    if (lista.length === 0) {
        container.innerHTML = '<div class="card"><p style="text-align:center">' +
            (ordOrdini.length ? 'Nessun ordine con questi filtri' : 'Nessun ordine. Crea il primo dalla scheda <strong>Nuovo ordine</strong>.') + '</p></div>';
        return;
    }

    let righeTab = '';
    let schede = '';
    lista.forEach(o => {
        const righe = ordRigheOrdine(o);
        const articoli = righe.map(r => (r.quantita > 1 ? r.quantita + ' x ' : '') + r.descrizione).join(', ');
        const st = ordStato(o);
        righeTab +=
            '<tr class="ord-riga-click' + (st === 'ANNULLATO' ? ' ord-annullato' : '') + '" data-ordine="' + o.id + '">' +
                '<td><strong>' + ordNumero(o) + '</strong></td>' +
                '<td>' + ordDataIt(o.data) + '</td>' +
                '<td><strong>' + macEsc(o.cliente) + '</strong>' + (o.operatore ? '<br><small class="ord-operatore">' + macEsc(o.operatore) + '</small>' : '') + '</td>' +
                '<td class="ord-col-articoli">' + macEsc(articoli) + '</td>' +
                '<td class="ord-col-totale">' + macEuro(o.totale) + '</td>' +
                '<td>' + ordBadgeStato(st) + '</td>' +
            '</tr>';
        schede +=
            '<div class="ord-card' + (st === 'ANNULLATO' ? ' ord-annullato' : '') + '" data-ordine="' + o.id + '">' +
                '<div class="ord-card-top"><strong>N. ' + ordNumero(o) + '</strong><span>' + ordDataIt(o.data) + (o.operatore ? ' &middot; ' + macEsc(o.operatore) : '') + '</span></div>' +
                '<div class="ord-card-cliente">' + macEsc(o.cliente) + '</div>' +
                '<div class="ord-card-articoli">' + macEsc(articoli) + '</div>' +
                '<div class="ord-card-bottom">' + ordBadgeStato(st) + '<strong>' + macEuro(o.totale) + '</strong></div>' +
            '</div>';
    });

    container.innerHTML =
        '<div class="listino-gruppo">' +
            '<div class="listino-desktop"><div class="table-container">' +
                '<table class="listino-table ord-table"><thead><tr><th>N.</th><th>Data</th><th>Cliente</th><th>Articoli</th><th>Totale</th><th>Stato</th></tr></thead>' +
                '<tbody>' + righeTab + '</tbody></table>' +
            '</div></div>' +
            '<div class="listino-mobile">' + schede + '</div>' +
        '</div>';
}

// ========================================
// NUOVO ORDINE (modulo)
// ========================================
const ORD_CAMPI = ['data', 'operatore', 'cliente', 'indirizzo', 'telefono', 'email', 'cf', 'piva', 'note', 'pagamento'];

function ordNuovoModulo() {
    ordInModifica = null;
    ordFormRighe = [];
    ORD_CAMPI.forEach(c => { document.getElementById('ord-' + c).value = ''; });
    document.getElementById('ord-data').value = ordOggiISO();
    document.getElementById('ord-operatore').value = ordNomeUtente(macUtente());
    document.getElementById('ord-art-search').value = '';
    document.getElementById('ord-form-titolo').innerHTML = '&#128221; Nuovo ordine';
    document.getElementById('ord-salva').innerHTML = '&#128190; Salva ordine';
    document.getElementById('ord-annulla-form').innerHTML = 'Svuota';
    document.getElementById('ord-aggiungi-box').classList.remove('hidden');
    ordFirmaPulisci();
    ordRenderFormRighe();
}

function ordAggiungiArticolo(a) {
    document.getElementById('ord-art-search').value = '';
    const unitario = ordPrezzoUnitario(a);
    const riga = {
        articolo_id: a.id,
        descrizione: ordDescrizioneArticolo(a),
        codice: a.modello || '',
        quantita: 1,
        prezzo_totale: unitario,
        disponibilita: 'DISPONIBILE',
        prezzoManuale: false
    };
    // Se non ce n'e' in casa, propone "da ordinare"
    const mancano = ordFabbisogno(riga).some(f => ordDisponibiliArticolo(f.art.id).length < f.n);
    if (mancano) riga.disponibilita = 'DA_ORDINARE';
    ordFormRighe.push(riga);
    ordRenderFormRighe();
}

function ordAggiungiLibera() {
    ordFormRighe.push({ articolo_id: null, descrizione: '', codice: '', quantita: 1, prezzo_totale: null, disponibilita: 'LIBERA', prezzoManuale: true });
    ordRenderFormRighe();
    const inputs = document.querySelectorAll('#ord-righe [data-campo="descrizione"]');
    if (inputs.length) inputs[inputs.length - 1].focus();
}

// Quante macchine servono "disponibili" per articolo, sommando tutte le righe del modulo
function ordRichiesteDisponibili() {
    const tot = {};
    ordFormRighe.forEach(r => {
        if (!r.articolo_id || r.disponibilita !== 'DISPONIBILE') return;
        ordFabbisogno(r).forEach(f => { tot[f.art.id] = (tot[f.art.id] || 0) + f.n; });
    });
    return tot;
}

function ordRenderFormRighe() {
    const box = document.getElementById('ord-righe');
    if (!box) return;
    const bloccate = !!ordInModifica;
    if (ordFormRighe.length === 0) {
        box.innerHTML = '<p class="mac-aiuto">Nessun articolo. Cerca qui sotto nel listino oppure aggiungi una riga libera.</p>';
        ordAggiornaTotale();
        return;
    }
    const richieste = ordRichiesteDisponibili();
    box.innerHTML = ordFormRighe.map((r, i) => {
        const a = r.articolo_id ? macArticolo(r.articolo_id) : null;
        let info = '';
        if (a && !bloccate) {
            const fab = ordFabbisogno(r);
            const isSet = macIsSet(a.id);
            const disp = isSet ? macSetComponibili(a.id) : ordDisponibiliArticolo(a.id).length;
            const pochi = r.disponibilita === 'DISPONIBILE' && fab.some(f => ordDisponibiliArticolo(f.art.id).length < (richieste[f.art.id] || 0));
            const unit = ordPrezzoUnitario(a);
            info = '<div class="ord-riga-info' + (pochi ? ' ord-riga-poche' : '') + '">' +
                (isSet ? '&#129513; Set: ' + macEsc(macDescrizioneComponenti(a.id)) + '<br>' : '') +
                '&#127968; In casa disponibili: <strong>' + disp + (isSet ? ' set' : '') + '</strong>' +
                (pochi ? ' &mdash; &#9888;&#65039; non bastano: metti &quot;Da ordinare&quot; o dividi la riga' : '') +
                (unit !== null ? ' &middot; prezzo proposto ' + macEuro(unit) + ' cad.' : '') +
                '</div>';
        }
        const sceltaDisp = a
            ? '<select data-campo="disponibilita" data-i="' + i + '"' + (bloccate ? ' disabled' : '') + '>' +
                '<option value="DISPONIBILE"' + (r.disponibilita === 'DISPONIBILE' ? ' selected' : '') + '>Disponibile</option>' +
                '<option value="DA_ORDINARE"' + (r.disponibilita === 'DA_ORDINARE' ? ' selected' : '') + '>Da ordinare</option>' +
              '</select>'
            : '<span class="ord-libera">Riga libera</span>';
        return '<div class="ord-riga-form' + (a ? '' : ' ord-riga-libera') + '">' +
            '<div class="ord-riga-campi">' +
                '<div class="ord-campo ord-campo-descr"><label>Articolo</label>' +
                    '<input type="text" data-campo="descrizione" data-i="' + i + '" value="' + macEsc(r.descrizione) + '"' + (bloccate ? ' disabled' : '') + ' placeholder="Descrizione"></div>' +
                '<div class="ord-campo ord-campo-codice"><label>Codice</label>' +
                    '<input type="text" data-campo="codice" data-i="' + i + '" value="' + macEsc(r.codice || '') + '"' + (bloccate ? ' disabled' : '') + '></div>' +
                '<div class="ord-campo ord-campo-qta"><label>Q.t&agrave;</label>' +
                    '<input type="number" min="1" max="999" inputmode="numeric" data-campo="quantita" data-i="' + i + '" value="' + r.quantita + '"' + (bloccate ? ' disabled' : '') + '></div>' +
                '<div class="ord-campo ord-campo-prezzo"><label>P. totale &#8364;</label>' +
                    '<input type="text" inputmode="decimal" data-campo="prezzo_totale" data-i="' + i + '" value="' + listinoNumeroPerForm(r.prezzo_totale) + '"' + (bloccate ? ' disabled' : '') + '></div>' +
                '<div class="ord-campo ord-campo-disp"><label>Magazzino</label>' + sceltaDisp + '</div>' +
                (bloccate ? '' : '<button type="button" class="mac-set-togli ord-togli" data-togli="' + i + '" title="Togli riga">&times;</button>') +
            '</div>' + info +
        '</div>';
    }).join('');
    ordAggiornaTotale();
}

function ordAggiornaTotale() {
    const tot = ordFormRighe.reduce((s, r) => s + (Number(r.prezzo_totale) || 0), 0);
    const el = document.getElementById('ord-totale');
    if (el) el.innerHTML = macEuro(Math.round(tot * 100) / 100);
    return Math.round(tot * 100) / 100;
}

// Ridisegna le righe subito DOPO l'evento: se si ridisegna mentre un campo
// sta perdendo il fuoco (blur -> change) il browser da' errore
let ordRidisegnoInAttesa = false;
function ordRidisegnaRighe() {
    if (ordRidisegnoInAttesa) return;
    ordRidisegnoInAttesa = true;
    setTimeout(() => {
        ordRidisegnoInAttesa = false;
        ordRenderFormRighe();
    }, 0);
}

// Modifiche ai campi delle righe
function ordCampoRigaCambiato(e) {
    const el = e.target;
    const campo = el.dataset.campo;
    const i = parseInt(el.dataset.i, 10);
    const r = ordFormRighe[i];
    if (!campo || !r) return;
    // Le tendine si leggono solo al "change" (non due volte)
    if (el.tagName === 'SELECT' && e.type !== 'change') return;
    if (campo === 'quantita') {
        const q = parseInt(el.value, 10);
        r.quantita = (q >= 1 && q <= 999) ? q : 1;
        if (!r.prezzoManuale && r.articolo_id) {
            const unit = ordPrezzoUnitario(macArticolo(r.articolo_id));
            r.prezzo_totale = unit !== null ? Math.round(unit * r.quantita * 100) / 100 : null;
        }
        if (e.type === 'change') ordRidisegnaRighe();
        else { ordAggiornaTotale(); ordAggiornaPrezzoVisibile(i); }
    } else if (campo === 'prezzo_totale') {
        const n = listinoParseNumero(el.value);
        r.prezzo_totale = (typeof n === 'number' && !isNaN(n)) ? n : null;
        r.prezzoManuale = true;
        ordAggiornaTotale();
    } else if (campo === 'disponibilita') {
        r.disponibilita = el.value;
        ordRidisegnaRighe();
    } else {
        r[campo] = el.value;
    }
}

function ordAggiornaPrezzoVisibile(i) {
    const el = document.querySelector('#ord-righe [data-campo="prezzo_totale"][data-i="' + i + '"]');
    if (el && document.activeElement !== el) el.value = listinoNumeroPerForm(ordFormRighe[i].prezzo_totale);
}

// ========================================
// FIRMA SULLO SCHERMO
// ========================================
let ordFirmaVuota = true;
let ordFirmaDisegna = false;
let ordFirmaUltimo = null;
let ordFirmaImmagine = null;   // firma gia' salvata (in modifica)

function ordFirmaCanvas() {
    return document.getElementById('ord-firma');
}

function ordFirmaAdatta() {
    const c = ordFirmaCanvas();
    if (!c || !c.offsetWidth) return;
    const salvata = !ordFirmaVuota ? c.toDataURL('image/png') : ordFirmaImmagine;
    const rapporto = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * rapporto;
    c.height = c.offsetHeight * rapporto;
    const ctx = c.getContext('2d');
    ctx.setTransform(rapporto, 0, 0, rapporto, 0, 0);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1e3a8a';
    if (salvata) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, c.offsetWidth, c.offsetHeight);
        img.src = salvata;
    }
}

function ordFirmaPos(e) {
    const r = ordFirmaCanvas().getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function ordFirmaInizio(e) {
    e.preventDefault();
    ordFirmaDisegna = true;
    ordFirmaUltimo = ordFirmaPos(e);
    try { ordFirmaCanvas().setPointerCapture(e.pointerId); } catch (err) { /* niente */ }
}

function ordFirmaMuovi(e) {
    if (!ordFirmaDisegna) return;
    e.preventDefault();
    const p = ordFirmaPos(e);
    const ctx = ordFirmaCanvas().getContext('2d');
    ctx.beginPath();
    ctx.moveTo(ordFirmaUltimo.x, ordFirmaUltimo.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ordFirmaUltimo = p;
    ordFirmaVuota = false;
    document.getElementById('ord-firma-box').classList.add('firmata');
}

function ordFirmaFine() {
    ordFirmaDisegna = false;
}

function ordFirmaPulisci() {
    ordFirmaVuota = true;
    ordFirmaImmagine = null;
    const c = ordFirmaCanvas();
    if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height);
    const box = document.getElementById('ord-firma-box');
    if (box) box.classList.remove('firmata');
}

function ordFirmaDati() {
    if (!ordFirmaVuota) return ordFirmaCanvas().toDataURL('image/png');
    return ordFirmaImmagine;
}

// ========================================
// SALVATAGGIO ORDINE
// ========================================
function ordLeggiTesta() {
    const v = id => document.getElementById('ord-' + id).value;
    return {
        data: v('data') || ordOggiISO(),
        operatore: listinoPulisciTesto(v('operatore')),
        cliente: listinoPulisciTesto(v('cliente')),
        indirizzo: listinoPulisciTesto(v('indirizzo')),
        telefono: listinoPulisciTesto(v('telefono')),
        email: (v('email') || '').trim().toLowerCase() || null,
        codice_fiscale: listinoPulisciTesto(v('cf')),
        partita_iva: listinoPulisciTesto(v('piva')),
        note: listinoPulisciTesto(v('note')),
        pagamento: listinoPulisciTesto(v('pagamento'))
    };
}

async function ordProssimoNumero(anno) {
    const { data, error } = await supabaseClient.from('macchine_ordini').select('numero')
        .eq('anno', anno).order('numero', { ascending: false }).limit(1);
    if (error) throw error;
    return (data && data.length ? data[0].numero : 0) + 1;
}

async function ordSalva() {
    if (ordInModifica) return ordSalvaModifica();
    const testa = ordLeggiTesta();
    const errori = [];
    if (!testa.cliente) errori.push('Scrivi il nome del cliente (Sig.)');
    if (ordFormRighe.length === 0) errori.push('Aggiungi almeno un articolo');
    ordFormRighe.forEach((r, i) => {
        r.descrizione = listinoPulisciTesto(r.descrizione);
        r.codice = listinoPulisciTesto(r.codice);
        if (!r.descrizione) errori.push('Riga ' + (i + 1) + ': manca la descrizione');
    });
    // Abbastanza macchine in casa per le righe "Disponibile"?
    const richieste = ordRichiesteDisponibili();
    Object.keys(richieste).forEach(id => {
        const disp = ordDisponibiliArticolo(Number(id)).length;
        if (disp < richieste[id]) {
            errori.push('<strong>' + macEsc(macNome(macArticolo(Number(id)))) + '</strong>: ne servono ' + richieste[id] +
                ' disponibili ma in casa ce ne sono ' + disp + '. Metti &quot;Da ordinare&quot; (o dividi la riga).');
        }
    });
    if (errori.length) {
        await showCustomAlert(errori.join('<br>'), 'Controlla l\'ordine', '&#9888;&#65039;');
        return;
    }

    const btn = document.getElementById('ord-salva');
    btn.disabled = true;
    const utente = macUtente();
    const adesso = new Date().toISOString();
    const anno = parseInt(String(testa.data).slice(0, 4), 10) || new Date().getFullYear();
    let ordine = null;
    try {
        // 1. Testata con numero progressivo dell'anno (se due salvano insieme riprova)
        for (let tentativo = 0; tentativo < 3 && !ordine; tentativo++) {
            const numero = await ordProssimoNumero(anno);
            const riga = Object.assign({}, testa, {
                anno: anno, numero: numero, totale: ordAggiornaTotale(), firma: ordFirmaDati(),
                created_by: utente, updated_by: utente, updated_at: adesso
            });
            const { data, error } = await supabaseClient.from('macchine_ordini').insert([riga]).select('*').single();
            if (error) {
                if (error.code === '23505' && tentativo < 2) continue;
                throw error;
            }
            ordine = data;
        }
        const numeroTesto = 'ORDINE ' + ordNumero(ordine);

        // 2. Righe
        const righeDb = ordFormRighe.map((r, i) => ({
            ordine_id: ordine.id, posizione: i + 1, articolo_id: r.articolo_id || null,
            descrizione: r.descrizione, codice: r.codice, quantita: r.quantita,
            prezzo_totale: r.prezzo_totale, disponibilita: r.articolo_id ? r.disponibilita : 'LIBERA'
        }));
        const { data: righeSalvate, error: errRighe } = await supabaseClient.from('macchine_ordini_righe').insert(righeDb).select('*');
        if (errRighe) throw errRighe;
        const perPosizione = {};
        (righeSalvate || []).forEach(r => { perPosizione[r.posizione] = r; });

        // 3. Macchine del quaderno
        const log = [];
        for (let i = 0; i < ordFormRighe.length; i++) {
            const r = ordFormRighe[i];
            if (!r.articolo_id) continue;
            const rigaDb = perPosizione[i + 1];
            const a = macArticolo(r.articolo_id);
            const setArt = macIsSet(a.id) ? a : null;
            for (const f of ordFabbisogno(r)) {
                if (r.disponibilita === 'DISPONIBILE') {
                    const scelti = ordDisponibiliArticolo(f.art.id).slice(0, f.n);
                    for (const p of scelti) {
                        const agg = {
                            cliente: testa.cliente, ordine_id: ordine.id, ordine_riga_id: rigaDb ? rigaDb.id : null,
                            set_id: setArt ? setArt.id : null, updated_at: adesso, updated_by: utente
                        };
                        const { error } = await supabaseClient.from('macchine_pezzi').update(agg).eq('id', p.id);
                        if (error) throw error;
                        Object.assign(p, agg);
                        log.push({ pezzo_id: p.id, articolo_id: f.art.id, tipo: 'ORDINE', stato_prima: 'IN_CASA', stato_dopo: 'IN_CASA',
                            cliente: testa.cliente, matricola: p.matricola, netto: p.netto_carico,
                            dettaglio: numeroTesto + ' - ASSEGNATA A ' + testa.cliente + (setArt ? ' (' + macNome(setArt) + ')' : '') });
                    }
                } else {
                    const nuovi = [];
                    for (let k = 0; k < f.n; k++) {
                        nuovi.push({ articolo_id: f.art.id, stato: 'DA_ORDINARE', cliente: testa.cliente,
                            ordine_id: ordine.id, ordine_riga_id: rigaDb ? rigaDb.id : null, set_id: setArt ? setArt.id : null,
                            updated_at: adesso, updated_by: utente });
                    }
                    const { data, error } = await supabaseClient.from('macchine_pezzi').insert(nuovi).select('*');
                    if (error) throw error;
                    (data || []).forEach(p => {
                        macPezzi.push(p);
                        log.push({ pezzo_id: p.id, articolo_id: f.art.id, tipo: 'ORDINE', stato_prima: null, stato_dopo: 'DA_ORDINARE',
                            cliente: testa.cliente, matricola: null, netto: null,
                            dettaglio: numeroTesto + ' - DA ORDINARE PER ' + testa.cliente + (setArt ? ' (' + macNome(setArt) + ')' : '') });
                    });
                }
            }
        }
        await macRegistra(log);
    } catch (error) {
        console.error('Errore salvataggio ordine:', error);
        btn.disabled = false;
        await ordRicarica();
        await showCustomAlert('Errore durante il salvataggio dell\'ordine:<br><strong>' + macEsc(error.message) + '</strong>' +
            (ordine ? '<br><br>L\'ordine N. ' + ordNumero(ordine) + ' &egrave; stato creato ma potrebbe essere incompleto: controllalo nell\'elenco.' : ''),
            'Errore', '&#10060;');
        return;
    }
    btn.disabled = false;
    ordNuovoModulo();
    await ordRicarica();
    ordSwitchTab('elenco');
    ordApriDettaglio(ordine.id);
    ordSalvaSuDrive(ordine.id);   // PDF su Drive in automatico (non blocca)
}

// Modifica: solo dati del cliente, pagamento, note e firma (le righe sono bloccate)
function ordApriModifica(id) {
    const o = ordOrdini.find(x => x.id === id);
    if (!o) return;
    ordChiudiDettaglio();
    ordInModifica = o;
    ordFormRighe = ordRigheOrdine(o).map(r => ({
        articolo_id: r.articolo_id, descrizione: r.descrizione, codice: r.codice, quantita: r.quantita,
        prezzo_totale: r.prezzo_totale, disponibilita: r.disponibilita, prezzoManuale: true
    }));
    document.getElementById('ord-data').value = o.data || '';
    document.getElementById('ord-operatore').value = o.operatore || '';
    document.getElementById('ord-cliente').value = o.cliente || '';
    document.getElementById('ord-indirizzo').value = o.indirizzo || '';
    document.getElementById('ord-telefono').value = o.telefono || '';
    document.getElementById('ord-email').value = o.email || '';
    document.getElementById('ord-cf').value = o.codice_fiscale || '';
    document.getElementById('ord-piva').value = o.partita_iva || '';
    document.getElementById('ord-note').value = o.note || '';
    document.getElementById('ord-pagamento').value = o.pagamento || '';
    document.getElementById('ord-form-titolo').innerHTML = '&#9997;&#65039; Modifica ordine N. ' + ordNumero(o);
    document.getElementById('ord-salva').innerHTML = '&#128190; Salva modifiche';
    document.getElementById('ord-annulla-form').innerHTML = 'Annulla modifica';
    document.getElementById('ord-aggiungi-box').classList.add('hidden');
    ordFirmaPulisci();
    ordFirmaImmagine = o.firma || null;
    if (ordFirmaImmagine) document.getElementById('ord-firma-box').classList.add('firmata');
    ordSwitchTab('nuovo');
}

async function ordSalvaModifica() {
    const o = ordInModifica;
    const testa = ordLeggiTesta();
    if (!testa.cliente) {
        await showCustomAlert('Scrivi il nome del cliente (Sig.)', 'Controlla l\'ordine', '&#9888;&#65039;');
        return;
    }
    const btn = document.getElementById('ord-salva');
    btn.disabled = true;
    const adesso = new Date().toISOString();
    try {
        const agg = Object.assign({}, testa, { firma: ordFirmaDati(), updated_at: adesso, updated_by: macUtente() });
        const { error } = await supabaseClient.from('macchine_ordini').update(agg).eq('id', o.id);
        if (error) throw error;
        // Cliente cambiato: aggiorna anche il nome nel quaderno
        if ((o.cliente || '') !== testa.cliente) {
            const pezzi = ordPezziOrdine(o);
            if (pezzi.length) {
                const { error: e2 } = await supabaseClient.from('macchine_pezzi').update({ cliente: testa.cliente, updated_at: adesso, updated_by: macUtente() }).eq('ordine_id', o.id);
                if (e2) throw e2;
                await macRegistra(pezzi.map(p => ({ pezzo_id: p.id, articolo_id: p.articolo_id, tipo: 'ORDINE', stato_prima: p.stato, stato_dopo: p.stato,
                    cliente: testa.cliente, matricola: p.matricola, netto: p.netto_carico,
                    dettaglio: 'ORDINE ' + ordNumero(o) + ' - CLIENTE ' + (o.cliente || '-') + ' \u2192 ' + testa.cliente })));
            }
        }
    } catch (error) {
        console.error('Errore modifica ordine:', error);
        btn.disabled = false;
        await showCustomAlert('Errore durante il salvataggio:<br>' + macEsc(error.message), 'Errore', '&#10060;');
        return;
    }
    btn.disabled = false;
    const id = o.id;
    ordNuovoModulo();
    await ordRicarica();
    ordSwitchTab('elenco');
    ordApriDettaglio(id);
    ordSalvaSuDrive(id);   // PDF aggiornato (dati / firma)
}

async function ordSvuotaModulo() {
    if (ordInModifica) {
        ordNuovoModulo();
        ordSwitchTab('elenco');
        return;
    }
    if (ordFormRighe.length || listinoPulisciTesto(document.getElementById('ord-cliente').value)) {
        if (!window.confirm('Svuotare il modulo? I dati scritti andranno persi.')) return;
    }
    ordNuovoModulo();
}

// ========================================
// DETTAGLIO ORDINE + AZIONI
// ========================================
let ordDettaglioId = null;

function ordApriDettaglio(id) {
    const o = ordOrdini.find(x => x.id === id);
    if (!o) return;
    ordDettaglioId = id;
    const st = ordStato(o);
    const righe = ordRigheOrdine(o);
    const pezzi = ordPezziOrdine(o);

    const dati = [
        ['Data', ordDataIt(o.data)], ['Operatore', o.operatore], ['Indirizzo', o.indirizzo], ['Tel / Cell', o.telefono], ['E-mail', o.email],
        ['C.F.', o.codice_fiscale], ['P.IVA', o.partita_iva], ['Pagamento', o.pagamento], ['Note', o.note]
    ].filter(d => d[1]);

    let html =
        '<div class="ord-det-testa">' +
            '<div class="ord-det-cliente">' + macEsc(o.cliente) + '</div>' + ordBadgeStato(st) +
        '</div>' +
        '<div class="ord-det-dati">' + dati.map(d => '<div><span>' + d[0] + '</span>' + macEsc(d[1]) + '</div>').join('') + '</div>' +
        '<div class="ord-det-righe">' + righe.map(r => {
            const pz = pezzi.filter(p => p.ordine_riga_id === r.id).sort((x, y) => x.id - y.id);
            const quadri = pz.map(p => {
                const s = MAC_STATI[p.stato];
                return '<span class="ord-det-pezzo" title="' + macEsc(macNome(macArticolo(p.articolo_id)) + ' - ' + s.etichetta + (p.matricola ? ' - MATR. ' + p.matricola : '')) + '">' +
                    '<span class="mac-quadro mac-quadro-mini ' + s.classe + '">' + (p.stato === 'CONSEGNATA' ? '&#10005;' : '') + '</span>' +
                    macEsc(s.etichetta) + (p.matricola ? ' <small>' + macEsc(p.matricola) + '</small>' : '') + '</span>';
            }).join('');
            return '<div class="ord-det-riga">' +
                '<div class="ord-det-riga-testa"><span>' + (r.quantita > 1 ? '<strong>' + r.quantita + ' x</strong> ' : '') + macEsc(r.descrizione) +
                    (r.codice ? ' <small>' + macEsc(r.codice) + '</small>' : '') + '</span><strong>' + macEuro(r.prezzo_totale) + '</strong></div>' +
                (r.disponibilita === 'LIBERA' ? '<div class="ord-det-libera">Riga libera (non tocca il magazzino)</div>'
                    : '<div class="ord-det-pezzi">' + (quadri || '<em>nessuna macchina collegata</em>') + '</div>') +
            '</div>';
        }).join('') + '</div>' +
        '<div class="ord-det-totale"><span>TOTALE</span><strong>' + macEuro(o.totale) + '</strong></div>' +
        (o.firma ? '<div class="ord-det-firma"><span>Firma per accettazione</span><img src="' + o.firma + '" alt="Firma"></div>' : '<p class="mac-aiuto">Ordine non firmato.</p>') +
        '<div id="ord-drive-stato" class="ord-drive">' + ordStatoDriveHtml(o) + '</div>';

    document.getElementById('ord-dettaglio-titolo').innerHTML = '&#128221; Ordine N. ' + ordNumero(o);
    document.getElementById('ord-dettaglio-corpo').innerHTML = html;

    // Azioni possibili
    const daOrdinare = pezzi.filter(p => p.stato === 'DA_ORDINARE').length;
    const inCasa = pezzi.filter(p => p.stato === 'IN_CASA').length;
    const annullato = !!o.annullato_at;
    let azioni = '<button type="button" class="btn-primary" data-ord-azione="stampa">&#128424; Stampa / PDF</button>';
    if (!annullato) {
        if (daOrdinare) azioni += '<button type="button" class="btn-back" data-ord-azione="ordinato">&#128998; Ordinato al fornitore (' + daOrdinare + ')</button>';
        if (inCasa || (pezzi.length === 0 && !o.consegnato_at)) azioni += '<button type="button" class="btn-back" data-ord-azione="consegna">&#9989; Consegnato al cliente' + (inCasa ? ' (' + inCasa + ')' : '') + '</button>';
        azioni += '<button type="button" class="btn-back" data-ord-azione="modifica">&#9997;&#65039; Modifica dati cliente / firma</button>';
        azioni += '<button type="button" class="btn-danger" data-ord-azione="annulla">&#10006; Annulla ordine</button>';
    }
    azioni += '<button type="button" class="btn-danger" data-ord-azione="elimina">&#128465; Elimina ordine</button>';
    document.getElementById('ord-dettaglio-azioni').innerHTML = azioni;
    document.getElementById('ord-dettaglio-modal').classList.remove('hidden');
}

function ordChiudiDettaglio() {
    document.getElementById('ord-dettaglio-modal').classList.add('hidden');
    ordDettaglioId = null;
}

async function ordAzione(azione) {
    const o = ordOrdini.find(x => x.id === ordDettaglioId);
    if (!o) return;
    if (azione === 'stampa') return ordStampa(o);
    if (azione === 'modifica') return ordApriModifica(o.id);
    if (azione === 'drive') return ordSalvaSuDrive(o.id);
    if (azione === 'elimina') return ordElimina(o);

    const pezzi = ordPezziOrdine(o);
    const adesso = new Date().toISOString();
    const utente = macUtente();
    const numeroTesto = 'ORDINE ' + ordNumero(o);
    const log = [];
    try {
        if (azione === 'ordinato') {
            const lista = pezzi.filter(p => p.stato === 'DA_ORDINARE');
            if (!window.confirm('Segnare ' + lista.length + ' macchin' + (lista.length === 1 ? 'a' : 'e') + ' come ORDINATE al fornitore?\n(nel quaderno il quadratino diventa blu)')) return;
            for (const p of lista) {
                const { error } = await supabaseClient.from('macchine_pezzi').update({ stato: 'ORDINATA', updated_at: adesso, updated_by: utente }).eq('id', p.id);
                if (error) throw error;
                log.push({ pezzo_id: p.id, articolo_id: p.articolo_id, tipo: 'ORDINE', stato_prima: 'DA_ORDINARE', stato_dopo: 'ORDINATA',
                    cliente: p.cliente, matricola: p.matricola, netto: p.netto_carico, dettaglio: numeroTesto + ' - ORDINATA AL FORNITORE' });
            }
        } else if (azione === 'consegna') {
            const lista = pezzi.filter(p => p.stato === 'IN_CASA');
            const nonPronte = pezzi.filter(p => p.stato === 'DA_ORDINARE' || p.stato === 'ORDINATA').length;
            let msg = lista.length
                ? 'Segnare ' + lista.length + ' macchin' + (lista.length === 1 ? 'a' : 'e') + ' come CONSEGNATE al cliente?'
                : 'Segnare l\'ordine come CONSEGNATO?';
            if (nonPronte) msg += '\n\nAttenzione: ' + nonPronte + ' macchine non sono ancora arrivate e restano in attesa.';
            if (!window.confirm(msg)) return;
            for (const p of lista) {
                const { error } = await supabaseClient.from('macchine_pezzi').update({ stato: 'CONSEGNATA', data_consegna: adesso, updated_at: adesso, updated_by: utente }).eq('id', p.id);
                if (error) throw error;
                log.push({ pezzo_id: p.id, articolo_id: p.articolo_id, tipo: 'ORDINE', stato_prima: 'IN_CASA', stato_dopo: 'CONSEGNATA',
                    cliente: p.cliente, matricola: p.matricola, netto: p.netto_carico, dettaglio: numeroTesto + ' - CONSEGNATA' });
            }
            if (!nonPronte) {
                const { error } = await supabaseClient.from('macchine_ordini').update({ consegnato_at: adesso, updated_at: adesso, updated_by: utente }).eq('id', o.id);
                if (error) throw error;
            }
        } else if (azione === 'annulla') {
            const consegnate = pezzi.filter(p => p.stato === 'CONSEGNATA').length;
            if (!window.confirm('Annullare l\'ordine N. ' + ordNumero(o) + ' di ' + o.cliente + '?\n\n' +
                '- Le macchine in casa tornano DISPONIBILI\n' +
                '- Le righe DA ORDINARE vengono tolte dal quaderno\n' +
                '- Le macchine gia\' ORDINATE al fornitore restano ordinate, senza cliente (arriveranno come disponibili)' +
                (consegnate ? '\n- ' + consegnate + ' macchine gia\' consegnate restano come sono' : '') +
                '\n\nIl numero d\'ordine resta usato (l\'ordine si vede come annullato).')) return;
            for (const p of pezzi) {
                if (p.stato === 'CONSEGNATA') continue;
                if (p.stato === 'DA_ORDINARE') {
                    const { error } = await supabaseClient.from('macchine_pezzi').delete().eq('id', p.id);
                    if (error) throw error;
                    log.push({ pezzo_id: p.id, articolo_id: p.articolo_id, tipo: 'ORDINE', stato_prima: 'DA_ORDINARE', stato_dopo: null,
                        cliente: p.cliente, matricola: null, netto: null, dettaglio: numeroTesto + ' ANNULLATO - RIGA TOLTA' });
                } else {
                    const { error } = await supabaseClient.from('macchine_pezzi').update({
                        cliente: null, ordine_id: null, ordine_riga_id: null, set_id: null, updated_at: adesso, updated_by: utente
                    }).eq('id', p.id);
                    if (error) throw error;
                    log.push({ pezzo_id: p.id, articolo_id: p.articolo_id, tipo: 'ORDINE', stato_prima: p.stato, stato_dopo: p.stato,
                        cliente: null, matricola: p.matricola, netto: p.netto_carico,
                        dettaglio: numeroTesto + ' ANNULLATO - ' + (p.stato === 'IN_CASA' ? 'TORNA DISPONIBILE' : 'RESTA ORDINATA SENZA CLIENTE') + ' (ERA DI ' + (p.cliente || '-') + ')' });
                }
            }
            const { error } = await supabaseClient.from('macchine_ordini').update({ annullato_at: adesso, updated_at: adesso, updated_by: utente }).eq('id', o.id);
            if (error) throw error;
        }
    } catch (error) {
        console.error('Errore azione ordine:', error);
        await macRegistra(log);
        await ordRicarica();
        ordApriDettaglio(o.id);
        await showCustomAlert('Errore:<br>' + macEsc(error.message), 'Errore', '&#10060;');
        return;
    }
    await macRegistra(log);
    await ordRicarica();
    ordApriDettaglio(o.id);
    // Annullato: il PDF su Drive viene rifatto con la scritta ANNULLATO
    if (azione === 'annulla' && o.drive_file_id) ordSalvaSuDrive(o.id);
}

// Elimina l'ordine: libera le macchine (come l'annullo), PDF di Drive nel cestino
async function ordElimina(o) {
    const pezzi = ordPezziOrdine(o);
    const consegnate = pezzi.filter(p => p.stato === 'CONSEGNATA').length;
    const ultimo = !ordOrdini.some(x => x.anno === o.anno && x.numero > o.numero);
    if (!window.confirm('ELIMINARE definitivamente l\'ordine N. ' + ordNumero(o) + ' di ' + o.cliente + '?\n\n' +
        '- Le macchine in casa tornano DISPONIBILI\n' +
        '- Le righe DA ORDINARE vengono tolte dal quaderno\n' +
        '- Le macchine gia\' ORDINATE al fornitore restano ordinate, senza cliente\n' +
        (consegnate ? '- ' + consegnate + ' macchine gia\' consegnate restano consegnate a ' + o.cliente + '\n' : '') +
        '- Il PDF su Google Drive va nel cestino\n\n' +
        (ultimo ? 'Era l\'ultimo ordine del ' + o.anno + ': il numero ' + o.numero + ' verra\' riusato dal prossimo ordine.'
                : 'Attenzione: nella numerazione del ' + o.anno + ' restera\' un buco (manca il ' + o.numero + ').') +
        '\n\nL\'operazione non si puo\' annullare.')) return;

    const adesso = new Date().toISOString();
    const utente = macUtente();
    const numeroTesto = 'ORDINE ' + ordNumero(o);
    const log = [];
    try {
        for (const p of pezzi) {
            if (p.stato === 'DA_ORDINARE') {
                const { error } = await supabaseClient.from('macchine_pezzi').delete().eq('id', p.id);
                if (error) throw error;
                log.push({ pezzo_id: p.id, articolo_id: p.articolo_id, tipo: 'ORDINE', stato_prima: 'DA_ORDINARE', stato_dopo: null,
                    cliente: p.cliente, matricola: null, netto: null, dettaglio: numeroTesto + ' ELIMINATO - RIGA TOLTA' });
            } else {
                const agg = p.stato === 'CONSEGNATA'
                    ? { ordine_id: null, ordine_riga_id: null, updated_at: adesso, updated_by: utente }
                    : { cliente: null, ordine_id: null, ordine_riga_id: null, set_id: null, updated_at: adesso, updated_by: utente };
                const { error } = await supabaseClient.from('macchine_pezzi').update(agg).eq('id', p.id);
                if (error) throw error;
                log.push({ pezzo_id: p.id, articolo_id: p.articolo_id, tipo: 'ORDINE', stato_prima: p.stato, stato_dopo: p.stato,
                    cliente: agg.cliente === null ? null : p.cliente, matricola: p.matricola, netto: p.netto_carico,
                    dettaglio: numeroTesto + ' ELIMINATO' + (p.stato === 'CONSEGNATA' ? ' - RESTA CONSEGNATA' :
                        p.stato === 'IN_CASA' ? ' - TORNA DISPONIBILE' : ' - RESTA ORDINATA SENZA CLIENTE') + ' (ERA DI ' + (p.cliente || '-') + ')' });
            }
        }
        const { error } = await supabaseClient.from('macchine_ordini').delete().eq('id', o.id);
        if (error) throw error;
    } catch (error) {
        console.error('Errore eliminazione ordine:', error);
        await macRegistra(log);
        await ordRicarica();
        await showCustomAlert('Errore durante l\'eliminazione:<br>' + macEsc(error.message), 'Errore', '&#10060;');
        return;
    }
    await macRegistra(log);
    let notaDrive = '';
    if (o.drive_file_id) {
        try {
            await ordDriveChiama({ azione: 'cestina', fileId: o.drive_file_id });
            notaDrive = '<br>Il PDF &egrave; nel cestino di Google Drive.';
        } catch (err) {
            notaDrive = '<br>&#9888;&#65039; Il PDF su Drive non &egrave; stato cestinato: cancellalo a mano (' + (err.message || err) + ')';
        }
    }
    ordChiudiDettaglio();
    await ordRicarica();
    await showCustomAlert('Ordine N. ' + ordNumero(o) + ' eliminato.' + notaDrive, 'Eliminato', '&#10004;');
}

// ========================================
// STAMPA (come il modulo cartaceo) - dal browser si puo' "Salva come PDF"
// ========================================
function ordHtmlStampa(o, righeTotali) {
    const righe = ordRigheOrdine(o);
    const daOrdinare = righe.some(r => r.disponibilita === 'DA_ORDINARE');
    const disponibile = righe.some(r => r.disponibilita !== 'DA_ORDINARE');
    const casella = (spuntata) => '<span class="ost-casella">' + (spuntata ? '&#10005;' : '') + '</span>';
    const linea = (etichetta, valore) => '<div class="ost-linea"><span class="ost-etich">' + etichetta + '</span><span class="ost-val">' + macEsc(valore || '') + '</span></div>';

    let tabella = righe.map(r =>
        '<tr><td>' + macEsc(r.descrizione) + (r.disponibilita === 'DA_ORDINARE' ? ' <em>(da ordinare)</em>' : '') + '</td>' +
        '<td>' + macEsc(r.codice || '') + '</td>' +
        '<td class="ost-c">' + r.quantita + '</td>' +
        '<td class="ost-r">' + (r.prezzo_totale !== null && r.prezzo_totale !== undefined ? macEuro(r.prezzo_totale) : '') + '</td></tr>'
    ).join('');
    const totaleRighe = Math.max(righeTotali || ORD_MIN_RIGHE_STAMPA, righe.length);
    for (let i = righe.length; i < totaleRighe; i++) tabella += '<tr class="ost-vuota"><td></td><td></td><td></td><td></td></tr>';

    return '<div class="ost-pagina">' +
        '<div class="ost-testa">' +
            '<img src="logo.png" alt="Agrimacch" class="ost-logo">' +
            '<div class="ost-azienda"><strong>' + ORD_AZIENDA.nome + '</strong><br>' + ORD_AZIENDA.indirizzo + '<br>' + ORD_AZIENDA.contatti + '<br>' + ORD_AZIENDA.web + '</div>' +
        '</div>' +
        '<div class="ost-riga-tipo">' +
            '<span>' + casella(true) + ' ORDINE N. <strong>' + ordNumero(o) + '</strong>' +
                (o.operatore ? '<span class="ost-operatore">OPERATORE <strong>' + macEsc(o.operatore) + '</strong></span>' : '') + '</span>' +
            '<span class="ost-data">DATA <strong>' + ordDataIt(o.data) + '</strong></span>' +
        '</div>' +
        linea('SIG.', o.cliente) +
        linea('INDIRIZZO', o.indirizzo) +
        '<div class="ost-doppia">' + linea('TEL / CELL', o.telefono) + linea('E-MAIL', o.email) + '</div>' +
        '<div class="ost-doppia">' + linea('C.F.', o.codice_fiscale) + linea('P.IVA', o.partita_iva) + '</div>' +
        linea('NOTE', o.note) +
        '<div class="ost-box">' +
            '<div class="ost-box-testa"><span>PAGAMENTO</span><span class="ost-piccolo">LA FATTURA POTR&Agrave; ESSERE RICHIESTA SOLO ALL\'ORDINE</span></div>' +
            '<div class="ost-box-corpo">' + macEsc(o.pagamento || '') + '</div>' +
        '</div>' +
        '<table class="ost-tabella"><thead><tr><th>ARTICOLO</th><th>CODICE</th><th class="ost-c">Q.T&Agrave;</th><th class="ost-r">P. TOTALE</th></tr></thead>' +
            '<tbody>' + tabella + '</tbody></table>' +
        '<div class="ost-piede">' +
            '<div class="ost-caselle"><span>' + casella(disponibile) + ' DISPONIBILE</span><span>' + casella(daOrdinare) + ' DA ORDINARE</span></div>' +
            '<div class="ost-totale"><span>TOTALE</span><strong>' + (o.totale !== null && o.totale !== undefined ? macEuro(o.totale) : '') + '</strong></div>' +
        '</div>' +
        '<p class="ost-condizioni">' + ORD_CONDIZIONI + '</p>' +
        '<div class="ost-firma">' +
            (o.firma ? '<img src="' + o.firma + '" alt="Firma">' : '<div class="ost-firma-vuota"></div>') +
            '<span>FIRMA PER ACCETTAZIONE</span>' +
        '</div>' +
        (o.annullato_at ? '<div class="ost-annullato">ANNULLATO</div>' : '') +
    '</div>';
}

// Quante righe deve avere la tabella articoli per riempire il foglio A4:
// prova il modulo fuori dallo schermo e aggiunge righe vuote finche' c'e' spazio
function ordRigheCheRiempiono(o) {
    const prova = document.createElement('div');
    prova.className = 'ord-pdf-temp';
    document.body.appendChild(prova);
    try {
        let n = Math.max(ORD_MIN_RIGHE_STAMPA, ordRigheOrdine(o).length);
        prova.innerHTML = ordHtmlStampa(o, n);
        prova.firstElementChild.classList.add('ost-a4-pdf');
        const altezza = prova.firstElementChild.offsetHeight;
        const riga = prova.querySelector('.ost-tabella tbody tr:last-child');
        const altezzaRiga = riga ? riga.offsetHeight : 26;
        if (altezza && altezzaRiga) {
            const spazio = ORD_ALTEZZA_A4_PX - altezza;
            if (spazio > 0) n += Math.floor(spazio / altezzaRiga);
        }
        return n;
    } finally {
        prova.remove();
    }
}

// Stampa: crea il PDF (lo stesso che va su Drive) e lo apre in una nuova scheda.
// Cosi' non compaiono le scritte del browser in alto e in fondo alla pagina.
function ordStampa(o) {
    pdfApriInScheda(() => ordCreaPdf(o, 'blob'), ordNomeFile(o));
}

// Apre un PDF creato dall'app in una nuova scheda (da li' si stampa o si salva).
// La scheda si apre subito (altrimenti il browser la blocca) e il PDF arriva appena pronto.
// Se la scheda non si puo' aprire, il PDF viene scaricato.
async function pdfApriInScheda(creaBlob, nomeFile) {
    let finestra = null;
    try { finestra = window.open('', '_blank'); } catch (e) { finestra = null; }
    if (finestra) {
        try {
            finestra.document.title = nomeFile;
            finestra.document.body.innerHTML = '<p style="font-family:Arial,sans-serif;padding:24px;color:#555">&#8987; Creazione del PDF in corso...</p>';
        } catch (e) { /* niente */ }
    }
    try {
        const blob = await creaBlob();
        const url = URL.createObjectURL(blob);
        if (finestra && !finestra.closed) {
            finestra.location.href = url;
        } else {
            const a = document.createElement('a');
            a.href = url;
            a.download = nomeFile;
            document.body.appendChild(a);
            a.click();
            a.remove();
        }
        setTimeout(() => URL.revokeObjectURL(url), 300000);
    } catch (err) {
        console.error('PDF non creato:', err);
        if (finestra && !finestra.closed) finestra.close();
        showCustomAlert('Non riesco a creare il PDF:<br>' + macEsc(err && err.message ? err.message : err), 'Errore', '&#10060;');
    }
}

// ========================================
// PDF SU GOOGLE DRIVE
// ----------------------------------------
// L'app crea il PDF (stesso aspetto della stampa) e lo manda alla Edge Function
// "ordini-drive", che lo passa allo script Google (google/ordini-drive.gs).
// Lo script lo salva in ORDINI CLIENTI / ORDINI CLIENTI <anno> (cartelle create da sole)
// e restituisce il link. Se l'ordine cambia (firma, dati, annullato) il PDF viene sostituito.
// ========================================
// ========================================
// CREAZIONE PDF (ordini, report, valore magazzino)
// ----------------------------------------
// Il foglio viene costruito in alto a sinistra della pagina (coperto da un avviso
// "Creazione del PDF..."), "fotografato" con html2canvas e messo in un A4 con jsPDF.
// Cosi' la posizione non dipende dalla larghezza della finestra o dal browser.
// I report lunghi vengono divisi in pagine tra una riga e l'altra (mai a meta' riga).
// ========================================
const PDF_LIBRERIE = [
    { url: 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js', pronta: () => typeof window.html2canvas === 'function' },
    { url: 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js', pronta: () => !!(window.jspdf && window.jspdf.jsPDF) }
];
let pdfLibreriePromessa = null;

function pdfCaricaLibrerie() {
    if (PDF_LIBRERIE.every(l => l.pronta())) return Promise.resolve();
    if (pdfLibreriePromessa) return pdfLibreriePromessa;
    pdfLibreriePromessa = PDF_LIBRERIE.reduce((catena, lib) => catena.then(() => {
        if (lib.pronta()) return;
        return new Promise((ok, ko) => {
            const s = document.createElement('script');
            s.src = lib.url;
            s.onload = () => ok();
            s.onerror = () => ko(new Error('Libreria PDF non caricata (connessione?)'));
            document.head.appendChild(s);
        });
    }), Promise.resolve()).catch(err => { pdfLibreriePromessa = null; throw err; });
    return pdfLibreriePromessa;
}

// html: il foglio; opz: { margini: {alto, sx, basso, dx} (mm), unaPagina, numeriPagina, tagli (selettore CSS), prepara(el) }
async function pdfCreaDaHtml(html, opz) {
    await pdfCaricaLibrerie();
    const m = opz.margini || { alto: 10, sx: 10, basso: 10, dx: 10 };
    const velo = document.createElement('div');
    velo.className = 'pdf-velo';
    velo.innerHTML = '<div>&#8987; Creazione del PDF...</div>';
    const foglio = document.createElement('div');
    foglio.className = 'pdf-foglio';
    foglio.innerHTML = html;
    document.body.appendChild(foglio);
    document.body.appendChild(velo);
    const scrollPrima = { x: window.scrollX, y: window.scrollY };
    try {
        const el = foglio.firstElementChild;
        if (opz.prepara) opz.prepara(el);
        const immagini = Array.from(el.querySelectorAll('img'));
        await Promise.all(immagini.map(img => img.complete ? Promise.resolve() : new Promise(r => { img.onload = r; img.onerror = r; })));
        window.scrollTo(0, 0);

        const cssW = el.offsetWidth;
        const cssH = el.offsetHeight;
        const canvas = await window.html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false, scrollX: 0, scrollY: 0 });
        const k = canvas.width / cssW;                 // pixel della foto per pixel della pagina
        const larghezzaMm = 210 - m.sx - m.dx;
        const altezzaMm = 297 - m.alto - m.basso;
        const pxPerMm = cssW / larghezzaMm;
        const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

        if (opz.unaPagina) {
            let w = larghezzaMm;
            let h = cssH / pxPerMm;
            if (h > altezzaMm) { w = w * altezzaMm / h; h = altezzaMm; }
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', m.sx + (larghezzaMm - w) / 2, m.alto, w, h);
            return pdf;
        }

        // Piu' pagine: si taglia sotto l'ultima riga che ci sta
        const base = el.getBoundingClientRect().top;
        const tagli = Array.from(el.querySelectorAll(opz.tagli || 'tr'))
            .map(x => x.getBoundingClientRect().bottom - base).sort((a, b) => a - b);
        const altezzaPaginaCss = altezzaMm * pxPerMm;
        let inizio = 0;
        let pagina = 0;
        while (inizio < cssH - 1) {
            let fine = Math.min(cssH, inizio + altezzaPaginaCss);
            if (fine < cssH) {
                const buoni = tagli.filter(t => t > inizio + 40 && t <= fine);
                if (buoni.length) fine = buoni[buoni.length - 1];
            }
            const fetta = document.createElement('canvas');
            fetta.width = canvas.width;
            fetta.height = Math.max(1, Math.round((fine - inizio) * k));
            const ctx = fetta.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, fetta.width, fetta.height);
            ctx.drawImage(canvas, 0, Math.round(inizio * k), canvas.width, fetta.height, 0, 0, canvas.width, fetta.height);
            if (pagina > 0) pdf.addPage();
            pdf.addImage(fetta.toDataURL('image/jpeg', 0.92), 'JPEG', m.sx, m.alto, larghezzaMm, (fine - inizio) / pxPerMm);
            inizio = fine;
            pagina++;
        }
        if (opz.numeriPagina && pagina > 1) {
            for (let i = 1; i <= pagina; i++) {
                pdf.setPage(i);
                pdf.setFontSize(7);
                pdf.setTextColor(150);
                pdf.text(i + ' / ' + pagina, 210 - m.dx, 297 - 5, { align: 'right' });
            }
        }
        return pdf;
    } finally {
        foglio.remove();
        velo.remove();
        window.scrollTo(scrollPrima.x, scrollPrima.y);
    }
}

function ordNomeFile(o) {
    const cliente = String(o.cliente || '').replace(/[^A-Z0-9 ]+/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, 50);
    return 'ORDINE ' + String(o.numero).padStart(4, '0') + '-' + o.anno + (cliente ? ' ' + cliente : '') + '.pdf';
}

async function ordCreaPdfBase64(o) {
    return ordCreaPdf(o, 'base64');
}

// formato: 'base64' (per Drive) oppure 'blob' (per aprirlo / stamparlo)
async function ordCreaPdf(o, formato) {
    const pdf = await pdfCreaDaHtml(ordHtmlStampa(o, ordRigheCheRiempiono(o)), {
        margini: { alto: 10, sx: 10, basso: 10, dx: 10 },
        unaPagina: true,
        prepara: el => el.classList.add('ost-a4-pdf')
    });
    if (formato === 'blob') return pdf.output('blob');
    return String(pdf.output('datauristring')).split(',')[1];
}

async function ordDriveChiama(corpo) {
    const { data, error } = await supabaseClient.functions.invoke('ordini-drive', { body: corpo });
    if (error) {
        let msg = error.message || String(error);
        try {
            const j = error.context && typeof error.context.json === 'function' ? await error.context.json() : null;
            if (j && j.errore) msg = j.errore;
        } catch (e) { /* niente */ }
        if (/Failed to send|not found|404/i.test(msg)) {
            msg = 'La funzione &quot;ordini-drive&quot; non risponde: va creata su Supabase (vedi GUIDA_ORDINI_DRIVE.md). Dettaglio: ' + msg;
        }
        throw new Error(msg);
    }
    if (!data || !data.ok) throw new Error((data && data.errore) || 'Risposta non valida dalla funzione ordini-drive');
    return data;
}

async function ordSalvaSuDrive(id) {
    const o = ordOrdini.find(x => x.id === id);
    if (!o || ordDriveInCorso[id]) return;
    ordDriveInCorso[id] = true;
    delete ordDriveErrore[id];
    ordAggiornaStatoDrive(id);
    try {
        const pdf = await ordCreaPdfBase64(o);
        const res = await ordDriveChiama({ azione: 'salva', anno: o.anno, nome: ordNomeFile(o), pdf: pdf, fileId: o.drive_file_id || null });
        const agg = { drive_url: res.url, drive_file_id: res.fileId, drive_salvato_at: new Date().toISOString() };
        const { error } = await supabaseClient.from('macchine_ordini').update(agg).eq('id', o.id);
        if (error) throw error;
        Object.assign(o, agg);
    } catch (err) {
        console.error('PDF ordine non salvato su Drive:', err);
        ordDriveErrore[id] = err && err.message ? err.message : String(err);
    } finally {
        delete ordDriveInCorso[id];
        ordAggiornaStatoDrive(id);
    }
}

// Riga "PDF su Drive" nella finestra del dettaglio
function ordStatoDriveHtml(o) {
    if (ordDriveInCorso[o.id]) return '&#8987; Salvataggio del PDF su Google Drive...';
    if (ordDriveErrore[o.id]) {
        return '&#10060; PDF non salvato su Drive: ' + ordDriveErrore[o.id] +
            '<br><button type="button" class="btn-back mac-btn-piccolo" data-ord-azione="drive">&#128260; Riprova</button>';
    }
    if (o.drive_url) {
        return '&#128193; PDF su Google Drive <small>(salvato il ' + macDataOra(o.drive_salvato_at) + ')</small> ' +
            '<a href="' + macEsc(o.drive_url) + '" target="_blank" rel="noopener" class="btn-back mac-btn-piccolo">Apri</a> ' +
            '<button type="button" class="btn-back mac-btn-piccolo" data-ord-azione="drive">Salva di nuovo</button>';
    }
    return '&#128193; PDF non ancora su Google Drive ' +
        '<button type="button" class="btn-back mac-btn-piccolo" data-ord-azione="drive">Salva su Drive</button>';
}

function ordAggiornaStatoDrive(id) {
    if (ordDettaglioId !== id) return;
    const el = document.getElementById('ord-drive-stato');
    const o = ordOrdini.find(x => x.id === id);
    if (el && o) el.innerHTML = ordStatoDriveHtml(o);
}

async function ordProvaDrive() {
    const btn = document.getElementById('ord-prova-drive');
    btn.disabled = true;
    try {
        const res = await ordDriveChiama({ azione: 'prova', anno: new Date().getFullYear() });
        await showCustomAlert('Collegamento con Google Drive funzionante.<br><br>Cartella: <strong>' + macEsc(res.cartella || '') + '</strong>' +
            (res.url ? '<br><a href="' + macEsc(res.url) + '" target="_blank" rel="noopener">Apri la cartella su Drive</a>' : ''),
            'Drive OK', '&#10004;');
    } catch (err) {
        await showCustomAlert('Il collegamento con Google Drive non funziona:<br><br><strong>' + (err.message || err) + '</strong>' +
            '<br><br>Segui GUIDA_ORDINI_DRIVE.md (cartella magazzino-app).', 'Drive', '&#10060;');
    }
    btn.disabled = false;
}

// ========================================
// EVENT LISTENERS
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    const section = document.getElementById('section-ordini-clienti');
    if (!section) return;

    document.querySelectorAll('#tabs-ordini .tab-btn').forEach(btn => {
        btn.addEventListener('click', () => ordSwitchTab(btn.dataset.ordTab));
    });

    // Elenco
    document.getElementById('ord-search').addEventListener('input', () => {
        clearTimeout(ordSearchTimeout);
        ordSearchTimeout = setTimeout(ordRenderElenco, 200);
    });
    document.getElementById('ord-f-anno').addEventListener('change', ordRenderElenco);
    document.getElementById('ord-f-stato').addEventListener('change', ordRenderElenco);
    document.getElementById('ord-container').addEventListener('click', (e) => {
        const el = e.target.closest('[data-ordine]');
        if (el) ordApriDettaglio(parseInt(el.dataset.ordine, 10));
    });

    // Modulo
    macPickerImposta('ord-art-search', 'ord-art-results', null, ordAggiungiArticolo);
    document.getElementById('ord-btn-libera').addEventListener('click', ordAggiungiLibera);
    const righe = document.getElementById('ord-righe');
    righe.addEventListener('input', ordCampoRigaCambiato);
    righe.addEventListener('change', ordCampoRigaCambiato);
    righe.addEventListener('click', (e) => {
        const b = e.target.closest('[data-togli]');
        if (!b) return;
        ordFormRighe.splice(parseInt(b.dataset.togli, 10), 1);
        ordRenderFormRighe();
    });
    document.getElementById('ord-salva').addEventListener('click', ordSalva);
    document.getElementById('ord-annulla-form').addEventListener('click', ordSvuotaModulo);
    document.getElementById('ord-btn-nuovo-listino').addEventListener('click', () => {
        if (typeof openListinoEdit === 'function') openListinoEdit(null);
    });

    // Firma
    const c = document.getElementById('ord-firma');
    c.addEventListener('pointerdown', ordFirmaInizio);
    c.addEventListener('pointermove', ordFirmaMuovi);
    c.addEventListener('pointerup', ordFirmaFine);
    c.addEventListener('pointercancel', ordFirmaFine);
    c.addEventListener('pointerleave', ordFirmaFine);
    document.getElementById('ord-firma-cancella').addEventListener('click', ordFirmaPulisci);
    window.addEventListener('resize', () => {
        if (!document.getElementById('section-ordini-clienti').classList.contains('hidden')) ordFirmaAdatta();
    });

    // Prova collegamento Drive
    document.getElementById('ord-prova-drive').addEventListener('click', ordProvaDrive);

    // Dettaglio
    document.getElementById('ord-dettaglio-close').addEventListener('click', ordChiudiDettaglio);
    document.getElementById('ord-dettaglio-chiudi').addEventListener('click', ordChiudiDettaglio);
    document.getElementById('ord-dettaglio-modal').addEventListener('click', (e) => {
        const b = e.target.closest('[data-ord-azione]');
        if (b) ordAzione(b.dataset.ordAzione);
    });
});

window.openOrdiniClienti = openOrdiniClienti;
window.pdfApriInScheda = pdfApriInScheda;
window.pdfCreaDaHtml = pdfCreaDaHtml;
window.ordNumeroDiPezzo = ordNumeroDiPezzo;
