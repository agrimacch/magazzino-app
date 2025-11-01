# 📦 Manuale d'Uso e Manutenzione
## App Gestione Magazzino

**Versione App:** 1.0.2  
**Data Manuale:** Gennaio 2025  
**Sviluppato per:** Agrimacch

---

## 📑 Indice

1. [Introduzione](#introduzione)
2. [Accesso al Sistema](#accesso-al-sistema)
3. [Interfaccia Principale](#interfaccia-principale)
4. [Gestione Articoli](#gestione-articoli)
5. [Carico e Scarico Magazzino](#carico-e-scarico-magazzino)
6. [Scanner Codici a Barre](#scanner-codici-a-barre)
7. [Report e Stampe](#report-e-stampe)
8. [Gestione Utenti (Solo Admin)](#gestione-utenti)
9. [Manutenzione e Aggiornamenti](#manutenzione-e-aggiornamenti)
10. [Risoluzione Problemi](#risoluzione-problemi)
11. [FAQ - Domande Frequenti](#faq)

---

## 1. Introduzione

### 1.1 Cos'è l'App Gestione Magazzino

L'App Gestione Magazzino è una web application progettata per gestire l'inventario aziendale in tempo reale, accessibile da qualsiasi dispositivo (computer, tablet, smartphone).

### 1.2 Caratteristiche Principali

- ✅ **Multi-dispositivo**: Accessibile da PC, tablet e smartphone
- ✅ **Cloud**: I dati sono sempre sincronizzati online
- ✅ **Scanner integrato**: Lettura codici a barre tramite fotocamera
- ✅ **Multi-utente**: Gestione ruoli (Admin e Operatore)
- ✅ **Report avanzati**: Statistiche per articolo e fornitore
- ✅ **Responsive**: Interfaccia ottimizzata per ogni schermo
- ✅ **Sicuro**: Autenticazione e backup automatico

### 1.3 Requisiti di Sistema

**Per utilizzare l'app serve:**
- Connessione internet attiva
- Browser moderno (Safari, Chrome, Firefox, Edge)
- Per lo scanner: Smartphone con fotocamera

**URL dell'applicazione:**
```
https://magazzino-agrimacch.netlify.app
```

---

## 2. Accesso al Sistema

### 2.1 Login

1. Apri il browser e vai all'URL dell'app
2. Inserisci **Email** e **Password**
3. Clicca su **"Accedi"**

![Schermata Login](screenshots/login.png)

**Nota:** Se non hai ancora un account, contatta l'amministratore.

### 2.2 Ruoli Utente

L'app prevede due tipi di utenti:

#### 👑 Amministratore (Admin)
Può fare tutto:
- Creare/modificare/eliminare articoli
- Carico e scarico magazzino
- Visualizzare report completi
- Gestire utenti
- Accesso a tutte le funzioni

#### 👤 Operatore
Accesso limitato:
- Solo carico e scarico magazzino
- Visualizzare inventario (sola lettura)
- Usare lo scanner
- NON può modificare/eliminare articoli
- NON può creare report
- NON può gestire utenti

Il tuo ruolo è visibile accanto al nome utente nell'header.

### 2.3 Logout

Per uscire dall'app, clicca sul pulsante **"Logout"** in alto a destra.

---

## 3. Interfaccia Principale

### 3.1 Struttura dell'Interfaccia

L'app è divisa in sezioni accessibili tramite **tab** (linguette) nella barra di navigazione:
```
┌─────────────────────────────────────────────┐
│  [Logo]  📦 gazzino    👤 Email  │ ← Header
├─────────────────────────────────────────────┤
│ 📊 Inventario │ ➕ Nuovo │ 📋 Movimenti │... │ ← Tab
├─────────────────────────────────────────────┤
│                                             │
│           Contenuto della Tab               │
│                                             │
└─────────────────────────────────────────────┘
                                          v1.0.2 ← Versione
```

### 3.2 Le Tab Principali

| Tab | Icona | Descrizione | Accesso |
|-----|-------|-------------|---------|
| **Inventario** | 📊 | Visualizza tutti gli articoli | Tutti |
| **Nuovo Articolo** | ➕ | Crea nuovi articoli | Solo Admin |
| **Movimenti** | 📋 | Storico carico/scarico | Tutti |
| **Report** | 📄 | Genera report e stampe | Solo Admin |
| **Gestione Utenti** | 👥 | Gestisci utenti | Solo Admin |
| **Scanner** | 📷 | Scansiona codici a barre | Tutti |

### 3.3 Indicatore Versione

In basso a destra è sempre visibile la **versione corrente** dell'app (es: `v1.0.2`). Questo aiuta a verificare di avere l'ultima versione aggiornata.

---

## 4. Gestione Articoli

### 4.1 Visualizzare l'Inventario

**Percorso:** Tab **📊 Inventario**

L'inventario mostra tutti gli articoli del magazzino raggruppati per **fornitore**.

#### Intestazione Sezione Fornitore

Per ogni fornitore viene mostrato:
- 🏢 Nome fornitore
- Numero totale articoli
- Valore totale magazzino (calcolato sui prezzi di acquisto)
- Articoli sotto soglia (da ordinare)

#### Colonne Tabella

| Colonna | Descrizione |
|---------|-------------|
| **Nome** | Nome dell'articolo |
| **Codice Articolo** | Codice interno per ordini |
| **Quantità** | Pezzi disponibili in magazzino |
| **Soglia** | Quantità minima prima dell'allerta |
| **Prezzo Acq.** | Prezzo di acquisto (IVA inclusa) |
| **Prezzo Vend.** | Prezzo di vendita |
| **Codice Barre** | Barcode per lo scanner |
| **Azioni** | Pulsanti per azioni rapide |

#### Articoli Sotto Soglia

Gli articoli con quantità **≤ soglia minima** sono evidenziati con **sfondo rosso** per indicare che è necessario riordinarli.

### 4.2 Ricerca e Filtri

Nella parte superiore dell'inventario trovi:

#### Barra di Ricerca 🔍
Digita per cercare:
- Nome articolo
- Codice articolo
- Codice a barre
- Marca/Fornitore

La ricerca è in tempo reale (mentre digiti).

#### Filtro per Fornitore
Menu a tendina per visualizzare solo articoli di un fornitore specifico.

#### Ordinamento
Ordina gli articoli per:
- Fornitore (A-Z o Z-A)
- Nome (A-Z o Z-A)
- Quantità (crescente/decrescente)

#### Raggruppa per Fornitore
Interruttore per attivare/disattivare il raggruppamento per fornitore.

**Consiglio:** Lascia sempre attivo per una visualizzazione più organizzata!

### 4.3 Creare un Nuovo Articolo

**Percorso:** Tab **➕ Nuovo Articolo** (Solo Admin)

#### Campi Obbligatori (*)

1. **Nome Articolo** *
   - Nome descrittivo del prodotto
   - Esempio: `Olio Motore 5W30`

2. **Codice Articolo** *
   - Codice univoco per ordini e riferimenti interni
   - Esempio: `OM-5W30-01`
   - ⚠️ NON può essere duplicato

3. **Codice a Barre** *
   - Barcode del prodotto (EAN-13, EAN-8, ecc.)
   - Esempio: `8001234567890`
   - ⚠️ NON può essere duplicato
   - Serve per lo scanner

4. **Quantità Iniziale** *
   - Numero di pezzi già presenti a magazzino
   - Default: `0`

5. **Soglia Minima** *
   - Quando scendere sotto questa quantità, l'articolo viene evidenziato
   - Default: `10`

6. **Prezzo Acquisto (IVA compresa)** * €
   - Prezzo netto pagato al fornitore
   - Esempio: `15.50`
   - Usato per calcolare il valore del magazzino

7. **Prezzo Vendita** * €
   - Prezzo di vendita al cliente
   - Esempio: `25.00`

#### Campi Opzionali

8. **Marca/Fornitore**
   - Nome del fornitore o marca
   - Esempio: `Castrol`
   - Serve per raggruppare gli articoli

9. **Descrizione**
   - Note aggiuntive sull'articolo
   - Esempio: `Olio sintetico per motori diesel`

#### Salvare l'Articolo

Clicca sul pulsante **"Salva Articolo"**.

**Messaggi possibili:**
- ✅ "Articolo aggiunto con successo!"
- ❌ "Codice articolo già esistente!"
- ❌ "Codice a barre già esistente!"

Dopo il salvataggio, l'articolo appare immediatamente nell'inventario.

### 4.4 Modificare un Articolo

**Percorso:** Tab **📊 Inventario** → Pulsante **✏️** (Solo Admin)

1. Nell'inventario, trova l'articolo da modificare
2. Clicca sul pulsante **✏️ Modifica**
3. Si apre un **popup** con tutti i campi compilati
4. Modifica i campi necessari
5. Clicca su **"Salva Modifiche"**

**Nota:** Puoi modificare anche la quantità manualmente, ma è consigliato usare sempre Carico/Scarico per tenere traccia dei movimenti.

### 4.5 Eliminare un Articolo

**Percorso:** Tab **📊 Inventario** → Pulsante **🗑️** (Solo Admin)

⚠️ **ATTENZIONE:** L'eliminazione è **irreversibile**!

1. Nell'inventario, trova l'articolo da eliminare
2. Clicca sul pulsante **🗑️ Elimina**
3. Conferma l'operazione nel popup
4. L'articolo viene rimosso dal database

**Consiglio:** Prima di eliminare, verifica che non ci siano movimenti recenti associati.

---

## 5. Carico e Scarico Magazzino

### 5.1 Eseguire un Carico

Il **carico** aumenta la quantità in magazzino (es: ricevuta merce da fornitore).

#### Metodo 1: Dall'Inventario

1. Vai alla tab **📊 Inventario**
2. Trova l'articolo nella tabella
3. Clicca sul pulsante verde **➕ Carico**
4. Si apre un popup:
   - Nome articolo
   - Quantità attuale
   - Campo **"Quantità"**: inserisci quanti pezzi vuoi aggiungere
   - Campo **"Note"** (opzionale): es. "Ordine #1234 - Fornitore XYZ"
5. Clicca su **"Conferma"**

**Risultato:** La quantità viene aggiornata e viene registrato un movimento.

#### Metodo 2: Con lo Scanner

1. Vai alla tab **📷 Scanner**
2. Inquadra il codice a barre
3. L'app riconosce l'articolo
4. Clicca sul pulsante **➕ Carico**
5. Inserisci quantità e note
6. Conferma

### 5.2 Eseguire uno Scarico

Lo **scarico** diminuisce la quantità in magazzino (es: vendita o utilizzo).

#### Procedura

Identica al carico, ma usa il pulsante rosso **➖ Scarico**.

**Controllo:** L'app NON permette di scaricare più pezzi di quelli disponibili.

**Esempio:**
- Quantità attuale: 5
- Provi a scaricare: 10
- Messaggio: ❌ "Quantità insufficiente in magazzino!"

### 5.3 Note sui Movimenti

Le **note** sono opzionali ma **molto utili** per:
- Riferimenti a ordini
- Motivazioni dello scarico
- Nome cliente
- Documenti di trasporto

**Esempi di note:**
- Carico: `"DDT #789 - Fornitore Castrol"`
- Scarico: `"Vendita cliente Rossi Mario - Fattura #123"`

### 5.4 Visualizzare lo Storico Movimenti

**Percorso:** Tab **📋 Movimenti**

Qui vedi tutti i movimenti di carico/scarico effettuati, con:
- Data e ora
- Nome articolo
- Codice articolo
- Tipo (CARICO o SCARICO)
- Quantità
- Utente che ha eseguito l'operazione
- Note

#### Filtrare i Movimenti

Puoi filtrare per:
- **Tipo**: Tutti / Solo Carichi / Solo Scarichi
- **Data Da**: Data inizio periodo
- **Data A**: Data fine periodo

Clicca su **"Applica Filtri"** per aggiornare la lista.

**Consiglio:** Usa i filtri per controllare le operazioni di un determinato periodo (es: ultimo mese).

---

## 6. Scanner Codici a Barre

### 6.1 Attivare lo Scanner

**Percorso:** Tab **📷 Scanner**

1. Clicca sulla tab **Scanner**
2. Il browser chiederà il **permesso di accedere alla fotocamera**
3. Clicca su **"Consenti"**
4. Appare il riquadro video con la fotocamera attiva

### 6.2 Scansionare un Codice

1. Inquadra il codice a barre nel riquadro verde
2. Mantieni il codice ben visibile e a fuoco
3. Quando riconosciuto, l'app **stoppa automaticamente** la fotocamera
4. Appare il risultato:
   - Nome articolo
   - Codice articolo
   - Quantità disponibile

### 6.3 Azioni dopo la Scansione

Dopo aver scansionato, puoi:
- **➕ Carico**: Aumenta la quantità
- **➖ Scarico**: Diminuisci la quantità
- **📷 Scansiona Altro**: Scansiona un nuovo articolo

### 6.4 Consigli per una Scansione Perfetta

✅ **Illuminazione**: Scansiona in un ambiente ben illuminato  
✅ **Distanza**: Tieni il telefono a 15-20 cm dal codice  
✅ **Stabilità**: Mantieni il telefono fermo  
✅ **Pulizia**: Assicurati che il codice non sia danneggiato  
❌ **Evita**: Riflessi, ombre, codici piegati

### 6.5 Risoluzione Problemi Scanner

**Problema:** La fotocamera non si attiva

**Soluzione:**
1. Controlla di aver dato il permesso alla fotocamera
2. Verifica che nessun'altra app stia usando la fotocamera
3. Ricarica la pagina (swipe down)
4. Se su iPhone, vai in: Impostazioni → Safari → Fotocamera → Consenti

**Problema:** Il codice non viene riconosciuto

**Soluzione:**
1. Migliora l'illuminazione
2. Pulisci la fotocamera del telefono
3. Avvicina/allontana il telefono dal codice
4. Prova a inclinare leggermente il telefono

---

## 7. Report e Stampe

**Percorso:** Tab **📄 Report** (Solo Admin)

### 7.1 Tipi di Report Disponibili

L'app può generare 3 tipi di report:

#### 1️⃣ Report per Articolo

Analisi dettagliata di un singolo articolo con:
- Dati anagrafici (nome, codici, prezzi)
- Quantità attuale e valore magazzino
- Riepilogo movimenti nel periodo selezionato
- Dettaglio completo di tutti i movimenti

**Quando usarlo:**
- Controllo specifico su un articolo
- Verifica movimenti sospetti
- Analisi storico vendite/acquisti

#### 2️⃣ Report per Fornitore

Analisi di tutti gli articoli di un fornitore con:
- Numero articoli totali
- Valore complessivo magazzino
- Articoli sotto soglia (da riordinare)
- Tabella dettagliata di tutti gli articoli

**Quando usarlo:**
- Preparare un ordine al fornitore
- Verificare il valore dello stock di un brand
- Controllare articoli da riordinare

#### 3️⃣ Report Inventario Completo

Vista globale di tutto il magazzino con:
- Statistiche generali (articoli, valore totale, sotto soglia)
- Riepilogo per ogni fornitore
- Tabella completa di tutti gli articoli

**Quando usarlo:**
- Bilanci di fine mese/anno
- Valutazione patrimonio aziendale
- Controlli amministrativi

### 7.2 Generare un Report

#### Passo 1: Seleziona Tipo Report

Dal menu a tendina **"Tipo Report"**, scegli:
- Report per Articolo
- Report per Fornitore
- Report Inventario Completo

#### Passo 2: Seleziona Elemento (se necessario)

- Per **Report per Articolo**: Scegli l'articolo dal menu a tendina
- Per **Report per Fornitore**: Scegli il fornitore dal menu a tendina
- Per **Inventario Completo**: Non serve selezione

#### Passo 3: Seleziona Periodo (opzionale)

Imposta le date:
- **Da**: Data inizio (lascia vuoto per "dall'inizio")
- **A**: Data fine (lascia vuoto per "oggi")

**Nota:** Il periodo si applica solo ai **movimenti**, non all'inventario attuale.

#### Passo 4: Genera

Clicca sul pulsante **"Genera Report"**.

Il report appare immediatamente sotto, con layout ottimizzato per la stampa.

### 7.3 Stampare un Report

1. Dopo aver generato il report, clicca sul pulsante **🖨️ Stampa**
2. Si apre la finestra di stampa del browser
3. Opzioni consigliate:
   - **Destinazione**: Salva come PDF (per archiviare) o Stampante
   - **Layout**: Verticale
   - **Margini**: Normali
   - **Sfondi grafica**: Attivo (per vedere i colori)
4. Clicca su **"Stampa"** o **"Salva"**

**Consiglio:** Salva sempre una copia PDF dei report importanti (es: inventari di fine mese).

### 7.4 Interpretare i Report

#### Valori Importanti

- **Valore Magazzino**: Basato sui **prezzi di acquisto** (IVA inclusa)
- **Articoli sotto soglia**: Numero di articoli da riordinare
- **Differenza movimenti**: Totale carico - Totale scarico nel periodo

#### Colori nelle Tabelle

- ⚪ **Sfondo bianco**: Articolo con quantità normale
- 🔴 **Sfondo rosso**: Articolo sotto soglia (da ordinare)

#### Stato Articoli

- ✅ **OK**: Quantità superiore alla soglia
- ⚠️ **DA ORDINARE**: Quantità pari o inferiore alla soglia

---

## 8. Gestione Utenti (Solo Admin)

**Percorso:** Tab **👥 Gestione Utenti** (Solo Admin)

### 8.1 Creare un Nuovo Utente

Solo gli **amministratori** possono creare nuovi utenti.

#### Procedura

1. Vai alla tab **👥 Gestione Utenti**
2. Compila il form "Aggiungi Nuovo Utente":
   - **Email**: Email dell'utente (sarà il suo username)
   - **Password**: Minimo 6 caratteri
   - **Ruolo**: Amministratore o Operatore
3. Clicca su **"Crea Utente"**

**Risultato:** L'utente può subito fare login con email e password.

### 8.2 Differenze tra i Ruoli

| Funzione | Admin | Operatore |
|----------|-------|-----------|
| Visualizza inventario | ✅ | ✅ |
| Carico/Scarico | ✅ | ✅ |
| Scanner | ✅ | ✅ |
| Visualizza movimenti | ✅ | ✅ |
| Crea articoli | ✅ | ❌ |
| Modifica articoli | ✅ | ❌ |
| Elimina articoli | ✅ | ❌ |
| Genera report | ✅ | ❌ |
| Gestisce utenti | ✅ | ❌ |

**Consiglio:** Crea account **Operatore** per il personale di magazzino, e **Admin** solo per responsabili/proprietari.

### 8.3 Visualizzare Utenti Registrati

Nella sezione "Utenti Registrati" vedi:
- Email di ogni utente
- Ruolo (badge colorato)
- Pulsante **"Elimina"** (non disponibile per il proprio account)

### 8.4 Eliminare un Utente

1. Trova l'utente nella tabella
2. Clicca su **"Elimina"**
3. Conferma l'operazione

⚠️ **ATTENZIONE:** 
- L'utente non potrà più accedere
- I movimenti effettuati rimangono nello storico
- L'operazione è irreversibile

**Nota:** NON puoi eliminare il tuo stesso account (per sicurezza).

### 8.5 Buone Pratiche di Sicurezza

✅ **Password robuste**: Almeno 8 caratteri, con numeri e simboli  
✅ **Email personali**: Ogni utente deve avere la sua email  
✅ **Revoca accessi**: Elimina subito gli utenti che non devono più accedere  
✅ **Ruoli minimi**: Assegna solo i permessi necessari  
✅ **Cambio password**: Cambia le password periodicamente  

---

## 9. Manutenzione e Aggiornamenti

### 9.1 Architettura del Sistema

L'app è composta da 3 componenti:
```
┌─────────────────┐
│   TUO COMPUTER  │ ← Sviluppo locale (modifiche)
│   (Locale)      │
└────────┬────────┘
         │ git push
         ▼
┌─────────────────┐
│     GITHUB      │ ← Repository codice (backup)
└────────┬────────┘
         │ deploy automatico
         ▼
┌─────────────────┐
│     NETLIFY     │ ← Sito online (produzione)
└────────┬────────┘
         │ API
         ▼
┌─────────────────┐
│    SUPABASE     │ ← Database (dati persistenti)
└─────────────────┘
```

**IMPORTANTE:** Il **database** è separato dal codice!
- Aggiornare il codice **NON** cancella i dati
- I dati rimangono sempre su Supabase

### 9.2 Workflow Aggiornamenti

#### Quando Aggiornare

Aggiorna l'app quando:
- Hai corretto bug
- Hai aggiunto nuove funzionalità
- Hai migliorato l'interfaccia
- Hai ottimizzato le performance

#### Workflow Consigliato
```
1. SVILUPPO LOCALE
   ↓ Fai modifiche e testa
   ↓
2. VERSIONE STABILE
   ↓ Quando tutto funziona
   ↓
3. AGGIORNA VERSIONE
   ↓ Usa script automatico
   ↓
4. CARICA ONLINE
   ↓ git push
   ↓
5. VERIFICA ONLINE
   ↓ Testa il sito
   ↓
6. PRODUZIONE ✅
```

### 9.3 Come Aggiornare la Versione

#### Metodo Automatico (Consigliato) 🤖

1. Apri il **Terminale**
2. Vai nella cartella del progetto:
```bash
   cd ~/Desktop/magazzino-app
```
3. Lancia lo script:
```bash
   ./update-version.sh
```
4. Rispondi alle domande:
   - **Nuova versione**: es. `1.0.3`
   - **Descrizione**: es. `Fix tabella responsive`
   - **Push automatico**: Premi `s` per caricare subito online

#### Metodo Manuale

1. Modifica `index.html`:
   - Cerca `<div class="version-badge">v1.0.2</div>`
   - Cambia il numero versione
   
2. Modifica `VERSION.md`:
   - Aggiungi la nuova versione in cima
   - Scrivi le modifiche effettuate

3. Carica su GitHub:
```bash
   git add .
   git commit -m "v1.0.3 - Descrizione modifiche"
   git push
```

### 9.4 Comandi Git Essenziali
```bash
# Vai nella cartella del progetto
cd ~/Desktop/magazzino-app

# Controlla lo stato (file modificati)
git status

# Aggiungi tutti i file modificati
git add .

# Crea un commit con messaggio
git commit -m "Descrizione modifiche"

# Carica online
git push

# Vedi lo storico dei commit
git log --oneline

# Annulla modifiche non salvate (ATTENZIONE!)
git checkout .
```

### 9.5 Verifica Aggiornamento Online

Dopo aver fatto `git push`:

1. Aspetta **1-2 minuti**
2. Vai su **https://app.netlify.com**
3. Login con GitHub
4. Clicca sul sito `magazzino-app`
5. Controlla che lo stato sia: ✅ **"Published"**
6. Verifica la **data/ora** dell'ultimo deploy

**Oppure:**

1. Apri il sito: `https://magazzino-agrimacch.netlify.app`
2. Fai **refresh forzato**:
   - **Mac**: Cmd + Shift + R
   - **iPhone**: Tieni premuto pulsante refresh → "Ricarica senza cache"
3. Verifica il numero di versione in basso a destra

### 9.6 Rollback (Tornare Indietro)

Se un aggiornamento crea problemi:

#### Su Netlify (Rapido)

1. Vai su **https://app.netlify.com**
2. Clicca sul sito
3. Vai su **"Deploys"**
4. Trova l'ultimo deploy funzionante
5. Clicca sui **3 puntini** → **"Publish deploy"**

#### Su Git (Permanente)
```bash
# Vedi gli ultimi commit
git log --oneline

# Torna indietro di 1 commit
git revert HEAD

# Carica la modifica
git push
```

### 9.7 Backup del Codice

Il codice è **già salvato** su GitHub! Per sicurezza aggiuntiva:

#### Backup Locale
```bash
# Esporta tutto il progetto
cd ~/Desktop
zip -r magazzino-backup-$(date +%Y%m%d).zip magazzino-app
```

Questo crea un file `.zip` con data, es: `magazzino-backup-20250109.zip`

### 9.8 Backup del Database

Il database su **Supabase** ha backup automatici, ma puoi farne uno manuale:

1. Vai su **https://app.supabase.com**
2. Seleziona il progetto `inventario-magazzino`
3. Vai su **Table Editor**
4. Per ogni tabella (`articoli`, `movimenti`, `user_roles`):
   - Clicca sulla tabella
   - Clicca sui **3 puntini** → **"Download as CSV"**
5. Salva i file CSV in una cartella sicura

**Consiglio:** Fai backup mensili del database.

---

## 10. Risoluzione Problemi

### 10.1 Problemi di Login

#### Problema: "Errore login: Invalid login credentials"

**Causa:** Email o password errati

**Soluzione:**
1. Verifica di aver scritto correttamente email e password
2. Controlla che il CAPS LOCK non sia attivo
3. Se hai dimenticato la password, contatta l'amministratore

#### Problema: "Utente non autorizzato"

**Causa:** Account non ancora creato o eliminato

**Soluzione:**
- Contatta l'amministratore per creare/ripristinare l'account

### 10.2 Problemi con l'Inventario

#### Problema: Gli articoli non si vedono

**Causa:** Filtri attivi o connessione internet assente

**Soluzione:**
1. Controlla la connessione internet
2. Rimuovi tutti i filtri (seleziona "Tutti i fornitori")
ri (seleziona "Tutti i fornitori")
3. Ricarica la pagina (F5 o swipe down)
4. Verifica di aver effettuato il login

#### Problema: "Codice articolo già esistente"

**Causa:** Stai cercando di creare un articolo con un codice già usato

**Soluzione:**
1. Usa la ricerca per trovare l'articolo esistente
2. Se vuoi modificarlo, usa il pulsante ✏️ Modifica
3. Se vuoi crearne uno nuovo, usa un codice diverso

#### Problema: Articoli duplicati dopo sincronizzazione

**Causa:** Errore temporaneo di rete durante il salvataggio

**Soluzione:**
1. Identifica i duplicati
2. Elimina le copie (tenendo quello con i movimenti corretti)
3. Contatta l'assistenza se il problema persiste

### 10.3 Problemi con Carico/Scarico

#### Problema: "Quantità insufficiente in magazzino"

**Causa:** Stai cercando di scaricare più pezzi di quelli disponibili

**Soluzione:**
1. Verifica la quantità disponibile nell'inventario
2. Controlla di non aver già scaricato lo stesso articolo
3. Se necessario, fai prima un carico
4. Verifica di non avere filtri attivi che nascondono movimenti

#### Problema: Il movimento non appare nello storico

**Causa:** Pagina non aggiornata o filtri attivi

**Soluzione:**
1. Vai alla tab **📋 Movimenti**
2. Clicca su **"Applica Filtri"** senza impostare date
3. Ricarica la pagina
4. Se il problema persiste, ripeti l'operazione

### 10.4 Problemi con lo Scanner

#### Problema: La fotocamera non si attiva

**Causa:** Permessi non concessi o fotocamera occupata

**Soluzione iPhone:**
1. Vai in: **Impostazioni** → **Safari** → **Fotocamera**
2. Seleziona: **"Chiedi"** o **"Consenti"**
3. Ricarica la pagina dell'app
4. Quando chiede il permesso, clicca **"Consenti"**

**Soluzione Android:**
1. Vai in: **Impostazioni** → **App** → **Chrome**
2. **Autorizzazioni** → **Fotocamera** → **Consenti**
3. Ricarica la pagina

#### Problema: Lo scanner non legge il codice

**Causa:** Illuminazione scarsa, codice danneggiato, o distanza sbagliata

**Soluzione:**
1. Migliora l'illuminazione
2. Pulisci la lente della fotocamera
3. Tieni il telefono a 15-20 cm dal codice
4. Mantieni il telefono fermo per 2-3 secondi
5. Prova ad avvicinare/allontanare leggermente
6. Verifica che il codice non sia danneggiato o piegato

#### Problema: "Articolo non trovato nel database"

**Causa:** Il codice a barre scansionato non è presente nel sistema

**Soluzione:**
1. Verifica di aver scansionato il codice corretto
2. Crea prima l'articolo dalla tab **➕ Nuovo Articolo**
3. Inserisci il codice a barre corretto
4. Riprova la scansione

#### Problema: Lo scanner si blocca dopo la scansione

**Causa:** Bug risolto nella versione 1.0.1+

**Soluzione:**
1. Verifica di avere l'ultima versione (vedi badge in basso a destra)
2. Ricarica la pagina con refresh forzato
3. Se il problema persiste, contatta l'assistenza

### 10.5 Problemi con i Report

#### Problema: Il report è vuoto

**Causa:** Nessun dato nel periodo selezionato o articolo/fornitore senza movimenti

**Soluzione:**
1. Rimuovi i filtri data (lascia "Da" e "A" vuoti)
2. Verifica di aver selezionato l'articolo/fornitore corretto
3. Controlla che ci siano movimenti nella tab **📋 Movimenti**

#### Problema: La stampa taglia il contenuto

**Causa:** Impostazioni di stampa non corrette

**Soluzione:**
1. Nella finestra di stampa, seleziona:
   - **Layout**: Verticale (o Orizzontale se necessario)
   - **Margini**: Normali o Minimi
   - **Scala**: 100% o "Adatta alla pagina"
2. Attiva **"Grafiche di sfondo"** per vedere i colori

### 10.6 Problemi di Connessione

#### Problema: "Errore di rete" o dati non si salvano

**Causa:** Connessione internet assente o instabile

**Soluzione:**
1. Verifica la connessione WiFi o dati mobili
2. Prova a ricaricare la pagina
3. Se sei su WiFi aziendale, verifica che non ci siano firewall che bloccano Supabase
4. Riprova l'operazione quando la connessione è stabile

#### Problema: L'app è lenta

**Causa:** Connessione lenta, molti articoli, o cache del browser

**Soluzione:**
1. Verifica la velocità della connessione
2. Chiudi tab inutilizzate del browser
3. Svuota la cache del browser:
   - **Safari**: Impostazioni → Safari → Cancella dati siti web
   - **Chrome**: Impostazioni → Privacy → Cancella dati di navigazione
4. Ricarica la pagina

### 10.7 Problemi con Aggiornamenti

#### Problema: Non vedo l'ultima versione online

**Causa:** Cache del browser

**Soluzione:**
1. Fai **refresh forzato**:
   - **Mac**: Cmd + Shift + R
   - **PC**: Ctrl + Shift + F5
   - **iPhone**: Tieni premuto il pulsante refresh → "Ricarica senza cache"
2. Oppure cancella la cache del browser (vedi sopra)
3. Ricarica la pagina

#### Problema: Dopo l'aggiornamento qualcosa non funziona

**Causa:** Bug introdotto nella nuova versione

**Soluzione:**
1. Segnala immediatamente il problema all'amministratore
2. L'amministratore può fare rollback su Netlify (vedi sezione 9.6)
3. Aspetta la correzione del bug

### 10.8 Problemi con Utenti

#### Problema: Non riesco a creare un nuovo utente

**Causa:** Solo gli Admin possono creare utenti, o email già esistente

**Soluzione:**
1. Verifica di essere loggato come **Admin** (vedi badge nell'header)
2. Controlla che l'email non sia già registrata
3. Verifica che la password sia almeno 6 caratteri
4. Controlla la connessione internet

#### Problema: Un utente non riesce a fare login

**Causa:** Account non confermato o eliminato

**Soluzione:**
1. Verifica che l'utente sia nella lista "Utenti Registrati"
2. Se non c'è, ricrealo
3. Verifica che email e password siano corrette
4. Se il problema persiste, elimina e ricrea l'account

---

## 11. FAQ - Domande Frequenti

### 11.1 Domande Generali

**Q: L'app funziona offline?**  
**A:** No, serve sempre una connessione internet attiva perché i dati sono sul cloud.

**Q: Quanti utenti possono usare l'app contemporaneamente?**  
**A:** Illimitati! Tutti gli utenti vedono i dati aggiornati in tempo reale.

**Q: I dati sono sicuri?**  
**A:** Sì, il database Supabase ha:
- Crittografia dei dati
- Backup automatici giornalieri
- Server in Europa (GDPR compliant)
- Autenticazione sicura

**Q: Posso accedere da più dispositivi?**  
**A:** Sì, usa le stesse credenziali su tutti i dispositivi.

**Q: L'app funziona su tutti i browser?**  
**A:** Sì, funziona su:
- Safari (Mac, iPhone, iPad)
- Chrome (Windows, Mac, Android)
- Firefox (Windows, Mac)
- Edge (Windows)

**Q: Posso usare l'app su tablet?**  
**A:** Sì, l'interfaccia è responsive e si adatta perfettamente a tablet.

### 11.2 Domande su Articoli

**Q: Posso modificare il codice a barre di un articolo?**  
**A:** Sì, dalla funzione ✏️ Modifica, ma fai attenzione: se cambi il codice, lo scanner cercherà il nuovo codice.

**Q: Cosa succede se elimino un articolo con movimenti?**  
**A:** I movimenti storici rimangono nel database ma risulteranno "Articolo eliminato" nella tab Movimenti.

**Q: Posso avere due articoli con lo stesso nome?**  
**A:** Sì, purché abbiano codici articolo e codici a barre diversi.

**Q: Come posso vedere solo gli articoli sotto soglia?**  
**A:** Gli articoli sotto soglia hanno sfondo rosso. Puoi anche generare un Report per Fornitore che indica quanti articoli sono da ordinare.

**Q: Posso importare articoli da Excel?**  
**A:** Al momento no, devi inserirli manualmente. Questa funzione potrebbe essere aggiunta in futuro.

### 11.3 Domande su Movimenti

**Q: Posso annullare un movimento sbagliato?**  
**A:** No, non si possono eliminare movimenti. Ma puoi fare un movimento opposto (es: se hai scaricato 10 per errore, fai un carico di 10).

**Q: Posso modificare la quantità di un articolo senza registrare un movimento?**  
**A:** Sì (solo Admin), con il pulsante ✏️ Modifica, ma è sconsigliato perché perdi la tracciabilità.

**Q: Quanto storico viene conservato?**  
**A:** Tutti i movimenti vengono conservati indefinitamente.

**Q: Posso esportare i movimenti in Excel?**  
**A:** Non direttamente dall'app, ma puoi generare un Report e stamparlo in PDF.

### 11.4 Domande su Scanner

**Q: Quali tipi di codici a barre può leggere?**  
**A:** L'app legge i formati più comuni:
- EAN-13 (prodotti commerciali)
- EAN-8
- UPC-A
- UPC-E
- Code 128
- QR Code

**Q: Posso stampare codici a barre personalizzati?**  
**A:** Sì, usa un generatore online (es: barcode-generator.org) e stampa su etichette.

**Q: Lo scanner funziona anche al buio?**  
**A:** Serve un minimo di illuminazione. Usa la torcia del telefono se necessario.

### 11.5 Domande su Report

**Q: Posso personalizzare i report?**  
**A:** I report hanno un formato fisso ottimizzato per la stampa. Per analisi personalizzate, contatta l'assistenza.

**Q: Il prezzo nei report è con o senza IVA?**  
**A:** Il **Prezzo Acquisto** è IVA inclusa. Il valore del magazzino è calcolato sui prezzi netti.

**Q: Posso programmare l'invio automatico di report via email?**  
**A:** Non nella versione attuale. Puoi generare manualmente i report e salvarli in PDF.

### 11.6 Domande su Aggiornamenti

**Q: Quanto spesso viene aggiornata l'app?**  
**A:** Dipende dalle esigenze. Gli aggiornamenti possono essere:
- **Critici** (bug gravi): Immediati
- **Migliorie**: Ogni 1-2 settimane
- **Nuove funzionalità**: Ogni 1-2 mesi

**Q: Come faccio a sapere se c'è una nuova versione?**  
**A:** Controlla il badge versione in basso a destra. Puoi confrontarlo con la versione documentata in `VERSION.md` sul GitHub.

**Q: Gli aggiornamenti cancellano i dati?**  
**A:** NO! Il database è separato dal codice. Gli aggiornamenti modificano solo l'interfaccia e le funzionalità.

**Q: Devo fare qualcosa dopo un aggiornamento?**  
**A:** Fai solo un refresh forzato della pagina per caricare la nuova versione.

---

## 12. Contatti e Assistenza

### 12.1 Assistenza Tecnica

Per problemi tecnici o domande sull'app:

**Email:** [email-supporto@esempio.com]  
**Telefono:** [+39 XXX XXX XXXX]  
**Orari:** Lun-Ven 9:00-18:00

### 12.2 Richieste di Nuove Funzionalità

Se hai idee per migliorare l'app:

1. Scrivi una email dettagliata con:
   - Descrizione della funzionalità
   - A cosa serve
   - Come dovrebbe funzionare
2. Invia a: [email-sviluppo@esempio.com]

### 12.3 Segnalazione Bug

Se trovi un problema:

1. Annota:
   - Cosa stavi facendo
   - Cosa è successo
   - Messaggio di errore (se presente)
   - Browser e dispositivo usato
   - Versione dell'app (vedi badge)
2. Fai uno screenshot
3. Invia tutto a: [email-supporto@esempio.com]

### 12.4 Link Utili

- **App Online:** https://magazzino-agrimacch.netlify.app
- **Codice Sorgente:** https://github.com/agrimacch/magazzino-app
- **Supabase Dashboard:** https://app.supabase.com
- **Netlify Dashboard:** https://app.netlify.com

---

## 13. Appendice

### 13.1 Glossario Tecnico

**API (Application Programming Interface)**  
Interfaccia che permette all'app di comunicare con il database.

**Backup**  
Copia di sicurezza dei dati.

**Cache**  
Memoria temporanea del browser che velocizza il caricamento.

**Cloud**  
Server online che ospitano i dati (in questo caso Supabase).

**Commit**  
Salvataggio delle modifiche nel sistema di versionamento Git.

**Deploy**  
Pubblicazione dell'app online.

**Git**  
Sistema di versionamento del codice.

**GitHub**  
Piattaforma online per ospitare codice.

**Netlify**  
Servizio di hosting che pubblica l'app online.

**Refresh Forzato**  
Ricaricamento della pagina ignorando la cache.

**Repository**  
Archivio del codice sorgente.

**Responsive**  
Design che si adatta a schermi di diverse dimensioni.

**Rollback**  
Tornare a una versione precedente.

**Supabase**  
Piattaforma database cloud (alternativa a Firebase).

**Tab**  
Linguetta di navigazione nell'interfaccia.

### 13.2 Tabella Comandi Rapidi

| Azione | Comando |
|--------|---------|
| Vai al progetto | `cd ~/Desktop/magazzino-app` |
| Stato modifiche | `git status` |
| Aggiorna versione | `./update-version.sh` |
| Commit manuale | `git add . && git commit -m "messaggio"` |
| Carica online | `git push` |
| Vedi storico | `git log --oneline` |
| Backup locale | `zip -r backup.zip .` |

### 13.3 Shortcut Browser

**Desktop:**
| Azione | Mac | Windows |
|--------|-----|---------|
| Refresh | Cmd + R | F5 |
| Refresh forzato | Cmd + Shift + R | Ctrl + Shift + F5 |
| Ispeziona elemento | Cmd + Option + I | F12 |
| Console sviluppatore | Cmd + Option + J | Ctrl + Shift + J |

**Mobile:**
- **Refresh**: Swipe down sulla pagina
- **Refresh forzato**: Tieni premuto il pulsante refresh → "Ricarica senza cache"

### 13.4 Checklist Manutenzione Mensile

✅ Backup database (esporta CSV da Supabase)  
✅ Genera Report Inventario Completo  
✅ Salva report in PDF  
✅ Controlla articoli sotto soglia  
✅ Verifica utenti attivi  
✅ Controlla versione app aggiornata  
✅ Test scanner su diversi dispositivi  
✅ Verifica spazio database su Supabase  

### 13.5 Licenza e Copyright

**App Gestione Magazzino**  
© 2025 Agrimacch - Tutti i diritti riservati

Questo software è proprietario e il suo utilizzo è concesso esclusivamente all'azienda Agrimacch.

**Tecnologie utilizzate:**
- Frontend: HTML5, CSS3, JavaScript
- Database: Supabase (PostgreSQL)
- Hosting: Netlify
- Versionamento: Git/GitHub
- Font: Roboto Mono (Google Fonts)
- Scanner: html5-qrcode library

---

## 14. Note Finali

### 14.1 Aggiornamenti del Manuale

Questo manuale è aggiornato alla versione **1.0.2** dell'app.

Per aggiornamenti futuri del manuale, consulta il file `MANUALE.md` nel repository GitHub.

### 14.2 Feedback

Questo manuale può essere migliorato! Se trovi:
- Informazioni poco chiare
- Errori o imprecisioni
- Sezioni mancanti

Contatta: [email@esempio.com]

### 14.3 Ringraziamenti

Sviluppo: Claude AI + Developer  
Testing: Team Agrimacch  
Design: UI/UX ottimizzato per workflow reali  

---

**Fine del Manuale**

📦 App Gestione Magazzino v1.0.2  
📅 Gennaio 2025  
📄 Documento: 45 pagine