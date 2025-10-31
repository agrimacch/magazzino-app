#!/bin/bash

# ========================================
# SCRIPT: Carica TUTTE le modifiche su GitHub
# USO: ./push-all.sh
# ========================================

echo ""
echo "📦 CARICAMENTO MODIFICHE SU GITHUB"
echo "===================================="
echo ""

# 1. Mostra i file modificati
echo "📝 File modificati nella tua cartella:"
echo ""
git status -s
echo ""

# 2. Mostra anche un riepilogo più dettagliato
echo "📊 Riepilogo modifiche:"
git status
echo ""

# 3. Chiedi conferma
read -p "⚠️  Vuoi caricare TUTTE queste modifiche su GitHub? (s/n): " CONFERMA

if [ "$CONFERMA" = "s" ] || [ "$CONFERMA" = "S" ]; then
    # 4. Chiedi il messaggio del commit
    read -p "💬 Inserisci il messaggio del commit: " MESSAGGIO
    
    # 5. Aggiungi tutti i file
    echo ""
    echo "📤 Aggiunta file..."
    git add .
    
    # 6. Crea il commit
    echo "💾 Creazione commit..."
    git commit -m "$MESSAGGIO"
    
    # 7. Carica su GitHub
    echo "🚀 Caricamento su GitHub..."
    git push
    
    echo ""
    echo "✅ FATTO! Modifiche caricate con successo!"
    echo ""
    echo "🌐 Vercel aggiornerà automaticamente il sito tra 1-2 minuti"
    echo "   Puoi controllare lo stato su: https://vercel.com"
    echo ""
else
    echo ""
    echo "❌ Operazione annullata. Nessuna modifica caricata."
    echo ""
fi

echo "👋 Fine!"