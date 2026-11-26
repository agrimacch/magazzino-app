// ========================================
// MAGAZZINO > MAGAZZINO ESTERNO MEZZI (v8.1.0)
// ----------------------------------------
// I ricambi che i tecnici hanno nei FURGONI (CITROEN e FORD, inventari separati).
// - Catalogo unico: marca, modelli compatibili (separati da virgola; "TUTTI HONDA" / "TUTTE" = tutti i
//   modelli della marca), codice, descrizione, prezzo IVA esclusa e IVA compresa, codice a barre, note.
// - Per ogni furgone: quantita' e soglia di avviso. Quando un ricambio arriva alla soglia (o finisce)
//   parte la notifica (campanella + Telegram, stesso gruppo dei consumabili: tipo SOTTOSOGLIA_FURGONE).
// - CERCA: si scrive il modello del robot / della macchina (es. HRM1500) e compaiono i ricambi compatibili,
//   prima quelli presenti nel furgone scelto (il furgone si sceglie in alto: l'app lo ricorda su quel dispositivo).
//   Funziona anche col lettore di codici a barre (codice del ricambio o codice a barre).
// - RAPPORTINI di intervento: cliente, data, modello e matricola, lavori eseguiti, manodopera (ore x 40 euro + IVA),
//   uscita, ricambi usati (si scaricano dal furgone), note, totale da pagare. Il tecnico si vede solo nell'app,
//   NON nel PDF del cliente. PDF salvato su Google Drive (Edge Function rapportini-drive + google/rapportini-drive.gs).
// - DATI DEL CLIENTE DALLA RICHIESTA DI INTERVENTO (v8.1.0): nel rapportino si sceglie la richiesta (Assistenza >
//   Richieste interventi robot) e si compilano cliente, telefono, indirizzo + paese; dal planning (interventi con
//   richiesta_id) arrivano tecnico e data; se la richiesta viene da un ordine cliente, modello e matricola della macchina.
//   Colonna mezzi_rapportini.richiesta_id. Prima si propongono le richieste del TECNICO del rapportino (quello scelto,
//   oppure chi e' collegato: email uguale a quella della tabella tecnici, che viene anche proposto come tecnico):
//   prima quelle con intervento oggi, poi gli ultimi 14 giorni; se non ne ha, quelle di oggi di tutti / le aperte.
// - v8.1.1: ricambi UNIVERSALI (marca TUTTE / TUTTI / UNIVERSALE): escono cercando qualsiasi modello o marca.
//   Ricambi A METRI (unita' MT, es. cavo perimetrale): quantita', soglie e righe del rapportino con i decimali
//   (12,5 m); script supabase/mezzi-unita.sql (colonna unita, quantita' numeric, mezzi_muovi con i decimali).
// - Carico dal negozio: a mano (scheda del ricambio) o da Excel (stesso formato del file del magazzino esterno:
//   i codici doppi vengono uniti da soli, modelli compresi).
// - Etichette Zebra ZD420 50 x 20 mm: PDF della misura dell'etichetta con il codice a barre (Code 128).
// Tabelle Supabase: mezzi_* (script supabase/mezzi-setup.sql). Permessi (v8.5.0, script supabase/mezzi-ruoli.sql):
//   admin e operatori (MZ_RUOLI_GESTIONE, mezzi_puo_gestire()): tutto (catalogo, carico/rettifica, Excel, etichette,
//     da ricaricare, movimenti, eliminare rapportini).
//   tecnici (mezzi_puo_usare()): Cerca, Ricambi e furgoni in sola lettura (solo prezzo IVA compresa), Rapportini
//     (nuovi e modifica, PDF, Drive: i ricambi usati si scaricano dal furgone). Non eliminano i rapportini.
// ========================================

const MZ_RUOLI = ['admin', 'operatore', 'tecnico'];   // chi vede la sezione
const MZ_RUOLI_GESTIONE = ['admin', 'operatore'];      // chi gestisce catalogo e quantita'
const MZ_TARIFFA_ORA = 40;           // manodopera: euro all'ora IVA esclusa
const MZ_IVA = 22;
const MZ_ETICHETTA = { larghezza: 50, altezza: 20 };   // mm (Zebra ZD420)
const MZ_LIB_BARCODE = 'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js';

let mzFurgoni = [];
let mzRicambi = [];
let mzGiacenze = {};                 // 'ricambio_furgone' -> { quantita, soglia }
let mzRapportini = [];
let mzTecnici = [];
let mzCaricato = false;
let mzTab = 'cerca';
let mzTestoCerca = '';
let mzGiacFiltro = { testo: '', marca: '', sotto: false };
let mzSelezionati = {};              // id ricambio -> true (etichette)
let mzRicAperto = null;              // ricambio aperto nella scheda (null = nuovo)
let mzRap = null;                    // rapportino aperto: { id?, ..., righe: [] }
let mzRapRigheOrig = [];             // righe salvate del rapportino aperto (per sapere cosa tornare nel furgone)
let mzImport = null;                 // anteprima import Excel
let mzCanale = null;
let mzTimerRicarica = null;
let mzRapAnno = 'TUTTI';
let mzRichieste = [];                // richieste di intervento (ultimi 6 mesi) per i dati del cliente
let mzRichInterventi = {};           // richiesta_id -> [{ data, tecnico }] dal planning
let mzRichCaricate = false;
let mzRapCerca = '';
const mzDriveInCorso = {};
const mzDriveErrore = {};

function mzPuoVedere() {
    return typeof currentUserRole !== 'undefined' && MZ_RUOLI.includes(currentUserRole);
}
function mzPuoGestire() {
    return typeof currentUserRole !== 'undefined' && MZ_RUOLI_GESTIONE.includes(currentUserRole);
}

// ---------- Utilita' ----------
function mzEsc(v) {
    return String(v === null || v === undefined ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function mzNorm(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function mzTesto(v) { return String(v || '').replace(/\s+/g, ' ').trim().toUpperCase(); }
function mzCent(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function mzEuro(n) {
    if (n === null || n === undefined || n === '' || isNaN(Number(n))) return '-';
    return '&euro; ' + Number(n).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function mzPad(n) { return String(n).padStart(2, '0'); }
function mzOggi() { const d = new Date(); return d.getFullYear() + '-' + mzPad(d.getMonth() + 1) + '-' + mzPad(d.getDate()); }
function mzDataIt(iso) {
    if (!iso) return '';
    const p = String(iso).slice(0, 10).split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : String(iso);
}
function mzDataOra(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return mzPad(d.getDate()) + '/' + mzPad(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + mzPad(d.getHours()) + ':' + mzPad(d.getMinutes());
}
// Numero scritto all'italiana: "23,50", "1.250,00", "23.5", "EUR 30"
function mzNum(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    let s = String(v).replace(/[^\d,.\-]/g, '');
    if (!s) return null;
    if (s.indexOf('.') !== -1 && s.indexOf(',') !== -1) s = s.replace(/\./g, '').replace(',', '.');
    else if (s.indexOf(',') !== -1) s = s.replace(',', '.');
    const n = parseFloat(s);
    return isFinite(n) ? n : null;
}
function mzNumForm(n) {
    if (n === null || n === undefined || n === '') return '';
    return String(mzCent(n)).replace('.', ',');
}
function mzUtente() {
    const email = (typeof loggedInUserEmail !== 'undefined' && loggedInUserEmail) || (typeof currentUser !== 'undefined' && currentUser ? currentUser.email : '');
    if (typeof userInitials === 'object' && userInitials && userInitials[email]) return String(userInitials[email]).toUpperCase();
    return String(email || '').split('@')[0].slice(0, 3).toUpperCase();
}
function mzEmail() {
    return (typeof loggedInUserEmail !== 'undefined' && loggedInUserEmail) || (typeof currentUser !== 'undefined' && currentUser ? currentUser.email : null);
}
function mzErrore(error, dove) {
    console.error('Magazzino mezzi - ' + dove + ':', error);
    const msg = error && error.message ? error.message : String(error);
    let extra = '';
    if (/QUANTITA_INSUFFICIENTE/.test(msg)) {
        extra = '';
    } else if (/unita|integer|numeric/i.test(msg)) {
        extra = '<br><br>Esegui su Supabase lo script <strong>supabase/mezzi-unita.sql</strong> (ricambi a metri, quantit&agrave; con i decimali).';
    } else if (/richiesta_id/i.test(msg)) {
        extra = '<br><br>Esegui di nuovo su Supabase lo script <strong>supabase/mezzi-setup.sql</strong> (collegamento alle richieste di intervento).';
    } else if (/mezzi_|does not exist|schema cache|function/i.test(msg)) {
        extra = '<br><br>Hai eseguito su Supabase lo script <strong>supabase/mezzi-setup.sql</strong>?';
    } else if (/row-level security|violates|permess/i.test(msg)) {
        extra = '<br><br>Non hai il permesso di gestire il magazzino dei furgoni.';
    } else if (/duplicate key|unique/i.test(msg)) {
        extra = '<br><br>Esiste gi&agrave; un ricambio con lo stesso codice o lo stesso codice a barre.';
    }
    showCustomAlert('Errore (' + mzEsc(dove) + '):<br>' + mzEsc(msg.replace('QUANTITA_INSUFFICIENTE: ', '')) + extra, 'Errore', '&#10060;');
}

// ---------- Dati ----------
function mzChiave(ricambioId, furgoneId) { return ricambioId + '_' + furgoneId; }
function mzQta(ricambioId, furgoneId) { const g = mzGiacenze[mzChiave(ricambioId, furgoneId)]; return g ? Number(g.quantita) || 0 : 0; }
function mzSoglia(ricambioId, furgoneId) { const g = mzGiacenze[mzChiave(ricambioId, furgoneId)]; return g ? Number(g.soglia) || 0 : 0; }
function mzRicambio(id) { return mzRicambi.find(r => r.id === id) || null; }
// Ricambi a metri (unita' MT) e quantita' scritte all'italiana: 3, 12,5
function mzMetri(r) { return !!r && String(r.unita || '').toUpperCase() === 'MT'; }
function mzQ(n) { return String(mzCent(n)).replace('.', ','); }
function mzQU(n, r) { return mzQ(n) + (mzMetri(r) ? ' m' : ''); }
function mzLeggiQ(v, metri) {
    const n = mzNum(v);
    if (n === null) return null;
    return metri ? mzCent(n) : Math.round(n);
}
// Ricambio buono per tutte le marche (e quindi per tutti i modelli)
function mzUniversaleTutto(r) {
    const m = mzTesto(r.marca);
    return /^(TUTT[IE]|UNIVERSAL[EI]?|TUTTE LE MARCHE)$/.test(m) || (!m && mzModelli(r).some(mzUniversale));
}
function mzFurgone(id) { return mzFurgoni.find(f => f.id === id) || null; }
function mzNomeFurgone(id) { const f = mzFurgone(id); return f ? f.nome : ''; }
// Ricambio "senza scorta" (v8.7.0): si usa nei rapportini (prezzo) ma non si conta nei furgoni:
// niente quantita', niente scarico, niente avvisi, fuori dall'inventario
function mzSenzaScorta(r) { return !!(r && r.senza_scorta); }
function mzSenzaScortaId(id) { return mzSenzaScorta(mzRicambio(id)); }
let mzColSenzaScorta = false;   // colonna presente su Supabase (script supabase/mezzi-senza-scorta.sql)
function mzSottoSoglia(ricambioId, furgoneId) {
    if (mzSenzaScortaId(ricambioId)) return false;
    const s = mzSoglia(ricambioId, furgoneId);
    return s > 0 && mzQta(ricambioId, furgoneId) <= s;
}

// Furgone scelto su questo dispositivo
function mzFurgoneCorrente() {
    let id = null;
    try { id = Number(localStorage.getItem('mzFurgone')) || null; } catch (e) { id = null; }
    if (id && mzFurgone(id)) return id;
    return mzFurgoni.length ? mzFurgoni[0].id : null;
}
function mzScegliFurgone(id) {
    try { localStorage.setItem('mzFurgone', String(id)); } catch (e) { /* niente */ }
    mzRender();
}

async function mzCarica() {
    const [f, r, g, rap, t] = await Promise.all([
        supabaseClient.from('mezzi_furgoni').select('*').eq('attivo', true).order('ordine').order('nome'),
        supabaseClient.from('mezzi_ricambi').select('*').eq('attivo', true).order('marca').order('descrizione').limit(5000),
        supabaseClient.from('mezzi_giacenze').select('ricambio_id, furgone_id, quantita, soglia').limit(20000),
        supabaseClient.from('mezzi_rapportini').select('*').order('anno', { ascending: false }).order('numero', { ascending: false }).limit(2000),
        supabaseClient.from('tecnici').select('id, nome, attivo, ordine, email').order('ordine').order('nome')
    ]);
    const err = f.error || r.error || g.error || rap.error;
    if (err) throw err;
    mzFurgoni = f.data || [];
    mzRicambi = r.data || [];
    mzColSenzaScorta = mzRicambi.some(x => Object.prototype.hasOwnProperty.call(x, 'senza_scorta'));
    mzGiacenze = {};
    (g.data || []).forEach(x => { mzGiacenze[mzChiave(x.ricambio_id, x.furgone_id)] = { quantita: x.quantita, soglia: x.soglia }; });
    mzRapportini = rap.data || [];
    mzTecnici = (t && !t.error && t.data ? t.data : []).filter(x => x.attivo !== false);
    mzCaricato = true;
}

async function openMagazzinoMezzi() {
    const box = document.getElementById('mz-contenuto');
    if (!mzCaricato && box) box.innerHTML = '<p class="mz-vuoto">&#8987; Caricamento...</p>';
    try {
        await mzCarica();
    } catch (err) {
        if (box) box.innerHTML = '';
        mzErrore(err, 'caricamento');
        return;
    }
    mzAvviaTempoReale();
    mzTab = sessionStorage.getItem('mzTab') || 'cerca';
    mzRender();
    mzApriDaIntervento();
}

function mzIndietro() {
    const da = sessionStorage.getItem('mzDa');
    // il tecnico non vede Magazzino: torna ad Assistenza
    openSection(da === 'interventi' ? 'interventi-esterni' : (da === 'assistenza' || currentUserRole === 'tecnico') ? 'assistenza' : 'magazzino');
}

// ---------- Rapportino dal planning Interventi esterni (v8.4.0) ----------
// Il pulsante "Crea rapportino" nella finestra del cliente (planning) lascia qui i dati dell'intervento:
// apro un rapportino nuovo con cliente, indirizzo, telefono (dalla richiesta agganciata), data e tecnico.
async function mzApriDaIntervento() {
    let dati = null;
    try { dati = JSON.parse(sessionStorage.getItem('mzDaIntervento') || 'null'); } catch (e) { dati = null; }
    sessionStorage.removeItem('mzDaIntervento');
    if (!dati) return;
    mzCambiaTab('rapportini');
    mzApriNuovoRapportino();
    const imposta = (campo, valore) => { const el = document.getElementById(campo); if (el && valore) el.value = valore; };
    if (dati.richiesta_id) {
        await mzRichCarica();
        if (!mzRichieste.some(x => x.id === dati.richiesta_id)) {
            // richiesta piu' vecchia di 180 giorni: la leggo da sola
            const { data } = await supabaseClient.from('richieste_robot')
                .select('id, data, cliente, indirizzo, paese, telefono, note, tipo, esito, ordine_id').eq('id', dati.richiesta_id).maybeSingle();
            if (data) mzRichieste.push(data);
        }
        if (mzRichieste.some(x => x.id === dati.richiesta_id)) await mzRichScegli(dati.richiesta_id);
        else imposta('mz-r-cliente', mzTesto(dati.cliente));
    } else {
        // riga del planning senza richiesta: il testo scritto nel planning (es. "ROSSI MARIO - MIRA")
        imposta('mz-r-cliente', mzTesto(dati.cliente));
        mzRapUscitaAuto(true, dati.cliente);
    }
    // data e tecnico: quelli della riga del planning
    imposta('mz-r-data', dati.data);
    const sel = document.getElementById('mz-r-tecnico');
    if (sel && dati.tecnico) {
        if (!Array.from(sel.options).some(o => o.value === dati.tecnico)) sel.insertAdjacentHTML('beforeend', '<option>' + mzEsc(dati.tecnico) + '</option>');
        sel.value = dati.tecnico;
    }
    const elenco = document.getElementById('mz-r-rich-elenco');
    if (elenco && dati.richiesta_id) elenco.innerHTML = '';
}
function mzApriDa(da) {
    sessionStorage.setItem('mzDa', da);
    openSection('mezzi');
}

function mzCambiaTab(tab) {
    mzTab = tab;
    sessionStorage.setItem('mzTab', tab);
    mzRender();
}

// ---------- Disegno ----------
function mzRender() {
    if (mzTab === 'movimenti' && !mzPuoGestire()) mzTab = 'cerca';
    const tabMov = document.querySelector('#mz-tabs [data-mz-tab="movimenti"]');
    if (tabMov) tabMov.classList.toggle('hidden', !mzPuoGestire());
    document.querySelectorAll('#mz-tabs [data-mz-tab]').forEach(b => b.classList.toggle('active', b.dataset.mzTab === mzTab));
    const box = document.getElementById('mz-contenuto');
    if (!box) return;
    if (!mzFurgoni.length && mzCaricato) {
        box.innerHTML = '<p class="mz-vuoto">Nessun furgone: esegui su Supabase lo script <strong>supabase/mezzi-setup.sql</strong>.</p>';
        return;
    }
    if (mzTab === 'giacenze') box.innerHTML = mzHtmlGiacenze();
    else if (mzTab === 'rapportini') box.innerHTML = mzHtmlRapportini();
    else if (mzTab === 'movimenti') { box.innerHTML = '<p class="mz-vuoto">&#8987; Caricamento movimenti...</p>'; mzCaricaMovimenti(); }
    else if (mzTab === 'inventario') { box.innerHTML = mzHtmlInventario(); mzInvMostra(); }
    else box.innerHTML = mzHtmlCerca();
    mzAggiornaBozzaBarra();
    // nell'inventario la barra del rapportino coprirebbe la barra "Conferma inventario"
    if (mzTab === 'inventario') { const b = document.getElementById('mz-bozza-barra'); if (b) b.classList.add('hidden'); }
    if (mzTab === 'cerca') {
        const el = document.getElementById('mz-cerca');
        if (el && window.matchMedia && window.matchMedia('(pointer: fine)').matches) el.focus();
        mzRenderRisultati();
    } else if (mzTab === 'giacenze') {
        mzRenderTabellaGiacenze();
    } else if (mzTab === 'rapportini') {
        mzRenderElencoRapportini();
    }
}

function mzHtmlScegliFurgone() {
    const corrente = mzFurgoneCorrente();
    return '<div class="mz-furgoni">' +
        '<span class="mz-furgoni-et">&#128656; Sono nel furgone:</span>' +
        mzFurgoni.map(f => '<button type="button" class="mz-furgone-btn' + (f.id === corrente ? ' active' : '') + '" onclick="mzScegliFurgone(' + f.id + ')">' + mzEsc(f.nome) + '</button>').join('') +
    '</div>';
}

// ---------- CERCA (per modello, codice, descrizione o codice a barre) ----------
function mzHtmlCerca() {
    return mzHtmlScegliFurgone() +
        '<div class="mz-cerca-box">' +
            '<input type="search" id="mz-cerca" class="mz-cerca" placeholder="Modello della macchina (es. HRM1500), codice o descrizione..." autocomplete="off" value="' + mzEsc(mzTestoCerca) + '" oninput="mzCambiaCerca(this.value)" onkeydown="mzCercaTasto(event)">' +
        '</div>' +
        '<div id="mz-risultati"></div>';
}

function mzCambiaCerca(v) {
    mzTestoCerca = v;
    mzRenderRisultati();
}

// Lettore di codici a barre: scrive il codice e preme Invio
function mzCercaTasto(e) {
    if (e.key !== 'Enter') return;
    const trovati = mzCercaRicambi(mzTestoCerca);
    if (trovati.length === 1 && trovati[0].esatto) {
        e.preventDefault();
        mzAggiungiABozza(trovati[0].r.id);
        mzTestoCerca = '';
        e.target.value = '';
        mzRenderRisultati();
    }
}

function mzModelli(r) {
    return String(r.modelli || '').split(',').map(x => x.trim()).filter(Boolean);
}
function mzUniversale(m) { return /^TUTT[IE]\b/i.test(String(m).trim()); }

// Modelli (normalizzati) di ogni marca: servono per le righe "TUTTI HONDA" / "TUTTE"
function mzModelliPerMarca() {
    const mappa = {};
    mzRicambi.forEach(r => {
        const m = mzNorm(r.marca);
        if (!mappa[m]) mappa[m] = [];
        mzModelli(r).forEach(x => { if (!mzUniversale(x)) mappa[m].push(mzNorm(x)); });
    });
    return mappa;
}

// Ricerca: ogni parola scritta deve trovare qualcosa (modello, marca, codice o descrizione)
// Restituisce [{ r, punti, esatto }] ordinati: prima quelli presenti nel furgone scelto
function mzCercaRicambi(testo) {
    const parole = String(testo || '').split(/\s+/).map(mzNorm).filter(Boolean);
    if (!parole.length) return [];
    const perMarca = mzModelliPerMarca();
    const furgone = mzFurgoneCorrente();
    const risultati = [];
    // tutti i modelli e le marche conosciuti: un ricambio "per tutte le marche" esce se la parola e' uno di questi
    const tuttiModelli = [];
    Object.keys(perMarca).forEach(m => { if (m) tuttiModelli.push(m); perMarca[m].forEach(x => tuttiModelli.push(x)); });
    mzRicambi.forEach(r => {
        const modelli = mzModelli(r);
        const normali = modelli.filter(m => !mzUniversale(m)).map(mzNorm);
        const universale = modelli.some(mzUniversale);
        const marca = mzNorm(r.marca);
        const perTutti = mzUniversaleTutto(r);
        const codici = [r.codice, r.codice_barre, r.codice_ean, r.codice_easy, r.codice_gestionale, r.codice_precedente].map(mzNorm).filter(Boolean);
        let punti = 0;
        let esatto = false;
        for (const p of parole) {
            let v = 0;
            if (codici.indexOf(p) !== -1) { v = 300; esatto = true; }
            else if (normali.indexOf(p) !== -1) v = 100;
            else if (p.length >= 2 && normali.some(m => m.indexOf(p) !== -1)) v = 60;
            else if (universale && (marca.indexOf(p) !== -1 || (perMarca[marca] || []).some(m => m.indexOf(p) !== -1))) v = 40;
            else if (p.length >= 3 && codici.some(c => c.indexOf(p) !== -1)) v = 50;
            else if (marca && marca.indexOf(p) !== -1) v = 20;
            else if (mzNorm(r.descrizione).indexOf(p) !== -1) v = 15;
            else if (perTutti && p.length >= 2 && tuttiModelli.some(m => m.indexOf(p) !== -1)) v = 30;
            if (!v) return;
            punti += v;
        }
        risultati.push({ r: r, punti: punti, esatto: esatto && parole.length === 1 });
    });
    risultati.sort((a, b) => {
        const qa = mzQta(a.r.id, furgone) > 0 || mzSenzaScorta(a.r) ? 1 : 0;
        const qb = mzQta(b.r.id, furgone) > 0 || mzSenzaScorta(b.r) ? 1 : 0;
        if (qa !== qb) return qb - qa;
        if (a.punti !== b.punti) return b.punti - a.punti;
        return String(a.r.marca + a.r.descrizione).localeCompare(String(b.r.marca + b.r.descrizione), 'it');
    });
    return risultati;
}

function mzRenderRisultati() {
    const box = document.getElementById('mz-risultati');
    if (!box) return;
    const furgone = mzFurgoneCorrente();
    if (!String(mzTestoCerca).trim()) {
        const sotto = mzRicambi.filter(r => mzSottoSoglia(r.id, furgone));
        box.innerHTML = '<p class="mz-aiuto">Scrivi il <strong>modello</strong> del robot o della macchina (es. <em>HRM1500</em>, <em>WR155E</em>): compaiono i ricambi compatibili, ' +
            'prima quelli che hai nel furgone <strong>' + mzEsc(mzNomeFurgone(furgone)) + '</strong>. Puoi anche leggere il codice a barre di un ricambio.</p>' +
            (sotto.length ? '<div class="mz-avviso">&#9888;&#65039; Nel furgone ' + mzEsc(mzNomeFurgone(furgone)) + ' ci sono <strong>' + sotto.length + '</strong> ricambi da ricaricare. ' +
                '<button type="button" class="btn-back mz-btn-piccolo" onclick="mzApriRicarica()">Vedi elenco</button></div>' : '');
        return;
    }
    const trovati = mzCercaRicambi(mzTestoCerca);
    if (!trovati.length) {
        box.innerHTML = '<p class="mz-vuoto">Nessun ricambio trovato per <strong>' + mzEsc(mzTestoCerca) + '</strong>.</p>';
        return;
    }
    const nelFurgone = trovati.filter(x => mzQta(x.r.id, furgone) > 0 || mzSenzaScorta(x.r)).length;
    box.innerHTML = '<p class="mz-conta">' + trovati.length + (trovati.length === 1 ? ' ricambio' : ' ricambi') + ' &middot; <strong>' + nelFurgone + '</strong> nel furgone ' + mzEsc(mzNomeFurgone(furgone)) + '</p>' +
        '<div class="mz-carte">' + trovati.slice(0, 200).map(x => mzHtmlCarta(x.r, furgone)).join('') + '</div>' +
        (trovati.length > 200 ? '<p class="mz-conta">Ne mostro 200: scrivi qualcosa in pi&ugrave; per restringere.</p>' : '');
}

function mzHtmlCarta(r, furgone) {
    const q = mzQta(r.id, furgone);
    const altri = mzFurgoni.filter(f => f.id !== furgone);
    const sotto = mzSottoSoglia(r.id, furgone);
    const senza = mzSenzaScorta(r);
    return '<div class="mz-carta' + (q > 0 || senza ? '' : ' mz-carta-zero') + '">' +
        '<div class="mz-carta-testa" onclick="mzApriRicambio(' + r.id + ')">' +
            '<span class="mz-marca' + (mzUniversaleTutto(r) ? ' mz-marca-tutte' : '') + '">' + mzEsc(r.marca || 'TUTTE') + '</span>' +
            '<strong>' + mzEsc(r.descrizione) + '</strong>' +
            (mzMetri(r) ? '<span class="mz-unita">a metri</span>' : '') +
            (r.codice ? '<span class="mz-codice">' + mzEsc(r.codice) + '</span>' : '') +
        '</div>' +
        (r.modelli ? '<div class="mz-carta-modelli">' + mzEsc(r.modelli) + '</div>' : '') +
        (r.note ? '<div class="mz-carta-note">&#9888;&#65039; ' + mzEsc(r.note) + '</div>' : '') +
        '<div class="mz-carta-piede">' +
            (senza ? '<span class="mz-qta mz-qta-senza" title="Non si conta nei furgoni">&#8734; senza scorta</span>' :
            '<span class="mz-qta' + (q > 0 ? (sotto ? ' mz-qta-poca' : ' mz-qta-ok') : ' mz-qta-zero') + '">' + mzEsc(mzNomeFurgone(furgone)) + ': <strong>' + mzQU(q, r) + '</strong></span>' +
            altri.map(f => '<span class="mz-qta-altro">' + mzEsc(f.nome) + ': ' + mzQU(mzQta(r.id, f.id), r) + '</span>').join('')) +
            '<span class="mz-prezzo">' + mzEuro(r.prezzo_ic) + (mzMetri(r) ? '<small> al metro</small>' : '') + '</span>' +
            '<button type="button" class="btn-primary mz-btn-piccolo" onclick="mzAggiungiABozza(' + r.id + ')" title="Aggiungi al rapportino">&#10133; Rapportino</button>' +
        '</div>' +
    '</div>';
}

// ---------- Rapportino in corso (bozza su questo dispositivo) ----------
function mzLeggiBozza() {
    try { return JSON.parse(localStorage.getItem('mzBozza') || 'null') || { righe: [] }; } catch (e) { return { righe: [] }; }
}
function mzScriviBozza(b) {
    try { localStorage.setItem('mzBozza', JSON.stringify(b)); } catch (e) { /* niente */ }
}

function mzAggiungiABozza(ricambioId) {
    // Se la finestra del rapportino e' aperta, il ricambio va li'
    if (mzRap && !document.getElementById('mz-rap-modal').classList.contains('hidden')) {
        mzRapAggiungiRicambio(ricambioId);
        return;
    }
    const r = mzRicambio(ricambioId);
    if (!r) return;
    const furgone = mzFurgoneCorrente();
    const b = mzLeggiBozza();
    if (!b.modello && mzTestoCerca && mzCercaRicambi(mzTestoCerca).every(x => !x.esatto)) b.modello = mzTesto(mzTestoCerca);
    const gia = b.righe.find(x => x.ricambio_id === r.id && x.furgone_id === furgone);
    if (gia) gia.quantita += 1;
    else b.righe.push({ ricambio_id: r.id, furgone_id: furgone, codice: r.codice || '', descrizione: r.descrizione, quantita: 1, prezzo_ic: r.prezzo_ic });
    b.furgone_id = furgone;
    mzScriviBozza(b);
    mzAggiornaBozzaBarra();
    mzToast('&#10133; ' + mzEsc(r.descrizione) + ' aggiunto al rapportino' + (gia ? ' (' + mzQU(gia.quantita, r) + ')' : '') +
        (mzMetri(r) ? ' &middot; scrivi i metri nel rapportino' : ''));
}

function mzAggiornaBozzaBarra() {
    const barra = document.getElementById('mz-bozza-barra');
    if (!barra) return;
    const b = mzLeggiBozza();
    const n = b.righe.length;
    if (!n) { barra.classList.add('hidden'); barra.innerHTML = ''; return; }
    barra.innerHTML = '<span>&#129534; Rapportino in corso: <strong>' + n + '</strong> ' + (n === 1 ? 'ricambio' : 'ricambi') + '</span>' +
        '<button type="button" class="btn-primary mz-btn-piccolo" onclick="mzApriNuovoRapportino()">Apri</button>' +
        '<button type="button" class="btn-back mz-btn-piccolo" onclick="mzSvuotaBozza()">Svuota</button>';
    barra.classList.remove('hidden');
}

function mzSvuotaBozza() {
    if (!window.confirm('Svuotare il rapportino in corso? I ricambi non sono ancora stati scaricati dal furgone.')) return;
    mzScriviBozza({ righe: [] });
    mzAggiornaBozzaBarra();
}

let mzToastTimer = null;
function mzToast(html) {
    let t = document.getElementById('mz-toast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'mz-toast';
        t.className = 'mz-toast';
        document.body.appendChild(t);
    }
    t.innerHTML = html;
    t.classList.add('mz-toast-visibile');
    clearTimeout(mzToastTimer);
    mzToastTimer = setTimeout(() => t.classList.remove('mz-toast-visibile'), 2500);
}

// ---------- GIACENZE (catalogo e quantita' nei furgoni) ----------
function mzHtmlGiacenze() {
    const marche = Array.from(new Set(mzRicambi.map(r => r.marca).filter(Boolean))).sort();
    return '<div class="mz-strumenti">' +
            '<input type="search" class="mz-cerca-piccola" placeholder="Cerca marca, modello, codice, descrizione..." value="' + mzEsc(mzGiacFiltro.testo) + '" oninput="mzGiacImposta(\'testo\', this.value)">' +
            '<select onchange="mzGiacImposta(\'marca\', this.value)"><option value="">Tutte le marche</option>' +
                marche.map(m => '<option' + (m === mzGiacFiltro.marca ? ' selected' : '') + '>' + mzEsc(m) + '</option>').join('') + '</select>' +
            '<label class="mz-check"><input type="checkbox"' + (mzGiacFiltro.sotto ? ' checked' : '') + ' onchange="mzGiacImposta(\'sotto\', this.checked)"> Solo da ricaricare</label>' +
        '</div>' +
        (!mzPuoGestire() ? '<p class="mz-aiuto">Tocca un ricambio per vedere la scheda. Carico e rettifiche li fanno admin e operatori.</p>' :
        '<div class="mz-strumenti">' +
            '<button type="button" class="btn-primary" onclick="mzApriRicambio(null)">&#10133; Nuovo ricambio</button>' +
            '<button type="button" class="btn-back" onclick="document.getElementById(\'mz-file-excel\').click()">&#128229; Carica Excel</button>' +
            '<button type="button" class="btn-back" onclick="mzScaricaExcel()">&#128228; Scarica Excel</button>' +
            '<button type="button" class="btn-back" onclick="mzApriRicarica()">&#128666; Da ricaricare</button>' +
            '<button type="button" class="btn-back" id="mz-btn-etichette" onclick="mzStampaEtichetteSelezionate()">&#127991;&#65039; Etichette</button>' +
        '</div>') +
        '<p id="mz-giac-conta" class="mz-conta"></p>' +
        '<div class="mz-tab-scroll"><table class="mz-tab" id="mz-giac-tab"></table></div>';
}

function mzGiacImposta(campo, valore) {
    mzGiacFiltro[campo] = valore;
    mzRenderTabellaGiacenze();
}

function mzGiacFiltrati() {
    const parole = String(mzGiacFiltro.testo || '').split(/\s+/).map(mzNorm).filter(Boolean);
    return mzRicambi.filter(r => {
        if (mzGiacFiltro.marca && r.marca !== mzGiacFiltro.marca) return false;
        if (mzGiacFiltro.sotto && !mzFurgoni.some(f => mzSottoSoglia(r.id, f.id))) return false;
        if (parole.length) {
            const t = mzNorm([r.marca, r.modelli, r.codice, r.codice_barre, r.codice_ean, r.descrizione, r.note].join(' '));
            if (!parole.every(p => t.indexOf(p) !== -1)) return false;
        }
        return true;
    });
}

function mzRenderTabellaGiacenze() {
    const tab = document.getElementById('mz-giac-tab');
    if (!tab) return;
    const lista = mzGiacFiltrati();
    const conta = document.getElementById('mz-giac-conta');
    const nSel = Object.keys(mzSelezionati).length;
    if (conta) conta.innerHTML = lista.length + (lista.length === 1 ? ' ricambio' : ' ricambi') + (lista.length !== mzRicambi.length ? ' su ' + mzRicambi.length : '') +
        (nSel ? ' &middot; <strong>' + nSel + '</strong> selezionati per le etichette' : '');
    const btn = document.getElementById('mz-btn-etichette');
    if (btn) btn.innerHTML = '&#127991;&#65039; Etichette' + (nSel ? ' (' + nSel + ')' : '');
    if (!lista.length) {
        tab.innerHTML = '<tbody><tr><td class="mz-vuoto">' + (mzRicambi.length ? 'Nessun ricambio con questi filtri.' : 'Nessun ricambio: aggiungine uno o carica il file Excel.') + '</td></tr></tbody>';
        return;
    }
    const tutti = lista.every(r => mzSelezionati[r.id]);
    const sel = mzPuoGestire();
    tab.innerHTML = '<thead><tr>' +
            (sel ? '<th class="mz-col-sel"><input type="checkbox" title="Seleziona tutti (etichette)"' + (tutti ? ' checked' : '') + ' onchange="mzSelezionaTutti(this.checked)"></th>' : '') +
            '<th>Marca</th><th>Codice</th><th>Ricambio</th><th>Modelli</th><th class="mz-n">Prezzo IC</th>' +
            mzFurgoni.map(f => '<th class="mz-n">' + mzEsc(f.nome) + '</th>').join('') +
        '</tr></thead><tbody>' +
        lista.map(r => '<tr>' +
            (sel ? '<td class="mz-col-sel"><input type="checkbox"' + (mzSelezionati[r.id] ? ' checked' : '') + ' onchange="mzSeleziona(' + r.id + ', this.checked)"></td>' : '') +
            '<td onclick="mzApriRicambio(' + r.id + ')">' + mzEsc(r.marca) + '</td>' +
            '<td onclick="mzApriRicambio(' + r.id + ')" class="mz-codice-cella">' + mzEsc(r.codice || '') + '</td>' +
            '<td onclick="mzApriRicambio(' + r.id + ')"><strong>' + mzEsc(r.descrizione) + '</strong>' + (r.note ? '<div class="mz-carta-note">' + mzEsc(r.note) + '</div>' : '') + '</td>' +
            '<td onclick="mzApriRicambio(' + r.id + ')" class="mz-modelli-cella">' + mzEsc(r.modelli || '') + '</td>' +
            '<td onclick="mzApriRicambio(' + r.id + ')" class="mz-n">' + mzEuro(r.prezzo_ic) + '</td>' +
            mzFurgoni.map(f => {
                if (mzSenzaScorta(r)) return '<td onclick="mzApriRicambio(' + r.id + ')" class="mz-n mz-cella-senza" title="Senza scorta: non si conta">&#8734;</td>';
                const q = mzQta(r.id, f.id);
                const s = mzSoglia(r.id, f.id);
                const cls = mzSottoSoglia(r.id, f.id) ? (q === 0 ? 'mz-cella-zero' : 'mz-cella-poca') : (q === 0 ? 'mz-cella-vuota' : '');
                return '<td onclick="mzApriRicambio(' + r.id + ')" class="mz-n ' + cls + '"><strong>' + mzQU(q, r) + '</strong>' + (s ? '<small> / ' + mzQ(s) + '</small>' : '') + '</td>';
            }).join('') +
        '</tr>').join('') + '</tbody>';
}

function mzSeleziona(id, si) {
    if (si) mzSelezionati[id] = true; else delete mzSelezionati[id];
    mzRenderTabellaGiacenze();
}
function mzSelezionaTutti(si) {
    mzGiacFiltrati().forEach(r => { if (si) mzSelezionati[r.id] = true; else delete mzSelezionati[r.id]; });
    mzRenderTabellaGiacenze();
}

// ---------- Scheda del ricambio (nuovo / modifica, carico e rettifica per furgone) ----------
const MZ_CAMPI_RICAMBIO = [
    ['marca', 'Marca (TUTTE = va bene per tutte le marche)', 'text'], ['unita', 'Si conta a', 'unita'], ['descrizione', 'Ricambio (descrizione) *', 'text'],
    ['modelli', 'Modelli compatibili (separati da virgola; TUTTI = tutti quelli della marca)', 'area'],
    ['codice', 'Codice ricambio', 'text'], ['codice_barre', 'Codice a barre (vuoto = si usa il codice)', 'text'],
    ['prezzo_ivae', 'Prezzo IVA esclusa', 'euro'], ['prezzo_ic', 'Prezzo IVA compresa', 'euro'],
    ['codice_ean', 'Codice EAN', 'text'], ['codice_easy', 'Codice EASY', 'text'],
    ['codice_gestionale', 'Codice gestionale', 'text'], ['codice_precedente', 'Codice precedente', 'text'],
    ['note', 'Note', 'area']
];

// Scheda in sola lettura per i tecnici (niente prezzo IVA esclusa, niente carico/rettifica)
function mzSchedaSolaLettura(r) {
    const riga = (et, v) => v ? '<tr><td><strong>' + et + '</strong></td><td>' + v + '</td></tr>' : '';
    const html = '<table class="mz-scheda-ro">' +
        riga('Codice', mzEsc(r.codice || '')) + riga('Marca', mzEsc(r.marca || '')) + riga('Modelli', mzEsc(r.modelli || '')) +
        riga('Prezzo IVA compresa', mzEuro(r.prezzo_ic) + (mzMetri(r) ? ' al metro' : '')) +
        (mzSenzaScorta(r) ? riga('Furgoni', 'senza scorta (non si conta, si usa nei rapportini)') :
        mzFurgoni.map(f => riga('&#128656; ' + mzEsc(f.nome), mzQU(mzQta(r.id, f.id), r) + (mzSottoSoglia(r.id, f.id) ? ' &#9888;&#65039;' : ''))).join('')) +
        riga('Codice a barre', mzEsc(r.codice_barre || '')) + riga('Note', mzEsc(r.note || '')) + '</table>';
    showCustomAlert(html, mzEsc(r.descrizione), '&#128295;');
}

function mzApriRicambio(id) {
    const r = id ? mzRicambio(id) : null;
    if (id && !r) return;
    if (!mzPuoGestire()) { if (r) mzSchedaSolaLettura(r); return; }
    mzRicAperto = r;
    document.getElementById('mz-ric-titolo').innerHTML = r ? '&#128295; ' + mzEsc(r.descrizione) : '&#10133; Nuovo ricambio';
    document.getElementById('mz-ric-campi').innerHTML = MZ_CAMPI_RICAMBIO.map(([campo, etichetta, tipo]) => {
        const v = r ? r[campo] : '';
        const input = tipo === 'unita'
            ? '<select id="mz-ric-unita"><option value="PZ"' + (mzMetri(r) ? '' : ' selected') + '>Pezzi</option><option value="MT"' + (mzMetri(r) ? ' selected' : '') + '>Metri (es. cavo perimetrale)</option></select>'
            : tipo === 'area'
            ? '<textarea id="mz-ric-' + campo + '" rows="2">' + mzEsc(v || '') + '</textarea>'
            : '<input type="text" id="mz-ric-' + campo + '" autocomplete="off"' + (tipo === 'euro' ? ' inputmode="decimal"' : '') +
                (campo === 'prezzo_ivae' ? ' oninput="mzRicPrezzoIc()"' : '') + ' value="' + mzEsc(tipo === 'euro' ? mzNumForm(v) : (v || '')) + '">';
        return '<div class="mz-campo mz-campo-' + campo + '"><label for="mz-ric-' + campo + '">' + etichetta + '</label>' + input + '</div>';
    }).join('') +
        (mzColSenzaScorta ? '<label class="mz-campo mz-senza-scorta"><input type="checkbox" id="mz-ric-senza_scorta"' + (mzSenzaScorta(r) ? ' checked' : '') + '> ' +
            '<span><strong>Senza scorta</strong>: non si conta nei furgoni (niente quantit&agrave;, avvisi e inventario), ma si pu&ograve; mettere nei rapportini con il suo prezzo. Es. olio, grasso, minuteria.</span></label>' : '');
    document.getElementById('mz-ric-furgoni').innerHTML = '<h4>&#128656; Nei furgoni</h4>' + mzFurgoni.map(f => {
        const q = r ? mzQta(r.id, f.id) : 0;
        const s = r ? mzSoglia(r.id, f.id) : 0;
        const passo = mzMetri(r) ? '0.1' : '1';
        return '<div class="mz-ric-furgone">' +
            '<div class="mz-ric-furgone-nome">' + mzEsc(f.nome) + '<span class="mz-qta' + (q > 0 ? ' mz-qta-ok' : ' mz-qta-zero') + '">' + mzQU(q, r) + '</span></div>' +
            '<label>Soglia avviso <input type="number" min="0" max="9999" step="' + passo + '" id="mz-ric-soglia-' + f.id + '" value="' + mzCent(s) + '"></label>' +
            (r ? '<label>' + (mzMetri(r) ? 'Metri' : 'Quantit&agrave;') + ' <input type="number" min="0" max="9999" step="' + passo + '" id="mz-ric-q-' + f.id + '" placeholder="es. ' + (mzMetri(r) ? '25' : '2') + '"></label>' +
                '<button type="button" class="btn-primary mz-btn-piccolo" onclick="mzRicMuovi(' + f.id + ', \'CARICO\')" title="Aggiunge la quantit&agrave; scritta">&#10133; Carica</button>' +
                '<button type="button" class="btn-back mz-btn-piccolo" onclick="mzRicMuovi(' + f.id + ', \'RETTIFICA\')" title="La quantit&agrave; nel furgone diventa quella scritta (inventario)">= Rettifica</button>'
              : '<label>Quantit&agrave; iniziale <input type="number" min="0" max="9999" step="0.1" id="mz-ric-q-' + f.id + '" value="0"></label>') +
        '</div>';
    }).join('') + '<p class="mz-aiuto">La <strong>soglia</strong> &egrave; la quantit&agrave; a cui parte l&#39;avviso &quot;da ricaricare&quot; (0 = nessun avviso). ' +
        '<strong>Carica</strong> aggiunge i pezzi presi dal negozio; <strong>Rettifica</strong> mette la quantit&agrave; contata.</p>';
    document.getElementById('mz-ric-elimina').classList.toggle('hidden', !r);
    document.getElementById('mz-ric-etichetta').classList.toggle('hidden', !r);
    document.getElementById('mz-ric-modal').classList.remove('hidden');
}

function mzChiudiRicambio() {
    document.getElementById('mz-ric-modal').classList.add('hidden');
    mzRicAperto = null;
}

// Prezzo IVA compresa proposto dal prezzo IVA esclusa (si puo' cambiare)
function mzRicPrezzoIc() {
    const e = mzNum(document.getElementById('mz-ric-prezzo_ivae').value);
    const ic = document.getElementById('mz-ric-prezzo_ic');
    if (e !== null && (!ic.value || ic.dataset.auto === '1')) {
        ic.value = mzNumForm(mzCent(e * (1 + MZ_IVA / 100)));
        ic.dataset.auto = '1';
    }
}

function mzRicLeggi() {
    const v = {};
    MZ_CAMPI_RICAMBIO.forEach(([campo, , tipo]) => {
        const el = document.getElementById('mz-ric-' + campo);
        if (tipo === 'unita') v[campo] = el.value === 'MT' ? 'MT' : 'PZ';
        else if (tipo === 'euro') { const n = mzNum(el.value); v[campo] = n === null ? null : mzCent(n); }
        else if (campo === 'modelli') v[campo] = mzUnisciModelli([String(el.value || '')]);
        else v[campo] = mzTesto(el.value) || (campo === 'marca' ? '' : null);
    });
    const senza = document.getElementById('mz-ric-senza_scorta');
    if (senza && mzColSenzaScorta) v.senza_scorta = senza.checked;
    return v;
}

// Modelli: unisce piu' elenchi senza doppioni (HRM1000, HRM 1000 = uguali)
function mzUnisciModelli(elenchi) {
    const visti = {};
    const out = [];
    elenchi.forEach(t => String(t || '').split(',').map(x => mzTesto(x)).filter(Boolean).forEach(m => {
        const k = mzNorm(m);
        if (!visti[k]) { visti[k] = true; out.push(m); }
    }));
    return out.join(', ');
}

async function mzSalvaRicambio() {
    if (!mzPuoGestire()) return;   // solo admin e operatori
    const v = mzRicLeggi();
    if (!v.descrizione) { await showCustomAlert('Scrivi la <strong>descrizione</strong> del ricambio.', 'Ricambio', '&#9888;&#65039;'); return; }
    const doppio = v.codice && mzRicambi.find(r => r.id !== (mzRicAperto && mzRicAperto.id) && mzNorm(r.codice) === mzNorm(v.codice));
    if (doppio) {
        await showCustomAlert('Esiste gi&agrave; un ricambio con il codice <strong>' + mzEsc(v.codice) + '</strong>: ' + mzEsc(doppio.descrizione) +
            '.<br>Aprilo e aggiungi i modelli l&igrave;, cos&igrave; non ci sono doppioni.', 'Codice gi&agrave; presente', '&#9888;&#65039;');
        return;
    }
    v.updated_at = new Date().toISOString();
    v.updated_by = mzEmail();
    const btn = document.getElementById('mz-ric-salva');
    btn.disabled = true;
    try {
        let id;
        if (mzRicAperto) {
            const { error } = await supabaseClient.from('mezzi_ricambi').update(v).eq('id', mzRicAperto.id);
            if (error) throw error;
            id = mzRicAperto.id;
        } else {
            v.created_by = mzEmail();
            const { data, error } = await supabaseClient.from('mezzi_ricambi').insert([v]).select().single();
            if (error) throw error;
            id = data.id;
        }
        // Soglie (e quantita' iniziale per un ricambio nuovo)
        for (const f of mzFurgoni) {
            const s = Math.max(0, mzLeggiQ(document.getElementById('mz-ric-soglia-' + f.id).value, v.unita === 'MT') || 0);
            const res = await supabaseClient.rpc('mezzi_muovi', { p_ricambio: id, p_furgone: f.id, p_delta: 0, p_tipo: 'RETTIFICA', p_rapportino: null, p_nota: null });
            if (res.error) throw res.error;
            if (s !== mzSoglia(id, f.id) || !mzGiacenze[mzChiave(id, f.id)]) {
                const { error } = await supabaseClient.from('mezzi_giacenze').update({ soglia: s }).eq('ricambio_id', id).eq('furgone_id', f.id);
                if (error) throw error;
            }
            if (!mzRicAperto) {
                const q = Math.max(0, mzLeggiQ(document.getElementById('mz-ric-q-' + f.id).value, v.unita === 'MT') || 0);
                if (q) {
                    const r2 = await supabaseClient.rpc('mezzi_muovi', { p_ricambio: id, p_furgone: f.id, p_delta: q, p_tipo: 'CARICO', p_rapportino: null, p_nota: 'NUOVO RICAMBIO' });
                    if (r2.error) throw r2.error;
                }
            }
        }
        await mzCarica();
        mzChiudiRicambio();
        mzRender();
        mzToast('&#10004; Ricambio salvato');
    } catch (err) {
        mzErrore(err, 'salvataggio ricambio');
    }
    btn.disabled = false;
}

// Carica (+) o rettifica (=) la quantita' di un furgone dalla scheda
async function mzRicMuovi(furgoneId, tipo) {
    if (!mzPuoGestire()) return;   // solo admin e operatori
    const r = mzRicAperto;
    if (!r) return;
    const el = document.getElementById('mz-ric-q-' + furgoneId);
    const n = mzLeggiQ(el.value, mzMetri(r));
    if (n === null || n < 0 || (tipo === 'CARICO' && n === 0)) { await showCustomAlert('Scrivi la quantit&agrave;.', 'Quantit&agrave;', '&#9888;&#65039;'); return; }
    const prima = mzQta(r.id, furgoneId);
    const delta = mzCent(tipo === 'CARICO' ? n : n - prima);
    if (!delta) { el.value = ''; return; }
    const msg = tipo === 'CARICO'
        ? 'Caricare ' + mzQU(n, r) + ' x ' + r.descrizione + ' nel furgone ' + mzNomeFurgone(furgoneId) + '?\n\nPassa da ' + mzQU(prima, r) + ' a ' + mzQU(prima + n, r) + '.'
        : 'Rettifica: nel furgone ' + mzNomeFurgone(furgoneId) + ' ci sono ' + mzQU(n, r) + ' di ' + r.descrizione + ' (prima ' + mzQU(prima, r) + ')?';
    if (!window.confirm(msg)) return;
    await mzMuovi(r.id, furgoneId, delta, tipo, null, tipo === 'CARICO' ? 'DAL NEGOZIO' : 'INVENTARIO');
    el.value = '';
    mzApriRicambio(r.id);
    mzRender();
}

// Una variazione di quantita' (con controllo soglia per l'avviso)
async function mzMuovi(ricambioId, furgoneId, delta, tipo, rapportinoId, nota) {
    const { data, error } = await supabaseClient.rpc('mezzi_muovi', {
        p_ricambio: ricambioId, p_furgone: furgoneId, p_delta: delta, p_tipo: tipo,
        p_rapportino: rapportinoId || null, p_nota: nota || null
    });
    if (error) { mzErrore(error, 'quantit&agrave; nel furgone'); return null; }
    const riga = Array.isArray(data) ? data[0] : data;
    if (riga) {
        mzGiacenze[mzChiave(ricambioId, furgoneId)] = { quantita: riga.quantita_dopo, soglia: riga.soglia };
        mzControllaSoglia(ricambioId, furgoneId, riga.quantita_prima, riga.quantita_dopo, riga.soglia);
    }
    return riga;
}

// Avviso quando si arriva alla soglia o il ricambio finisce (una volta sola, nel momento in cui succede)
function mzControllaSoglia(ricambioId, furgoneId, prima, dopo, soglia) {
    try {
        const s = Number(soglia) || 0;
        const arrivaSoglia = s > 0 && prima > s && dopo <= s;
        const finito = prima > 0 && dopo <= 0;
        if (!arrivaSoglia && !finito) return;
        if (typeof listinoRegistraNotifica !== 'function') return;
        const r = mzRicambio(ricambioId);
        if (!r) return;
        const righe = [
            { e: 'Furgone', v: mzNomeFurgone(furgoneId) },
            { e: 'Codice', v: r.codice || '-' },
            { e: 'Quantit\u00E0 rimasta', v: mzQU(dopo, r) + (s ? ' (soglia ' + mzQ(s) + ')' : '') + (dopo <= 0 ? ' - ESAURITO' : '') },
            { e: 'Marca', v: r.marca || '-' }
        ];
        listinoRegistraNotifica('SOTTOSOGLIA_FURGONE', r.descrizione + (r.codice ? ' (' + r.codice + ')' : ''), righe, null, r.codice || r.descrizione);
    } catch (err) {
        console.log('Avviso furgone non registrato:', err && err.message ? err.message : err);
    }
}

async function mzEliminaRicambio() {
    if (!mzPuoGestire()) return;   // solo admin e operatori
    const r = mzRicAperto;
    if (!r) return;
    const tot = mzFurgoni.reduce((t, f) => t + mzQta(r.id, f.id), 0);
    if (!window.confirm('Eliminare il ricambio ' + r.descrizione + (r.codice ? ' (' + r.codice + ')' : '') + '?' +
        (tot ? '\n\nAttenzione: nei furgoni ce ne sono ancora ' + tot + '.' : '') + '\n\nI rapportini gi\u00E0 fatti non cambiano.')) return;
    const { error } = await supabaseClient.from('mezzi_ricambi').delete().eq('id', r.id);
    if (error) { mzErrore(error, 'eliminazione ricambio'); return; }
    delete mzSelezionati[r.id];
    await mzCarica();
    mzChiudiRicambio();
    mzRender();
}

// ---------- Da ricaricare (per furgone) ----------
function mzApriRicarica() {
    if (!mzPuoGestire()) return;   // solo admin e operatori
    const html = mzFurgoni.map(f => {
        const lista = mzRicambi.filter(r => mzSottoSoglia(r.id, f.id));
        return '<h4>&#128656; ' + mzEsc(f.nome) + ' <small>(' + lista.length + ')</small></h4>' +
            (lista.length ? '<table class="mz-tab mz-tab-piccola"><thead><tr><th>Marca</th><th>Codice</th><th>Ricambio</th><th class="mz-n">Ci sono</th><th class="mz-n">Soglia</th></tr></thead><tbody>' +
                lista.map(r => '<tr><td>' + mzEsc(r.marca) + '</td><td>' + mzEsc(r.codice || '') + '</td><td>' + mzEsc(r.descrizione) + '</td>' +
                    '<td class="mz-n ' + (mzQta(r.id, f.id) ? 'mz-cella-poca' : 'mz-cella-zero') + '"><strong>' + mzQU(mzQta(r.id, f.id), r) + '</strong></td><td class="mz-n">' + mzQ(mzSoglia(r.id, f.id)) + '</td></tr>').join('') +
                '</tbody></table>' : '<p class="mz-vuoto">&#9989; Niente da ricaricare.</p>');
    }).join('');
    document.getElementById('mz-ricarica-corpo').innerHTML = html;
    document.getElementById('mz-ricarica-modal').classList.remove('hidden');
}
function mzChiudiRicarica() { document.getElementById('mz-ricarica-modal').classList.add('hidden'); }

function mzStampaRicarica() {
    const html = '<div class="rpt-pagina mzr">' + mzHtmlTestaPdf('Da ricaricare nei furgoni', 'Al ' + mzDataIt(mzOggi())) +
        document.getElementById('mz-ricarica-corpo').innerHTML.replace(/class="mz-tab mz-tab-piccola"/g, 'class="rpt-tab"').replace(/<h4>/g, '<div class="rpt-sezione">').replace(/<\/h4>/g, '</div>') +
    '</div>';
    pdfApriInScheda(async () => (await pdfCreaDaHtml(html, { margini: { alto: 10, sx: 10, basso: 10, dx: 10 }, numeriPagina: true })).output('blob'),
        'DA RICARICARE FURGONI ' + mzDataIt(mzOggi()).replace(/\//g, '-') + '.pdf');
}

// ---------- Movimenti ----------
async function mzCaricaMovimenti() {
    if (!mzPuoGestire()) return;   // solo admin e operatori
    const box = document.getElementById('mz-contenuto');
    const { data, error } = await supabaseClient.from('mezzi_movimenti').select('*').order('created_at', { ascending: false }).limit(300);
    if (mzTab !== 'movimenti' || !box) return;
    if (error) { box.innerHTML = ''; mzErrore(error, 'movimenti'); return; }
    const TIPI = { CARICO: '&#10133; Carico', USO: '&#128295; Usato', RESO: '&#8617;&#65039; Tornato', RETTIFICA: '= Rettifica', IMPORT: '&#128229; Import' };
    box.innerHTML = '<p class="mz-conta">Ultimi ' + (data || []).length + ' movimenti</p>' +
        '<div class="mz-tab-scroll"><table class="mz-tab"><thead><tr><th>Quando</th><th>Furgone</th><th>Tipo</th><th>Ricambio</th><th class="mz-n">Q.t&agrave;</th><th class="mz-n">Dopo</th><th>Note</th><th>Chi</th></tr></thead><tbody>' +
        (data || []).map(m => {
            const r = mzRicambio(m.ricambio_id);
            const rap = m.rapportino_id ? mzRapportini.find(x => x.id === m.rapportino_id) : null;
            return '<tr><td>' + mzDataOra(m.created_at) + '</td><td>' + mzEsc(mzNomeFurgone(m.furgone_id)) + '</td><td>' + (TIPI[m.tipo] || mzEsc(m.tipo)) + '</td>' +
                '<td>' + (r ? mzEsc(r.descrizione) + (r.codice ? ' <small>' + mzEsc(r.codice) + '</small>' : '') : '<em>eliminato</em>') + '</td>' +
                '<td class="mz-n ' + (m.quantita < 0 ? 'mz-meno' : 'mz-piu') + '">' + (m.quantita > 0 ? '+' : '') + mzQU(m.quantita, r) + '</td><td class="mz-n">' + (m.quantita_dopo === null ? '' : mzQU(m.quantita_dopo, r)) + '</td>' +
                '<td>' + (rap ? '<a href="#" onclick="mzApriRapportino(' + rap.id + '); return false;">Rapportino ' + mzNumeroRap(rap) + '</a> ' : '') + mzEsc(m.nota || '') + '</td>' +
                '<td>' + mzEsc(String(m.utente || '').split('@')[0]) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
}

// ---------- RAPPORTINI ----------
function mzNumeroRap(x) { return String(x.numero).padStart(4, '0') + '/' + x.anno; }

function mzHtmlRapportini() {
    const anni = Array.from(new Set(mzRapportini.map(x => x.anno))).sort((a, b) => b - a);
    return '<div class="mz-strumenti">' +
            '<button type="button" class="btn-primary" onclick="mzApriNuovoRapportino()">&#10133; Nuovo rapportino</button>' +
            '<input type="search" class="mz-cerca-piccola" placeholder="Cerca numero, cliente, modello, matricola, tecnico..." value="' + mzEsc(mzRapCerca) + '" oninput="mzRapCerca = this.value; mzRenderElencoRapportini()">' +
            '<select onchange="mzRapAnno = this.value; mzRenderElencoRapportini()"><option value="TUTTI">Tutti gli anni</option>' +
                anni.map(a => '<option' + (String(a) === String(mzRapAnno) ? ' selected' : '') + '>' + a + '</option>').join('') + '</select>' +
            (mzPuoGestire() ? '<button type="button" class="btn-back" id="mz-prova-drive" onclick="mzProvaDrive()">&#128193; Prova Drive</button>' : '') +
        '</div><p id="mz-rap-conta" class="mz-conta"></p><div class="mz-tab-scroll"><table class="mz-tab" id="mz-rap-tab"></table></div>';
}

function mzRenderElencoRapportini() {
    const tab = document.getElementById('mz-rap-tab');
    if (!tab) return;
    const parole = String(mzRapCerca || '').split(/\s+/).map(mzNorm).filter(Boolean);
    const lista = mzRapportini.filter(x => {
        if (mzRapAnno !== 'TUTTI' && String(x.anno) !== String(mzRapAnno)) return false;
        if (parole.length) {
            const t = mzNorm([mzNumeroRap(x), x.numero, x.cliente, x.telefono, x.indirizzo, x.modello, x.matricola, x.tecnico, x.lavori].join(' '));
            if (!parole.every(p => t.indexOf(p) !== -1)) return false;
        }
        return true;
    });
    const conta = document.getElementById('mz-rap-conta');
    if (conta) conta.innerHTML = lista.length + (lista.length === 1 ? ' rapportino' : ' rapportini') + ' &middot; totale ' + mzEuro(lista.reduce((t, x) => t + Number(x.totale || 0), 0));
    if (!lista.length) { tab.innerHTML = '<tbody><tr><td class="mz-vuoto">Nessun rapportino.</td></tr></tbody>'; return; }
    tab.innerHTML = '<thead><tr><th>N.</th><th>Data</th><th>Cliente</th><th>Macchina</th><th>Tecnico</th><th class="mz-n">Totale</th><th>Drive</th></tr></thead><tbody>' +
        lista.map(x => '<tr onclick="mzApriRapportino(' + x.id + ')">' +
            '<td><strong>' + mzNumeroRap(x) + '</strong></td><td>' + mzDataIt(x.data) + '</td><td>' + mzEsc(x.cliente) + '</td>' +
            '<td>' + mzEsc([x.modello, x.matricola ? 'MATR. ' + x.matricola : ''].filter(Boolean).join(' - ')) + '</td>' +
            '<td>' + mzEsc(x.tecnico || '') + '</td><td class="mz-n"><strong>' + mzEuro(x.totale) + '</strong></td>' +
            '<td>' + (mzDriveInCorso[x.id] ? '&#8987;' : (x.drive_url ? '&#128193;' : (mzDriveErrore[x.id] ? '&#10060;' : ''))) + '</td></tr>').join('') + '</tbody>';
}

// Il tecnico collegato all'app (email uguale a quella scritta nella tabella tecnici)
function mzTecnicoMio() {
    const email = String(mzEmail() || '').trim().toLowerCase();
    if (!email) return null;
    return mzTecnici.find(t => String(t.email || '').trim().toLowerCase() === email) || null;
}

function mzApriNuovoRapportino() {
    const b = mzLeggiBozza();
    const mio = mzTecnicoMio();
    mzRap = {
        id: null, data: mzOggi(), cliente: '', telefono: '', indirizzo: '', modello: b.modello || '', matricola: '', lavori: '',
        ore: 0, tariffa_oraria: MZ_TARIFFA_ORA, iva: MZ_IVA, uscita: 0, note: '', tecnico: mio ? mio.nome : '',
        furgone_id: b.furgone_id || mzFurgoneCorrente(),
        righe: (b.righe || []).map(x => Object.assign({}, x)),
        daBozza: true
    };
    mzRapRigheOrig = [];
    mzRapMostra();
}

async function mzApriRapportino(id) {
    const x = mzRapportini.find(r => r.id === id);
    if (!x) return;
    const { data, error } = await supabaseClient.from('mezzi_rapportini_righe').select('*').eq('rapportino_id', id).order('posizione');
    if (error) { mzErrore(error, 'righe del rapportino'); return; }
    mzRapRigheOrig = (data || []).map(r => Object.assign({}, r));
    mzRap = Object.assign({}, x, { righe: (data || []).map(r => Object.assign({}, r)), daBozza: false });
    mzRapMostra();
}

function mzOreDivise(ore) {
    const n = Number(ore) || 0;
    let h = Math.floor(n);
    let m = Math.round((n - h) * 60);
    if (m === 60) { h += 1; m = 0; }
    return { h: h, m: m };
}

function mzRapMostra() {
    const x = mzRap;
    const nuovo = !x.id;
    document.getElementById('mz-rap-titolo').innerHTML = nuovo ? '&#129534; Nuovo rapportino di intervento' : '&#129534; Rapportino N. ' + mzNumeroRap(x);
    const od = mzOreDivise(x.ore);
    const tecnici = mzTecnici.map(t => t.nome);
    if (x.tecnico && tecnici.indexOf(x.tecnico) === -1) tecnici.push(x.tecnico);
    document.getElementById('mz-rap-corpo').innerHTML =
        (nuovo ? '' : '<div id="mz-rap-drive" class="mz-drive">' + mzStatoDriveHtml(x) + '</div>') +
        '<div class="mz-rich">' +
            '<label for="mz-r-rich-cerca">&#128203; Dati del cliente da una richiesta di intervento</label>' +
            '<div id="mz-r-rich-scelta" class="mz-rich-scelta">' + mzHtmlRichiestaScelta(x.richiesta_id) + '</div>' +
            '<input type="search" id="mz-r-rich-cerca" autocomplete="off" placeholder="Cerca cliente, telefono o paese della richiesta..." oninput="mzRichMostra(this.value)" onfocus="mzRichMostra(this.value)">' +
            '<div id="mz-r-rich-elenco" class="mz-r-trovati"></div>' +
        '</div>' +
        '<div class="mz-due">' +
            '<div><label for="mz-r-data">Data intervento *</label><input type="date" id="mz-r-data" value="' + mzEsc(x.data || mzOggi()) + '"></div>' +
            '<div><label for="mz-r-tecnico">Tecnico <small>(solo per noi: non va sul PDF)</small></label><select id="mz-r-tecnico" onchange="mzRichAggiornaSeVuoto()"><option value="">- scegli -</option>' +
                tecnici.map(n => '<option' + (n === x.tecnico ? ' selected' : '') + '>' + mzEsc(n) + '</option>').join('') + '</select></div>' +
        '</div>' +
        '<label for="mz-r-cliente">Cliente *</label><input type="text" id="mz-r-cliente" autocomplete="off" value="' + mzEsc(x.cliente || '') + '">' +
        '<div class="mz-due">' +
            '<div><label for="mz-r-telefono">Telefono</label><input type="tel" id="mz-r-telefono" autocomplete="off" value="' + mzEsc(x.telefono || '') + '"></div>' +
            '<div><label for="mz-r-indirizzo">Indirizzo / paese</label><input type="text" id="mz-r-indirizzo" autocomplete="off" value="' + mzEsc(x.indirizzo || '') + '" oninput="mzRapUscitaAuto(true)"></div>' +
        '</div>' +
        '<div class="mz-due">' +
            '<div><label for="mz-r-modello">Modello della macchina</label><input type="text" id="mz-r-modello" autocomplete="off" value="' + mzEsc(x.modello || '') + '"></div>' +
            '<div><label for="mz-r-matricola">Matricola</label><input type="text" id="mz-r-matricola" autocomplete="off" value="' + mzEsc(x.matricola || '') + '"></div>' +
        '</div>' +
        '<label for="mz-r-lavori">Lavori eseguiti *</label><textarea id="mz-r-lavori" rows="3">' + mzEsc(x.lavori || '') + '</textarea>' +
        '<div class="mz-sezione-form">&#128295; Ricambi usati</div>' +
        '<div class="mz-due">' +
            '<div><label for="mz-r-furgone">Ricambi presi dal furgone</label><select id="mz-r-furgone" onchange="mzRapCambiaFurgone(this.value)">' +
                mzFurgoni.map(f => '<option value="' + f.id + '"' + (f.id === x.furgone_id ? ' selected' : '') + '>' + mzEsc(f.nome) + '</option>').join('') + '</select></div>' +
            '<div><label for="mz-r-cerca">Aggiungi ricambio (modello, codice, descrizione)</label><input type="search" id="mz-r-cerca" autocomplete="off" placeholder="es. HRM1500 lame" oninput="mzRapCerca2(this.value)"></div>' +
        '</div>' +
        '<div id="mz-r-trovati" class="mz-r-trovati"></div>' +
        '<div id="mz-r-righe"></div>' +
        '<button type="button" class="btn-back mz-btn-piccolo" onclick="mzRapRigaLibera()">&#10133; Riga libera (ricambio non del furgone)</button>' +
        '<div class="mz-sezione-form">&#9201;&#65039; Manodopera e uscita</div>' +
        '<div class="mz-tre">' +
            '<div><label for="mz-r-ore">Ore</label><input type="number" id="mz-r-ore" min="0" max="99" value="' + od.h + '" oninput="mzRapTotali()"></div>' +
            '<div><label for="mz-r-minuti">Minuti</label><input type="number" id="mz-r-minuti" min="0" max="59" step="5" value="' + od.m + '" oninput="mzRapTotali()"></div>' +
            '<div><label for="mz-r-uscita">Uscita &euro; <small>(IVA compresa)</small></label><input type="text" id="mz-r-uscita" inputmode="decimal" autocomplete="off" value="' + mzEsc(mzNumForm(x.uscita)) + '" oninput="mzRapTotali(); mzRapUscitaAuto(false)"></div>' +
        '</div>' +
        '<p class="mz-aiuto" id="mz-r-ore-testo"></p>' +
        '<p class="mz-aiuto" id="mz-r-uscita-nota"></p>' +
        '<label for="mz-r-note">Note</label><textarea id="mz-r-note" rows="2">' + mzEsc(x.note || '') + '</textarea>' +
        '<div id="mz-r-totali" class="mz-totali"></div>';
    document.getElementById('mz-rap-elimina').classList.toggle('hidden', nuovo || !mzPuoGestire());
    document.getElementById('mz-rap-pdf').classList.toggle('hidden', nuovo);
    document.getElementById('mz-rap-modal').classList.remove('hidden');
    mzRapRenderRighe();
    mzRapUscitaAuto(false);
    // richieste di intervento: si caricano in sottofondo; a rapportino nuovo e vuoto propongo quelle di oggi
    mzRichCarica().then(() => {
        if (!mzRap) return;
        const scelta = document.getElementById('mz-r-rich-scelta');
        if (scelta) scelta.innerHTML = mzHtmlRichiestaScelta(mzRap.richiesta_id);
        if (!mzRap.id && !mzRap.richiesta_id && !document.getElementById('mz-r-cliente').value) mzRichMostra('');
    });
}

// ---------- Dati del cliente dalla richiesta di intervento ----------
async function mzRichCarica(forza) {
    if (mzRichCaricate && !forza) return;
    try {
        const da = new Date(); da.setDate(da.getDate() - 180);
        const daIso = da.getFullYear() + '-' + mzPad(da.getMonth() + 1) + '-' + mzPad(da.getDate());
        const [r, i] = await Promise.all([
            supabaseClient.from('richieste_robot').select('id, data, cliente, indirizzo, paese, telefono, note, tipo, esito, ordine_id')
                .gte('data', daIso).order('data', { ascending: false }).limit(1000),
            supabaseClient.from('interventi').select('richiesta_id, data, tecnico_id').not('richiesta_id', 'is', null).gte('data', daIso).limit(5000)
        ]);
        if (r.error) throw r.error;
        mzRichieste = r.data || [];
        mzRichInterventi = {};
        if (!i.error) (i.data || []).forEach(x => {
            const t = mzTecnici.find(y => y.id === x.tecnico_id);
            if (!mzRichInterventi[x.richiesta_id]) mzRichInterventi[x.richiesta_id] = [];
            mzRichInterventi[x.richiesta_id].push({ data: x.data, tecnico: t ? t.nome : '', tecnico_id: x.tecnico_id });
        });
        Object.keys(mzRichInterventi).forEach(k => mzRichInterventi[k].sort((a, b) => String(b.data).localeCompare(String(a.data))));
        mzRichCaricate = true;
    } catch (err) {
        console.log('Richieste di intervento non caricate:', err && err.message ? err.message : err);
    }
}

function mzHtmlRichiestaScelta(id) {
    if (!id) return '';
    const r = mzRichieste.find(x => x.id === id);
    return '&#128279; Collegato alla richiesta' + (r ? ' del <strong>' + mzDataIt(r.data) + '</strong>: ' + mzEsc(r.cliente) + (r.paese ? ' (' + mzEsc(r.paese) + ')' : '') : '') +
        ' <button type="button" class="btn-back mz-btn-piccolo" onclick="mzRichTogli()">Scollega</button>';
}

// Tecnico di riferimento per l'elenco: quello scelto nel rapportino, altrimenti chi e' collegato
function mzRichTecnico() {
    const sel = document.getElementById('mz-r-tecnico');
    if (sel && sel.value) return sel.value;
    const mio = mzTecnicoMio();
    return mio ? mio.nome : '';
}

function mzRichAggiornaSeVuoto() {
    const c = document.getElementById('mz-r-rich-cerca');
    if (c && !c.value && mzRap && !mzRap.richiesta_id) mzRichMostra('');
}

// Elenco delle richieste. Senza testo: prima quelle del tecnico (intervento oggi, poi ultimi 14 giorni),
// se non ne ha quelle con intervento oggi di tutti, altrimenti le ultime aperte. Con il testo: ricerca.
function mzRichMostra(testo) {
    const box = document.getElementById('mz-r-rich-elenco');
    if (!box) return;
    if (!mzRichCaricate) { box.innerHTML = '<p class="mz-vuoto">&#8987; Caricamento richieste...</p>'; return; }
    const oggi = mzOggi();
    const d14 = new Date(); d14.setDate(d14.getDate() - 14);
    const da14 = d14.getFullYear() + '-' + mzPad(d14.getMonth() + 1) + '-' + mzPad(d14.getDate());
    const parole = String(testo || '').split(/\s+/).map(mzNorm).filter(Boolean);
    const tecnico = mzRichTecnico();
    // data dell'intervento piu' utile: oggi, altrimenti la piu' recente non nel futuro
    const dataInt = (r, solo) => {
        const lista = (mzRichInterventi[r.id] || []).filter(x => !solo || x.tecnico === solo);
        if (lista.some(x => x.data === oggi)) return oggi;
        const passate = lista.filter(x => x.data <= oggi).map(x => x.data).sort();
        return passate.length ? passate[passate.length - 1] : '';
    };
    let lista;
    let titolo = '';
    if (parole.length) {
        lista = mzRichieste.filter(r => {
            const t = mzNorm([r.cliente, r.telefono, r.indirizzo, r.paese, r.note].join(' '));
            return parole.every(p => t.indexOf(p) !== -1);
        });
    } else {
        const mie = tecnico ? mzRichieste.filter(r => dataInt(r, tecnico) >= da14) : [];
        if (mie.length) {
            lista = mie.sort((a, b) => String(dataInt(b, tecnico)).localeCompare(String(dataInt(a, tecnico))));
            titolo = 'Richieste di <strong>' + mzEsc(tecnico) + '</strong> nel planning (oggi e ultimi 14 giorni):';
        } else {
            const diOggi = mzRichieste.filter(r => dataInt(r) === oggi);
            lista = diOggi.length ? diOggi : mzRichieste.filter(r => r.esito !== 'NO' && r.esito !== 'OK');
            titolo = (tecnico ? 'Nessuna richiesta di ' + mzEsc(tecnico) + ' nel planning. ' : '') +
                (diOggi.length ? 'Richieste con intervento <strong>oggi</strong>:' : 'Ultime richieste ancora aperte (scrivi per cercare le altre):');
        }
    }
    lista = lista.slice(0, 10);
    box.innerHTML = (titolo ? '<p class="mz-aiuto">' + titolo + '</p>' : '') + (lista.length ? lista.map(r => {
        const ints = mzRichInterventi[r.id] || [];
        const int = ints.find(x => x.data === oggi) || ints.find(x => x.data <= oggi) || ints[0];
        return '<button type="button" class="mz-r-trovato' + (int && int.data === oggi ? ' mz-rich-oggi' : '') + '" onclick="mzRichScegli(' + r.id + ')">' +
            '<strong>' + mzEsc(r.cliente) + '</strong> <small>' + mzEsc([r.indirizzo, r.paese].filter(Boolean).join(' - ')) + '</small>' +
            '<span>' + mzEsc(r.tipo || '') + ' del ' + mzDataIt(r.data) + (int ? ' &middot; ' + mzEsc(int.tecnico) + ' ' + (int.data === oggi ? '<strong>OGGI</strong>' : mzDataIt(int.data)) : '') +
                (r.esito && r.esito !== '-' ? ' &middot; ' + mzEsc(r.esito) : '') + '</span>' +
            (r.note ? '<small class="mz-rich-nota">' + mzEsc(r.note) + '</small>' : '') +
        '</button>';
    }).join('') : '<p class="mz-vuoto">Nessuna richiesta trovata.</p>');
}

async function mzRichScegli(id) {
    if (!mzRap) return;
    const r = mzRichieste.find(x => x.id === id);
    if (!r) return;
    const imposta = (campo, valore) => { const el = document.getElementById(campo); if (el && valore) el.value = valore; };
    mzRap.richiesta_id = id;
    imposta('mz-r-cliente', r.cliente);
    imposta('mz-r-telefono', r.telefono);
    const indirizzo = [r.indirizzo, r.paese].filter(Boolean).join(', ');
    imposta('mz-r-indirizzo', indirizzo);
    mzRapUscitaAuto(true, r.paese);
    // dal planning: tecnico e data dell'intervento (il piu' recente, non nel futuro)
    const tec = (document.getElementById('mz-r-tecnico') || {}).value || '';
    const ints = (mzRichInterventi[id] || []).filter(x => x.data <= mzOggi());
    const int = (tec && ints.find(x => x.tecnico === tec)) || ints[0];
    if (int) {
        imposta('mz-r-data', int.data);
        const sel = document.getElementById('mz-r-tecnico');
        if (sel && int.tecnico) {
            if (!Array.from(sel.options).some(o => o.value === int.tecnico)) sel.insertAdjacentHTML('beforeend', '<option>' + mzEsc(int.tecnico) + '</option>');
            sel.value = int.tecnico;
        }
    }
    // richiesta nata da un ordine cliente: modello e matricola della macchina venduta
    if (r.ordine_id) {
        try {
            const { data: righe } = await supabaseClient.from('macchine_ordini_righe').select('id, descrizione, articolo_id').eq('ordine_id', r.ordine_id).order('posizione');
            const conArticolo = (righe || []).filter(x => x.articolo_id);
            if (conArticolo.length && !document.getElementById('mz-r-modello').value) imposta('mz-r-modello', mzTesto(conArticolo[0].descrizione));
            if (conArticolo.length) {
                const { data: pezzi } = await supabaseClient.from('macchine_pezzi').select('matricola').in('ordine_riga_id', conArticolo.map(x => x.id));
                const matr = (pezzi || []).map(p => p.matricola).filter(Boolean);
                if (matr.length && !document.getElementById('mz-r-matricola').value) imposta('mz-r-matricola', matr.join(', '));
            }
        } catch (err) {
            console.log('Macchina dell\'ordine non letta:', err && err.message ? err.message : err);
        }
    }
    document.getElementById('mz-r-rich-scelta').innerHTML = mzHtmlRichiestaScelta(id);
    document.getElementById('mz-r-rich-elenco').innerHTML = '';
    document.getElementById('mz-r-rich-cerca').value = '';
    mzToast('&#128203; Dati presi dalla richiesta di ' + mzEsc(r.cliente));
}

function mzRichTogli() {
    if (!mzRap) return;
    mzRap.richiesta_id = null;
    document.getElementById('mz-r-rich-scelta').innerHTML = '';
}

function mzChiudiRapportino() {
    document.getElementById('mz-rap-modal').classList.add('hidden');
    mzRap = null;
}

function mzRapCambiaFurgone(v) {
    if (!mzRap) return;
    const id = Number(v);
    // le righe del furgone prima passano al furgone nuovo (le righe libere restano libere)
    mzRap.righe.forEach(r => { if (r.ricambio_id) r.furgone_id = id; });
    mzRap.furgone_id = id;
    mzRapRenderRighe();
    mzRapCerca2(document.getElementById('mz-r-cerca').value);
}

function mzRapCerca2(testo) {
    const box = document.getElementById('mz-r-trovati');
    if (!box || !mzRap) return;
    if (!String(testo).trim()) { box.innerHTML = ''; return; }
    const f = mzRap.furgone_id;
    const trovati = mzCercaRicambi(testo).slice(0, 12);
    box.innerHTML = trovati.length ? trovati.map(t => '<button type="button" class="mz-r-trovato' + (mzQta(t.r.id, f) > 0 || mzSenzaScorta(t.r) ? '' : ' mz-r-trovato-zero') + '" onclick="mzRapAggiungiRicambio(' + t.r.id + ')">' +
        '<strong>' + mzEsc(t.r.descrizione) + '</strong> <small>' + mzEsc(t.r.marca) + ' ' + mzEsc(t.r.codice || '') + '</small>' +
        '<span>' + (mzSenzaScorta(t.r) ? 'senza scorta' : mzEsc(mzNomeFurgone(f)) + ': ' + mzQU(mzQta(t.r.id, f), t.r)) + ' &middot; ' + mzEuro(t.r.prezzo_ic) + (mzMetri(t.r) ? ' al metro' : '') + '</span></button>').join('')
        : '<p class="mz-vuoto">Nessun ricambio trovato.</p>';
}

function mzRapAggiungiRicambio(id) {
    if (!mzRap) return;
    const r = mzRicambio(id);
    if (!r) return;
    const gia = mzRap.righe.find(x => x.ricambio_id === id);
    if (gia) gia.quantita = (Number(gia.quantita) || 0) + 1;
    else mzRap.righe.push({ ricambio_id: id, furgone_id: mzRap.furgone_id, codice: r.codice || '', descrizione: r.descrizione, quantita: 1, prezzo_ic: r.prezzo_ic, unita: r.unita || 'PZ' });
    const c = document.getElementById('mz-r-cerca');
    if (c) c.value = '';
    document.getElementById('mz-r-trovati').innerHTML = '';
    mzRapRenderRighe();
}

function mzRapRigaLibera() {
    if (!mzRap) return;
    mzRap.righe.push({ ricambio_id: null, furgone_id: null, codice: '', descrizione: '', quantita: 1, prezzo_ic: null });
    mzRapRenderRighe();
}

function mzRapRenderRighe() {
    const box = document.getElementById('mz-r-righe');
    if (!box || !mzRap) return;
    if (!mzRap.righe.length) {
        box.innerHTML = '<p class="mz-vuoto">Nessun ricambio usato.</p>';
    } else {
        box.innerHTML = mzRap.righe.map((r, i) => {
            const libera = !r.ricambio_id;
            const ric = libera ? null : (mzRicambio(r.ricambio_id) || { unita: r.unita });
            const metri = libera ? r.unita === 'MT' : mzMetri(ric);
            const senza = !libera && mzSenzaScortaId(r.ricambio_id);
            const disp = libera || senza ? null : mzCent(mzQta(r.ricambio_id, r.furgone_id) + mzRapQtaOrig(r.ricambio_id, r.furgone_id));
            const poco = !libera && !senza && Number(r.quantita) > disp + 0.001;
            return '<div class="mz-r-riga' + (poco ? ' mz-r-riga-poca' : '') + '">' +
                (libera
                    ? '<input type="text" class="mz-r-descr" placeholder="Descrizione ricambio" value="' + mzEsc(r.descrizione) + '" oninput="mzRapCampo(' + i + ', \'descrizione\', this.value)">' +
                      '<input type="text" class="mz-r-cod" placeholder="Codice" value="' + mzEsc(r.codice || '') + '" oninput="mzRapCampo(' + i + ', \'codice\', this.value)">'
                    : '<div class="mz-r-descr"><strong>' + mzEsc(r.descrizione) + '</strong> <small>' + mzEsc(r.codice || '') + '</small>' +
                        (senza ? '<small class="mz-r-disp">senza scorta (non si scarica)</small></div>' :
                        '<small class="' + (poco ? 'mz-r-poco' : 'mz-r-disp') + '">' + mzEsc(mzNomeFurgone(r.furgone_id)) + ': disponibili ' + mzQU(disp, ric) + '</small></div>')) +
                (libera ? '<label>Unit&agrave; <select onchange="mzRapCampo(' + i + ', \'unita\', this.value)"><option value="PZ"' + (metri ? '' : ' selected') + '>pezzi</option><option value="MT"' + (metri ? ' selected' : '') + '>metri</option></select></label>' : '') +
                '<label>' + (metri ? 'Metri' : 'Q.t&agrave;') + ' <input type="number" min="' + (metri ? '0.1' : '1') + '" max="9999" step="' + (metri ? '0.1' : '1') + '" value="' + (Number(r.quantita) || 1) + '" onchange="mzRapCampo(' + i + ', \'quantita\', this.value)"></label>' +
                '<label>&euro; ' + (metri ? 'al metro' : 'cad.') + ' <input type="text" inputmode="decimal" value="' + mzEsc(mzNumForm(r.prezzo_ic)) + '" oninput="mzRapCampo(' + i + ', \'prezzo_ic\', this.value)"></label>' +
                '<span class="mz-r-tot">' + mzEuro(mzCent((Number(r.quantita) || 0) * (Number(r.prezzo_ic) || 0))) + '</span>' +
                '<button type="button" class="mz-r-togli" title="Togli" onclick="mzRapTogli(' + i + ')">&#10006;</button>' +
            '</div>';
        }).join('');
    }
    mzRapTotali();
}

// Pezzi gia' scaricati da questo rapportino (in modifica tornano disponibili)
function mzRapQtaOrig(ricambioId, furgoneId) {
    return mzRapRigheOrig.filter(x => x.ricambio_id === ricambioId && x.furgone_id === furgoneId).reduce((t, x) => t + (Number(x.quantita) || 0), 0);
}

function mzRapCampo(i, campo, valore) {
    const r = mzRap && mzRap.righe[i];
    if (!r) return;
    const metri = r.ricambio_id ? mzMetri(mzRicambio(r.ricambio_id) || { unita: r.unita }) : r.unita === 'MT';
    if (campo === 'quantita') {
        const q = mzLeggiQ(valore, metri);
        r.quantita = Math.min(9999, Math.max(metri ? 0.1 : 1, q || (metri ? 0.1 : 1)));
    } else if (campo === 'prezzo_ic') r.prezzo_ic = mzNum(valore);
    else r[campo] = valore;
    if (campo === 'unita' || (campo === 'quantita' && r.ricambio_id)) { mzRapRenderRighe(); return; }
    // aggiorna solo il totale della riga e i totali, senza ridisegnare (non si perde il cursore)
    const righe = document.querySelectorAll('#mz-r-righe .mz-r-riga');
    const tot = righe[i] && righe[i].querySelector('.mz-r-tot');
    if (tot) tot.innerHTML = mzEuro(mzCent((Number(r.quantita) || 0) * (Number(r.prezzo_ic) || 0)));
    mzRapTotali();
}

function mzRapTogli(i) {
    if (!mzRap) return;
    mzRap.righe.splice(i, 1);
    mzRapRenderRighe();
}

// Ore e minuti -> ore in decimali (30 minuti = 0,5)
function mzRapLeggiOre() {
    const h = Math.max(0, parseInt(document.getElementById('mz-r-ore').value, 10) || 0);
    const m = Math.max(0, Math.min(59, parseInt(document.getElementById('mz-r-minuti').value, 10) || 0));
    return mzCent(h + m / 60);
}

function mzCalcolaTotali(righe, ore, uscita, tariffa, iva) {
    const ricambi = mzCent(righe.reduce((t, r) => t + (Number(r.quantita) || 0) * (Number(r.prezzo_ic) || 0), 0));
    const tariffaIc = mzCent((tariffa === undefined ? MZ_TARIFFA_ORA : Number(tariffa)) * (1 + (iva === undefined ? MZ_IVA : Number(iva)) / 100));
    const manodopera = mzCent((Number(ore) || 0) * tariffaIc);
    const usc = mzCent(uscita);
    return { ricambi: ricambi, tariffaIc: tariffaIc, manodopera: manodopera, uscita: usc, totale: mzCent(ricambi + manodopera + usc) };
}

// ---------- Diritto di uscita automatico (v8.3.0) ----------
// Zone e importi (IVA compresa) in Dati aziendali. L'uscita si compila da sola quando cambia
// l'indirizzo / paese, ma solo se il campo e' vuoto o ha ancora il valore messo dall'app:
// se l'utente l'ha scritta a mano non la tocco.
function mzRapUscitaAuto(cambiato, paese) {
    if (!mzRap) return;
    const campo = document.getElementById('mz-r-uscita');
    const nota = document.getElementById('mz-r-uscita-nota');
    if (!campo || !nota) return;
    const indirizzo = (document.getElementById('mz-r-indirizzo') || {}).value || '';
    const trovata = typeof aziendaUscitaPer === 'function' ? (aziendaUscitaPer(paese || '') || aziendaUscitaPer(indirizzo)) : null;
    const attuale = mzNum(campo.value) || 0;
    if (cambiato && trovata) {
        const automatica = mzRap._uscitaAuto !== undefined && attuale === mzRap._uscitaAuto;
        if (!attuale || automatica) {
            campo.value = mzNumForm(trovata.importo);
            mzRap._uscitaAuto = trovata.importo;
            mzRapTotali();
        }
    } else if (cambiato && !trovata && mzRap._uscitaAuto !== undefined && attuale === mzRap._uscitaAuto) {
        // indirizzo cambiato in un comune fuori zona: tolgo l'uscita messa dall'app
        campo.value = '';
        delete mzRap._uscitaAuto;
        mzRapTotali();
    }
    const ora = mzNum(campo.value) || 0;
    if (trovata) {
        nota.innerHTML = '&#128656; ' + mzEsc(trovata.comune) + ': uscita ' + mzEuro(trovata.importo) + ' (IVA compresa)' +
            (ora !== trovata.importo ? ' &middot; <a href="#" onclick="mzRapUsaUscita(' + trovata.importo + '); return false;">usa questa</a>' : '');
    } else {
        nota.innerHTML = indirizzo.trim() ? '&#128656; Comune non in elenco: scrivi l&#39;uscita a mano (zone in Dati aziendali).' : '';
    }
}

function mzRapUsaUscita(importo) {
    const campo = document.getElementById('mz-r-uscita');
    if (!campo || !mzRap) return;
    campo.value = mzNumForm(importo);
    mzRap._uscitaAuto = importo;
    mzRapTotali();
    mzRapUscitaAuto(false);
}

function mzRapTotali() {
    const box = document.getElementById('mz-r-totali');
    if (!box || !mzRap) return;
    const ore = mzRapLeggiOre();
    const t = mzCalcolaTotali(mzRap.righe, ore, mzNum(document.getElementById('mz-r-uscita').value) || 0, mzRap.tariffa_oraria, mzRap.iva);
    const testo = document.getElementById('mz-r-ore-testo');
    if (testo) testo.innerHTML = 'Manodopera: <strong>' + String(ore).replace('.', ',') + ' h</strong> x ' + mzEuro(t.tariffaIc) + ' (' + MZ_TARIFFA_ORA + ' &euro; + IVA all&#39;ora)';
    box.innerHTML = '<div><span>Ricambi</span><span>' + mzEuro(t.ricambi) + '</span></div>' +
        '<div><span>Manodopera (' + String(ore).replace('.', ',') + ' h)</span><span>' + mzEuro(t.manodopera) + '</span></div>' +
        '<div><span>Uscita</span><span>' + mzEuro(t.uscita) + '</span></div>' +
        '<div class="mz-totale"><span>TOTALE DA PAGARE <small>(IVA compresa)</small></span><strong>' + mzEuro(t.totale) + '</strong></div>';
}

async function mzProssimoNumero(anno) {
    const { data, error } = await supabaseClient.from('mezzi_rapportini').select('numero').eq('anno', anno).order('numero', { ascending: false }).limit(1);
    if (error) throw error;
    return (data && data.length ? data[0].numero : 0) + 1;
}

async function mzSalvaRapportino() {
    const x = mzRap;
    if (!x) return;
    const v = {
        data: document.getElementById('mz-r-data').value || mzOggi(),
        cliente: mzTesto(document.getElementById('mz-r-cliente').value),
        telefono: mzTesto(document.getElementById('mz-r-telefono').value) || null,
        indirizzo: mzTesto(document.getElementById('mz-r-indirizzo').value) || null,
        modello: mzTesto(document.getElementById('mz-r-modello').value) || null,
        matricola: mzTesto(document.getElementById('mz-r-matricola').value) || null,
        lavori: String(document.getElementById('mz-r-lavori').value || '').trim().toUpperCase() || null,
        ore: mzRapLeggiOre(),
        uscita: mzCent(mzNum(document.getElementById('mz-r-uscita').value) || 0),
        note: String(document.getElementById('mz-r-note').value || '').trim().toUpperCase() || null,
        tecnico: document.getElementById('mz-r-tecnico').value || null,
        furgone_id: Number(document.getElementById('mz-r-furgone').value) || null,
        richiesta_id: x.richiesta_id || null,
        tariffa_oraria: x.tariffa_oraria === undefined ? MZ_TARIFFA_ORA : x.tariffa_oraria,
        iva: x.iva === undefined ? MZ_IVA : x.iva
    };
    const righe = x.righe.map((r, i) => ({
        posizione: i + 1,
        ricambio_id: r.ricambio_id || null,
        furgone_id: r.ricambio_id ? (r.furgone_id || v.furgone_id) : null,
        codice: mzTesto(r.codice) || null,
        descrizione: mzTesto(r.descrizione),
        quantita: Math.max(0.01, mzCent(r.quantita) || 1),
        unita: r.ricambio_id ? ((mzRicambio(r.ricambio_id) || {}).unita || r.unita || 'PZ') : (r.unita === 'MT' ? 'MT' : 'PZ'),
        prezzo_ic: r.prezzo_ic === null || r.prezzo_ic === undefined || r.prezzo_ic === '' ? null : mzCent(r.prezzo_ic)
    }));
    const errori = [];
    if (!v.cliente) errori.push('Scrivi il <strong>cliente</strong>');
    if (!v.lavori) errori.push('Scrivi i <strong>lavori eseguiti</strong>');
    if (v.data > mzOggi()) errori.push('La data &egrave; nel futuro');
    righe.forEach((r, i) => { if (!r.descrizione) errori.push('Ricambio ' + (i + 1) + ': manca la descrizione'); });
    // Quanti pezzi in piu' (o in meno) escono da ogni furgone rispetto a prima
    const delta = {};
    // (i ricambi "senza scorta" non escono dal furgone)
    righe.filter(r => r.ricambio_id && !mzSenzaScortaId(r.ricambio_id)).forEach(r => { const k = mzChiave(r.ricambio_id, r.furgone_id); delta[k] = mzCent((delta[k] || 0) + r.quantita); });
    mzRapRigheOrig.filter(r => r.ricambio_id && r.furgone_id && !mzSenzaScortaId(r.ricambio_id)).forEach(r => { const k = mzChiave(r.ricambio_id, r.furgone_id); delta[k] = mzCent((delta[k] || 0) - (Number(r.quantita) || 0)); });
    Object.keys(delta).forEach(k => {
        const [rid, fid] = k.split('_').map(Number);
        if (delta[k] > 0 && delta[k] > mzQta(rid, fid) + 0.001) {
            const ric = mzRicambio(rid);
            errori.push(mzEsc(ric ? ric.descrizione : 'Ricambio') + ': nel furgone ' + mzEsc(mzNomeFurgone(fid)) + ' ce ne sono ' + mzQU(mzQta(rid, fid), ric) +
                ' (ne servono ' + mzQU(delta[k], ric) + '). Caricali prima dalla scheda del ricambio, oppure usa una riga libera.');
        }
    });
    if (errori.length) { await showCustomAlert(errori.join('<br>'), 'Controlla il rapportino', '&#9888;&#65039;'); return; }
    v.totale = mzCalcolaTotali(righe, v.ore, v.uscita, v.tariffa_oraria, v.iva).totale;
    v.updated_at = new Date().toISOString();
    v.updated_by = mzEmail();

    const btn = document.getElementById('mz-rap-salva');
    btn.disabled = true;
    try {
        let id = x.id;
        if (!id) {
            const anno = Number(String(v.data).slice(0, 4));
            let salvato = null;
            for (let tentativo = 0; tentativo < 3 && !salvato; tentativo++) {
                const numero = await mzProssimoNumero(anno);
                const { data, error } = await supabaseClient.from('mezzi_rapportini').insert([Object.assign({}, v, { anno: anno, numero: numero, created_by: mzEmail() })]).select().single();
                if (error && /duplicate|unique/i.test(error.message || '')) continue;
                if (error) throw error;
                salvato = data;
            }
            if (!salvato) throw new Error('Numero del rapportino non assegnato: riprova');
            id = salvato.id;
        } else {
            const { error } = await supabaseClient.from('mezzi_rapportini').update(v).eq('id', id);
            if (error) throw error;
            const del = await supabaseClient.from('mezzi_rapportini_righe').delete().eq('rapportino_id', id);
            if (del.error) throw del.error;
        }
        if (righe.length) {
            const { error } = await supabaseClient.from('mezzi_rapportini_righe').insert(righe.map(r => Object.assign({}, r, { rapportino_id: id })));
            if (error) throw error;
        }
        // Scarico dal furgone (o reso se in modifica i pezzi sono diminuiti)
        const testoNota = 'RAPPORTINO ' + v.cliente;
        for (const k of Object.keys(delta)) {
            if (!delta[k]) continue;
            const [rid, fid] = k.split('_').map(Number);
            await mzMuovi(rid, fid, -delta[k], delta[k] > 0 ? 'USO' : 'RESO', id, testoNota);
        }
        if (x.daBozza) mzScriviBozza({ righe: [] });
        await mzCarica();
        mzRap = null;
        document.getElementById('mz-rap-modal').classList.add('hidden');
        if (mzTab !== 'rapportini') mzTab = 'rapportini';
        sessionStorage.setItem('mzTab', mzTab);
        mzRender();
        mzToast('&#10004; Rapportino salvato');
        mzSalvaSuDrive(id);
    } catch (err) {
        mzErrore(err, 'salvataggio rapportino');
        try { await mzCarica(); mzRender(); } catch (e) { /* niente */ }
    }
    btn.disabled = false;
}

async function mzEliminaRapportino() {
    if (!mzPuoGestire()) return;   // solo admin e operatori
    const x = mzRap;
    if (!x || !x.id) return;
    if (!window.confirm('Eliminare il rapportino N. ' + mzNumeroRap(x) + ' di ' + x.cliente + '?\n\nI ricambi tornano nel furgone e il PDF su Drive va nel cestino.')) return;
    try {
        for (const r of mzRapRigheOrig) {
            if (r.ricambio_id && r.furgone_id && !mzSenzaScortaId(r.ricambio_id)) await mzMuovi(r.ricambio_id, r.furgone_id, Number(r.quantita) || 0, 'RESO', null, 'RAPPORTINO ' + mzNumeroRap(x) + ' ELIMINATO');
        }
        const { error } = await supabaseClient.from('mezzi_rapportini').delete().eq('id', x.id);
        if (error) throw error;
        if (x.drive_file_id) mzDriveChiama({ azione: 'cestina', fileId: x.drive_file_id }).catch(e => console.log('PDF non cestinato:', e));
        await mzCarica();
        mzChiudiRapportino();
        mzRender();
    } catch (err) {
        mzErrore(err, 'eliminazione rapportino');
    }
}

// ---------- PDF del rapportino (per il cliente: SENZA tecnico) ----------
function mzHtmlTestaPdf(titolo, sotto) {
    const logo = typeof aziendaLogo === 'function' ? aziendaLogo() : 'logo.png';
    const az = typeof aziendaIntestazioneHtml === 'function' ? aziendaIntestazioneHtml() : '';
    return '<table class="rpt-testa"><tr>' +
        '<td class="rpt-testa-logo"><img src="' + logo + '" alt="" class="rpt-logo"></td>' +
        '<td class="rpt-titoli"><div class="rpt-titolo">' + titolo + '</div>' +
            (sotto ? '<div class="rpt-sotto mzr-data">' + sotto + '</div>' : '') +
            '<div class="rpt-sotto rpt-azienda">' + az + '</div></td>' +
    '</tr></table>';
}

function mzHtmlRapportinoPdf(x, righe) {
    const t = mzCalcolaTotali(righe, x.ore, x.uscita, x.tariffa_oraria, x.iva);
    const campo = (e, v) => '<td class="mzr-et">' + e + '</td><td class="mzr-val">' + mzEsc(v || '') + '</td>';
    return '<div class="rpt-pagina mzr">' +
        mzHtmlTestaPdf('Rapporto di intervento N. ' + mzNumeroRap(x), 'Data intervento <strong>' + mzDataIt(x.data) + '</strong>') +
        '<div class="rpt-sezione">Cliente</div>' +
        '<table class="mzr-dati"><colgroup><col style="width:14%"><col style="width:38%"><col style="width:12%"><col style="width:36%"></colgroup>' +
            '<tr>' + campo('Cliente', x.cliente) + campo('Telefono', x.telefono) + '</tr>' +
            '<tr><td class="mzr-et">Indirizzo</td><td class="mzr-val" colspan="3">' + mzEsc(x.indirizzo || '') + '</td></tr>' +
        '</table>' +
        '<div class="rpt-sezione">Macchina</div>' +
        '<table class="mzr-dati"><colgroup><col style="width:14%"><col style="width:38%"><col style="width:12%"><col style="width:36%"></colgroup>' +
            '<tr>' + campo('Modello', x.modello) + campo('Matricola', x.matricola) + '</tr>' +
        '</table>' +
        '<div class="rpt-sezione">Lavori eseguiti</div>' +
        '<div class="mzr-box">' + mzEsc(x.lavori || '') + '</div>' +
        '<div class="rpt-sezione">Ricambi</div>' +
        (righe.length
            ? '<table class="rpt-tab mzr-righe"><thead><tr><th style="width:20%">Codice</th><th>Ricambio</th><th class="rpt-n" style="width:8%">Q.t&agrave;</th>' +
                '<th class="rpt-n" style="width:14%">Prezzo</th><th class="rpt-n" style="width:14%">Totale</th></tr></thead><tbody>' +
                righe.map(r => '<tr><td>' + mzEsc(r.codice || '') + '</td><td>' + mzEsc(r.descrizione) + '</td><td class="rpt-n">' + mzQU(r.quantita, r) + '</td>' +
                    '<td class="rpt-n">' + (r.prezzo_ic === null || r.prezzo_ic === undefined ? '' : mzEuro(r.prezzo_ic) + (mzMetri(r) ? '/m' : '')) + '</td>' +
                    '<td class="rpt-n">' + mzEuro(mzCent((Number(r.quantita) || 0) * (Number(r.prezzo_ic) || 0))) + '</td></tr>').join('') +
              '</tbody></table>'
            : '<div class="mzr-box mzr-box-vuoto">Nessun ricambio</div>') +
        '<table class="mzr-totali">' +
            '<tr><td>Ricambi</td><td class="rpt-n">' + mzEuro(t.ricambi) + '</td></tr>' +
            '<tr><td>Manodopera (' + String(mzCent(x.ore)).replace('.', ',') + ' h)</td><td class="rpt-n">' + mzEuro(t.manodopera) + '</td></tr>' +
            '<tr><td>Uscita</td><td class="rpt-n">' + mzEuro(t.uscita) + '</td></tr>' +
            '<tr class="mzr-totale"><td>TOTALE DA PAGARE <small>(IVA compresa)</small></td><td class="rpt-n">' + mzEuro(t.totale) + '</td></tr>' +
        '</table>' +
        (x.note ? '<div class="rpt-sezione">Note</div><div class="mzr-box">' + mzEsc(x.note) + '</div>' : '') +
    '</div>';
}

function mzNomeFile(x) {
    const cliente = String(x.cliente || '').replace(/[^A-Z0-9 ]+/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, 50);
    return 'RAPPORTINO ' + String(x.numero).padStart(4, '0') + '-' + x.anno + (cliente ? ' ' + cliente : '') + '.pdf';
}

async function mzRighePerPdf(x) {
    if (mzRap && mzRap.id === x.id && document.getElementById('mz-rap-modal') && !document.getElementById('mz-rap-modal').classList.contains('hidden')) return mzRapRigheOrig;
    const { data, error } = await supabaseClient.from('mezzi_rapportini_righe').select('*').eq('rapportino_id', x.id).order('posizione');
    if (error) throw error;
    return data || [];
}

async function mzCreaPdf(x, formato) {
    const righe = await mzRighePerPdf(x);
    const pdf = await pdfCreaDaHtml(mzHtmlRapportinoPdf(x, righe), {
        margini: { alto: 10, sx: 10, basso: 10, dx: 10 },
        numeriPagina: true,
        tagli: 'tr, .rpt-sezione, .mzr-box'
    });
    pdf.setProperties({ title: 'Rapporto di intervento ' + mzNumeroRap(x) });
    if (formato === 'blob') return pdf.output('blob');
    return String(pdf.output('datauristring')).split(',')[1];
}

function mzApriPdfRapportino() {
    const x = mzRap && mzRap.id ? mzRapportini.find(r => r.id === mzRap.id) : null;
    if (!x) return;
    pdfApriInScheda(() => mzCreaPdf(x, 'blob'), mzNomeFile(x));
}

// ---------- Google Drive (come buoni e ordini) ----------
async function mzDriveChiama(corpo) {
    const { data, error } = await supabaseClient.functions.invoke('rapportini-drive', { body: corpo });
    if (error) {
        let msg = error.message || String(error);
        try {
            const j = error.context && typeof error.context.json === 'function' ? await error.context.json() : null;
            if (j && j.errore) msg = j.errore;
        } catch (e) { /* niente */ }
        if (/Failed to send|not found|404/i.test(msg)) {
            msg = 'La funzione &quot;rapportini-drive&quot; non risponde: va creata su Supabase (vedi GUIDA_RAPPORTINI_DRIVE.md). Dettaglio: ' + msg;
        }
        throw new Error(msg);
    }
    if (!data || !data.ok) throw new Error((data && data.errore) || 'Risposta non valida dalla funzione rapportini-drive');
    return data;
}

async function mzSalvaSuDrive(id) {
    const x = mzRapportini.find(r => r.id === id);
    if (!x || mzDriveInCorso[id]) return;
    mzDriveInCorso[id] = true;
    delete mzDriveErrore[id];
    mzAggiornaStatoDrive(id);
    try {
        const pdf = await mzCreaPdf(x, 'base64');
        const res = await mzDriveChiama({ azione: 'salva', anno: x.anno, nome: mzNomeFile(x), pdf: pdf, fileId: x.drive_file_id || null });
        const agg = { drive_url: res.url, drive_file_id: res.fileId, drive_salvato_at: new Date().toISOString() };
        const { error } = await supabaseClient.from('mezzi_rapportini').update(agg).eq('id', id);
        if (error) throw error;
        Object.assign(x, agg);
    } catch (err) {
        console.error('PDF del rapportino non salvato su Drive:', err);
        mzDriveErrore[id] = err && err.message ? err.message : String(err);
    } finally {
        delete mzDriveInCorso[id];
        mzAggiornaStatoDrive(id);
        if (mzTab === 'rapportini') mzRenderElencoRapportini();
    }
}

function mzStatoDriveHtml(x) {
    if (mzDriveInCorso[x.id]) return '&#8987; Salvataggio del PDF su Google Drive...';
    if (mzDriveErrore[x.id]) {
        return '&#10060; PDF non salvato su Drive: ' + mzDriveErrore[x.id] +
            ' <button type="button" class="btn-back mz-btn-piccolo" onclick="mzSalvaSuDrive(' + x.id + ')">&#128260; Riprova</button>';
    }
    if (x.drive_url) {
        return '&#128193; PDF su Google Drive <small>(salvato il ' + mzDataOra(x.drive_salvato_at) + ')</small> ' +
            '<a href="' + mzEsc(x.drive_url) + '" target="_blank" rel="noopener" class="btn-back mz-btn-piccolo">Apri</a> ' +
            '<button type="button" class="btn-back mz-btn-piccolo" onclick="mzSalvaSuDrive(' + x.id + ')">Salva di nuovo</button>';
    }
    return '&#128193; PDF non ancora su Google Drive <button type="button" class="btn-back mz-btn-piccolo" onclick="mzSalvaSuDrive(' + x.id + ')">Salva su Drive</button>';
}

function mzAggiornaStatoDrive(id) {
    const el = document.getElementById('mz-rap-drive');
    const x = mzRapportini.find(r => r.id === id);
    if (el && x && mzRap && mzRap.id === id) el.innerHTML = mzStatoDriveHtml(x);
}

async function mzProvaDrive() {
    const btn = document.getElementById('mz-prova-drive');
    if (btn) btn.disabled = true;
    try {
        const res = await mzDriveChiama({ azione: 'prova', anno: new Date().getFullYear() });
        await showCustomAlert('Collegamento con Google Drive funzionante.<br><br>Cartella: <strong>' + mzEsc(res.cartella || '') + '</strong>' +
            (res.url ? '<br><a href="' + mzEsc(res.url) + '" target="_blank" rel="noopener">Apri la cartella su Drive</a>' : ''), 'Drive OK', '&#10004;');
    } catch (err) {
        await showCustomAlert('Il collegamento con Google Drive non funziona:<br><br><strong>' + (err.message || err) + '</strong>' +
            '<br><br>Segui GUIDA_RAPPORTINI_DRIVE.md (cartella magazzino-app).', 'Drive', '&#10060;');
    }
    if (btn) btn.disabled = false;
}

// ---------- EXCEL: scarica e carica (stesso formato del file del magazzino esterno) ----------
function mzColonneExcel() {
    // v8.7.1: CODICE A BARRE e CODICE GESTIONALE in fondo (il caricamento riconosce le colonne dal titolo, l'ordine non conta)
    // (v8.7.2: senza CODICE EAN e CODICE EASY; se un file li ha ancora, il caricamento li legge lo stesso)
    return ['MARCA', 'MODELLO', 'CODICE', 'RICAMBIO', 'PREZZO IVA E', 'PREZZO IC', 'NOTE', 'UNITA']
        .concat(mzFurgoni.map(f => 'Q. MAG. ' + f.nome))
        .concat(mzFurgoni.map(f => 'SOGLIA ' + f.nome))
        .concat(['CODICE PRECEDENTE', 'SENZA SCORTA', 'CODICE A BARRE', 'CODICE GESTIONALE']);
}

function mzScaricaExcel() {
    if (!mzPuoGestire()) return;   // solo admin e operatori
    if (typeof XLSX === 'undefined') { showCustomAlert('Libreria Excel non caricata: aggiorna la pagina e riprova.', 'Errore', '&#10060;'); return; }
    const righe = [mzColonneExcel()];
    mzGiacFiltrati().forEach(r => righe.push([r.marca, r.modelli, r.codice || '', r.descrizione,
        r.prezzo_ivae === null ? '' : Number(r.prezzo_ivae), r.prezzo_ic === null ? '' : Number(r.prezzo_ic), r.note || '', mzMetri(r) ? 'MT' : 'PZ']
        .concat(mzFurgoni.map(f => mzQta(r.id, f.id)))
        .concat(mzFurgoni.map(f => mzSoglia(r.id, f.id)))
        .concat([r.codice_precedente || '', mzSenzaScorta(r) ? 'SI' : '', r.codice_barre || '', r.codice_gestionale || ''])));
    const ws = XLSX.utils.aoa_to_sheet(righe);
    ws['!cols'] = righe[0].map((c, i) => ({ wch: i === 1 ? 40 : (i === 3 ? 36 : (/^CODICE (A BARRE|GESTIONALE|PRECEDENTE)$/.test(c) ? 20 : 14)) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'MAGAZZINO ESTERNO');
    mzScriviXlsxPrimaRigaBloccata(wb, 'MAGAZZINO_ESTERNO_MEZZI_' + mzOggi() + '.xlsx');
}

// Scarica l'Excel con la prima riga bloccata (titoli sempre visibili scorrendo).
// SheetJS gratuito non scrive il "blocca riquadri": lo aggiungo io nel file (xl/worksheets/sheet1.xml).
// Se qualcosa non va scarico il file normale.
function mzScriviXlsxPrimaRigaBloccata(wb, nome) {
    try {
        const CFB = XLSX.CFB;
        const dati = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
        const zip = CFB.read(new Uint8Array(dati), { type: 'array' });
        const i = zip.FullPaths.findIndex(p => /xl\/worksheets\/sheet1\.xml$/.test(p));
        if (i === -1) throw new Error('foglio non trovato');
        const voce = zip.FileIndex[i];
        let xml = new TextDecoder().decode(new Uint8Array(voce.content));
        const pane = '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/>';
        if (/<sheetView workbookViewId="0"\/>/.test(xml)) xml = xml.replace('<sheetView workbookViewId="0"/>', '<sheetView workbookViewId="0">' + pane + '</sheetView>');
        else if (/<sheetData/.test(xml) && !/<sheetViews/.test(xml)) xml = xml.replace('<sheetData', '<sheetViews><sheetView workbookViewId="0">' + pane + '</sheetView></sheetViews><sheetData');
        else throw new Error('formato inatteso');
        voce.content = new TextEncoder().encode(xml);
        voce.size = voce.content.length;
        const out = CFB.write(zip, { fileType: 'zip', type: 'array' });
        const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = nome;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) {
        console.log('Excel senza riga bloccata:', err);
        XLSX.writeFile(wb, nome);
    }
}

async function mzLeggiFileExcel(input) {
    if (!mzPuoGestire()) return;   // solo admin e operatori
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    if (typeof XLSX === 'undefined') { showCustomAlert('Libreria Excel non caricata: aggiorna la pagina e riprova.', 'Errore', '&#10060;'); return; }
    try {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const tabella = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
        mzImport = mzPreparaImport(tabella);
        mzMostraImport();
    } catch (err) {
        mzErrore(err, 'lettura Excel');
    }
}

// Riconosce le colonne dal titolo (prima riga con MARCA e RICAMBIO/DESCRIZIONE)
function mzColonneDa(intestazione) {
    const t = intestazione.map(x => mzTesto(x));
    const trova = (prova) => t.findIndex(prova);
    const col = {
        marca: trova(x => x === 'MARCA' || x === 'MARCHIO'),
        modelli: trova(x => /^MODELL/.test(x)),
        codice: trova(x => x === 'CODICE' || x === 'CODICE RICAMBIO' || x === 'COD.'),
        ean: trova(x => /EAN/.test(x)),
        easy: trova(x => /EASY/.test(x)),
        descrizione: trova(x => x === 'RICAMBIO' || /^DESCRIZ/.test(x)),
        ivae: trova(x => /^PREZZO IVA E/.test(x) || /IVA ESCL/.test(x)),
        ic: trova(x => /^PREZZO IC$/.test(x) || /IVA COMPR|IVA INCL/.test(x)),
        note: trova(x => x === 'NOTE'),
        barre: trova(x => /BARRE/.test(x)),
        gestionale: trova(x => /GESTIONALE/.test(x)),
        precedente: trova(x => /PRECEDENTE/.test(x)),
        senza: trova(x => /SENZA SCORTA|NON SI CONTA/.test(x)),
        soglia: trova(x => x === 'SOGLIA AVVISO' || x === 'SOGLIA'),
        unita: trova(x => x === 'UNITA' || x === 'UNIT\u00C0' || x === 'U.M.' || x === 'UM' || x === 'UNITA DI MISURA' || x === 'UNIT\u00C0 DI MISURA'),
        qta: {}, sogliaF: {}
    };
    mzFurgoni.forEach(f => {
        const n = mzNorm(f.nome);
        col.qta[f.id] = trova(x => /^Q/.test(x) && mzNorm(x).indexOf(n) !== -1);
        col.sogliaF[f.id] = trova(x => /^SOGLIA/.test(x) && mzNorm(x).indexOf(n) !== -1);
    });
    return col;
}

function mzPreparaImport(tabella) {
    const iTesta = tabella.findIndex(riga => {
        const t = riga.map(x => mzTesto(x));
        return t.indexOf('MARCA') !== -1 && (t.indexOf('RICAMBIO') !== -1 || t.some(x => /^DESCRIZ/.test(x)));
    });
    if (iTesta === -1) throw new Error('Non trovo la riga dei titoli (servono almeno le colonne MARCA e RICAMBIO)');
    const col = mzColonneDa(tabella[iTesta]);
    const cella = (riga, i) => (i === -1 || i === undefined ? '' : riga[i]);
    const testo = (riga, i) => mzTesto(cella(riga, i));
    const intero = (riga, i) => {
        const v = cella(riga, i);
        if (v === '' || v === null || v === undefined) return null;
        const n = mzNum(v);
        return n === null ? null : Math.max(0, mzCent(n));   // con i decimali (ricambi a metri)
    };
    const prezzo = (riga, i) => {
        const v = cella(riga, i);
        if (v === '' || v === null || v === undefined) return null;
        const n = mzNum(v);
        return n === null || n === 0 ? null : mzCent(n);
    };
    const avvisi = [];
    const gruppi = {};
    const ordine = [];
    for (let i = iTesta + 1; i < tabella.length; i++) {
        const riga = tabella[i];
        const descrizione = testo(riga, col.descrizione);
        if (!descrizione) continue;
        const marca = testo(riga, col.marca);
        const codice = testo(riga, col.codice);
        const modelli = mzUnisciModelli([cella(riga, col.modelli)]);
        if (!codice) avvisi.push('Riga ' + (i + 1) + ': ' + descrizione + ' (' + (marca || 'senza marca') + ') senza codice');
        if (!modelli) avvisi.push('Riga ' + (i + 1) + ': ' + descrizione + ' (' + (marca || 'senza marca') + ') senza modello');
        const chiave = codice ? 'C|' + mzNorm(codice) : 'D|' + mzNorm(marca) + '|' + mzNorm(descrizione) + '|' + mzNorm(modelli);
        const dato = {
            riga: i + 1, marca: marca, modelli: modelli, codice: codice || null, descrizione: descrizione,
            codice_ean: testo(riga, col.ean) || null, codice_easy: testo(riga, col.easy) || null,
            prezzo_ivae: prezzo(riga, col.ivae), prezzo_ic: prezzo(riga, col.ic),
            note: testo(riga, col.note) || null, codice_barre: testo(riga, col.barre) || null,
            codice_gestionale: testo(riga, col.gestionale) || null, codice_precedente: testo(riga, col.precedente) || null,
            unita: /^(MT|M|METR[IO]|ML)$/.test(testo(riga, col.unita).replace(/\./g, '')) ? 'MT' : (testo(riga, col.unita) ? 'PZ' : null),
            qta: {}, soglia: {}
        };
        // SENZA SCORTA: SI / X / 1 = si', NO / 0 = no, vuoto = non cambia
        const senza = testo(riga, col.senza);
        dato.senza_scorta = !senza ? null : /^(SI|S|X|1|TRUE|VERO)$/.test(senza) ? true : /^(NO|N|0|FALSE|FALSO)$/.test(senza) ? false : null;
        if (dato.prezzo_ic === null && dato.prezzo_ivae !== null) dato.prezzo_ic = mzCent(dato.prezzo_ivae * (1 + MZ_IVA / 100));
        const sogliaUnica = intero(riga, col.soglia);
        mzFurgoni.forEach(f => {
            dato.qta[f.id] = intero(riga, col.qta[f.id]);
            const s = intero(riga, col.sogliaF[f.id]);
            dato.soglia[f.id] = s !== null ? s : sogliaUnica;
        });
        if (!gruppi[chiave]) { gruppi[chiave] = Object.assign(dato, { righeUnite: [i + 1] }); ordine.push(chiave); continue; }
        // Codice doppio: si unisce (modelli insieme, il resto dalla prima riga che ce l'ha)
        const g = gruppi[chiave];
        g.righeUnite.push(i + 1);
        g.modelli = mzUnisciModelli([g.modelli, dato.modelli]);
        ['marca', 'codice_ean', 'codice_easy', 'prezzo_ivae', 'prezzo_ic', 'note', 'codice_barre', 'codice_gestionale', 'codice_precedente', 'unita', 'senza_scorta'].forEach(c => {
            if ((g[c] === null || g[c] === '') && dato[c] !== null && dato[c] !== '') g[c] = dato[c];
        });
        mzFurgoni.forEach(f => {
            if (g.qta[f.id] === null && dato.qta[f.id] !== null) g.qta[f.id] = dato.qta[f.id];
            if (g.soglia[f.id] === null && dato.soglia[f.id] !== null) g.soglia[f.id] = dato.soglia[f.id];
        });
    }
    const elenco = ordine.map(k => gruppi[k]);
    // Abbinamento con i ricambi gia' presenti
    let nuovi = 0, aggiornati = 0, quantita = 0;
    const presi = {};
    elenco.forEach(d => {
        let esistente = d.codice
            ? mzRicambi.find(r => mzNorm(r.codice) === mzNorm(d.codice))
            : mzRicambi.find(r => !r.codice && mzNorm(r.marca) === mzNorm(d.marca) && mzNorm(r.descrizione) === mzNorm(d.descrizione));
        // Codice cambiato (v8.7.0): il codice nuovo non c'e' ma il CODICE PRECEDENTE e' il codice di un ricambio in app
        // -> e' lo stesso ricambio: cambio il codice e tengo quantita', soglie e storia
        d.cambioCodice = null;
        if (!esistente && d.codice && d.codice_precedente) {
            esistente = mzRicambi.find(r => mzNorm(r.codice) === mzNorm(d.codice_precedente)) || null;
            if (esistente) d.cambioCodice = { da: esistente.codice, a: d.codice };
        }
        if (esistente && presi[esistente.id]) esistente = null;   // gia' abbinato a un'altra riga
        if (esistente) presi[esistente.id] = true;
        d.esistente = esistente || null;
        if (esistente) aggiornati++; else nuovi++;
        mzFurgoni.forEach(f => {
            if (d.qta[f.id] !== null && d.qta[f.id] !== (esistente ? mzQta(esistente.id, f.id) : 0)) quantita++;
        });
    });
    const uniti = elenco.filter(d => d.righeUnite.length > 1);
    // Ricambi in app che nel file non ci sono (righe cancellate): si tolgono solo se lo si sceglie
    const mancanti = mzRicambi.filter(r => !presi[r.id]);
    const cambiCodice = elenco.filter(d => d.cambioCodice);
    return { elenco: elenco, avvisi: avvisi, uniti: uniti, nuovi: nuovi, aggiornati: aggiornati, quantita: quantita, mancanti: mancanti, cambiCodice: cambiCodice };
}

function mzMostraImport() {
    const m = mzImport;
    if (!m) return;
    document.getElementById('mz-imp-corpo').innerHTML =
        '<div class="mz-imp-numeri">' +
            '<div><strong>' + m.elenco.length + '</strong><span>ricambi nel file</span></div>' +
            '<div><strong>' + m.nuovi + '</strong><span>nuovi</span></div>' +
            '<div><strong>' + m.aggiornati + '</strong><span>gi&agrave; presenti (aggiornati)</span></div>' +
            '<div><strong>' + m.quantita + '</strong><span>quantit&agrave; che cambiano</span></div>' +
        '</div>' +
        (m.uniti.length ? '<div class="mz-avviso">&#128279; <strong>Codici doppi uniti</strong> (un solo ricambio, modelli insieme):<ul>' +
            m.uniti.map(d => '<li><strong>' + mzEsc(d.codice || d.descrizione) + '</strong> ' + mzEsc(d.descrizione) + ' &mdash; righe ' + d.righeUnite.join(', ') + ' &rarr; ' + mzEsc(d.modelli) + '</li>').join('') + '</ul></div>' : '') +
        (m.cambiCodice.length ? '<div class="mz-avviso">&#128260; <strong>Codici cambiati</strong> (riconosciuti dal CODICE PRECEDENTE: stesso ricambio, restano quantit&agrave; e storia):<ul>' +
            m.cambiCodice.map(d => '<li>' + mzEsc(d.cambioCodice.da) + ' &rarr; <strong>' + mzEsc(d.cambioCodice.a) + '</strong> ' + mzEsc(d.descrizione) + '</li>').join('') + '</ul></div>' : '') +
        (m.mancanti.length ? '<div class="mz-avviso mz-avviso-giallo">&#128465;&#65039; <strong>' + m.mancanti.length + '</strong> ricambi in app non sono nel file. Di solito restano come sono.' +
            '<label class="mz-imp-togli"><input type="checkbox" id="mz-imp-togli"><span>Toglili dall&#39;app (solo se il file contiene <strong>tutti</strong> i ricambi: scaricalo senza filtri). I rapportini gi&agrave; fatti non cambiano.</span></label>' +
            '<details><summary>Vedi quali</summary><ul>' + m.mancanti.slice(0, 300).map(r => {
                const tot = mzFurgoni.reduce((t, f) => t + mzQta(r.id, f.id), 0);
                return '<li>' + mzEsc(r.codice || '') + ' ' + mzEsc(r.descrizione) + ' <small>(' + mzEsc(r.marca || '') + ')</small>' + (tot ? ' &mdash; <strong>nei furgoni: ' + mzQ(tot) + '</strong>' : '') + '</li>';
            }).join('') + '</ul></details></div>' : '') +
        (m.avvisi.length ? '<div class="mz-avviso mz-avviso-giallo">&#9888;&#65039; <strong>Da completare</strong> (vengono caricati lo stesso):<ul>' +
            m.avvisi.map(a => '<li>' + mzEsc(a) + '</li>').join('') + '</ul></div>' : '') +
        '<p class="mz-aiuto">Le celle <strong>vuote</strong> del file non cancellano quello che c&#39;&egrave; gi&agrave;. Le colonne <strong>Q. MAG.</strong> mettono nel furgone la quantit&agrave; scritta (inventario); ' +
        'la colonna <strong>SOGLIA AVVISO</strong> vale per tutti i furgoni. Colonna <strong>SENZA SCORTA</strong>: SI = il ricambio non si conta (solo per i rapportini).</p>';
    document.getElementById('mz-imp-modal').classList.remove('hidden');
}

function mzChiudiImport() {
    document.getElementById('mz-imp-modal').classList.add('hidden');
    mzImport = null;
}

async function mzConfermaImport() {
    if (!mzPuoGestire()) return;   // solo admin e operatori
    const m = mzImport;
    if (!m) return;
    const btn = document.getElementById('mz-imp-conferma');
    btn.disabled = true;
    const stato = document.getElementById('mz-imp-stato');
    const adesso = new Date().toISOString();
    let fatti = 0;
    try {
        for (const d of m.elenco) {
            const campi = {};
            ['marca', 'modelli', 'codice', 'descrizione', 'codice_ean', 'codice_easy', 'prezzo_ivae', 'prezzo_ic', 'note', 'codice_barre', 'codice_gestionale', 'codice_precedente', 'unita'].forEach(c => {
                if (d[c] !== null && d[c] !== '') campi[c] = d[c];
            });
            if (mzColSenzaScorta && d.senza_scorta !== null && d.senza_scorta !== undefined) campi.senza_scorta = d.senza_scorta;
            let id;
            if (d.esistente) {
                if (campi.modelli) campi.modelli = mzUnisciModelli([d.esistente.modelli, campi.modelli]);
                const { error } = await supabaseClient.from('mezzi_ricambi').update(Object.assign(campi, { updated_at: adesso, updated_by: mzEmail() })).eq('id', d.esistente.id);
                if (error) throw new Error('Riga ' + d.riga + ': ' + error.message);
                id = d.esistente.id;
            } else {
                const { data, error } = await supabaseClient.from('mezzi_ricambi').insert([Object.assign({ marca: '', modelli: '' }, campi, { created_by: mzEmail(), updated_by: mzEmail() })]).select().single();
                if (error) throw new Error('Riga ' + d.riga + ': ' + error.message);
                id = data.id;
            }
            for (const f of mzFurgoni) {
                const prima = mzQta(id, f.id);
                const q = d.qta[f.id] === null ? null : (((d.unita || (d.esistente && d.esistente.unita)) === 'MT') ? d.qta[f.id] : Math.round(d.qta[f.id]));
                const res = await supabaseClient.rpc('mezzi_muovi', {
                    p_ricambio: id, p_furgone: f.id, p_delta: q === null ? 0 : mzCent(q - prima), p_tipo: 'IMPORT', p_rapportino: null, p_nota: 'EXCEL'
                });
                if (res.error) throw new Error('Riga ' + d.riga + ': ' + res.error.message);
                if (d.soglia[f.id] !== null && d.soglia[f.id] !== mzSoglia(id, f.id)) {
                    const { error } = await supabaseClient.from('mezzi_giacenze').update({ soglia: d.soglia[f.id] }).eq('ricambio_id', id).eq('furgone_id', f.id);
                    if (error) throw new Error('Riga ' + d.riga + ': ' + error.message);
                }
            }
            fatti++;
            if (stato) stato.innerHTML = '&#8987; Caricati ' + fatti + ' di ' + m.elenco.length + '...';
        }
        // Ricambi non piu' nel file: solo se l'utente l'ha scelto
        let tolti = 0;
        const togli = document.getElementById('mz-imp-togli');
        if (togli && togli.checked && m.mancanti.length) {
            if (window.confirm('Togliere dall\'app ' + m.mancanti.length + ' ricambi che non sono nel file?\n\nI rapportini gi\u00E0 fatti non cambiano.')) {
                for (const r of m.mancanti) {
                    const { error } = await supabaseClient.from('mezzi_ricambi').delete().eq('id', r.id);
                    if (error) throw new Error('Eliminazione ' + (r.codice || r.descrizione) + ': ' + error.message);
                    delete mzSelezionati[r.id];
                    tolti++;
                }
            }
        }
        m.tolti = tolti;
        await mzCarica();
        mzChiudiImport();
        mzTab = 'giacenze';
        sessionStorage.setItem('mzTab', mzTab);
        mzRender();
        await showCustomAlert('Caricati <strong>' + fatti + '</strong> ricambi (' + m.nuovi + ' nuovi, ' + m.aggiornati + ' aggiornati' +
            (m.cambiCodice.length ? ', ' + m.cambiCodice.length + ' con il codice cambiato' : '') + ').' +
            (m.tolti ? '<br>Tolti dall&#39;app: <strong>' + m.tolti + '</strong>.' : ''), 'Excel caricato', '&#10004;');
    } catch (err) {
        mzErrore(err, 'caricamento Excel (fatti ' + fatti + ' di ' + m.elenco.length + ')');
        try { await mzCarica(); mzRender(); } catch (e) { /* niente */ }
    }
    if (stato) stato.innerHTML = '';
    btn.disabled = false;
}

// ---------- ETICHETTE ZEBRA (50 x 20 mm, Code 128) ----------
let mzBarcodePromessa = null;
function mzCaricaBarcode() {
    if (typeof window.JsBarcode === 'function') return Promise.resolve();
    if (mzBarcodePromessa) return mzBarcodePromessa;
    mzBarcodePromessa = new Promise((ok, ko) => {
        const s = document.createElement('script');
        s.src = MZ_LIB_BARCODE;
        s.onload = () => ok();
        s.onerror = () => { mzBarcodePromessa = null; ko(new Error('Libreria codici a barre non caricata (connessione?)')); };
        document.head.appendChild(s);
    });
    return mzBarcodePromessa;
}

function mzValoreBarcode(r) {
    return String(r.codice_barre || r.codice || r.codice_ean || ('MZ' + r.id)).trim();
}

// Testo che sta nella larghezza (jsPDF): accorcia con "..."
function mzTaglia(pdf, testo, larghezza) {
    let t = String(testo || '');
    if (pdf.getTextWidth(t) <= larghezza) return t;
    while (t.length > 1 && pdf.getTextWidth(t + '...') > larghezza) t = t.slice(0, -1);
    return t + '...';
}

async function mzCreaEtichette(ricambi) {
    await pdfCaricaLibrerie();
    await mzCaricaBarcode();
    const L = MZ_ETICHETTA.larghezza;
    const H = MZ_ETICHETTA.altezza;
    const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: [H, L], orientation: 'landscape' });
    ricambi.forEach((r, i) => {
        if (i > 0) pdf.addPage([H, L], 'landscape');
        const valore = mzValoreBarcode(r);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(7);
        pdf.text(mzTaglia(pdf, mzTesto(r.descrizione), L - 4), L / 2, 3.4, { align: 'center' });
        const canvas = document.createElement('canvas');
        window.JsBarcode(canvas, valore, { format: 'CODE128', displayValue: false, margin: 0, height: 80, width: 2 });
        const larg = Math.min(L - 8, Math.max(20, canvas.width / 8));   // 4 mm liberi ai lati: il lettore lo legge meglio
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', (L - larg) / 2, 4.6, larg, 10.2);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7.5);
        pdf.text(mzTaglia(pdf, valore + (r.marca ? '  ' + mzTesto(r.marca) : ''), L - 4), L / 2, 18, { align: 'center' });
    });
    return pdf.output('blob');
}

function mzStampaEtichette(ricambi) {
    if (!ricambi.length) { showCustomAlert('Seleziona i ricambi (casella a sinistra) per stampare le etichette.', 'Etichette', '&#8505;&#65039;'); return; }
    pdfApriInScheda(() => mzCreaEtichette(ricambi), 'ETICHETTE ' + ricambi.length + '.pdf');
}

function mzStampaEtichetteSelezionate() {
    if (!mzPuoGestire()) return;   // solo admin e operatori
    mzStampaEtichette(mzRicambi.filter(r => mzSelezionati[r.id]));
}

function mzStampaEtichettaAperta() {
    if (mzRicAperto) mzStampaEtichette([mzRicAperto]);
}

// ---------- Guida e tempo reale ----------
function mzApriGuida() { document.getElementById('mz-guida-modal').classList.remove('hidden'); }
function mzChiudiGuida() { document.getElementById('mz-guida-modal').classList.add('hidden'); }

function mzAvviaTempoReale() {
    if (mzCanale || typeof supabaseClient === 'undefined') return;
    try {
        const ricarica = () => {
            clearTimeout(mzTimerRicarica);
            mzTimerRicarica = setTimeout(async () => {
                if (typeof currentSection === 'undefined' || currentSection !== 'mezzi') { mzCaricato = false; return; }
                // non ridisegno mentre si scrive in una finestra aperta
                const aperta = ['mz-rap-modal', 'mz-ric-modal', 'mz-imp-modal'].some(id => !document.getElementById(id).classList.contains('hidden'));
                try { await mzCarica(); } catch (e) { return; }
                if (mzTab === 'inventario') { if (!aperta && mzInv) mzInvAggiornaConta(); return; }   // non ridisegno mentre si conta
                if (!aperta) mzRender(); else if (mzRap) mzRapRenderRighe();
            }, 800);
        };
        mzCanale = supabaseClient.channel('mezzi-furgoni')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'mezzi_giacenze' }, ricarica)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'mezzi_ricambi' }, ricarica)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'mezzi_rapportini' }, ricarica)
            .subscribe();
    } catch (err) {
        console.log('Tempo reale furgoni non attivo:', err);
    }
}

// ========================================
// INVENTARIO DEI FURGONI (v8.6.0)
// ----------------------------------------
// Primo carico / conta della merce, pensato per il telefono. Si sceglie il furgone, si scrive quanti
// pezzi (o metri) ci sono di ogni ricambio: ogni numero si salva subito nella BOZZA su Supabase
// (si riprende anche da un altro telefono). I ricambi non in elenco si annotano a parte (li crea l'ufficio).
// "Conferma inventario": le quantita' contate diventano quelle del furgone (movimento RETTIFICA
// "INVENTARIO N. x"); i ricambi non contati restano come sono.
// Admin, operatori e tecnici. Script supabase/mezzi-inventario.sql.
// ========================================
let mzInv = null;                    // bozza aperta: { id, furgone_id, righe: {id: q}, extra: [], ... }
let mzInvStorico = [];
let mzInvCaricato = false;
let mzInvErrore = '';
let mzInvFiltro = { testo: '', marca: '', vista: 'DA_CONTARE' };
const mzInvTimer = {};
const MZ_INV_MAX_RIGHE = 80;         // righe disegnate alla volta (telefono)
let mzInvScanner = null;

async function mzInvCarica() {
    const furgone = mzFurgoneCorrente();
    const { data, error } = await supabaseClient.from('mezzi_inventari')
        .select('*').order('created_at', { ascending: false }).limit(40);
    if (error) throw error;
    mzInvStorico = (data || []).filter(x => x.stato === 'CONFERMATO');
    mzInv = (data || []).find(x => x.stato === 'BOZZA' && x.furgone_id === furgone) || null;
    if (mzInv) { mzInv.righe = mzInv.righe || {}; mzInv.extra = mzInv.extra || []; }
    mzInvCaricato = true;
}

function mzHtmlInventario() {
    return mzHtmlScegliFurgone() + '<div id="mz-inv-corpo"><p class="mz-vuoto">&#8987; Caricamento...</p></div>';
}

async function mzInvMostra() {
    const box = document.getElementById('mz-inv-corpo');
    if (!box) return;
    try {
        await mzInvCarica();
        mzInvErrore = '';
    } catch (err) {
        console.error('Inventario furgoni:', err);
        mzInvErrore = /mezzi_inventari|does not exist|schema cache/i.test(err && err.message ? err.message : '')
            ? 'Esegui su Supabase lo script <strong>supabase/mezzi-inventario.sql</strong>.'
            : mzEsc(err && err.message ? err.message : String(err));
    }
    mzInvRender();
}

function mzInvRender() {
    const box = document.getElementById('mz-inv-corpo');
    if (!box) return;
    if (mzInvErrore) { box.innerHTML = '<p class="mz-vuoto">' + mzInvErrore + '</p>'; return; }
    const furgone = mzFurgoneCorrente();
    let html = '';
    if (!mzInv) {
        html += '<div class="mz-inv-inizio">' +
            '<p>Conta i ricambi che ci sono nel furgone <strong>' + mzEsc(mzNomeFurgone(furgone)) + '</strong> e scrivi per ognuno quanti pezzi (o metri) hai trovato. ' +
            'Ogni numero si salva subito: puoi fermarti e riprendere anche da un altro telefono. Alla fine premi <strong>Conferma inventario</strong>.</p>' +
            '<button type="button" class="btn-primary" onclick="mzInvInizia()">&#128203; Inizia inventario ' + mzEsc(mzNomeFurgone(furgone)) + '</button></div>';
    } else {
        const marche = Array.from(new Set(mzRicambi.map(r => r.marca).filter(Boolean))).sort();
        html += '<p class="mz-aiuto">Inventario N. ' + mzInv.id + ' iniziato il ' + mzDataIt(String(mzInv.created_at).slice(0, 10)) +
            (mzInv.created_by ? ' da ' + mzEsc(mzInv.created_by) : '') + '. Scrivi quanti ne trovi; <strong>vuoto</strong> = non contato (resta com&rsquo;&egrave;), <strong>0</strong> = non ce n&rsquo;&egrave;.</p>' +
            '<div class="mz-inv-cerca">' +
                '<input type="search" id="mz-inv-testo" placeholder="Cerca codice, descrizione, modello..." autocomplete="off" value="' + mzEsc(mzInvFiltro.testo) + '" oninput="mzInvImposta(\'testo\', this.value)" onkeydown="mzInvTasto(event)">' +
                '<button type="button" class="btn-back mz-btn-piccolo" onclick="mzInvApriScanner()" title="Leggi il codice a barre con la fotocamera">&#128247;</button>' +
            '</div>' +
            '<div class="mz-inv-filtri">' +
                '<select onchange="mzInvImposta(\'marca\', this.value)"><option value="">Tutte le marche</option>' +
                    marche.map(m => '<option' + (m === mzInvFiltro.marca ? ' selected' : '') + '>' + mzEsc(m) + '</option>').join('') + '</select>' +
                '<div class="mz-inv-viste">' +
                    [['DA_CONTARE', 'Da contare'], ['CONTATI', 'Contati'], ['TUTTI', 'Tutti']].map(([v, et]) =>
                        '<button type="button" class="' + (mzInvFiltro.vista === v ? 'active' : '') + '" onclick="mzInvImposta(\'vista\', \'' + v + '\')">' + et + '</button>').join('') +
                '</div>' +
            '</div>' +
            '<div id="mz-inv-lista"></div>' +
            '<div class="mz-inv-extra">' +
                '<h4>&#10067; Ricambi trovati ma non in elenco</h4>' +
                '<div id="mz-inv-extra-lista"></div>' +
                '<div class="mz-inv-extra-form">' +
                    '<input type="text" id="mz-inv-ex-desc" placeholder="Descrizione (es. LAMA HONDA)">' +
                    '<input type="text" id="mz-inv-ex-cod" placeholder="Codice (se c\'&egrave;)">' +
                    '<input type="text" id="mz-inv-ex-q" inputmode="decimal" placeholder="Quantit&agrave;">' +
                    '<button type="button" class="btn-back mz-btn-piccolo" onclick="mzInvAggiungiExtra()">&#10133; Aggiungi</button>' +
                '</div>' +
            '</div>' +
            '<div class="mz-inv-barra">' +
                '<span id="mz-inv-conta"></span>' +
                '<button type="button" class="btn-primary mz-btn-piccolo" onclick="mzInvConferma()">&#10004;&#65039; Conferma inventario</button>' +
                (mzPuoGestire() ? '<button type="button" class="btn-back mz-btn-piccolo" onclick="mzInvAnnulla()">Annulla</button>' : '') +
            '</div>';
    }
    html += mzInvHtmlStorico();
    box.innerHTML = html;
    if (mzInv) { mzInvRenderLista(); mzInvRenderExtra(); mzInvAggiornaConta(); }
}

function mzInvImposta(campo, valore) {
    mzInvFiltro[campo] = valore;
    if (campo === 'vista') {
        document.querySelectorAll('.mz-inv-viste button').forEach(b => b.classList.remove('active'));
        const btn = Array.from(document.querySelectorAll('.mz-inv-viste button')).find(b => b.getAttribute('onclick').indexOf("'" + valore + "'") !== -1);
        if (btn) btn.classList.add('active');
    }
    mzInvRenderLista();
}

function mzInvContato(id) {
    return !!mzInv && Object.prototype.hasOwnProperty.call(mzInv.righe, String(id));
}

function mzInvFiltrati() {
    const parole = String(mzInvFiltro.testo || '').split(/\s+/).map(mzNorm).filter(Boolean);
    return mzRicambi.filter(r => {
        if (mzSenzaScorta(r)) return false;   // non si contano
        if (mzInvFiltro.marca && r.marca !== mzInvFiltro.marca) return false;
        const contato = mzInvContato(r.id);
        // in "Da contare" cercando qualcosa mostro anche i gia' contati (per correggerli)
        if (mzInvFiltro.vista === 'DA_CONTARE' && contato && !parole.length) return false;
        if (mzInvFiltro.vista === 'CONTATI' && !contato) return false;
        if (parole.length) {
            const t = mzNorm([r.marca, r.modelli, r.codice, r.codice_barre, r.codice_ean, r.descrizione].join(' '));
            if (!parole.every(p => t.indexOf(p) !== -1)) return false;
        }
        return true;
    }).sort((a, b) => String(a.marca + ' ' + a.descrizione).localeCompare(String(b.marca + ' ' + b.descrizione), 'it'));
}

function mzInvRenderLista() {
    const box = document.getElementById('mz-inv-lista');
    if (!box || !mzInv) return;
    const lista = mzInvFiltrati();
    if (!lista.length) {
        box.innerHTML = '<p class="mz-vuoto">' + (mzInvFiltro.vista === 'DA_CONTARE' && !mzInvFiltro.testo && !mzInvFiltro.marca
            ? 'Hai contato tutti i ricambi in elenco. Controlla i <strong>Contati</strong> e premi <strong>Conferma inventario</strong>.'
            : 'Nessun ricambio. Se lo hai nel furgone ma non &egrave; in elenco, aggiungilo qui sotto in <strong>Ricambi trovati ma non in elenco</strong>.') + '</p>';
        return;
    }
    const furgone = mzInv.furgone_id;
    box.innerHTML = lista.slice(0, MZ_INV_MAX_RIGHE).map(r => {
        const contato = mzInvContato(r.id);
        const q = contato ? mzInv.righe[String(r.id)] : null;
        return '<div class="mz-inv-riga' + (contato ? ' contato' : '') + '" id="mz-inv-r-' + r.id + '">' +
            '<div class="mz-inv-testo">' +
                '<div><strong>' + mzEsc(r.descrizione) + '</strong></div>' +
                '<div class="mz-inv-sotto">' + [r.marca, r.codice].filter(Boolean).map(mzEsc).join(' &middot; ') +
                    ' &middot; in app: ' + mzQU(mzQta(r.id, furgone), r) + '</div>' +
            '</div>' +
            '<div class="mz-inv-q">' +
                '<button type="button" onclick="mzInvPiu(' + r.id + ', -1)" aria-label="Meno">&minus;</button>' +
                '<input type="text" inputmode="decimal" id="mz-inv-q-' + r.id + '" value="' + (q === null ? '' : mzNumForm(q)) + '" placeholder="&ndash;"' +
                    ' oninput="mzInvScrivi(' + r.id + ', this.value)" onfocus="this.select()">' +
                '<button type="button" onclick="mzInvPiu(' + r.id + ', 1)" aria-label="Pi&ugrave;">+</button>' +
                (mzMetri(r) ? '<span class="mz-inv-u">m</span>' : '') +
            '</div>' +
        '</div>';
    }).join('') +
    (lista.length > MZ_INV_MAX_RIGHE ? '<p class="mz-aiuto">Ne vedi ' + MZ_INV_MAX_RIGHE + ' su ' + lista.length + ': cerca o scegli la marca per trovare gli altri.</p>' : '');
}

function mzInvAggiornaConta() {
    const el = document.getElementById('mz-inv-conta');
    if (!el || !mzInv) return;
    const n = Object.keys(mzInv.righe).length;
    const ex = (mzInv.extra || []).length;
    el.innerHTML = 'Contati <strong>' + n + '</strong> su ' + mzRicambi.filter(r => !mzSenzaScorta(r)).length + (ex ? ' &middot; ' + ex + ' non in elenco' : '');
}

// Scrive la quantita' (vuoto = non contato) e la salva dopo un attimo
function mzInvScrivi(id, valore) {
    if (!mzInv) return;
    const r = mzRicambio(id);
    const testo = String(valore || '').trim();
    let q = null;
    if (testo !== '') {
        q = mzLeggiQ(testo, mzMetri(r));
        if (q === null || q < 0) return;   // numero non valido: aspetto
    }
    if (q === null) delete mzInv.righe[String(id)]; else mzInv.righe[String(id)] = q;
    const riga = document.getElementById('mz-inv-r-' + id);
    if (riga) riga.classList.toggle('contato', q !== null);
    mzInvAggiornaConta();
    clearTimeout(mzInvTimer[id]);
    mzInvTimer[id] = setTimeout(() => { mzInvTimer[id] = null; mzInvSalvaRiga(id, q); }, 600);
}

function mzInvPiu(id, passo) {
    const input = document.getElementById('mz-inv-q-' + id);
    if (!input) return;
    const attuale = mzNum(input.value) || 0;
    const nuovo = Math.max(0, mzCent(attuale + passo));
    input.value = mzNumForm(nuovo);
    mzInvScrivi(id, input.value);
}

async function mzInvSalvaRiga(id, q) {
    if (!mzInv) return;
    const { error } = await supabaseClient.rpc('mezzi_inventario_segna', { p_inventario: mzInv.id, p_ricambio: id, p_quantita: q });
    if (error) {
        if (/INVENTARIO_GIA_CONFERMATO/.test(error.message || '')) {
            showCustomAlert('Questo inventario &egrave; gi&agrave; stato confermato da un altro telefono.', 'Inventario', '&#9888;&#65039;');
            mzInvMostra();
            return;
        }
        mzErrore(error, 'inventario, salvataggio');
    }
}

// Lettore di codici a barre (o Invio): se il codice e' preciso porto sul numero di quel ricambio
function mzInvTasto(e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    mzInvVaiACodice(mzInvFiltro.testo);
}

function mzInvVaiACodice(codice) {
    const n = mzNorm(codice);
    const r = mzRicambi.find(x => [x.codice, x.codice_barre, x.codice_ean].map(mzNorm).indexOf(n) !== -1);
    if (!r) {
        mzInvImposta('testo', codice);
        return false;
    }
    mzInvFiltro.testo = r.codice || codice;
    mzInvFiltro.vista = 'TUTTI';
    mzInvFiltro.marca = '';
    mzInvRender();
    const input = document.getElementById('mz-inv-q-' + r.id);
    if (input) { input.focus(); input.scrollIntoView({ block: 'center' }); }
    return true;
}

// Fotocamera (stessa libreria dello Scanner)
function mzInvApriScanner() {
    if (typeof Html5Qrcode === 'undefined') {
        showCustomAlert('Lettore non disponibile: scrivi il codice nella ricerca.', 'Inventario', '&#9888;&#65039;');
        return;
    }
    document.getElementById('mz-inv-scan-modal').classList.remove('hidden');
    mzInvScanner = new Html5Qrcode('mz-inv-reader');
    mzInvScanner.start({ facingMode: 'environment' }, { fps: 20, qrbox: { width: 240, height: 120 } }, async (testo) => {
        await mzInvChiudiScanner();
        if (navigator.vibrate) navigator.vibrate(150);
        if (!mzInvVaiACodice(testo)) {
            showCustomAlert('Codice <strong>' + mzEsc(testo) + '</strong> non in elenco: se il ricambio &egrave; nel furgone aggiungilo in <strong>Ricambi trovati ma non in elenco</strong>.', 'Inventario', '&#9888;&#65039;');
            const cod = document.getElementById('mz-inv-ex-cod');
            if (cod) cod.value = testo;
        }
    }, () => {}).catch(err => {
        console.error('Fotocamera inventario:', err);
        mzInvChiudiScanner();
        showCustomAlert('Impossibile avviare la fotocamera. Controlla i permessi.', 'Inventario', '&#10060;');
    });
}

async function mzInvChiudiScanner() {
    document.getElementById('mz-inv-scan-modal').classList.add('hidden');
    if (mzInvScanner) {
        const s = mzInvScanner;
        mzInvScanner = null;
        try { if (s.isScanning) await s.stop(); } catch (e) { /* niente */ }
    }
}

// ---------- Ricambi non in elenco ----------
function mzInvRenderExtra() {
    const box = document.getElementById('mz-inv-extra-lista');
    if (!box || !mzInv) return;
    const ex = mzInv.extra || [];
    box.innerHTML = ex.length ? '<ul>' + ex.map((x, i) => '<li><strong>' + mzEsc(x.descrizione) + '</strong>' +
        (x.codice ? ' &middot; ' + mzEsc(x.codice) : '') + ' &middot; ' + mzEsc(mzNumForm(x.quantita)) +
        (x.da ? ' <small>(' + mzEsc(x.da) + ')</small>' : '') +
        ' <button type="button" class="mz-inv-x" onclick="mzInvTogliExtra(' + i + ')" title="Togli">&#10006;</button></li>').join('') + '</ul>'
        : '<p class="mz-aiuto">Nessuno. Se trovi un ricambio che non &egrave; in elenco scrivilo qui: lo crea l&rsquo;ufficio e poi si carica.</p>';
}

async function mzInvSalvaExtra() {
    const { error } = await supabaseClient.from('mezzi_inventari')
        .update({ extra: mzInv.extra, updated_at: new Date().toISOString(), updated_by: mzEmail() }).eq('id', mzInv.id);
    if (error) mzErrore(error, 'inventario, ricambi non in elenco');
}

async function mzInvAggiungiExtra() {
    if (!mzInv) return;
    const desc = mzTesto(document.getElementById('mz-inv-ex-desc').value);
    const cod = mzTesto(document.getElementById('mz-inv-ex-cod').value);
    const q = mzNum(document.getElementById('mz-inv-ex-q').value);
    if (!desc) { showCustomAlert('Scrivi la descrizione del ricambio.', 'Inventario', '&#9888;&#65039;'); return; }
    if (q === null || q <= 0) { showCustomAlert('Scrivi la quantit&agrave; trovata.', 'Inventario', '&#9888;&#65039;'); return; }
    mzInv.extra = (mzInv.extra || []).concat([{ descrizione: desc, codice: cod, quantita: mzCent(q), da: mzUtente() }]);
    ['mz-inv-ex-desc', 'mz-inv-ex-cod', 'mz-inv-ex-q'].forEach(id => { document.getElementById(id).value = ''; });
    mzInvRenderExtra();
    mzInvAggiornaConta();
    await mzInvSalvaExtra();
}

async function mzInvTogliExtra(i) {
    if (!mzInv) return;
    mzInv.extra.splice(i, 1);
    mzInvRenderExtra();
    mzInvAggiornaConta();
    await mzInvSalvaExtra();
}

// ---------- Inizio, conferma, annulla ----------
async function mzInvInizia() {
    const furgone = mzFurgoneCorrente();
    const { error } = await supabaseClient.from('mezzi_inventari')
        .insert([{ furgone_id: furgone, created_by: mzEmail(), updated_by: mzEmail() }]);
    if (error && !/duplicate key|unique/i.test(error.message || '')) { mzErrore(error, 'inizio inventario'); return; }
    mzInvFiltro = { testo: '', marca: '', vista: 'DA_CONTARE' };
    await mzInvMostra();
}

async function mzInvConferma() {
    if (!mzInv) return;
    // salvo subito i numeri ancora in attesa
    const inAttesa = Object.keys(mzInvTimer).filter(k => mzInvTimer[k]);
    for (const k of inAttesa) {
        clearTimeout(mzInvTimer[k]);
        mzInvTimer[k] = null;
        await mzInvSalvaRiga(Number(k), mzInvContato(k) ? mzInv.righe[k] : null);
    }
    const furgone = mzInv.furgone_id;
    const contati = Object.keys(mzInv.righe);
    const cambiano = contati.filter(k => mzCent(mzQta(Number(k), furgone)) !== mzCent(mzInv.righe[k])).length;
    const ex = (mzInv.extra || []).length;
    if (!contati.length && !ex) { showCustomAlert('Non hai ancora contato nessun ricambio.', 'Inventario', '&#9888;&#65039;'); return; }
    if (!window.confirm('Confermare l\'inventario del furgone ' + mzNomeFurgone(furgone) + '?\n\n' +
        contati.length + ' ricambi contati, di cui ' + cambiano + ' con una quantità diversa da quella in app.\n' +
        'I ricambi non contati restano come sono.' + (ex ? '\n' + ex + ' ricambi non in elenco: li crea l\'ufficio.' : ''))) return;
    const { data, error } = await supabaseClient.rpc('mezzi_inventario_conferma', { p_inventario: mzInv.id });
    if (error) {
        if (/INVENTARIO_GIA_CONFERMATO/.test(error.message || '')) {
            showCustomAlert('Questo inventario era gi&agrave; stato confermato.', 'Inventario', '&#9888;&#65039;');
            await mzInvMostra();
            return;
        }
        mzErrore(error, 'conferma inventario');
        return;
    }
    const numero = mzInv.id;
    try { await mzCarica(); } catch (e) { /* il tempo reale ricarica comunque */ }
    await mzInvMostra();
    showCustomAlert('Inventario N. ' + numero + ' confermato.<br><br>Quantit&agrave; aggiornate: <strong>' + (data && data.cambiati || 0) + '</strong>' +
        '<br>Gi&agrave; giuste: ' + (data && data.uguali || 0) + (ex ? '<br>Non in elenco (da creare): ' + ex : ''), 'Inventario', '&#9989;');
}

async function mzInvAnnulla() {
    if (!mzInv || !mzPuoGestire()) return;
    if (!window.confirm('Annullare l\'inventario N. ' + mzInv.id + '? I numeri scritti finora vengono persi, le quantità del furgone non cambiano.')) return;
    const { error } = await supabaseClient.from('mezzi_inventari').delete().eq('id', mzInv.id);
    if (error) { mzErrore(error, 'annulla inventario'); return; }
    await mzInvMostra();
}

// ---------- Inventari confermati ----------
function mzInvHtmlStorico() {
    if (!mzInvStorico.length) return '';
    return '<h4 class="mz-inv-titolo">Inventari confermati</h4><div class="mz-tab-scroll"><table class="mz-tab mz-inv-storico"><thead><tr>' +
        '<th>N.</th><th>Data</th><th>Furgone</th><th>Chi</th><th class="mz-n">Contati</th><th class="mz-n">Cambiati</th><th class="mz-n">Non in elenco</th></tr></thead><tbody>' +
        mzInvStorico.map(x => {
            const r = x.riepilogo || {};
            const ex = (x.extra || []).length;
            return '<tr onclick="mzInvDettaglio(' + x.id + ')"><td><strong>' + x.id + '</strong></td><td>' + mzDataIt(String(x.confermato_at || x.created_at).slice(0, 10)) + '</td>' +
                '<td>' + mzEsc(mzNomeFurgone(x.furgone_id)) + '</td><td>' + mzEsc(String(x.confermato_da || '').split('@')[0]) + '</td>' +
                '<td class="mz-n">' + (r.contati || 0) + '</td><td class="mz-n">' + (r.cambiati || 0) + '</td><td class="mz-n">' + (ex ? '<strong>' + ex + '</strong>' : '0') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
}

function mzInvDettaglio(id) {
    const x = mzInvStorico.find(v => v.id === id);
    if (!x) return;
    const ex = x.extra || [];
    showCustomAlert('Furgone <strong>' + mzEsc(mzNomeFurgone(x.furgone_id)) + '</strong>, confermato il ' + mzDataIt(String(x.confermato_at || '').slice(0, 10)) +
        ' da ' + mzEsc(x.confermato_da || '') + '.<br>Ricambi contati: ' + Object.keys(x.righe || {}).length +
        (ex.length ? '<br><br><strong>Non in elenco (da creare e caricare):</strong><ul class="mz-inv-ul">' +
            ex.map(e => '<li>' + mzEsc(e.descrizione) + (e.codice ? ' &middot; ' + mzEsc(e.codice) : '') + ' &middot; ' + mzEsc(mzNumForm(e.quantita)) + '</li>').join('') + '</ul>' : ''),
        'Inventario N. ' + x.id, '&#128203;');
}

window.openMagazzinoMezzi = openMagazzinoMezzi;
window.mzPuoVedere = mzPuoVedere;
