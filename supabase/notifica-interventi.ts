// ============================================================
// AGRIMAG - Edge Function "notifica-interventi" (v5.1.0)
// ------------------------------------------------------------
// Pulsante "Invia a Telegram" degli Interventi Esterni.
// Confronta il planning (tabella interventi, da OGGI in avanti) con
// quanto gia' mandato (tabella interventi_inviati) e manda nel gruppo
// "Interventi esterni" UN riepilogo con le differenze:
// raggruppato per tecnico:
//   "Interventi aggiunti per ..."      (righe nuove)
//   "Interventi modificati per ..."    (cambia ora / tipo / cliente)
//   "Interventi riprogrammati per ..." (esito NO tolto)
//   "Interventi cancellati per ..."    (esito NO oppure riga svuotata)
// Le righe con esito "?" (cliente non ancora chiamato) restano in attesa:
// partono quando l'esito cambia. Colori ed esiti NR/OK non generano avvisi.
// Poi aggiorna interventi_inviati (la "fotografia" di cosa e' stato mandato).
// Tutto con i permessi dell'utente collegato: deve essere admin o operatore.
//
// Secrets da impostare su Supabase (Edge Functions > Secrets):
//   TELEGRAM_BOT_TOKEN_INTERVENTI = token del bot @interventiesterni_bot (da @BotFather)
//   TELEGRAM_CHAT_ID_INTERVENTI   = id del gruppo "Interventi esterni" (numero negativo)
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
const FURGONE = '\uD83D\uDE90';
const CALENDARIO = '\uD83D\uDCC5';
const OMINO = '\uD83D\uDC64';
const FRECCIA = '\u2192';
const PUNTO = ' \u00B7 ';

// Gruppi del messaggio, in questo ordine (annullato e riga svuotata = "cancellati")
const GRUPPI: Record<string, { ordine: number; icona: string; uno: string; tanti: string }> = {
    NUOVO: { ordine: 1, icona: '\u2795', uno: 'Intervento aggiunto', tanti: 'Interventi aggiunti' },
    MODIFICA: { ordine: 2, icona: '\u270F\uFE0F', uno: 'Intervento modificato', tanti: 'Interventi modificati' },
    RIPRISTINATO: { ordine: 3, icona: '\uD83D\uDD01', uno: 'Intervento riprogrammato', tanti: 'Interventi riprogrammati' },
    ANNULLATO: { ordine: 4, icona: '\u274C', uno: 'Intervento cancellato', tanti: 'Interventi cancellati' },
    RIMOSSO: { ordine: 4, icona: '\u274C', uno: 'Intervento cancellato', tanti: 'Interventi cancellati' },
};
const GIORNI_CORTI = ['DOM', 'LUN', 'MAR', 'MER', 'GIO', 'VEN', 'SAB'];
const MESI_CORTI = ['GEN', 'FEB', 'MAR', 'APR', 'MAG', 'GIU', 'LUG', 'AGO', 'SET', 'OTT', 'NOV', 'DIC'];

const CAMPI = [
    { campo: 'ora', etichetta: 'ora' },
    { campo: 'tipo', etichetta: 'tipo' },
    { campo: 'cliente', etichetta: 'cliente' },
];

type Riga = {
    tecnico_id: number; data: string; turno: string; posizione: number;
    ora?: string | null; tipo?: string | null; esito?: string | null; cliente?: string | null;
};

function risposta(dati: unknown, stato = 200): Response {
    return new Response(JSON.stringify(dati), {
        status: stato,
        headers: { ...CORS, 'Content-Type': 'application/json' },
    });
}

function esc(testo: unknown): string {
    return String(testo ?? '')
        .slice(0, 200)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function oggiRoma(): string {
    // "YYYY-MM-DD" con il fuso italiano
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' })
        .format(new Date());
}

function giornoCorto(iso: string): string {
    const p = String(iso || '').split('-').map(Number);
    const d = new Date(Date.UTC(p[0], p[1] - 1, p[2], 12));
    return GIORNI_CORTI[d.getUTCDay()] + ' ' + p[2] + ' ' + MESI_CORTI[p[1] - 1];
}

// Esito "?" = cliente non ancora chiamato: la riga resta in attesa
function inAttesa(r?: Riga | null): boolean {
    return haContenuto(r) && r!.esito === '?';
}

function chiave(r: Riga): string {
    return r.tecnico_id + '|' + r.data + '|' + r.turno + '|' + r.posizione;
}

function haContenuto(r?: Riga | null): boolean {
    return !!(r && (r.ora || r.tipo || r.esito || r.cliente));
}

function uguali(a?: Riga | null, b?: Riga | null): boolean {
    const ca = haContenuto(a), cb = haContenuto(b);
    if (!ca && !cb) return true;
    if (ca !== cb) return false;
    return ['ora', 'tipo', 'esito', 'cliente'].every((c) =>
        ((a as any)[c] || '') === ((b as any)[c] || ''));
}

// Stessa regola dell'app (interventi-functions.js > intTipoEvento)
function tipoEvento(prima?: Riga | null, dopo?: Riga | null): string | null {
    const hp = haContenuto(prima), hd = haContenuto(dopo);
    if (!hp && !hd) return null;
    if (!hp) return dopo!.esito === 'NO' ? null : 'NUOVO';
    if (!hd) return prima!.esito === 'NO' ? null : 'RIMOSSO';
    if (dopo!.esito === 'NO' && prima!.esito !== 'NO') return 'ANNULLATO';
    if (prima!.esito === 'NO' && dopo!.esito !== 'NO') return 'RIPRISTINATO';
    if (dopo!.esito === 'NO') return null;
    const cambiato = CAMPI.some((c) => ((prima as any)[c.campo] || '') !== ((dopo as any)[c.campo] || ''));
    return cambiato ? 'MODIFICA' : null;
}

// ---------- Accesso al database con il token dell'utente ----------
function creaDb(url: string, intestazioni: Record<string, string>) {
    async function leggiTutto(percorso: string): Promise<any[]> {
        const tutte: any[] = [];
        for (let da = 0; ; da += 1000) {
            const res = await fetch(url + '/rest/v1/' + percorso, {
                headers: { ...intestazioni, Range: da + '-' + (da + 999), 'Range-Unit': 'items' },
            });
            if (!res.ok) throw new Error('Lettura ' + percorso.split('?')[0] + ' non riuscita (' + res.status + ')');
            const righe = await res.json();
            tutte.push(...righe);
            if (righe.length < 1000) break;
        }
        return tutte;
    }
    async function scrivi(percorso: string, metodo: string, corpo?: unknown, extra: Record<string, string> = {}) {
        const res = await fetch(url + '/rest/v1/' + percorso, {
            method: metodo,
            headers: { ...intestazioni, 'Content-Type': 'application/json', Prefer: 'return=minimal', ...extra },
            body: corpo === undefined ? undefined : JSON.stringify(corpo),
        });
        if (!res.ok) throw new Error('Scrittura ' + percorso.split('?')[0] + ' non riuscita (' + res.status + '): ' + (await res.text()).slice(0, 200));
    }
    return { leggiTutto, scrivi };
}

// ---------- Telegram ----------
async function inviaTelegram(testo: string): Promise<{ ok: boolean; errore?: string }> {
    const token = Deno.env.get('TELEGRAM_BOT_TOKEN_INTERVENTI');
    const chatId = Deno.env.get('TELEGRAM_CHAT_ID_INTERVENTI');
    if (!token || !chatId) {
        return { ok: false, errore: 'Mancano i secrets TELEGRAM_BOT_TOKEN_INTERVENTI e/o TELEGRAM_CHAT_ID_INTERVENTI su Supabase' };
    }
    const res = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: testo, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
    const dati = await res.json().catch(() => ({}));
    if (!res.ok || !dati.ok) {
        const nuovo = dati.parameters?.migrate_to_chat_id;
        return {
            ok: false,
            errore: 'Telegram ha risposto: ' + (dati.description || res.status) +
                (nuovo ? ' - NUOVO chat id del gruppo: ' + nuovo + ' (mettilo nel secret TELEGRAM_CHAT_ID_INTERVENTI)' : ''),
        };
    }
    return { ok: true };
}

// Telegram accetta max 4096 caratteri: se il riepilogo e' lungo lo divido in piu' messaggi
function dividi(righe: string[], intestazione: string): string[] {
    const messaggi: string[] = [];
    let attuale = intestazione;
    righe.forEach((r) => {
        if ((attuale + r).length > 3800) {
            messaggi.push(attuale);
            attuale = intestazione.split('\n')[0] + ' <i>(segue)</i>\n';
        }
        attuale += r;
    });
    messaggi.push(attuale);
    return messaggi;
}

function firma(utente: string, iniziali?: string): string {
    const chi = iniziali ? iniziali + ' (' + utente + ')' : utente;
    const quando = new Date().toLocaleString('it-IT', {
        timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
    return '\n' + OMINO + ' ' + esc(chi) + PUNTO + esc(quando);
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

    // 1. Utente collegato?
    const utenteRes = await fetch(supabaseUrl + '/auth/v1/user', { headers: intestazioni });
    if (!utenteRes.ok) return risposta({ ok: false, errore: 'Utente non collegato' }, 401);
    const utente = await utenteRes.json();
    const email = utente.email || 'utente';

    // 2. Puo' modificare gli interventi? (admin / operatore)
    const permessoRes = await fetch(supabaseUrl + '/rest/v1/rpc/puo_modificare_interventi', {
        method: 'POST',
        headers: { ...intestazioni, 'Content-Type': 'application/json' },
        body: '{}',
    });
    const permesso = permessoRes.ok ? await permessoRes.json().catch(() => false) : false;
    if (permesso !== true) return risposta({ ok: false, errore: 'Permessi insufficienti' }, 403);

    let corpo: { prova?: boolean; invia?: boolean; iniziali?: string } = {};
    try {
        corpo = await req.json();
    } catch (_) {
        return risposta({ ok: false, errore: 'Richiesta non valida' }, 400);
    }
    const iniziali = corpo.iniziali ? String(corpo.iniziali).slice(0, 5) : '';

    // ---- Messaggio di prova ----
    if (corpo.prova) {
        const esito = await inviaTelegram(
            FURGONE + ' <b>AGRIMAG - Interventi esterni</b>\n\uD83E\uDDEA <b>MESSAGGIO DI PROVA</b>\n\n' +
            'Se leggi questo messaggio, gli avvisi degli interventi funzionano.\n' + firma(email, iniziali));
        return risposta(esito, esito.ok ? 200 : 500);
    }

    if (!corpo.invia) return risposta({ ok: false, errore: 'Richiesta non valida' }, 400);

    // ---- Riepilogo delle modifiche ----
    try {
        const db = creaDb(supabaseUrl, intestazioni);
        const oggi = oggiRoma();
        const campi = 'tecnico_id,data,turno,posizione,ora,tipo,esito,cliente';
        const [attuali, inviati, tecnici] = await Promise.all([
            db.leggiTutto('interventi?select=' + campi + '&data=gte.' + oggi + '&order=id'),
            db.leggiTutto('interventi_inviati?select=' + campi + '&data=gte.' + oggi + '&order=data'),
            db.leggiTutto('tecnici?select=id,nome,ordine&order=id'),
        ]);

        const mappaAttuali: Record<string, Riga> = {};
        attuali.forEach((r: Riga) => { mappaAttuali[chiave(r)] = r; });
        const mappaInviati: Record<string, Riga> = {};
        inviati.forEach((r: Riga) => { mappaInviati[chiave(r)] = r; });
        const nomi: Record<number, { nome: string; ordine: number }> = {};
        tecnici.forEach((t: any) => { nomi[t.id] = { nome: t.nome, ordine: t.ordine || 0 }; });

        const chiavi = Array.from(new Set([...Object.keys(mappaAttuali), ...Object.keys(mappaInviati)]));
        const eventi: { tipo: string; prima?: Riga; dopo?: Riga; rif: Riga }[] = [];
        const daAggiornare: Riga[] = [];   // foto da aggiornare
        const daTogliere: Riga[] = [];     // foto da cancellare

        chiavi.forEach((k) => {
            const prima = mappaInviati[k];
            const dopo = mappaAttuali[k];
            if (inAttesa(dopo)) return;     // esito "?": non si manda e non si aggiorna la foto
            if (uguali(prima, dopo)) return;
            const tipo = tipoEvento(prima, dopo);
            const rif = (haContenuto(dopo) ? dopo : prima)!;
            if (tipo) eventi.push({ tipo, prima, dopo, rif });
            if (haContenuto(dopo)) daAggiornare.push(dopo!);
            else if (prima) daTogliere.push(prima);
        });

        if (eventi.length > 0) {
            // Gruppi: tecnico -> tipo (aggiunti, modificati, riprogrammati, cancellati) -> giorno
            const ordTec = (id: number) => nomi[id]?.ordine ?? 999;
            eventi.sort((a, b) =>
                ordTec(a.rif.tecnico_id) - ordTec(b.rif.tecnico_id) ||
                a.rif.tecnico_id - b.rif.tecnico_id ||
                GRUPPI[a.tipo].ordine - GRUPPI[b.tipo].ordine ||
                a.rif.data.localeCompare(b.rif.data) ||
                a.rif.turno.localeCompare(b.rif.turno) ||
                a.rif.posizione - b.rif.posizione);

            const gruppi: { titolo: string; eventi: typeof eventi }[] = [];
            eventi.forEach((ev) => {
                const g = GRUPPI[ev.tipo];
                const chiaveGruppo = ev.rif.tecnico_id + '|' + g.ordine;
                const ultimo = gruppi[gruppi.length - 1];
                if (ultimo && ultimo.titolo === chiaveGruppo) ultimo.eventi.push(ev);
                else gruppi.push({ titolo: chiaveGruppo, eventi: [ev] });
            });

            const righe: string[] = [];
            gruppi.forEach((gr) => {
                const primo = gr.eventi[0];
                const g = GRUPPI[primo.tipo];
                const nome = nomi[primo.rif.tecnico_id]?.nome || 'TECNICO';
                let blocco = '\n' + g.icona + ' <b>' + (gr.eventi.length === 1 ? g.uno : g.tanti) + ' per ' + esc(nome) + '</b>\n';
                gr.eventi.forEach((ev) => {
                    const r = ev.rif;
                    blocco += CALENDARIO + ' ' + giornoCorto(r.data) + PUNTO + (r.turno === 'P' ? 'pom.' : 'mat.') +
                        (r.ora ? PUNTO + 'ore <b>' + esc(r.ora) + '</b>' : '') +
                        (r.tipo ? PUNTO + esc(r.tipo) : '') + '\n';
                    if (r.cliente) blocco += '      ' + esc(r.cliente) + '\n';
                    if (ev.tipo === 'MODIFICA' && ev.prima && ev.dopo) {
                        CAMPI.forEach((c) => {
                            const a = (ev.prima as any)[c.campo] || '';
                            const b = (ev.dopo as any)[c.campo] || '';
                            if (a !== b) blocco += '      <i>' + c.etichetta + ': ' + esc(a || '-') + ' ' + FRECCIA + ' ' + esc(b || '-') + '</i>\n';
                        });
                    }
                });
                righe.push(blocco);
            });
            righe.push(firma(email, iniziali));

            const intestazione = FURGONE + ' <b>AGRIMAG - Interventi esterni</b>\n';
            for (const testo of dividi(righe, intestazione)) {
                const esito = await inviaTelegram(testo);
                if (!esito.ok) return risposta(esito, 500);
            }
        }

        // Aggiorno la "fotografia" (anche per i cambi che non generano avvisi, es. esito OK)
        const adesso = new Date().toISOString();
        if (daAggiornare.length) {
            await db.scrivi('interventi_inviati?on_conflict=tecnico_id,data,turno,posizione', 'POST',
                daAggiornare.map((r) => ({
                    tecnico_id: r.tecnico_id, data: r.data, turno: r.turno, posizione: r.posizione,
                    ora: r.ora || null, tipo: r.tipo || null, esito: r.esito || null, cliente: r.cliente || null,
                    inviato_at: adesso, inviato_da: email,
                })),
                { Prefer: 'return=minimal,resolution=merge-duplicates' });
        }
        for (const r of daTogliere) {
            await db.scrivi('interventi_inviati?tecnico_id=eq.' + r.tecnico_id + '&data=eq.' + r.data +
                '&turno=eq.' + r.turno + '&posizione=eq.' + r.posizione, 'DELETE');
        }

        return risposta({ ok: true, inviati: eventi.length });
    } catch (err) {
        return risposta({ ok: false, errore: String((err as Error)?.message || err) }, 500);
    }
});
