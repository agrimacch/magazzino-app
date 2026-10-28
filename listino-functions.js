// ========================================
// LISTINO VENDITE - FUNZIONI DEDICATE
// ----------------------------------------
// - Vista listino raggruppata per attrezzo (ordine alfabetico)
// - Filtri: ricerca libera, attrezzo, marchio, alimentazione, tipologia
// - PC: tutte le colonne, netti oscurati di default (occhio nell'intestazione)
// - Mobile: colonne ridotte + pulsante "i" con netto 1 e note 1
// - Import Excel con anteprima delle modifiche e conferma
// - Scalamento automatico netti: netto 1 -> netto 2 -> netto 3
// - Storico completo dei netti (tabella listino_storico_netti)
// - Articoli rimossi dal file -> "Articoli cancellati"
// - Download del listino aggiornato in Excel
// - Notifiche delle modifiche: campanella in app (tempo reale) + Telegram
// Tabelle Supabase: listino_articoli, listino_storico_netti (solo admin)
// ========================================

let listinoArticoli = [];          // tutti gli articoli (attivi + cancellati)
let listinoCaricato = false;
let listinoNettiVisibili = false;  // di default i netti sono nascosti
let listinoImportPlan = null;      // piano di import in attesa di conferma
let listinoImportFileName = '';
let listinoSearchTimeout = null;

// Intestazioni del file Excel -> colonne della tabella Supabase
const LISTINO_COLONNE_EXCEL = {
    'ATTREZZO': 'attrezzo',
    'MARCHIO': 'marchio',
    'ALIMENTAZIONE': 'alimentazione',
    'TIPOLOGIA ALIM': 'tipologia_alimentazione',
    'TIPOLOGIA ALIMENTAZIONE': 'tipologia_alimentazione',
    'MODELLO': 'modello',
    'NOTE': 'note',
    'NETTO 1': 'netto_1',
    'NOTE 1': 'note_1',
    'NETTO 2': 'netto_2',
    'NOTE 2': 'note_2',
    'NETTO 3': 'netto_3',
    'NOTE 3': 'note_3',
    'VENDITA PROMO': 'vendita_promo',
    'SCADENZA PROMO': 'scadenza_promo',
    'VENDITA IN SCATOLA': 'vendita_scatola',
    'VENDITA NO PROMO': 'vendita_no_promo',
    'LISTINO': 'listino'
};

// Ordine e intestazioni usati anche per il download Excel
const LISTINO_CAMPI = [
    { campo: 'attrezzo', titolo: 'ATTREZZO' },
    { campo: 'marchio', titolo: 'MARCHIO' },
    { campo: 'alimentazione', titolo: 'ALIMENTAZIONE' },
    { campo: 'tipologia_alimentazione', titolo: 'TIPOLOGIA ALIM.' },
    { campo: 'modello', titolo: 'MODELLO' },
    { campo: 'note', titolo: 'NOTE' },
    { campo: 'netto_1', titolo: 'NETTO 1' },
    { campo: 'note_1', titolo: 'NOTE 1' },
    { campo: 'netto_2', titolo: 'NETTO 2' },
    { campo: 'note_2', titolo: 'NOTE 2' },
    { campo: 'netto_3', titolo: 'NETTO 3' },
    { campo: 'note_3', titolo: 'NOTE 3' },
    { campo: 'vendita_promo', titolo: 'VENDITA PROMO' },
    { campo: 'scadenza_promo', titolo: 'SCADENZA PROMO' },
    { campo: 'vendita_scatola', titolo: 'VENDITA IN SCATOLA' },
    { campo: 'vendita_no_promo', titolo: 'VENDITA NO PROMO' },
    { campo: 'listino', titolo: 'LISTINO' }
];

const LISTINO_CAMPI_NUMERICI = ['netto_1', 'netto_2', 'netto_3', 'listino'];
const LISTINO_CAMPI_VENDITA_TESTO = ['vendita_promo', 'vendita_scatola', 'vendita_no_promo'];
const LISTINO_CAMPI_FILE = ['attrezzo', 'marchio', 'alimentazione', 'tipologia_alimentazione',
    'modello', 'note', 'vendita_promo', 'scadenza_promo', 'vendita_scatola', 'vendita_no_promo', 'listino'];
const LISTINO_CAMPI_NETTI = ['netto_1', 'note_1', 'netto_2', 'note_2', 'netto_3', 'note_3'];

// ========================================
// UTILITA'
// ========================================
function listinoEsc(valore) {
    if (valore === null || valore === undefined) return '';
    return String(valore)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function listinoPulisciTesto(valore) {
    if (valore === null || valore === undefined) return null;
    const s = String(valore).replace(/\s+/g, ' ').trim().toUpperCase();
    return s === '' ? null : s;
}

function listinoArrotonda(n) {
    return Math.round(Number(n) * 100) / 100;
}

// Converte un testo in numero (gestisce "1.234,50", "1234,5", "€ 359", ecc.)
// Ritorna null se vuoto, NaN se non e' un numero
function listinoParseNumero(valore) {
    if (valore === null || valore === undefined) return null;
    if (typeof valore === 'number') return isFinite(valore) ? listinoArrotonda(valore) : NaN;
    let s = String(valore).replace(/€/g, '').replace(/\s+/g, '').trim();
    if (s === '') return null;
    if (s.indexOf('.') !== -1 && s.indexOf(',') !== -1) {
        s = s.replace(/\./g, '').replace(',', '.');
    } else if (s.indexOf(',') !== -1) {
        s = s.replace(',', '.');
    } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
        s = s.replace(/\./g, '');
    }
    if (!/^-?\d+(\.\d+)?$/.test(s)) return NaN;
    return listinoArrotonda(parseFloat(s));
}

function listinoStessoNumero(a, b) {
    const aVuoto = a === null || a === undefined || a === '';
    const bVuoto = b === null || b === undefined || b === '';
    if (aVuoto || bVuoto) return aVuoto && bVuoto;
    return Math.abs(Number(a) - Number(b)) < 0.005;
}

function listinoStessoTesto(a, b) {
    const x = (a === null || a === undefined) ? '' : String(a);
    const y = (b === null || b === undefined) ? '' : String(b);
    return x === y;
}

function listinoFormatEuro(n) {
    if (n === null || n === undefined || n === '') return '-';
    const num = Number(n);
    if (!isFinite(num)) return listinoEsc(n);
    return '&#8364;&nbsp;' + num.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Le colonne vendita sono testo: se contengono solo un numero lo mostro come prezzo
function listinoFormatVendita(valore) {
    if (valore === null || valore === undefined || valore === '') return '-';
    const s = String(valore).trim();
    if (/^-?\d+(\.\d+)?$/.test(s)) return listinoFormatEuro(parseFloat(s));
    return listinoEsc(s);
}

function listinoVal(valore) {
    return (valore === null || valore === undefined || valore === '') ? '-' : listinoEsc(valore);
}

// Promo scaduta: cerca nel testo di SCADENZA PROMO una data (es. "VOLANTINO FINO 30/11/26",
// "FINO AL 15.02.2027") e la confronta con oggi. Se ci sono piu' date vale l'ultima.
// Senza data (es. "VERIFICA VOL. E CONTR.") la promo non risulta mai scaduta.
function listinoDataScadenza(testo) {
    if (!testo) return null;
    const trovate = String(testo).match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})\b/g);
    if (!trovate) return null;
    const m = trovate[trovate.length - 1].match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})/);
    const giorno = parseInt(m[1], 10);
    const mese = parseInt(m[2], 10);
    let anno = parseInt(m[3], 10);
    if (anno < 100) anno += 2000;
    if (mese < 1 || mese > 12 || giorno < 1 || giorno > 31) return null;
    const d = new Date(anno, mese - 1, giorno, 23, 59, 59);
    if (d.getMonth() !== mese - 1) return null; // data impossibile (es. 31/02)
    return d;
}

function listinoPromoScaduta(testo) {
    const d = listinoDataScadenza(testo);
    return d !== null && d < new Date();
}

function listinoChiave(marchio, modello, note) {
    return [marchio || '', modello || '', note || ''].join('|');
}

function listinoNormalizzaIntestazione(h) {
    return String(h === null || h === undefined ? '' : h)
        .toUpperCase()
        .replace(/\./g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function listinoConfronta(a, b) {
    return String(a || '').localeCompare(String(b || ''), 'it', { numeric: true });
}

function listinoOrdina(articoli) {
    return articoli.slice().sort((a, b) =>
        listinoConfronta(a.attrezzo || 'ZZZ', b.attrezzo || 'ZZZ') ||
        listinoConfronta(a.marchio, b.marchio) ||
        listinoConfronta(a.modello, b.modello) ||
        listinoConfronta(a.note, b.note)
    );
}

// ========================================
// CARICAMENTO DATI DA SUPABASE
// ========================================
async function listinoFetchAll(tabella) {
    // Supabase restituisce al massimo 1000 righe per volta: leggo a blocchi
    let tutti = [];
    let da = 0;
    const blocco = 1000;
    while (true) {
        const { data, error } = await supabaseClient
            .from(tabella)
            .select('*')
            .order('id', { ascending: true })
            .range(da, da + blocco - 1);
        if (error) throw error;
        tutti = tutti.concat(data || []);
        if (!data || data.length < blocco) break;
        da += blocco;
    }
    return tutti;
}

async function loadListino() {
    const container = document.getElementById('listino-container');
    if (container && !listinoCaricato) {
        container.innerHTML = '<div class="card"><p style="text-align:center">&#8987; Caricamento listino...</p></div>';
    }
    try {
        listinoArticoli = await listinoFetchAll('listino_articoli');
        listinoCaricato = true;
    } catch (error) {
        console.error('Errore caricamento listino:', error);
        if (container) {
            container.innerHTML = '<div class="card"><p style="text-align:center">&#10060; Errore caricamento listino: ' +
                listinoEsc(error.message) + '</p></div>';
        }
        return;
    }
    aggiornaContatoriListino();
    applyListinoFilters();
    renderListinoCancellati();
}

function aggiornaContatoriListino() {
    const nCancellati = listinoArticoli.filter(a => !a.attivo).length;
    const tabCancellati = document.getElementById('tab-listino-cancellati-btn');
    if (tabCancellati) {
        tabCancellati.innerHTML = '&#128465; Articoli cancellati' + (nCancellati > 0 ? ' (' + nCancellati + ')' : '');
    }
}

// ========================================
// APERTURA SEZIONE E TAB
// ========================================
async function openListinoVendite() {
    // Ripristina la scelta dell'utente (di default nascosti)
    listinoNettiVisibili = listinoLeggiPreferenza('listinoNettiVisibili');
    listinoStoriciVisibili = listinoLeggiPreferenza('listinoStoriciVisibili');
    applicaVisibilitaNetti();
    switchListinoTab(sessionStorage.getItem('listinoTab') || 'elenco');
    await loadListino();
}

function switchListinoTab(tab) {
    if (['elenco', 'import', 'cancellati', 'storico'].indexOf(tab) === -1) tab = 'elenco';
    sessionStorage.setItem('listinoTab', tab);

    document.querySelectorAll('#tabs-listino .tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.listinoTab === tab);
    });
    document.querySelectorAll('#section-listino-vendite .tab-content').forEach(content => {
        content.classList.toggle('active', content.id === 'tab-listino-' + tab);
    });

    if (tab === 'cancellati') {
        renderListinoCancellati();
    } else if (tab === 'storico') {
        if (listinoStoricoCaricato) renderListinoStorico();
        else loadListinoStorico();
    }

    // La casellina "mostra netti e note" non serve nella scheda Import
    const toolbar = document.getElementById('listino-toolbar');
    if (toolbar) toolbar.classList.toggle('hidden', tab === 'import');
}

// ========================================
// CASELLINE IN ALTO: NETTI E NOTE / NETTO 2 E NETTO 3
// ========================================
// Le scelte vengono ricordate per ogni utente:
// - nel browser (localStorage)
// - sull'account Supabase (user_metadata), cosi' valgono anche su altri dispositivi
// Nomi preferenze: listinoNettiVisibili, listinoStoriciVisibili (di default false)
let listinoStoriciVisibili = false; // colonne netto 2, note 2, netto 3, note 3

function listinoEmailUtente() {
    return (typeof currentUser !== 'undefined' && currentUser && currentUser.email) ? currentUser.email : 'anonimo';
}

function listinoLeggiPreferenza(nome) {
    try {
        const meta = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.user_metadata : null;
        if (meta && typeof meta[nome] === 'boolean') return meta[nome];
    } catch (e) { /* ignora */ }
    try {
        const v = localStorage.getItem(nome + '_' + listinoEmailUtente());
        if (v !== null) return v === 'true';
    } catch (e) { /* ignora */ }
    return false; // di default nascosti
}

function listinoSalvaPreferenza(nome, valore) {
    try {
        localStorage.setItem(nome + '_' + listinoEmailUtente(), String(valore));
    } catch (e) { /* ignora */ }
    if (typeof currentUser !== 'undefined' && currentUser) {
        const dati = {};
        dati[nome] = valore;
        currentUser.user_metadata = Object.assign({}, currentUser.user_metadata, dati);
        try {
            supabaseClient.auth.updateUser({ data: dati })
                .then(({ error }) => {
                    if (error) console.log('Salvataggio preferenza non riuscito:', error.message);
                })
                .catch(err => console.log('Salvataggio preferenza non riuscito:', err));
        } catch (e) {
            console.log('Salvataggio preferenza non riuscito:', e);
        }
    }
}

function applicaVisibilitaNetti() {
    const section = document.getElementById('section-listino-vendite');
    if (section) {
        section.classList.toggle('netti-nascosti', !listinoNettiVisibili);
        section.classList.toggle('storici-nascosti', !listinoStoriciVisibili);
    }
    const toggle = document.getElementById('listino-toggle-netti');
    if (toggle) toggle.checked = listinoNettiVisibili;
    const toggleStorici = document.getElementById('listino-toggle-storici');
    if (toggleStorici) toggleStorici.checked = listinoStoriciVisibili;
}

function impostaNettiVisibili(valore) {
    listinoNettiVisibili = !!valore;
    applicaVisibilitaNetti();
    listinoSalvaPreferenza('listinoNettiVisibili', listinoNettiVisibili);
}

function impostaStoriciVisibili(valore) {
    listinoStoriciVisibili = !!valore;
    applicaVisibilitaNetti();
    listinoSalvaPreferenza('listinoStoriciVisibili', listinoStoriciVisibili);
}

function toggleNettiListino() {
    impostaNettiVisibili(!listinoNettiVisibili);
}

// ========================================
// FILTRI
// ========================================
const LISTINO_FILTRI = [
    { id: 'listino-filter-attrezzo', campo: 'attrezzo', etichetta: 'Tutti gli attrezzi' },
    { id: 'listino-filter-marchio', campo: 'marchio', etichetta: 'Tutti i marchi' },
    { id: 'listino-filter-alimentazione', campo: 'alimentazione', etichetta: 'Tutte le alimentazioni' },
    { id: 'listino-filter-tipologia', campo: 'tipologia_alimentazione', etichetta: 'Tutte le tipologie' }
];

function listinoValoriFiltri() {
    const valori = {};
    LISTINO_FILTRI.forEach(f => {
        const el = document.getElementById(f.id);
        valori[f.campo] = el ? el.value : '';
    });
    return valori;
}

function listinoCorrispondeRicerca(articolo, ricerca) {
    if (!ricerca) return true;
    const testo = [
        articolo.attrezzo, articolo.marchio, articolo.alimentazione, articolo.tipologia_alimentazione,
        articolo.modello, articolo.note, articolo.scadenza_promo, articolo.vendita_promo,
        articolo.vendita_scatola, articolo.vendita_no_promo
    ].filter(Boolean).join(' ').toUpperCase();
    return ricerca.split(' ').every(parola => testo.indexOf(parola) !== -1);
}

function listinoCorrispondeFiltri(articolo, valori, escludiCampo) {
    return LISTINO_FILTRI.every(f => {
        if (f.campo === escludiCampo) return true;
        const v = valori[f.campo];
        return !v || (articolo[f.campo] || '') === v;
    });
}

function popolaFiltriListino(attivi, ricerca, valori) {
    // Filtri "a cascata": ogni menu mostra solo le voci compatibili con gli altri filtri
    LISTINO_FILTRI.forEach(f => {
        const select = document.getElementById(f.id);
        if (!select) return;
        const disponibili = attivi.filter(a =>
            listinoCorrispondeRicerca(a, ricerca) && listinoCorrispondeFiltri(a, valori, f.campo)
        );
        const opzioni = [...new Set(disponibili.map(a => a[f.campo]).filter(Boolean))]
            .sort(listinoConfronta);
        const corrente = valori[f.campo];

        let html = '<option value="">' + f.etichetta + '</option>';
        opzioni.forEach(o => {
            html += '<option value="' + listinoEsc(o) + '">' + listinoEsc(o) + '</option>';
        });
        if (corrente && opzioni.indexOf(corrente) === -1) {
            html += '<option value="' + listinoEsc(corrente) + '">' + listinoEsc(corrente) + '</option>';
        }
        select.innerHTML = html;
        select.value = corrente || '';
    });
}

function applyListinoFilters() {
    if (!listinoCaricato) return;
    const searchEl = document.getElementById('listino-search');
    const ricerca = listinoPulisciTesto(searchEl ? searchEl.value : '') || '';
    const valori = listinoValoriFiltri();

    const attivi = listinoArticoli.filter(a => a.attivo);
    popolaFiltriListino(attivi, ricerca, valori);

    const filtrati = attivi.filter(a =>
        listinoCorrispondeRicerca(a, ricerca) && listinoCorrispondeFiltri(a, valori, null)
    );

    const conteggio = document.getElementById('listino-count');
    if (conteggio) {
        conteggio.textContent = filtrati.length === attivi.length
            ? attivi.length + ' articoli'
            : filtrati.length + ' di ' + attivi.length + ' articoli';
    }

    renderListino(filtrati);
}

function resetListinoFilters() {
    const searchEl = document.getElementById('listino-search');
    if (searchEl) searchEl.value = '';
    LISTINO_FILTRI.forEach(f => {
        const el = document.getElementById(f.id);
        if (el) el.value = '';
    });
    applyListinoFilters();
}

// ========================================
// RENDERING LISTINO
// ========================================
function renderListino(articoli) {
    const container = document.getElementById('listino-container');
    if (!container) return;

    if (listinoArticoli.length === 0) {
        container.innerHTML =
            '<div class="card listino-vuoto">' +
            '<p><strong>&#128203; Il listino &#232; vuoto.</strong></p>' +
            '<p>Vai nella scheda <strong>Import Excel</strong> e carica il tuo file per riempirlo.</p>' +
            '</div>';
        return;
    }

    if (articoli.length === 0) {
        container.innerHTML = '<div class="card"><p style="text-align:center">Nessun articolo trovato con questi filtri</p></div>';
        return;
    }

    // Raggruppa per attrezzo (ordine alfabetico)
    const gruppi = {};
    listinoOrdina(articoli).forEach(a => {
        const g = a.attrezzo || 'SENZA ATTREZZO';
        if (!gruppi[g]) gruppi[g] = [];
        gruppi[g].push(a);
    });

    const nomiGruppi = Object.keys(gruppi).sort((a, b) => {
        if (a === 'SENZA ATTREZZO') return 1;
        if (b === 'SENZA ATTREZZO') return -1;
        return listinoConfronta(a, b);
    });

    let html = '';
    nomiGruppi.forEach(nome => {
        const lista = gruppi[nome];

        // ----- Vista PC: tabella completa -----
        let righe = '';
        lista.forEach(a => {
            righe +=
                '<tr>' +
                '<td>' + listinoVal(a.marchio) + '</td>' +
                '<td>' + listinoVal(a.alimentazione) + '</td>' +
                '<td>' + listinoVal(a.tipologia_alimentazione) + '</td>' +
                '<td><strong>' + listinoVal(a.modello) + '</strong></td>' +
                '<td class="listino-col-note">' + listinoVal(a.note) + '</td>' +
                '<td class="listino-col-netto"><span class="netto-val">' + listinoFormatEuro(a.netto_1) + '</span></td>' +
                '<td class="listino-col-note"><span class="netto-val">' + listinoVal(a.note_1) + '</span></td>' +
                '<td class="listino-col-netto col-storici"><span class="netto-val">' + listinoFormatEuro(a.netto_2) + '</span></td>' +
                '<td class="listino-col-note col-storici"><span class="netto-val">' + listinoVal(a.note_2) + '</span></td>' +
                '<td class="listino-col-netto col-storici"><span class="netto-val">' + listinoFormatEuro(a.netto_3) + '</span></td>' +
                '<td class="listino-col-note col-storici"><span class="netto-val">' + listinoVal(a.note_3) + '</span></td>' +
                '<td class="listino-col-prezzo">' + listinoFormatVendita(a.vendita_promo) + '</td>' +
                '<td class="listino-col-note' + (listinoPromoScaduta(a.scadenza_promo) ? ' listino-scaduta' : '') + '">' +
                    listinoVal(a.scadenza_promo) +
                    (listinoPromoScaduta(a.scadenza_promo) ? '<span class="listino-scaduta-badge">SCADUTA</span>' : '') +
                '</td>' +
                '<td class="listino-col-prezzo">' + listinoFormatVendita(a.vendita_scatola) + '</td>' +
                '<td class="listino-col-prezzo">' + listinoFormatVendita(a.vendita_no_promo) + '</td>' +
                '<td class="listino-col-prezzo"><strong>' + listinoFormatEuro(a.listino) + '</strong></td>' +
                '<td class="listino-col-azioni"><button type="button" class="listino-edit-btn" data-id="' + a.id + '" title="Modifica">&#9997;&#65039;</button></td>' +
                '</tr>';
        });

        // ----- Vista mobile: schede compatte -----
        let schede = '';
        lista.forEach(a => {
            const sotto = [a.alimentazione, a.tipologia_alimentazione].filter(Boolean).map(listinoEsc).join(' &middot; ');
            schede +=
                '<div class="listino-card">' +
                    '<div class="listino-card-top">' +
                        '<div class="listino-card-title">' +
                            '<span class="listino-card-marchio">' + listinoVal(a.marchio) + '</span> ' +
                            '<strong>' + listinoVal(a.modello || a.note) + '</strong>' +
                        '</div>' +
                        '<div class="listino-card-btns">' +
                            '<button type="button" class="listino-edit-btn listino-edit-mobile" data-id="' + a.id + '" title="Modifica">&#9997;&#65039;</button>' +
                            '<button type="button" class="listino-info-btn" data-id="' + a.id + '" title="Informazioni">i</button>' +
                        '</div>' +
                    '</div>' +
                    (sotto ? '<div class="listino-card-sub">' + sotto + '</div>' : '') +
                    (a.note && a.modello ? '<div class="listino-card-note">' + listinoEsc(a.note) + '</div>' : '') +
                    '<div class="listino-card-prezzi">' +
                        '<div class="listino-prezzo"><span>Promo</span><strong>' + listinoFormatVendita(a.vendita_promo) + '</strong></div>' +
                        '<div class="listino-prezzo"><span>No promo</span><strong>' + listinoFormatVendita(a.vendita_no_promo) + '</strong></div>' +
                        '<div class="listino-prezzo"><span>In scatola</span><strong>' + listinoFormatVendita(a.vendita_scatola) + '</strong></div>' +
                        '<div class="listino-prezzo"><span>Listino</span><strong>' + listinoFormatEuro(a.listino) + '</strong></div>' +
                    '</div>' +
                    (a.scadenza_promo
                        ? (listinoPromoScaduta(a.scadenza_promo)
                            ? '<div class="listino-card-scadenza listino-card-scaduta">&#9888;&#65039; PROMO SCADUTA: ' + listinoEsc(a.scadenza_promo) + '</div>'
                            : '<div class="listino-card-scadenza">&#9200; ' + listinoEsc(a.scadenza_promo) + '</div>')
                        : '') +
                '</div>';
        });

        html +=
            '<div class="listino-gruppo">' +
                '<div class="listino-gruppo-header">' +
                    '<h3>' + listinoEsc(nome) + '</h3>' +
                    '<span class="listino-gruppo-count">' + lista.length + (lista.length === 1 ? ' articolo' : ' articoli') + '</span>' +
                '</div>' +
                '<div class="listino-desktop">' +
                    '<div class="table-container">' +
                        '<table class="listino-table">' +
                            '<thead><tr>' +
                                '<th>Marchio</th><th>Alim.</th><th>Tipologia</th><th>Modello</th><th>Note</th>' +
                                '<th class="listino-th-netto">Netto 1</th><th>Note 1</th>' +
                                '<th class="listino-th-netto col-storici">Netto 2</th><th class="col-storici">Note 2</th>' +
                                '<th class="listino-th-netto col-storici">Netto 3</th><th class="col-storici">Note 3</th>' +
                                '<th>Vend. promo</th><th>Scadenza promo</th><th>In scatola</th><th>No promo</th><th>Listino</th><th></th>' +
                            '</tr></thead>' +
                            '<tbody>' + righe + '</tbody>' +
                        '</table>' +
                    '</div>' +
                '</div>' +
                '<div class="listino-mobile">' + schede + '</div>' +
            '</div>';
    });

    container.innerHTML = html;
    applicaVisibilitaNetti();
}

// ========================================
// POP-UP "i" (MOBILE): NETTO 1 + NOTE 1
// ========================================
function openListinoInfo(id) {
    const a = listinoArticoli.find(x => x.id === id);
    if (!a) return;
    document.getElementById('listino-info-titolo').innerHTML =
        listinoVal(a.marchio) + ' <strong>' + listinoVal(a.modello || a.note) + '</strong>';
    document.getElementById('listino-info-sottotitolo').innerHTML =
        listinoEsc([a.attrezzo, a.note].filter(Boolean).join(' - '));
    document.getElementById('listino-info-netto').innerHTML = listinoFormatEuro(a.netto_1);
    document.getElementById('listino-info-note').innerHTML = listinoVal(a.note_1);
    document.getElementById('listino-info-modal').classList.remove('hidden');
}

function closeListinoInfo() {
    document.getElementById('listino-info-modal').classList.add('hidden');
}

// ========================================
// ARTICOLI CANCELLATI
// ========================================
function renderListinoCancellati() {
    const container = document.getElementById('listino-cancellati-container');
    if (!container || !listinoCaricato) return;

    const cancellati = listinoArticoli.filter(a => !a.attivo).sort((a, b) =>
        String(b.data_cancellazione || '').localeCompare(String(a.data_cancellazione || '')) ||
        listinoConfronta(a.attrezzo, b.attrezzo) || listinoConfronta(a.modello, b.modello)
    );

    if (cancellati.length === 0) {
        container.innerHTML = '<div class="card"><p style="text-align:center">Nessun articolo cancellato</p></div>';
        return;
    }

    let righe = '';
    cancellati.forEach(a => {
        const data = a.data_cancellazione ? new Date(a.data_cancellazione).toLocaleDateString('it-IT') : '-';
        righe +=
            '<tr>' +
            '<td>' + data + '</td>' +
            '<td>' + listinoVal(a.attrezzo) + '</td>' +
            '<td>' + listinoVal(a.marchio) + '</td>' +
            '<td><strong>' + listinoVal(a.modello) + '</strong></td>' +
            '<td class="listino-col-note">' + listinoVal(a.note) + '</td>' +
            '<td class="listino-col-netto"><span class="netto-val">' + listinoFormatEuro(a.netto_1) + '</span></td>' +
            '<td class="listino-col-prezzo">' + listinoFormatEuro(a.listino) + '</td>' +
            '<td class="listino-col-azioni"><button type="button" class="listino-restore-btn btn-back" data-id="' + a.id + '">&#9851;&#65039; Ripristina</button></td>' +
            '</tr>';
    });

    container.innerHTML =
        '<div class="card">' +
            '<p class="listino-help">Articoli tolti dal file Excel o spostati qui dall\'app. ' +
            'Puoi ripristinarli con il pulsante, oppure rimetterli nel file: al prossimo caricamento tornano nel listino.</p>' +
            '<div class="table-container">' +
                '<table class="listino-table listino-table-cancellati">' +
                    '<thead><tr><th>Cancellato il</th><th>Attrezzo</th><th>Marchio</th><th>Modello</th><th>Note</th>' +
                    '<th class="listino-th-netto">Netto 1</th>' +
                    '<th>Listino</th><th></th></tr></thead>' +
                    '<tbody>' + righe + '</tbody>' +
                '</table>' +
            '</div>' +
        '</div>';
    applicaVisibilitaNetti();
}

// ========================================
// IMPORT EXCEL - LETTURA FILE
// ========================================
function listinoLeggiCella(ws, r, c) {
    const cell = ws[XLSX.utils.encode_cell({ r: r, c: c })];
    if (!cell || cell.t === 'z' || cell.v === null || cell.v === undefined) return null;
    return cell;
}

// Legge il foglio e restituisce le righe pulite + avvisi
function listinoAnalizzaWorkbook(workbook) {
    const risultato = { righe: [], avvisi: [], errori: [], foglio: '' };

    // Foglio "Elenco_attrezzi" se c'e', altrimenti il primo
    let nomeFoglio = workbook.SheetNames.find(n => listinoNormalizzaIntestazione(n).replace(/[_\s]/g, '') === 'ELENCOATTREZZI');
    if (!nomeFoglio) nomeFoglio = workbook.SheetNames[0];
    risultato.foglio = nomeFoglio;
    const ws = workbook.Sheets[nomeFoglio];
    if (!ws || !ws['!ref']) {
        risultato.errori.push('Il foglio "' + nomeFoglio + '" &#232; vuoto.');
        return risultato;
    }
    const range = XLSX.utils.decode_range(ws['!ref']);

    // Cerca la riga delle intestazioni nelle prime 15 righe
    let rigaIntestazioni = -1;
    let mappa = {};
    for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + 15); r++) {
        const m = {};
        for (let c = range.s.c; c <= range.e.c; c++) {
            const cell = listinoLeggiCella(ws, r, c);
            if (!cell) continue;
            const campo = LISTINO_COLONNE_EXCEL[listinoNormalizzaIntestazione(cell.v)];
            if (campo && m[campo] === undefined) m[campo] = c;
        }
        if (m.modello !== undefined && m.attrezzo !== undefined) {
            rigaIntestazioni = r;
            mappa = m;
            break;
        }
    }

    if (rigaIntestazioni === -1) {
        risultato.errori.push('Non trovo la riga delle intestazioni (servono almeno le colonne ATTREZZO e MODELLO).');
        return risultato;
    }

    const mancanti = LISTINO_CAMPI.filter(c => mappa[c.campo] === undefined).map(c => c.titolo);
    if (mancanti.length > 0) {
        risultato.errori.push('Mancano queste colonne nel file: <strong>' + mancanti.join(', ') + '</strong>');
        return risultato;
    }

    const visti = {};
    for (let r = rigaIntestazioni + 1; r <= range.e.r; r++) {
        const numeroRiga = r + 1;
        const riga = {};

        LISTINO_CAMPI.forEach(({ campo, titolo }) => {
            const cell = listinoLeggiCella(ws, r, mappa[campo]);

            if (LISTINO_CAMPI_NUMERICI.indexOf(campo) !== -1) {
                let valore = null;
                if (cell) {
                    valore = cell.t === 'n' ? listinoArrotonda(cell.v) : listinoParseNumero(cell.v);
                }
                if (typeof valore === 'number' && isNaN(valore)) {
                    risultato.avvisi.push('Riga ' + numeroRiga + ': ' + titolo + ' non &#232; un numero ("' +
                        listinoEsc(cell.v) + '") &#8594; lasciato vuoto');
                    valore = null;
                }
                riga[campo] = valore;
            } else if (LISTINO_CAMPI_VENDITA_TESTO.indexOf(campo) !== -1) {
                // Vendite: se e' un numero lo salvo come numero "pulito" (es. 359),
                // altrimenti il testo cosi' com'e'
                if (!cell) riga[campo] = null;
                else if (cell.t === 'n') riga[campo] = String(listinoArrotonda(cell.v));
                else riga[campo] = listinoPulisciTesto(cell.v);
            } else {
                // Testo. Se nella cella c'e' un numero: se e' una data la scrivo
                // come gg/mm/aa, altrimenti il numero semplice (es. 385)
                if (!cell) riga[campo] = null;
                else if (cell.t === 'n') {
                    if (cell.z && XLSX.SSF.is_date(cell.z)) riga[campo] = XLSX.SSF.format('dd/mm/yy', cell.v);
                    else riga[campo] = String(listinoArrotonda(cell.v));
                }
                else riga[campo] = listinoPulisciTesto(cell.v);
            }
        });

        // Righe vuote (o con solo il "-" del menu a tendina): ignorate
        if (!riga.attrezzo && !riga.modello && !riga.note) continue;

        riga.chiave = listinoChiave(riga.marchio, riga.modello, riga.note);
        riga.riga_excel = numeroRiga;

        if (visti[riga.chiave]) {
            risultato.avvisi.push('Riga ' + numeroRiga + ': doppione della riga ' + visti[riga.chiave] +
                ' (' + listinoEsc([riga.marchio, riga.modello, riga.note].filter(Boolean).join(' ')) + ') &#8594; ignorata');
            continue;
        }
        visti[riga.chiave] = numeroRiga;

        if (!riga.attrezzo) {
            risultato.avvisi.push('Riga ' + numeroRiga + ': manca l\'attrezzo (' +
                listinoEsc([riga.marchio, riga.modello].filter(Boolean).join(' ')) + ') &#8594; finir&#224; in "SENZA ATTREZZO"');
        }

        risultato.righe.push(riga);
    }

    if (risultato.righe.length === 0) {
        risultato.errori.push('Il file non contiene articoli.');
    }

    return risultato;
}

// ========================================
// IMPORT EXCEL - CONFRONTO CON IL LISTINO ATTUALE
// ========================================
function listinoCostruisciPiano(righeFile, articoliDb) {
    const piano = {
        primoCaricamento: articoliDb.length === 0,
        nuovi: [],
        nettiCambiati: [],
        aggiornati: [],
        riattivati: [],
        cancellati: [],
        invariati: 0,
        avvisi: [],
        upserts: [],
        storico: []
    };

    const dbPerChiave = new Map();
    articoliDb.forEach(a => dbPerChiave.set(a.chiave, a));
    const chiaviFile = new Set();
    const origineNuovi = piano.primoCaricamento ? 'IMPORT INIZIALE' : 'NUOVO ARTICOLO';

    righeFile.forEach(r => {
        chiaviFile.add(r.chiave);
        const esistente = dbPerChiave.get(r.chiave);

        if (!esistente) {
            // ARTICOLO NUOVO: prendo anche netto 2 e netto 3 dal file
            const nuovo = { chiave: r.chiave, attivo: true, data_cancellazione: null };
            LISTINO_CAMPI.forEach(({ campo }) => { nuovo[campo] = r[campo]; });
            piano.upserts.push(nuovo);
            piano.nuovi.push(r);

            // Storico: dal piu' vecchio al piu' recente
            [['netto_3', 'note_3'], ['netto_2', 'note_2'], ['netto_1', 'note_1']].forEach(([n, nt]) => {
                if (r[n] !== null) {
                    piano.storico.push({ chiave: r.chiave, modello: r.modello, netto: r[n], note: r[nt], origine: origineNuovi });
                }
            });
            return;
        }

        // ARTICOLO ESISTENTE: dati anagrafici e prezzi di vendita dal file,
        // netti gestiti dall'app (netto 2 e netto 3 del file vengono ignorati)
        const aggiornato = { chiave: r.chiave, attivo: true, data_cancellazione: null };
        LISTINO_CAMPI_FILE.forEach(campo => { aggiornato[campo] = r[campo]; });
        LISTINO_CAMPI_NETTI.forEach(campo => { aggiornato[campo] = esistente[campo]; });

        let nettoCambiato = false;
        if (r.netto_1 !== null) {
            if (esistente.netto_1 === null || esistente.netto_1 === undefined) {
                aggiornato.netto_1 = r.netto_1;
                aggiornato.note_1 = r.note_1;
                nettoCambiato = true;
            } else if (!listinoStessoNumero(esistente.netto_1, r.netto_1)) {
                // SCALAMENTO: netto 2 -> netto 3, netto 1 -> netto 2, nuovo -> netto 1
                aggiornato.netto_3 = esistente.netto_2;
                aggiornato.note_3 = esistente.note_2;
                aggiornato.netto_2 = esistente.netto_1;
                aggiornato.note_2 = esistente.note_1;
                aggiornato.netto_1 = r.netto_1;
                aggiornato.note_1 = r.note_1;
                nettoCambiato = true;
            } else {
                // Stesso netto: aggiorno solo la nota se e' cambiata
                aggiornato.note_1 = r.note_1;
            }
        } else if (esistente.netto_1 !== null && esistente.netto_1 !== undefined) {
            piano.avvisi.push('Riga ' + r.riga_excel + ': NETTO 1 vuoto per ' +
                listinoEsc([r.marchio, r.modello, r.note].filter(Boolean).join(' ')) +
                ' &#8594; mantenuto il netto attuale (' + listinoFormatEuro(esistente.netto_1) + ')');
        } else {
            aggiornato.note_1 = r.note_1;
        }

        if (nettoCambiato) {
            piano.storico.push({ chiave: r.chiave, modello: r.modello, netto: r.netto_1, note: r.note_1, origine: 'AGGIORNAMENTO' });
            piano.nettiCambiati.push({ riga: r, vecchio: esistente.netto_1, nuovo: r.netto_1 });
        }

        const cambiato = LISTINO_CAMPI.some(({ campo }) =>
            LISTINO_CAMPI_NUMERICI.indexOf(campo) !== -1
                ? !listinoStessoNumero(esistente[campo], aggiornato[campo])
                : !listinoStessoTesto(esistente[campo], aggiornato[campo])
        ) || !esistente.attivo;

        if (!esistente.attivo) piano.riattivati.push(r);

        if (cambiato) {
            piano.upserts.push(aggiornato);
            // Per la notifica: quali campi sono cambiati
            r._differenze = listinoNotDifferenze(esistente, aggiornato);
            if (!nettoCambiato && esistente.attivo) piano.aggiornati.push(r);
        } else {
            piano.invariati++;
        }
    });

    // Articoli attivi che non sono piu' nel file -> cancellati
    articoliDb.forEach(a => {
        if (a.attivo && !chiaviFile.has(a.chiave)) piano.cancellati.push(a);
    });

    return piano;
}

// ========================================
// IMPORT EXCEL - SELEZIONE FILE E ANTEPRIMA
// ========================================
function handleListinoFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    listinoImportFileName = file.name;
    const anteprima = document.getElementById('listino-import-anteprima');
    anteprima.classList.remove('hidden');
    anteprima.innerHTML = '<p style="text-align:center">&#8987; Lettura del file in corso...</p>';

    const reader = new FileReader();
    reader.onload = async function (e) {
        try {
            const workbook = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellNF: true });
            const analisi = listinoAnalizzaWorkbook(workbook);

            if (analisi.errori.length > 0) {
                listinoImportPlan = null;
                anteprima.innerHTML =
                    '<div class="listino-box listino-box-errore"><strong>&#10060; Il file non pu&#242; essere importato</strong><br>' +
                    analisi.errori.join('<br>') + '</div>' +
                    '<button type="button" class="btn-secondary listino-btn-annulla" id="listino-import-annulla">Chiudi</button>';
                document.getElementById('listino-import-annulla').addEventListener('click', cancelListinoImport);
                return;
            }

            // Ricarico il listino attuale per confrontarlo con il file
            const articoliDb = await listinoFetchAll('listino_articoli');
            const piano = listinoCostruisciPiano(analisi.righe, articoliDb);
            piano.avvisi = analisi.avvisi.concat(piano.avvisi);
            piano.foglio = analisi.foglio;
            piano.totaleRighe = analisi.righe.length;
            listinoImportPlan = piano;
            renderListinoAnteprima(piano);
        } catch (error) {
            console.error('Errore lettura Excel listino:', error);
            listinoImportPlan = null;
            anteprima.innerHTML =
                '<div class="listino-box listino-box-errore"><strong>&#10060; Errore durante la lettura del file</strong><br>' +
                listinoEsc(error.message) + '</div>' +
                '<button type="button" class="btn-secondary listino-btn-annulla" id="listino-import-annulla">Chiudi</button>';
            document.getElementById('listino-import-annulla').addEventListener('click', cancelListinoImport);
        }
    };
    reader.readAsArrayBuffer(file);
}

function listinoDescrizione(a) {
    return [a.attrezzo, a.marchio, a.modello, a.note].filter(Boolean).map(listinoEsc).join(' &middot; ');
}

function listinoElenco(titolo, voci, aperto) {
    if (voci.length === 0) return '';
    return '<details class="listino-dettagli"' + (aperto ? ' open' : '') + '>' +
        '<summary>' + titolo + ' (' + voci.length + ')</summary>' +
        '<ul>' + voci.map(v => '<li>' + v + '</li>').join('') + '</ul>' +
        '</details>';
}

function renderListinoAnteprima(piano) {
    const anteprima = document.getElementById('listino-import-anteprima');
    const nAttiviPrima = piano.invariati + piano.aggiornati.length + piano.nettiCambiati.length +
        piano.cancellati.length - piano.riattivati.length;
    const tantiCancellati = !piano.primoCaricamento && piano.cancellati.length > 0 &&
        piano.cancellati.length >= Math.max(20, nAttiviPrima * 0.3);
    const nienteDaFare = piano.upserts.length === 0 && piano.cancellati.length === 0;

    let html =
        '<div class="listino-file-info">&#128221; <strong>' + listinoEsc(listinoImportFileName) + '</strong>' +
        ' &middot; foglio "' + listinoEsc(piano.foglio) + '" &middot; ' + piano.totaleRighe + ' articoli nel file</div>';

    if (piano.primoCaricamento) {
        html += '<div class="listino-box listino-box-info"><strong>&#128640; Primo caricamento</strong><br>' +
            'Il listino &#232; vuoto: verranno importati tutti gli articoli del file, con netto 1, netto 2 e netto 3 cos&#236; come sono. ' +
            'Dai prossimi caricamenti aggiorni solo NETTO 1 e NOTE 1: lo scalamento lo fa l\'app.</div>';
    }

    if (tantiCancellati) {
        html += '<div class="listino-box listino-box-errore"><strong>&#9888;&#65039; Attenzione</strong><br>' +
            piano.cancellati.length + ' articoli verrebbero spostati in "Articoli cancellati". ' +
            'Controlla di aver scelto il file giusto prima di confermare.</div>';
    }

    html +=
        '<div class="listino-riepilogo">' +
            '<div class="listino-riepilogo-item"><span>&#10133; Nuovi</span><strong>' + piano.nuovi.length + '</strong></div>' +
            '<div class="listino-riepilogo-item"><span>&#128176; Netti cambiati</span><strong>' + piano.nettiCambiati.length + '</strong></div>' +
            '<div class="listino-riepilogo-item"><span>&#9999;&#65039; Altre modifiche</span><strong>' + piano.aggiornati.length + '</strong></div>' +
            '<div class="listino-riepilogo-item"><span>&#9851;&#65039; Ripristinati</span><strong>' + piano.riattivati.length + '</strong></div>' +
            '<div class="listino-riepilogo-item"><span>&#128465; Cancellati</span><strong>' + piano.cancellati.length + '</strong></div>' +
            '<div class="listino-riepilogo-item"><span>&#10004; Invariati</span><strong>' + piano.invariati + '</strong></div>' +
        '</div>';

    html += listinoElenco('&#128176; Netti cambiati',
        piano.nettiCambiati.map(n => listinoDescrizione(n.riga) + ': <strong>' + listinoFormatEuro(n.vecchio) +
            ' &#8594; ' + listinoFormatEuro(n.nuovo) + '</strong>' + (n.riga.note_1 ? ' (' + listinoEsc(n.riga.note_1) + ')' : '')),
        !piano.primoCaricamento);
    html += listinoElenco('&#10133; Nuovi articoli', piano.primoCaricamento ? [] : piano.nuovi.map(listinoDescrizione), true);
    html += listinoElenco('&#9999;&#65039; Altre modifiche (descrizioni o prezzi di vendita)', piano.aggiornati.map(listinoDescrizione), false);
    html += listinoElenco('&#9851;&#65039; Tornano nel listino', piano.riattivati.map(listinoDescrizione), true);
    html += listinoElenco('&#128465; Vanno in "Articoli cancellati"', piano.cancellati.map(listinoDescrizione), true);
    html += listinoElenco('&#9888;&#65039; Avvisi', piano.avvisi, true);

    if (nienteDaFare) {
        html += '<div class="listino-box listino-box-info">&#10004; Il listino &#232; gi&#224; aggiornato: non c\'&#232; nulla da importare.</div>' +
            '<div class="listino-import-azioni">' +
            '<button type="button" class="btn-secondary listino-btn-annulla" id="listino-import-annulla">Chiudi</button></div>';
    } else {
        html += '<div class="listino-import-azioni">' +
            '<button type="button" class="btn-primary" id="listino-import-conferma">&#128229; CONFERMA IMPORT</button>' +
            '<button type="button" class="btn-secondary listino-btn-annulla" id="listino-import-annulla">Annulla</button>' +
            '</div>';
    }

    anteprima.innerHTML = html;
    document.getElementById('listino-import-annulla').addEventListener('click', cancelListinoImport);
    const btnConferma = document.getElementById('listino-import-conferma');
    if (btnConferma) btnConferma.addEventListener('click', confirmListinoImport);
}

function cancelListinoImport() {
    listinoImportPlan = null;
    listinoImportFileName = '';
    const input = document.getElementById('listino-file-input');
    if (input) input.value = '';
    const anteprima = document.getElementById('listino-import-anteprima');
    if (anteprima) {
        anteprima.innerHTML = '';
        anteprima.classList.add('hidden');
    }
}

// ========================================
// IMPORT EXCEL - SCRITTURA SU SUPABASE
// ========================================
async function confirmListinoImport() {
    const piano = listinoImportPlan;
    if (!piano) return;

    const btn = document.getElementById('listino-import-conferma');
    const btnAnnulla = document.getElementById('listino-import-annulla');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '&#8987; Importazione in corso...';
    }
    if (btnAnnulla) btnAnnulla.disabled = true;

    const utente = currentUser ? currentUser.email : null;
    const idPerChiave = {};

    try {
        // 1. Inserisce i nuovi e aggiorna gli esistenti (a blocchi)
        for (let i = 0; i < piano.upserts.length; i += 200) {
            const blocco = piano.upserts.slice(i, i + 200);
            const { data, error } = await supabaseClient
                .from('listino_articoli')
                .upsert(blocco, { onConflict: 'chiave' })
                .select('id, chiave');
            if (error) throw error;
            (data || []).forEach(d => { idPerChiave[d.chiave] = d.id; });
        }

        // 2. Storico netti
        const storico = piano.storico
            .filter(s => idPerChiave[s.chiave])
            .map(s => ({
                articolo_id: idPerChiave[s.chiave],
                modello: s.modello,
                netto: s.netto,
                note: s.note,
                origine: s.origine,
                utente: utente
            }));
        for (let i = 0; i < storico.length; i += 500) {
            const { error } = await supabaseClient
                .from('listino_storico_netti')
                .insert(storico.slice(i, i + 500));
            if (error) throw error;
        }

        // 3. Articoli non piu' presenti nel file -> cancellati
        const idCancellati = piano.cancellati.map(a => a.id);
        const adesso = new Date().toISOString();
        for (let i = 0; i < idCancellati.length; i += 200) {
            const { error } = await supabaseClient
                .from('listino_articoli')
                .update({ attivo: false, data_cancellazione: adesso })
                .in('id', idCancellati.slice(i, i + 200));
            if (error) throw error;
        }
    } catch (error) {
        console.error('Errore import listino:', error);
        await showCustomAlert(
            'L\'import si &#232; interrotto per un errore:<br><br><strong>' + listinoEsc(error.message) + '</strong><br><br>' +
            'Ricarica il file e riprova: l\'anteprima ti mostrer&#224; cosa manca ancora.',
            'Errore Import',
            '&#10060;'
        );
        cancelListinoImport();
        await loadListino();
        return;
    }

    const messaggio =
        'Nuovi articoli: <strong>' + piano.nuovi.length + '</strong><br>' +
        'Netti cambiati: <strong>' + piano.nettiCambiati.length + '</strong><br>' +
        'Altre modifiche: <strong>' + piano.aggiornati.length + '</strong><br>' +
        'Ripristinati: <strong>' + piano.riattivati.length + '</strong><br>' +
        'Spostati in cancellati: <strong>' + piano.cancellati.length + '</strong>';

    // Notifica (campanella + Telegram): un solo messaggio di riepilogo
    listinoRegistraNotifica('IMPORT', 'Import Excel: ' + (listinoImportFileName || 'file'), listinoNotRigheImport(piano), null);

    cancelListinoImport();
    listinoStoricoCaricato = false; // lo storico verra' ricaricato quando si apre la scheda
    await loadListino();
    await showCustomAlert(messaggio, 'Import Completato', '&#10004;');
    switchListinoTab('elenco');
}

// ========================================
// DOWNLOAD LISTINO IN EXCEL
// ========================================
// Il file scaricato ha: prima riga bloccata, filtri su tutte le colonne,
// intestazioni colorate e prezzi in formato euro (libreria ExcelJS, caricata
// solo quando serve). Se ExcelJS non si carica, scarica comunque il file
// con i filtri (senza riga bloccata).
const LISTINO_EXCELJS_URL = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
const LISTINO_COLONNE_LARGHE = ['note', 'note_1', 'note_2', 'note_3', 'scadenza_promo', 'vendita_no_promo'];

function listinoCaricaExcelJS() {
    return new Promise((resolve, reject) => {
        if (window.ExcelJS) return resolve(window.ExcelJS);
        const script = document.createElement('script');
        script.src = LISTINO_EXCELJS_URL;
        script.onload = () => window.ExcelJS ? resolve(window.ExcelJS) : reject(new Error('ExcelJS non disponibile'));
        script.onerror = () => reject(new Error('Impossibile caricare ExcelJS'));
        document.head.appendChild(script);
    });
}

function listinoRigheExport() {
    return listinoOrdina(listinoArticoli.filter(a => a.attivo)).map(a =>
        LISTINO_CAMPI.map(({ campo }) => {
            const v = a[campo];
            if (v === null || v === undefined || v === '') return null;
            if (LISTINO_CAMPI_NUMERICI.indexOf(campo) !== -1) return Number(v);
            if (LISTINO_CAMPI_VENDITA_TESTO.indexOf(campo) !== -1 && /^-?\d+(\.\d+)?$/.test(String(v))) return Number(v);
            return v;
        })
    );
}

function listinoNomeFileExport() {
    const oggi = new Date();
    const data = oggi.getFullYear() + '-' + String(oggi.getMonth() + 1).padStart(2, '0') + '-' + String(oggi.getDate()).padStart(2, '0');
    return 'LISTINO_AGRIMACCH_' + data + '.xlsx';
}

async function listinoCreaExcelFormattato(ExcelJS, righe) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Elenco_attrezzi', {
        views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }]
    });

    ws.columns = LISTINO_CAMPI.map(({ campo, titolo }) => ({
        header: titolo,
        key: campo,
        width: LISTINO_COLONNE_LARGHE.indexOf(campo) !== -1 ? 26 : (campo === 'attrezzo' || campo === 'modello' ? 20 : 15)
    }));

    righe.forEach(r => ws.addRow(r));

    // Intestazione: grassetto, sfondo verde, testo bianco
    const intestazione = ws.getRow(1);
    intestazione.height = 22;
    intestazione.eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF688E53' } };
        cell.alignment = { vertical: 'middle' };
    });

    // Prezzi in formato euro
    const formatoEuro = '#,##0.00 "€"';
    LISTINO_CAMPI.forEach(({ campo }, i) => {
        if (LISTINO_CAMPI_NUMERICI.indexOf(campo) !== -1 || LISTINO_CAMPI_VENDITA_TESTO.indexOf(campo) !== -1) {
            ws.getColumn(i + 1).numFmt = formatoEuro;
        }
    });

    // Filtri su tutte le colonne
    ws.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: LISTINO_CAMPI.length }
    };

    return wb.xlsx.writeBuffer();
}

function listinoScaricaBlob(blob, nomeFile) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = nomeFile;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function downloadListinoExcel() {
    const righe = listinoRigheExport();
    if (righe.length === 0) {
        showCustomAlert('Il listino &#232; vuoto: non c\'&#232; nulla da scaricare.', 'Attenzione', '&#9888;&#65039;');
        return;
    }

    const btn = document.getElementById('listino-btn-download');
    const testoBtn = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '&#8987; Preparazione file...';
    }

    try {
        const ExcelJS = await listinoCaricaExcelJS();
        const buffer = await listinoCreaExcelFormattato(ExcelJS, righe);
        listinoScaricaBlob(
            new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
            listinoNomeFileExport()
        );
    } catch (error) {
        // Riserva: file semplice con i filtri (senza riga bloccata)
        console.log('ExcelJS non disponibile, uso il file semplice:', error);
        const ws = XLSX.utils.aoa_to_sheet([LISTINO_CAMPI.map(c => c.titolo)].concat(righe));
        ws['!cols'] = LISTINO_CAMPI.map(({ campo }) => ({ wch: LISTINO_COLONNE_LARGHE.indexOf(campo) !== -1 ? 24 : 14 }));
        ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: righe.length, c: LISTINO_CAMPI.length - 1 } }) };
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Elenco_attrezzi');
        XLSX.writeFile(wb, listinoNomeFileExport());
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = testoBtn;
        }
    }
}

// ========================================
// MODIFICA / NUOVO / CANCELLA / RIPRISTINA DALL'APP
// ========================================
// Regola: prima di lavorare sull'Excel scaricare sempre il listino aggiornato,
// cosi' le modifiche fatte dall'app non vengono sovrascritte dal file.
let listinoArticoloInModifica = null; // null = nuovo articolo

const LISTINO_CAMPI_FORM = [
    'attrezzo', 'marchio', 'alimentazione', 'tipologia_alimentazione', 'modello', 'note',
    'netto_1', 'note_1', 'vendita_promo', 'scadenza_promo', 'vendita_scatola', 'vendita_no_promo', 'listino'
];

function listinoFormEl(campo) {
    return document.getElementById('listino-edit-' + campo.replace(/_/g, '-'));
}

function listinoNumeroPerForm(v) {
    if (v === null || v === undefined || v === '') return '';
    return String(v).replace('.', ',');
}

function popolaSuggerimentiListino() {
    // Suggerimenti (menu a tendina sui campi) presi dai valori gia' presenti nel listino
    [['attrezzo', 'listino-sugg-attrezzo'], ['marchio', 'listino-sugg-marchio'],
     ['alimentazione', 'listino-sugg-alimentazione'], ['tipologia_alimentazione', 'listino-sugg-tipologia']]
        .forEach(([campo, id]) => {
            const lista = document.getElementById(id);
            if (!lista) return;
            const valori = [...new Set(listinoArticoli.map(a => a[campo]).filter(Boolean))].sort(listinoConfronta);
            lista.innerHTML = valori.map(v => '<option value="' + listinoEsc(v) + '"></option>').join('');
        });
}

function openListinoEdit(id) {
    const a = id ? listinoArticoli.find(x => x.id === id) : null;
    if (id && !a) return;
    listinoArticoloInModifica = a;

    popolaSuggerimentiListino();

    document.getElementById('listino-edit-titolo').innerHTML = a ? '&#9997;&#65039; Modifica articolo' : '&#10133; Nuovo articolo';

    LISTINO_CAMPI_FORM.forEach(campo => {
        const el = listinoFormEl(campo);
        if (!el) return;
        const v = a ? a[campo] : null;
        if (campo === 'netto_1' || campo === 'listino' ||
            (LISTINO_CAMPI_VENDITA_TESTO.indexOf(campo) !== -1 && /^-?\d+(\.\d+)?$/.test(String(v)))) {
            el.value = listinoNumeroPerForm(v);
        } else {
            el.value = v || '';
        }
    });

    // Netti precedenti: solo lettura (li gestisce l'app con lo scalamento)
    const precedenti = document.getElementById('listino-edit-precedenti');
    if (a && (a.netto_2 !== null || a.netto_3 !== null)) {
        precedenti.innerHTML =
            '<strong>Netti precedenti</strong> (si aggiornano da soli quando cambi il netto 1)<br>' +
            'Netto 2: ' + listinoFormatEuro(a.netto_2) + (a.note_2 ? ' (' + listinoEsc(a.note_2) + ')' : '') + '<br>' +
            'Netto 3: ' + listinoFormatEuro(a.netto_3) + (a.note_3 ? ' (' + listinoEsc(a.note_3) + ')' : '');
        precedenti.classList.remove('hidden');
    } else {
        precedenti.innerHTML = '';
        precedenti.classList.add('hidden');
    }

    document.getElementById('listino-edit-cancella').classList.toggle('hidden', !a);
    document.getElementById('listino-edit-modal').classList.remove('hidden');
}

function closeListinoEdit() {
    document.getElementById('listino-edit-modal').classList.add('hidden');
    listinoArticoloInModifica = null;
    // Se nel frattempo un altro utente ha modificato il listino, ricarico adesso
    if (listinoDaAggiornare) {
        listinoDaAggiornare = false;
        listinoAggiornaDaRemoto();
    }
}

async function saveListinoEdit(e) {
    e.preventDefault();
    const a = listinoArticoloInModifica;
    const dati = {};
    const errori = [];

    LISTINO_CAMPI_FORM.forEach(campo => {
        const el = listinoFormEl(campo);
        const grezzo = el ? el.value : '';
        if (campo === 'netto_1' || campo === 'listino') {
            const n = listinoParseNumero(grezzo);
            if (typeof n === 'number' && isNaN(n)) {
                errori.push((campo === 'netto_1' ? 'Netto 1' : 'Listino') + ' non &#232; un numero valido');
                dati[campo] = null;
            } else {
                dati[campo] = n;
            }
        } else if (LISTINO_CAMPI_VENDITA_TESTO.indexOf(campo) !== -1) {
            const n = listinoParseNumero(grezzo);
            dati[campo] = (typeof n === 'number' && !isNaN(n)) ? String(n) : listinoPulisciTesto(grezzo);
        } else {
            dati[campo] = listinoPulisciTesto(grezzo);
        }
    });

    if (!dati.attrezzo) errori.push('Inserisci l\'attrezzo');
    if (!dati.modello && !dati.note) errori.push('Inserisci almeno il modello (o le note)');

    dati.chiave = listinoChiave(dati.marchio, dati.modello, dati.note);
    const doppione = listinoArticoli.find(x => x.chiave === dati.chiave && (!a || x.id !== a.id));
    if (doppione) {
        errori.push('Esiste gi&#224; un articolo con stesso marchio, modello e note' +
            (doppione.attivo ? '' : ' (&#232; tra gli articoli cancellati: ripristinalo da l&#236;)'));
    }

    if (errori.length > 0) {
        await showCustomAlert(errori.join('<br>'), 'Controlla i dati', '&#9888;&#65039;');
        return;
    }

    const utente = currentUser ? currentUser.email : null;
    const storico = [];
    let notifica = null; // { tipo, righe, articolo } da registrare dopo il salvataggio
    const btn = document.getElementById('listino-edit-salva');
    btn.disabled = true;

    try {
        if (!a) {
            // NUOVO ARTICOLO
            const nuovo = Object.assign({ netto_2: null, note_2: null, netto_3: null, note_3: null, attivo: true, data_cancellazione: null }, dati);
            const { data, error } = await supabaseClient.from('listino_articoli').insert([nuovo]).select('id').single();
            if (error) throw error;
            if (dati.netto_1 !== null) {
                storico.push({ articolo_id: data.id, modello: dati.modello, netto: dati.netto_1, note: dati.note_1, origine: 'NUOVO ARTICOLO', utente: utente });
            }
            const articoloNuovo = Object.assign({}, nuovo, { id: data.id });
            notifica = { tipo: 'NUOVO', righe: listinoNotRigheNuovo(articoloNuovo), articolo: articoloNuovo };
        } else {
            // MODIFICA: se il netto 1 cambia scala netto 1 -> 2 -> 3, come con l'Excel
            const agg = Object.assign({}, dati);
            if (dati.netto_1 !== null && a.netto_1 !== null && a.netto_1 !== undefined && !listinoStessoNumero(a.netto_1, dati.netto_1)) {
                agg.netto_3 = a.netto_2;
                agg.note_3 = a.note_2;
                agg.netto_2 = a.netto_1;
                agg.note_2 = a.note_1;
                storico.push({ articolo_id: a.id, modello: dati.modello, netto: dati.netto_1, note: dati.note_1, origine: 'MODIFICA APP', utente: utente });
            } else if (dati.netto_1 !== null && (a.netto_1 === null || a.netto_1 === undefined)) {
                storico.push({ articolo_id: a.id, modello: dati.modello, netto: dati.netto_1, note: dati.note_1, origine: 'MODIFICA APP', utente: utente });
            } else if (dati.netto_1 === null && a.netto_1 !== null && a.netto_1 !== undefined) {
                // Netto 1 cancellato dal campo: si tiene quello attuale
                agg.netto_1 = a.netto_1;
            }
            const { error } = await supabaseClient.from('listino_articoli').update(agg).eq('id', a.id);
            if (error) throw error;

            const articoloDopo = Object.assign({}, a, agg);
            const differenze = listinoNotDifferenze(a, articoloDopo);
            if (differenze.length > 0) {
                notifica = { tipo: 'MODIFICA', righe: differenze, articolo: articoloDopo };
            }
        }

        if (storico.length > 0) {
            const { error } = await supabaseClient.from('listino_storico_netti').insert(storico);
            if (error) throw error;
        }
    } catch (error) {
        console.error('Errore salvataggio articolo listino:', error);
        btn.disabled = false;
        await showCustomAlert('Errore durante il salvataggio:<br>' + listinoEsc(error.message), 'Errore', '&#10060;');
        return;
    }

    // Notifica (campanella + Telegram). Se non e' cambiato nulla non si manda niente.
    if (notifica) {
        listinoRegistraNotifica(notifica.tipo, listinoNotNome(notifica.articolo), notifica.righe, notifica.articolo);
    }

    btn.disabled = false;
    closeListinoEdit();
    listinoStoricoCaricato = false;
    await loadListino();
    await showCustomAlert(
        (a ? 'Articolo modificato.' : 'Articolo aggiunto.') +
        '<br><br>Ricorda: prima di lavorare sul tuo Excel scarica il listino aggiornato dalla scheda Import Excel.',
        'Salvato', '&#10004;'
    );
}

async function spostaInCancellatiListino() {
    const a = listinoArticoloInModifica;
    if (!a) return;
    const nome = [a.marchio, a.modello, a.note].filter(Boolean).join(' ');
    if (!window.confirm('Spostare "' + nome + '" negli articoli cancellati?\n\nPotrai ripristinarlo in qualsiasi momento.')) return;

    const { error } = await supabaseClient
        .from('listino_articoli')
        .update({ attivo: false, data_cancellazione: new Date().toISOString() })
        .eq('id', a.id);
    if (error) {
        await showCustomAlert('Errore:<br>' + listinoEsc(error.message), 'Errore', '&#10060;');
        return;
    }
    listinoRegistraNotifica('CANCELLATO', listinoNotNome(a), [], a);
    closeListinoEdit();
    await loadListino();
}

async function ripristinaListino(id) {
    const a = listinoArticoli.find(x => x.id === id);
    if (!a) return;
    const { error } = await supabaseClient
        .from('listino_articoli')
        .update({ attivo: true, data_cancellazione: null })
        .eq('id', id);
    if (error) {
        await showCustomAlert('Errore:<br>' + listinoEsc(error.message), 'Errore', '&#10060;');
        return;
    }
    listinoRegistraNotifica('RIPRISTINATO', listinoNotNome(a), [], a);
    await loadListino();
}

// ========================================
// STORICO NETTI (tutti i netti e le note, per macchina)
// ========================================
let listinoStorico = [];
let listinoStoricoCaricato = false;
let listinoStoricoSearchTimeout = null;

const LISTINO_ORIGINI = {
    'IMPORT INIZIALE': 'Import iniziale',
    'AGGIORNAMENTO': 'Aggiornamento',
    'NUOVO ARTICOLO': 'Nuovo articolo',
    'MODIFICA APP': 'Modifica da app'
};

function listinoOrigineTesto(origine) {
    return LISTINO_ORIGINI[origine] || origine || '-';
}

function listinoDataBreve(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
}

function listinoEuroTesto(n) {
    if (n === null || n === undefined || n === '') return '-';
    return '€ ' + Number(n).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function listinoTitoloArticolo(a) {
    return [a.attrezzo, a.marchio, a.modello, a.note].filter(Boolean).join(' - ') || 'ARTICOLO';
}

async function loadListinoStorico() {
    const container = document.getElementById('listino-storico-container');
    if (container) {
        container.innerHTML = '<div class="card"><p style="text-align:center">&#8987; Caricamento storico netti...</p></div>';
    }
    try {
        if (!listinoCaricato) {
            listinoArticoli = await listinoFetchAll('listino_articoli');
            listinoCaricato = true;
        }
        listinoStorico = await listinoFetchAll('listino_storico_netti');
        listinoStoricoCaricato = true;
    } catch (error) {
        console.error('Errore caricamento storico netti:', error);
        if (container) {
            container.innerHTML = '<div class="card"><p style="text-align:center">&#10060; Errore caricamento storico: ' +
                listinoEsc(error.message) + '</p></div>';
        }
        return;
    }
    renderListinoStorico();
}

// Raggruppa lo storico per macchina, applicando la ricerca della scheda Storico
function listinoStoricoGruppi() {
    const searchEl = document.getElementById('listino-storico-search');
    const ricerca = listinoPulisciTesto(searchEl ? searchEl.value : '') || '';

    const articoliPerId = new Map();
    listinoArticoli.forEach(a => articoliPerId.set(a.id, a));

    const perArticolo = new Map();
    listinoStorico.forEach(s => {
        if (!perArticolo.has(s.articolo_id)) perArticolo.set(s.articolo_id, []);
        perArticolo.get(s.articolo_id).push(s);
    });

    const gruppi = [];
    perArticolo.forEach((voci, id) => {
        const articolo = articoliPerId.get(id) || { id: id, modello: voci[0].modello, attivo: true };
        if (!listinoCorrispondeRicerca(articolo, ricerca)) return;
        // Dal piu' recente al piu' vecchio
        voci.sort((x, y) => y.id - x.id);
        gruppi.push({ articolo: articolo, voci: voci });
    });

    const ordinati = listinoOrdina(gruppi.map(g => g.articolo));
    const posizione = new Map();
    ordinati.forEach((a, i) => posizione.set(a.id, i));
    gruppi.sort((a, b) => posizione.get(a.articolo.id) - posizione.get(b.articolo.id));
    return gruppi;
}

function renderListinoStorico() {
    const container = document.getElementById('listino-storico-container');
    const conteggio = document.getElementById('listino-storico-count');
    if (!container) return;

    if (listinoStorico.length === 0) {
        if (conteggio) conteggio.textContent = '';
        container.innerHTML = '<div class="card"><p style="text-align:center">Lo storico &#232; vuoto: si riempie a ogni caricamento del file Excel.</p></div>';
        return;
    }

    const gruppi = listinoStoricoGruppi();
    const totaleVoci = gruppi.reduce((s, g) => s + g.voci.length, 0);
    if (conteggio) {
        conteggio.textContent = gruppi.length + (gruppi.length === 1 ? ' macchina' : ' macchine') +
            ' · ' + totaleVoci + ' netti registrati';
    }

    if (gruppi.length === 0) {
        container.innerHTML = '<div class="card"><p style="text-align:center">Nessuna macchina trovata</p></div>';
        return;
    }

    let html = '';
    gruppi.forEach(g => {
        const a = g.articolo;
        let righe = '';
        g.voci.forEach(v => {
            righe +=
                '<tr>' +
                '<td>' + listinoDataBreve(v.data_registrazione) + '</td>' +
                '<td class="listino-col-netto"><span class="netto-val">' + listinoFormatEuro(v.netto) + '</span></td>' +
                '<td class="listino-col-note"><span class="netto-val">' + listinoVal(v.note) + '</span></td>' +
                '<td class="listino-col-note">' + listinoEsc(listinoOrigineTesto(v.origine)) + '</td>' +
                '</tr>';
        });

        html +=
            '<div class="listino-gruppo listino-storico-gruppo">' +
                '<div class="listino-gruppo-header">' +
                    '<h3 class="listino-storico-titolo">' +
                        listinoEsc(a.attrezzo || '') + (a.attrezzo ? ' &middot; ' : '') +
                        listinoEsc(a.marchio || '') + ' <strong>' + listinoVal(a.modello || a.note) + '</strong>' +
                        (a.note && a.modello ? ' <span class="listino-storico-note">' + listinoEsc(a.note) + '</span>' : '') +
                        (a.attivo === false ? ' <span class="listino-badge-cancellato">CANCELLATO</span>' : '') +
                    '</h3>' +
                    '<span class="listino-gruppo-count">' + g.voci.length + (g.voci.length === 1 ? ' netto' : ' netti') + '</span>' +
                '</div>' +
                '<div class="table-container">' +
                    '<table class="listino-table listino-table-storico">' +
                        '<thead><tr><th>Data</th>' +
                        '<th class="listino-th-netto">Netto</th>' +
                        '<th>Note</th><th>Origine</th></tr></thead>' +
                        '<tbody>' + righe + '</tbody>' +
                    '</table>' +
                '</div>' +
            '</div>';
    });

    container.innerHTML = html;
    applicaVisibilitaNetti();
}

// Scarica lo storico (quello visibile con la ricerca attuale) come file di testo
function downloadStoricoTxt() {
    const gruppi = listinoStoricoGruppi();
    if (gruppi.length === 0) {
        showCustomAlert('Non c\'&#232; nessun netto da esportare.', 'Attenzione', '&#9888;&#65039;');
        return;
    }

    const adesso = new Date();
    const righe = [
        'AGRIMAG - STORICO NETTI LISTINO VENDITE',
        'Generato il ' + adesso.toLocaleString('it-IT'),
        'Macchine: ' + gruppi.length,
        ''
    ];

    gruppi.forEach(g => {
        righe.push('='.repeat(78));
        righe.push(listinoTitoloArticolo(g.articolo) + (g.articolo.attivo === false ? '   [CANCELLATO]' : ''));
        righe.push('-'.repeat(78));
        righe.push('  ' + 'DATA'.padEnd(10) + '  ' + 'NETTO'.padStart(14) + '  ' + 'NOTE'.padEnd(30) + '  ORIGINE');
        g.voci.forEach(v => {
            righe.push('  ' + listinoDataBreve(v.data_registrazione).padEnd(10) + '  ' +
                listinoEuroTesto(v.netto).padStart(14) + '  ' +
                String(v.note || '-').padEnd(30) + '  ' + listinoOrigineTesto(v.origine));
        });
        righe.push('');
    });

    const testo = '﻿' + righe.join('\r\n');
    const blob = new Blob([testo], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const data = adesso.getFullYear() + '-' + String(adesso.getMonth() + 1).padStart(2, '0') + '-' + String(adesso.getDate()).padStart(2, '0');
    link.href = url;
    link.download = 'STORICO_NETTI_' + data + '.txt';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Stampa lo storico (dalla finestra di stampa si puo' scegliere "Salva come PDF")
function stampaStorico() {
    const gruppi = listinoStoricoGruppi();
    if (gruppi.length === 0) {
        showCustomAlert('Non c\'&#232; nessun netto da stampare.', 'Attenzione', '&#9888;&#65039;');
        return;
    }

    let html =
        '<h2>AGRIMAG - Storico netti listino vendite</h2>' +
        '<p class="stampa-sottotitolo">Generato il ' + listinoEsc(new Date().toLocaleString('it-IT')) +
        ' &middot; ' + gruppi.length + (gruppi.length === 1 ? ' macchina' : ' macchine') + '</p>';

    gruppi.forEach(g => {
        let righe = '';
        g.voci.forEach(v => {
            righe +=
                '<tr><td>' + listinoDataBreve(v.data_registrazione) + '</td>' +
                '<td class="stampa-num">' + listinoFormatEuro(v.netto) + '</td>' +
                '<td>' + listinoVal(v.note) + '</td>' +
                '<td>' + listinoEsc(listinoOrigineTesto(v.origine)) + '</td></tr>';
        });
        html +=
            '<div class="stampa-gruppo">' +
                '<h3>' + listinoEsc(listinoTitoloArticolo(g.articolo)) +
                    (g.articolo.attivo === false ? ' (CANCELLATO)' : '') + '</h3>' +
                '<table><thead><tr><th>Data</th><th>Netto</th><th>Note</th><th>Origine</th></tr></thead>' +
                '<tbody>' + righe + '</tbody></table>' +
            '</div>';
    });

    const area = document.getElementById('listino-storico-print');
    area.innerHTML = html;
    document.body.classList.add('stampa-storico');
    window.addEventListener('afterprint', () => {
        document.body.classList.remove('stampa-storico');
        area.innerHTML = '';
    }, { once: true });
    setTimeout(() => window.print(), 50);
}

// ========================================
// NOTIFICHE LISTINO (campanella in app + Telegram)
// ----------------------------------------
// Ogni modifica al listino (modifica articolo, nuovo, cancellato, ripristinato,
// import Excel) salva una riga nella tabella listino_notifiche.
// - Campanella in alto: numerino con le modifiche fatte da ALTRI utenti
//   che non hai ancora visto. Si aggiorna da sola (tempo reale di Supabase).
// - Telegram: subito dopo il salvataggio l'app chiama la funzione Supabase
//   "notifica-telegram", che manda il messaggio al gruppo. Il token del bot
//   sta solo su Supabase, mai nell'app.
// - "Gia' viste": data dell'ultima notifica vista, salvata nel browser e
//   sull'account (user_metadata.listinoNotificheLette), cosi' vale su tutti i dispositivi.
// Se le notifiche non funzionano (tabella mancante, Telegram non configurato)
// il listino continua a funzionare normalmente: gli errori finiscono solo in console.
// ========================================
let listinoNotifiche = [];               // ultime notifiche caricate (dalla piu' recente)
let listinoNotificheNonLette = 0;
let listinoNotificheAvviate = false;
let listinoNotificheCanale = null;
let listinoNotificheToastTimer = null;
let listinoNotificheLetteAllApertura = null;
let listinoDaAggiornare = false;          // modifica arrivata mentre la finestra di modifica era aperta

const LISTINO_NOTIFICHE_MAX = 50;
const LISTINO_NOTIFICHE_RIGHE_MAX = 300;
const LISTINO_NOTIFICHE_RIGHE_VISIBILI = 4;
const LISTINO_NOT_FRECCIA = ' \u2192 ';
const LISTINO_NOT_DATA_ZERO = '1970-01-01T00:00:00.000Z';

const LISTINO_NOTIFICHE_ICONE = {
    MODIFICA: '&#9999;&#65039;',
    NUOVO: '&#10133;',
    CANCELLATO: '&#128465;&#65039;',
    RIPRISTINATO: '&#9851;&#65039;',
    IMPORT: '&#128194;'
};

const LISTINO_NOTIFICHE_TIPI = {
    MODIFICA: 'Modifica',
    NUOVO: 'Nuovo articolo',
    CANCELLATO: 'Spostato nei cancellati',
    RIPRISTINATO: 'Ripristinato',
    IMPORT: 'Import Excel'
};

const LISTINO_NOTIFICHE_AZIONI = {
    MODIFICA: 'ha modificato',
    NUOVO: 'ha aggiunto',
    CANCELLATO: 'ha spostato nei cancellati',
    RIPRISTINATO: 'ha ripristinato',
    IMPORT: 'ha caricato un Excel'
};

// ---------- Testi delle notifiche (testo semplice, salvato nel database) ----------
function listinoNotEuro(n) {
    if (n === null || n === undefined || n === '') return '-';
    const num = Number(n);
    if (!isFinite(num)) return String(n);
    return '\u20AC ' + num.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function listinoNotValore(campo, v) {
    if (v === null || v === undefined || v === '') return '-';
    if (LISTINO_CAMPI_NUMERICI.indexOf(campo) !== -1) return listinoNotEuro(v);
    if (LISTINO_CAMPI_VENDITA_TESTO.indexOf(campo) !== -1 && /^-?\d+(\.\d+)?$/.test(String(v))) return listinoNotEuro(v);
    return String(v);
}

function listinoNotNome(a) {
    if (!a) return 'ARTICOLO';
    const nome = [a.marchio, a.modello, a.note].filter(Boolean).join(' ') || 'ARTICOLO';
    return a.attrezzo ? nome + ' (' + a.attrezzo + ')' : nome;
}

// Testo da mettere nella ricerca del listino per ritrovare l'articolo
function listinoNotCerca(a) {
    if (!a) return null;
    return [a.marchio, a.modello].filter(Boolean).join(' ') || a.note || null;
}

// Differenze tra due versioni dello stesso articolo: [{ e: etichetta, v: valore, n: netto? }]
function listinoNotDifferenze(vecchio, nuovo) {
    const righe = [];
    if (!listinoStessoNumero(vecchio.netto_1, nuovo.netto_1)) {
        righe.push({
            e: 'NETTO 1',
            v: listinoNotValore('netto_1', vecchio.netto_1) + LISTINO_NOT_FRECCIA + listinoNotValore('netto_1', nuovo.netto_1) +
                (nuovo.note_1 ? ' (' + nuovo.note_1 + ')' : ''),
            n: true
        });
    } else if (!listinoStessoTesto(vecchio.note_1, nuovo.note_1)) {
        righe.push({
            e: 'NOTE 1',
            v: listinoNotValore('note_1', vecchio.note_1) + LISTINO_NOT_FRECCIA + listinoNotValore('note_1', nuovo.note_1),
            n: true
        });
    }
    LISTINO_CAMPI.forEach(({ campo, titolo }) => {
        if (LISTINO_CAMPI_NETTI.indexOf(campo) !== -1) return;
        if (!(campo in nuovo)) return;
        const uguale = LISTINO_CAMPI_NUMERICI.indexOf(campo) !== -1
            ? listinoStessoNumero(vecchio[campo], nuovo[campo])
            : listinoStessoTesto(vecchio[campo], nuovo[campo]);
        if (!uguale) {
            righe.push({ e: titolo, v: listinoNotValore(campo, vecchio[campo]) + LISTINO_NOT_FRECCIA + listinoNotValore(campo, nuovo[campo]) });
        }
    });
    return righe;
}

function listinoNotRigheNuovo(a) {
    const righe = [];
    if (a.netto_1 !== null && a.netto_1 !== undefined) {
        righe.push({ e: 'NETTO 1', v: listinoNotEuro(a.netto_1) + (a.note_1 ? ' (' + a.note_1 + ')' : ''), n: true });
    }
    [['vendita_promo', 'VENDITA PROMO'], ['scadenza_promo', 'SCADENZA PROMO'], ['vendita_scatola', 'VENDITA IN SCATOLA'],
     ['vendita_no_promo', 'VENDITA NO PROMO'], ['listino', 'LISTINO']].forEach(([campo, titolo]) => {
        if (a[campo] !== null && a[campo] !== undefined && a[campo] !== '') {
            righe.push({ e: titolo, v: listinoNotValore(campo, a[campo]) });
        }
    });
    return righe;
}

function listinoNotRigheImport(piano) {
    const conteggi = [
        [piano.nettiCambiati.length, 'netti cambiati'],
        [piano.nuovi.length, 'nuovi'],
        [piano.aggiornati.length, 'altre modifiche'],
        [piano.riattivati.length, 'ripristinati'],
        [piano.cancellati.length, 'cancellati']
    ].filter(c => c[0] > 0).map(c => c[0] + ' ' + c[1]);

    if (piano.primoCaricamento) {
        return [{ e: 'Primo caricamento', v: piano.nuovi.length + ' articoli importati' }];
    }

    const righe = [{ e: 'Riepilogo', v: conteggi.join(', ') || 'nessuna modifica' }];
    piano.nettiCambiati.forEach(nc => {
        righe.push({
            e: listinoNotNome(nc.riga),
            v: listinoNotEuro(nc.vecchio) + LISTINO_NOT_FRECCIA + listinoNotEuro(nc.nuovo) + (nc.riga.note_1 ? ' (' + nc.riga.note_1 + ')' : ''),
            n: true
        });
        // Altri campi cambiati nella stessa riga (es. prezzo promo)
        (nc.riga._differenze || []).filter(d => !d.n).forEach(d => {
            righe.push({ e: listinoNotNome(nc.riga) + ' - ' + d.e, v: d.v });
        });
    });
    piano.nuovi.forEach(r => righe.push({ e: 'NUOVO', v: listinoNotNome(r) }));
    piano.aggiornati.forEach(r => {
        const diff = r._differenze || [];
        if (diff.length === 0) {
            righe.push({ e: 'MODIFICATO', v: listinoNotNome(r) });
        } else {
            diff.forEach(d => righe.push({ e: listinoNotNome(r) + ' - ' + d.e, v: d.v, n: !!d.n }));
        }
    });
    piano.riattivati.forEach(r => righe.push({ e: 'RIPRISTINATO', v: listinoNotNome(r) }));
    piano.cancellati.forEach(a => righe.push({ e: 'CANCELLATO', v: listinoNotNome(a) }));
    return righe;
}

// ---------- Salvataggio della notifica + invio Telegram ----------
// Non blocca mai il listino: se qualcosa va storto lo scrive solo in console.
async function listinoRegistraNotifica(tipo, titolo, righe, articolo) {
    if (typeof currentUser === 'undefined' || !currentUser) return;
    try {
        let elenco = Array.isArray(righe) ? righe : [];
        if (elenco.length > LISTINO_NOTIFICHE_RIGHE_MAX) {
            const altre = elenco.length - LISTINO_NOTIFICHE_RIGHE_MAX;
            elenco = elenco.slice(0, LISTINO_NOTIFICHE_RIGHE_MAX).concat([{ e: '...', v: 'e altre ' + altre + ' righe' }]);
        }
        const riga = {
            utente: currentUser.email,
            utente_nome: (typeof userInitials !== 'undefined' && userInitials[currentUser.email]) || null,
            tipo: tipo,
            titolo: titolo,
            righe: elenco,
            articolo_id: articolo && articolo.id ? articolo.id : null,
            cerca: listinoNotCerca(articolo)
        };
        const { data, error } = await supabaseClient.from('listino_notifiche').insert([riga]).select().single();
        if (error) throw error;
        listinoNotAggiungi(data);
        listinoNotInviaTelegram(data.id);
    } catch (err) {
        console.log('Notifica listino non registrata:', err && err.message ? err.message : err);
    }
}

function listinoNotInviaTelegram(id) {
    try {
        supabaseClient.functions.invoke('notifica-telegram', { body: { id: id } })
            .then(({ error }) => {
                if (error) console.log('Notifica Telegram non inviata:', error.message);
            })
            .catch(err => console.log('Notifica Telegram non inviata:', err));
    } catch (e) {
        console.log('Notifica Telegram non inviata:', e);
    }
}

// ---------- Stato "gia' viste" ----------
function listinoNotEMia(n) {
    return !!(n && typeof currentUser !== 'undefined' && currentUser && currentUser.email &&
        String(n.utente || '').toLowerCase() === currentUser.email.toLowerCase());
}

function listinoNotLetteIl() {
    try {
        const meta = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.user_metadata : null;
        if (meta && typeof meta.listinoNotificheLette === 'string') return meta.listinoNotificheLette;
    } catch (e) { /* ignora */ }
    try {
        const v = localStorage.getItem('listinoNotificheLette_' + listinoEmailUtente());
        if (v) return v;
    } catch (e) { /* ignora */ }
    return LISTINO_NOT_DATA_ZERO;
}

function listinoNotSegnaLette() {
    // Uso l'ora della notifica piu' recente (ora del server), non quella del dispositivo
    let segno = listinoNotLetteIl();
    listinoNotifiche.forEach(n => {
        if (n.created_at && n.created_at > segno) segno = n.created_at;
    });
    listinoNotificheNonLette = 0;
    listinoNotAggiornaBadge();
    if (segno === listinoNotLetteIl()) return;

    try {
        localStorage.setItem('listinoNotificheLette_' + listinoEmailUtente(), segno);
    } catch (e) { /* ignora */ }
    if (typeof currentUser !== 'undefined' && currentUser) {
        currentUser.user_metadata = Object.assign({}, currentUser.user_metadata, { listinoNotificheLette: segno });
        try {
            supabaseClient.auth.updateUser({ data: { listinoNotificheLette: segno } })
                .then(({ error }) => { if (error) console.log('Salvataggio notifiche viste non riuscito:', error.message); })
                .catch(err => console.log('Salvataggio notifiche viste non riuscito:', err));
        } catch (e) {
            console.log('Salvataggio notifiche viste non riuscito:', e);
        }
    }
}

async function listinoNotContaNonLette() {
    if (typeof currentUser === 'undefined' || !currentUser) return;
    try {
        const { count, error } = await supabaseClient
            .from('listino_notifiche')
            .select('id', { count: 'exact', head: true })
            .gt('created_at', listinoNotLetteIl())
            .neq('utente', currentUser.email);
        if (error) throw error;
        listinoNotificheNonLette = count || 0;
    } catch (err) {
        console.log('Conteggio notifiche non riuscito:', err && err.message ? err.message : err);
        listinoNotificheNonLette = 0;
    }
    listinoNotAggiornaBadge();
}

function listinoNotAggiornaBadge() {
    const badge = document.getElementById('notifiche-badge');
    const btn = document.getElementById('notifiche-btn');
    if (!badge) return;
    if (listinoNotificheNonLette > 0) {
        badge.textContent = listinoNotificheNonLette > 99 ? '99+' : String(listinoNotificheNonLette);
        badge.classList.remove('hidden');
        if (btn) btn.classList.add('notifiche-btn-attivo');
    } else {
        badge.textContent = '';
        badge.classList.add('hidden');
        if (btn) btn.classList.remove('notifiche-btn-attivo');
    }
}

function listinoNotAggiungi(n) {
    if (!n || listinoNotifiche.some(x => x.id === n.id)) return false;
    listinoNotifiche.unshift(n);
    listinoNotifiche.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || b.id - a.id);
    if (listinoNotifiche.length > LISTINO_NOTIFICHE_MAX) listinoNotifiche.length = LISTINO_NOTIFICHE_MAX;
    if (listinoNotPannelloAperto()) renderNotificheListino();
    return true;
}

// ---------- Avvio (dopo il login) e tempo reale ----------
async function avviaNotificheListino() {
    if (listinoNotificheAvviate || typeof currentUser === 'undefined' || !currentUser) return;
    listinoNotificheAvviate = true;

    await listinoNotContaNonLette();

    try {
        listinoNotificheCanale = supabaseClient
            .channel('listino-notifiche')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'listino_notifiche' },
                payload => listinoNotRicevuta(payload.new))
            .subscribe();
    } catch (err) {
        console.log('Tempo reale notifiche non disponibile:', err);
    }

    // Quando si torna sull'app (es. telefono sbloccato) ricontrollo: il tempo reale
    // puo' interrompersi mentre l'app e' in background
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible' || !currentUser) return;
        if (listinoNotPannelloAperto()) {
            listinoNotCaricaElenco().then(() => {
                renderNotificheListino();
                listinoNotSegnaLette();
            });
        } else {
            listinoNotContaNonLette();
        }
    });
}

function listinoNotRicevuta(n) {
    if (!n || typeof currentUser === 'undefined' || !currentUser) return;
    if (!listinoNotAggiungi(n)) return; // gia' presente (es. l'ho appena salvata io)

    // Il listino e' cambiato: aggiorno i dati se lo sto guardando
    listinoAggiornaDaRemoto();

    if (listinoNotEMia(n)) return; // fatta da me su un altro dispositivo: niente avviso

    if (listinoNotPannelloAperto()) {
        listinoNotSegnaLette();
    } else {
        listinoNotificheNonLette++;
        listinoNotAggiornaBadge();
        listinoNotMostraToast(n);
    }
}

// Ricarica listino / storico quando un altro utente fa una modifica
function listinoAggiornaDaRemoto() {
    listinoStoricoCaricato = false;
    if (!listinoCaricato) return; // il listino verra' caricato quando si apre

    const sezione = document.getElementById('section-listino-vendite');
    if (!sezione || sezione.classList.contains('hidden')) return; // si ricarica comunque all'apertura

    const editModal = document.getElementById('listino-edit-modal');
    if ((editModal && !editModal.classList.contains('hidden')) || listinoImportPlan) {
        // Non disturbo chi sta modificando o importando: ricarico dopo
        listinoDaAggiornare = true;
        return;
    }

    loadListino();
    const tabStorico = document.getElementById('tab-listino-storico');
    if (tabStorico && tabStorico.classList.contains('active')) loadListinoStorico();
}

// ---------- Avviso a comparsa ----------
function listinoNotChi(n) {
    if (n.utente_nome) return n.utente_nome;
    return String(n.utente || '').split('@')[0].toUpperCase();
}

function listinoNotMostraToast(n) {
    const toast = document.getElementById('notifiche-toast');
    if (!toast) return;
    toast.innerHTML =
        '<span class="notifiche-toast-icona">&#128276;</span>' +
        '<div class="notifiche-toast-testo">' +
            '<strong>' + listinoEsc(listinoNotChi(n)) + ' ' + (LISTINO_NOTIFICHE_AZIONI[n.tipo] || 'ha modificato') + '</strong>' +
            '<span>' + listinoEsc(n.titolo) + '</span>' +
        '</div>' +
        '<button type="button" class="notifiche-toast-chiudi" aria-label="Chiudi">&times;</button>';
    toast.classList.remove('hidden');
    clearTimeout(listinoNotificheToastTimer);
    listinoNotificheToastTimer = setTimeout(() => toast.classList.add('hidden'), 7000);
}

// ---------- Pannello notifiche ----------
function listinoNotPannelloAperto() {
    const modal = document.getElementById('notifiche-modal');
    return !!(modal && !modal.classList.contains('hidden'));
}

async function listinoNotCaricaElenco() {
    const { data, error } = await supabaseClient
        .from('listino_notifiche')
        .select('*')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(LISTINO_NOTIFICHE_MAX);
    if (error) throw error;
    listinoNotifiche = data || [];
}

async function apriNotificheListino() {
    const modal = document.getElementById('notifiche-modal');
    const lista = document.getElementById('notifiche-lista');
    if (!modal || !lista) return;

    // Toast e scelta "mostra netti" (sfocati come nel listino, solo da PC)
    const toast = document.getElementById('notifiche-toast');
    if (toast) toast.classList.add('hidden');
    listinoNettiVisibili = listinoLeggiPreferenza('listinoNettiVisibili');
    modal.classList.toggle('notifiche-netti-nascosti', !listinoNettiVisibili);

    const btnProva = document.getElementById('notifiche-prova-telegram');
    if (btnProva) btnProva.classList.toggle('hidden', !(typeof currentUserRole !== 'undefined' && currentUserRole === 'admin'));

    listinoNotificheLetteAllApertura = listinoNotLetteIl();
    lista.innerHTML = '<p class="notifiche-vuoto">&#8987; Caricamento...</p>';
    modal.classList.remove('hidden');

    try {
        await listinoNotCaricaElenco();
    } catch (err) {
        console.log('Caricamento notifiche non riuscito:', err);
        lista.innerHTML = '<p class="notifiche-vuoto">&#10060; Notifiche non disponibili: ' + listinoEsc(err.message || err) + '</p>';
        return;
    }
    renderNotificheListino();
    listinoNotSegnaLette();
}

function chiudiNotificheListino() {
    const modal = document.getElementById('notifiche-modal');
    if (!modal || modal.classList.contains('hidden')) return;
    modal.classList.add('hidden');
    // Tutto quello che era nel pannello ora conta come visto
    listinoNotSegnaLette();
}

function listinoNotDataOra(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    const ora = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    const oggi = new Date();
    const ieri = new Date();
    ieri.setDate(oggi.getDate() - 1);
    if (d.toDateString() === oggi.toDateString()) return 'oggi ' + ora;
    if (d.toDateString() === ieri.toDateString()) return 'ieri ' + ora;
    return listinoDataBreve(iso) + ' ' + ora;
}

function listinoNotRigaHtml(r) {
    if (typeof r === 'string') return '<li class="notifica-riga">' + listinoEsc(r) + '</li>';
    const etichetta = r.e ? '<span class="notifica-etichetta">' + listinoEsc(r.e) + (r.v ? ':' : '') + '</span> ' : '';
    const valore = r.v ? '<span class="notifica-val"' + (r.n ? ' title="Clicca per mostrare"' : '') + '>' + listinoEsc(r.v) + '</span>' : '';
    return '<li class="notifica-riga' + (r.n ? ' notifica-riga-netti' : '') + '">' + etichetta + valore + '</li>';
}

function renderNotificheListino() {
    const lista = document.getElementById('notifiche-lista');
    if (!lista) return;

    const lette = listinoNotificheLetteAllApertura || LISTINO_NOT_DATA_ZERO;
    const eNuova = n => !listinoNotEMia(n) && String(n.created_at) > lette;

    // Solo le novita' (modifiche di altri non ancora viste all'apertura):
    // una volta viste e chiuso il pannello, spariscono.
    const elenco = listinoNotifiche.filter(eNuova);

    if (elenco.length === 0) {
        lista.innerHTML = '<p class="notifiche-vuoto">&#10004; Nessuna nuova modifica al listino.</p>';
        return;
    }

    let html = '';
    elenco.forEach(n => {
        const nuova = eNuova(n);
        const righe = Array.isArray(n.righe) ? n.righe : [];
        const visibili = righe.slice(0, LISTINO_NOTIFICHE_RIGHE_VISIBILI);
        const altre = righe.slice(LISTINO_NOTIFICHE_RIGHE_VISIBILI);
        const chi = listinoNotEMia(n) ? 'Tu' : listinoNotChi(n);

        html +=
            '<div class="notifica-item notifica-' + listinoEsc(String(n.tipo || '').toLowerCase()) + (nuova ? ' notifica-nuova' : '') + '">' +
                '<div class="notifica-testa">' +
                    '<span class="notifica-icona">' + (LISTINO_NOTIFICHE_ICONE[n.tipo] || '&#128276;') + '</span>' +
                    '<div class="notifica-info">' +
                        '<div class="notifica-titolo">' + listinoEsc(n.titolo) + '</div>' +
                        '<div class="notifica-meta">' +
                            (nuova ? '<span class="notifica-pallino">NUOVA</span> ' : '') +
                            listinoEsc(chi) + ' &middot; ' + listinoEsc(listinoNotDataOra(n.created_at)) +
                            ' &middot; ' + listinoEsc(LISTINO_NOTIFICHE_TIPI[n.tipo] || n.tipo) +
                        '</div>' +
                    '</div>' +
                '</div>' +
                (visibili.length > 0 ? '<ul class="notifica-righe">' + visibili.map(listinoNotRigaHtml).join('') + '</ul>' : '') +
                (altre.length > 0
                    ? '<details class="notifica-altre"><summary>Mostra altre ' + altre.length + ' righe</summary>' +
                        '<ul class="notifica-righe">' + altre.map(listinoNotRigaHtml).join('') + '</ul></details>'
                    : '') +
                (n.cerca
                    ? '<button type="button" class="btn-back notifica-vai" data-cerca="' + listinoEsc(n.cerca) + '" data-tipo="' +
                        listinoEsc(n.tipo) + '">&#128269; Vai all\'articolo</button>'
                    : '') +
            '</div>';
    });
    lista.innerHTML = html;
}

// Apre il listino gia' filtrato sull'articolo della notifica
function listinoNotVaiArticolo(cerca, tipo) {
    chiudiNotificheListino();
    sessionStorage.setItem('listinoTab', tipo === 'CANCELLATO' ? 'cancellati' : 'elenco');
    const search = document.getElementById('listino-search');
    if (search) search.value = cerca || '';
    LISTINO_FILTRI.forEach(f => {
        const el = document.getElementById(f.id);
        if (el) el.value = '';
    });
    if (typeof openSection === 'function') openSection('listino-vendite');
}

// Pulsante (solo admin) per controllare che Telegram sia configurato bene
async function provaTelegramListino() {
    const btn = document.getElementById('notifiche-prova-telegram');
    const testo = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '&#8987; Invio in corso...';
    }
    let esito = null;
    try {
        const { data, error } = await supabaseClient.functions.invoke('notifica-telegram', { body: { prova: true } });
        if (error) {
            let messaggio = error.message || String(error);
            try {
                if (error.context && typeof error.context.json === 'function') {
                    const corpo = await error.context.json();
                    if (corpo && corpo.errore) messaggio = corpo.errore;
                }
            } catch (e) { /* ignora */ }
            esito = { ok: false, errore: messaggio };
        } else if (data && data.ok === true) {
            esito = data;
        } else {
            // La funzione ha risposto, ma non con il codice di AGRIMAG
            // (es. e' rimasto il codice d'esempio di Supabase): mostro cosa ha risposto
            let testoRisposta = '';
            try {
                testoRisposta = typeof data === 'string' ? data : JSON.stringify(data);
            } catch (e) {
                testoRisposta = String(data);
            }
            esito = {
                ok: false,
                errore: (data && data.errore) ? data.errore
                    : 'Risposta inattesa dalla funzione: ' + String(testoRisposta || '(vuota)').slice(0, 200)
            };
        }
    } catch (err) {
        esito = { ok: false, errore: err && err.message ? err.message : String(err) };
    }
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = testo;
    }

    if (esito && esito.ok) {
        await showCustomAlert('Messaggio di prova inviato: controlla il gruppo Telegram.', 'Telegram OK', '&#10004;');
    } else {
        await showCustomAlert(
            'Il messaggio non &#232; partito:<br><strong>' + listinoEsc(esito && esito.errore ? esito.errore : 'errore sconosciuto') + '</strong><br><br>' +
            'Controlla su Supabase che la funzione <strong>notifica-telegram</strong> sia pubblicata (con &quot;Verify JWT&quot; spento) ' +
            'e che i secrets TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID siano giusti.',
            'Telegram non configurato', '&#9888;&#65039;'
        );
    }
}

function listinoNotImpostaEventi() {
    const btn = document.getElementById('notifiche-btn');
    if (btn) btn.addEventListener('click', apriNotificheListino);

    const modal = document.getElementById('notifiche-modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                chiudiNotificheListino();
                return;
            }
            const vai = e.target.closest('.notifica-vai');
            if (vai) {
                listinoNotVaiArticolo(vai.dataset.cerca, vai.dataset.tipo);
                return;
            }
            // Netti sfocati: un clic sul valore lo mostra
            const riga = e.target.closest('.notifica-riga-netti');
            if (riga) riga.classList.toggle('svelata');
        });
    }

    const btnClose = document.getElementById('notifiche-close');
    if (btnClose) btnClose.addEventListener('click', chiudiNotificheListino);
    const btnOk = document.getElementById('notifiche-ok');
    if (btnOk) btnOk.addEventListener('click', chiudiNotificheListino);
    const btnProva = document.getElementById('notifiche-prova-telegram');
    if (btnProva) btnProva.addEventListener('click', provaTelegramListino);

    const toast = document.getElementById('notifiche-toast');
    if (toast) {
        toast.addEventListener('click', (e) => {
            toast.classList.add('hidden');
            // Da mobile la campanella non c'e': l'avviso si chiude e basta
            const mobile = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
            if (!mobile && !e.target.closest('.notifiche-toast-chiudi')) apriNotificheListino();
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && listinoNotPannelloAperto()) chiudiNotificheListino();
    });
}

// ========================================
// EVENT LISTENERS
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    // Tab
    document.querySelectorAll('#tabs-listino .tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchListinoTab(btn.dataset.listinoTab));
    });

    // Ricerca (con piccolo ritardo per non rallentare mentre si scrive)
    const search = document.getElementById('listino-search');
    if (search) {
        search.addEventListener('input', () => {
            clearTimeout(listinoSearchTimeout);
            listinoSearchTimeout = setTimeout(applyListinoFilters, 200);
        });
    }

    LISTINO_FILTRI.forEach(f => {
        const el = document.getElementById(f.id);
        if (el) el.addEventListener('change', applyListinoFilters);
    });

    const reset = document.getElementById('listino-reset-filtri');
    if (reset) reset.addEventListener('click', resetListinoFilters);

    // Occhio netti e pulsante "i" (delegati: le tabelle vengono ridisegnate)
    const section = document.getElementById('section-listino-vendite');
    if (section) {
        section.addEventListener('click', (e) => {
            const info = e.target.closest('.listino-info-btn');
            if (info) {
                openListinoInfo(parseInt(info.dataset.id, 10));
                return;
            }
            const edit = e.target.closest('.listino-edit-btn');
            if (edit) {
                openListinoEdit(parseInt(edit.dataset.id, 10));
                return;
            }
            const restore = e.target.closest('.listino-restore-btn');
            if (restore) {
                ripristinaListino(parseInt(restore.dataset.id, 10));
            }
        });
    }

    // Pop-up info
    const infoModal = document.getElementById('listino-info-modal');
    if (infoModal) {
        infoModal.addEventListener('click', (e) => {
            if (e.target === infoModal) closeListinoInfo();
        });
    }
    const infoClose = document.getElementById('listino-info-close');
    if (infoClose) infoClose.addEventListener('click', closeListinoInfo);
    const infoOk = document.getElementById('listino-info-ok');
    if (infoOk) infoOk.addEventListener('click', closeListinoInfo);

    // Import
    const btnSeleziona = document.getElementById('listino-btn-seleziona');
    if (btnSeleziona) {
        btnSeleziona.addEventListener('click', () => {
            cancelListinoImport();
            document.getElementById('listino-file-input').click();
        });
    }
    const fileInput = document.getElementById('listino-file-input');
    if (fileInput) fileInput.addEventListener('change', handleListinoFileSelect);

    const btnDownload = document.getElementById('listino-btn-download');
    if (btnDownload) btnDownload.addEventListener('click', downloadListinoExcel);

    // Casellina "Mostra netti e note"
    const toggleNetti = document.getElementById('listino-toggle-netti');
    if (toggleNetti) {
        toggleNetti.addEventListener('change', () => impostaNettiVisibili(toggleNetti.checked));
    }
    const toggleStorici = document.getElementById('listino-toggle-storici');
    if (toggleStorici) {
        toggleStorici.addEventListener('change', () => impostaStoriciVisibili(toggleStorici.checked));
    }

    // Nuovo / modifica articolo
    const btnNuovo = document.getElementById('listino-btn-nuovo');
    if (btnNuovo) btnNuovo.addEventListener('click', () => openListinoEdit(null));
    const formEdit = document.getElementById('listino-edit-form');
    if (formEdit) formEdit.addEventListener('submit', saveListinoEdit);
    const btnAnnullaEdit = document.getElementById('listino-edit-annulla');
    if (btnAnnullaEdit) btnAnnullaEdit.addEventListener('click', closeListinoEdit);
    const btnChiudiEdit = document.getElementById('listino-edit-close');
    if (btnChiudiEdit) btnChiudiEdit.addEventListener('click', closeListinoEdit);
    const btnCancellaEdit = document.getElementById('listino-edit-cancella');
    if (btnCancellaEdit) btnCancellaEdit.addEventListener('click', spostaInCancellatiListino);

    // Storico netti
    const storicoSearch = document.getElementById('listino-storico-search');
    if (storicoSearch) {
        storicoSearch.addEventListener('input', () => {
            clearTimeout(listinoStoricoSearchTimeout);
            listinoStoricoSearchTimeout = setTimeout(renderListinoStorico, 200);
        });
    }
    const btnStoricoTxt = document.getElementById('listino-storico-txt');
    if (btnStoricoTxt) btnStoricoTxt.addEventListener('click', downloadStoricoTxt);
    const btnStoricoPdf = document.getElementById('listino-storico-pdf');
    if (btnStoricoPdf) btnStoricoPdf.addEventListener('click', stampaStorico);
    // Notifiche (campanella, pannello, avviso a comparsa)
    listinoNotImpostaEventi();
});

// ========================================
// ESPONI FUNZIONI GLOBALMENTE
// ========================================
window.openListinoVendite = openListinoVendite;
window.switchListinoTab = switchListinoTab;
window.applyListinoFilters = applyListinoFilters;
window.toggleNettiListino = toggleNettiListino;
window.openListinoInfo = openListinoInfo;
window.closeListinoInfo = closeListinoInfo;
window.downloadListinoExcel = downloadListinoExcel;
window.downloadStoricoTxt = downloadStoricoTxt;
window.openListinoEdit = openListinoEdit;
window.closeListinoEdit = closeListinoEdit;
window.stampaStorico = stampaStorico;
window.avviaNotificheListino = avviaNotificheListino;
window.apriNotificheListino = apriNotificheListino;
window.chiudiNotificheListino = chiudiNotificheListino;
