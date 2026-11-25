// ========================================
// DATI AZIENDALI (pannello solo admin)
// ----------------------------------------
// Una sola riga nella tabella impostazioni_azienda (id = 1), letta da tutti gli utenti.
// I dati (e il logo) vanno nell'intestazione di ordini e report: cosi' per cambiarli
// non serve toccare il codice. Se la tabella non c'e' ancora si usano i dati di sempre.
// ========================================
const AZIENDA_PREDEFINITA = {
    ragione_sociale: 'Agrimacch srl',
    indirizzo: 'Via Castellana, 86 - 30030 Martellago (VE)',
    telefono_whatsapp: '',
    telefono: '041 5401030',
    email: 'info@agrimacch.it',
    partita_iva: '',
    codice_fiscale: '',
    codice_univoco: '',
    sito_web: 'www.agrimacch.it',
    logo: ''
};
const AZIENDA_CAMPI = ['ragione_sociale', 'indirizzo', 'telefono_whatsapp', 'telefono', 'email',
    'partita_iva', 'codice_fiscale', 'codice_univoco', 'sito_web'];
const AZIENDA_LOGO_MAX = 700;
// Diritto di uscita (v8.3.0): importo IVA compresa per zona di comuni. Modificabile dall'admin
// in questo pannello (colonna impostazioni_azienda.uscita_zone, script supabase/azienda-uscita.sql).
const AZIENDA_USCITA_PREDEFINITA = [
    { importo: 45, comuni: ['FAVARO VENETO', 'MARTELLAGO', 'MIRANO', 'MOGLIANO VENETO', 'NOALE', 'PREGANZIOL',
        'QUINTO DI TREVISO', 'SALZANO', 'SCORZ\u00C8', 'SPINEA', 'TREBASELEGHE', 'ZERO BRANCO', 'MARGHERA', 'MESTRE'] },
    { importo: 65, comuni: ['BORGORICCO', 'CAMPOSAMPIERO', 'CASALE SUL SILE', 'CASIER', 'DOLO', "FIESSO D'ARTICO",
        'ISTRANA', 'LOREGGIA', 'MARCON', 'MASSANZAGO', 'MIRA', 'MORGANO', 'PAESE', 'PIANIGA', 'PIOMBINO DESE',
        "QUARTO D'ALTINO", 'RONCADE', 'SANTA MARIA DI SALA', 'SILEA', 'TREVISO', 'VEDELAGO', 'VIGONZA', 'VILLANOVA',
        'VILLORBA', 'CAMPALTO', 'MALCONTENTA', 'TESSERA'] }
];
let aziendaUscitaBozza = null;  // zone mentre l'admin le modifica nel pannello   // lato massimo del logo salvato (px): basta per i PDF e resta leggero

let aziendaDati = Object.assign({}, AZIENDA_PREDEFINITA);
let aziendaCaricata = false;
let aziendaUscitaColonna = false;  // colonna uscita_zone presente su Supabase?
let aziendaLogoNuovo = null;    // logo scelto nel pannello e non ancora salvato ('' = togli)

function aziendaEsc(v) {
    return String(v === null || v === undefined ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function aziendaCarica() {
    try {
        const { data, error } = await supabaseClient.from('impostazioni_azienda').select('*').eq('id', 1).maybeSingle();
        if (error) throw error;
        if (data) {
            const d = Object.assign({}, AZIENDA_PREDEFINITA);
            AZIENDA_CAMPI.concat(['logo']).forEach(c => { if (data[c] !== null && data[c] !== undefined) d[c] = data[c]; });
            if (Array.isArray(data.uscita_zone)) d.uscita_zone = data.uscita_zone;
            aziendaUscitaColonna = Object.prototype.hasOwnProperty.call(data, 'uscita_zone');
            aziendaDati = d;
        }
        aziendaCaricata = true;
    } catch (err) {
        // Tabella non ancora creata o rete: restano i dati predefiniti
        console.log('Dati aziendali non letti (uso quelli predefiniti):', err && err.message ? err.message : err);
    }
    return aziendaDati;
}

// ---------- Uso nei documenti ----------
function aziendaLogo() {
    return aziendaDati.logo || 'logo.png';
}

// Righe dell'intestazione dei documenti (HTML, gia' "pulito")
function aziendaIntestazioneHtml() {
    const d = aziendaDati;
    const unisci = arr => arr.filter(Boolean).join(' &middot; ');
    const righe = [
        unisci([d.ragione_sociale ? '<strong>' + aziendaEsc(String(d.ragione_sociale).toUpperCase()) + '</strong>' : '', aziendaEsc(d.indirizzo)]),
        unisci([d.telefono ? 'Tel. ' + aziendaEsc(d.telefono) : '', d.telefono_whatsapp ? 'WhatsApp ' + aziendaEsc(d.telefono_whatsapp) : '',
            aziendaEsc(d.email), aziendaEsc(d.sito_web)]),
        unisci([d.partita_iva ? 'P.IVA ' + aziendaEsc(d.partita_iva) : '', d.codice_fiscale ? 'C.F. ' + aziendaEsc(d.codice_fiscale) : '',
            d.codice_univoco ? 'Cod. univoco ' + aziendaEsc(d.codice_univoco) : ''])
    ].filter(Boolean);
    return righe.join('<br>');
}

// ---------- Diritto di uscita per comune ----------
function aziendaZoneUscita() {
    const z = Array.isArray(aziendaDati.uscita_zone) && aziendaDati.uscita_zone.length ? aziendaDati.uscita_zone : AZIENDA_USCITA_PREDEFINITA;
    return z.map(x => ({ importo: Number(x.importo) || 0, comuni: (x.comuni || []).map(c => String(c).trim()).filter(Boolean) }));
}

// "Scorz\u00E8" -> "SCORZE", "Marghera-VE" -> "MARGHERA", "Fiesso d'Artico" -> "FIESSO D ARTICO"
function aziendaNormComune(t) {
    return String(t || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[-\s]\(?VE\)?\s*$/, ' ').replace(/[^A-Z0-9]+/g, ' ').trim();
}

// Cerca nel testo (paese o indirizzo del cliente) un comune delle zone. Il paese di solito e' in fondo
// ("VIA TREVISO 5, MIRANO"): vince il comune trovato piu' a destra; a pari fine il nome piu' lungo
// ("QUINTO DI TREVISO" batte "TREVISO", "MIRANO" non diventa "MIRA"). Restituisce { importo, comune } oppure null.
function aziendaUscitaPer(testo) {
    const t = ' ' + aziendaNormComune(testo) + ' ';
    if (!t.trim()) return null;
    let migliore = null;
    aziendaZoneUscita().forEach(z => z.comuni.forEach(c => {
        const n = aziendaNormComune(c);
        if (!n) return;
        const pos = t.lastIndexOf(' ' + n + ' ');
        if (pos === -1) return;
        const fine = pos + n.length;
        if (!migliore || fine > migliore.fine || (fine === migliore.fine && n.length > migliore.n.length)) {
            migliore = { n: n, fine: fine, importo: z.importo, comune: c };
        }
    }));
    return migliore ? { importo: migliore.importo, comune: migliore.comune } : null;
}

// Pannello: zone modificabili
function aziendaUscitaRender() {
    const box = document.getElementById('az-uscita');
    if (!box) return;
    box.innerHTML = aziendaUscitaBozza.map((z, i) =>
        '<div class="az-zona">' +
            '<div class="az-zona-testa">' +
                '<label for="az-zona-imp-' + i + '">Zona ' + (i + 1) + ' &middot; uscita &euro; <small>(IVA compresa)</small></label>' +
                '<input type="text" id="az-zona-imp-' + i + '" inputmode="decimal" value="' + aziendaEsc(String(z.importo).replace('.', ',')) + '" oninput="aziendaUscitaCampo(' + i + ', \'importo\', this.value)">' +
                '<button type="button" class="btn-back mac-btn-piccolo" onclick="aziendaUscitaTogli(' + i + ')">&#10006; Togli zona</button>' +
            '</div>' +
            '<label for="az-zona-com-' + i + '">Comuni <small>(separati da virgola)</small></label>' +
            '<textarea id="az-zona-com-' + i + '" rows="3" oninput="aziendaUscitaCampo(' + i + ', \'comuni\', this.value)">' + aziendaEsc(z.comuni.join(', ')) + '</textarea>' +
        '</div>').join('') +
        '<button type="button" class="btn-back mac-btn-piccolo" onclick="aziendaUscitaAggiungi()">&#10133; Aggiungi zona</button>' +
        (aziendaUscitaColonna ? '' : '<div class="az-avviso">&#9888;&#65039; Per salvare le zone esegui una volta su Supabase lo script <strong>supabase/azienda-uscita.sql</strong>. Intanto il rapportino usa queste zone predefinite.</div>');
}

function aziendaUscitaCampo(i, campo, valore) {
    if (!aziendaUscitaBozza[i]) return;
    if (campo === 'importo') aziendaUscitaBozza[i].importo = Number(String(valore).replace(',', '.')) || 0;
    else aziendaUscitaBozza[i].comuni = String(valore).split(',').map(x => x.trim()).filter(Boolean);
}

function aziendaUscitaAggiungi() {
    aziendaUscitaBozza.push({ importo: 0, comuni: [] });
    aziendaUscitaRender();
}

function aziendaUscitaTogli(i) {
    aziendaUscitaBozza.splice(i, 1);
    aziendaUscitaRender();
}

// ---------- Pannello (solo admin) ----------
async function openDatiAzienda() {
    aziendaLogoNuovo = null;
    await aziendaCarica();
    AZIENDA_CAMPI.forEach(c => {
        const el = document.getElementById('az-' + c);
        if (el) el.value = aziendaDati[c] || '';
    });
    document.getElementById('az-logo-file').value = '';
    aziendaUscitaBozza = aziendaZoneUscita().map(z => ({ importo: z.importo, comuni: z.comuni.slice() }));
    aziendaUscitaRender();
    aziendaMostraLogo();
    aziendaAnteprima();
    const avviso = document.getElementById('az-avviso');
    if (avviso) avviso.classList.toggle('hidden', aziendaCaricata);
}

function aziendaLogoCorrente() {
    return aziendaLogoNuovo !== null ? aziendaLogoNuovo : aziendaDati.logo;
}

function aziendaMostraLogo() {
    const logo = aziendaLogoCorrente();
    const img = document.getElementById('az-logo-img');
    img.src = logo || 'logo.png';
    document.getElementById('az-logo-nota').innerHTML = logo ? 'Logo caricato' : 'Nessun logo caricato: si usa il logo dell&#39;app';
    document.getElementById('az-logo-togli').classList.toggle('hidden', !logo);
}

// Anteprima dell'intestazione come uscira' su ordini e report
function aziendaAnteprima() {
    const prova = Object.assign({}, aziendaDati);
    AZIENDA_CAMPI.forEach(c => { const el = document.getElementById('az-' + c); if (el) prova[c] = el.value.trim(); });
    prova.logo = aziendaLogoCorrente();
    const salvati = aziendaDati;
    aziendaDati = prova;
    const html = '<div class="az-anteprima-foglio"><img src="' + aziendaLogo() + '" alt="">' +
        '<div class="az-anteprima-testo">' + (aziendaIntestazioneHtml() || '<em>nessun dato</em>') + '</div></div>';
    aziendaDati = salvati;
    document.getElementById('az-anteprima').innerHTML = html;
}

// Il logo scelto viene rimpicciolito (max 700 px) e salvato come PNG
function aziendaLeggiLogo(file) {
    return new Promise((resolve, reject) => {
        if (!file) { resolve(null); return; }
        if (!/^image\//.test(file.type)) { reject(new Error('Scegli un&#39;immagine (PNG consigliato)')); return; }
        const lettore = new FileReader();
        lettore.onerror = () => reject(new Error('Immagine non leggibile'));
        lettore.onload = () => {
            const img = new Image();
            img.onerror = () => reject(new Error('Immagine non leggibile'));
            img.onload = () => {
                const scala = Math.min(1, AZIENDA_LOGO_MAX / Math.max(img.width, img.height));
                const c = document.createElement('canvas');
                c.width = Math.max(1, Math.round(img.width * scala));
                c.height = Math.max(1, Math.round(img.height * scala));
                c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                resolve(c.toDataURL('image/png'));
            };
            img.src = lettore.result;
        };
        lettore.readAsDataURL(file);
    });
}

async function aziendaSalva() {
    if (currentUserRole !== 'admin') return;
    const dati = {};
    AZIENDA_CAMPI.forEach(c => {
        const v = (document.getElementById('az-' + c).value || '').trim();
        dati[c] = v || null;
    });
    if (dati.email) dati.email = dati.email.toLowerCase();
    if (!dati.ragione_sociale) {
        await showCustomAlert('Scrivi almeno la ragione sociale.', 'Dati aziendali', '&#9888;&#65039;');
        return;
    }
    if (aziendaLogoNuovo !== null) dati.logo = aziendaLogoNuovo || null;
    if (aziendaUscitaColonna && aziendaUscitaBozza) {
        const zone = aziendaUscitaBozza
            .map(z => ({ importo: Math.round((Number(z.importo) || 0) * 100) / 100, comuni: z.comuni.map(c => c.toUpperCase()) }))
            .filter(z => z.comuni.length);
        if (zone.some(z => !(z.importo > 0))) {
            await showCustomAlert('Ogni zona deve avere un importo di uscita maggiore di zero.', 'Diritto di uscita', '&#9888;&#65039;');
            return;
        }
        dati.uscita_zone = zone;
    }
    dati.id = 1;
    dati.updated_at = new Date().toISOString();
    dati.updated_by = (currentUser && currentUser.email) || null;
    const btn = document.getElementById('az-salva');
    btn.disabled = true;
    try {
        const { error } = await supabaseClient.from('impostazioni_azienda').upsert(dati, { onConflict: 'id' });
        if (error) throw error;
        aziendaLogoNuovo = null;
        await aziendaCarica();
        aziendaUscitaBozza = aziendaZoneUscita().map(z => ({ importo: z.importo, comuni: z.comuni.slice() }));
        aziendaUscitaRender();
        aziendaMostraLogo();
        aziendaAnteprima();
        document.getElementById('az-avviso').classList.add('hidden');
        await showCustomAlert('Dati aziendali salvati. Da ora compaiono su ordini e report di tutti gli utenti.', 'Dati aziendali', '&#9989;');
    } catch (err) {
        console.error('Errore salvataggio dati aziendali:', err);
        const msg = err && err.message ? err.message : String(err);
        await showCustomAlert('Errore durante il salvataggio:<br>' + aziendaEsc(msg) +
            (/impostazioni_azienda|relation|schema cache/i.test(msg) ? '<br><br>Esegui prima su Supabase lo script <strong>supabase/dati-azienda-setup.sql</strong>.' : ''),
            'Errore', '&#10060;');
    } finally {
        btn.disabled = false;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('az-form');
    if (!form) return;
    form.addEventListener('submit', (e) => { e.preventDefault(); aziendaSalva(); });
    form.addEventListener('input', aziendaAnteprima);
    document.getElementById('az-logo-file').addEventListener('change', async (e) => {
        try {
            const logo = await aziendaLeggiLogo(e.target.files[0]);
            if (logo) { aziendaLogoNuovo = logo; aziendaMostraLogo(); aziendaAnteprima(); }
        } catch (err) {
            e.target.value = '';
            showCustomAlert(err.message, 'Logo', '&#9888;&#65039;');
        }
    });
    document.getElementById('az-logo-togli').addEventListener('click', () => {
        aziendaLogoNuovo = '';
        document.getElementById('az-logo-file').value = '';
        aziendaMostraLogo();
        aziendaAnteprima();
    });
});

window.openDatiAzienda = openDatiAzienda;
window.aziendaCarica = aziendaCarica;
window.aziendaUscitaPer = aziendaUscitaPer;
