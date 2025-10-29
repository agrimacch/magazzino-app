# Changelog App Magazzino

## v2.2.0 - 2025-10-29 (PRODUZIONE) ✅
Aggiunto campo IVA, prezzi netto/lordo separati

## v2.1.0 - 2025-10-29 (PRODUZIONE) ✅
Aggiunto campo note

## v2.0.0 - 2025-10-29 (PRODUZIONE) ✅
restore

## v1.0.3 - 2025-10-29 (PRODUZIONE) ✅
Test script automatico

## v1.0.1 - 2025-01-09 (PRODUZIONE) ✅
🎨 Miglioramenti responsive
- Ottimizzato layout per iPhone
- Header sticky compatto
- Tabelle con scroll fluido
- Form a colonna singola su mobile
- Statistiche fornitori in griglia 3 colonne
- Touch feedback migliorato
- Fix scanner che si bloccava

## v1.0.0 - 2025-01-08 (PRODUZIONE)
✅ Prima versione stabile
- Sistema login/autenticazione
- Gestione articoli completa
- Carico/scarico magazzino
- Scanner codici a barre
- Report per articolo/fornitore
- Gestione utenti (admin/operatore)
- Inventario raggruppato per fornitore

## v1.1.0 - In sviluppo (LOCALE)
🚧 Prossime migliorie...

---

## 🔄 FIX 4: Workflow Locale → Online

### Il database NON si perde mai!

✅ **IMPORTANTE**: Il database è su **Supabase** (cloud), NON sul tuo computer!

Quando aggiorni il codice:
- Il **codice** (HTML/CSS/JS) si aggiorna
- Il **database** rimane identico con tutti i dati

### Workflow consigliato:
```
┌─────────────────────────────────────┐
│  AMBIENTE LOCALE (tuo Mac)          │
│  - Fai modifiche                    │
│  - Testi tutto                      │
│  - Quando è stabile...              │
└──────────────┬──────────────────────┘
               │
               │ git push
               ▼
┌─────────────────────────────────────┐
│  GITHUB (repository)                │
│  - Codice versionato                │
└──────────────┬──────────────────────┘
               │
               │ deploy automatico
               ▼
┌─────────────────────────────────────┐
│  NETLIFY (sito online)              │
│  - App in produzione                │
│  - Usata dagli utenti               │
└──────────────┬──────────────────────┘
               │
               │ API
               ▼
┌─────────────────────────────────────┐
│  SUPABASE (database cloud)          │
│  - Dati persistenti                 │
│  - Stesso per locale E online       │
└─────────────────────────────────────┘