// ============================================================
// AGRIMAG - Edge Function "organizzazione-interventi" (v6.1.0)
// ------------------------------------------------------------
// Sistema SEPARATO da assenze e "Invia a Telegram": bot e gruppo propri,
// secrets propri. Se qui qualcosa si rompe, il resto continua a funzionare.
//
// Fa tre cose:
// 1. METEO per ogni intervento (chiamata dall'app, utente collegato):
//    prende il paese dal campo CLIENTE (es. "ROSSI MARIO - MIRA"), trova le
//    coordinate (OpenStreetMap: prima Nominatim, se rifiuta Photon; una volta sola
//    per paese: tabella org_localita) e le previsioni MET Norway (cache di 1 ora:
//    org_meteo_cache). "Non trovato" si salva SOLO se i servizi rispondono che il
//    paese non esiste; se danno errore si riprova alla volta dopo.
//    Mattina 8-13, pomeriggio 13-19. Pioggia = almeno 1 mm nella mezza giornata.
// 2. PROMEMORIA delle 17 (chiamata dallo script Google, con chiave): nel gruppo
//    "Organizzazione interventi" l'elenco del giorno lavorativo dopo (il sabato:
//    lunedi') con meteo, avvisi pioggia e un link WhatsApp per ogni cliente.
// 3. LINK WhatsApp (GET ?wa=id.firma): segna "promemoria inviato" e apre
//    WhatsApp con chat e testo pronti.
//    IL TESTO DEL PROMEMORIA E' SCRITTO ANCHE IN interventi-functions.js:
//    se si cambia, cambiarlo in tutti e due.
//
// Secrets (Edge Functions > Secrets):
//   ORG_BOT_TOKEN    = token di @organizzazioneinterventi_bot
//   ORG_CHAT_ID      = id del gruppo "Organizzazione interventi"
//   ORG_SCRIPT_KEY   = parola segreta, la stessa scritta nello script Google
//   ORG_SERVICE_KEY  = chiave segreta Supabase (sb_secret_...)
// Impostazione: "Verify JWT" SPENTO (i controlli li fa la funzione).
// Meteo: MET Norway (api.met.no, licenza CC BY 4.0). Luoghi: OpenStreetMap.
// ============================================================

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const USER_AGENT = 'AGRIMAG-organizzazione-interventi/1.0 (agrimacchricambi@gmail.com)';
const ORE_METEO = { M: [8, 13], P: [13, 19] } as const;
const MM_PIOGGIA = 1.0;     // da 1 mm nella mezza giornata = pioggia (intervento da spostare)
const MM_DEBOLE = 0.2;      // da 0,2 a 1 mm = pioggia debole possibile
const GIORNI_METEO = 9;     // MET Norway arriva a circa 9-10 giorni
const VIEWBOX = '11.2,46.2,13.1,44.9';   // zona di ricerca dei paesi (Veneto e dintorni)

const TEL_AZIENDA = '+39 041 5401030';
const FIRMA = 'Agrimacch srl';
const GIORNI_MIN = ['domenica', 'luned\u00EC', 'marted\u00EC', 'mercoled\u00EC', 'gioved\u00EC', 'venerd\u00EC', 'sabato'];
const GIORNI_CORTI = ['DOM', 'LUN', 'MAR', 'MER', 'GIO', 'VEN', 'SAB'];
const MESI_MIN = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
    'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const MESI_CORTI = ['GEN', 'FEB', 'MAR', 'APR', 'MAG', 'GIU', 'LUG', 'AGO', 'SET', 'OTT', 'NOV', 'DIC'];
const TIPI_TESTO: Record<string, string> = { INT: "l'intervento di assistenza", SOP: 'il sopralluogo', MONT: 'il montaggio' };
const PAROLE_NON_LUOGO = ['RICONSEGNA', 'PROVA', 'RITIRO', 'CONSEGNA', 'SAS', 'SRL', 'SNC', 'SPA', 'SS', 'AZ', 'AGR',
    'AZIENDA', 'AGRICOLA', 'TEL', 'CELL', 'VIA', 'DITTA', 'DI', 'E', 'C', 'O'];

type Intervento = {
    id: number; tecnico_id: number; data: string; turno: string; posizione: number;
    ora?: string | null; tipo?: string | null; esito?: string | null; cliente?: string | null;
    promemoria_at?: string | null; promemoria_da?: string | null;
};
type Meteo = { loc: string | null; stato: 'PIOGGIA' | 'DEBOLE' | 'OK' | 'ND'; mm: number; icona: string; nota?: string };

function risposta(dati: unknown, stato = 200): Response {
    return new Response(JSON.stringify(dati), { status: stato, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

function esc(t: unknown): string {
    return String(t ?? '').slice(0, 300).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const attesa = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- Date (ora italiana) ----------
function oggiRoma(): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function piuGiorni(iso: string, n: number): string {
    const p = iso.split('-').map(Number);
    return new Date(Date.UTC(p[0], p[1] - 1, p[2] + n, 12)).toISOString().slice(0, 10);
}
function giornoSett(iso: string): number {
    const p = iso.split('-').map(Number);
    return new Date(Date.UTC(p[0], p[1] - 1, p[2], 12)).getUTCDay();
}
function prossimoLavorativo(iso: string): string {
    let d = piuGiorni(iso, 1);
    if (giornoSett(d) === 0) d = piuGiorni(d, 1);
    return d;
}
function giornoCorto(iso: string): string {
    const p = iso.split('-').map(Number);
    return GIORNI_CORTI[giornoSett(iso)] + ' ' + p[2] + ' ' + MESI_CORTI[p[1] - 1];
}
// Ora italiana -> istante UTC (gestisce ora legale/solare)
function romaUtc(iso: string, ora: number): number {
    const p = iso.split('-').map(Number);
    const mezzogiorno = Date.UTC(p[0], p[1] - 1, p[2], 12);
    const oraRoma = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', hour: '2-digit', hour12: false }).format(new Date(mezzogiorno)));
    const scarto = oraRoma - 12;   // +1 inverno, +2 estate
    return Date.UTC(p[0], p[1] - 1, p[2], ora - scarto);
}

// ---------- Database (chiave di servizio) ----------
function chiaveServizio(): string {
    return Deno.env.get('ORG_SERVICE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
}
async function db(percorso: string, metodo = 'GET', corpo?: unknown, prefer?: string): Promise<any> {
    const k = chiaveServizio();
    const h: Record<string, string> = { apikey: k, 'Content-Type': 'application/json' };
    if (k.startsWith('eyJ')) h.Authorization = 'Bearer ' + k;
    if (prefer) h.Prefer = prefer;
    const res = await fetch(Deno.env.get('SUPABASE_URL') + '/rest/v1/' + percorso, {
        method: metodo, headers: h, body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const testo = await res.text();
    if (!res.ok) throw new Error(metodo + ' ' + percorso.split('?')[0] + ' (' + res.status + '): ' + testo.slice(0, 200));
    return testo ? JSON.parse(testo) : null;
}

// ---------- Telegram ----------
async function telegram(metodo: string, dati: Record<string, unknown>): Promise<any> {
    const token = (Deno.env.get('ORG_BOT_TOKEN') || '').trim();
    if (!token) return { ok: false, description: 'Manca il secret ORG_BOT_TOKEN' };
    const res = await fetch('https://api.telegram.org/bot' + token + '/' + metodo, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dati),
    });
    return await res.json().catch(() => ({ ok: false, description: 'risposta non valida' }));
}

// ============================================================
// LUOGO DEL CLIENTE
// ============================================================
function pulisci(t: string): string {
    let s = t.toUpperCase().replace(/[^A-Z\u00C0-\u00DD' ]/g, ' ').replace(/'/g, ' ').replace(/\s+/g, ' ').trim();
    // tolgo parole "non luogo" in fondo (es. "MIRA RICONSEGNA")
    let parole = s.split(' ');
    while (parole.length && PAROLE_NON_LUOGO.includes(parole[parole.length - 1])) parole.pop();
    while (parole.length && PAROLE_NON_LUOGO.includes(parole[0])) parole.shift();
    s = parole.join(' ');
    return s;
}

// "ROSSI MARIO - MIRA - 3471234567" -> "MIRA"; "VANIN MARCO GARDIGIANO - 351..." -> "GARDIGIANO"
function luogoDaCliente(cliente?: string | null): string | null {
    let t = String(cliente || '').toUpperCase();
    t = t.replace(/\+[^0-9].*$/, '');                       // "... + RICONSEGNA": taglio dopo il +
    t = t.replace(/(\+|00)39/g, ' ').replace(/\d[\d\s.\-\/]{5,}\d/g, ' ');   // tolgo i telefoni
    const parti = t.split(/\s-\s|\s-|-\s|\s\/\s|,/).map((x) => pulisci(x)).filter(Boolean);
    for (const p of parti.slice(1)) if (p.replace(/ /g, '').length >= 3) return p;
    const parole = (parti[0] || '').split(' ').filter((w) => w.length >= 3);
    if (parole.length >= 3) return parole[parole.length - 1];   // cognome nome PAESE
    return null;
}

// Ricerca di un nome sui due servizi OpenStreetMap.
// esito: { trovato } oppure { vuoto: true } (entrambi rispondono "non esiste") oppure { errore }
const VIEWBOX_PHOTON = '11.2,44.9,13.1,46.2';   // stessa zona: lon min, lat min, lon max, lat max
let ultimaRicerca: string[] = [];               // per la diagnosi

async function cercaLuogo(q: string): Promise<{ lat: number; lon: number; nome: string } | { vuoto: true } | { errore: string }> {
    const note: string[] = [];
    let risposteVuote = 0;
    let photonVuoto = false;
    // 1. Nominatim
    try {
        const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=it&bounded=1&viewbox=' +
            VIEWBOX + '&q=' + encodeURIComponent(q);
        const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'it' } });
        if (res.ok) {
            const j = await res.json().catch(() => null);
            if (Array.isArray(j) && j.length) {
                ultimaRicerca = ['Nominatim: trovato'];
                return { lat: Number(j[0].lat), lon: Number(j[0].lon), nome: String(j[0].display_name || q) };
            }
            if (Array.isArray(j)) { risposteVuote++; note.push('Nominatim: nessun risultato'); }
            else note.push('Nominatim: risposta non valida');
        } else note.push('Nominatim: HTTP ' + res.status);
    } catch (err) {
        note.push('Nominatim: ' + String((err as Error)?.message || err).slice(0, 80));
    }
    // 2. Photon (stessi dati OpenStreetMap)
    try {
        const url = 'https://photon.komoot.io/api/?limit=1&bbox=' + VIEWBOX_PHOTON + '&q=' + encodeURIComponent(q);
        const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
        if (res.ok) {
            const j = await res.json().catch(() => null);
            const f = j?.features?.[0];
            if (f?.geometry?.coordinates) {
                ultimaRicerca = note.concat('Photon: trovato');
                const pr = f.properties || {};
                return { lat: Number(f.geometry.coordinates[1]), lon: Number(f.geometry.coordinates[0]),
                    nome: [pr.name, pr.city || pr.county, pr.state].filter(Boolean).join(', ') || q };
            }
            if (j && Array.isArray(j.features)) { risposteVuote++; photonVuoto = true; note.push('Photon: nessun risultato'); }
            else note.push('Photon: risposta non valida');
        } else note.push('Photon: HTTP ' + res.status);
    } catch (err) {
        note.push('Photon: ' + String((err as Error)?.message || err).slice(0, 80));
    }
    ultimaRicerca = note;
    return (risposteVuote === 2 || photonVuoto) ? { vuoto: true } : { errore: note.join(' / ') };
}

// Coordinate del paese (cache in org_localita)
async function coordinate(nome: string, nuove: { n: number }): Promise<{ lat: number; lon: number } | null> {
    const chiave = nome.toUpperCase();
    const trovate = await db('org_localita?select=*&nome=eq.' + encodeURIComponent(chiave));
    if (trovate.length && trovate[0].trovata) return { lat: trovate[0].lat, lon: trovate[0].lon };
    // "non trovato" salvato: riprovo dopo 7 giorni (magari e' stato corretto il campo o il servizio)
    if (trovate.length && Date.now() - new Date(trovate[0].updated_at).getTime() < 7 * 24 * 3600 * 1000) return null;
    if (nuove.n >= 12) return null;          // al massimo 12 ricerche per chiamata (servizi gratuiti: 1 al secondo)
    const tentativi = [nome];
    if (nome.includes(' ')) tentativi.push(nome.split(' ').pop() as string);
    let trovato: { lat: number; lon: number; nome: string } | null = null;
    let tuttiVuoti = true;
    for (const q of tentativi) {
        if (nuove.n > 0) await attesa(1100);
        nuove.n++;
        const e = await cercaLuogo(q);
        if ('lat' in e) { trovato = e; break; }
        if ('errore' in e) tuttiVuoti = false;
    }
    if (!trovato && !tuttiVuoti) return null;   // errore dei servizi: non salvo nulla, si riprova la prossima volta
    await db('org_localita?on_conflict=nome', 'POST', {
        nome: chiave,
        lat: trovato ? trovato.lat : null,
        lon: trovato ? trovato.lon : null,
        trovata: !!trovato,
        descrizione: trovato ? trovato.nome.slice(0, 200) : null,
        updated_at: new Date().toISOString(),
    }, 'return=minimal,resolution=merge-duplicates');
    return trovato ? { lat: trovato.lat, lon: trovato.lon } : null;
}

// ============================================================
// METEO (MET Norway)
// ============================================================
type Passo = { t: number; d: number; mm: number; sim: string };   // inizio (ms), durata (ore), mm, simbolo

async function previsioni(lat: number, lon: number): Promise<Passo[]> {
    const la = lat.toFixed(2), lo = lon.toFixed(2);
    const chiave = la + ',' + lo;
    const cache = await db('org_meteo_cache?select=*&chiave=eq.' + encodeURIComponent(chiave));
    if (cache.length && new Date(cache[0].scade_at).getTime() > Date.now()) return cache[0].dati as Passo[];

    const res = await fetch('https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=' + la + '&lon=' + lo,
        { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) {
        if (cache.length) return cache[0].dati as Passo[];
        throw new Error('MET Norway: ' + res.status);
    }
    const j = await res.json();
    const passi: Passo[] = [];
    for (const s of j?.properties?.timeseries || []) {
        const t = new Date(s.time).getTime();
        const uno = s.data?.next_1_hours, sei = s.data?.next_6_hours;
        if (uno) passi.push({ t, d: 1, mm: Number(uno.details?.precipitation_amount || 0), sim: String(uno.summary?.symbol_code || '') });
        else if (sei) passi.push({ t, d: 6, mm: Number(sei.details?.precipitation_amount || 0), sim: String(sei.summary?.symbol_code || '') });
    }
    await db('org_meteo_cache?on_conflict=chiave', 'POST',
        { chiave, dati: passi, scade_at: new Date(Date.now() + 3600 * 1000).toISOString() },
        'return=minimal,resolution=merge-duplicates');
    return passi;
}

function iconaSimbolo(simboli: string[], mm: number): string {
    const tutti = simboli.join(' ');
    if (/thunder/.test(tutti)) return '\u26C8\uFE0F';
    if (/snow|sleet/.test(tutti)) return '\uD83C\uDF28\uFE0F';
    if (mm >= MM_PIOGGIA) return '\uD83C\uDF27\uFE0F';
    if (mm >= MM_DEBOLE || /rain/.test(tutti)) return '\uD83C\uDF26\uFE0F';
    if (/fog/.test(tutti)) return '\uD83C\uDF2B\uFE0F';
    if (/cloudy/.test(tutti) && !/partly/.test(tutti)) return '\u2601\uFE0F';
    if (/partlycloudy|fair/.test(tutti)) return '\u26C5';
    if (/clearsky/.test(tutti)) return '\u2600\uFE0F';
    return '\u2601\uFE0F';
}

function meteoMezzaGiornata(passi: Passo[], data: string, turno: string): { stato: Meteo['stato']; mm: number; icona: string } {
    const [h1, h2] = turno === 'P' ? ORE_METEO.P : ORE_METEO.M;
    const a = romaUtc(data, h1), b = romaUtc(data, h2);
    let mm = 0, coperto = 0;
    const simboli: string[] = [];
    for (const p of passi) {
        const inizio = p.t, fine = p.t + p.d * 3600 * 1000;
        const sovra = Math.min(fine, b) - Math.max(inizio, a);
        if (sovra <= 0) continue;
        mm += p.mm * sovra / (p.d * 3600 * 1000);
        coperto += sovra;
        simboli.push(p.sim);
    }
    if (coperto < (b - a) * 0.5) return { stato: 'ND', mm: 0, icona: '' };    // previsione non ancora disponibile
    mm = Math.round(mm * 10) / 10;
    const stato = mm >= MM_PIOGGIA ? 'PIOGGIA' : (mm >= MM_DEBOLE ? 'DEBOLE' : 'OK');
    return { stato, mm, icona: iconaSimbolo(simboli, mm) };
}

async function meteoRighe(righe: Intervento[], oggi: string): Promise<Record<number, Meteo>> {
    const out: Record<number, Meteo> = {};
    const nuove = { n: 0 };
    const limite = piuGiorni(oggi, GIORNI_METEO);
    const perLuogo = new Map<string, Passo[] | null>();
    for (const r of righe) {
        if (!r || !r.id) continue;
        const loc = luogoDaCliente(r.cliente);
        if (!loc) { out[r.id] = { loc: null, stato: 'ND', mm: 0, icona: '', nota: 'paese non indicato' }; continue; }
        if (r.data < oggi || r.data > limite) { out[r.id] = { loc, stato: 'ND', mm: 0, icona: '', nota: 'fuori previsione' }; continue; }
        if (!perLuogo.has(loc)) {
            try {
                const c = await coordinate(loc, nuove);
                perLuogo.set(loc, c ? await previsioni(c.lat, c.lon) : null);
            } catch (err) {
                console.log('Meteo ' + loc + ':', err);
                perLuogo.set(loc, null);
            }
        }
        const passi = perLuogo.get(loc);
        if (!passi) { out[r.id] = { loc, stato: 'ND', mm: 0, icona: '', nota: 'paese non trovato' }; continue; }
        out[r.id] = { loc, ...meteoMezzaGiornata(passi, r.data, r.turno) };
    }
    return out;
}

// ============================================================
// PROMEMORIA WHATSAPP
// ============================================================
function cellulare(testo?: string | null): string | null {
    const t = String(testo || '').replace(/(\+|00)39[\s.\-]?/g, ' ');
    const re = /(?<!\d)(3\d{2}(?:[\s.\-]?\d){6,7})(?!\d)/g;
    let m;
    while ((m = re.exec(t))) {
        const cifre = m[1].replace(/\D/g, '');
        if (cifre.length >= 9 && cifre.length <= 10) return '39' + cifre;
    }
    return null;
}

function oraTesto(ora: string | null | undefined, turno: string): string {
    let o = String(ora || '').trim().toUpperCase();
    const circa = /\b(CCA|CIRCA|CA)\b/.test(o);
    o = o.replace(/\b(CCA|CIRCA|CA)\b\.?/g, '').trim();
    const orari = o.match(/\d{1,2}(?:[.:,]\d{2})?/g);
    if (!orari) return turno === 'P' ? 'nel pomeriggio' : 'in mattinata';
    const f = (x: string) => x.replace(/[:,]/, '.');
    if (orari.length >= 2) return 'tra le ore ' + f(orari[0]) + ' e le ' + f(orari[1]) + (circa ? ' circa' : '');
    return 'alle ore ' + f(orari[0]) + (circa ? ' circa' : '');
}

function testoPromemoria(r: Intervento, oggi: string): string {
    const p = r.data.split('-').map(Number);
    const dataTxt = GIORNI_MIN[giornoSett(r.data)] + ' ' + p[2] + ' ' + MESI_MIN[p[1] - 1];
    const quando = r.data === oggi ? 'di oggi, ' : (r.data === piuGiorni(oggi, 1) ? 'di domani, ' : 'di ');
    return 'Buongiorno,\n' +
        "le ricordiamo l'appuntamento " + quando + '*' + dataTxt + ' ' + oraTesto(r.ora, r.turno) + '*' +
        ', con un nostro tecnico per ' + (TIPI_TESTO[r.tipo || ''] || "l'intervento") + '.\n' +
        'Se ha bisogno di spostarlo o annullarlo, la preghiamo di contattarci telefonicamente al numero ' + TEL_AZIENDA + '.\n' +
        'La ringraziamo e le porgiamo cordiali saluti.\n\n' +
        '*' + FIRMA + '*';
}

async function firmaLink(id: number): Promise<string> {
    const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(Deno.env.get('ORG_SCRIPT_KEY') || ''),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode('promemoria:' + id));
    return Array.from(new Uint8Array(sig)).slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function oraBreve(iso: string): string {
    try {
        return new Date(iso).toLocaleString('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch (_) { return ''; }
}

function rigaMeteo(m?: Meteo): string {
    if (!m) return '';
    if (m.stato === 'ND') return m.nota === 'paese non indicato' ? '   <i>meteo: paese non indicato nel campo Cliente</i>' :
        m.nota === 'paese non trovato' ? '   <i>meteo: paese "' + esc(m.loc) + '" non trovato</i>' : '';
    const parole = m.stato === 'PIOGGIA' ? '<b>PIOGGIA ' + String(m.mm).replace('.', ',') + ' mm</b>'
        : m.stato === 'DEBOLE' ? 'pioggia debole ' + String(m.mm).replace('.', ',') + ' mm' : 'niente pioggia';
    return '   ' + m.icona + ' ' + esc(m.loc) + ': ' + parole;
}

async function promemoria(corpo: { oggi?: string }) {
    const chat = (Deno.env.get('ORG_CHAT_ID') || '').trim();
    if (!chat) throw new Error('Manca il secret ORG_CHAT_ID');
    const oggi = String(corpo.oggi || oggiRoma()).slice(0, 10);
    const giorno = prossimoLavorativo(oggi);
    const tecnici: { id: number; nome: string; ordine?: number }[] = await db('tecnici?select=id,nome,ordine');
    const nome = (id: number) => tecnici.find((t) => t.id === id)?.nome || 'TECNICO';
    const ordine = (id: number) => tecnici.find((t) => t.id === id)?.ordine ?? 999;
    const tutte: Intervento[] = await db('interventi?select=*&data=eq.' + giorno);
    const righe = tutte.filter((r) => (r.ora || r.tipo || r.esito || r.cliente) && r.esito !== 'NO').sort((a, b) =>
        ordine(a.tecnico_id) - ordine(b.tecnico_id) || a.turno.localeCompare(b.turno) || a.posizione - b.posizione);

    let meteo: Record<number, Meteo> = {};
    try { meteo = await meteoRighe(righe, oggi); } catch (err) { console.log('Meteo non disponibile:', err); }

    const intest = (r: Intervento) => '<b>' + esc(r.ora || (r.turno === 'P' ? 'pom.' : 'mat.')) + '</b> \u00B7 ' + esc(nome(r.tecnico_id)) +
        (r.tipo ? ' \u00B7 ' + esc(r.tipo) : '') + '\n   ' + esc(r.cliente || '');
    const conMeteo = (r: Intervento) => { const m = rigaMeteo(meteo[r.id]); return m ? '\n' + m : ''; };
    const pioggia = righe.filter((r) => meteo[r.id]?.stato === 'PIOGGIA');
    const daInviare: string[] = [], inviati: string[] = [], senza: string[] = [], attesaConf: string[] = [];
    const base = Deno.env.get('SUPABASE_URL') + '/functions/v1/organizzazione-interventi?wa=';
    for (const r of righe) {
        if (r.esito === '?') attesaConf.push('\u2022 ' + intest(r) + conMeteo(r));
        else if (r.promemoria_at) inviati.push('\u2022 ' + intest(r) + conMeteo(r) + '\n   \u2705 inviato ' + esc(oraBreve(r.promemoria_at)));
        else if (!cellulare(r.cliente)) senza.push('\u2022 ' + intest(r) + conMeteo(r));
        else daInviare.push('\u2022 ' + intest(r) + conMeteo(r) + '\n   <a href="' + base + r.id + '.' + (await firmaLink(r.id)) +
            '">\uD83D\uDCF2 Invia promemoria WhatsApp</a>');
    }

    let testo = '\uD83D\uDDD3\uFE0F <b>ORGANIZZAZIONE INTERVENTI</b>\n\uD83D\uDCC5 <b>' + giornoCorto(giorno) + '</b>' +
        (giorno === piuGiorni(oggi, 1) ? ' (domani)' : '') + '\n';
    if (!righe.length) {
        testo += '\nNessun appuntamento in planning.';
    } else {
        if (pioggia.length) {
            testo += '\n\u26A0\uFE0F <b>PIOGGIA PREVISTA su ' + pioggia.length + (pioggia.length === 1 ? ' intervento' : ' interventi') +
                '</b>: valuta se spostarli PRIMA di mandare il promemoria.\n';
        } else {
            testo += '\n\u2600\uFE0F Nessuna pioggia prevista sugli interventi.\n';
        }
        if (daInviare.length) testo += '\n<b>\uD83D\uDCF2 Promemoria da inviare</b> (tocca il link: WhatsApp con il messaggio pronto)\n' + daInviare.join('\n') + '\n';
        else testo += '\n\u2705 Nessun promemoria da inviare.\n';
        if (inviati.length) testo += '\n<b>\u2705 Gi\u00E0 inviati</b>\n' + inviati.join('\n') + '\n';
        if (senza.length) testo += '\n<b>\u26A0\uFE0F Senza cellulare</b> (scrivilo nel campo Cliente)\n' + senza.join('\n') + '\n';
        if (attesaConf.length) testo += '\n<b>\u2753 Da confermare</b> (esito ?, cliente da chiamare)\n' + attesaConf.join('\n') + '\n';
    }
    testo += '\n<i>Meteo: MET Norway</i>';

    const pezzi: string[] = [];
    let attuale = '';
    for (const riga of testo.split('\n')) {
        if ((attuale + riga).length > 3800) { pezzi.push(attuale); attuale = ''; }
        attuale += riga + '\n';
    }
    if (attuale.trim()) pezzi.push(attuale);
    for (const pz of pezzi) {
        const r = await telegram('sendMessage', { chat_id: chat, text: pz, parse_mode: 'HTML', disable_web_page_preview: true });
        if (!r.ok) throw new Error('Telegram: ' + (r.description || 'errore') +
            (r.parameters?.migrate_to_chat_id ? ' - NUOVO chat id: ' + r.parameters.migrate_to_chat_id + ' (mettilo in ORG_CHAT_ID)' : ''));
    }
    return { ok: true, giorno, appuntamenti: righe.length, da_inviare: daInviare.length, pioggia: pioggia.length };
}

async function apriPromemoria(valore: string): Promise<Response> {
    const testo = (t: string, s = 200) => new Response(t, { status: s, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    const m = String(valore || '').match(/^(\d+)\.([0-9a-f]{24})$/);
    if (!m || m[2] !== await firmaLink(Number(m[1]))) return testo('Link non valido.', 403);
    const trovati: Intervento[] = await db('interventi?select=*&id=eq.' + m[1]);
    const r = trovati[0];
    if (!r || !(r.ora || r.tipo || r.cliente) || r.esito === 'NO') {
        return testo("Questo intervento non c'e' piu' nel planning (cancellato o annullato).", 404);
    }
    const num = cellulare(r.cliente);
    if (!num) return testo("Nel campo Cliente non c'e' un numero di cellulare.", 404);
    await db('interventi?id=eq.' + r.id, 'PATCH', { promemoria_at: new Date().toISOString(), promemoria_da: 'TELEGRAM' }, 'return=minimal');
    return new Response(null, { status: 302, headers: { Location: 'https://wa.me/' + num + '?text=' + encodeURIComponent(testoPromemoria(r, oggiRoma())) } });
}

// ============================================================
// DIAGNOSI (dallo script Google)
// ============================================================
async function diagnosi(): Promise<string[]> {
    const r: string[] = [];
    const ok = (t: string) => r.push('OK      ' + t);
    const ko = (t: string) => r.push('ERRORE  ' + t);
    const token = Deno.env.get('ORG_BOT_TOKEN') || '';
    if (!token) ko('Secret ORG_BOT_TOKEN mancante');
    else if (!/^\d+:[\w-]{30,}$/.test(token.trim())) ko('ORG_BOT_TOKEN non sembra un token (deve essere tipo 123456789:AAH...)');
    else ok('ORG_BOT_TOKEN presente (bot n. ' + token.split(':')[0] + ')');
    const chat = (Deno.env.get('ORG_CHAT_ID') || '').trim();
    if (!chat) ko('Secret ORG_CHAT_ID mancante');
    else if (!/^-?\d+$/.test(chat)) ko('ORG_CHAT_ID = "' + chat + '": deve contenere solo il numero (col meno)');
    else ok('ORG_CHAT_ID = ' + chat);
    if (Deno.env.get('ORG_SCRIPT_KEY')) ok('ORG_SCRIPT_KEY presente'); else ko('Secret ORG_SCRIPT_KEY mancante');
    const sk = chiaveServizio();
    if (!sk) ko('Chiave di servizio mancante (ORG_SERVICE_KEY)');
    else ok('Chiave di servizio: ' + (Deno.env.get('ORG_SERVICE_KEY') ? 'ORG_SERVICE_KEY' : 'chiave vecchia di Supabase'));

    try {
        const t = await db('tecnici?select=id');
        ok('Database: ' + t.length + ' tecnici');
        const i = await db('interventi?select=id,promemoria_at&limit=1');
        ok('Database: colonne promemoria presenti' + (i.length ? '' : ' (nessun intervento ancora)'));
        await db('org_localita?select=nome&limit=1');
        await db('org_meteo_cache?select=chiave&limit=1');
        ok('Database: tabelle meteo presenti');
    } catch (err) {
        ko('Database: ' + String((err as Error)?.message || err) + ' (eseguito organizzazione-setup.sql?)');
    }

    try {
        // prova diretta sui servizi (senza cache), poi con la cache
        const e = await cercaLuogo('MIRA');
        if ('lat' in e) ok('Luoghi: MIRA trovata (' + ultimaRicerca.join(' / ') + ')');
        else ko('Luoghi: MIRA non trovata - ' + ultimaRicerca.join(' / '));
        const c = 'lat' in e ? { lat: e.lat, lon: e.lon } : null;
        if (c) {
            ok('Luoghi (OpenStreetMap): MIRA = ' + c.lat.toFixed(3) + ', ' + c.lon.toFixed(3));
            const p = await previsioni(c.lat, c.lon);
            const domani = meteoMezzaGiornata(p, piuGiorni(oggiRoma(), 1), 'M');
            ok('Meteo (MET Norway): ' + p.length + ' previsioni; domani mattina a Mira ' + domani.icona + ' ' + domani.mm + ' mm');
        }
    } catch (err) {
        ko('Meteo/luoghi: ' + String((err as Error)?.message || err));
    }

    if (!token) return r;
    const me = await telegram('getMe', {});
    if (me.ok) ok('Bot: @' + me.result.username + ' (deve essere @organizzazioneinterventi_bot)');
    else { ko('Bot: token rifiutato da Telegram (' + (me.description || 'errore') + ')'); return r; }
    if (chat) {
        const prova = await telegram('sendMessage', { chat_id: chat, text: '\uD83D\uDD27 Diagnosi AGRIMAG: il bot scrive correttamente in questo gruppo.' });
        if (prova.ok) ok('Gruppo: messaggio di prova inviato');
        else ko('Gruppo: ' + (prova.description || 'errore') +
            (prova.parameters?.migrate_to_chat_id ? ' -> NUOVO chat id: ' + prova.parameters.migrate_to_chat_id + ' (mettilo in ORG_CHAT_ID)' : ''));
    }
    return r;
}

// ============================================================
Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

    if (req.method === 'GET') {
        const wa = new URL(req.url).searchParams.get('wa');
        if (!wa) return new Response('AGRIMAG', { status: 200 });
        try { return await apriPromemoria(wa); }
        catch (err) { return new Response('Errore: ' + String((err as Error)?.message || err), { status: 500 }); }
    }
    if (req.method !== 'POST') return risposta({ ok: false, errore: 'Metodo non consentito' }, 405);

    let corpo: any = {};
    try { corpo = await req.json(); } catch (_) { return risposta({ ok: false, errore: 'Richiesta non valida' }, 400); }
    if (!chiaveServizio()) return risposta({ ok: false, errore: 'Manca la chiave di servizio (ORG_SERVICE_KEY)' }, 500);

    try {
        // ---- Dall'app: meteo degli interventi (utente collegato) ----
        if (corpo.azione === 'meteo') {
            const auth = req.headers.get('Authorization') || '';
            const apikey = req.headers.get('apikey') || '';
            const u = await fetch(Deno.env.get('SUPABASE_URL') + '/auth/v1/user', { headers: { Authorization: auth, apikey } });
            if (!u.ok) return risposta({ ok: false, errore: 'Utente non collegato' }, 401);
            const righe = (Array.isArray(corpo.righe) ? corpo.righe : []).slice(0, 200).map((r: any) => ({
                id: Number(r.id), tecnico_id: 0, data: String(r.data || '').slice(0, 10), turno: r.turno === 'P' ? 'P' : 'M',
                posizione: 0, cliente: String(r.cliente || '').slice(0, 200),
            }));
            return risposta({ ok: true, meteo: await meteoRighe(righe, oggiRoma()) });
        }

        // ---- Dallo script Google: serve la chiave ----
        const chiave = Deno.env.get('ORG_SCRIPT_KEY');
        if (!chiave || corpo.chiave !== chiave) return risposta({ ok: false, errore: 'Chiave non valida' }, 401);
        if (corpo.azione === 'promemoria') return risposta(await promemoria(corpo));
        if (corpo.azione === 'diagnosi') return risposta({ ok: true, riepilogo: await diagnosi() });
        return risposta({ ok: false, errore: 'Azione sconosciuta' }, 400);
    } catch (err) {
        return risposta({ ok: false, errore: String((err as Error)?.message || err) }, 500);
    }
});
