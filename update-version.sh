#!/bin/bash

# Script per aggiornare automaticamente la versione dell'app

echo "🚀 Aggiornamento Versione App Magazzino"
echo "========================================"
echo ""

# Chiedi la nuova versione
read -p "Inserisci la nuova versione (es: 1.0.2): " NEW_VERSION

# Chiedi la descrizione delle modifiche
read -p "Descrizione modifiche: " DESCRIPTION

# Data corrente
DATE=$(date +"%Y-%m-%d")

echo ""
echo "🔍 Aggiornamento alla versione v$NEW_VERSION..."
echo ""

# 1. Aggiorna index.html
if [ -f "index.html" ]; then
    # Aggiorna il badge versione
    sed -i.bak "s/<div class=\"version-badge\">v[0-9]*\.[0-9]*\.[0-9]*<\/div>/<div class=\"version-badge\">v$NEW_VERSION<\/div>/g" index.html
    
    # Aggiorna il parametro version nel CSS
    sed -i.bak "s/style\.css?v=[0-9]*\.[0-9]*\.[0-9]*/style.css?v=$NEW_VERSION/g" index.html
    
    # Aggiorna il parametro version nel JS
    sed -i.bak "s/app\.js?v=[0-9]*\.[0-9]*\.[0-9]*/app.js?v=$NEW_VERSION/g" index.html
    
    # Rimuovi i file di backup
    rm -f index.html.bak
    
    echo "✅ index.html aggiornato"
else
    echo "❌ index.html non trovato"
fi

# 2. Aggiorna VERSION.md
if [ -f "VERSION.md" ]; then
    # Crea contenuto temporaneo
    cat > temp_version.md << EOF
# Changelog App Magazzino

## v$NEW_VERSION - $DATE (PRODUZIONE) ✅
$DESCRIPTION

EOF
    
    # Aggiungi il resto del file (escluso l'header)
    tail -n +3 VERSION.md >> temp_version.md
    
    # Sostituisci il file originale
    mv temp_version.md VERSION.md
    
    echo "✅ VERSION.md aggiornato"
else
    echo "❌ VERSION.md non trovato"
fi

echo ""
echo "🎉 Versione aggiornata a v$NEW_VERSION!"
echo ""
echo "📋 Prossimi passi:"
echo "   1. Verifica le modifiche"
echo "   2. git add ."
echo "   3. git commit -m \"v$NEW_VERSION - $DESCRIPTION\""
echo "   4. git push"
echo ""
read -p "Vuoi fare il commit e push automaticamente? (s/n): " AUTO_PUSH

if [ "$AUTO_PUSH" = "s" ] || [ "$AUTO_PUSH" = "S" ]; then
    git add .
    git commit -m "v$NEW_VERSION - $DESCRIPTION"
    git push
    echo ""
    echo "✅ Modifiche caricate su GitHub!"
    echo "⏳ Attendi 1 minuto per vedere l'aggiornamento su Netlify"
else
    echo ""
    echo "ℹ️  Ricorda di fare commit e push manualmente!"
fi

echo ""
echo "🎊 Fatto!"