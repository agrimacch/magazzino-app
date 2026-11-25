// ============================================================
// AGRIDESK - Edge Function "rapportini-drive" (v8.1.0)
// ------------------------------------------------------------
// Copia SEPARATA di "buoni-drive" (che non viene toccata): fa da ponte
// tra l'app e lo script Google dei RAPPORTINI DI INTERVENTO:
// 1. controlla che chi chiede abbia fatto il login e possa usare
//    il magazzino dei furgoni (funzione mezzi_puo_usare(): admin, operatori e tecnici - v8.5.0)
// 2. manda allo script Google il PDF del rapportino (o la richiesta di
//    prova / cestino) aggiungendo la chiave segreta
//    (la chiave resta qui su Supabase, non e' mai nell'app)
// 3. restituisce all'app il link del file su Drive
//
// Secrets da impostare su Supabase (Edge Functions > Secrets):
//   RAPPORTINI_SCRIPT_URL = indirizzo dello script Google dei rapportini (finisce con /exec)
//   RAPPORTINI_SCRIPT_KEY = la stessa CHIAVE_SEGRETA scritta nello script
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

    // 1. Utente collegato e autorizzato?
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

    // v8.5.0: i rapportini li salvano anche operatori e tecnici (mezzi_puo_usare, script mezzi-ruoli.sql).
    // Se lo script non e' ancora stato eseguito la funzione non c'e': resta il controllo di prima (mezzi_puo_gestire).
    const chiedi = async (funzione: string) => {
        const res = await fetch(supabaseUrl + '/rest/v1/rpc/' + funzione, {
            method: 'POST',
            headers: { Authorization: auth, apikey: apikey, 'Content-Type': 'application/json' },
            body: '{}',
        });
        return res.ok ? await res.json() : null;
    };
    let permesso = await chiedi('mezzi_puo_usare');
    if (permesso === null) permesso = await chiedi('mezzi_puo_gestire');
    if (permesso !== true) return risposta({ ok: false, errore: 'Non hai i permessi per i rapportini' }, 403);

    // 2. Configurazione
    const scriptUrl = Deno.env.get('RAPPORTINI_SCRIPT_URL');
    const scriptKey = Deno.env.get('RAPPORTINI_SCRIPT_KEY');
    if (!scriptUrl || !scriptKey) {
        return risposta({ ok: false, errore: 'Mancano i secrets RAPPORTINI_SCRIPT_URL e/o RAPPORTINI_SCRIPT_KEY su Supabase' }, 500);
    }

    let corpo: Record<string, unknown> = {};
    try {
        corpo = await req.json();
    } catch (_) {
        return risposta({ ok: false, errore: 'Richiesta non leggibile' }, 400);
    }
    const azione = String(corpo.azione || '');
    if (['salva', 'prova', 'cestina'].indexOf(azione) === -1) {
        return risposta({ ok: false, errore: 'Azione non valida' }, 400);
    }

    // 3. Inoltro allo script Google
    let testo = '';
    try {
        const res = await fetch(scriptUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ ...corpo, key: scriptKey }),
            redirect: 'follow',
        });
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
        return risposta({
            ok: false,
            errore: 'Lo script Google non ha risposto correttamente (controlla che sia pubblicato come App web, Esegui come: Me, accesso "Chiunque")',
        }, 502);
    }
    return risposta(dati, dati.ok ? 200 : 500);
});
