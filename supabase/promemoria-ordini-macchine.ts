// ============================================================
// AGRIDESK - Edge Function "promemoria-ordini-macchine"
// ------------------------------------------------------------
// Promemoria delle 19 (dal lunedi' al sabato) nel gruppo Telegram "Ordini Macchine":
// i MARCHI che hanno macchine da ordinare (macchine DA ORDINARE degli ordini clienti,
// cioe' le righe del libro Ordini Macchine senza data e iniziali).
// Se non c'e' niente da ordinare non manda nessun messaggio.
//
// Funzione NUOVA e separata: non tocca notifica-telegram, notifica-interventi,
// organizzazione-interventi. La chiama lo script Google google/ordini-macchine.gs.
//
// Secrets (Edge Functions > Secrets):
//   TELEGRAM_BOT_TOKEN = token del bot (lo stesso delle notifiche del listino: c'e' gia')
//   OM_CHAT_ID         = id del gruppo "Ordini Macchine" (numero negativo, col meno)
//   OM_SCRIPT_KEY      = parola segreta, la stessa scritta nello script Google
//                        (se non c'e' vale ORG_SCRIPT_KEY, quella dell'organizzazione interventi)
//   chiave di servizio = OM_SERVICE_KEY, altrimenti ORG_SERVICE_KEY (c'e' gia'), altrimenti quella di Supabase
// Impostazione: "Verify JWT" SPENTO (la chiave la controlla la funzione).
// ============================================================

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const GIORNI_CORTI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];

function risposta(dati: unknown, stato = 200): Response {
    return new Response(JSON.stringify(dati), { status: stato, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

function esc(v: unknown): string {
    return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function chiaveServizio(): string {
    return Deno.env.get('OM_SERVICE_KEY') || Deno.env.get('ORG_SERVICE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
}

function chiaveScript(): string {
    return (Deno.env.get('OM_SCRIPT_KEY') || Deno.env.get('ORG_SCRIPT_KEY') || '').trim();
}

async function db(percorso: string): Promise<any> {
    const k = chiaveServizio();
    const h: Record<string, string> = { apikey: k };
    if (k.startsWith('eyJ')) h.Authorization = 'Bearer ' + k;
    const res = await fetch(Deno.env.get('SUPABASE_URL') + '/rest/v1/' + percorso, { headers: h });
    const testo = await res.text();
    if (!res.ok) throw new Error(percorso.split('?')[0] + ' (' + res.status + '): ' + testo.slice(0, 200));
    return testo ? JSON.parse(testo) : null;
}

// Tutte le righe (a blocchi di 1000)
async function dbTutto(percorso: string): Promise<any[]> {
    let tutti: any[] = [];
    for (let da = 0; ; da += 1000) {
        const sep = percorso.includes('?') ? '&' : '?';
        const blocco = await db(percorso + sep + 'order=id.asc&offset=' + da + '&limit=1000');
        tutti = tutti.concat(blocco || []);
        if (!blocco || blocco.length < 1000) break;
    }
    return tutti;
}

async function telegram(metodo: string, dati: Record<string, unknown>): Promise<any> {
    const token = (Deno.env.get('TELEGRAM_BOT_TOKEN') || '').trim();
    if (!token) return { ok: false, description: 'Manca il secret TELEGRAM_BOT_TOKEN' };
    const res = await fetch('https://api.telegram.org/bot' + token + '/' + metodo, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dati),
    });
    return await res.json().catch(() => ({ ok: false, description: 'risposta non valida' }));
}

function oggiRoma(): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

// Marchi con macchine da ordinare: [{ marchio, macchine, modelli }]
async function daOrdinare(): Promise<{ marchio: string; macchine: number; modelli: number }[]> {
    const pezzi: { id: number; articolo_id: number }[] = await dbTutto('macchine_pezzi?select=id,articolo_id&stato=eq.DA_ORDINARE');
    if (!pezzi.length) return [];
    const ids = [...new Set(pezzi.map((p) => p.articolo_id))];
    const articoli: { id: number; marchio: string | null }[] = [];
    for (let i = 0; i < ids.length; i += 150) {
        const blocco = await db('listino_articoli?select=id,marchio&id=in.(' + ids.slice(i, i + 150).join(',') + ')');
        articoli.push(...(blocco || []));
    }
    const marchioDi = (id: number) => articoli.find((a) => a.id === id)?.marchio || 'SENZA MARCHIO';
    const per: Record<string, { macchine: number; modelli: Set<number> }> = {};
    pezzi.forEach((p) => {
        const m = marchioDi(p.articolo_id);
        if (!per[m]) per[m] = { macchine: 0, modelli: new Set() };
        per[m].macchine++;
        per[m].modelli.add(p.articolo_id);
    });
    return Object.keys(per).sort((a, b) => a.localeCompare(b, 'it'))
        .map((m) => ({ marchio: m, macchine: per[m].macchine, modelli: per[m].modelli.size }));
}

async function promemoria(corpo: { oggi?: string; prova?: boolean }) {
    const chat = (Deno.env.get('OM_CHAT_ID') || '').trim();
    if (!chat) throw new Error('Manca il secret OM_CHAT_ID');
    const oggi = String(corpo.oggi || oggiRoma()).slice(0, 10);
    const marchi = await daOrdinare();
    if (!marchi.length) return { ok: true, inviato: false, marchi: 0, nota: 'Niente da ordinare: nessun messaggio' };
    const p = oggi.split('-');
    const giorno = GIORNI_CORTI[new Date(Date.UTC(+p[0], +p[1] - 1, +p[2], 12)).getUTCDay()];
    const tot = marchi.reduce((t, m) => t + m.macchine, 0);
    const testo = '\u{1F6D2} <b>ORDINI MACCHINE DA FARE</b> \u00B7 ' + giorno + ' ' + p[2] + '/' + p[1] + '\n\n' +
        marchi.map((m) => '\u2022 <b>' + esc(m.marchio) + '</b> \u2014 ' + m.macchine + (m.macchine === 1 ? ' macchina' : ' macchine') +
            (m.modelli > 1 ? ' (' + m.modelli + ' modelli)' : '')).join('\n') +
        '\n\nTotale: ' + tot + (tot === 1 ? ' macchina da ordinare' : ' macchine da ordinare') +
        '\n<i>Dettagli in AGRIDESK \u2192 Ordini \u2192 Ordini Macchine</i>';
    const r = await telegram('sendMessage', { chat_id: chat, text: testo, parse_mode: 'HTML', disable_web_page_preview: true });
    if (!r.ok) {
        const nuovo = r.parameters?.migrate_to_chat_id;
        throw new Error('Telegram: ' + (r.description || 'errore') + (nuovo ? ' -> NUOVO chat id del gruppo: ' + nuovo + ' (mettilo in OM_CHAT_ID)' : ''));
    }
    return { ok: true, inviato: true, marchi: marchi.length, macchine: tot };
}

async function diagnosi(): Promise<string[]> {
    const r: string[] = [];
    const ok = (t: string) => r.push('OK  ' + t);
    const ko = (t: string) => r.push('NO  ' + t);
    if (Deno.env.get('TELEGRAM_BOT_TOKEN')) ok('TELEGRAM_BOT_TOKEN presente'); else ko('Secret TELEGRAM_BOT_TOKEN mancante');
    if (Deno.env.get('OM_SCRIPT_KEY')) ok('OM_SCRIPT_KEY presente');
    else if (Deno.env.get('ORG_SCRIPT_KEY')) ok('Chiave dello script: uso ORG_SCRIPT_KEY (quella dell\'organizzazione interventi)');
    else ko('Secret OM_SCRIPT_KEY mancante');
    if (chiaveServizio()) ok('Chiave di servizio presente'); else ko('Chiave di servizio mancante (OM_SERVICE_KEY o ORG_SERVICE_KEY)');
    const me = await telegram('getMe', {});
    if (me.ok) ok('Bot: @' + me.result.username); else ko('Bot: ' + (me.description || 'token non valido'));
    // Gruppi che il bot vede (per trovare il chat id)
    const up = await telegram('getUpdates', { limit: 100 });
    if (up.ok) {
        const chat: Record<string, string> = {};
        (up.result || []).forEach((u: any) => {
            const c = (u.message || u.my_chat_member || u.channel_post || u.edited_message || {}).chat;
            if (c && (c.type === 'group' || c.type === 'supergroup')) chat[String(c.id)] = c.title || '';
        });
        const elenco = Object.keys(chat);
        if (elenco.length) elenco.forEach((id) => r.push('    gruppo visto dal bot: "' + chat[id] + '"  chat id = ' + id));
        else r.push('    (nessun gruppo recente visto dal bot: scrivi un messaggio nel gruppo "Ordini Macchine" e riesegui la diagnosi)');
    } else {
        r.push('    getUpdates non disponibile (' + (up.description || '') + '): il chat id si legge come per gli altri gruppi');
    }
    try {
        const marchi = await daOrdinare();
        ok('Database: ' + (marchi.length ? marchi.map((m) => m.marchio + ' ' + m.macchine).join(', ') : 'niente da ordinare'));
    } catch (err) {
        ko('Database: ' + String((err as Error)?.message || err));
    }
    const chatId = (Deno.env.get('OM_CHAT_ID') || '').trim();
    if (!chatId) ko('Secret OM_CHAT_ID mancante (prendi il chat id qui sopra)');
    else {
        const prova = await telegram('sendMessage', { chat_id: chatId, text: '\u{1F9EA} Prova AGRIDESK: promemoria Ordini Macchine collegato.' });
        if (prova.ok) ok('Gruppo: messaggio di prova inviato');
        else ko('Gruppo: ' + (prova.description || 'errore') +
            (prova.parameters?.migrate_to_chat_id ? ' -> NUOVO chat id: ' + prova.parameters.migrate_to_chat_id + ' (mettilo in OM_CHAT_ID)' : ''));
    }
    return r;
}

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return risposta({ ok: false, errore: 'Metodo non consentito' }, 405);
    let corpo: any = {};
    try { corpo = await req.json(); } catch (_) { return risposta({ ok: false, errore: 'Richiesta non valida' }, 400); }
    const chiave = chiaveScript();
    if (!chiave || corpo.chiave !== chiave) return risposta({ ok: false, errore: 'Chiave non valida' }, 401);
    try {
        if (corpo.azione === 'promemoria') return risposta(await promemoria(corpo));
        if (corpo.azione === 'diagnosi') return risposta({ ok: true, riepilogo: await diagnosi() });
        return risposta({ ok: false, errore: 'Azione sconosciuta' }, 400);
    } catch (err) {
        return risposta({ ok: false, errore: String((err as Error)?.message || err) }, 500);
    }
});
