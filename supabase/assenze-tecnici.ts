// ============================================================
// AGRIMAG - Edge Function "assenze-tecnici" (v5.1.0)
// ------------------------------------------------------------
// Assenze dei tecnici lette dal calendario Google condiviso.
//
// Riceve chiamate da DUE parti:
// 1. Lo script Google (google/assenze-calendario.gs), ogni 2 minuti, con
//    gli eventi del calendario. Per ogni evento NUOVO o MODIFICATO che parla
//    di un'assenza di un tecnico manda a Donny un messaggio Telegram con i
//    pulsanti "Si', colora" / "No". Alle 7 manda il resoconto del giorno.
//    Se un evento sparisce dal calendario lo segnala.
// 2. Telegram (webhook del bot), quando si preme un pulsante: colora di rosso
//    il planning (tabella interventi) senza toccare il testo delle righe.
//
// Come legge i titoli (maiuscole/minuscole e accenti non contano):
// - deve esserci una parola di assenza: assente, assenti, assenza, ferie,
//   malattia, malato, permesso, esce, esco, uscita
// - il tecnico: nome e cognome in qualsiasi ordine, oppure solo nome o solo
//   cognome se nessun altro tecnico dell'app ha quella parola nel nome.
//   Vale anche per i tecnici aggiunti in futuro (legge la tabella tecnici).
//   Solo nome + una parola sconosciuta attaccata (es. "paolo rossi assente")
//   = un'altra persona con lo stesso nome: ignorato.
//   Eventi di persone che non sono tecnici: ignorati, nessun messaggio
//   (messaggio "DA CONTROLLARE" solo se il nome e' di piu' tecnici).
// - Il messaggio propone la parte di giornata letta dal titolo; con i pulsanti
//   si sceglie: come proposto / solo mattina / solo pomeriggio / giornata intera / no.
// - giornata lavorativa 8:00-19:00: mattina 8-13, pomeriggio 13-19
//   * evento "tutto il giorno" (anche piu' giorni): giornate intere
//   * "esce ore 10" / "esce alle 16.30": se l'ora e' di mattina -> mattina,
//     se e' di pomeriggio -> pomeriggio (se manca l'ora nel titolo vale
//     l'inizio dell'evento)
//   * evento con orario: le mezze giornate toccate dall'orario
//   * la domenica non si colora
//
// Secrets da impostare su Supabase (Edge Functions > Secrets):
//   TELEGRAM_BOT_TOKEN_INTERVENTI = token di @interventiesterni_bot (c'e' gia')
//   ASSENZE_CHAT_ID         = chat id di Donny (privato) o del gruppo "ASSENZE TECNICI"
//   ASSENZE_SCRIPT_KEY      = parola segreta, la stessa scritta nello script Google
//   ASSENZE_WEBHOOK_SECRET  = altra parola segreta, usata da Telegram (setWebhook)
//   ASSENZE_SERVICE_KEY     = chiave segreta Supabase (sb_secret_...) - consigliata;
//                             se manca usa la chiave di servizio vecchia
//
// Impostazione da fare nella funzione: "Verify JWT" SPENTO
// (Google e Telegram non hanno il login: i controlli li fa la funzione con le chiavi segrete).
// ============================================================

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PAROLE_ASSENZA = ['assente', 'assenti', 'assenza', 'ferie', 'malattia', 'malato', 'permesso', 'esce', 'esco', 'uscita'];
const PAROLE_USCITA = ['esce', 'esco', 'uscita'];
// Parole "normali" che possono stare vicino al nome senza far pensare a un cognome
const PAROLE_COMUNI = PAROLE_ASSENZA.concat(['ore', 'ora', 'alle', 'dalle', 'dal', 'al', 'fino', 'e', 'ed', 'in', 'per',
    'oggi', 'domani', 'tutto', 'tutta', 'il', 'la', 'lo', 'giorno', 'giornata', 'giorni', 'mattina', 'mattino',
    'pomeriggio', 'sera', 'mezza', 'mezzo', 'h', 'da', 'a', 'di', 'del', 'della', 'causa', 'visita', 'medica',
    'medico', 'corso', 'non', 'c', 'e\'', 'anticipata', 'prima', 'dopo', 'presto', 'rientra', 'entra']);
const INIZIO_GIORNO = 8 * 60;       // 8:00
const META_GIORNO = 13 * 60;        // 13:00 (confine mattina / pomeriggio)
const FINE_GIORNO = 19 * 60;        // 19:00

const GIORNI_CORTI = ['DOM', 'LUN', 'MAR', 'MER', 'GIO', 'VEN', 'SAB'];
const MESI_CORTI = ['GEN', 'FEB', 'MAR', 'APR', 'MAG', 'GIU', 'LUG', 'AGO', 'SET', 'OTT', 'NOV', 'DIC'];
const PARTI: Record<string, string> = { G: 'tutto il giorno', M: 'mattina', P: 'pomeriggio' };

const CALENDARIO = '\uD83D\uDCC6';
const OMINO_CASCO = '\uD83D\uDC77';
const BLOCCO = '\uD83D\uDCDD';
const ROSSO = '\uD83D\uDD34';
const SOLE = '\u2600\uFE0F';
const SPUNTA = '\u2705';
const CROCE = '\u2716\uFE0F';
const ATTENZIONE = '\u26A0\uFE0F';
const CESTINO = '\uD83D\uDDD1\uFE0F';
const CLESSIDRA = '\u23F3';

type Tecnico = { id: number; nome: string; attivo?: boolean };
type Giorno = { data: string; parte: 'G' | 'M' | 'P' };
type EventoCal = { id: string; titolo: string; tutto_giorno: boolean; inizio: string; fine: string };
type Riga = {
    id: number; evento_id: string; firma: string; titolo: string; tutto_giorno: boolean;
    inizio: string; fine: string; data_inizio: string; data_fine: string;
    tecnico_ids: number[]; tecnici_nomi: string; giorni: Giorno[]; stato: string; nota?: string | null;
    telegram_msg_id?: number | null;
};

function risposta(dati: unknown, stato = 200): Response {
    return new Response(JSON.stringify(dati), { status: stato, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

function esc(testo: unknown): string {
    return String(testo ?? '').slice(0, 300).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---------- Date (tutto in ora italiana, come stringhe) ----------
function giornoCorto(iso: string): string {
    const p = iso.split('-').map(Number);
    const d = new Date(Date.UTC(p[0], p[1] - 1, p[2], 12));
    return GIORNI_CORTI[d.getUTCDay()] + ' ' + p[2] + ' ' + MESI_CORTI[p[1] - 1];
}

function piuGiorni(iso: string, n: number): string {
    const p = iso.split('-').map(Number);
    const d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n, 12));
    return d.toISOString().slice(0, 10);
}

function eDomenica(iso: string): boolean {
    const p = iso.split('-').map(Number);
    return new Date(Date.UTC(p[0], p[1] - 1, p[2], 12)).getUTCDay() === 0;
}

function dataDi(valore: string): string {
    return String(valore || '').slice(0, 10);
}

function minutiDi(valore: string): number {
    const m = String(valore || '').match(/T(\d{2}):(\d{2})/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

// ---------- Lettura del titolo ----------
function normalizza(testo: string): string {
    return String(testo || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036F]/g, '');
}

function parole(testo: string): string[] {
    return normalizza(testo).split(/[^a-z0-9]+/).filter(Boolean);
}

function trovaTecnici(titolo: string, tecnici: Tecnico[]): { trovati: Tecnico[]; ambigui: string[] } {
    const elenco = parole(titolo);
    const w = new Set(elenco);
    const tutteParti = new Set<string>();
    tecnici.forEach((t) => parole(t.nome).forEach((p) => tutteParti.add(p)));
    // "paolo rossi": accanto al nome c'e' una parola che non e' comune, non e' un numero
    // e non fa parte del nome di un tecnico -> probabilmente il cognome di un'altra persona
    const cognomeEstraneo = (parola: string) => {
        for (let i = 0; i < elenco.length; i++) {
            if (elenco[i] !== parola) continue;
            for (const vicino of [elenco[i - 1], elenco[i + 1]]) {
                if (vicino && !/^\d+$/.test(vicino) && !PAROLE_COMUNI.includes(vicino) && !tutteParti.has(vicino)) return true;
            }
        }
        return false;
    };
    const nomeParti = (t: Tecnico) => parole(t.nome).filter((p) => p.length >= 2);
    const trovati = new Map<number, Tecnico>();

    // 1. Nome e cognome (in qualsiasi ordine)
    tecnici.forEach((t) => {
        const parti = nomeParti(t);
        if (parti.length && parti.every((p) => w.has(p))) trovati.set(t.id, t);
    });

    // 2. Solo nome o solo cognome, se e' di UN solo tecnico
    const ambigui: string[] = [];
    w.forEach((parola) => {
        const proprietari = tecnici.filter((t) => nomeParti(t).includes(parola));
        if (proprietari.length && cognomeEstraneo(parola)) return;   // altra persona con lo stesso nome
        if (proprietari.length === 1) {
            trovati.set(proprietari[0].id, proprietari[0]);
        } else if (proprietari.length > 1 && !proprietari.some((t) => trovati.has(t.id))) {
            ambigui.push('"' + parola + '" = ' + proprietari.map((t) => t.nome).join(' / '));
        }
    });
    return { trovati: Array.from(trovati.values()), ambigui };
}

function giorniAssenza(ev: EventoCal): Giorno[] {
    const giorni: Giorno[] = [];
    const aggiungi = (data: string, parte: 'G' | 'M' | 'P') => {
        if (!eDomenica(data)) giorni.push({ data, parte });
    };

    if (ev.tutto_giorno) {
        // fine = giorno DOPO l'ultimo (come in Google Calendar)
        const ultimo = piuGiorni(dataDi(ev.fine), -1);
        for (let d = dataDi(ev.inizio); d <= ultimo && giorni.length < 62; d = piuGiorni(d, 1)) aggiungi(d, 'G');
        if (dataDi(ev.fine) <= dataDi(ev.inizio)) aggiungi(dataDi(ev.inizio), 'G');
        return giorni;
    }

    // "esce ore 16" / "esce alle 10.30"
    const w = parole(ev.titolo);
    if (w.some((p) => PAROLE_USCITA.includes(p))) {
        const m = normalizza(ev.titolo).match(/\b(?:esce|esco|uscita)\b\D{0,12}?(\d{1,2})(?:\s*[.:,h]\s*(\d{2}))?/);
        let minuti = minutiDi(ev.inizio);
        if (m) {
            const ore = Number(m[1]);
            if (ore >= 0 && ore <= 23) minuti = ore * 60 + (m[2] ? Number(m[2]) : 0);
        }
        aggiungi(dataDi(ev.inizio), minuti < META_GIORNO ? 'M' : 'P');
        return giorni;
    }

    // Evento con orario (anche su piu' giorni): mezze giornate toccate dall'orario
    const primo = dataDi(ev.inizio);
    const ultimo = dataDi(ev.fine);
    for (let d = primo; d <= ultimo && giorni.length < 62; d = piuGiorni(d, 1)) {
        const da = Math.max(d === primo ? minutiDi(ev.inizio) : 0, INIZIO_GIORNO);
        const a = Math.min(d === ultimo ? minutiDi(ev.fine) : 24 * 60, FINE_GIORNO);
        if (a <= da) continue;
        const mattina = da < META_GIORNO;
        const pomeriggio = a > META_GIORNO;
        aggiungi(d, mattina && pomeriggio ? 'G' : (mattina ? 'M' : 'P'));
    }
    return giorni;
}

function descriviGiorni(giorni: Giorno[]): string {
    return giorni.map((g) => ROSSO + ' ' + giornoCorto(g.data) + ' \u00B7 ' + PARTI[g.parte]).join('\n');
}

// ---------- Database (chiave di servizio) ----------
function chiaveServizio(): string {
    return Deno.env.get('ASSENZE_SERVICE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
}

function intestazioniDb(extra: Record<string, string> = {}): Record<string, string> {
    const k = chiaveServizio();
    const h: Record<string, string> = { apikey: k, 'Content-Type': 'application/json', ...extra };
    if (k.startsWith('eyJ')) h.Authorization = 'Bearer ' + k;   // chiave vecchia (JWT)
    return h;
}

async function db(percorso: string, metodo = 'GET', corpo?: unknown, prefer?: string): Promise<any> {
    const url = Deno.env.get('SUPABASE_URL') + '/rest/v1/' + percorso;
    const res = await fetch(url, {
        method: metodo,
        headers: intestazioniDb(prefer ? { Prefer: prefer } : {}),
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const testo = await res.text();
    if (!res.ok) throw new Error(metodo + ' ' + percorso.split('?')[0] + ' (' + res.status + '): ' + testo.slice(0, 200));
    return testo ? JSON.parse(testo) : null;
}

// ---------- Telegram ----------
async function telegram(metodo: string, dati: Record<string, unknown>): Promise<any> {
    const token = Deno.env.get('TELEGRAM_BOT_TOKEN_INTERVENTI');
    if (!token) throw new Error('Manca il secret TELEGRAM_BOT_TOKEN_INTERVENTI');
    const res = await fetch('https://api.telegram.org/bot' + token + '/' + metodo, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dati),
    });
    const j = await res.json().catch(() => ({}));
    if (!j.ok) console.log('Telegram ' + metodo + ':', j.description || res.status);
    return j;
}

function chatAssenze(): string {
    return Deno.env.get('ASSENZE_CHAT_ID') || '';
}

function riassuntoParti(giorni: Giorno[]): string {
    const parti = Array.from(new Set(giorni.map((g) => g.parte)));
    return parti.length === 1 ? PARTI[parti[0]] : 'come scritto sopra';
}

function pulsantiProposta(id: number, giorni: Giorno[]) {
    return { inline_keyboard: [
        [{ text: SPUNTA + ' Come proposto (' + riassuntoParti(giorni) + ')', callback_data: 'si:' + id }],
        [
            { text: '\uD83C\uDF05 Solo mattina', callback_data: 'gm:' + id },
            { text: '\uD83C\uDF07 Solo pomeriggio', callback_data: 'gp:' + id },
        ],
        [
            { text: ROSSO + ' Giornata intera', callback_data: 'gg:' + id },
            { text: CROCE + ' No, non colorare', callback_data: 'no:' + id },
        ],
    ] };
}

function testoRiga(r: Riga, intestazione: string): string {
    let t = CALENDARIO + ' <b>' + intestazione + '</b>\n\n';
    t += BLOCCO + ' "' + esc(r.titolo) + '"\n';
    if (r.tecnici_nomi) t += OMINO_CASCO + ' <b>' + esc(r.tecnici_nomi) + '</b>\n';
    if (r.giorni.length) t += descriviGiorni(r.giorni) + '\n';
    if (r.nota) t += '\n<i>' + esc(r.nota) + '</i>\n';
    return t;
}

function intestazioneProposta(modificato: boolean): string {
    return modificato ? 'ASSENZA MODIFICATA IN CALENDARIO' : 'ASSENZA IN CALENDARIO';
}

// ---------- Colorazione del planning ----------
function caselle(r: Riga) {
    const out: { tecnico_id: number; data: string; turno: string; posizione: number }[] = [];
    r.tecnico_ids.forEach((tid) => r.giorni.forEach((g) => {
        const turni = g.parte === 'G' ? ['M', 'P'] : [g.parte];
        turni.forEach((turno) => {
            for (let pos = 1; pos <= 4; pos++) out.push({ tecnico_id: tid, data: g.data, turno, posizione: pos });
        });
    }));
    return out;
}

async function coloraRosso(r: Riga) {
    const adesso = new Date().toISOString();
    const righe = caselle(r).map((c) => ({ ...c, colore: 'ROSSO', updated_at: adesso, updated_by: 'CALENDARIO' }));
    if (!righe.length) return;
    // merge-duplicates: aggiorna SOLO le colonne passate (il testo delle righe resta)
    await db('interventi?on_conflict=tecnico_id,data,turno,posizione', 'POST', righe, 'return=minimal,resolution=merge-duplicates');
}

async function togliRosso(r: Riga) {
    for (const tid of r.tecnico_ids) {
        for (const g of r.giorni) {
            const turni = g.parte === 'G' ? ['M', 'P'] : [g.parte];
            for (const turno of turni) {
                const filtro = 'tecnico_id=eq.' + tid + '&data=eq.' + g.data + '&turno=eq.' + turno + '&colore=eq.ROSSO';
                await db('interventi?' + filtro, 'PATCH', { colore: null, updated_by: 'CALENDARIO' }, 'return=minimal');
                // righe rimaste vuote (solo colore): si cancellano
                await db('interventi?tecnico_id=eq.' + tid + '&data=eq.' + g.data + '&turno=eq.' + turno +
                    '&ora=is.null&tipo=is.null&esito=is.null&cliente=is.null&colore=is.null', 'DELETE', undefined, 'return=minimal');
            }
        }
    }
}

// ============================================================
// 1. CHIAMATA DALLO SCRIPT GOOGLE
// ============================================================
async function controlla(corpo: { eventi?: EventoCal[]; oggi?: string; fino?: string; mattina?: boolean }) {
    const oggi = String(corpo.oggi || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const fino = String(corpo.fino || piuGiorni(oggi, 60)).slice(0, 10);
    const eventi = Array.isArray(corpo.eventi) ? corpo.eventi : [];
    const chat = chatAssenze();
    if (!chat) throw new Error('Manca il secret ASSENZE_CHAT_ID');

    const tecnici: Tecnico[] = await db('tecnici?select=id,nome,attivo&attivo=eq.true&order=ordine');
    const noti: Riga[] = await db('assenze_eventi?select=*&data_fine=gte.' + oggi);
    const perEvento = new Map(noti.map((r) => [r.evento_id, r]));
    const visti = new Set<string>();
    let messaggi = 0;
    const errori: string[] = [];
    const riepilogo: string[] = [];   // cosa ha capito di ogni evento (si vede nel log dello script)

    for (const ev of eventi) {
        if (!ev || !ev.id) continue;
        visti.add(ev.id);
        if (!parole(ev.titolo).some((p) => PAROLE_ASSENZA.includes(p))) {           // non e' un'assenza
            riepilogo.push('"' + ev.titolo + '": ignorato (nessuna parola di assenza)');
            continue;
        }

        const firma = [ev.titolo, ev.inizio, ev.fine, ev.tutto_giorno ? 'G' : ''].join('|');
        const prima = perEvento.get(ev.id);
        if (prima && prima.firma === firma) {                                         // gia' visto, uguale
            riepilogo.push('"' + ev.titolo + '": gi\u00E0 gestito (' + prima.stato + ')');
            continue;
        }

        const { trovati, ambigui } = trovaTecnici(ev.titolo, tecnici);
        const giorni = giorniAssenza(ev);
        let stato = 'PROPOSTA';
        let nota: string | null = null;
        let avvisa = true;     // false = salvo l'evento ma non mando messaggi
        if (!trovati.length) {
            stato = 'NON_RICONOSCIUTO';
            if (ambigui.length) {
                nota = 'Pi\u00F9 tecnici possibili (' + ambigui.join('; ') + '): scrivi nome e cognome nel calendario.';
            } else {
                avvisa = false;   // non e' un tecnico: niente messaggi
            }
        } else if (!giorni.length) {
            stato = 'NON_RICONOSCIUTO';
            avvisa = false;       // fuori orario 8-19 o di domenica: niente da colorare
        }
        if (prima && prima.stato === 'COLORATO') {
            nota = (nota ? nota + ' ' : '') + 'La versione precedente era gi\u00E0 colorata: se le date sono cambiate togli il rosso vecchio dall\'app.';
        }

        const dati = {
            evento_id: ev.id, firma, titolo: ev.titolo, tutto_giorno: !!ev.tutto_giorno,
            inizio: ev.inizio, fine: ev.fine,
            data_inizio: dataDi(ev.inizio),
            data_fine: ev.tutto_giorno ? piuGiorni(dataDi(ev.fine), -1) : dataDi(ev.fine),
            tecnico_ids: trovati.map((t) => t.id),
            tecnici_nomi: trovati.map((t) => t.nome).join(', '),
            giorni, stato, nota, updated_at: new Date().toISOString(),
        };
        if (dati.data_fine < dati.data_inizio) dati.data_fine = dati.data_inizio;
        const salvate: Riga[] = await db('assenze_eventi?on_conflict=evento_id', 'POST', dati,
            'return=representation,resolution=merge-duplicates');
        const riga = salvate[0];
        riepilogo.push('"' + ev.titolo + '": ' + stato + (dati.tecnici_nomi ? ' - ' + dati.tecnici_nomi : '') +
            (avvisa ? '' : ' (nessun messaggio: non \u00E8 un tecnico)'));
        if (!avvisa) continue;

        const titolo = stato === 'NON_RICONOSCIUTO'
            ? 'ASSENZA IN CALENDARIO - DA CONTROLLARE'
            : intestazioneProposta(!!prima);
        const testo = testoRiga(riga, titolo) + (stato === 'PROPOSTA' ? '\nCosa coloro di rosso nel planning?' : '');
        const inviato = await telegram('sendMessage', {
            chat_id: chat, text: (stato === 'NON_RICONOSCIUTO' ? ATTENZIONE + ' ' : '') + testo, parse_mode: 'HTML',
            ...(stato === 'PROPOSTA' ? { reply_markup: pulsantiProposta(riga.id, riga.giorni) } : {}),
        });
        if (inviato.ok) {
            messaggi++;
            await db('assenze_eventi?id=eq.' + riga.id, 'PATCH', { telegram_msg_id: inviato.result.message_id }, 'return=minimal');
        } else {
            // Invio fallito: tolgo la "firma" cosi' al prossimo giro ci riprova
            errori.push('Telegram: ' + (inviato.description || 'errore') + ' (chat ' + chat + ')');
            await db('assenze_eventi?id=eq.' + riga.id, 'PATCH', { firma: 'DA_RIMANDARE' }, 'return=minimal');
        }
    }

    // Eventi spariti dal calendario (solo quelli che lo script poteva vedere)
    for (const r of noti) {
        if (visti.has(r.evento_id) || r.stato === 'CANCELLATO' || r.data_inizio > fino) continue;
        const coloratoPrima = r.stato === 'COLORATO';
        await db('assenze_eventi?id=eq.' + r.id, 'PATCH',
            { stato: 'CANCELLATO', updated_at: new Date().toISOString() }, 'return=minimal');
        if (r.stato === 'NON_RICONOSCIUTO') continue;
        const testo = CESTINO + ' <b>ASSENZA TOLTA DAL CALENDARIO</b>\n\n' +
            BLOCCO + ' "' + esc(r.titolo) + '"\n' +
            (r.tecnici_nomi ? OMINO_CASCO + ' <b>' + esc(r.tecnici_nomi) + '</b>\n' : '') +
            descriviGiorni(r.giorni) + '\n' +
            (coloratoPrima ? '\nNel planning queste righe sono rosse: vuoi togliere il rosso?' : '');
        await telegram('sendMessage', {
            chat_id: chat, text: testo, parse_mode: 'HTML',
            ...(coloratoPrima ? { reply_markup: { inline_keyboard: [[
                { text: CESTINO + ' Togli il rosso', callback_data: 'tr:' + r.id },
                { text: CROCE + ' Lascia', callback_data: 'lr:' + r.id },
            ]] } } : {}),
        });
        messaggi++;
    }

    // Resoconto delle 7:00
    if (corpo.mattina && !eDomenica(oggi)) {
        const tutte: Riga[] = await db('assenze_eventi?select=*&data_inizio=lte.' + oggi + '&data_fine=gte.' + oggi +
            '&stato=in.(PROPOSTA,COLORATO,RIFIUTATO)&order=id');
        const righe: string[] = [];
        tutte.forEach((r) => {
            r.giorni.filter((g) => g.data === oggi).forEach((g) => {
                const stato = r.stato === 'COLORATO' ? SPUNTA + ' colorato'
                    : r.stato === 'PROPOSTA' ? CLESSIDRA + ' da confermare (messaggio sopra)' : CROCE + ' non colorato';
                righe.push('\u2022 <b>' + esc(r.tecnici_nomi) + '</b> \u00B7 ' + PARTI[g.parte] + '\n   "' + esc(r.titolo) + '" \u00B7 ' + stato);
            });
        });
        if (righe.length) {
            await telegram('sendMessage', {
                chat_id: chat, parse_mode: 'HTML',
                text: SOLE + ' <b>ASSENZE DI OGGI</b> \u00B7 ' + giornoCorto(oggi) + '\n\n' + righe.join('\n'),
            });
            messaggi++;
        }
    }

    return { ok: errori.length === 0, eventi: eventi.length, messaggi, errore: errori[0], riepilogo };
}

// ============================================================
// 2. CHIAMATA DA TELEGRAM (pulsanti)
// ============================================================
async function gestisciTelegram(update: any) {
    // "/id" (o "/start"): risponde con il chat id, serve per configurare ASSENZE_CHAT_ID
    const msg = update.message;
    if (msg && typeof msg.text === 'string' && /^\/(id|start)\b/.test(msg.text)) {
        await telegram('sendMessage', {
            chat_id: msg.chat.id,
            text: 'Chat id di questa chat: ' + msg.chat.id + '\n(da mettere nel secret ASSENZE_CHAT_ID se e\' la chat delle assenze)',
        });
        return;
    }

    const cb = update.callback_query;
    if (!cb) return;
    const rispondi = (testo: string) => telegram('answerCallbackQuery', { callback_query_id: cb.id, text: testo });

    if (String(cb.message?.chat?.id) !== String(chatAssenze())) {
        await rispondi('Non autorizzato');
        return;
    }
    const m = String(cb.data || '').match(/^(si|gm|gp|gg|no|tr|lr):(\d+)$/);
    if (!m) { await rispondi('Comando non valido'); return; }
    const [, azione, id] = m;
    const trovate: Riga[] = await db('assenze_eventi?select=*&id=eq.' + id);
    const r = trovate[0];
    if (!r) { await rispondi('Assenza non trovata'); return; }

    const modifica = (testo: string) => telegram('editMessageText', {
        chat_id: cb.message.chat.id, message_id: cb.message.message_id, text: testo, parse_mode: 'HTML',
    });
    const chi = cb.from?.first_name ? ' (' + esc(cb.from.first_name) + ')' : '';

    if (azione === 'si' || azione === 'gm' || azione === 'gp' || azione === 'gg') {
        if (r.stato === 'CANCELLATO') { await rispondi('Evento tolto dal calendario'); return; }
        if (r.stato === 'COLORATO') { await rispondi('Gi\u00E0 colorato'); return; }
        // Scelta diversa dalla proposta: stessa data, parte scelta con il pulsante
        const parte = azione === 'gm' ? 'M' : azione === 'gp' ? 'P' : azione === 'gg' ? 'G' : null;
        if (parte) r.giorni = r.giorni.map((g) => ({ data: g.data, parte: parte as 'G' | 'M' | 'P' }));
        await coloraRosso(r);
        await db('assenze_eventi?id=eq.' + r.id, 'PATCH',
            { stato: 'COLORATO', giorni: r.giorni, updated_at: new Date().toISOString() }, 'return=minimal');
        await modifica(testoRiga(r, intestazioneProposta(false)) + '\n' + SPUNTA + ' <b>Colorato di rosso nel planning</b>' +
            (parte ? ' (' + PARTI[parte] + ')' : '') + chi);
        await rispondi('Colorato!');
    } else if (azione === 'no') {
        await db('assenze_eventi?id=eq.' + r.id, 'PATCH', { stato: 'RIFIUTATO', updated_at: new Date().toISOString() }, 'return=minimal');
        await modifica(testoRiga(r, intestazioneProposta(false)) + '\n' + CROCE + ' <b>Non colorato</b>' + chi);
        await rispondi('Ok, non coloro');
    } else if (azione === 'tr') {
        await togliRosso(r);
        await modifica(CESTINO + ' <b>ASSENZA TOLTA DAL CALENDARIO</b>\n\n' + BLOCCO + ' "' + esc(r.titolo) + '"\n' +
            OMINO_CASCO + ' <b>' + esc(r.tecnici_nomi) + '</b>\n' + descriviGiorni(r.giorni) + '\n\n' +
            SPUNTA + ' <b>Rosso tolto dal planning</b>' + chi);
        await rispondi('Rosso tolto');
    } else {
        await modifica(CESTINO + ' <b>ASSENZA TOLTA DAL CALENDARIO</b>\n\n' + BLOCCO + ' "' + esc(r.titolo) + '"\n' +
            OMINO_CASCO + ' <b>' + esc(r.tecnici_nomi) + '</b>\n' + descriviGiorni(r.giorni) + '\n\n' +
            CROCE + ' <b>Rosso lasciato nel planning</b>' + chi);
        await rispondi('Ok, lascio il rosso');
    }
}

// ============================================================
Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return risposta({ ok: false, errore: 'Metodo non consentito' }, 405);

    // Telegram manda l'intestazione segreta impostata con setWebhook
    const segretoTelegram = req.headers.get('X-Telegram-Bot-Api-Secret-Token');
    if (segretoTelegram !== null) {
        if (!Deno.env.get('ASSENZE_WEBHOOK_SECRET') || segretoTelegram !== Deno.env.get('ASSENZE_WEBHOOK_SECRET')) {
            return risposta({ ok: false }, 401);
        }
        try {
            await gestisciTelegram(await req.json());
        } catch (err) {
            console.log('Errore pulsante Telegram:', err);
        }
        return risposta({ ok: true });   // a Telegram si risponde sempre 200
    }

    // Script Google: deve conoscere la chiave segreta
    let corpo: any = {};
    try {
        corpo = await req.json();
    } catch (_) {
        return risposta({ ok: false, errore: 'Richiesta non valida' }, 400);
    }
    const chiave = Deno.env.get('ASSENZE_SCRIPT_KEY');
    if (!chiave || corpo.chiave !== chiave) return risposta({ ok: false, errore: 'Chiave non valida' }, 401);
    if (!chiaveServizio()) return risposta({ ok: false, errore: 'Manca la chiave di servizio (ASSENZE_SERVICE_KEY)' }, 500);

    try {
        if (corpo.azione === 'prova') {
            const r = await telegram('sendMessage', {
                chat_id: chatAssenze(),
                text: '\uD83E\uDDEA Prova: lo script del calendario comunica con AGRIMAG. Gli avvisi delle assenze arriveranno qui.',
            });
            return risposta({ ok: !!r.ok, errore: r.ok ? undefined : 'Telegram: ' + (r.description || 'errore') });
        }
        return risposta(await controlla(corpo));
    } catch (err) {
        return risposta({ ok: false, errore: String((err as Error)?.message || err) }, 500);
    }
});
