// ============================================================
// AGRIDESK - Edge Function "backup-dati"
// ------------------------------------------------------------
// Copia di sicurezza giornaliera: la chiama di notte lo script Google
// google/backup-drive.gs, che salva i dati su Google Drive
// (cartella BACKUP AGRIDESK / AAAA-MM-GG, un file per tabella; tiene 14 giorni).
//
// Funzione NUOVA e separata: non tocca le altre funzioni.
// Legge TUTTE le tabelle del database visibili all'app (schema public),
// anche quelle che verranno aggiunte in futuro (le trova da sola).
// NON copia: utenti e password (sono in Supabase Authentication) e file caricati nello Storage.
//
// Secrets (Edge Functions > Secrets):
//   BACKUP_SCRIPT_KEY = parola segreta NUOVA e lunga (solo per il backup), la stessa scritta nello script Google
//   chiave di servizio = BACKUP_SERVICE_KEY, altrimenti ORG_SERVICE_KEY (c'e' gia'), altrimenti quella di Supabase
// Impostazione: "Verify JWT" SPENTO (la chiave la controlla la funzione).
// ============================================================

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Righe per ogni chiamata: lo script Google chiede i blocchi uno dopo l'altro
const RIGHE_PER_BLOCCO = 5000;

function risposta(dati: unknown, stato = 200): Response {
    return new Response(JSON.stringify(dati), { status: stato, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

function chiaveServizio(): string {
    return Deno.env.get('BACKUP_SERVICE_KEY') || Deno.env.get('ORG_SERVICE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
}

function intestazioni(extra: Record<string, string> = {}): Record<string, string> {
    const k = chiaveServizio();
    const h: Record<string, string> = { apikey: k, ...extra };
    if (k.startsWith('eyJ')) h.Authorization = 'Bearer ' + k;
    return h;
}

// Elenco delle tabelle (dalla descrizione automatica del database) con le colonne per l'ordinamento
async function tabelle(): Promise<{ nome: string; ordine: string }[]> {
    const res = await fetch(Deno.env.get('SUPABASE_URL') + '/rest/v1/', { headers: intestazioni({ Accept: 'application/openapi+json' }) });
    const testo = await res.text();
    if (!res.ok) throw new Error('elenco tabelle (' + res.status + '): ' + testo.slice(0, 200));
    const api = JSON.parse(testo);
    const def = api.definitions || {};
    const percorsi = Object.keys(api.paths || {}).filter(p => p !== '/' && !p.startsWith('/rpc/')).map(p => p.slice(1));
    return percorsi.filter(n => def[n]).sort().map(n => {
        const colonne = Object.keys(def[n].properties || {});
        // ordine stabile: per id se c'e', altrimenti per tutte le colonne
        const ordine = colonne.includes('id') ? 'id.asc' : colonne.map(c => '"' + c + '".asc').join(',');
        return { nome: n, ordine: ordine };
    });
}

// Un blocco di righe di una tabella (a pezzi da 1000, il massimo che Supabase da' per volta)
async function blocco(nome: string, ordine: string, da: number): Promise<{ righe: any[]; finito: boolean }> {
    let righe: any[] = [];
    let finito = false;
    for (let off = da; off < da + RIGHE_PER_BLOCCO; off += 1000) {
        const url = Deno.env.get('SUPABASE_URL') + '/rest/v1/' + encodeURIComponent(nome) + '?select=*' +
            (ordine ? '&order=' + encodeURIComponent(ordine) : '') + '&offset=' + off + '&limit=1000';
        const res = await fetch(url, { headers: intestazioni() });
        const testo = await res.text();
        if (!res.ok) throw new Error(nome + ' (' + res.status + '): ' + testo.slice(0, 200));
        const parte = testo ? JSON.parse(testo) : [];
        righe = righe.concat(parte);
        if (parte.length < 1000) { finito = true; break; }
    }
    return { righe, finito };
}

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    let dati: any = {};
    try { dati = await req.json(); } catch (_e) { return risposta({ ok: false, errore: 'richiesta non valida' }, 400); }

    const chiave = (Deno.env.get('BACKUP_SCRIPT_KEY') || '').trim();
    if (!chiave) return risposta({ ok: false, errore: 'Manca il secret BACKUP_SCRIPT_KEY su Supabase' }, 500);
    if (String(dati.chiave || '').trim() !== chiave) return risposta({ ok: false, errore: 'Chiave non valida' }, 401);
    if (!chiaveServizio()) return risposta({ ok: false, errore: 'Manca la chiave di servizio (ORG_SERVICE_KEY)' }, 500);

    try {
        if (dati.azione === 'tabelle') {
            return risposta({ ok: true, tabelle: await tabelle() });
        }
        if (dati.azione === 'blocco') {
            const nome = String(dati.nome || '');
            if (!/^[a-zA-Z0-9_]+$/.test(nome)) return risposta({ ok: false, errore: 'nome tabella non valido' }, 400);
            const b = await blocco(nome, String(dati.ordine || ''), Math.max(0, Number(dati.da) || 0));
            return risposta({ ok: true, righe: b.righe, finito: b.finito });
        }
        return risposta({ ok: false, errore: 'azione sconosciuta' }, 400);
    } catch (e) {
        return risposta({ ok: false, errore: String((e as Error).message || e) }, 500);
    }
});
