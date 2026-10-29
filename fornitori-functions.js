// ========================================
// LISTINI FORNITORI (cartelle Google Drive)
// ----------------------------------------
// I PDF stanno su Google Drive, nella cartella aziendale "LISTINI FORNITORI":
//   CARTELLA PRINCIPALE / FORNITORE / file                 (fornitore diretto)
//   CARTELLA PRINCIPALE / IMPORTATORE / MARCHIO / file     (importatore)
// L'app chiede l'elenco alla funzione Supabase "listini-drive", che lo chiede
// allo script Google dell'account aziendale. I PDF si aprono su Google Drive.
// Nomi dei file: LISTINO 2026 / CATALOGO 2026 (+ eventuale nota dopo l'anno).
// Per ogni marchio l'app mette in evidenza listino e catalogo dell'anno piu'
// recente; gli altri finiscono in "Archivio".
// ========================================

let fornitoriDati = null;        // ultima risposta della funzione
let fornitoriCaricamento = false;
let fornitoriSearchTimeout = null;
let fornitoriAperti = fornLeggiAperti();  // fornitori aperti (ricordati durante la sessione)
const FORNITORI_GIORNI_NOVITA = 7;        // file caricati/aggiornati da meno di 7 giorni = "NUOVO"

function fornLeggiAperti() {
    try {
        const v = JSON.parse(sessionStorage.getItem('fornitoriAperti') || '[]');
        return new Set(Array.isArray(v) ? v : []);
    } catch (e) {
        return new Set();
    }
}

function fornSalvaAperti() {
    try {
        sessionStorage.setItem('fornitoriAperti', JSON.stringify(Array.from(fornitoriAperti)));
    } catch (e) { /* ignora */ }
}

function fornERecente(iso) {
    const d = new Date(iso);
    return !isNaN(d.getTime()) && (Date.now() - d.getTime()) < FORNITORI_GIORNI_NOVITA * 24 * 3600 * 1000;
}

const FORNITORI_TIPI = {
    LISTINO: { etichetta: 'Listino', icona: '&#128210;' },
    CATALOGO: { etichetta: 'Catalogo', icona: '&#128216;' },
    ALTRO: { etichetta: 'File', icona: '&#128196;' }
};

function fornEsc(valore) {
    if (valore === null || valore === undefined) return '';
    return String(valore)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function fornLink(url) {
    // Solo link di Google (https): niente altro finisce in un href
    return /^https:\/\//i.test(String(url || '')) ? fornEsc(url) : '#';
}

function fornData(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
}

// ---------- Lettura del nome del file ----------
// "LISTINO 2026.pdf" -> { tipo: 'LISTINO', anno: 2026, nota: '' }
// "Catalogo_2025 attrezzi.pdf" -> { tipo: 'CATALOGO', anno: 2025, nota: 'ATTREZZI' }
function fornAnalizzaNome(nomeFile) {
    const base = String(nomeFile || '').replace(/\.[a-z0-9]{2,5}$/i, '');
    const testo = base.toUpperCase().replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim();

    let tipo = 'ALTRO';
    if (/\bLISTIN[OI]\b/.test(testo) || /LISTIN[OI]/.test(testo)) tipo = 'LISTINO';
    else if (/CATALOG/.test(testo)) tipo = 'CATALOGO';

    const anni = (testo.match(/(?:^|[^0-9])(20[0-9]{2})(?=[^0-9]|$)/g) || [])
        .map(a => parseInt(a.replace(/[^0-9]/g, ''), 10));
    const anno = anni.length > 0 ? Math.max.apply(null, anni) : null;

    const nota = testo
        .replace(/LISTIN[OI]|CATALOGH?[OI]|CATALOG/g, ' ')
        .replace(/(?:^|\s)20[0-9]{2}(?=\s|$)/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    return { tipo: tipo, anno: anno, nota: nota, nomeOk: tipo !== 'ALTRO' && anno !== null };
}

// Divide i file di un marchio in: piu' recenti (in evidenza), archivio, altri
function fornOrganizzaFile(files) {
    const analizzati = (files || []).map(f => Object.assign({}, f, fornAnalizzaNome(f.nome), {
        inArchivio: /ARCHIVI/i.test(f.cartella || '')
    }));

    const recenti = [];
    const archivio = [];
    const altri = [];

    ['LISTINO', 'CATALOGO'].forEach(tipo => {
        const delTipo = analizzati.filter(f => f.tipo === tipo);
        const annoMax = delTipo.reduce((max, f) => (f.anno && !f.inArchivio && f.anno > max ? f.anno : max), 0);
        delTipo.forEach(f => {
            if (!f.inArchivio && f.anno && f.anno === annoMax) recenti.push(f);
            else if (f.anno) archivio.push(f);
            else altri.push(f); // listino/catalogo senza anno
        });
    });
    analizzati.filter(f => f.tipo === 'ALTRO').forEach(f => altri.push(f));

    const ordina = (a, b) =>
        (a.tipo === b.tipo ? 0 : (a.tipo === 'LISTINO' ? -1 : 1)) ||
        ((b.anno || 0) - (a.anno || 0)) ||
        ((a.nota ? 1 : 0) - (b.nota ? 1 : 0)) ||
        String(a.nome).localeCompare(String(b.nome), 'it', { numeric: true });
    recenti.sort(ordina);
    archivio.sort(ordina);
    altri.sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'it', { numeric: true }));
    return { recenti: recenti, archivio: archivio, altri: altri };
}

// ---------- Caricamento ----------
async function caricaListiniFornitori(aggiorna) {
    if (fornitoriCaricamento) return;
    fornitoriCaricamento = true;
    const container = document.getElementById('fornitori-container');
    const btn = document.getElementById('fornitori-aggiorna');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '&#8987; Caricamento...';
    }
    if (container && (!fornitoriDati || aggiorna)) {
        container.innerHTML = '<div class="card"><p style="text-align:center">&#8987; Lettura delle cartelle su Google Drive...</p></div>';
    }

    let errore = null;
    try {
        const { data, error } = await supabaseClient.functions.invoke('listini-drive', { body: { aggiorna: !!aggiorna } });
        if (error) {
            errore = error.message || String(error);
            try {
                if (error.context && typeof error.context.json === 'function') {
                    const corpo = await error.context.json();
                    if (corpo && corpo.errore) errore = corpo.errore;
                }
            } catch (e) { /* ignora */ }
        } else if (!data || data.ok !== true) {
            errore = (data && data.errore) ? data.errore : 'Risposta inattesa dalla funzione listini-drive';
        } else {
            fornitoriDati = data;
        }
    } catch (err) {
        errore = err && err.message ? err.message : String(err);
    }

    fornitoriCaricamento = false;
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = '&#128260; Aggiorna elenco';
    }

    if (errore) {
        console.log('Listini fornitori non caricati:', errore);
        if (container) {
            container.innerHTML =
                '<div class="card fornitori-errore">' +
                    '<p><strong>&#10060; Non riesco a leggere i listini da Google Drive.</strong></p>' +
                    '<p class="fornitori-errore-dettaglio">' + fornEsc(errore) + '</p>' +
                    '<p class="fornitori-errore-dettaglio">Se il problema continua, avvisa l\'amministratore: ' +
                    'va controllata la configurazione dello script Google e della funzione Supabase &quot;listini-drive&quot;.</p>' +
                '</div>';
        }
        return;
    }
    renderListiniFornitori();
}

function openListiniFornitori() {
    if (fornitoriDati) renderListiniFornitori();
    caricaListiniFornitori(false);
}

// ---------- Ricerca ----------
function fornTestoRicerca() {
    const el = document.getElementById('fornitori-search');
    return String(el ? el.value : '').toUpperCase().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function fornCorrisponde(testi, ricerca) {
    if (!ricerca) return true;
    const insieme = testi.join(' ').toUpperCase().replace(/[_\-]+/g, ' ');
    return ricerca.split(' ').every(parola => insieme.indexOf(parola) !== -1);
}

// ---------- Disegno ----------
function fornRigaFile(f, classe) {
    const info = FORNITORI_TIPI[f.tipo] || FORNITORI_TIPI.ALTRO;
    const titolo = f.nomeOk
        ? info.etichetta + ' ' + f.anno + (f.nota ? ' &middot; ' + fornEsc(f.nota) : '')
        : fornEsc(f.nome);
    return '<a class="fornitori-file ' + (classe || '') + '" href="' + fornLink(f.url) + '" target="_blank" rel="noopener">' +
        '<span class="fornitori-file-icona">' + info.icona + '</span>' +
        '<span class="fornitori-file-testo">' +
            '<span class="fornitori-file-nome">' + titolo + '</span>' +
            '<span class="fornitori-file-meta">' +
                (f.nomeOk ? fornEsc(f.nome) + ' &middot; ' : '') +
                'aggiornato il ' + fornData(f.modificato) +
                (f.cartella ? ' &middot; cartella ' + fornEsc(f.cartella) : '') +
            '</span>' +
        '</span>' +
        '<span class="fornitori-file-apri">Apri &#8599;</span>' +
    '</a>';
}

function fornBloccoMarchio(marchio, mostraNome) {
    const gruppi = fornOrganizzaFile(marchio.file);
    let html = '<div class="fornitori-marchio">';
    if (mostraNome) {
        html += '<div class="fornitori-marchio-titolo">' +
            '<span>&#127991;&#65039; ' + fornEsc(marchio.nome) + '</span>' +
            '<a class="fornitori-cartella-link" href="' + fornLink(marchio.url) + '" target="_blank" rel="noopener">Cartella &#8599;</a>' +
        '</div>';
    }

    if (gruppi.recenti.length === 0 && gruppi.archivio.length === 0 && gruppi.altri.length === 0) {
        html += '<p class="fornitori-vuoto">Nessun file in questa cartella.</p>';
    }

    gruppi.recenti.forEach(f => { html += fornRigaFile(f, 'fornitori-file-recente'); });

    if (gruppi.altri.length > 0) {
        const daSistemare = gruppi.altri.filter(f => f.tipo === 'ALTRO' || !f.anno);
        gruppi.altri.forEach(f => { html += fornRigaFile(f, ''); });
        if (daSistemare.length > 0) {
            html += '<p class="fornitori-avviso">&#9888;&#65039; ' + daSistemare.length +
                (daSistemare.length === 1 ? ' file ha' : ' file hanno') +
                ' un nome da sistemare (es. <strong>LISTINO 2026</strong> o <strong>CATALOGO 2026</strong>): ' +
                'cos&igrave; l\'app non sa se &egrave; il pi&ugrave; recente.</p>';
        }
    }

    if (gruppi.archivio.length > 0) {
        html += '<details class="fornitori-archivio"><summary>&#128451;&#65039; Archivio (' + gruppi.archivio.length + ')</summary>';
        gruppi.archivio.forEach(f => { html += fornRigaFile(f, 'fornitori-file-archivio'); });
        html += '</details>';
    }
    html += '</div>';
    return html;
}

function renderListiniFornitori() {
    const container = document.getElementById('fornitori-container');
    if (!container || !fornitoriDati) return;

    const cartellaLink = document.getElementById('fornitori-cartella');
    if (cartellaLink && fornitoriDati.cartella && fornitoriDati.cartella.url) {
        cartellaLink.href = fornLink(fornitoriDati.cartella.url);
        cartellaLink.classList.remove('hidden');
    }
    const stato = document.getElementById('fornitori-stato');
    if (stato && fornitoriDati.aggiornato) {
        const d = new Date(fornitoriDati.aggiornato);
        stato.textContent = 'Elenco letto da Drive alle ' +
            String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }

    const ricerca = fornTestoRicerca();
    // Cartelle vuote nascoste: si vedono solo i marchi con almeno un file
    // e i fornitori con almeno un marchio non vuoto
    let marchiVuoti = 0;
    let fornitoriVuoti = 0;
    const fornitori = (fornitoriDati.fornitori || [])
        .map(f => {
            const pieni = (f.marchi || []).filter(m => (m.file || []).length > 0);
            marchiVuoti += (f.marchi || []).filter(m => !m.diretto && (m.file || []).length === 0).length;
            return Object.assign({}, f, { marchi: pieni });
        })
        .filter(f => {
            if (f.marchi.length > 0) return true;
            fornitoriVuoti++;
            return false;
        })
        .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'it', { numeric: true }));

    if (stato) {
        const nascosti = [];
        if (fornitoriVuoti > 0) nascosti.push(fornitoriVuoti + (fornitoriVuoti === 1 ? ' fornitore' : ' fornitori'));
        if (marchiVuoti > 0) nascosti.push(marchiVuoti + (marchiVuoti === 1 ? ' marchio' : ' marchi'));
        if (nascosti.length > 0) {
            stato.textContent += ' \u00B7 non mostrati perch\u00E9 senza file: ' + nascosti.join(' e ');
        }
    }

    let html = '';
    let mostrati = 0;

    if (!ricerca && fornitoriDati.fuoriPosto && fornitoriDati.fuoriPosto.length > 0) {
        html += '<div class="card fornitori-fuoriposto"><p>&#9888;&#65039; <strong>' + fornitoriDati.fuoriPosto.length +
            (fornitoriDati.fuoriPosto.length === 1 ? ' file &egrave;' : ' file sono') +
            ' nella cartella principale</strong>, fuori da un fornitore: spostali nella cartella del fornitore giusto.</p>' +
            fornitoriDati.fuoriPosto.map(f => fornRigaFile(Object.assign({}, f, fornAnalizzaNome(f.nome)), '')).join('') +
        '</div>';
    }

    fornitori.forEach(fornitore => {
        const tuttiMarchi = (fornitore.marchi || []).slice()
            .sort((a, b) => (a.diretto ? -1 : 0) - (b.diretto ? -1 : 0) ||
                String(a.nome).localeCompare(String(b.nome), 'it', { numeric: true }));
        const marchi = tuttiMarchi.filter(m => fornCorrisponde(
            [fornitore.nome, m.nome].concat((m.file || []).map(f => f.nome)), ricerca));
        const cartellaVuota = tuttiMarchi.length === 0;
        if (ricerca && marchi.length === 0 && !(cartellaVuota && fornCorrisponde([fornitore.nome], ricerca))) return;
        mostrati++;

        const importatore = tuttiMarchi.some(m => !m.diretto);
        const nomiMarchi = tuttiMarchi.filter(m => !m.diretto).map(m => m.nome);
        const tuttiFile = [].concat.apply([], tuttiMarchi.map(m => m.file || []));
        const novita = tuttiFile.some(f => fornERecente(f.modificato));
        // Con una ricerca attiva i risultati si aprono da soli
        const aperto = ricerca ? true : fornitoriAperti.has(fornitore.nome);

        html +=
            '<details class="fornitori-card"' + (aperto ? ' open' : '') + ' data-nome="' + fornEsc(fornitore.nome) + '">' +
                '<summary class="fornitori-card-header">' +
                    '<div class="fornitori-card-titolo">' +
                        '<h3>' + fornEsc(fornitore.nome) + '</h3>' +
                        '<span class="fornitori-card-tipo">' +
                            (importatore
                                ? 'Importatore &middot; ' + nomiMarchi.length + (nomiMarchi.length === 1 ? ' marchio' : ' marchi')
                                : 'Fornitore diretto') +
                        '</span>' +
                        (importatore ? '<span class="fornitori-card-marchi">' + nomiMarchi.map(fornEsc).join(' &middot; ') + '</span>' : '') +
                    '</div>' +
                    '<div class="fornitori-card-badge">' +
                        (novita ? '<span class="fornitori-badge fornitori-badge-nuovo">NUOVO</span>' : '') +
                        (tuttiFile.length > 0
                            ? '<span class="fornitori-badge">' + tuttiFile.length + ' file</span>'
                            : '<span class="fornitori-badge fornitori-badge-vuoto">vuota</span>') +
                    '</div>' +
                    '<span class="fornitori-chevron" aria-hidden="true">&#9662;</span>' +
                '</summary>' +
                '<div class="fornitori-card-corpo">' +
                    '<a class="fornitori-cartella-link fornitori-cartella-fornitore" href="' + fornLink(fornitore.url) +
                        '" target="_blank" rel="noopener">&#128193; Apri la cartella di ' + fornEsc(fornitore.nome) + ' su Drive &#8599;</a>';

        if (marchi.length === 0) {
            html += '<p class="fornitori-vuoto">Cartella vuota: aggiungi il listino su Drive.</p>';
        } else {
            html += '<div class="fornitori-marchi-griglia">';
            marchi.forEach(m => { html += fornBloccoMarchio(m, !m.diretto); });
            html += '</div>';
        }
        html += '</div></details>';
    });

    if (mostrati === 0) {
        html += (fornitori.length === 0)
            ? '<div class="card"><p style="text-align:center">La cartella dei listini &egrave; vuota: crea su Drive una cartella per ogni fornitore.</p></div>'
            : '<div class="card"><p style="text-align:center">Nessun fornitore o marchio trovato.</p></div>';
    }

    const conteggio = document.getElementById('fornitori-count');
    if (conteggio) {
        conteggio.textContent = ricerca
            ? mostrati + ' di ' + fornitori.length + ' fornitori'
            : fornitori.length + (fornitori.length === 1 ? ' fornitore' : ' fornitori');
    }
    container.innerHTML = html;
    fornAggiornaPulsanteTutti();
}

// ---------- Eventi ----------
document.addEventListener('DOMContentLoaded', () => {
    const search = document.getElementById('fornitori-search');
    if (search) {
        search.addEventListener('input', () => {
            clearTimeout(fornitoriSearchTimeout);
            fornitoriSearchTimeout = setTimeout(renderListiniFornitori, 200);
        });
    }
    const btn = document.getElementById('fornitori-aggiorna');
    if (btn) btn.addEventListener('click', () => caricaListiniFornitori(true));

    // Apertura / chiusura di un fornitore: la scelta viene ricordata
    // ("toggle" non risale fino al contenitore: serve l'ascolto in fase di cattura)
    const container = document.getElementById('fornitori-container');
    if (container) {
        container.addEventListener('toggle', (e) => {
            const card = e.target;
            if (!card || !card.classList || !card.classList.contains('fornitori-card')) return;
            if (fornTestoRicerca()) return; // con la ricerca attiva le aperture sono automatiche
            const nome = card.getAttribute('data-nome');
            if (card.open) fornitoriAperti.add(nome);
            else fornitoriAperti.delete(nome);
            fornSalvaAperti();
            fornAggiornaPulsanteTutti();
        }, true);
    }

    const btnTutti = document.getElementById('fornitori-tutti');
    if (btnTutti) {
        btnTutti.addEventListener('click', () => {
            const cards = document.querySelectorAll('#fornitori-container details.fornitori-card');
            const apri = !Array.from(cards).every(c => c.open);
            fornitoriAperti = new Set();
            cards.forEach(c => {
                c.open = apri;
                if (apri) fornitoriAperti.add(c.getAttribute('data-nome'));
            });
            fornSalvaAperti();
            fornAggiornaPulsanteTutti();
        });
    }
});

function fornAggiornaPulsanteTutti() {
    const btnTutti = document.getElementById('fornitori-tutti');
    if (!btnTutti) return;
    const cards = document.querySelectorAll('#fornitori-container details.fornitori-card');
    const tuttiAperti = cards.length > 0 && Array.from(cards).every(c => c.open);
    btnTutti.innerHTML = tuttiAperti ? '&#9650; Chiudi tutti' : '&#9660; Apri tutti';
}

window.openListiniFornitori = openListiniFornitori;
window.caricaListiniFornitori = caricaListiniFornitori;
