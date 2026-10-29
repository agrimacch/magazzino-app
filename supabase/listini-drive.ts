// ============================================================
// AGRIMAG - Edge Function "listini-drive" (v4.10.0)
// ------------------------------------------------------------
// Fa da ponte tra l'app e lo script Google dei listini fornitori:
// 1. controlla che chi chiede abbia fatto il login in AGRIMAG
// 2. chiede l'elenco allo script Google usando la chiave segreta
//    (la chiave resta qui su Supabase, non e' mai nell'app)
// 3. restituisce all'app fornitori, marchi e file (solo nomi e link)
//
// Secrets da impostare su Supabase (Edge Functions > Secrets):
//   DRIVE_SCRIPT_URL = indirizzo dello script Google (finisce con /exec)
//   DRIVE_SCRIPT_KEY = la stessa CHIAVE_SEGRETA scritta nello script
//
// Impostazione da fare nella funzione: "Verify JWT" SPENTO
// (il controllo dell'utente lo fa la funzione stessa, sotto).
// ============================================================

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function risposta(dati: unknown, stato = 200): Response {
    return new Response(JSON.stringify(dati), {
        status: stato,
        headers: { ...CORS, 'Content-Type': 'application/json' },
    });
}

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return risposta({ ok: false, errore: 'Metodo non consentito' }, 405);

    // 1. Utente collegato?
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const auth = req.headers.get('Authorization') || '';
    const apikey = req.headers.get('apikey') || Deno.env.get('SUPABASE_ANON_KEY') || '';
    if (!supabaseUrl || !auth || !apikey) {
        return risposta({ ok: false, errore: 'Richiesta non autorizzata' }, 401);
    }
    const utenteRes = await fetch(supabaseUrl + '/auth/v1/user', {
        headers: { Authorization: auth, apikey: apikey },
    });
    if (!utenteRes.ok) return risposta({ ok: false, errore: 'Utente non collegato' }, 401);

    // 2. Configurazione
    const scriptUrl = Deno.env.get('DRIVE_SCRIPT_URL');
    const scriptKey = Deno.env.get('DRIVE_SCRIPT_KEY');
    if (!scriptUrl || !scriptKey) {
        return risposta({ ok: false, errore: 'Mancano i secrets DRIVE_SCRIPT_URL e/o DRIVE_SCRIPT_KEY su Supabase' }, 500);
    }

    let corpo: { aggiorna?: boolean } = {};
    try {
        corpo = await req.json();
    } catch (_) {
        corpo = {};
    }

    // 3. Chiede l'elenco allo script Google
    const indirizzo = scriptUrl + (scriptUrl.indexOf('?') === -1 ? '?' : '&') +
        'key=' + encodeURIComponent(scriptKey) + (corpo.aggiorna ? '&aggiorna=1' : '');
    let testo = '';
    try {
        const res = await fetch(indirizzo, { redirect: 'follow' });
        testo = await res.text();
        if (!res.ok) {
            return risposta({ ok: false, errore: 'Lo script Google ha risposto con errore ' + res.status }, 502);
        }
    } catch (err) {
        return risposta({ ok: false, errore: 'Script Google non raggiungibile: ' + String(err) }, 502);
    }

    let dati: { ok?: boolean; errore?: string } = {};
    try {
        dati = JSON.parse(testo);
    } catch (_) {
        // Di solito: lo script non e' pubblicato come "App web" con accesso "Chiunque"
        return risposta({
            ok: false,
            errore: 'Lo script Google non ha risposto con un elenco (controlla che sia pubblicato come App web con accesso "Chiunque")',
        }, 502);
    }
    return risposta(dati, dati.ok ? 200 : 500);
});
