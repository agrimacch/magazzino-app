// ========================================
// TECNICI - INTERVENTI ESTERNI (v5.1.0)
// ----------------------------------------
// Planning settimanale dei tecnici (lunedi' - sabato), dal 2 novembre 2026.
// Per ogni tecnico e ogni giorno: 4 righe la mattina (M) e 4 il pomeriggio (P)
// con ORA, TIPO (INT/SOP/MONT), ESITO (?/NR/OK/NO) e CLIENTE.
// Le righe si possono colorare (rosso = assente, giallo, verde, blu):
//   - una riga: dalla finestra di modifica
//   - piu' righe: "Pennello" (scegli il colore e tocca le righe)
//   - mezza giornata / giornata intera: tocca il giorno
// Tabelle Supabase: tecnici, interventi_settimana_tecnici, interventi
// (script supabase/interventi-esterni-setup.sql).
// Modificano admin e operatori; il ruolo "tecnico" vede soltanto.
// Telegram: NIENTE parte da solo. Le modifiche si accumulano e con il pulsante "Invia a Telegram"
// parte UN riepilogo (stato finale delle righe, da oggi in avanti) nel gruppo "Interventi esterni"
// (Edge Function notifica-interventi, bot @interventiesterni_bot).
// Fine anno: "Archivia anno" (solo admin) scarica l'Excel dell'anno e svuota il server.
// ========================================

const INT_INIZIO = '2026-11-02';    // prima settimana gestita dall'app
const INT_GIORNI = ['LUN', 'MAR', 'MER', 'GIO', 'VEN', 'SAB'];
const INT_GIORNI_LUNGHI = ['LUNED&Igrave;', 'MARTED&Igrave;', 'MERCOLED&Igrave;', 'GIOVED&Igrave;', 'VENERD&Igrave;', 'SABATO'];
const INT_MESI = ['GENNAIO', 'FEBBRAIO', 'MARZO', 'APRILE', 'MAGGIO', 'GIUGNO',
    'LUGLIO', 'AGOSTO', 'SETTEMBRE', 'OTTOBRE', 'NOVEMBRE', 'DICEMBRE'];
const INT_TIPI = ['INT', 'SOP', 'MONT'];
const INT_ESITI = ['?', 'NR', 'OK', 'NO'];
const INT_COLORI = {
    ROSSO: 'Rosso',
    GIALLO: 'Giallo',
    VERDE: 'Verde',
    BLU: 'Blu'
};
const INT_TURNI = { M: 'Mattina', P: 'Pomeriggio' };

let intAnno = null;              // anno mostrato nell'elenco settimane
let intSettimana = null;         // lunedi' della settimana aperta (YYYY-MM-DD) o null = elenco
let intTecnici = [];             // tutti i tecnici
let intExtra = [];               // id dei tecnici aggiunti alla settimana aperta
let intDati = {};                // interventi della settimana: chiave "tecnico|data|turno|pos"
let intGiornoMobile = 0;         // giorno mostrato da telefono (0 = lunedi')
let intPennello = null;          // null = spento, 'ROSSO'... = colore, 'GOMMA' = toglie il colore
let intModifica = null;          // casella aperta nella finestra di modifica
let intColoraCtx = null;         // { tid, data } della finestra "Colora"
let intColoraParte = 'G';        // M / P / G (giornata)
let intCanale = null;
let intRicaricaTimer = null;
let intPrimaApertura = true;

// ---------- Utilita' ----------
function intEsc(valore) {
    if (valore === null || valore === undefined) return '';
    return String(valore)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function intPad(n) {
    return String(n).padStart(2, '0');
}

function intIso(d) {
    return d.getFullYear() + '-' + intPad(d.getMonth() + 1) + '-' + intPad(d.getDate());
}

// Mezzogiorno: evita sorprese col cambio dell'ora legale
function intDaIso(iso) {
    const p = String(iso).split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2], 12, 0, 0);
}

function intPiuGiorni(iso, n) {
    const d = intDaIso(iso);
    d.setDate(d.getDate() + n);
    return intIso(d);
}

function intLunediDi(iso) {
    const d = intDaIso(iso);
    const giorno = (d.getDay() + 6) % 7;   // 0 = lunedi' ... 6 = domenica
    d.setDate(d.getDate() - giorno);
    return intIso(d);
}

function intOggi() {
    return intIso(new Date());
}

function intEtichettaSettimana(lunedi) {
    const a = intDaIso(lunedi);
    const b = intDaIso(intPiuGiorni(lunedi, 5));
    if (a.getMonth() === b.getMonth()) {
        return 'DAL ' + a.getDate() + ' AL ' + b.getDate() + ' ' + INT_MESI[b.getMonth()];
    }
    return 'DAL ' + a.getDate() + ' ' + INT_MESI[a.getMonth()] + ' AL ' + b.getDate() + ' ' + INT_MESI[b.getMonth()];
}

// Settimane di un anno: quelle il cui lunedi' cade nell'anno (dal 2 novembre 2026 in poi)
function intSettimaneAnno(anno) {
    const elenco = [];
    let lun = intLunediDi(anno + '-01-01');
    if (intDaIso(lun).getFullYear() < anno) lun = intPiuGiorni(lun, 7);
    while (intDaIso(lun).getFullYear() === anno) {
        if (lun >= INT_INIZIO) elenco.push(lun);
        lun = intPiuGiorni(lun, 7);
    }
    return elenco;
}

function intPuoModificare() {
    return currentUserRole === 'admin' || currentUserRole === 'operatore';
}

function intChiave(tid, data, turno, pos) {
    return tid + '|' + data + '|' + turno + '|' + pos;
}

function intHaContenuto(r) {
    return !!(r && (r.ora || r.tipo || r.esito || r.cliente));
}

function intErrore(err, azione) {
    console.error('Interventi esterni - ' + azione + ':', err);
    const msg = String((err && err.message) || err || '');
    let testo = 'Errore durante: ' + intEsc(azione) + '<br><small>' + intEsc(msg) + '</small>';
    if (/relation .* does not exist|could not find the table|schema cache/i.test(msg)) {
        testo = 'Le tabelle degli interventi non esistono ancora su Supabase.<br><br>' +
            'Esegui lo script <strong>supabase/interventi-esterni-setup.sql</strong> ' +
            '(Supabase &gt; SQL Editor &gt; New query &gt; incolla &gt; Run).';
    } else if (/row-level security|permission denied/i.test(msg)) {
        testo = 'Non hai i permessi per modificare gli interventi.';
    }
    showCustomAlert(testo, 'Interventi esterni', '&#10060;');
}

// Supabase restituisce al massimo 1000 righe per volta: leggo a pagine
async function intLeggiTutti(creaQuery) {
    const PAGINA = 1000;
    let tutte = [];
    for (let da = 0; ; da += PAGINA) {
        const { data, error } = await creaQuery().range(da, da + PAGINA - 1);
        if (error) return { data: null, error: error };
        tutte = tutte.concat(data || []);
        if (!data || data.length < PAGINA) break;
    }
    return { data: tutte, error: null };
}

// ========================================
// APERTURA SEZIONE
// ========================================
async function openInterventiEsterni() {
    intAvviaTempoReale();
    const salvata = sessionStorage.getItem('interventiSettimana');
    // Settimana gia' aperta sullo schermo (es. tornando da WhatsApp l'app ricarica la sezione):
    // aggiorno solo i dati, senza tornare al lunedi' e senza scorrere in cima
    const vista = document.getElementById('int-vista-settimana');
    if (salvata && salvata === intSettimana && vista && !vista.classList.contains('hidden')) {
        await intCaricaSettimana();
        return;
    }
    intPennello = null;
    if (salvata && salvata >= INT_INIZIO) {
        await intApriSettimana(salvata, true);
    } else {
        await intMostraElenco();
    }
}

// ========================================
// ELENCO SETTIMANE
// ========================================
async function intMostraElenco() {
    intSettimana = null;
    sessionStorage.removeItem('interventiSettimana');
    document.getElementById('int-vista-elenco').classList.remove('hidden');
    document.getElementById('int-vista-settimana').classList.add('hidden');

    const lunOggi = intLunediDi(intOggi());
    const annoMin = intDaIso(INT_INIZIO).getFullYear();
    const annoOggi = Math.max(intDaIso(lunOggi).getFullYear(), annoMin);
    if (!intAnno) intAnno = annoOggi;

    // Anni selezionabili: dal 2026 all'anno prossimo
    const sel = document.getElementById('int-anno');
    let opzioni = '';
    for (let a = annoMin; a <= annoOggi + 1; a++) {
        opzioni += '<option value="' + a + '"' + (a === intAnno ? ' selected' : '') + '>' + a + '</option>';
    }
    sel.innerHTML = opzioni;

    const btnArchivia = document.getElementById('int-btn-archivia');
    if (btnArchivia) btnArchivia.classList.toggle('hidden', currentUserRole !== 'admin');

    await intCaricaElenco();
}

async function intCaricaElenco() {
    const box = document.getElementById('int-elenco-settimane');
    const settimane = intSettimaneAnno(intAnno);
    if (settimane.length === 0) {
        box.innerHTML = '<div class="card int-vuoto">Nessuna settimana per il ' + intAnno + '.</div>';
        return;
    }

    // Conteggio interventi e assenze per settimana (+ i miei, se l'utente e' un tecnico)
    const conteggi = {};
    const assenze = {};
    const miei = {};
    if (!intTecnici.length) {
        const resTec = await supabaseClient.from('tecnici').select('*').order('ordine').order('nome');
        if (!resTec.error) intTecnici = resTec.data || [];
    }
    const mioId = intMioTecnicoId();
    const { data, error } = await intLeggiTutti(() => supabaseClient
        .from('interventi')
        .select('tecnico_id, data, ora, tipo, esito, cliente, colore')
        .gte('data', settimane[0])
        .lte('data', intPiuGiorni(settimane[settimane.length - 1], 5))
        .order('id'));
    if (error) {
        intErrore(error, 'lettura elenco settimane');
    } else {
        (data || []).forEach(r => {
            const lun = intLunediDi(r.data);
            if (intHaContenuto(r) && r.esito !== 'NO') conteggi[lun] = (conteggi[lun] || 0) + 1;
            if (r.colore === 'ROSSO') assenze[lun] = true;
            if (intEMio(r, mioId)) miei[lun] = (miei[lun] || 0) + 1;
        });
    }

    const lunOggi = intLunediDi(intOggi());
    let html = '';
    let meseCorrente = -1;
    settimane.forEach(lun => {
        const mese = intDaIso(lun).getMonth();
        if (mese !== meseCorrente) {
            if (meseCorrente !== -1) html += '</div></div>';
            meseCorrente = mese;
            html += '<div class="int-mese"><h3 class="int-mese-titolo">' + INT_MESI[mese] + ' ' + intAnno + '</h3><div class="int-mese-griglia">';
        }
        const classi = ['int-settimana-btn'];
        let etichetta = '';
        if (lun === lunOggi) { classi.push('corrente'); etichetta = '<span class="int-tag int-tag-ora">QUESTA SETTIMANA</span>'; }
        else if (lun === intPiuGiorni(lunOggi, 7)) { etichetta = '<span class="int-tag">PROSSIMA</span>'; }
        else if (lun < lunOggi) classi.push('passata');
        const n = conteggi[lun] || 0;
        html += '<button type="button" class="' + classi.join(' ') + '" id="int-sett-' + lun + '" onclick="intApriSettimana(\'' + lun + '\')">' +
            '<span class="int-sett-titolo">' + intEtichettaSettimana(lun) + '</span>' +
            '<span class="int-sett-info">' + etichetta +
            (n ? '<span class="int-sett-conta">' + n + ' interv.</span>' : '') +
            (miei[lun] ? '<span class="int-tag int-tag-miei">&#11088; ' + miei[lun] + ' TUOI</span>' : '') +
            (assenze[lun] ? '<span class="int-sett-assenza" title="Ci sono righe rosse (assenze)"></span>' : '') +
            '</span></button>';
    });
    html += '</div></div>';
    box.innerHTML = html;
    intAggiornaDaInviare();

    // Alla prima apertura porta in vista la settimana corrente (o la prossima)
    if (intPrimaApertura) {
        intPrimaApertura = false;
        const el = document.getElementById('int-sett-' + lunOggi) || document.getElementById('int-sett-' + intPiuGiorni(lunOggi, 7));
        if (el) setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 150);
    }
}

function intCambiaAnno(valore) {
    intAnno = parseInt(valore, 10);
    intCaricaElenco();
}

// ========================================
// SETTIMANA
// ========================================
async function intApriSettimana(lunedi, ripristino) {
    intSettimana = intLunediDi(lunedi);
    sessionStorage.setItem('interventiSettimana', intSettimana);
    intAnno = intDaIso(intSettimana).getFullYear();

    // Da telefono: giorno ricordato per questa settimana (se c'e'), altrimenti oggi
    // (se e' in questa settimana), altrimenti lunedi'
    const ricordato = intGiornoRicordato(intSettimana);
    const diff = Math.round((intDaIso(intOggi()) - intDaIso(intSettimana)) / 86400000);
    intGiornoMobile = ricordato !== null ? ricordato : ((diff >= 0 && diff <= 5) ? diff : 0);
    intRicordaGiorno();
    if (!ripristino) intPennello = null;

    document.getElementById('int-vista-elenco').classList.add('hidden');
    document.getElementById('int-vista-settimana').classList.remove('hidden');
    document.getElementById('int-titolo-settimana').innerHTML = intEtichettaSettimana(intSettimana) + ' ' + intAnno;

    const prec = document.getElementById('int-sett-prec');
    if (prec) prec.disabled = intPiuGiorni(intSettimana, -7) < INT_INIZIO;

    document.getElementById('int-strumenti').classList.toggle('hidden', !intPuoModificare());
    document.getElementById('int-griglia').innerHTML = '<div class="card int-vuoto">Caricamento...</div>';
    document.getElementById('int-mobile').innerHTML = '';
    intAggiornaPennello();
    await intCaricaSettimana();
    window.scrollTo({ top: 0 });
}

function intSpostaSettimana(passo) {
    const nuova = intPiuGiorni(intSettimana, 7 * passo);
    if (nuova < INT_INIZIO) return;
    intApriSettimana(nuova);
}

function intVaiOggi() {
    const lun = intLunediDi(intOggi());
    intApriSettimana(lun < INT_INIZIO ? INT_INIZIO : lun);
}

async function intCaricaSettimana() {
    if (!intSettimana) return;
    const lun = intSettimana;
    const sab = intPiuGiorni(lun, 5);

    const [resTec, resInt, resExtra] = await Promise.all([
        supabaseClient.from('tecnici').select('*').order('ordine').order('nome'),
        supabaseClient.from('interventi').select('*').gte('data', lun).lte('data', sab),
        supabaseClient.from('interventi_settimana_tecnici').select('*').eq('settimana', lun)
    ]);
    const errore = resTec.error || resInt.error || resExtra.error;
    if (errore) {
        document.getElementById('int-griglia').innerHTML = '';
        intErrore(errore, 'lettura settimana');
        return;
    }
    if (intSettimana !== lun) return;   // nel frattempo e' stata aperta un'altra settimana

    intTecnici = resTec.data || [];
    intExtra = (resExtra.data || []).map(r => r.tecnico_id);
    intDati = {};
    (resInt.data || []).forEach(r => {
        intDati[intChiave(r.tecnico_id, r.data, r.turno, r.posizione)] = r;
    });
    intRender();
    intAggiornaDaInviare();
}

// Tecnici della settimana: fissi attivi + aggiunti a questa settimana + chi ha gia' righe
function intTecniciSettimana() {
    const conDati = new Set(Object.values(intDati).map(r => r.tecnico_id));
    return intTecnici.filter(t =>
        (t.fisso && t.attivo) || intExtra.includes(t.id) || conDati.has(t.id));
}

function intDateSettimana() {
    return INT_GIORNI.map((g, i) => intPiuGiorni(intSettimana, i));
}

// ---------- "I miei interventi" (utente collegato a un tecnico) ----------
// Il collegamento si fa nella finestra Tecnici ("Utente dell'app").
function intMioTecnicoId() {
    const email = String(loggedInUserEmail || '').toLowerCase();
    if (!email) return null;
    const t = intTecnici.find(x => x.email && String(x.email).toLowerCase() === email);
    return t ? t.id : null;
}

// Intervento "vivo" in carico al tecnico: riga compilata e non annullata (esito NO)
function intEMio(r, mioId) {
    return !!(mioId && r && r.tecnico_id === mioId && intHaContenuto(r) && r.esito !== 'NO');
}

function intMieiNelGiorno(data, mioId) {
    let n = 0;
    ['M', 'P'].forEach(turno => {
        for (let pos = 1; pos <= 4; pos++) {
            if (intEMio(intDati[intChiave(mioId, data, turno, pos)], mioId)) n++;
        }
    });
    return n;
}

// Il mio tecnico per primo
function intOrdinaMioPrimo(tecnici) {
    const mio = intMioTecnicoId();
    if (!mio) return tecnici;
    return tecnici.slice().sort((a, b) => (b.id === mio) - (a.id === mio));
}

// ---------- Disegno ----------
function intRender() {
    const tecnici = intTecniciSettimana();
    const griglia = document.getElementById('int-griglia');
    const mobile = document.getElementById('int-mobile');
    if (tecnici.length === 0) {
        const msg = '<div class="card int-vuoto">Nessun tecnico in questa settimana.' +
            (intPuoModificare() ? ' Usa il pulsante <strong>Tecnici</strong> per aggiungerne.' : '') + '</div>';
        griglia.innerHTML = msg;
        mobile.innerHTML = msg;
        return;
    }
    const ordinati = intOrdinaMioPrimo(tecnici);
    griglia.innerHTML = ordinati.map(t => intRenderTabellaTecnico(t)).join('');
    mobile.innerHTML = intRenderMobile(ordinati);
}

function intCelleRiga(r) {
    const esito = r && r.esito ? r.esito : '';
    return '<td class="int-c-ora">' + intEsc(r && r.ora) + '</td>' +
        '<td class="int-c-tipo">' + intEsc(r && r.tipo) + '</td>' +
        '<td class="int-c-esito"><span class="int-esito ' + intClasseEsito(esito) + '">' + intEsc(esito) + '</span></td>' +
        '<td class="int-c-cliente">' + intEsc(r && r.cliente) + '</td>';
}

function intClasseEsito(esito) {
    if (esito === 'OK') return 'esito-ok';
    if (esito === 'NR') return 'esito-nr';
    if (esito === 'NO') return 'esito-no';
    if (esito === '?') return 'esito-dubbio';
    return '';
}

function intClassiRiga(r, turno, pos) {
    const classi = ['int-riga'];
    if (r && r.colore) classi.push('col-' + r.colore);
    if (turno === 'P' && pos === 1) classi.push('inizio-pom');
    if (r && r.esito === 'NO') classi.push('annullato');
    if (intPuoModificare()) classi.push('cliccabile');
    return classi.join(' ');
}

function intRenderTabellaTecnico(t) {
    const oggi = intOggi();
    const modificabile = intPuoModificare();
    const mioId = intMioTecnicoId();
    const eMio = mioId === t.id;
    let righe = '';
    intDateSettimana().forEach((data, gi) => {
        ['M', 'P'].forEach(turno => {
            for (let pos = 1; pos <= 4; pos++) {
                const r = intDati[intChiave(t.id, data, turno, pos)];
                righe += '<tr class="' + intClassiRiga(r, turno, pos) + (intEMio(r, mioId) ? ' mia' : '') + '"' +
                    (modificabile ? ' onclick="intClickRiga(' + t.id + ',\'' + data + '\',\'' + turno + '\',' + pos + ')"' : '') + '>';
                if (turno === 'M' && pos === 1) {
                    righe += '<td rowspan="8" class="int-c-giorno' + (data === oggi ? ' oggi' : '') + '"' +
                        (modificabile ? ' onclick="event.stopPropagation(); intApriColora(' + t.id + ',\'' + data + '\')" title="Colora mattina / pomeriggio / giornata"' : '') + '>' +
                        '<span class="int-giorno-nome">' + INT_GIORNI[gi] + '</span>' +
                        '<span class="int-giorno-num">' + intDaIso(data).getDate() + '</span>' +
                        (eMio && intMieiNelGiorno(data, mioId) ? '<span class="int-mio-pallino">' + intMieiNelGiorno(data, mioId) + '</span>' : '') +
                        (modificabile ? '<span class="int-giorno-colora">&#127912;</span>' : '') +
                        '</td>';
                }
                righe += intCelleRiga(r) + '</tr>';
            }
        });
    });

    return '<div class="int-tecnico-blocco' + (eMio ? ' mio' : '') + '">' +
        '<div class="int-tecnico-nome">' + (eMio ? '&#11088; I TUOI INTERVENTI &middot; ' : '') + intEsc(t.nome) +
        (t.attivo ? '' : ' <small>(non attivo)</small>') + '</div>' +
        '<table class="int-tabella">' +
        '<colgroup><col class="int-col-giorno"><col class="int-col-ora"><col class="int-col-tipo"><col class="int-col-esito"><col></colgroup>' +
        '<thead><tr><th>GIORNO</th><th>ORA</th><th>TIPO</th><th>ESITO</th><th>CLIENTE</th></tr></thead>' +
        '<tbody>' + righe + '</tbody></table></div>';
}

function intRenderMobile(tecnici) {
    const date = intDateSettimana();
    const oggi = intOggi();
    const modificabile = intPuoModificare();
    const mioId = intMioTecnicoId();

    let html = '<div class="int-giorni-tab">';
    date.forEach((data, gi) => {
        const miei = mioId ? intMieiNelGiorno(data, mioId) : 0;
        html += '<button type="button" class="int-giorno-tab' + (gi === intGiornoMobile ? ' attivo' : '') + (data === oggi ? ' oggi' : '') +
            (miei ? ' con-miei' : '') + '" onclick="intScegliGiorno(' + gi + ')">' +
            '<span>' + INT_GIORNI[gi] + '</span><strong>' + intDaIso(data).getDate() + '</strong>' +
            (miei ? '<span class="int-mio-pallino" title="I tuoi interventi">' + miei + '</span>' : '') + '</button>';
    });
    html += '</div>';
    if (mioId) {
        const totale = date.reduce((n, d) => n + intMieiNelGiorno(d, mioId), 0);
        html += '<div class="int-miei-riepilogo">' + (totale
            ? '&#11088; Questa settimana hai <strong>' + totale + (totale === 1 ? ' intervento' : ' interventi') + '</strong> (numeri sui giorni)'
            : 'Questa settimana non hai interventi in carico') + '</div>';
    }

    const data = date[intGiornoMobile];
    const d = intDaIso(data);
    html += '<div class="int-giorno-titolo">' + INT_GIORNI_LUNGHI[intGiornoMobile] + ' ' + d.getDate() + ' ' + INT_MESI[d.getMonth()] + '</div>';

    tecnici.forEach(t => {
        const eMio = mioId === t.id;
        html += '<div class="int-m-tecnico' + (eMio ? ' mio' : '') + '">' +
            '<div class="int-m-tecnico-nome"><span>' + (eMio ? '&#11088; ' : '') + intEsc(t.nome) + '</span>' +
            (modificabile ? '<button type="button" class="int-m-colora" onclick="intApriColora(' + t.id + ',\'' + data + '\')">&#127912; Colora</button>' : '') +
            '</div>';
        ['M', 'P'].forEach(turno => {
            html += '<div class="int-m-turno">' + INT_TURNI[turno] + '</div>';
            for (let pos = 1; pos <= 4; pos++) {
                const r = intDati[intChiave(t.id, data, turno, pos)];
                const classi = ['int-m-riga'];
                if (r && r.colore) classi.push('col-' + r.colore);
                if (r && r.esito === 'NO') classi.push('annullato');
                if (!intHaContenuto(r)) classi.push('vuota');
                if (intEMio(r, mioId)) classi.push('mia');
                html += '<div class="' + classi.join(' ') + '"' +
                    (modificabile ? ' onclick="intClickRiga(' + t.id + ',\'' + data + '\',\'' + turno + '\',' + pos + ')"' : '') + '>';
                if (intHaContenuto(r)) {
                    html += '<div class="int-m-riga-alto">' +
                        '<span class="int-m-ora">' + intEsc(r.ora || '--') + '</span>' +
                        (r.tipo ? '<span class="int-m-tipo">' + intEsc(r.tipo) + '</span>' : '') +
                        (r.esito ? '<span class="int-esito ' + intClasseEsito(r.esito) + '">' + intEsc(r.esito) + '</span>' : '') +
                        '</div>' +
                        '<div class="int-m-cliente">' + intEsc(r.cliente || '') + '</div>';
                } else {
                    html += '<span class="int-m-libero">' + (modificabile ? '+ libero' : '&ndash;') + '</span>';
                }
                html += '</div>';
            }
        });
        html += '</div>';
    });
    return html;
}

function intScegliGiorno(gi) {
    intGiornoMobile = gi;
    intRicordaGiorno();
    document.getElementById('int-mobile').innerHTML = intRenderMobile(intOrdinaMioPrimo(intTecniciSettimana()));
}

// Giorno scelto da telefono, ricordato nella sessione (settimana + giorno):
// dopo un salvataggio o tornando da un'altra app si resta sullo stesso giorno
function intRicordaGiorno() {
    try {
        sessionStorage.setItem('interventiGiorno', JSON.stringify({ s: intSettimana, g: intGiornoMobile }));
    } catch (e) { /* ignora */ }
}

function intGiornoRicordato(settimana) {
    try {
        const v = JSON.parse(sessionStorage.getItem('interventiGiorno') || 'null');
        if (v && v.s === settimana && v.g >= 0 && v.g <= 5) return v.g;
    } catch (e) { /* ignora */ }
    return null;
}

// ========================================
// CLIC SU UNA RIGA: pennello oppure modifica
// ========================================
function intClickRiga(tid, data, turno, pos) {
    if (!intPuoModificare()) return;
    if (intPennello) {
        intDipingi([{ tid: tid, data: data, turno: turno, pos: pos }], intPennello === 'GOMMA' ? null : intPennello);
    } else {
        intApriModifica(tid, data, turno, pos);
    }
}

// ---------- Pennello ----------
function intScegliPennello(colore) {
    intPennello = (intPennello === colore) ? null : colore;
    intAggiornaPennello();
}

function intAggiornaPennello() {
    document.querySelectorAll('#int-strumenti .int-pennello-btn').forEach(b => {
        b.classList.toggle('attivo', b.dataset.colore === intPennello);
    });
    const avviso = document.getElementById('int-pennello-avviso');
    if (!avviso) return;
    if (intPennello) {
        const nome = intPennello === 'GOMMA' ? 'Gomma (toglie il colore)' : 'Pennello ' + INT_COLORI[intPennello].toUpperCase();
        avviso.innerHTML = '<strong>' + nome + '</strong>: tocca le righe da ' + (intPennello === 'GOMMA' ? 'pulire' : 'colorare') +
            '. <button type="button" class="int-link" onclick="intScegliPennello(null)">Fine</button>';
        avviso.classList.remove('hidden');
    } else {
        avviso.classList.add('hidden');
    }
    document.getElementById('section-interventi-esterni').classList.toggle('int-pennello-on', !!intPennello);
}

// Colora (o toglie il colore a) un gruppo di caselle
async function intDipingi(caselle, colore) {
    const daSalvare = [];
    const daCancellare = [];
    const adesso = new Date().toISOString();
    caselle.forEach(c => {
        const r = intDati[intChiave(c.tid, c.data, c.turno, c.pos)];
        if (!colore) {
            if (!r || !r.colore) return;
            if (intHaContenuto(r)) {
                daSalvare.push(intRigaDb(c, r, { colore: null }, adesso));
            } else {
                daCancellare.push(r.id);
            }
        } else {
            if (r && r.colore === colore) return;
            daSalvare.push(intRigaDb(c, r, { colore: colore }, adesso));
        }
    });
    if (daSalvare.length === 0 && daCancellare.length === 0) return;

    if (daSalvare.length) {
        const { error } = await supabaseClient.from('interventi')
            .upsert(daSalvare, { onConflict: 'tecnico_id,data,turno,posizione' });
        if (error) { intErrore(error, 'salvataggio colore'); return; }
    }
    if (daCancellare.length) {
        const { error } = await supabaseClient.from('interventi').delete().in('id', daCancellare);
        if (error) { intErrore(error, 'rimozione colore'); return; }
    }
    await intCaricaSettimana();
}

// Riga completa per il database (mantiene i valori esistenti)
function intRigaDb(c, esistente, cambi, adesso) {
    const base = {
        tecnico_id: c.tid,
        data: c.data,
        turno: c.turno,
        posizione: c.pos,
        ora: esistente ? esistente.ora : null,
        tipo: esistente ? esistente.tipo : null,
        esito: esistente ? esistente.esito : null,
        cliente: esistente ? esistente.cliente : null,
        colore: esistente ? esistente.colore : null,
        updated_at: adesso,
        updated_by: loggedInUserEmail || null
    };
    return Object.assign(base, cambi);
}

// ========================================
// FINESTRA MODIFICA RIGA
// ========================================
function intNomeTecnico(tid) {
    const t = intTecnici.find(x => x.id === tid);
    return t ? t.nome : '';
}

function intDescrizioneCasella(tid, data, turno, pos) {
    const d = intDaIso(data);
    const gi = (d.getDay() + 6) % 7;
    return intEsc(intNomeTecnico(tid)) + '<br>' + INT_GIORNI_LUNGHI[gi] + ' ' + d.getDate() + ' ' + INT_MESI[d.getMonth()] +
        ' &middot; ' + INT_TURNI[turno].toUpperCase() + (pos ? ' (riga ' + pos + ')' : '');
}

function intApriModifica(tid, data, turno, pos) {
    const r = intDati[intChiave(tid, data, turno, pos)] || null;
    intModifica = { tid: tid, data: data, turno: turno, pos: pos, riga: r };

    document.getElementById('int-edit-dove').innerHTML = intDescrizioneCasella(tid, data, turno, pos);
    document.getElementById('int-edit-ora').value = r && r.ora ? r.ora : '';
    document.getElementById('int-edit-cliente').value = r && r.cliente ? r.cliente : '';
    intSelezionaScelta('int-edit-tipo', r && r.tipo ? r.tipo : '');
    intSelezionaScelta('int-edit-esito', r && r.esito ? r.esito : '');
    intSelezionaScelta('int-edit-colore', r && r.colore ? r.colore : '');
    document.getElementById('int-edit-svuota').classList.toggle('hidden', !r);

    document.getElementById('int-edit-modal').classList.remove('hidden');
    if (!isMobile()) setTimeout(() => document.getElementById('int-edit-ora').focus(), 50);
}

function intChiudiModifica() {
    document.getElementById('int-edit-modal').classList.add('hidden');
    intModifica = null;
}

// Pulsanti a scelta singola (tipo, esito, colore)
function intSelezionaScelta(gruppoId, valore) {
    const gruppo = document.getElementById(gruppoId);
    gruppo.dataset.valore = valore;
    gruppo.querySelectorAll('button').forEach(b => {
        b.classList.toggle('attivo', b.dataset.valore === valore);
    });
}

function intValoreScelta(gruppoId) {
    return document.getElementById(gruppoId).dataset.valore || '';
}

async function intSalvaModifica() {
    if (!intModifica) return;
    const c = intModifica;
    const valori = {
        ora: document.getElementById('int-edit-ora').value.trim().toUpperCase() || null,
        tipo: intValoreScelta('int-edit-tipo') || null,
        esito: intValoreScelta('int-edit-esito') || null,
        cliente: document.getElementById('int-edit-cliente').value.trim().replace(/\s+/g, ' ').toUpperCase() || null,
        colore: intValoreScelta('int-edit-colore') || null
    };
    const vuota = !valori.ora && !valori.tipo && !valori.esito && !valori.cliente && !valori.colore;

    const btn = document.getElementById('int-edit-salva');
    btn.disabled = true;
    try {
        if (vuota) {
            if (c.riga) {
                const { error } = await supabaseClient.from('interventi').delete().eq('id', c.riga.id);
                if (error) { intErrore(error, 'svuota riga'); return; }
            }
            await intDimenticaSeInAttesa(c, valori);
        } else {
            if (!intHaContenuto(valori)) await intDimenticaSeInAttesa(c, valori);
            const riga = intRigaDb({ tid: c.tid, data: c.data, turno: c.turno, pos: c.pos }, null, valori, new Date().toISOString());
            const { error } = await supabaseClient.from('interventi')
                .upsert(riga, { onConflict: 'tecnico_id,data,turno,posizione' });
            if (error) { intErrore(error, 'salvataggio intervento'); return; }
        }
        intChiudiModifica();
        await intCaricaSettimana();
    } finally {
        btn.disabled = false;
    }
}

async function intSvuotaRiga() {
    if (!intModifica || !intModifica.riga) return;
    if (!window.confirm('Svuotare questa riga (testo e colore)?')) return;
    const { error } = await supabaseClient.from('interventi').delete().eq('id', intModifica.riga.id);
    if (error) { intErrore(error, 'svuota riga'); return; }
    await intDimenticaSeInAttesa(intModifica, null);
    intChiudiModifica();
    await intCaricaSettimana();
}

// Riga con esito "?" (cliente non ancora chiamato) che viene svuotata:
// nessun avviso Telegram. Tolgo la riga anche da "gia' inviati", cosi'
// "Invia a Telegram" non la segnala come intervento cancellato.
async function intDimenticaSeInAttesa(c, dopo) {
    const prima = c.riga;
    if (!prima || prima.esito !== '?' || intHaContenuto(dopo)) return;
    try {
        const { error } = await supabaseClient.from('interventi_inviati').delete()
            .eq('tecnico_id', c.tid).eq('data', c.data).eq('turno', c.turno).eq('posizione', c.pos);
        if (error) console.log('Pulizia avvisi inviati non riuscita:', error);
    } catch (err) {
        console.log('Pulizia avvisi inviati non riuscita:', err);
    }
}

// ========================================
// FINESTRA "COLORA" (mattina / pomeriggio / giornata)
// ========================================
function intApriColora(tid, data) {
    if (!intPuoModificare()) return;
    intColoraCtx = { tid: tid, data: data };
    document.getElementById('int-colora-dove').innerHTML = intDescrizioneCasella(tid, data, 'M', 0).replace(' &middot; MATTINA', '');
    intScegliParte(intColoraParte);
    document.getElementById('int-colora-modal').classList.remove('hidden');
}

function intChiudiColora() {
    document.getElementById('int-colora-modal').classList.add('hidden');
    intColoraCtx = null;
}

function intScegliParte(parte) {
    intColoraParte = parte;
    document.querySelectorAll('#int-colora-parte button').forEach(b => {
        b.classList.toggle('attivo', b.dataset.valore === parte);
    });
}

async function intApplicaColora(colore) {
    if (!intColoraCtx) return;
    const turni = intColoraParte === 'G' ? ['M', 'P'] : [intColoraParte];
    const caselle = [];
    turni.forEach(turno => {
        for (let pos = 1; pos <= 4; pos++) {
            caselle.push({ tid: intColoraCtx.tid, data: intColoraCtx.data, turno: turno, pos: pos });
        }
    });
    intChiudiColora();
    await intDipingi(caselle, colore || null);
}

// ========================================
// FINESTRA TECNICI
// ========================================
function intApriTecnici() {
    if (!intPuoModificare()) return;
    document.getElementById('int-tecnici-settimana').innerHTML = intEtichettaSettimana(intSettimana) + ' ' + intAnno;
    document.getElementById('int-nuovo-tecnico').value = '';
    document.getElementById('int-nuovo-fisso').checked = false;
    intRenderTecnici();
    intCaricaUtentiApp().then(() => intRenderTecnici());
    const prova = document.getElementById('int-btn-prova-telegram');
    if (prova) prova.classList.toggle('hidden', currentUserRole !== 'admin');
    document.getElementById('int-tecnici-modal').classList.remove('hidden');
}

function intChiudiTecnici() {
    document.getElementById('int-tecnici-modal').classList.add('hidden');
}

function intRenderTecnici() {
    const box = document.getElementById('int-tecnici-lista');
    if (intTecnici.length === 0) {
        box.innerHTML = '<p class="int-nota">Nessun tecnico. Aggiungine uno qui sotto.</p>';
        return;
    }
    box.innerHTML = intTecnici.map(t => {
        const inSettimana = t.fisso ? (t.attivo) : intExtra.includes(t.id);
        return '<div class="int-tec-riga' + (t.attivo ? '' : ' disattivo') + '">' +
            '<div class="int-tec-nome-riga">' +
            '<input type="text" id="int-tec-nome-' + t.id + '" value="' + intEsc(t.nome) + '" maxlength="40">' +
            '<button type="button" class="int-btn-piccolo" onclick="intRinominaTecnico(' + t.id + ')">Salva nome</button>' +
            '</div>' +
            '<div class="int-tec-opzioni">' +
            '<label><input type="checkbox"' + (t.fisso ? ' checked' : '') + ' onchange="intImpostaFisso(' + t.id + ', this.checked)"> Tutte le settimane</label>' +
            '<label><input type="checkbox"' + (inSettimana ? ' checked' : '') + (t.fisso ? ' disabled' : '') +
            ' onchange="intImpostaInSettimana(' + t.id + ', this.checked)"> In questa settimana</label>' +
            '<button type="button" class="int-btn-piccolo ' + (t.attivo ? 'grigio' : '') + '" onclick="intImpostaAttivo(' + t.id + ',' + (!t.attivo) + ')">' +
            (t.attivo ? 'Disattiva' : 'Riattiva') + '</button>' +
            '</div>' +
            '<label class="int-tec-utente">Utente dell\'app (vede evidenziati i suoi interventi):' +
            '<select onchange="intImpostaUtente(' + t.id + ', this.value)">' + intOpzioniUtenti(t.email) + '</select></label>' +
            '</div>';
    }).join('');
}

// Utenti dell'app (Gestione Utenti) per collegarli ai tecnici
let intUtentiApp = [];

async function intCaricaUtentiApp() {
    const { data, error } = await supabaseClient.from('user_roles').select('email, role, iniziali').order('email');
    if (!error) intUtentiApp = data || [];
}

function intOpzioniUtenti(emailAttuale) {
    const attuale = String(emailAttuale || '').toLowerCase();
    let html = '<option value="">&ndash; nessuno &ndash;</option>';
    let trovato = !attuale;
    intUtentiApp.forEach(u => {
        const e = String(u.email || '').toLowerCase();
        if (e === attuale) trovato = true;
        html += '<option value="' + intEsc(e) + '"' + (e === attuale ? ' selected' : '') + '>' +
            intEsc(u.email) + ' (' + intEsc(u.role || '') + ')</option>';
    });
    if (!trovato) html += '<option value="' + intEsc(attuale) + '" selected>' + intEsc(attuale) + '</option>';
    return html;
}

async function intImpostaUtente(id, email) {
    const { error } = await supabaseClient.from('tecnici').update({ email: email || null }).eq('id', id);
    if (error) { intErrore(error, 'collegamento utente'); return; }
    await intDopoCambioTecnici();
}

async function intRinominaTecnico(id) {
    const nome = document.getElementById('int-tec-nome-' + id).value.trim().replace(/\s+/g, ' ').toUpperCase();
    if (!nome) { showCustomAlert('Il nome non pu&ograve; essere vuoto.', 'Tecnici'); return; }
    const { error } = await supabaseClient.from('tecnici').update({ nome: nome }).eq('id', id);
    if (error) {
        if (/duplicate|unique/i.test(error.message)) showCustomAlert('Esiste gi&agrave; un tecnico con questo nome.', 'Tecnici');
        else intErrore(error, 'modifica nome tecnico');
        return;
    }
    await intDopoCambioTecnici();
}

async function intImpostaFisso(id, valore) {
    const { error } = await supabaseClient.from('tecnici').update({ fisso: valore }).eq('id', id);
    if (error) { intErrore(error, 'modifica tecnico'); return; }
    await intDopoCambioTecnici();
}

async function intImpostaAttivo(id, valore) {
    if (!valore && !window.confirm('Disattivare il tecnico? Non comparir\u00E0 pi\u00F9 nelle settimane nuove (resta dove ha gi\u00E0 degli interventi).')) {
        return;
    }
    const { error } = await supabaseClient.from('tecnici').update({ attivo: valore }).eq('id', id);
    if (error) { intErrore(error, 'modifica tecnico'); return; }
    await intDopoCambioTecnici();
}

async function intImpostaInSettimana(id, valore) {
    let res;
    if (valore) {
        res = await supabaseClient.from('interventi_settimana_tecnici')
            .upsert({ settimana: intSettimana, tecnico_id: id }, { onConflict: 'settimana,tecnico_id' });
    } else {
        res = await supabaseClient.from('interventi_settimana_tecnici')
            .delete().eq('settimana', intSettimana).eq('tecnico_id', id);
    }
    if (res.error) { intErrore(res.error, 'tecnici della settimana'); return; }
    await intDopoCambioTecnici();
}

async function intAggiungiTecnico() {
    const campo = document.getElementById('int-nuovo-tecnico');
    const nome = campo.value.trim().replace(/\s+/g, ' ').toUpperCase();
    if (!nome) { campo.focus(); return; }
    const fisso = document.getElementById('int-nuovo-fisso').checked;
    const ordine = intTecnici.reduce((m, t) => Math.max(m, t.ordine || 0), 0) + 1;

    const { data, error } = await supabaseClient.from('tecnici')
        .insert({ nome: nome, fisso: fisso, ordine: ordine })
        .select()
        .single();
    if (error) {
        if (/duplicate|unique/i.test(error.message)) showCustomAlert('Esiste gi&agrave; un tecnico con questo nome.', 'Tecnici');
        else intErrore(error, 'nuovo tecnico');
        return;
    }
    // Se non e' "tutte le settimane", lo aggiungo almeno a questa settimana
    if (!fisso && data) {
        const res = await supabaseClient.from('interventi_settimana_tecnici')
            .insert({ settimana: intSettimana, tecnico_id: data.id });
        if (res.error) intErrore(res.error, 'tecnici della settimana');
    }
    campo.value = '';
    document.getElementById('int-nuovo-fisso').checked = false;
    await intDopoCambioTecnici();
}

async function intDopoCambioTecnici() {
    await intCaricaSettimana();
    intRenderTecnici();
}

// ========================================
// TEMPO REALE: modifiche dei colleghi
// ========================================
function intAvviaTempoReale() {
    if (intCanale || typeof supabaseClient === 'undefined') return;
    try {
        const ricarica = () => intRicaricaDaRemoto();
        intCanale = supabaseClient
            .channel('interventi-esterni')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'interventi' }, ricarica)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tecnici' }, ricarica)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'interventi_settimana_tecnici' }, ricarica)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'interventi_inviati' }, ricarica)
            .subscribe();
    } catch (err) {
        console.log('Tempo reale interventi non disponibile:', err);
    }

    // Tornando sull'app (es. telefono sbloccato) ricarico: il tempo reale puo' interrompersi
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') intRicaricaDaRemoto();
    });
}

function intRicaricaDaRemoto() {
    if (typeof currentSection === 'undefined' || currentSection !== 'interventi-esterni' || !currentUser) return;
    clearTimeout(intRicaricaTimer);
    intRicaricaTimer = setTimeout(() => {
        if (intSettimana) {
            intCaricaSettimana().then(() => {
                const finestra = document.getElementById('int-tecnici-modal');
                if (finestra && !finestra.classList.contains('hidden')) intRenderTecnici();
            });
        } else {
            intCaricaElenco();
        }
    }, 500);
}

// ========================================
// TELEGRAM (gruppo "Interventi esterni") - pulsante "Invia a Telegram"
// ----------------------------------------
// Le modifiche NON partono da sole: si accumulano. Il pulsante mostra quante
// sono e, premendolo, la funzione Supabase "notifica-interventi" confronta il
// planning (da oggi in avanti) con quanto gia' mandato (tabella interventi_inviati)
// e manda UN riepilogo con lo stato finale delle righe.
// Il messaggio e' raggruppato per tecnico: "Interventi aggiunti per ...", "modificati" (ora / tipo / cliente),
// "riprogrammati" (tolto l'esito NO), "cancellati" (esito NO oppure riga svuotata).
// Esito "?" = cliente non ancora chiamato: la riga resta in attesa e parte quando l'esito cambia.
// NON generano avvisi: colori, esiti NR/OK, giorni gia' passati.
// La stessa regola e' scritta anche in supabase/notifica-interventi.ts: se si cambia, cambiarla in tutti e due.
// ========================================
const INT_CAMPI_NOTIFICA = [
    { campo: 'ora', etichetta: 'ora' },
    { campo: 'tipo', etichetta: 'tipo' },
    { campo: 'cliente', etichetta: 'cliente' }
];
const INT_ETICHETTE_EVENTO = {
    NUOVO: 'AGGIUNTO',
    MODIFICA: 'MODIFICATO',
    RIPRISTINATO: 'RIPROGRAMMATO',
    ANNULLATO: 'CANCELLATO',
    RIMOSSO: 'CANCELLATO'
};
let intDaInviare = [];          // modifiche in attesa di essere mandate
let intContaTimer = null;

function intTipoEvento(prima, dopo) {
    const haPrima = intHaContenuto(prima);
    const haDopo = intHaContenuto(dopo);
    if (!haPrima && !haDopo) return null;
    if (!haPrima) return dopo.esito === 'NO' ? null : 'NUOVO';
    if (!haDopo) return prima.esito === 'NO' ? null : 'RIMOSSO';
    if (dopo.esito === 'NO' && prima.esito !== 'NO') return 'ANNULLATO';
    if (prima.esito === 'NO' && dopo.esito !== 'NO') return 'RIPRISTINATO';
    if (dopo.esito === 'NO') return null;
    const cambiato = INT_CAMPI_NOTIFICA.some(c => (prima[c.campo] || '') !== (dopo[c.campo] || ''));
    return cambiato ? 'MODIFICA' : null;
}

// Calcola le modifiche in attesa (stessa logica della funzione Supabase)
async function intCalcolaDaInviare() {
    const oggi = intOggi();
    const campi = 'tecnico_id, data, turno, posizione, ora, tipo, esito, cliente';
    const [att, inv] = await Promise.all([
        intLeggiTutti(() => supabaseClient.from('interventi').select(campi).gte('data', oggi).order('id')),
        intLeggiTutti(() => supabaseClient.from('interventi_inviati').select(campi).gte('data', oggi).order('data'))
    ]);
    if (att.error || inv.error) return { errore: att.error || inv.error };
    const mappaAtt = {};
    (att.data || []).forEach(r => { mappaAtt[intChiave(r.tecnico_id, r.data, r.turno, r.posizione)] = r; });
    const mappaInv = {};
    (inv.data || []).forEach(r => { mappaInv[intChiave(r.tecnico_id, r.data, r.turno, r.posizione)] = r; });
    const elenco = [];
    let inAttesa = 0;
    new Set(Object.keys(mappaAtt).concat(Object.keys(mappaInv))).forEach(k => {
        const prima = mappaInv[k];
        const dopo = mappaAtt[k];
        // Esito "?" = cliente non ancora chiamato: resta in attesa
        if (intHaContenuto(dopo) && dopo.esito === '?') { inAttesa++; return; }
        const tipo = intTipoEvento(prima, dopo);
        if (tipo) elenco.push({ tipo: tipo, riga: intHaContenuto(dopo) ? dopo : prima });
    });
    elenco.sort((a, b) => a.riga.data.localeCompare(b.riga.data) || a.riga.turno.localeCompare(b.riga.turno) || a.riga.posizione - b.riga.posizione);
    return { elenco: elenco, inAttesa: inAttesa };
}

// Aggiorna il numerino sui pulsanti "Invia a Telegram" (con un piccolo ritardo per non ripetere le letture)
function intAggiornaDaInviare() {
    const pulsanti = document.querySelectorAll('.int-btn-invia');
    pulsanti.forEach(b => b.classList.toggle('hidden', !intPuoModificare()));
    if (!intPuoModificare()) return;
    clearTimeout(intContaTimer);
    intContaTimer = setTimeout(async () => {
        const ris = await intCalcolaDaInviare();
        if (ris.errore) {
            // Tabella non ancora creata (script interventi-telegram-setup.sql): pulsante nascosto
            console.log('Conteggio modifiche da inviare non disponibile:', ris.errore);
            pulsanti.forEach(b => b.classList.add('hidden'));
            return;
        }
        intDaInviare = ris.elenco;
        const n = intDaInviare.length;
        pulsanti.forEach(b => {
            b.innerHTML = '&#128232; Invia a Telegram' + (n ? ' <span class="int-invia-num">' + n + '</span>' : '');
            b.classList.toggle('da-inviare', n > 0);
            b.title = (n ? n + (n === 1 ? ' modifica da inviare' : ' modifiche da inviare') : 'Nessuna modifica da inviare') +
                (ris.inAttesa ? ' - ' + ris.inAttesa + ' in attesa (esito ?)' : '');
        });
    }, 300);
}

async function intInviaTelegram() {
    if (!intPuoModificare()) return;
    const ris = await intCalcolaDaInviare();
    if (ris.errore) { intErrore(ris.errore, 'controllo modifiche da inviare'); return; }
    const elenco = ris.elenco;
    if (elenco.length === 0) {
        showCustomAlert('Nessuna modifica da inviare: il gruppo Telegram &egrave; gi&agrave; aggiornato.' +
            (ris.inAttesa ? '<br><br>' + ris.inAttesa + (ris.inAttesa === 1 ? ' riga &egrave;' : ' righe sono') +
                ' in attesa con esito <strong>?</strong>: partiranno quando cambi l\'esito.' : ''),
            'Invia a Telegram', '&#9989;');
        intAggiornaDaInviare();
        return;
    }

    // Anteprima nella conferma (max 15 righe)
    const righe = elenco.slice(0, 15).map(e => {
        const d = intDaIso(e.riga.data);
        return '- ' + INT_ETICHETTE_EVENTO[e.tipo] + ': ' + INT_GIORNI[(d.getDay() + 6) % 7] + ' ' + d.getDate() + ' ' +
            intNomeTecnico(e.riga.tecnico_id) + ' ' + (e.riga.ora || '') + ' ' + (e.riga.cliente || '');
    });
    if (elenco.length > 15) righe.push('... e altre ' + (elenco.length - 15));
    if (ris.inAttesa) righe.push('\n(' + ris.inAttesa + ' in attesa con esito ? : non vengono inviate)');
    if (!window.confirm('Inviare al gruppo Telegram "Interventi esterni" ' + elenco.length +
        (elenco.length === 1 ? ' modifica' : ' modifiche') + '?\n\n' + righe.join('\n'))) {
        return;
    }

    const pulsanti = document.querySelectorAll('.int-btn-invia');
    pulsanti.forEach(b => { b.disabled = true; b.innerHTML = '&#8987; Invio...'; });
    try {
        const { data, error } = await supabaseClient.functions.invoke('notifica-interventi', {
            body: { invia: true, iniziali: intIniziali() }
        });
        if (!error && data && data.ok) {
            showCustomAlert('Riepilogo inviato nel gruppo Telegram (' + data.inviati + (data.inviati === 1 ? ' modifica' : ' modifiche') + ').',
                'Invia a Telegram', '&#9989;');
        } else {
            await intMostraErroreTelegram(data, error);
        }
    } finally {
        pulsanti.forEach(b => { b.disabled = false; });
        intAggiornaDaInviare();
    }
}

function intIniziali() {
    try {
        return (typeof userInitials !== 'undefined' && userInitials[loggedInUserEmail]) || '';
    } catch (e) {
        return '';
    }
}

async function intMostraErroreTelegram(data, error) {
    let dettaglio = (data && data.errore) || '';
    if (!dettaglio && error && error.context && typeof error.context.json === 'function') {
        try { dettaglio = (await error.context.json()).errore || ''; } catch (e) { /* ignora */ }
    }
    showCustomAlert(
        'Il messaggio non &egrave; partito.<br><small>' + intEsc(dettaglio || (error && error.message) || '') + '</small><br><br>' +
        'Controlla su Supabase che la funzione <strong>notifica-interventi</strong> sia pubblicata (con &quot;Verify JWT&quot; spento) ' +
        'e che i secrets <strong>TELEGRAM_BOT_TOKEN_INTERVENTI</strong> e <strong>TELEGRAM_CHAT_ID_INTERVENTI</strong> siano giusti.',
        'Telegram non configurato', '&#9888;&#65039;'
    );
}

async function intProvaTelegram() {
    const btn = document.getElementById('int-btn-prova-telegram');
    if (btn) btn.disabled = true;
    try {
        const { data, error } = await supabaseClient.functions.invoke('notifica-interventi', {
            body: { prova: true, iniziali: intIniziali() }
        });
        if (!error && data && data.ok) {
            showCustomAlert('Messaggio di prova inviato nel gruppo Telegram &quot;Interventi esterni&quot;.', 'Telegram', '&#9989;');
        } else {
            await intMostraErroreTelegram(data, error);
        }
    } finally {
        if (btn) btn.disabled = false;
    }
}

// ========================================
// ARCHIVIO DI FINE ANNO (solo admin)
// ----------------------------------------
// 1. scarica un Excel con tutti gli interventi dell'anno scelto
// 2. dopo la conferma (scrivendo l'anno) li cancella dal server
// L'anno = settimane il cui lunedi' cade nell'anno (es. 28 dic - 2 gen sta nell'anno vecchio).
// ========================================
const INT_EXCELJS_URL = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
const INT_COLORI_EXCEL = { ROSSO: 'FFEF4444', GIALLO: 'FFFDE047', VERDE: 'FF86EFAC', BLU: 'FF93C5FD' };

function intCaricaExcelJS() {
    return new Promise((resolve, reject) => {
        if (window.ExcelJS) return resolve(window.ExcelJS);
        const script = document.createElement('script');
        script.src = INT_EXCELJS_URL;
        script.onload = () => window.ExcelJS ? resolve(window.ExcelJS) : reject(new Error('ExcelJS non disponibile'));
        script.onerror = () => reject(new Error('Impossibile caricare ExcelJS'));
        document.head.appendChild(script);
    });
}

function intScaricaBlob(blob, nome) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
}

const INT_COLONNE_ARCHIVIO = [
    { titolo: 'SETTIMANA', larghezza: 34 },
    { titolo: 'DATA', larghezza: 12 },
    { titolo: 'GIORNO', larghezza: 8 },
    { titolo: 'TECNICO', larghezza: 22 },
    { titolo: 'TURNO', larghezza: 12 },
    { titolo: 'RIGA', larghezza: 6 },
    { titolo: 'ORA', larghezza: 12 },
    { titolo: 'TIPO', larghezza: 8 },
    { titolo: 'ESITO', larghezza: 8 },
    { titolo: 'CLIENTE', larghezza: 50 },
    { titolo: 'COLORE', larghezza: 10 }
];

function intRigheArchivio(interventi, tecnici) {
    const perId = {};
    tecnici.forEach(t => { perId[t.id] = t; });
    const ordineTec = id => (perId[id] ? (perId[id].ordine || 0) : 999);
    return interventi.slice().sort((a, b) =>
        a.data.localeCompare(b.data) ||
        ordineTec(a.tecnico_id) - ordineTec(b.tecnico_id) ||
        a.turno.localeCompare(b.turno) ||
        a.posizione - b.posizione
    ).map(r => {
        const d = intDaIso(r.data);
        const lun = intLunediDi(r.data);
        return {
            valori: [
                intEtichettaSettimana(lun) + ' ' + intDaIso(lun).getFullYear(),
                intPad(d.getDate()) + '/' + intPad(d.getMonth() + 1) + '/' + d.getFullYear(),
                INT_GIORNI[(d.getDay() + 6) % 7],
                perId[r.tecnico_id] ? perId[r.tecnico_id].nome : ('TECNICO ' + r.tecnico_id),
                r.turno === 'M' ? 'MATTINA' : 'POMERIGGIO',
                r.posizione,
                r.ora || '',
                r.tipo || '',
                r.esito || '',
                r.cliente || '',
                r.colore || ''
            ],
            colore: r.colore
        };
    });
}

async function intCreaExcelArchivio(righe, anno) {
    try {
        const ExcelJS = await intCaricaExcelJS();
        const wb = new ExcelJS.Workbook();
        wb.creator = 'AGRIMAG';
        const ws = wb.addWorksheet('INTERVENTI ' + anno, { views: [{ state: 'frozen', ySplit: 1 }] });
        ws.columns = INT_COLONNE_ARCHIVIO.map(c => ({ header: c.titolo, width: c.larghezza }));
        const testa = ws.getRow(1);
        testa.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        testa.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4D6A3B' } };
        righe.forEach(r => {
            const riga = ws.addRow(r.valori);
            if (r.colore && INT_COLORI_EXCEL[r.colore]) {
                riga.eachCell({ includeEmpty: true }, cella => {
                    cella.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INT_COLORI_EXCEL[r.colore] } };
                });
            }
            if (r.valori[8] === 'NO') riga.font = { strike: true };
        });
        ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: INT_COLONNE_ARCHIVIO.length } };
        const buffer = await wb.xlsx.writeBuffer();
        return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    } catch (err) {
        // Riserva: file semplice senza colori (SheetJS, gia' caricato dall'app)
        console.log('ExcelJS non disponibile, uso il file semplice:', err);
        const dati = [INT_COLONNE_ARCHIVIO.map(c => c.titolo)].concat(righe.map(r => r.valori));
        const ws = XLSX.utils.aoa_to_sheet(dati);
        ws['!cols'] = INT_COLONNE_ARCHIVIO.map(c => ({ wch: c.larghezza }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'INTERVENTI ' + anno);
        const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    }
}

async function intArchiviaAnno() {
    if (currentUserRole !== 'admin') return;
    const anno = intAnno;
    const settimane = intSettimaneAnno(anno);
    if (settimane.length === 0) {
        showCustomAlert('Nessuna settimana da archiviare per il ' + anno + '.', 'Archivia anno');
        return;
    }
    const da = settimane[0];
    const a = intPiuGiorni(settimane[settimane.length - 1], 5);

    if (intOggi() <= a && !window.confirm(
        'Il ' + anno + ' non \u00E8 ancora finito (ultima settimana fino al ' + a.split('-').reverse().join('/') + ').\n\n' +
        'Vuoi archiviarlo lo stesso?')) {
        return;
    }

    const btn = document.getElementById('int-btn-archivia');
    const testoBtn = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '&#8987; Preparazione...'; }
    try {
        const [resInt, resTec] = await Promise.all([
            intLeggiTutti(() => supabaseClient.from('interventi').select('*')
                .gte('data', da).lte('data', a).order('id')),
            supabaseClient.from('tecnici').select('*')
        ]);
        if (resInt.error || resTec.error) { intErrore(resInt.error || resTec.error, 'lettura anno'); return; }
        const interventi = resInt.data || [];
        if (interventi.length === 0) {
            showCustomAlert('Nel ' + anno + ' non ci sono interventi sul server: niente da archiviare.', 'Archivia anno');
            return;
        }

        // 1. Excel
        const righe = intRigheArchivio(interventi, resTec.data || []);
        const blob = await intCreaExcelArchivio(righe, anno);
        intScaricaBlob(blob, 'INTERVENTI_ESTERNI_' + anno + '.xlsx');

        await showCustomAlert(
            'Ho scaricato <strong>INTERVENTI_ESTERNI_' + anno + '.xlsx</strong> (' + righe.length + ' righe).<br><br>' +
            'Prima di continuare <strong>aprilo e controlla</strong> che sia completo, poi salvalo dove tieni l\'archivio.<br>' +
            'Dopo l\'OK ti chieder&ograve; se svuotare il server.',
            'Archivio ' + anno, '&#128230;');

        // 2. Svuota (conferma scrivendo l'anno)
        const conferma = window.prompt(
            'ATTENZIONE: verranno CANCELLATI dal server tutti gli interventi del ' + anno +
            ' (' + interventi.length + ' righe). Non si possono recuperare dall\'app.\n\n' +
            'Hai controllato il file Excel? Per confermare scrivi ' + anno + ':');
        if (conferma === null || conferma.trim() !== String(anno)) {
            showCustomAlert('Server NON svuotato. Il file Excel resta comunque scaricato.', 'Archivio ' + anno);
            return;
        }

        const canc = await supabaseClient.from('interventi').delete().gte('data', da).lte('data', a);
        if (canc.error) { intErrore(canc.error, 'svuotamento anno'); return; }
        const cancExtra = await supabaseClient.from('interventi_settimana_tecnici').delete()
            .gte('settimana', da).lte('settimana', settimane[settimane.length - 1]);
        if (cancExtra.error) console.log('Pulizia tecnici della settimana non riuscita:', cancExtra.error);
        const cancInviati = await supabaseClient.from('interventi_inviati').delete().gte('data', da).lte('data', a);
        if (cancInviati.error) console.log('Pulizia avvisi inviati non riuscita:', cancInviati.error);

        await showCustomAlert('Anno ' + anno + ' archiviato e server svuotato.', 'Archivio ' + anno, '&#9989;');
        await intCaricaElenco();
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = testoBtn; }
    }
}

// ========================================
// FUNZIONI USATE DALL'HTML (onclick)
// ========================================
window.intProvaTelegram = intProvaTelegram;
window.intInviaTelegram = intInviaTelegram;
window.intImpostaUtente = intImpostaUtente;
window.intArchiviaAnno = intArchiviaAnno;
window.openInterventiEsterni = openInterventiEsterni;
window.intMostraElenco = intMostraElenco;
window.intCambiaAnno = intCambiaAnno;
window.intApriSettimana = intApriSettimana;
window.intSpostaSettimana = intSpostaSettimana;
window.intVaiOggi = intVaiOggi;
window.intScegliGiorno = intScegliGiorno;
window.intClickRiga = intClickRiga;
window.intScegliPennello = intScegliPennello;
window.intApriModifica = intApriModifica;
window.intChiudiModifica = intChiudiModifica;
window.intSelezionaScelta = intSelezionaScelta;
window.intSalvaModifica = intSalvaModifica;
window.intSvuotaRiga = intSvuotaRiga;
window.intApriColora = intApriColora;
window.intChiudiColora = intChiudiColora;
window.intScegliParte = intScegliParte;
window.intApplicaColora = intApplicaColora;
window.intApriTecnici = intApriTecnici;
window.intChiudiTecnici = intChiudiTecnici;
window.intRinominaTecnico = intRinominaTecnico;
window.intImpostaFisso = intImpostaFisso;
window.intImpostaAttivo = intImpostaAttivo;
window.intImpostaInSettimana = intImpostaInSettimana;
window.intAggiungiTecnico = intAggiungiTecnico;
