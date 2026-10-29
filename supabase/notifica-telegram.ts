// ============================================================
// AGRIMAG - Edge Function "notifica-telegram" (v5.0.0)
// ------------------------------------------------------------
// Manda su Telegram la notifica di una modifica al listino
// o di un articolo di magazzino sotto soglia / esaurito (promemoria ordini).
// L'app la chiama subito dopo aver salvato una riga nella tabella
// listino_notifiche, passando solo l'id: il testo viene riletto
// qui dal database, con i permessi dell'utente collegato.
// Chi non ha fatto il login non legge nulla, quindi non manda nulla.
//
// Secrets da impostare su Supabase (Edge Functions > Secrets):
//   TELEGRAM_BOT_TOKEN  = token del bot (da @BotFather)
//   TELEGRAM_CHAT_ID    = id del gruppo (numero negativo, es. -1001234567890)
//
// Impostazione da fare nella funzione: "Verify JWT" SPENTO
// (il controllo dell'utente lo fa la funzione stessa, sotto).
// ============================================================

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Emoji scritte come codici (niente caratteri speciali nel file)
const ICONE: Record<string, string> = {
    MODIFICA: '\u270F\uFE0F',
    NUOVO: '\u2795',
    CANCELLATO: '\uD83D\uDDD1\uFE0F',
    RIPRISTINATO: '\u267B\uFE0F',
    IMPORT: '\uD83D\uDCC2',
    PROVA: '\uD83E\uDDEA',
    SOTTOSOGLIA_CONSUMABILI: '\u26A0\uFE0F',
    ESAURITO_CONSUMABILI: '\uD83D\uDEAB',
    ESAURITO_RICAMBI: '\uD83D\uDEAB',
};

// Intestazione del messaggio: magazzino (promemoria ordini) o listino vendite
const TIPI_MAGAZZINO: Record<string, string> = {
    SOTTOSOGLIA_CONSUMABILI: 'SOTTO SOGLIA - da ordinare',
    ESAURITO_CONSUMABILI: 'ESAURITO - da ordinare',
    ESAURITO_RICAMBI: 'RICAMBIO ESAURITO - da ordinare',
};
const PACCO = '\uD83D\uDCE6';
const CAMPANELLA = '\uD83D\uDD14';
const OMINO = '\uD83D\uDC64';
const MAX_RIGHE = 25;

function risposta(dati: unknown, stato = 200): Response {
    return new Response(JSON.stringify(dati), {
        status: stato,
        headers: { ...CORS, 'Content-Type': 'application/json' },
    });
}

function esc(testo: unknown): string {
    return String(testo ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function dataItaliana(iso: string): string {
    try {
        return new Date(iso).toLocaleString('it-IT', {
            timeZone: 'Europe/Rome',
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });
    } catch (_) {
        return iso;
    }
}

type Riga = { e?: string; v?: string; n?: boolean } | string;

function testoMessaggio(n: {
    tipo: string; titolo: string; righe: Riga[]; utente: string;
    utente_nome?: string | null; created_at: string;
}): string {
    const icona = ICONE[n.tipo] || CAMPANELLA;
    const righe = Array.isArray(n.righe) ? n.righe : [];
    const magazzino = TIPI_MAGAZZINO[n.tipo];
    let msg = magazzino
        ? PACCO + ' <b>AGRIMAG - Magazzino</b>\n' + icona + ' <b>' + esc(magazzino) + '</b>\n'
        : CAMPANELLA + ' <b>AGRIMAG - Listino vendite</b>\n';
    msg += (magazzino ? '' : icona + ' ') + '<b>' + esc(n.titolo) + '</b>\n';

    righe.slice(0, MAX_RIGHE).forEach((r) => {
        if (typeof r === 'string') {
            msg += '\u2022 ' + esc(r) + '\n';
        } else {
            msg += '\u2022 ' + (r.e ? esc(r.e) : '') + (r.e && r.v ? ': ' : '') + (r.v ? '<b>' + esc(r.v) + '</b>' : '') + '\n';
        }
    });
    if (righe.length > MAX_RIGHE) {
        msg += '<i>... e altre ' + (righe.length - MAX_RIGHE) + ' righe (dettagli nell\'app)</i>\n';
    }

    const chi = n.utente_nome ? n.utente_nome + ' (' + n.utente + ')' : n.utente;
    msg += '\n' + OMINO + ' ' + esc(chi) + ' \u00B7 ' + esc(dataItaliana(n.created_at));

    // Limite di Telegram: 4096 caratteri
    if (msg.length > 4000) msg = msg.slice(0, 3990) + '\n...';
    return msg;
}

async function inviaTelegram(testo: string): Promise<{ ok: boolean; errore?: string }> {
    const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const chatId = Deno.env.get('TELEGRAM_CHAT_ID');
    if (!token || !chatId) {
        return { ok: false, errore: 'Mancano i secrets TELEGRAM_BOT_TOKEN e/o TELEGRAM_CHAT_ID su Supabase' };
    }
    const res = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            text: testo,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
        }),
    });
    const dati = await res.json().catch(() => ({}));
    if (!res.ok || !dati.ok) {
        return { ok: false, errore: 'Telegram ha risposto: ' + (dati.description || res.status) };
    }
    return { ok: true };
}

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return risposta({ ok: false, errore: 'Metodo non consentito' }, 405);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const auth = req.headers.get('Authorization') || '';
    const apikey = req.headers.get('apikey') || Deno.env.get('SUPABASE_ANON_KEY') || '';
    if (!supabaseUrl || !auth || !apikey) {
        return risposta({ ok: false, errore: 'Richiesta non autorizzata' }, 401);
    }
    const intestazioni = { Authorization: auth, apikey: apikey };

    let corpo: { id?: number; prova?: boolean } = {};
    try {
        corpo = await req.json();
    } catch (_) {
        return risposta({ ok: false, errore: 'Richiesta non valida' }, 400);
    }

    // ---- Messaggio di prova (pulsante nell'app) ----
    if (corpo.prova) {
        const utenteRes = await fetch(supabaseUrl + '/auth/v1/user', { headers: intestazioni });
        if (!utenteRes.ok) return risposta({ ok: false, errore: 'Utente non collegato' }, 401);
        const utente = await utenteRes.json();
        const esito = await inviaTelegram(testoMessaggio({
            tipo: 'PROVA',
            titolo: 'Messaggio di prova',
            righe: [{ e: 'Se leggi questo messaggio, le notifiche del listino funzionano' }],
            utente: utente.email || 'utente',
            created_at: new Date().toISOString(),
        }));
        return risposta(esito, esito.ok ? 200 : 500);
    }

    // ---- Notifica vera: rilegge la riga con i permessi dell'utente ----
    const id = Number(corpo.id);
    if (!Number.isFinite(id) || id <= 0) return risposta({ ok: false, errore: 'Id mancante' }, 400);

    const letturaRes = await fetch(
        supabaseUrl + '/rest/v1/listino_notifiche?id=eq.' + id + '&select=*',
        { headers: intestazioni },
    );
    if (!letturaRes.ok) {
        return risposta({ ok: false, errore: 'Lettura notifica non riuscita (' + letturaRes.status + ')' }, 401);
    }
    const trovate = await letturaRes.json();
    if (!Array.isArray(trovate) || trovate.length === 0) {
        return risposta({ ok: false, errore: 'Notifica non trovata' }, 404);
    }

    const esito = await inviaTelegram(testoMessaggio(trovate[0]));
    return risposta(esito, esito.ok ? 200 : 500);
});
