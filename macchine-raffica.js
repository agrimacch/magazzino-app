// ========================================
// CARICO A RAFFICA (lettore di codici a barre)
// ----------------------------------------
// Si leggono tutte le scatole arrivate, anche di modelli diversi, senza scegliere niente.
// Ogni scatola ha il codice del modello (codice_barre del listino) e, se c'e', la matricola.
//
// Come funziona:
// - si tiene l'elenco delle LETTURE nell'ordine in cui arrivano (rafLetture)
// - a ogni lettura le scatole vengono RICOSTRUITE da capo (rafCostruisci):
//     ordine "prima il modello":   MODELLO, matricola, MODELLO, matricola...
//     ordine "prima la matricola": matricola, MODELLO, matricola, MODELLO...
//   con l'ordine Automatico si provano tutti e due e si tiene quello che lascia meno
//   scatole incomplete (a parita': prima il modello)
// - un codice che non e' di nessun modello e' una matricola; se lo stesso codice sconosciuto
//   compare su piu' letture e' quasi certamente il codice di un modello nuovo: resta una scatola
//   "senza modello" finche' non si sceglie il modello e si spunta "e' il codice del modello"
//   (il codice viene salvato sull'articolo del listino e le scatole si riabbinano da sole)
// - modello scelto a mano: resta legato alla lettura (rafScelte)
// - elimina scatola / togli matricola = tolgo quelle letture (come se non fossero mai state fatte)
// - funziona anche con la memoria del lettore: "Upload storage data" scrive tutti i codici di fila
// Le letture restano nel browser (localStorage) finche' non si conferma o si svuota.
// Alla conferma si usa lo stesso salvataggio del Carico macchine (macCaricaPezzi):
// prima ai clienti in attesa (se la casellina e' attiva), il resto disponibili; i set caricano i componenti.
//
// CARICO INIZIALE (censimento) - casellina nella finestra:
// - per caricare le macchine che sono gia' fisicamente in magazzino ma non ancora (o solo in parte) nel quaderno
// - nessuna assegnazione ai clienti
// - le matricole gia' nel quaderno (in casa) non vengono scartate: la scatola e' "confermata"
// - per ogni modello si usano prima le macchine IN CASA del quaderno (a quelle senza matricola viene
//   aggiunta la matricola letta); solo le scatole in piu' diventano macchine nuove
// - alla fine si vedono le macchine del quaderno (in casa) di quel modello che non sono state lette
//
// ARTICOLO NON NEL LISTINO: si crea dal carico
// - codice letto che e' l'EAN di un articolo di Listini Fornitori (lfArticoli, solo per chi li vede): la scatola mostra
//   "<FORNITORE> ... non e' nel tuo listino" e "Crea nel listino" apre Nuovo articolo gia' compilato
//   (marchio, modello, netto, prezzo, listino, codice a barre = EAN)
// - altri codici: "Crea nuovo articolo" apre Nuovo articolo con il codice a barre gia' messo
//   (se il codice e' del modello); netto e prezzi si possono lasciare vuoti e mettere dopo
// - dopo il salvataggio (rafDopoSalvataggioListino, chiamata da saveListinoEdit) le scatole si
//   riabbinano da sole
//
// FOGLIO CODICI DEL LETTORE (lettore NETUM U820): i codici di impostazione sono Code 128 normali
// (es. modalita' memoria = %#INVMD): vengono disegnati qui (rafCodice128Svg) e si possono stampare.
// Usa le funzioni di macchine-functions.js e listino-functions.js.
// ========================================
const RAF_CHIAVE = 'macRafficaSessione';
const RAF_MAX_ANNULLA = 300;

let rafLetture = [];      // [{ id, codice }] nell'ordine di lettura
let rafScelte = {};       // id lettura -> id articolo scelto a mano
let rafProssimoId = 1;
let rafOrdine = 'auto';   // 'auto' | 'modello' | 'matricola'
let rafScatole = [];      // ricostruite: [{ n, artId, matricola, letture: [id], idMatricola, probabileModello }]
let rafOrdineUsato = 'modello';
let rafStorico = [];      // copie per "Annulla ultima operazione"
let rafSceltaId = null;   // prima lettura della scatola per cui si sta scegliendo il modello
let rafInSalvataggio = false;
let rafCensimento = false; // carico iniziale delle macchine gia' in magazzino
let rafCreazione = null;   // { idLettura, codice, codiceModello } articolo in creazione dal carico

// ----- Sessione salvata nel browser -----
function rafStato() {
    return JSON.stringify({ letture: rafLetture, scelte: rafScelte, prossimo: rafProssimoId, ordine: rafOrdine, censimento: rafCensimento });
}

function rafRipristina(testo) {
    const s = JSON.parse(testo);
    rafLetture = Array.isArray(s.letture) ? s.letture : [];
    rafScelte = s.scelte || {};
    rafProssimoId = s.prossimo || (rafLetture.reduce((m, l) => Math.max(m, l.id), 0) + 1);
    rafOrdine = ['auto', 'modello', 'matricola'].indexOf(s.ordine) !== -1 ? s.ordine : 'auto';
    rafCensimento = !!s.censimento;
}

function rafCaricaSessione() {
    try {
        const t = localStorage.getItem(RAF_CHIAVE);
        if (t) { rafRipristina(t); return; }
    } catch (e) { /* sessione illeggibile: si riparte */ }
    rafLetture = [];
    rafScelte = {};
    rafProssimoId = 1;
    rafOrdine = 'auto';
    rafCensimento = false;
}

function rafSalvaSessione() {
    try {
        if (rafLetture.length === 0) localStorage.removeItem(RAF_CHIAVE);
        else localStorage.setItem(RAF_CHIAVE, rafStato());
    } catch (e) { /* niente spazio o modalita' privata: resta solo in memoria */ }
    rafAggiornaPulsante();
}

function rafFotografa() {
    rafStorico.push(rafStato());
    if (rafStorico.length > RAF_MAX_ANNULLA) rafStorico.shift();
}

// ----- Utilita' -----
function rafNorm(v) {
    return String(v || '').toUpperCase().replace(/\s+/g, '');
}

function rafAperta() {
    const m = document.getElementById('mac-raf-modal');
    return !!(m && !m.classList.contains('hidden'));
}

function rafModaleSopra() {
    return ['custom-alert-modal', 'listino-edit-modal', 'mac-scan-modal', 'mac-lett-modal', 'mac-raf-guida-modal'].some(id => {
        const m = document.getElementById(id);
        return m && !m.classList.contains('hidden');
    });
}

function rafMessaggio(html, tipo) {
    const box = document.getElementById('mac-raf-msg');
    if (!box) return;
    box.className = 'mac-lettore-msg' + (html ? ' mac-lettore-' + (tipo || 'info') : '');
    box.innerHTML = html || '';
}

function rafSuono(ok) {
    try {
        if (ok && typeof playSuccessSound === 'function') playSuccessSound();
        if (!ok && typeof playErrorSound === 'function') playErrorSound();
    } catch (e) { /* niente audio */ }
}

function rafFocus() {
    if (rafSceltaId !== null) return;
    const inp = document.getElementById('mac-raf-input');
    if (inp && rafAperta() && !rafModaleSopra()) inp.focus();
}

// Modello del listino per un codice letto (solo articoli attivi)
function rafModelloDi(codice) {
    const a = listinoArticoloDaCodiceBarre(codice);
    return a && a.attivo ? a : null;
}

// EAN riconosciuti da Listini Fornitori, solo per chi li vede
function rafUsaLf() {
    return typeof lfPuoVedere === 'function' && lfPuoVedere() && typeof lfArticoloDaEan === 'function';
}

// Articolo di un listino fornitore con questo EAN (solo se il listino e' caricato e visibile).
// Restituisce { id, fonte: 'lf' } oppure null
function rafStihlDi(codice) {
    if (!rafUsaLf()) return null;
    const a = lfArticoloDaEan(codice);
    return a ? { id: a.id, fonte: 'lf' } : null;
}

// Dati da mostrare sulla scatola: { fornitore, descrizione, codice, cliente (prezzo cliente IVA incl.) }
function rafFornInfo(s) {
    // stihlFonte diverso da 'lf' = scatola salvata con il vecchio Listino STIHL (tolto): non piu' riconosciuta
    if (!s || !s.stihlId || s.stihlFonte !== 'lf') return null;
    const a = typeof lfArticolo === 'function' ? lfArticolo(s.stihlId) : null;
    if (!a) return null;
    const p = lfPrezzoMigliore(a);
    return { fornitore: lfNomeFornitore(a), descrizione: a.descrizione, codice: a.codice, cliente: p ? lfPrezzoCliente(p) : null };
}

// "Crea nel listino" con i dati del fornitore: solo chi puo' collegare/creare da quel listino
function rafPuoCreareDaStihl(s) {
    if (s && s.stihlFonte !== 'lf') return false;
    return rafUsaLf() && typeof lfPuoCollegare === 'function' && lfPuoCollegare();
}

// Codice letto della scatola (codice del modello STIHL oppure la matricola/codice sconosciuto)
function rafCodiceScatola(s) {
    return s ? (s.codiceModello || s.matricola || null) : null;
}

// Pulsante in alto: mostra se c'e' un carico a raffica lasciato a meta'
function rafAggiornaPulsante() {
    const btn = document.getElementById('mac-btn-raffica');
    if (!btn) return;
    const n = rafLetture.length;
    btn.innerHTML = '&#9889; Carico a raffica' + (n ? ' <span class="mac-raf-badge">' + n + ' letture in sospeso</span>' : '');
}

// ========================================
// RICOSTRUZIONE DELLE SCATOLE DALLE LETTURE
// ========================================
function rafCostruisciCon(ordine) {
    // Conteggio dei codici sconosciuti: ripetuti = probabile codice di un modello nuovo
    const conta = {};
    rafLetture.forEach(l => {
        if (!rafModelloDi(l.codice)) {
            const k = rafNorm(l.codice);
            conta[k] = (conta[k] || 0) + 1;
        }
    });
    const scatole = [];
    rafLetture.forEach(l => {
        const art = rafModelloDi(l.codice);
        const ultima = scatole.length ? scatole[scatole.length - 1] : null;
        if (art) {
            if (ordine === 'matricola' && ultima && !ultima.artId && ultima.matricola && !ultima.probabileModello && !macIsSet(art.id)) {
                ultima.artId = art.id;
                ultima.letture.push(l.id);
            } else {
                scatole.push({ artId: art.id, matricola: null, letture: [l.id], idMatricola: null, probabileModello: false });
            }
            return;
        }
        // EAN di un articolo STIHL che non e' ancora nel listino: e' il codice del modello
        const stihl = rafStihlDi(l.codice);
        if (stihl) {
            if (ordine === 'matricola' && ultima && !ultima.artId && !ultima.stihlId && ultima.matricola && !ultima.probabileModello) {
                ultima.stihlId = stihl.id;
                ultima.stihlFonte = stihl.fonte;
                ultima.codiceModello = listinoPulisciCodiceBarre(l.codice);
                ultima.letture.push(l.id);
            } else {
                scatole.push({ artId: null, stihlId: stihl.id, stihlFonte: stihl.fonte, codiceModello: listinoPulisciCodiceBarre(l.codice), matricola: null,
                    letture: [l.id], idMatricola: null, probabileModello: false });
            }
            return;
        }
        const matricola = listinoPulisciTesto(l.codice);
        const ripetuto = conta[rafNorm(l.codice)] > 1;
        if (!ripetuto && ordine === 'modello' && ultima && (ultima.artId || ultima.stihlId) && !ultima.matricola && !(ultima.artId && macIsSet(ultima.artId))) {
            ultima.matricola = matricola;
            ultima.idMatricola = l.id;
            ultima.letture.push(l.id);
            return;
        }
        scatole.push({ artId: null, matricola: matricola, letture: [l.id], idMatricola: l.id, probabileModello: ripetuto });
    });
    // Modelli scelti a mano (legati alla prima lettura della scatola)
    scatole.forEach(s => {
        const scelto = rafScelte[s.letture[0]];
        if (scelto && macArticolo(scelto)) s.artId = scelto;
    });
    return scatole;
}

function rafPunteggio(scatole) {
    // Scatole incomplete: senza modello pesano di piu' di quelle senza matricola
    return scatole.reduce((t, s) => t + (!s.artId ? 2 : 0) + (s.artId && !s.matricola && !macIsSet(s.artId) ? 1 : 0), 0);
}

function rafCostruisci() {
    let scatole;
    if (rafOrdine === 'auto') {
        const a = rafCostruisciCon('modello');
        const b = rafCostruisciCon('matricola');
        if (rafPunteggio(b) < rafPunteggio(a)) { scatole = b; rafOrdineUsato = 'matricola'; }
        else { scatole = a; rafOrdineUsato = 'modello'; }
    } else {
        scatole = rafCostruisciCon(rafOrdine);
        rafOrdineUsato = rafOrdine;
    }
    scatole.forEach((s, i) => { s.n = i + 1; });
    rafScatole = scatole;
}

function rafScatolaDiLettura(id) {
    return rafScatole.find(s => s.letture.indexOf(id) !== -1) || null;
}

// ========================================
// APERTURA / CHIUSURA
// ========================================
async function rafApri() {
    if (typeof macPuoGestire === 'function' && !macPuoGestire()) return;
    if (!macCaricato) {
        try {
            if (!listinoCaricato) await loadListino();
            await macCaricaDati();
        } catch (error) {
            await showCustomAlert('Inventario macchine non disponibile:<br>' + macEsc(error.message), 'Errore', '&#10060;');
            return;
        }
    }
    // Listini Fornitori (per riconoscere gli EAN degli articoli che non sono ancora nel listino)
    if (rafUsaLf() && !lfCaricato) {
        try { await lfCaricaDati(); } catch (e) { console.warn('Listini Fornitori non disponibili nel carico:', e.message); }
    }
    rafCaricaSessione();
    rafStorico = [];
    rafSceltaId = null;
    document.getElementById('mac-raf-scelta').classList.add('hidden');
    document.getElementById('mac-raf-input').value = '';
    document.getElementById('mac-raf-ordine').value = rafOrdine;
    document.getElementById('mac-raf-censimento').checked = rafCensimento;
    rafCostruisci();
    rafMessaggio(rafLetture.length
        ? '&#128190; Hai un carico a raffica lasciato a met&agrave; (' + rafScatole.length + ' scatole): puoi continuare a leggere.'
        : '', 'info');
    rafRender();
    document.getElementById('mac-raf-modal').classList.remove('hidden');
    setTimeout(rafFocus, 50);
}

function rafChiudi() {
    document.getElementById('mac-raf-modal').classList.add('hidden');
    if (typeof macPickerChiudi === 'function') macPickerChiudi('mac-raf-art-search');
    rafSceltaId = null;
    rafSalvaSessione();
}

// ========================================
// LETTURA DI UN CODICE
// ========================================
function rafLeggi(grezzo) {
    const codice = listinoPulisciCodiceBarre(grezzo);
    if (!codice) return;
    const tutti = listinoArticoloDaCodiceBarre(codice);
    if (tutti && !tutti.attivo) {
        rafSuono(false);
        rafMessaggio('&#10060; Il codice ' + macEsc(codice) + ' &egrave; di <strong>' + macEsc(macNome(tutti)) +
            '</strong>, che &egrave; tra gli articoli cancellati del listino. Ripristinalo dal Listino Agrimacch e rileggi la scatola.', 'err');
        return;
    }
    if (!tutti) {
        // Matricola: non deve essere gia' in magazzino ne' gia' letta come matricola di una scatola con modello
        const chiave = rafNorm(listinoPulisciTesto(grezzo));
        const giaInCasa = macPezzi.find(p => p.matricola && rafNorm(p.matricola) === chiave);
        // Nel carico iniziale una matricola gia' nel quaderno (in casa) e' una conferma, non un errore
        if (giaInCasa && !(rafCensimento && giaInCasa.stato === 'IN_CASA')) {
            const a = macArticolo(giaInCasa.articolo_id);
            rafSuono(false);
            rafMessaggio('&#10060; La matricola <strong>' + macEsc(listinoPulisciTesto(grezzo)) + '</strong> &egrave; gi&agrave; nel magazzino (' +
                macEsc(macNome(a)) + ', ' + macEsc(MAC_STATI[giaInCasa.stato] ? MAC_STATI[giaInCasa.stato].etichetta : giaInCasa.stato) +
                (giaInCasa.cliente ? ', ' + macEsc(giaInCasa.cliente) : '') + '). Non l\'ho aggiunta.', 'err');
            return;
        }
        const giaLetta = rafScatole.find(s => s.artId && s.matricola && rafNorm(s.matricola) === chiave);
        if (giaLetta) {
            rafSuono(false);
            rafMessaggio('&#9888;&#65039; La matricola <strong>' + macEsc(giaLetta.matricola) + '</strong> l\'hai gi&agrave; letta (scatola ' + giaLetta.n +
                '). Non l\'ho aggiunta due volte.', 'err');
            return;
        }
    }

    rafFotografa();
    const lettura = { id: rafProssimoId++, codice: codice };
    rafLetture.push(lettura);
    rafCostruisci();
    rafSalvaSessione();

    const s = rafScatolaDiLettura(lettura.id);
    if (s && s.artId) {
        const a = macArticolo(s.artId);
        const ultimaDellaScatola = s.letture[s.letture.length - 1] === lettura.id;
        rafMessaggio('&#128230; Scatola ' + s.n + ': <strong>' + macEsc(macNome(a)) + '</strong>' +
            (s.matricola ? ' &middot; matricola ' + macEsc(s.matricola) :
                (macIsSet(a.id) ? ' (set: le matricole dei componenti si inseriscono dopo, nel quaderno)' :
                    (ultimaDellaScatola && rafOrdineUsato === 'modello' ? '. Se c\'&egrave;, leggi ora la matricola.' : ''))), 'ok');
    } else if (s && s.stihlId) {
        const st = rafFornInfo(s);
        rafMessaggio('&#127381; Scatola ' + s.n + ': <strong>' + macEsc(st ? st.fornitore + ' ' + (st.descrizione || '') : '') + '</strong> non &egrave; nel tuo listino. ' +
            (rafPuoCreareDaStihl(s) ? 'Tocca <strong>Crea nel listino</strong> sulla scatola (dati gi&agrave; compilati), anche alla fine.' :
                'Tocca <strong>Crea nuovo</strong> sulla scatola, anche alla fine.'), 'info');
    } else if (s && s.probabileModello) {
        const quante = rafScatole.filter(x => x.probabileModello && rafNorm(x.matricola) === rafNorm(s.matricola)).length;
        rafMessaggio('&#10067; Scatola ' + s.n + ': il codice <strong>' + macEsc(s.matricola) + '</strong> si ripete (' + quante +
            ' volte): &egrave; probabilmente il <strong>codice di un modello nuovo</strong>. Tocca &quot;Scegli modello&quot; su una di queste scatole ' +
            'e spunta &quot;&egrave; il codice a barre del modello&quot;: le sistemo tutte insieme.', 'info');
    } else if (s) {
        rafMessaggio('&#10067; Scatola ' + s.n + ': il codice <strong>' + macEsc(s.matricola) + '</strong> non &egrave; di nessun modello. ' +
            'Lo tengo come matricola: leggi il codice del modello, oppure sistemalo alla fine dall\'elenco.', 'info');
    }
    rafSuono(true);
    rafRender();
}

// ========================================
// CARICO INIZIALE: cosa succede per un modello
// ----------------------------------------
// Ritorna { confermate: [scatole], aggiungiMatricola: [{ scatola, pezzo }], abbinate: [{ scatola, pezzo }],
//           nuove: [scatole], nonLette: [pezzi], conflitti: [{ scatola, pezzo }] }
// ========================================
function rafPianoCensimento(g) {
    const piano = { confermate: [], aggiungiMatricola: [], abbinate: [], nuove: [], nonLette: [], conflitti: [] };
    const a = g.art;
    if (macIsSet(a.id)) { piano.nuove = g.scatole.slice(); return piano; }
    const inCasa = macPezzi.filter(p => p.articolo_id === a.id && p.stato === 'IN_CASA').sort((x, y) => x.id - y.id);
    const usati = new Set();
    const resto = [];
    g.scatole.forEach(s => {
        if (s.matricola) {
            const chiave = rafNorm(s.matricola);
            const p = macPezzi.find(x => x.matricola && rafNorm(x.matricola) === chiave);
            if (p) {
                if (p.articolo_id === a.id && p.stato === 'IN_CASA') { usati.add(p.id); piano.confermate.push(s); }
                else piano.conflitti.push({ scatola: s, pezzo: p });
                return;
            }
        }
        resto.push(s);
    });
    const liberiSenza = inCasa.filter(p => !usati.has(p.id) && !p.matricola);
    const liberiCon = inCasa.filter(p => !usati.has(p.id) && p.matricola);
    resto.forEach(s => {
        if (s.matricola) {
            if (liberiSenza.length) piano.aggiungiMatricola.push({ scatola: s, pezzo: liberiSenza.shift() });
            else piano.nuove.push(s);
        } else if (liberiSenza.length) {
            piano.abbinate.push({ scatola: s, pezzo: liberiSenza.shift() });
        } else if (liberiCon.length) {
            piano.abbinate.push({ scatola: s, pezzo: liberiCon.shift() });
        } else {
            piano.nuove.push(s);
        }
    });
    piano.nonLette = liberiSenza.concat(liberiCon);
    return piano;
}

function rafCosaCensimentoHtml(g) {
    const pi = rafPianoCensimento(g);
    const righe = [];
    const gia = pi.confermate.length + pi.abbinate.length;
    if (gia) righe.push('&#10004; ' + gia + ' gi&agrave; nel quaderno');
    if (pi.aggiungiMatricola.length) righe.push('&#9998;&#65039; ' + pi.aggiungiMatricola.length + ' matricol' + (pi.aggiungiMatricola.length === 1 ? 'a aggiunta' : 'e aggiunte') + ' nel quaderno');
    if (pi.nuove.length) righe.push('&#10133; ' + pi.nuove.length + ' nuov' + (pi.nuove.length === 1 ? 'a' : 'e') + (macIsSet(g.art.id) ? ' (set: carica ' + macEsc(macDescrizioneComponenti(g.art.id)) + ')' : ''));
    if (pi.nonLette.length) righe.push('<span class="mac-raf-allarme">&#9888;&#65039; ' + pi.nonLette.length + ' nel quaderno ma non lett' + (pi.nonLette.length === 1 ? 'a' : 'e') + '</span>');
    if (pi.conflitti.length) righe.push('<span class="mac-raf-allarme">&#10060; ' + pi.conflitti.length + ' matricol' + (pi.conflitti.length === 1 ? 'a' : 'e') + ' di un altro modello o non in casa</span>');
    return righe.join('<br>');
}

// ========================================
// DISEGNO DELLA FINESTRA
// ========================================
function rafGruppi() {
    const gruppi = [];
    const perArt = {};
    rafScatole.forEach(s => {
        if (!s.artId) return;
        if (!perArt[s.artId]) {
            perArt[s.artId] = { art: macArticolo(s.artId), scatole: [] };
            gruppi.push(perArt[s.artId]);
        }
        perArt[s.artId].scatole.push(s);
    });
    return gruppi.filter(g => g.art);
}

function rafRender() {
    const riep = document.getElementById('mac-raf-riepilogo');
    const lista = document.getElementById('mac-raf-scatole');
    if (!riep || !lista) return;
    const assegna = !rafCensimento && document.getElementById('mac-raf-assegna').checked;
    document.getElementById('mac-raf-assegna-box').classList.toggle('hidden', rafCensimento);
    document.getElementById('mac-raf-censimento-info').classList.toggle('hidden', !rafCensimento);
    document.getElementById('mac-raf-conferma').innerHTML = rafInSalvataggio ? '&#8987; Carico in corso...' :
        (rafCensimento ? 'Conferma carico iniziale' : 'Conferma carico');
    const senzaModello = rafScatole.filter(s => !s.artId).length;
    const gruppi = rafGruppi();
    document.getElementById('mac-raf-conferma').disabled = rafScatole.length === 0 || rafInSalvataggio;
    document.getElementById('mac-raf-annulla-ultima').disabled = rafStorico.length === 0;
    document.getElementById('mac-raf-svuota').disabled = rafLetture.length === 0;
    const info = document.getElementById('mac-raf-ordine-info');
    if (info) {
        info.innerHTML = rafOrdine === 'auto' && rafScatole.length
            ? 'riconosciuto: <strong>' + (rafOrdineUsato === 'modello' ? 'prima il modello' : 'prima la matricola') + '</strong>' : '';
    }

    if (rafScatole.length === 0) {
        riep.innerHTML = '<p class="mac-raf-vuoto">&#127991;&#65039; Nessuna scatola letta. Inizia a leggere i codici.</p>';
        lista.innerHTML = '';
        return;
    }

    // Riepilogo per modello
    let html = '<div class="mac-raf-contatori">' +
        '<span><strong>' + rafScatole.length + '</strong> scatol' + (rafScatole.length === 1 ? 'a' : 'e') + '</span>' +
        '<span><strong>' + gruppi.length + '</strong> modell' + (gruppi.length === 1 ? 'o' : 'i') + '</span>' +
        (senzaModello ? '<span class="mac-raf-allarme"><strong>' + senzaModello + '</strong> da sistemare</span>' : '') +
        '</div>';
    if (gruppi.length) {
        html += '<div class="table-container"><table class="listino-table mac-raf-tabella"><thead><tr>' +
            '<th>Modello</th><th>Pezzi</th><th>Matricole</th><th>Cosa succede</th></tr></thead><tbody>';
        gruppi.forEach(g => {
            const n = g.scatole.length;
            const isSet = macIsSet(g.art.id);
            let cosa;
            if (rafCensimento) {
                cosa = rafCosaCensimentoHtml(g);
            } else if (isSet) {
                cosa = '&#129513; set: carica ' + macEsc(macDescrizioneComponenti(g.art.id));
            } else {
                const attesa = assegna ? macPianoCarico(g.art.id, n).clienti : [];
                const liberi = n - attesa.length;
                cosa = (attesa.length ? '&#128100; ' + attesa.map(p => macEsc(p.cliente || '-')).join(', ') : '') +
                    (attesa.length && liberi ? '<br>' : '') +
                    (liberi ? '&#9989; ' + liberi + ' disponibil' + (liberi === 1 ? 'e' : 'i') : '');
            }
            const conMatr = g.scatole.filter(s => s.matricola).length;
            html += '<tr><td>' + macNomeHtml(g.art) + '</td><td class="mac-raf-num">' + n + '</td>' +
                '<td class="mac-raf-num">' + (isSet ? '-' : conMatr + ' / ' + n) + '</td><td>' + cosa + '</td></tr>';
        });
        html += '</tbody></table></div>';
    }
    riep.innerHTML = html;

    // Elenco scatole (le ultime lette in alto)
    lista.innerHTML = '<div class="mac-raf-titolo-lista">Scatole lette <small>(le ultime in alto)</small></div>' +
        rafScatole.slice().reverse().map(s => {
            const a = s.artId ? macArticolo(s.artId) : null;
            const id = s.letture[0];
            let nome;
            const st = !a && s.stihlId ? rafFornInfo(s) : null;
            if (a) nome = macNomeHtml(a);
            else if (st) nome = '<span class="mac-raf-allarme">&#127381; ' + macEsc(st.fornitore) + ' <strong>' + macEsc(st.descrizione || st.codice) + '</strong>: non &egrave; nel tuo listino</span>' +
                '<br><small>' + macEsc(st.codice) + (st.cliente !== null && st.cliente !== undefined ? ' &middot; prezzo cliente &#8364;&nbsp;' +
                    Number(st.cliente).toLocaleString('it-IT', { maximumFractionDigits: 0 }) : '') + '</small>';
            else if (s.probabileModello) nome = '<span class="mac-raf-allarme">&#10067; Codice ripetuto: probabile codice di un modello nuovo</span>';
            else nome = '<span class="mac-raf-allarme">&#10067; Modello da scegliere</span>';
            let sotto = '';
            if (s.matricola) {
                sotto = '<br><small>' + (a ? 'Matricola' : 'Codice letto') + ': <strong>' + macEsc(s.matricola) + '</strong>';
                if (rafCensimento) {
                    const p = macPezzi.find(x => x.matricola && rafNorm(x.matricola) === rafNorm(s.matricola));
                    if (p && a && p.articolo_id === a.id) sotto += ' <span class="mac-raf-ok">&#10004; gi&agrave; nel quaderno</span>';
                    else if (p) sotto += ' <span class="mac-raf-allarme">&#10060; nel quaderno &egrave; ' + macEsc(macNome(macArticolo(p.articolo_id))) + '</span>';
                }
                sotto += '</small>';
            }
            else if (a && !macIsSet(a.id)) sotto = '<br><small class="mac-raf-grigio">senza matricola</small>';
            return '<div class="mac-raf-riga' + (a ? '' : ' mac-raf-riga-allarme') + '">' +
                '<span class="mac-raf-n">' + s.n + '</span>' +
                '<span class="mac-raf-nome">' + nome + sotto + '</span>' +
                '<span class="mac-raf-azioni">' +
                (st && rafPuoCreareDaStihl(s) ? '<button type="button" class="btn-primary mac-btn-piccolo" data-raf-crea="' + id + '">&#10133; Crea nel listino</button>' : '') +
                (!a && !(st && rafPuoCreareDaStihl(s)) ? '<button type="button" class="btn-back mac-btn-piccolo" data-raf-crea="' + id + '">&#10133; Crea nuovo</button>' : '') +
                '<button type="button" class="btn-back mac-btn-piccolo" data-raf-modello="' + id + '">' + (a ? 'Cambia' : 'Scegli modello') + '</button>' +
                (s.matricola && a ? '<button type="button" class="mac-azione" data-raf-togli-matr="' + id + '" title="Togli la matricola">&#10006;</button>' : '') +
                '<button type="button" class="mac-azione" data-raf-elimina="' + id + '" title="Elimina la scatola">&#128465;</button>' +
                '</span></div>';
        }).join('');
}

// ========================================
// SCELTA DEL MODELLO PER UNA SCATOLA
// ========================================
function rafApriScelta(idLettura) {
    const s = rafScatolaDiLettura(idLettura);
    if (!s) return;
    rafSceltaId = idLettura;
    const codiceLetto = rafCodiceScatola(s);
    document.getElementById('mac-raf-scelta-titolo').innerHTML = '<strong>Scatola ' + s.n + '</strong>: scegli il modello dal listino' +
        (codiceLetto ? ' (codice letto: <strong>' + macEsc(codiceLetto) + '</strong>)' : '');
    const boxCodice = document.getElementById('mac-raf-scelta-codice-box');
    const check = document.getElementById('mac-raf-scelta-codice');
    check.checked = !!(s.probabileModello || s.codiceModello);
    if (codiceLetto && !s.artId) {
        document.getElementById('mac-raf-scelta-codice-testo').innerHTML = 'Il codice <strong>' + macEsc(codiceLetto) +
            '</strong> &egrave; il <strong>codice a barre del modello</strong>, non la matricola: salvalo sul modello (le prossime scatole le riconosce da solo)';
        boxCodice.classList.remove('hidden');
    } else {
        boxCodice.classList.add('hidden');
    }
    const cerca = document.getElementById('mac-raf-art-search');
    cerca.value = '';
    document.getElementById('mac-raf-scelta').classList.remove('hidden');
    setTimeout(() => cerca.focus(), 50);
}

function rafChiudiScelta() {
    rafSceltaId = null;
    document.getElementById('mac-raf-scelta').classList.add('hidden');
    macPickerChiudi('mac-raf-art-search');
    rafFocus();
}

async function rafSceltoModello(a) {
    const s = rafScatolaDiLettura(rafSceltaId);
    if (!s) { rafChiudiScelta(); return; }
    const codiceLetto = rafCodiceScatola(s);
    const eCodiceModello = document.getElementById('mac-raf-scelta-codice').checked && codiceLetto && !s.artId;

    if (eCodiceModello) {
        const codice = listinoPulisciCodiceBarre(codiceLetto);
        const proprietario = listinoArticoloDaCodiceBarre(codice);
        if (proprietario && proprietario.id !== a.id) {
            await showCustomAlert('Il codice ' + macEsc(codice) + ' &egrave; gi&agrave; di &quot;' + macEsc(macNome(proprietario)) + '&quot;.', 'Codice gi&agrave; usato', '&#9888;&#65039;');
            return;
        }
        if (!proprietario) {
            if (a.codice_barre && !window.confirm('"' + macNome(a) + '" ha gi\u00e0 il codice a barre ' + a.codice_barre +
                '.\n\nSostituirlo con ' + codice + '?')) {
                return;
            }
            if (!(await macAssociaCodice(a, codice))) return;
        }
        // Da adesso il codice e' riconosciuto come modello: ricostruendo, le scatole si riabbinano da sole
        rafFotografa();
        delete rafScelte[rafSceltaId];
        rafCostruisci();
        const quante = rafLetture.filter(l => listinoStessoCodiceBarre(l.codice, codice)).length;
        rafMessaggio('&#10004; Codice ' + macEsc(codice) + ' salvato su <strong>' + macEsc(macNome(a)) + '</strong>' +
            (quante > 1 ? ' (' + quante + ' scatole)' : '') + '. Le scatole sono state riabbinate; le prossime le riconosce da solo.', 'ok');
    } else {
        rafFotografa();
        rafScelte[rafSceltaId] = a.id;
        rafCostruisci();
        const n = rafScatolaDiLettura(rafSceltaId);
        rafMessaggio('&#10004; Scatola ' + (n ? n.n : '') + ': <strong>' + macEsc(macNome(a)) + '</strong>' +
            (n && n.matricola ? ' &middot; matricola ' + macEsc(n.matricola) : ''), 'ok');
    }
    rafSalvaSessione();
    rafChiudiScelta();
    rafRender();
}

// ========================================
// CREA L'ARTICOLO NEL LISTINO VENDITE DAL CARICO
// ========================================
function rafCreaArticolo(idLettura) {
    const s = rafScatolaDiLettura(idLettura);
    if (!s || typeof openListinoEdit !== 'function') return;
    const codice = rafCodiceScatola(s);
    // Dal pannello "Scegli modello" vale la casellina; dal pulsante sulla scatola: STIHL o codice ripetuto = codice del modello
    const pannello = rafSceltaId === idLettura && !document.getElementById('mac-raf-scelta').classList.contains('hidden');
    const codiceModello = !!codice && (s.codiceModello ? true :
        (pannello ? document.getElementById('mac-raf-scelta-codice').checked : !!s.probabileModello));
    if (pannello) rafChiudiScelta();
    document.getElementById('mac-raf-input').blur();
    rafCreazione = { idLettura: idLettura, codice: codice, codiceModello: codiceModello };
    if (s.stihlId && rafPuoCreareDaStihl(s) && typeof lfCreaInListino === 'function') {
        lfCreaInListino(s.stihlId);   // compila marchio, modello, netto, prezzi, codice articolo e codice a barre (EAN)
        const cb = document.getElementById('listino-edit-codice-barre');
        if (cb && !cb.value && codice && !listinoArticoloDaCodiceBarre(codice)) cb.value = codice;
    } else {
        openListinoEdit(null);
        document.getElementById('listino-edit-titolo').innerHTML = '&#10133; Nuovo articolo dal carico (scatola ' + s.n + ')';
        const cb = document.getElementById('listino-edit-codice-barre');
        if (cb && codiceModello && !listinoArticoloDaCodiceBarre(codice)) cb.value = codice;
        const att = document.getElementById('listino-edit-attrezzo');
        if (att) setTimeout(() => att.focus(), 50);
    }
}

// Chiamata da saveListinoEdit() dopo il salvataggio di un articolo del Listino Agrimacch
function rafDopoSalvataggioListino(articoloId, nuovo) {
    const c = rafCreazione;
    rafCreazione = null;
    if (!c || !nuovo || !articoloId) return;
    rafFotografa();
    // Se il codice letto non e' diventato il codice a barre del nuovo articolo, lego il modello alla scatola
    const riconosciuto = c.codice && listinoArticoloDaCodiceBarre(c.codice);
    if (!riconosciuto || riconosciuto.id !== articoloId) rafScelte[c.idLettura] = articoloId;
    rafCostruisci();
    rafSalvaSessione();
    const a = macArticolo(articoloId);
    const quante = rafScatole.filter(x => x.artId === articoloId).length;
    rafMessaggio('&#10004; Creato <strong>' + macEsc(macNome(a)) + '</strong> nel Listino Agrimacch' +
        (quante > 1 ? ': ' + quante + ' scatole sistemate' : '') + '. Netti e prezzi li puoi completare quando vuoi dal Listino Agrimacch.', 'ok');
    rafRender();
}

// ========================================
// AZIONI SULLE SCATOLE
// ========================================
function rafAnnullaUltima() {
    if (!rafStorico.length) return;
    rafRipristina(rafStorico.pop());
    document.getElementById('mac-raf-ordine').value = rafOrdine;
    rafCostruisci();
    rafMessaggio('&#8630; Ultima operazione annullata.', 'info');
    rafSalvaSessione();
    rafRender();
    rafFocus();
}

function rafSvuota() {
    if (!rafLetture.length) return;
    if (!window.confirm('Cancellare tutte le ' + rafScatole.length + ' scatole lette?\n\nNel magazzino non \u00e8 ancora stato caricato niente.')) return;
    rafFotografa();
    rafLetture = [];
    rafScelte = {};
    rafCostruisci();
    rafMessaggio('Elenco svuotato. Puoi ancora tornare indietro con &quot;Annulla ultima operazione&quot;.', 'info');
    rafSalvaSessione();
    rafRender();
    rafFocus();
}

function rafTogliLetture(ids, testo) {
    rafFotografa();
    rafLetture = rafLetture.filter(l => ids.indexOf(l.id) === -1);
    ids.forEach(id => { delete rafScelte[id]; });
    rafCostruisci();
    rafMessaggio(testo, 'info');
    rafSalvaSessione();
    rafRender();
    rafFocus();
}

function rafElimina(idLettura) {
    const s = rafScatolaDiLettura(idLettura);
    if (s) rafTogliLetture(s.letture.slice(), 'Scatola ' + s.n + ' eliminata.');
}

function rafTogliMatricola(idLettura) {
    const s = rafScatolaDiLettura(idLettura);
    if (!s || !s.idMatricola) return;
    // Se il modello era scelto a mano sulla lettura della matricola, lo sposto sulla lettura rimasta
    if (rafScelte[s.idMatricola]) {
        const resto = s.letture.find(id => id !== s.idMatricola);
        if (resto) rafScelte[resto] = rafScelte[s.idMatricola];
    }
    rafTogliLetture([s.idMatricola], 'Matricola tolta dalla scatola ' + s.n + '.');
}

function rafCambiaCensimento() {
    rafCensimento = document.getElementById('mac-raf-censimento').checked;
    rafSalvaSessione();
    rafRender();
    rafFocus();
}

function rafCambiaOrdine() {
    rafFotografa();
    rafOrdine = document.getElementById('mac-raf-ordine').value;
    rafCostruisci();
    rafSalvaSessione();
    rafRender();
    rafFocus();
}

// ========================================
// CONFERMA: CARICO NEL MAGAZZINO
// ========================================
async function rafConferma() {
    if (rafInSalvataggio || !rafScatole.length) return;
    const senzaModello = rafScatole.filter(s => !s.artId);
    if (senzaModello.length) {
        await showCustomAlert('Ci sono <strong>' + senzaModello.length + '</strong> scatole senza modello (in rosso nell\'elenco).<br>' +
            'Scegli il modello oppure eliminale, poi conferma.', 'Scatole da sistemare', '&#9888;&#65039;');
        return;
    }
    if (rafCensimento) { await rafConfermaCensimento(); return; }
    // Matricole gia' nel quaderno (lette con il carico iniziale attivo e poi tolto): non si caricano due volte
    const doppie = rafScatole.filter(s => s.matricola && macPezzi.some(p => p.matricola && rafNorm(p.matricola) === rafNorm(s.matricola)));
    if (doppie.length) {
        await showCustomAlert('Le matricole ' + doppie.map(s => '<strong>' + macEsc(s.matricola) + '</strong>').join(', ') +
            ' sono gi&agrave; nel quaderno.<br>Elimina quelle scatole oppure attiva &quot;Carico iniziale&quot;.', 'Matricole gi&agrave; presenti', '&#9888;&#65039;');
        return;
    }
    const gruppi = rafGruppi();
    const totale = gruppi.reduce((t, g) => t + g.scatole.length, 0);
    if (!window.confirm('Caricare in magazzino ' + totale + ' scatol' + (totale === 1 ? 'a' : 'e') + ' di ' + gruppi.length +
        ' modell' + (gruppi.length === 1 ? 'o' : 'i') + '?')) return;

    const assegna = document.getElementById('mac-raf-assegna').checked;
    const btn = document.getElementById('mac-raf-conferma');
    rafInSalvataggio = true;
    btn.disabled = true;
    btn.innerHTML = '&#8987; Carico in corso...';
    const riepilogo = [];
    macArriviInizia();
    try {
        for (const g of gruppi) {
            const a = g.art;
            const n = g.scatole.length;
            let clienti = 0;
            if (macIsSet(a.id)) {
                for (const r of macComponenti(a.id)) {
                    const comp = macArticolo(r.componente_id);
                    if (!comp) continue;
                    const res = await macCaricaPezzi({
                        art: comp, n: r.quantita * n, netto: comp.netto_1 != null ? comp.netto_1 : null, matricole: [],
                        assegna: assegna, setArt: a, dettaglio: 'CARICO A RAFFICA'
                    });
                    clienti += res.clienti.length;
                }
            } else {
                const res = await macCaricaPezzi({
                    art: a, n: n, netto: a.netto_1 != null ? a.netto_1 : null,
                    matricole: g.scatole.map(s => s.matricola || null),
                    assegna: assegna, dettaglio: 'CARICO A RAFFICA'
                });
                clienti = res.clienti.length;
            }
            // Modello salvato: tolgo subito le sue letture (se dopo c'e' un errore non viene caricato due volte)
            const ids = [];
            g.scatole.forEach(s => s.letture.forEach(id => ids.push(id)));
            rafLetture = rafLetture.filter(l => ids.indexOf(l.id) === -1);
            ids.forEach(id => { delete rafScelte[id]; });
            rafSalvaSessione();
            riepilogo.push('<strong>' + macEsc(macNome(a)) + '</strong>: ' + n + (macIsSet(a.id) ? ' set' : ' caricat' + (n === 1 ? 'o' : 'i')) +
                (clienti ? ' (' + clienti + ' ai clienti in attesa)' : ''));
        }
    } catch (error) {
        console.error('Errore carico a raffica:', error);
        rafInSalvataggio = false;
        rafStorico = [];
        await macRicarica();
        rafCostruisci();
        rafRender();
        await showCustomAlert('Errore durante il carico:<br>' + macEsc(error.message) +
            (riepilogo.length ? '<br><br>Gi&agrave; caricati (tolti dall\'elenco):<br>' + riepilogo.join('<br>') : '') +
            '<br><br>Le scatole rimaste sono ancora nell\'elenco: controlla e riprova.', 'Errore', '&#10060;');
        macArriviMostra();
        return;
    }
    rafInSalvataggio = false;
    rafLetture = [];
    rafScelte = {};
    rafOrdine = 'auto';
    rafStorico = [];
    rafCostruisci();
    rafSalvaSessione();
    rafChiudi();
    await macRicarica();
    await showCustomAlert(riepilogo.join('<br>') +
        '<br><br>&#128161; Se hai letto dalla memoria del lettore, ora svuotala leggendo <strong>Clear stored barcode</strong> (pagina 6 del manuale).',
        'Carico a raffica registrato', '&#10004;');
    macArriviMostra();
}

// Carico iniziale: completa il quaderno con le macchine gia' in magazzino
async function rafConfermaCensimento() {
    const gruppi = rafGruppi();
    const piani = gruppi.map(g => ({ g: g, piano: rafPianoCensimento(g) }));
    const conflitti = [];
    piani.forEach(x => x.piano.conflitti.forEach(c => conflitti.push(c)));
    if (conflitti.length) {
        await showCustomAlert('Queste matricole nel quaderno sono di un altro modello o non sono in casa:<br>' +
            conflitti.map(c => '<strong>' + macEsc(c.scatola.matricola) + '</strong> (letta come ' + macEsc(macNome(macArticolo(c.scatola.artId))) +
                ', nel quaderno: ' + macEsc(macNome(macArticolo(c.pezzo.articolo_id))) + ', ' +
                macEsc(MAC_STATI[c.pezzo.stato] ? MAC_STATI[c.pezzo.stato].etichetta : c.pezzo.stato) + ')').join('<br>') +
            '<br><br>Correggi il modello della scatola (Cambia) oppure eliminala, poi conferma.', 'Matricole da controllare', '&#9888;&#65039;');
        return;
    }
    const tot = { gia: 0, matr: 0, nuove: 0, nonLette: 0 };
    piani.forEach(x => {
        tot.gia += x.piano.confermate.length + x.piano.abbinate.length;
        tot.matr += x.piano.aggiungiMatricola.length;
        tot.nuove += x.piano.nuove.length;
        tot.nonLette += x.piano.nonLette.length;
    });
    if (!window.confirm('Carico iniziale di ' + rafScatole.length + ' scatole:\n\n' +
        '- gi\u00e0 nel quaderno: ' + tot.gia + '\n' +
        '- matricole da aggiungere nel quaderno: ' + tot.matr + '\n' +
        '- macchine nuove da caricare: ' + tot.nuove + '\n' +
        (tot.nonLette ? '- nel quaderno ma non lette: ' + tot.nonLette + ' (restano come sono)\n' : '') +
        '\nConfermi?')) return;

    const btn = document.getElementById('mac-raf-conferma');
    rafInSalvataggio = true;
    btn.disabled = true;
    btn.innerHTML = '&#8987; Carico in corso...';
    const riepilogo = [];
    const nonLette = [];
    const utente = macUtente();
    try {
        for (const x of piani) {
            const a = x.g.art;
            const pi = x.piano;
            const adesso = new Date().toISOString();
            // 1. Matricole aggiunte alle macchine del quaderno che non l'avevano
            const log = [];
            for (const m of pi.aggiungiMatricola) {
                const agg = { matricola: m.scatola.matricola, updated_at: adesso, updated_by: utente };
                const { error } = await supabaseClient.from('macchine_pezzi').update(agg).eq('id', m.pezzo.id);
                if (error) throw error;
                Object.assign(m.pezzo, agg);
                if (m.pezzo.ordine_id) macOrdiniDaAggiornare.add(m.pezzo.ordine_id);
                log.push({
                    pezzo_id: m.pezzo.id, articolo_id: a.id, tipo: 'MODIFICA', stato_prima: m.pezzo.stato, stato_dopo: m.pezzo.stato,
                    cliente: m.pezzo.cliente, matricola: m.scatola.matricola, netto: m.pezzo.netto_carico,
                    dettaglio: 'MATRICOLA ' + m.scatola.matricola + ' (CARICO INIZIALE)'
                });
            }
            await macRegistra(log);
            // 2. Scatole in piu': macchine nuove, disponibili (nessuna assegnazione ai clienti)
            if (pi.nuove.length) {
                if (macIsSet(a.id)) {
                    for (const r of macComponenti(a.id)) {
                        const comp = macArticolo(r.componente_id);
                        if (!comp) continue;
                        await macCaricaPezzi({
                            art: comp, n: r.quantita * pi.nuove.length, netto: comp.netto_1 != null ? comp.netto_1 : null, matricole: [],
                            assegna: false, setArt: a, dettaglio: 'CARICO INIZIALE'
                        });
                    }
                } else {
                    await macCaricaPezzi({
                        art: a, n: pi.nuove.length, netto: a.netto_1 != null ? a.netto_1 : null,
                        matricole: pi.nuove.map(s => s.matricola || null), assegna: false, dettaglio: 'CARICO INIZIALE'
                    });
                }
            }
            // Modello fatto: tolgo le sue letture
            const ids = [];
            x.g.scatole.forEach(s => s.letture.forEach(id => ids.push(id)));
            rafLetture = rafLetture.filter(l => ids.indexOf(l.id) === -1);
            ids.forEach(id => { delete rafScelte[id]; });
            rafSalvaSessione();
            const parti = [];
            const gia = pi.confermate.length + pi.abbinate.length;
            if (gia) parti.push(gia + ' gi&agrave; nel quaderno');
            if (pi.aggiungiMatricola.length) parti.push(pi.aggiungiMatricola.length + ' matricole aggiunte');
            if (pi.nuove.length) parti.push(pi.nuove.length + (macIsSet(a.id) ? ' set caricati' : ' caricat' + (pi.nuove.length === 1 ? 'a' : 'e')));
            riepilogo.push('<strong>' + macEsc(macNome(a)) + '</strong>: ' + parti.join(', '));
            if (pi.nonLette.length) nonLette.push('<strong>' + macEsc(macNome(a)) + '</strong>: ' + pi.nonLette.length +
                (pi.nonLette.some(p => p.matricola) ? ' (' + pi.nonLette.filter(p => p.matricola).map(p => macEsc(p.matricola)).join(', ') + ')' : ''));
        }
    } catch (error) {
        console.error('Errore carico iniziale:', error);
        rafInSalvataggio = false;
        rafStorico = [];
        await macRicarica();
        rafCostruisci();
        rafRender();
        await showCustomAlert('Errore durante il carico iniziale:<br>' + macEsc(error.message) +
            (riepilogo.length ? '<br><br>Gi&agrave; fatti (tolti dall\'elenco):<br>' + riepilogo.join('<br>') : '') +
            '<br><br>Le scatole rimaste sono ancora nell\'elenco: controlla e riprova.', 'Errore', '&#10060;');
        return;
    }
    rafInSalvataggio = false;
    rafLetture = [];
    rafScelte = {};
    rafStorico = [];
    rafCostruisci();
    rafSalvaSessione();
    rafChiudi();
    await macRicarica();
    await showCustomAlert(riepilogo.join('<br>') +
        (nonLette.length ? '<br><br>&#9888;&#65039; <strong>Nel quaderno (in casa) ma non lette:</strong><br>' + nonLette.join('<br>') +
            '<br>Controlla se ci sono davvero: se mancano, toglile dalla scheda Correzioni.' : '') +
        '<br><br>&#128161; Ora svuota la memoria del lettore (foglio Codici del lettore).',
        'Carico iniziale registrato', '&#10004;');
}

// ========================================
// TASTIERA: il lettore scrive il codice e preme Invio
// ----------------------------------------
// Con la finestra aperta, un tasto premuto fuori dai campi viene portato nel campo di lettura,
// cosi' si puo' leggere anche dopo aver toccato un pulsante.
// ========================================
function rafTastoGlobale(e) {
    if (!rafAperta() || rafModaleSopra() || rafSceltaId !== null) return;
    const inp = document.getElementById('mac-raf-input');
    const att = document.activeElement;
    if (att === inp) return;
    if (att && ['INPUT', 'SELECT', 'TEXTAREA'].indexOf(att.tagName) !== -1) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key && e.key.length === 1) {
        e.preventDefault();
        inp.focus();
        inp.value += e.key;
    } else if (e.key === 'Enter' && inp.value) {
        e.preventDefault();
        const v = inp.value;
        inp.value = '';
        inp.focus();
        rafLeggi(v);
    }
}

// ========================================
// FOGLIO CODICI DEL LETTORE (NETUM U820)
// ----------------------------------------
// Codici di impostazione presi dal manuale del lettore (sono Code 128 con un testo dentro).
// Disegnati in SVG: nitidi a qualsiasi dimensione, si leggono dallo schermo o stampati.
// ========================================
const RAF_C128 = ['212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
    '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
    '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
    '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
    '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
    '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
    '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
    '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
    '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
    '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
    '114131', '311141', '411131', '211412', '211214', '211232', '2331112'];

// Code 128 (set B: caratteri ASCII da 32 a 126) -> SVG
function rafCodice128Svg(testo, modulo, altezza) {
    modulo = modulo || 2;
    altezza = altezza || 56;
    const valori = [104];
    for (let i = 0; i < testo.length; i++) {
        const c = testo.charCodeAt(i);
        if (c < 32 || c > 126) return '';
        valori.push(c - 32);
    }
    let somma = 104;
    for (let i = 1; i < valori.length; i++) somma += valori[i] * i;
    valori.push(somma % 103);
    valori.push(106);
    const margine = 10;
    let x = margine;
    let barre = '';
    valori.forEach(v => {
        const schema = RAF_C128[v];
        for (let i = 0; i < schema.length; i++) {
            const w = parseInt(schema[i], 10);
            if (i % 2 === 0) barre += '<rect x="' + (x * modulo) + '" y="0" width="' + (w * modulo) + '" height="' + altezza + '"/>';
            x += w;
        }
    });
    const larghezza = (x + margine) * modulo;
    return '<svg xmlns="http://www.w3.org/2000/svg" class="mac-lett-svg" width="' + larghezza + '" height="' + altezza +
        '" viewBox="0 0 ' + larghezza + ' ' + altezza + '" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">' +
        barre + '</g></svg>';
}

// [titolo, codice, spiegazione, pagina del manuale]
const RAF_CODICI_LETTORE = [
    { gruppo: 'Giro di raccolta (lettore staccato)', grande: true, codici: [
        ['1. Svuota memoria', '%#*NEW*', 'Cancella i codici rimasti nel lettore. Leggilo prima di partire.', 6],
        ['2. Modalit&agrave; memoria', '%#INVMD', 'Da qui i codici restano nel lettore e non vengono inviati. Ora vai a leggere le scatole.', 5],
        ['3. Scarica i dati', '%#TXMEM', 'Al ritorno: apri il Carico a raffica (lettore collegato) e leggi questo. Arrivano tutti i codici.', 5],
        ['4. Svuota memoria', '%#*NEW*', 'Dopo la conferma del carico. Il lettore &egrave; pronto per il giro dopo.', 6],
        ['5. Modalit&agrave; normale', '%#NORMD', 'Per usarlo collegato: ogni codice letto arriva subito al PC.', 5]
    ] },
    { gruppo: 'Impostazioni da fare una volta', codici: [
        ['Tastiera italiana', '$LAN#IT', 'Senza questo trattini, barre e simboli escono sbagliati.', 29],
        ['Invio dopo ogni codice', '$TERM#1', 'Serve all\'app per riconoscere la fine del codice.', 44],
        ['PC Windows', '$KB#OS0', 'Se il lettore &egrave; collegato a un PC Windows.', 28],
        ['Mac / iPhone / iPad', '$KB#OS1', 'Se il lettore &egrave; collegato a un Mac.', 28],
        ['Android', '$KB#OS2', 'Se il lettore &egrave; collegato a un telefono Android.', 28],
        ['Memoria automatica', '%AutoSav#On', 'Se la trasmissione non riesce (troppo lontano) il codice viene salvato e non si perde.', 6],
        ['Standby dopo 10 minuti', '$RF#ST20', 'Non si spegne mentre scarichi un camion.', 7]
    ] },
    { gruppo: 'Collegamento', codici: [
        ['Chiavetta USB 2.4G', '%#IFSNO$1', 'Usa la chiavetta USB.', 13],
        ['Abbina la chiavetta', '$RF#CH0%', 'Con la chiavetta inserita: bip continui fino all\'abbinamento.', 13],
        ['Bluetooth', '%#IFSNO$4', 'Passa al Bluetooth (spia blu).', 17],
        ['Bluetooth tastiera', 'AT+MODE=2', 'Il tipo di Bluetooth che serve per l\'app.', 17],
        ['Dimentica abbinamenti Bluetooth', '%%ALL-CH', 'Scollega i dispositivi abbinati.', 18]
    ] },
    { gruppo: 'Utili', codici: [
        ['Lettura col grilletto', '%SCMD#00#', 'Modo normale: legge quando premi il grilletto.', 46],
        ['Lettura continua', '%SCMD#01#', 'Legge da solo: premi una volta per avviare, una per fermare.', 47],
        ['Volume basso', '$BUZZ#3', '', 8],
        ['Volume alto', '$BUZZ#1', '', 8],
        ['Silenzioso', '$BUZZ#0', '', 8],
        ['Quanti codici in memoria', '%#+TCNT', 'Risponde scrivendo un testo: leggilo in un campo vuoto (es. Note), non nel Carico a raffica.', 5],
        ['Livello batteria', '%BAT_VOL#', 'Risponde scrivendo un testo: come sopra.', 8],
        ['Ripristino di fabbrica', '%#IFSNO$CR', 'Cancella TUTTE le impostazioni: poi vanno rifatte quelle qui sopra.', 4]
    ] }
];

function rafFoglioHtml() {
    return '<p class="mac-aiuto">Leggi questi codici con il lettore direttamente dallo schermo o dal foglio stampato. ' +
        'Il lettore risponde con un bip a tre toni quando l\'impostazione &egrave; salvata. Le pagine indicate sono quelle del manuale del lettore.</p>' +
        RAF_CODICI_LETTORE.map(gr => '<div class="mac-lett-gruppo' + (gr.grande ? ' mac-lett-grande' : '') + '">' +
            '<h4>' + gr.gruppo + '</h4><div class="mac-lett-griglia">' +
            gr.codici.map(c => '<div class="mac-lett-voce">' +
                '<div class="mac-lett-titolo">' + c[0] + '</div>' +
                rafCodice128Svg(c[1], 2, gr.grande ? 64 : 50) +
                (c[2] ? '<div class="mac-lett-desc">' + c[2] + '</div>' : '') +
                '<div class="mac-lett-pag">pag. ' + c[3] + '</div>' +
                '</div>').join('') +
            '</div></div>').join('');
}

function rafApriFoglio() {
    const inp = document.getElementById('mac-raf-input');
    if (inp) inp.blur();
    document.getElementById('mac-lett-contenuto').innerHTML = rafFoglioHtml();
    document.getElementById('mac-lett-modal').classList.remove('hidden');
}

function rafChiudiFoglio() {
    document.getElementById('mac-lett-modal').classList.add('hidden');
    rafFocus();
}

function rafStampaFoglio() {
    const w = window.open('', '_blank');
    if (!w) {
        showCustomAlert('Il browser ha bloccato la finestra di stampa: consenti i pop-up per questo sito e riprova.', 'Stampa', '&#9888;&#65039;');
        return;
    }
    w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Codici lettore</title><style>' +
        'body{font-family:Arial,sans-serif;margin:12mm;color:#000}h2{margin:0 0 4px}h4{margin:14px 0 6px;font-size:14px;border-bottom:1px solid #999}' +
        '.mac-aiuto{font-size:11px;margin:0 0 6px}.mac-lett-griglia{display:flex;flex-wrap:wrap;gap:10px}' +
        '.mac-lett-voce{width:48%;border:1px solid #ccc;border-radius:6px;padding:6px;page-break-inside:avoid;box-sizing:border-box}' +
        '.mac-lett-titolo{font-weight:bold;font-size:13px;margin-bottom:4px}' +
        '.mac-lett-svg{display:block}.mac-lett-desc{font-size:10px;margin-top:3px}.mac-lett-pag{font-size:9px;color:#666}' +
        '</style></head><body><h2>Codici del lettore NETUM U820</h2>' + rafFoglioHtml() + '</body></html>');
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 300);
}

// ========================================
// AVVIO
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('mac-raf-modal');
    const btnApri = document.getElementById('mac-btn-raffica');
    if (!modal || !btnApri) return;

    rafCaricaSessione();
    rafAggiornaPulsante();
    btnApri.addEventListener('click', rafApri);

    const inp = document.getElementById('mac-raf-input');
    inp.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        e.stopPropagation();
        const v = inp.value;
        inp.value = '';
        if (rafModaleSopra()) return; // es. foglio codici aperto: le risposte del lettore non sono scatole
        rafLeggi(v);
    });
    document.addEventListener('keydown', rafTastoGlobale, true);

    document.getElementById('mac-raf-close').addEventListener('click', rafChiudi);
    document.getElementById('mac-raf-chiudi').addEventListener('click', rafChiudi);
    document.getElementById('mac-raf-conferma').addEventListener('click', rafConferma);
    document.getElementById('mac-raf-annulla-ultima').addEventListener('click', rafAnnullaUltima);
    document.getElementById('mac-raf-svuota').addEventListener('click', rafSvuota);
    document.getElementById('mac-raf-ordine').addEventListener('change', rafCambiaOrdine);
    document.getElementById('mac-raf-censimento').addEventListener('change', rafCambiaCensimento);
    document.getElementById('mac-raf-assegna').addEventListener('change', () => { rafRender(); rafFocus(); });
    document.getElementById('mac-raf-scelta-annulla').addEventListener('click', rafChiudiScelta);
    document.getElementById('mac-raf-scelta-crea').addEventListener('click', () => { if (rafSceltaId !== null) rafCreaArticolo(rafSceltaId); });
    // Nuovo articolo chiuso senza salvare: niente abbinamento
    document.addEventListener('click', (e) => {
        if (rafCreazione && e.target.closest('#listino-edit-modal .modal-close, #listino-edit-annulla')) {
            rafCreazione = null;
            setTimeout(rafFocus, 50);
        }
    }, true);
    document.getElementById('mac-raf-codici').addEventListener('click', rafApriFoglio);
    const apriGuida = () => {
        const i = document.getElementById('mac-raf-input');
        if (i) i.blur();
        document.getElementById('mac-raf-guida-modal').classList.remove('hidden');
    };
    const chiudiGuida = () => {
        document.getElementById('mac-raf-guida-modal').classList.add('hidden');
        rafFocus();
    };
    document.getElementById('mac-raf-guida').addEventListener('click', apriGuida);
    document.getElementById('mac-raf-guida-close').addEventListener('click', chiudiGuida);
    document.getElementById('mac-raf-guida-chiudi').addEventListener('click', chiudiGuida);
    document.getElementById('mac-lett-close').addEventListener('click', rafChiudiFoglio);
    document.getElementById('mac-lett-chiudi').addEventListener('click', rafChiudiFoglio);
    document.getElementById('mac-lett-stampa').addEventListener('click', rafStampaFoglio);

    macPickerImposta('mac-raf-art-search', 'mac-raf-art-results', null, (a) => {
        document.getElementById('mac-raf-art-search').value = '';
        rafSceltoModello(a);
    });

    document.getElementById('mac-raf-scatole').addEventListener('click', (e) => {
        let el;
        if ((el = e.target.closest('[data-raf-crea]'))) { rafCreaArticolo(parseInt(el.dataset.rafCrea, 10)); return; }
        if ((el = e.target.closest('[data-raf-modello]'))) { rafApriScelta(parseInt(el.dataset.rafModello, 10)); return; }
        if ((el = e.target.closest('[data-raf-togli-matr]'))) { rafTogliMatricola(parseInt(el.dataset.rafTogliMatr, 10)); return; }
        if ((el = e.target.closest('[data-raf-elimina]'))) { rafElimina(parseInt(el.dataset.rafElimina, 10)); return; }
    });
});

window.rafApri = rafApri;
window.rafApriFoglio = rafApriFoglio;
window.rafDopoSalvataggioListino = rafDopoSalvataggioListino;
