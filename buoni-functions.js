// ========================================
// VENDITE - BUONI REGALO (v6.4.0)
// ----------------------------------------
// Un buono per riga: cliente (chi lo compra), telefono, intestato a (chi lo riceve,
// facoltativo), importo, scadenza, note. Numero progressivo che riparte da 1 ogni anno
// (2026/1, 2026/2 ... 2027/1) come gli ordini clienti.
// Il PDF e' un vero buono regalo su META' foglio A4 (in alto);
// la "copia per il negozio" con i dati e la firma del cliente e' nella seconda pagina (v7.11.2).
// Stati: VALIDO, IN SCADENZA (entro 30 giorni), SCADUTO, UTILIZZATO, ANNULLATO.
// Tabella Supabase: buoni_regalo (script supabase/buoni-regalo-setup.sql).
// PDF su Google Drive come gli ordini: Edge Function SEPARATA "buoni-drive" + script Google
// google/buoni-drive.gs -> cartelle BUONI REGALO / BUONI REGALO <anno> (guida GUIDA_BUONI_DRIVE.md).
// Il PDF viene salvato da solo alla creazione e rifatto dopo modifica / annullo / ripristino;
// eliminando il buono il PDF va nel cestino di Drive.
// Per ora solo admin: BUONI_RUOLI in app.js + funzione buoni_puo_gestire() su Supabase.
// v7.11: due tipi, BUONO REGALO (verde scuro, fiocco rosso, dedica) e BUONO SPESA (verde chiaro e oro, borsa della spesa):
// v7.11.3: buono speso A PIU' RIPRESE. Colonna buoni_regalo.utilizzi (jsonb, script supabase/buoni-utilizzi.sql):
// elenco [{data, importo, note, operatore, at}]. Residuo = importo - speso; a residuo 0 il buono diventa UTILIZZATO
// (utilizzato_at). Ogni spesa registrata / tolta rifa' il PDF su Drive (la copia per il negozio elenca le spese).
// Tolta la linea "taglia qui".
// v7.11.2: il PDF ha DUE pagine: pagina 1 il buono del cliente (meta' alta),
// pagina 2 la copia per il negozio. Condizioni spostate nella fascia a sinistra, timbro piu' grande.
// v7.11.1: modalita' di pagamento (colonna pagamento, script supabase/buoni-pagamento.sql): solo nell'app e sulla copia
// per il negozio, mai sul buono del cliente. Filtro per tipo, riepilogo e Scarica Excel dei buoni filtrati.
// colonna buoni_regalo.tipo ('REGALO' / 'SPESA', script supabase/buoni-tipo.sql). Stessa numerazione.
// Cambiando il tipo il PDF su Drive viene rifatto (nome "BUONO SPESA ..." / "BUONO REGALO ...") e il vecchio va nel cestino.
// ========================================

const BUO_GIORNI_AVVISO = 30;     // "in scadenza" se mancano al massimo 30 giorni
const BUO_CONDIZIONI =
    'Il buono non &egrave; convertibile in denaro e non d&agrave; diritto a resto. ' +
    'Va presentato al momento dell&#39;acquisto ed &egrave; valido fino alla data di scadenza indicata. ' +
    'Non &egrave; rimborsabile in caso di smarrimento.';

// Fiocco rosso disegnato (SVG): due anse, due code e il nodo centrale
const BUO_FIOCCO_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="83" viewBox="0 0 74 64">' +
    '<defs>' +
        '<linearGradient id="buoR1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ef4444"/><stop offset="1" stop-color="#991b1b"/></linearGradient>' +
        '<linearGradient id="buoR2" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ef4444"/><stop offset="1" stop-color="#991b1b"/></linearGradient>' +
    '</defs>' +
    // code
    '<path d="M33 30 L22 60 L28 56 L32 62 L36 32 Z" fill="#b91c1c"/>' +
    '<path d="M41 30 L52 60 L46 56 L42 62 L38 32 Z" fill="#991b1b"/>' +
    // anse
    '<path d="M35 26 C24 8 6 6 4 18 C2 30 20 34 35 30 Z" fill="url(#buoR1)"/>' +
    '<path d="M39 26 C50 8 68 6 70 18 C72 30 54 34 39 30 Z" fill="url(#buoR2)"/>' +
    // pieghe chiare sulle anse
    '<path d="M31 26 C24 16 14 14 11 19" stroke="#fca5a5" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.8"/>' +
    '<path d="M43 26 C50 16 60 14 63 19" stroke="#fca5a5" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.8"/>' +
    // nodo
    '<rect x="30" y="21" width="14" height="13" rx="4" fill="#dc2626" stroke="#7f1d1d" stroke-width="1"/>' +
    '</svg>';

// Borsa della spesa disegnata (SVG) per il buono spesa
const BUO_BORSA_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="84" height="84" viewBox="0 0 64 64">' +
    '<circle cx="32" cy="32" r="31" fill="#ffffff" stroke="#c9a227" stroke-width="2"/>' +
    '<path d="M24 24 C24 14 40 14 40 24" stroke="#3f5a2c" stroke-width="3" fill="none" stroke-linecap="round"/>' +
    '<path d="M16 24 H48 L45 50 H19 Z" fill="#688E53" stroke="#3f5a2c" stroke-width="1.5" stroke-linejoin="round"/>' +
    '<path d="M16 24 H48 L47.4 29 H16.6 Z" fill="#c9a227"/>' +
    '<circle cx="25" cy="29" r="1.8" fill="#3f5a2c"/><circle cx="39" cy="29" r="1.8" fill="#3f5a2c"/>' +
    '<text x="32" y="45" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" font-weight="700" fill="#ffffff">&#8364;</text>' +
    '</svg>';

const BUO_TIPI = {
    REGALO: { nome: 'Buono Regalo', icona: '&#127873;', file: 'BUONO REGALO' },
    SPESA:  { nome: 'Buono Spesa',  icona: '&#128722;', file: 'BUONO SPESA' }
};

function buoTipo(b) {
    return b && b.tipo === 'SPESA' ? 'SPESA' : 'REGALO';
}

const BUO_PAGAMENTI = ['CONTANTI', 'POS / CARTA', 'BONIFICO', 'ASSEGNO', 'OMAGGIO', 'ALTRO'];
let buoFiltroTipo = 'TUTTI';

let buoBuoni = [];
let buoCaricati = false;
let buoFiltro = 'TUTTI';
let buoAnno = 'TUTTI';
let buoCerca = '';
let buoCercaTimer = null;
let buoModifica = null;          // buono aperto nella finestra (null = nuovo)
let buoCanale = null;

// ---------- Utilita' ----------
function buoEsc(v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function buoPad(n) { return String(n).padStart(2, '0'); }
function buoIso(d) { return d.getFullYear() + '-' + buoPad(d.getMonth() + 1) + '-' + buoPad(d.getDate()); }
function buoOggi() { return buoIso(new Date()); }
function buoDaIso(iso) {
    const p = String(iso).split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2], 12, 0, 0);
}
function buoDataIt(iso) {
    if (!iso) return '';
    const p = String(iso).slice(0, 10).split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso;
}
function buoPiuMesi(iso, mesi) {
    const d = buoDaIso(iso);
    const giorno = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + mesi);
    const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(giorno, ultimo));
    return buoIso(d);
}
function buoGiorniA(iso) {
    return Math.round((buoDaIso(iso) - buoDaIso(buoOggi())) / 86400000);
}

// 1250 -> "1.250,00" (punto delle migliaia sempre, anche con 4 cifre)
function buoEuroNumero(n) {
    const v = Math.round((Number(n) || 0) * 100) / 100;
    const [intero, dec] = v.toFixed(2).split('.');
    return intero.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + dec;
}

function buoEuro(n) {
    return '&euro; ' + buoEuroNumero(n);
}

function buoTesto(v) {
    return String(v || '').trim().replace(/\s+/g, ' ').toUpperCase();
}

function buoNorm(s) {
    return String(s || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function buoNumero(b) {
    return b.anno + '/' + b.numero;
}

function buoMieIniziali() {
    const email = loggedInUserEmail || (currentUser ? currentUser.email : '');
    if (typeof userInitials === 'object' && userInitials[email]) return String(userInitials[email]).toUpperCase();
    return String(email || '').split('@')[0].slice(0, 3).toUpperCase();
}

function buoErrore(error, dove) {
    console.error('Buoni regalo - ' + dove + ':', error);
    const msg = error && error.message ? error.message : String(error);
    let extra = '';
    if (/utilizzi/i.test(msg) && /column|colonna|schema cache/i.test(msg)) {
        extra = '<br><br>Esegui su Supabase lo script <strong>supabase/buoni-utilizzi.sql</strong> (aggiunge le spese a pi&ugrave; riprese).';
    } else if (/pagamento/i.test(msg) && /column|colonna|schema cache/i.test(msg)) {
        extra = '<br><br>Esegui su Supabase lo script <strong>supabase/buoni-pagamento.sql</strong> (aggiunge la modalit&agrave; di pagamento).';
    } else if (/tipo/i.test(msg) && /column|colonna|schema cache/i.test(msg)) {
        extra = '<br><br>Esegui su Supabase lo script <strong>supabase/buoni-tipo.sql</strong> (aggiunge il tipo regalo / spesa).';
    } else if (/buoni_regalo|does not exist|schema cache/i.test(msg)) {
        extra = '<br><br>Hai eseguito su Supabase lo script <strong>supabase/buoni-regalo-setup.sql</strong>?';
    } else if (/row-level security|violates/i.test(msg)) {
        extra = '<br><br>Non hai il permesso di gestire i buoni regalo.';
    }
    showCustomAlert('Errore (' + buoEsc(dove) + '):<br>' + buoEsc(msg) + extra, 'Errore', '&#10060;');
}

// Importo scritto all'italiana: "50", "50,00", "1.250,50", "EUR 30"
function buoLeggiImporto(testo) {
    let t = String(testo || '').replace(/[^\d,.\-]/g, '');
    if (!t) return null;
    if (t.indexOf(',') >= 0) t = t.replace(/\./g, '').replace(',', '.');
    else if ((t.match(/\./g) || []).length > 1) t = t.replace(/\./g, '');
    const n = Math.round(parseFloat(t) * 100) / 100;
    return isNaN(n) || n <= 0 ? null : n;
}

// ---------- Stato ----------
// 'ANNULLATO', 'UTILIZZATO', 'SCADUTO', 'IN_SCADENZA', 'VALIDO'
function buoStato(b) {
    if (b.annullato_at) return 'ANNULLATO';
    if (b.utilizzato_at) return 'UTILIZZATO';
    const giorni = buoGiorniA(b.scadenza);
    if (giorni < 0) return 'SCADUTO';
    if (giorni <= BUO_GIORNI_AVVISO) return 'IN_SCADENZA';
    return 'VALIDO';
}

// ---------- Spese (utilizzo a piu' riprese) ----------
function buoUtilizzi(b) {
    return Array.isArray(b && b.utilizzi) ? b.utilizzi : [];
}
function buoCent(n) { return Math.round((Number(n) || 0) * 100) / 100; }
// Speso: somma delle spese; un vecchio buono "utilizzato" senza spese scritte vale come speso tutto
function buoSpeso(b) {
    const u = buoUtilizzi(b);
    if (u.length) return buoCent(u.reduce((t, x) => t + Number(x.importo || 0), 0));
    return b.utilizzato_at ? buoCent(b.importo) : 0;
}
function buoResiduo(b) {
    return Math.max(0, buoCent(Number(b.importo || 0) - buoSpeso(b)));
}

const BUO_STATI = {
    VALIDO:      { etichetta: 'Valido',       classe: 'buo-st-valido' },
    IN_SCADENZA: { etichetta: 'In scadenza',  classe: 'buo-st-scadenza' },
    SCADUTO:     { etichetta: 'Scaduto',      classe: 'buo-st-scaduto' },
    UTILIZZATO:  { etichetta: 'Utilizzato',   classe: 'buo-st-usato' },
    ANNULLATO:   { etichetta: 'Annullato',    classe: 'buo-st-annullato' }
};

function buoBadge(b) {
    const s = buoStato(b);
    let extra = '';
    if (s === 'IN_SCADENZA') {
        const g = buoGiorniA(b.scadenza);
        extra = g === 0 ? ' (oggi)' : ' (' + g + ' gg)';
    }
    if (s !== 'UTILIZZATO' && s !== 'ANNULLATO' && buoSpeso(b) > 0) extra += ' &middot; usato in parte';
    return '<span class="buo-stato ' + BUO_STATI[s].classe + '">' + BUO_STATI[s].etichetta + extra + '</span>';
}

// ========================================
// CARICAMENTO E SEZIONE
// ========================================
async function buoCarica() {
    const tutti = [];
    let da = 0;
    const passo = 1000;
    for (;;) {
        const { data, error } = await supabaseClient.from('buoni_regalo').select('*')
            .order('anno', { ascending: false }).order('numero', { ascending: false }).range(da, da + passo - 1);
        if (error) throw error;
        tutti.push(...(data || []));
        if (!data || data.length < passo) break;
        da += passo;
    }
    buoBuoni = tutti;
    buoCaricati = true;
}

async function openBuoniRegalo() {
    buoAvviaTempoReale();
    const box = document.getElementById('buo-elenco');
    if (!buoCaricati && box) box.innerHTML = '<div class="buo-vuoto">Caricamento...</div>';
    try {
        await buoCarica();
    } catch (err) {
        if (box) box.innerHTML = '<div class="buo-vuoto">Buoni regalo non disponibili.</div>';
        buoErrore(err, 'lettura buoni');
        return;
    }
    buoPopolaAnni();
    buoRender();
}

function buoPopolaAnni() {
    const sel = document.getElementById('buo-anno');
    if (!sel) return;
    const anni = Array.from(new Set(buoBuoni.map(b => b.anno).concat([new Date().getFullYear()]))).sort((a, b) => b - a);
    sel.innerHTML = '<option value="TUTTI">Tutti gli anni</option>' +
        anni.map(a => '<option value="' + a + '"' + (String(a) === String(buoAnno) ? ' selected' : '') + '>' + a + '</option>').join('');
}

function buoImpostaFiltro(v) { buoFiltro = v; buoRender(); }
function buoImpostaAnno(v) { buoAnno = v; buoRender(); }
function buoCambiaCerca(v) {
    clearTimeout(buoCercaTimer);
    buoCercaTimer = setTimeout(() => { buoCerca = buoNorm(v); buoRender(); }, 200);
}

function buoImpostaTipo(v) { buoFiltroTipo = v; buoRender(); }

function buoFiltrati() {
    return buoBuoni.filter(b => {
        if (buoFiltroTipo !== 'TUTTI' && buoTipo(b) !== buoFiltroTipo) return false;
        if (buoAnno !== 'TUTTI' && String(b.anno) !== String(buoAnno)) return false;
        const s = buoStato(b);
        if (buoFiltro === 'VALIDI' && s !== 'VALIDO' && s !== 'IN_SCADENZA') return false;
        if (buoFiltro !== 'TUTTI' && buoFiltro !== 'VALIDI' && s !== buoFiltro) return false;
        if (buoCerca) {
            const t = buoNorm([buoNumero(b), b.cliente, b.telefono, b.intestato_a, b.note, b.operatore, BUO_TIPI[buoTipo(b)].nome, b.pagamento].join(' '));
            if (!buoCerca.split(' ').every(p => t.indexOf(p) >= 0)) return false;
        }
        return true;
    });
}

function buoRender() {
    const box = document.getElementById('buo-elenco');
    if (!box) return;
    // Riepilogo (segue i filtri tipo e anno): da usare, valore, in scadenza, utilizzati, scaduti non usati
    const base = buoBuoni.filter(b => (buoFiltroTipo === 'TUTTI' || buoTipo(b) === buoFiltroTipo) && (buoAnno === 'TUTTI' || String(b.anno) === String(buoAnno)));
    const somma = l => l.reduce((t, b) => t + buoResiduo(b), 0);   // quello che resta da spendere
    const aperti = base.filter(b => ['VALIDO', 'IN_SCADENZA'].includes(buoStato(b)));
    const inScad = aperti.filter(b => buoStato(b) === 'IN_SCADENZA').length;
    const usati = base.filter(b => buoStato(b) === 'UTILIZZATO');
    const scaduti = base.filter(b => buoStato(b) === 'SCADUTO');
    const spesoTot = base.filter(b => buoStato(b) !== 'ANNULLATO').reduce((t, b) => t + buoSpeso(b), 0);
    const riep = document.getElementById('buo-riepilogo');
    if (riep) {
        riep.innerHTML =
            '<div><span>Da usare</span><strong>' + aperti.length + ' &middot; ' + buoEuro(somma(aperti)) + '</strong></div>' +
            '<div' + (inScad ? ' class="avviso"' : '') + '><span>In scadenza (' + BUO_GIORNI_AVVISO + ' gg)</span><strong>' + inScad + '</strong></div>' +
            '<div><span>Usati del tutto</span><strong>' + usati.length + '</strong></div>' +
            '<div><span>Gi&agrave; speso dai clienti</span><strong>' + buoEuro(spesoTot) + '</strong></div>' +
            '<div' + (scaduti.length ? ' class="avviso"' : '') + '><span>Scaduti non usati</span><strong>' + scaduti.length + ' &middot; ' + buoEuro(somma(scaduti)) + '</strong></div>';
    }

    const lista = buoFiltrati();
    const conta = document.getElementById('buo-conta');
    if (conta) conta.innerHTML = lista.length + (lista.length === 1 ? ' buono' : ' buoni') +
        (lista.length !== buoBuoni.length ? ' su ' + buoBuoni.length : '');
    if (!lista.length) {
        box.innerHTML = '<div class="buo-vuoto">' + (buoBuoni.length ? 'Nessun buono con questi filtri.' :
            'Nessun buono regalo. Usa <strong>&#10133; Nuovo buono</strong> per crearne uno.') + '</div>';
        return;
    }
    box.innerHTML = '<table class="buo-tabella"><thead><tr>' +
        '<th>N.</th><th>EMESSO</th><th>CLIENTE</th><th>TELEFONO</th><th>INTESTATO A</th><th class="buo-n">VALORE</th>' +
        '<th>SCADENZA</th><th>STATO</th><th></th></tr></thead><tbody>' +
        lista.map(b => {
            const s = buoStato(b);
            const tel = String(b.telefono || '').trim();
            return '<tr class="buo-riga st-' + s.toLowerCase() + '" onclick="buoApriModifica(' + b.id + ')">' +
                '<td class="buo-num"><span class="buo-tipo-ico" title="' + BUO_TIPI[buoTipo(b)].nome + '">' + BUO_TIPI[buoTipo(b)].icona + '</span> ' + buoNumero(b) + '</td>' +
                '<td>' + buoDataIt(b.data) + '</td>' +
                '<td><strong>' + buoEsc(b.cliente) + '</strong>' + (b.note ? '<span class="buo-note">' + buoEsc(b.note) + '</span>' : '') + '</td>' +
                '<td>' + (tel ? '<a href="tel:' + buoEsc(tel.replace(/[^\d+]/g, '')) + '" onclick="event.stopPropagation()">' + buoEsc(tel) + '</a>' : '') + '</td>' +
                '<td>' + buoEsc(b.intestato_a || '') + '</td>' +
                '<td class="buo-n">' + (buoSpeso(b) > 0 && s !== 'ANNULLATO' && s !== 'UTILIZZATO'
                    ? '<strong>' + buoEuro(buoResiduo(b)) + '</strong><span class="buo-note">residuo su ' + buoEuro(b.importo) + '</span>'
                    : '<strong>' + buoEuro(b.importo) + '</strong>') +
                    (b.pagamento ? '<span class="buo-note">' + buoEsc(b.pagamento) + '</span>' : '') + '</td>' +
                '<td>' + buoDataIt(b.scadenza) + '</td>' +
                '<td>' + buoBadge(b) + (b.utilizzato_at ? '<span class="buo-note">il ' + buoDataIt(String(b.utilizzato_at).slice(0, 10)) + '</span>' : '') + '</td>' +
                '<td class="buo-az-riga"><button type="button" class="buo-btn-pdf" title="Stampa il buono" onclick="event.stopPropagation(); buoStampa(' + b.id + ')">&#128424;&#65039;</button>' +
                    (b.drive_url ? '<a class="buo-btn-pdf" href="' + buoEsc(b.drive_url) + '" target="_blank" rel="noopener" title="Apri il PDF su Google Drive" onclick="event.stopPropagation()">&#128193;</a>' : '') + '</td>' +
                '</tr>';
        }).join('') + '</tbody></table>';
}

// ========================================
// FINESTRA NUOVO / MODIFICA
// ========================================
function buoApriNuovo() {
    buoApriFinestra(null);
}

function buoApriModifica(id) {
    const b = buoBuoni.find(x => x.id === id);
    if (b) buoApriFinestra(b);
}

function buoApriFinestra(b) {
    buoModifica = b;
    const oggi = buoOggi();
    document.getElementById('buo-f-tipo').value = b ? buoTipo(b) : 'REGALO';
    document.getElementById('buo-modal-titolo').innerHTML = b
        ? BUO_TIPI[buoTipo(b)].icona + ' ' + BUO_TIPI[buoTipo(b)].nome + ' N. ' + buoNumero(b) + ' ' + buoBadge(b)
        : '&#10133; Nuovo buono';
    document.getElementById('buo-f-data').value = b ? b.data : oggi;
    document.getElementById('buo-f-operatore').value = b ? (b.operatore || '') : buoMieIniziali();
    document.getElementById('buo-f-cliente').value = b ? b.cliente : '';
    document.getElementById('buo-f-telefono').value = b ? b.telefono : '';
    document.getElementById('buo-f-intestato').value = b ? (b.intestato_a || '') : '';
    document.getElementById('buo-f-importo').value = b ? String(Number(b.importo).toFixed(2)).replace('.', ',') : '';
    document.getElementById('buo-f-scadenza').value = b ? b.scadenza : buoPiuMesi(oggi, 12);
    document.getElementById('buo-f-note').value = b ? (b.note || '') : '';
    document.getElementById('buo-f-pagamento').value = b && b.pagamento && BUO_PAGAMENTI.includes(b.pagamento) ? b.pagamento : '';
    buoAggiornaDurata();

    // Pulsanti dello stato (solo per un buono gia' salvato)
    const azioni = document.getElementById('buo-f-azioni');
    if (b) {
        const s = buoStato(b);
        let html = '<button type="button" class="btn-back buo-az" onclick="buoStampa(' + b.id + ')">&#128424;&#65039; Stampa buono</button>';
        if (s !== 'ANNULLATO' && s !== 'UTILIZZATO') html += '<button type="button" class="btn-back buo-az buo-az-usa" onclick="buoSegnaUtilizzato()">&#9989; Speso tutto (' + buoEuro(buoResiduo(b)) + ')</button>';
        if (s === 'UTILIZZATO' && !buoUtilizzi(b).length) html += '<button type="button" class="btn-back buo-az" onclick="buoRimettiValido()">&#8617;&#65039; Non ancora utilizzato</button>';
        if (s !== 'ANNULLATO') html += '<button type="button" class="btn-back buo-az buo-az-annulla" onclick="buoAnnulla()">&#10060; Annulla buono</button>';
        else html += '<button type="button" class="btn-back buo-az" onclick="buoRipristina()">&#8617;&#65039; Ripristina</button>';
        html += '<button type="button" class="btn-back buo-az buo-az-annulla" onclick="buoElimina()">&#128465;&#65039; Elimina</button>';
        azioni.innerHTML = html + '<div id="buo-drive-stato" class="buo-drive">' + buoStatoDriveHtml(b) + '</div>';
        azioni.classList.remove('hidden');
    } else {
        azioni.innerHTML = '';
        azioni.classList.add('hidden');
    }
    buoRenderSpese(b);
    buoTipoCambiato();
    document.getElementById('buo-modal').classList.remove('hidden');
    if (!b && !(typeof isMobile === 'function' && isMobile())) setTimeout(() => document.getElementById('buo-f-cliente').focus(), 50);
}

// Tipo scelto nella finestra: testi del pulsante e del campo "Intestato a"
function buoTipoCambiato() {
    const tipo = document.getElementById('buo-f-tipo').value === 'SPESA' ? 'SPESA' : 'REGALO';
    const b = buoModifica;
    document.getElementById('buo-f-salva').innerHTML = b
        ? '&#128190; Salva modifiche' + (buoTipo(b) !== tipo ? ' (diventa ' + BUO_TIPI[tipo].nome.toLowerCase() + ')' : '')
        : BUO_TIPI[tipo].icona + ' Crea e stampa il ' + BUO_TIPI[tipo].nome.toLowerCase();
    document.getElementById('buo-f-intestato-aiuto').innerHTML = tipo === 'SPESA' ? '(chi lo user&agrave;; vuoto = il cliente)' : '(chi riceve il regalo; vuoto = il cliente)';
    document.querySelectorAll('#buo-f-tipo-scelte button').forEach(x => x.classList.toggle('attivo', x.dataset.tipo === tipo));
}

function buoScegliTipo(tipo) {
    document.getElementById('buo-f-tipo').value = tipo;
    buoTipoCambiato();
}

function buoChiudiFinestra() {
    document.getElementById('buo-modal').classList.add('hidden');
    buoModifica = null;
}

function buoScegliDurata(mesi) {
    const data = document.getElementById('buo-f-data').value || buoOggi();
    document.getElementById('buo-f-scadenza').value = buoPiuMesi(data, mesi);
    buoAggiornaDurata();
}

function buoAggiornaDurata() {
    const data = document.getElementById('buo-f-data').value || buoOggi();
    const scad = document.getElementById('buo-f-scadenza').value;
    document.querySelectorAll('#buo-f-durate button').forEach(btn => {
        btn.classList.toggle('attivo', !!scad && buoPiuMesi(data, Number(btn.dataset.mesi)) === scad);
    });
}

async function buoProssimoNumero(anno) {
    const { data, error } = await supabaseClient.from('buoni_regalo').select('numero')
        .eq('anno', anno).order('numero', { ascending: false }).limit(1);
    if (error) throw error;
    return data && data.length ? data[0].numero + 1 : 1;
}

async function buoSalva() {
    const prima = buoModifica;
    const valori = {
        tipo: document.getElementById('buo-f-tipo').value === 'SPESA' ? 'SPESA' : 'REGALO',
        data: document.getElementById('buo-f-data').value || buoOggi(),
        operatore: buoTesto(document.getElementById('buo-f-operatore').value) || null,
        cliente: buoTesto(document.getElementById('buo-f-cliente').value),
        telefono: String(document.getElementById('buo-f-telefono').value || '').trim().replace(/\s+/g, ' '),
        intestato_a: buoTesto(document.getElementById('buo-f-intestato').value) || null,
        importo: buoLeggiImporto(document.getElementById('buo-f-importo').value),
        scadenza: document.getElementById('buo-f-scadenza').value,
        note: buoTesto(document.getElementById('buo-f-note').value) || null,
        pagamento: document.getElementById('buo-f-pagamento').value || null
    };
    const errori = [];
    if (!valori.cliente) errori.push('Scrivi il <strong>nome del cliente</strong>');
    if (!valori.telefono) errori.push('Scrivi il <strong>telefono</strong>');
    if (!valori.importo) errori.push('Scrivi l&#39;<strong>importo</strong> (es. 50 oppure 50,00)');
    if (!valori.pagamento) errori.push('Scegli come &egrave; stato <strong>pagato</strong> il buono');
    if (prima && valori.importo && valori.importo < buoSpeso(prima) - 0.001) errori.push('Il cliente ha gi&agrave; speso <strong>' + buoEuro(buoSpeso(prima)) + '</strong>: l&#39;importo non pu&ograve; essere pi&ugrave; basso');
    if (!valori.scadenza) errori.push('Scegli la <strong>scadenza</strong>');
    else if (valori.scadenza < valori.data) errori.push('La scadenza &egrave; prima della data di emissione');
    if (errori.length) {
        await showCustomAlert(errori.join('<br>'), 'Controlla il buono', '&#9888;&#65039;');
        return;
    }
    const adesso = new Date().toISOString();
    const utente = loggedInUserEmail || null;
    const btn = document.getElementById('buo-f-salva');
    btn.disabled = true;
    let salvato = null;
    try {
        if (prima) {
            // L'anno del numero non cambia anche se si corregge la data
            const { data, error } = await supabaseClient.from('buoni_regalo')
                .update(Object.assign({}, valori, { updated_at: adesso, updated_by: utente }))
                .eq('id', prima.id).select('*').single();
            if (error) throw error;
            salvato = data;
        } else {
            const anno = parseInt(String(valori.data).slice(0, 4), 10) || new Date().getFullYear();
            // Numero progressivo dell'anno (se due salvano insieme riprova)
            for (let tentativo = 0; tentativo < 3 && !salvato; tentativo++) {
                const numero = await buoProssimoNumero(anno);
                const { data, error } = await supabaseClient.from('buoni_regalo')
                    .insert([Object.assign({}, valori, { anno: anno, numero: numero, created_by: utente, updated_by: utente, updated_at: adesso })])
                    .select('*').single();
                if (error) {
                    if (error.code === '23505' && tentativo < 2) continue;
                    throw error;
                }
                salvato = data;
            }
        }
    } catch (err) {
        buoErrore(err, 'salvataggio buono');
        return;
    } finally {
        btn.disabled = false;
    }
    buoChiudiFinestra();
    const i = buoBuoni.findIndex(x => x.id === salvato.id);
    if (i >= 0) buoBuoni[i] = salvato; else buoBuoni.unshift(salvato);
    buoPopolaAnni();
    buoRender();
    // Buono nuovo: subito il PDF da stampare; poi (uno alla volta) il PDF su Drive, che non blocca
    const stampa = prima ? Promise.resolve() : buoStampa(salvato.id);
    Promise.resolve(stampa).catch(() => {}).then(() => buoSalvaSuDrive(salvato.id));
}

async function buoAggiorna(campi, conferma, rifaiPdf) {
    const b = buoModifica;
    if (!b) return;
    if (conferma && !window.confirm(conferma)) return;
    const { data, error } = await supabaseClient.from('buoni_regalo')
        .update(Object.assign({}, campi, { updated_at: new Date().toISOString(), updated_by: loggedInUserEmail || null }))
        .eq('id', b.id).select('*').single();
    if (error) { buoErrore(error, 'aggiornamento buono'); return; }
    const i = buoBuoni.findIndex(x => x.id === b.id);
    if (i >= 0) buoBuoni[i] = data;
    buoApriFinestra(data);
    buoRender();
    if (rifaiPdf) buoSalvaSuDrive(data.id);   // annullato / ripristinato: PDF aggiornato su Drive
}

// ---------- Spese a piu' riprese ----------
// Riquadro nella finestra: valore, speso, residuo, elenco delle spese e modulo per una nuova spesa
function buoRenderSpese(b) {
    const box = document.getElementById('buo-f-spese');
    if (!box) return;
    if (!b) { box.innerHTML = ''; box.classList.add('hidden'); return; }
    const s = buoStato(b);
    const u = buoUtilizzi(b);
    const residuo = buoResiduo(b);
    let html = '<div class="buo-spese-testa">' +
        '<div><span>Valore</span><strong>' + buoEuro(b.importo) + '</strong></div>' +
        '<div><span>Speso</span><strong>' + buoEuro(buoSpeso(b)) + '</strong></div>' +
        '<div class="buo-spese-residuo"><span>Residuo</span><strong>' + buoEuro(residuo) + '</strong></div>' +
    '</div>';
    if (u.length) {
        html += '<table class="buo-spese-tab"><thead><tr><th>DATA</th><th class="buo-n">SPESO</th><th>NOTE</th><th>OP</th><th></th></tr></thead><tbody>' +
            u.map((x, i) => '<tr><td>' + buoDataIt(x.data) + '</td><td class="buo-n"><strong>' + buoEuro(x.importo) + '</strong></td>' +
                '<td>' + buoEsc(x.note || '') + '</td><td>' + buoEsc(x.operatore || '') + '</td>' +
                '<td><button type="button" class="buo-spese-togli" title="Togli questa spesa" onclick="buoTogliSpesa(' + i + ')">&#10006;</button></td></tr>').join('') +
            '</tbody></table>';
    } else if (b.utilizzato_at) {
        html += '<div class="buo-spese-vuoto">Segnato come utilizzato tutto il ' + buoDataIt(String(b.utilizzato_at).slice(0, 10)) + '.</div>';
    } else {
        html += '<div class="buo-spese-vuoto">Nessuna spesa ancora.</div>';
    }
    if (s !== 'ANNULLATO' && residuo > 0) {
        html += '<div class="buo-spese-nuova">' +
            '<div><label for="buo-u-data">Data</label><input type="date" id="buo-u-data" value="' + buoOggi() + '"></div>' +
            '<div><label for="buo-u-importo">Quanto ha speso (&euro;)</label><input type="text" id="buo-u-importo" inputmode="decimal" maxlength="12" autocomplete="off" placeholder="max ' + buoEuroNumero(residuo) + '"></div>' +
            '<div class="buo-spese-nota"><label for="buo-u-note">Note <small>(es. n. scontrino)</small></label><input type="text" id="buo-u-note" maxlength="80" autocomplete="off"></div>' +
            '<button type="button" class="btn-primary buo-spese-btn" onclick="buoRegistraSpesa()">&#10133; Registra spesa</button>' +
        '</div>';
    }
    box.innerHTML = '<div class="buo-spese-titolo">&#128176; Spese del cliente con questo buono</div>' + html;
    box.classList.remove('hidden');
}

// Riga del buono letta di nuovo dal database (se un collega ha appena registrato una spesa non la perdiamo)
async function buoRileggi(id) {
    const { data, error } = await supabaseClient.from('buoni_regalo').select('*').eq('id', id).single();
    if (error) throw error;
    return data;
}

// Salva l'elenco delle spese: a residuo zero il buono diventa UTILIZZATO, altrimenti torna non utilizzato
async function buoSalvaSpese(b, utilizzi) {
    const speso = buoCent(utilizzi.reduce((t, x) => t + Number(x.importo || 0), 0));
    const finito = speso >= buoCent(b.importo) - 0.001;
    let utilizzatoAt = null;
    if (finito) {
        const ultima = utilizzi[utilizzi.length - 1];
        utilizzatoAt = ultima && ultima.data ? new Date(ultima.data + 'T12:00:00').toISOString() : new Date().toISOString();
    }
    const { data, error } = await supabaseClient.from('buoni_regalo')
        .update({ utilizzi: utilizzi, utilizzato_at: utilizzatoAt, updated_at: new Date().toISOString(), updated_by: loggedInUserEmail || null })
        .eq('id', b.id).select('*').single();
    if (error) throw error;
    const i = buoBuoni.findIndex(x => x.id === b.id);
    if (i >= 0) buoBuoni[i] = data;
    buoApriFinestra(data);
    buoRender();
    buoSalvaSuDrive(data.id);   // la copia per il negozio su Drive elenca le spese
    return data;
}

async function buoRegistraSpesa(importoFisso) {
    const b0 = buoModifica;
    if (!b0) return;
    let b;
    try { b = await buoRileggi(b0.id); } catch (err) { buoErrore(err, 'lettura buono'); return; }
    const residuo = buoResiduo(b);
    const data = importoFisso ? buoOggi() : (document.getElementById('buo-u-data').value || buoOggi());
    const importo = importoFisso ? residuo : buoLeggiImporto(document.getElementById('buo-u-importo').value);
    const note = importoFisso ? '' : buoTesto(document.getElementById('buo-u-note').value);
    const errori = [];
    if (buoStato(b) === 'ANNULLATO') errori.push('Il buono &egrave; <strong>annullato</strong>');
    if (residuo <= 0) errori.push('Il buono &egrave; gi&agrave; stato speso tutto');
    if (!importo) errori.push('Scrivi <strong>quanto ha speso</strong> (es. 30 oppure 30,50)');
    else if (importo > residuo + 0.001) errori.push('Ha speso ' + buoEuro(importo) + ' ma sul buono restano solo <strong>' + buoEuro(residuo) + '</strong>');
    if (data > buoOggi()) errori.push('La data della spesa &egrave; nel futuro');
    if (errori.length) { await showCustomAlert(errori.join('<br>'), 'Controlla la spesa', '&#9888;&#65039;'); return; }
    const resta = buoCent(residuo - importo);
    let msg = 'Registrare una spesa di ' + importo.toFixed(2).replace('.', ',') + ' euro sul buono N. ' + buoNumero(b) + '?\n\n' +
        (resta > 0 ? 'Restano ' + resta.toFixed(2).replace('.', ',') + ' euro.' : 'Il buono risulta SPESO TUTTO (utilizzato).');
    if (buoStato(b) === 'SCADUTO') msg += '\n\nAttenzione: il buono e\' SCADUTO il ' + buoDataIt(b.scadenza) + '.';
    if (!window.confirm(msg)) return;
    const nuove = buoUtilizzi(b).concat([{ data: data, importo: importo, note: note || null, operatore: buoMieIniziali() || null, at: new Date().toISOString() }])
        .sort((x, y) => String(x.data).localeCompare(String(y.data)) || String(x.at || '').localeCompare(String(y.at || '')));
    try { await buoSalvaSpese(b, nuove); } catch (err) { buoErrore(err, 'registrazione spesa'); }
}

async function buoTogliSpesa(indice) {
    const b0 = buoModifica;
    if (!b0) return;
    const x = buoUtilizzi(b0)[indice];
    if (!x) return;
    if (!window.confirm('Togliere la spesa di ' + Number(x.importo).toFixed(2).replace('.', ',') + ' euro del ' + buoDataIt(x.data) + '?\n\nL\'importo torna disponibile sul buono.')) return;
    let b;
    try { b = await buoRileggi(b0.id); } catch (err) { buoErrore(err, 'lettura buono'); return; }
    const u = buoUtilizzi(b).slice();
    // stessa spesa anche se nel frattempo l'elenco e' cambiato
    let k = u.findIndex(y => y.at && y.at === x.at);
    if (k < 0) k = u.findIndex(y => y.data === x.data && Number(y.importo) === Number(x.importo));
    if (k < 0) { showCustomAlert('Questa spesa non c&#39;&egrave; pi&ugrave; (forse l&#39;ha gi&agrave; tolta un collega).', 'Buoni', '&#9888;&#65039;'); buoApriFinestra(b); return; }
    u.splice(k, 1);
    try { await buoSalvaSpese(b, u); } catch (err) { buoErrore(err, 'rimozione spesa'); }
}

// "Speso tutto": una spesa di oggi per tutto il residuo
function buoSegnaUtilizzato() {
    return buoRegistraSpesa(true);
}

function buoRimettiValido() {
    buoAggiorna({ utilizzato_at: null, utilizzato_note: null }, 'Il buono torna "non ancora utilizzato"?');
}

function buoAnnulla() {
    const b = buoModifica;
    if (!b) return;
    buoAggiorna({ annullato_at: new Date().toISOString() },
        'Annullare il buono N. ' + buoNumero(b) + '?\n\nIl numero resta usato e il buono si vede come ANNULLATO.', true);
}

function buoRipristina() {
    buoAggiorna({ annullato_at: null }, 'Ripristinare il buono (non piu\' annullato)?', true);
}

async function buoElimina() {
    const b = buoModifica;
    if (!b) return;
    const ultimo = !buoBuoni.some(x => x.anno === b.anno && x.numero > b.numero);
    if (!window.confirm('ELIMINARE definitivamente il buono N. ' + buoNumero(b) + ' di ' + b.cliente + '?\n\n' +
        (b.drive_file_id ? '- Il PDF su Google Drive va nel cestino\n\n' : '') +
        (ultimo ? 'Era l\'ultimo del ' + b.anno + ': il numero ' + b.numero + ' verra\' riusato dal prossimo buono.'
                : 'Attenzione: nella numerazione del ' + b.anno + ' restera\' un buco (manca il ' + b.numero + '). Meglio "Annulla buono".') +
        '\n\nL\'operazione non si puo\' annullare.')) return;
    const { error } = await supabaseClient.from('buoni_regalo').delete().eq('id', b.id);
    if (error) { buoErrore(error, 'eliminazione buono'); return; }
    buoChiudiFinestra();
    buoBuoni = buoBuoni.filter(x => x.id !== b.id);
    buoRender();
    if (b.drive_file_id) {
        try {
            await buoDriveChiama({ azione: 'cestina', fileId: b.drive_file_id });
        } catch (err) {
            showCustomAlert('Buono eliminato, ma il PDF su Drive non &egrave; stato cestinato: cancellalo a mano.<br>' + buoEsc(err.message || err), 'Drive', '&#9888;&#65039;');
        }
    }
}

// ========================================
// IL BUONO DA STAMPARE (PDF A4: buono in alto su mezzo foglio, copia negozio in basso)
// ========================================
function buoHtml(b) {
    const az = (typeof aziendaDati === 'object' && aziendaDati) ? aziendaDati : {};
    const logo = typeof aziendaLogo === 'function' ? aziendaLogo() : 'logo.png';
    const nomeAz = az.ragione_sociale || '';
    const intestato = b.intestato_a || b.cliente;
    const annullato = buoStato(b) === 'ANNULLATO';
    const spesa = buoTipo(b) === 'SPESA';
    // Nomi lunghi: carattere piu' piccolo, cosi' stanno sempre su una riga
    const lungo = String(intestato || '').length;
    const classeNome = lungo > 30 ? ' piccolissimo' : lungo > 22 ? ' piccolo' : '';
    const righeAz = [
        az.indirizzo ? buoEsc(az.indirizzo) : '',
        [az.telefono ? 'Tel. ' + buoEsc(az.telefono) : '', az.telefono_whatsapp ? 'WhatsApp ' + buoEsc(az.telefono_whatsapp) : ''].filter(Boolean).join(' &middot; '),
        [az.email ? buoEsc(az.email) : '', az.sito_web ? buoEsc(az.sito_web) : ''].filter(Boolean).join(' &middot; ')
    ].filter(Boolean);
    return '<div class="buo-foglio' + (spesa ? ' buo-tipo-spesa' : '') + '">' +
        // ---------- PAGINA 1: IL BUONO PER IL CLIENTE ----------
        '<div class="buo-pagina buo-pagina-cliente">' +
        '<div class="buo-meta buo-meta-buono">' +
            '<div class="buo-card">' +
                // Fascia sinistra: logo, regalo, dati dell'azienda
                '<div class="buo-lato">' +
                    '<div class="buo-lato-logo"><img src="' + logo + '" alt=""' + (spesa ? '' : ' class="buo-logo-ricolora"') + '></div>' +
                    (spesa
                        ? '<div class="buo-lato-regalo"><span>&#128722;</span><div>Buona<br>spesa!</div></div>'
                        : '<div class="buo-lato-regalo"><span>&#127873;</span><div>Un pensiero<br>per te</div></div>') +
                    '<div class="buo-lato-condizioni">' + BUO_CONDIZIONI + '</div>' +
                    '<div class="buo-lato-azienda"><strong>' + buoEsc(nomeAz) + '</strong>' +
                        righeAz.map(r => '<div class="buo-una-riga">' + r + '</div>').join('') + '</div>' +
                '</div>' +
                // Nastro rosso tra le due parti, con il fiocco
                '<div class="buo-nastro"></div>' +
                '<div class="buo-fiocco">' + (spesa ? BUO_BORSA_SVG : BUO_FIOCCO_SVG) + '</div>' +
                // Parte destra: titolo, valore, dati del buono
                '<div class="buo-dx">' +
                    '<div class="buo-dx-testa">' +
                        '<div class="buo-titolo">' + BUO_TIPI[buoTipo(b)].nome + '</div>' +
                        '<div class="buo-numero">N. <strong>' + buoNumero(b) + '</strong></div>' +
                    '</div>' +
                    '<div class="buo-valore"><span class="buo-valore-eur">&euro;</span>' + buoEuroNumero(b.importo) + '</div>' +
                    '<div class="buo-campo"><span>Intestato a</span><strong class="buo-nome' + classeNome + '">' + buoEsc(intestato) + '</strong></div>' +
                    '<div class="buo-date">' +
                        '<div class="buo-campo"><span>Emesso il</span><strong>' + buoDataIt(b.data) + '</strong></div>' +
                        '<div class="buo-campo"><span>Valido fino al</span><strong>' + buoDataIt(b.scadenza) + '</strong></div>' +
                    '</div>' +
                    (spesa
                        ? '<div class="buo-spesa-frase">Da utilizzare per i tuoi acquisti nel nostro negozio</div>'
                        : '<div class="buo-dedica"><span>Dedica</span><div></div><div></div></div>') +
                    '<div class="buo-piede">' +
                        '<div class="buo-timbro">Timbro e firma</div>' +
                    '</div>' +
                '</div>' +
                (annullato ? '<div class="buo-annullato">ANNULLATO</div>' : '') +
            '</div>' +
        '</div>' +
        '</div>' +
        // ---------- PAGINA 2: COPIA PER IL NEGOZIO ----------
        '<div class="buo-pagina buo-pagina-negozio">' +
        '<div class="buo-meta buo-meta-copia">' +
            '<div class="buo-copia">' +
                '<div class="buo-copia-testa">' +
                    '<img src="' + logo + '" alt="" class="buo-copia-logo">' +
                    '<div class="buo-copia-titoli"><div class="buo-copia-titolo">' + BUO_TIPI[buoTipo(b)].file + ' N. ' + buoNumero(b) + '</div>' +
                    '<div class="buo-copia-sotto">COPIA PER IL NEGOZIO &middot; ' + buoEsc(nomeAz) + '</div></div>' +
                    '<div class="buo-copia-valore">&euro; ' + buoEuroNumero(b.importo) + '</div>' +
                '</div>' +
                '<table class="buo-copia-tab">' +
                    '<tr><th>Cliente (acquirente)</th><td>' + buoEsc(b.cliente) + '</td><th>Telefono</th><td>' + buoEsc(b.telefono) + '</td></tr>' +
                    '<tr><th>Intestato a</th><td>' + buoEsc(intestato) + '</td><th>Operatore</th><td>' + buoEsc(b.operatore || '') + '</td></tr>' +
                    '<tr><th>Emesso il</th><td>' + buoDataIt(b.data) + '</td><th>Valido fino al</th><td>' + buoDataIt(b.scadenza) + '</td></tr>' +
                    '<tr><th>Pagato con</th><td>' + buoEsc(b.pagamento || '') + '</td><th>Tipo</th><td>' + BUO_TIPI[buoTipo(b)].nome + '</td></tr>' +
                    '<tr><th>Note</th><td colspan="3">' + buoEsc(b.note || '') + '</td></tr>' +
                '</table>' +
                buoCopiaSpeseHtml(b) +
                '<div class="buo-copia-firme">' +
                    '<div><span>Firma del cliente</span></div>' +
                    '<div><span>Utilizzato il ____ / ____ / ________</span></div>' +
                '</div>' +
                (annullato ? '<div class="buo-annullato piccolo">ANNULLATO</div>' : '') +
            '</div>' +
        '</div>' +
        '</div>' +
    '</div>';
}

// Copia per il negozio: spese gia' fatte e residuo
function buoCopiaSpeseHtml(b) {
    const u = buoUtilizzi(b);
    if (!u.length) return '';
    return '<table class="buo-copia-tab buo-copia-spese"><tr><th>Data spesa</th><th>Speso</th><th>Note</th><th>Op.</th></tr>' +
        u.map(x => '<tr><td>' + buoDataIt(x.data) + '</td><td>' + buoEuro(x.importo) + '</td><td>' + buoEsc(x.note || '') + '</td><td>' + buoEsc(x.operatore || '') + '</td></tr>').join('') +
        '<tr class="buo-copia-residuo"><th>Residuo</th><td colspan="3">' + buoEuro(buoResiduo(b)) + ' su ' + buoEuro(b.importo) + '</td></tr></table>';
}

// PDF A4 verticale, senza margini, DUE pagine: ogni .buo-pagina (718 x 1015 px) diventa una pagina intera
// (1 = buono per il cliente, 2 = copia per il negozio).
// formato: 'blob' (per aprirlo / stamparlo) oppure 'base64' (per Drive)
async function buoCreaPdfBlob(b) {
    return buoCreaPdf(b, 'blob');
}

async function buoCreaPdf(b, formato) {
    await pdfCaricaLibrerie();
    const velo = document.createElement('div');
    velo.className = 'pdf-velo';
    velo.innerHTML = '<div>&#8987; Creazione del buono...</div>';
    const foglio = document.createElement('div');
    foglio.className = 'pdf-foglio';
    foglio.innerHTML = buoHtml(b);
    document.body.appendChild(foglio);
    document.body.appendChild(velo);
    const scrollPrima = { x: window.scrollX, y: window.scrollY };
    try {
        const el = foglio.firstElementChild;
        // Logo sulla fascia verde: senza sfondo e con il puntino verde della "i" in rosso
        const daRicolorare = el.querySelector('img.buo-logo-ricolora');
        if (daRicolorare) {
            const nuovo = await buoLogoPuntinoRosso(daRicolorare.getAttribute('src'));
            if (nuovo) daRicolorare.src = nuovo;
        }
        const immagini = Array.from(el.querySelectorAll('img'));
        await Promise.all(immagini.map(img => img.complete ? Promise.resolve() : new Promise(r => { img.onload = r; img.onerror = r; })));
        if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) { /* niente */ } }
        buoStringiUnaRiga(el);
        window.scrollTo(0, 0);
        const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
        const pagine = Array.from(el.querySelectorAll('.buo-pagina'));
        for (let i = 0; i < pagine.length; i++) {
            const canvas = await window.html2canvas(pagine[i], { scale: 2.5, backgroundColor: '#ffffff', useCORS: true, logging: false, scrollX: 0, scrollY: 0 });
            if (i > 0) pdf.addPage('a4', 'portrait');
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.94), 'JPEG', 0, 0, 210, 297);
        }
        pdf.setProperties({ title: BUO_TIPI[buoTipo(b)].nome + ' ' + buoNumero(b) });
        if (formato === 'base64') return String(pdf.output('datauristring')).split(',')[1];
        return pdf.output('blob');
    } finally {
        foglio.remove();
        velo.remove();
        window.scrollTo(scrollPrima.x, scrollPrima.y);
    }
}

// Righe che devono stare su UNA riga (es. indirizzo dell'azienda): carattere piu' piccolo finche' ci stanno
function buoStringiUnaRiga(el) {
    el.querySelectorAll('.buo-una-riga').forEach(r => {
        let px = parseFloat(getComputedStyle(r).fontSize) || 9;
        while (r.scrollWidth > r.clientWidth + 0.5 && px > 5.5) {
            px -= 0.25;
            r.style.fontSize = px + 'px';
        }
    });
}

// Il logo (PNG trasparente) con i pixel VERDI (il puntino della "i") colorati di rosso.
// Restituisce un'immagine data:... oppure null se non si puo' (resta il logo com'e').
const buoLogoCache = {};
function buoLogoPuntinoRosso(src) {
    if (!src) return Promise.resolve(null);
    if (buoLogoCache[src]) return buoLogoCache[src];
    buoLogoCache[src] = new Promise(ok => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            try {
                const c = document.createElement('canvas');
                c.width = img.naturalWidth;
                c.height = img.naturalHeight;
                const ctx = c.getContext('2d');
                ctx.drawImage(img, 0, 0);
                const d = ctx.getImageData(0, 0, c.width, c.height);
                const p = d.data;
                for (let i = 0; i < p.length; i += 4) {
                    const r = p[i], g = p[i + 1], b = p[i + 2];
                    if (p[i + 3] > 0 && g > r + 25 && g > b + 25) {   // verde -> rosso
                        p[i] = 220; p[i + 1] = 38; p[i + 2] = 38;
                    }
                }
                ctx.putImageData(d, 0, 0);
                ok(c.toDataURL('image/png'));
            } catch (e) {
                ok(null);
            }
        };
        img.onerror = () => ok(null);
        img.src = src;
    });
    return buoLogoCache[src];
}

function buoNomeFile(b) {
    const nome = String(b.intestato_a || b.cliente || '').replace(/[^A-Z0-9 ]+/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
    return BUO_TIPI[buoTipo(b)].file + ' ' + String(b.numero).padStart(4, '0') + '-' + b.anno + (nome ? ' ' + nome : '') + '.pdf';
}

// Elenco dei buoni filtrati in Excel (con pagamento e stato)
function buoScaricaExcel() {
    const lista = buoFiltrati();
    if (!lista.length) { showCustomAlert('Nessun buono da scaricare con questi filtri.', 'Buoni', '&#9888;&#65039;'); return; }
    if (typeof XLSX === 'undefined') { showCustomAlert('Libreria Excel non caricata: aggiorna la pagina e riprova.', 'Errore', '&#10060;'); return; }
    const righe = [['TIPO', 'NUMERO', 'EMESSO', 'CLIENTE', 'TELEFONO', 'INTESTATO A', 'IMPORTO', 'SPESO', 'RESIDUO', 'PAGATO CON', 'SCADENZA', 'STATO', 'UTILIZZATO IL', 'SPESE', 'OPERATORE', 'NOTE']];
    lista.forEach(b => righe.push([BUO_TIPI[buoTipo(b)].nome.toUpperCase(), buoNumero(b), buoDataIt(b.data), b.cliente, b.telefono, b.intestato_a || '',
        Number(b.importo), buoSpeso(b), buoResiduo(b), b.pagamento || '', buoDataIt(b.scadenza), BUO_STATI[buoStato(b)].etichetta.toUpperCase(),
        b.utilizzato_at ? buoDataIt(String(b.utilizzato_at).slice(0, 10)) : '',
        buoUtilizzi(b).map(x => buoDataIt(x.data) + ' ' + Number(x.importo).toFixed(2).replace('.', ',')).join('; '),
        b.operatore || '', b.note || '']));
    const tot = lista.reduce((t, b) => t + Number(b.importo || 0), 0);
    const spe = lista.reduce((t, b) => t + buoSpeso(b), 0);
    const res = lista.reduce((t, b) => t + (buoStato(b) === 'ANNULLATO' ? 0 : buoResiduo(b)), 0);
    righe.push([], ['TOTALE', lista.length + ' buoni', '', '', '', '', buoCent(tot), buoCent(spe), buoCent(res)]);
    const ws = XLSX.utils.aoa_to_sheet(righe);
    ws['!cols'] = [14, 10, 11, 24, 14, 24, 11, 11, 11, 13, 11, 13, 13, 30, 9, 30].map(w => ({ wch: w }));
    for (let r = 1; r < righe.length; r++) {
        [6, 7, 8].forEach(col => {
            const c = ws[XLSX.utils.encode_cell({ r: r, c: col })];
            if (c && typeof c.v === 'number') c.z = '#,##0.00 \u20AC';
        });
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'BUONI');
    XLSX.writeFile(wb, 'BUONI_' + buoOggi() + '.xlsx');
}

function buoStampa(id) {
    const b = buoBuoni.find(x => x.id === id);
    if (!b) return Promise.resolve();
    return pdfApriInScheda(() => buoCreaPdfBlob(b), buoNomeFile(b));
}

// ========================================
// PDF SU GOOGLE DRIVE (come gli ordini clienti)
// L'app crea il PDF e lo manda alla Edge Function "buoni-drive", che lo passa allo
// script Google (google/buoni-drive.gs): BUONI REGALO / BUONI REGALO <anno>.
// ========================================
async function buoDriveChiama(corpo) {
    const { data, error } = await supabaseClient.functions.invoke('buoni-drive', { body: corpo });
    if (error) {
        let msg = error.message || String(error);
        try {
            const j = error.context && typeof error.context.json === 'function' ? await error.context.json() : null;
            if (j && j.errore) msg = j.errore;
        } catch (e) { /* niente */ }
        if (/Failed to send|not found|404/i.test(msg)) {
            msg = 'La funzione &quot;buoni-drive&quot; non risponde: va creata su Supabase (vedi GUIDA_BUONI_DRIVE.md). Dettaglio: ' + msg;
        }
        throw new Error(msg);
    }
    if (!data || !data.ok) throw new Error((data && data.errore) || 'Risposta non valida dalla funzione buoni-drive');
    return data;
}

const buoDriveInCorso = {};   // id buono -> true mentre salva
const buoDriveErrore = {};    // id buono -> ultimo errore

async function buoSalvaSuDrive(id) {
    const b = buoBuoni.find(x => x.id === id);
    if (!b || buoDriveInCorso[id]) return;
    buoDriveInCorso[id] = true;
    delete buoDriveErrore[id];
    buoAggiornaStatoDrive(id);
    try {
        const pdf = await buoCreaPdf(b, 'base64');
        const res = await buoDriveChiama({ azione: 'salva', anno: b.anno, nome: buoNomeFile(b), pdf: pdf, fileId: b.drive_file_id || null });
        const agg = { drive_url: res.url, drive_file_id: res.fileId, drive_salvato_at: new Date().toISOString() };
        const { error } = await supabaseClient.from('buoni_regalo').update(agg).eq('id', b.id);
        if (error) throw error;
        Object.assign(b, agg);
    } catch (err) {
        console.error('PDF del buono non salvato su Drive:', err);
        buoDriveErrore[id] = err && err.message ? err.message : String(err);
    } finally {
        delete buoDriveInCorso[id];
        buoAggiornaStatoDrive(id);
        buoRender();
    }
}

function buoDataOra(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return buoPad(d.getDate()) + '/' + buoPad(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + buoPad(d.getHours()) + ':' + buoPad(d.getMinutes());
}

// Riga "PDF su Drive" nella finestra del buono
function buoStatoDriveHtml(b) {
    if (buoDriveInCorso[b.id]) return '&#8987; Salvataggio del PDF su Google Drive...';
    if (buoDriveErrore[b.id]) {
        return '&#10060; PDF non salvato su Drive: ' + buoDriveErrore[b.id] +
            ' <button type="button" class="btn-back buo-az" onclick="buoSalvaSuDrive(' + b.id + ')">&#128260; Riprova</button>';
    }
    if (b.drive_url) {
        return '&#128193; PDF su Google Drive <small>(salvato il ' + buoDataOra(b.drive_salvato_at) + ')</small> ' +
            '<a href="' + buoEsc(b.drive_url) + '" target="_blank" rel="noopener" class="btn-back buo-az">Apri</a> ' +
            '<button type="button" class="btn-back buo-az" onclick="buoSalvaSuDrive(' + b.id + ')">Salva di nuovo</button>';
    }
    return '&#128193; PDF non ancora su Google Drive ' +
        '<button type="button" class="btn-back buo-az" onclick="buoSalvaSuDrive(' + b.id + ')">Salva su Drive</button>';
}

function buoAggiornaStatoDrive(id) {
    if (!buoModifica || buoModifica.id !== id) return;
    const el = document.getElementById('buo-drive-stato');
    const b = buoBuoni.find(x => x.id === id);
    if (el && b) el.innerHTML = buoStatoDriveHtml(b);
}

async function buoProvaDrive() {
    const btn = document.getElementById('buo-prova-drive');
    if (btn) btn.disabled = true;
    try {
        const res = await buoDriveChiama({ azione: 'prova', anno: new Date().getFullYear() });
        await showCustomAlert('Collegamento con Google Drive funzionante.<br><br>Cartella: <strong>' + buoEsc(res.cartella || '') + '</strong>' +
            (res.url ? '<br><a href="' + buoEsc(res.url) + '" target="_blank" rel="noopener">Apri la cartella su Drive</a>' : ''),
            'Drive OK', '&#10004;');
    } catch (err) {
        await showCustomAlert('Il collegamento con Google Drive non funziona:<br><br><strong>' + (err.message || err) + '</strong>' +
            '<br><br>Segui GUIDA_BUONI_DRIVE.md (cartella magazzino-app).', 'Drive', '&#10060;');
    }
    if (btn) btn.disabled = false;
}

// ========================================
// TEMPO REALE
// ========================================
function buoAvviaTempoReale() {
    if (buoCanale || typeof supabaseClient === 'undefined') return;
    try {
        buoCanale = supabaseClient.channel('buoni-regalo')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'buoni_regalo' }, () => {
                if (typeof currentSection === 'undefined' || currentSection !== 'buoni-regalo') { buoCaricati = false; return; }
                clearTimeout(buoAvviaTempoReale._t);
                buoAvviaTempoReale._t = setTimeout(async () => {
                    try { await buoCarica(); buoPopolaAnni(); buoRender(); } catch (e) { /* niente */ }
                }, 500);
            })
            .subscribe();
    } catch (err) {
        console.log('Tempo reale buoni non disponibile:', err);
    }
}

// ========================================
// FUNZIONI USATE DALL'HTML (onclick)
// ========================================
window.openBuoniRegalo = openBuoniRegalo;
window.buoApriNuovo = buoApriNuovo;
window.buoScegliTipo = buoScegliTipo;
window.buoImpostaTipo = buoImpostaTipo;
window.buoScaricaExcel = buoScaricaExcel;
window.buoTipoCambiato = buoTipoCambiato;
window.buoApriModifica = buoApriModifica;
window.buoChiudiFinestra = buoChiudiFinestra;
window.buoSalva = buoSalva;
window.buoScegliDurata = buoScegliDurata;
window.buoAggiornaDurata = buoAggiornaDurata;
window.buoImpostaFiltro = buoImpostaFiltro;
window.buoImpostaAnno = buoImpostaAnno;
window.buoCambiaCerca = buoCambiaCerca;
window.buoStampa = buoStampa;
window.buoSegnaUtilizzato = buoSegnaUtilizzato;
window.buoRegistraSpesa = buoRegistraSpesa;
window.buoTogliSpesa = buoTogliSpesa;
window.buoRimettiValido = buoRimettiValido;
window.buoAnnulla = buoAnnulla;
window.buoRipristina = buoRipristina;
window.buoElimina = buoElimina;
window.buoSalvaSuDrive = buoSalvaSuDrive;
window.buoProvaDrive = buoProvaDrive;
