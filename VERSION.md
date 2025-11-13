# Changelog App Magazzino

## v4.4.0 - 2025-11-13 (PRODUZIONE) ✅


## v4.3.6 - 2025-11-12 (PRODUZIONE) ✅
implementazione gestione utenti

## v4.3.6 - 2025-11-12 (PRODUZIONE) ✅
**Pulsanti Azioni Stile Inventario per Gestione Utenti**

### 🎯 Modifiche
- **PULSANTI IN GRIGLIA**: I pulsanti Modifica/Elimina utenti ora usano `action-buttons-grid` come nell'inventario
- **ICONE GRANDI**: Solo emoji ✏️ (Modifica) e 🗑️ (Elimina) senza testo
- **SEMPRE VISIBILE**: Colonna "Azioni" sempre mostrata anche su mobile
- **RESPONSIVE**: Icone 20px su tablet, 18px su smartphone piccoli

### 📱 Ottimizzazioni Mobile
- Layout griglia 2x1: Modifica a sinistra, Elimina a destra
- Pulsanti touch-optimized: 42px altezza (38px su iPhone SE)
- Gap 4px tra pulsanti per evitare click accidentali
- Email compatta (max 140px), iniziali centrate, badge ruolo mini

### ✨ Codice
- Usate classi esistenti `btn-edit` e `btn-delete`
- CSS minimalista: solo 66 righe aggiunte
- Stili coerenti con resto dell'app

---

## v4.3.3 - 2025-11-06
Versione precedente stabile

## v4.2.93 - 2025-11-06
Fix menu hamburger scroll + overlay full-screen

## v4.2.9 - 2025-11-06
Pop-up novità versione

## v1.0.0 - 2025-01-08
Prima versione stabile