#!/bin/bash

# Script per aggiornare automaticamente la versione dell'app E il pop-up novità

echo "🚀 Aggiornamento Versione App Magazzino + Pop-up Novità"
echo "========================================================"
echo ""

# Chiedi la nuova versione
read -p "Inserisci la nuova versione (es: 4.3.0): " NEW_VERSION

# Chiedi la descrizione breve per VERSION.md
read -p "Descrizione breve per changelog (es: Fix responsive mobile): " DESCRIPTION

echo ""
echo "📝 Ora inserisci le NOVITÀ da mostrare nel pop-up (max 4 feature)"
echo "   Premi INVIO senza scrivere nulla per fermarti"
echo ""

# Array per le novità
declare -a FEATURES_ICONS
declare -a FEATURES_TITLES
declare -a FEATURES_DESCRIPTIONS

# Icone disponibili
echo "Icone disponibili:"
echo "  1 = ⭐ Stella"
echo "  2 = 🎨 Palette"
echo "  3 = 🐛 Bug"
echo "  4 = 📱 Mobile"
echo "  5 = ⚡ Velocità"
echo "  6 = 🔒 Sicurezza"
echo "  7 = 📊 Report"
echo "  8 = 🔔 Notifica"
echo ""

# Chiedi fino a 4 novità
for i in {1..4}; do
    echo "--- Novità #$i ---"
    read -p "Titolo (lascia vuoto per finire): " TITLE
    
    # Se vuoto, esci dal loop
    if [ -z "$TITLE" ]; then
        break
    fi
    
    read -p "Descrizione: " DESC
    read -p "Numero icona (1-8): " ICON_NUM
    
    # Converti numero in codice HTML entity
    case $ICON_NUM in
        1) ICON="&#127775;" ;;  # ⭐
        2) ICON="&#127912;" ;;  # 🎨
        3) ICON="&#128027;" ;;  # 🐛
        4) ICON="&#128241;" ;;  # 📱
        5) ICON="&#9889;" ;;    # ⚡
        6) ICON="&#128274;" ;;  # 🔒
        7) ICON="&#128202;" ;;  # 📊
        8) ICON="&#128276;" ;;  # 🔔
        *) ICON="&#127775;" ;;  # Default stella
    esac
    
    FEATURES_ICONS+=("$ICON")
    FEATURES_TITLES+=("$TITLE")
    FEATURES_DESCRIPTIONS+=("$DESC")
    
    echo ""
done

# Data corrente
DATE=$(date +"%Y-%m-%d")

echo ""
echo "🔄 Aggiornamento alla versione v$NEW_VERSION..."
echo ""

# ============================================
# 1. Aggiorna VERSION.md
# ============================================
if [ -f "VERSION.md" ]; then
    cat > temp_version.md << EOF
# Changelog App Magazzino

## v$NEW_VERSION - $DATE (PRODUZIONE) ✅
$DESCRIPTION

EOF
    
    # Aggiungi il resto del file (escluso l'header)
    tail -n +3 VERSION.md >> temp_version.md
    mv temp_version.md VERSION.md
    
    echo "✅ VERSION.md aggiornato"
else
    echo "⚠️  VERSION.md non trovato"
fi

# ============================================
# 2. Aggiorna app.js - Cambia CURRENT_VERSION
# ============================================
if [ -f "app.js" ]; then
    # Cerca e sostituisci la riga con CURRENT_VERSION
    sed -i.bak "s/const CURRENT_VERSION = '[^']*';/const CURRENT_VERSION = '$NEW_VERSION';/" app.js
    rm -f app.js.bak
    echo "✅ app.js aggiornato (CURRENT_VERSION = '$NEW_VERSION')"
else
    echo "⚠️  app.js non trovato"
fi

# ============================================
# 3. Aggiorna index.html
# ============================================
if [ -f "index.html" ]; then
    # 3a. Badge versione
    sed -i.bak "s/<div class=\"version-badge\">v[0-9.]*<\/div>/<div class=\"version-badge\">v$NEW_VERSION<\/div>/g" index.html
    
    # 3b. Cache CSS e JS
    sed -i.bak "s/style\.css?v=[0-9.]*/style.css?v=$NEW_VERSION/g" index.html
    sed -i.bak "s/app\.js?v=[0-9.]*/app.js?v=$NEW_VERSION/g" index.html
    
    # 3c. Titolo del pop-up
    sed -i.bak "s/<h3>&#127881; Novità in AGRIMAG v[0-9.]*<\/h3>/<h3>\&#127881; Novità in AGRIMAG v$NEW_VERSION<\/h3>/g" index.html
    
    # 3d. Data nel pop-up
    FORMATTED_DATE=$(date +"%d %B %Y" | sed 's/January/Gennaio/;s/February/Febbraio/;s/March/Marzo/;s/April/Aprile/;s/May/Maggio/;s/June/Giugno/;s/July/Luglio/;s/August/Agosto/;s/September/Settembre/;s/October/Ottobre/;s/November/Novembre/;s/December/Dicembre/')
    sed -i.bak "s/<p class=\"version-date\">[^<]*<\/p>/<p class=\"version-date\">$FORMATTED_DATE<\/p>/g" index.html
    
    # 3e. Genera il nuovo HTML per le novità
    FEATURES_HTML=""
    for i in "${!FEATURES_TITLES[@]}"; do
        FEATURES_HTML+="
                <div class=\"new-feature\">
                    <span class=\"feature-icon\">${FEATURES_ICONS[$i]}</span>
                    <div class=\"feature-content\">
                        <h4>${FEATURES_TITLES[$i]}</h4>
                        <p>${FEATURES_DESCRIPTIONS[$i]}</p>
                    </div>
                </div>
"
    done
    
    # 3f. Sostituisci il contenuto del pop-up tra <div class="whats-new-body"> e </div>
    # Usa perl per sostituzione multilinea
    perl -i.bak -0pe "s|<div class=\"whats-new-body\">.*?</div>(\s*<div class=\"modal-buttons\">)|<div class=\"whats-new-body\">$FEATURES_HTML            </div>\n\n            \$1|s" index.html
    
    rm -f index.html.bak
    
    echo "✅ index.html aggiornato (badge, cache, titolo pop-up, contenuto novità)"
else
    echo "⚠️  index.html non trovato"
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
    echo "⏳ Attendi 1-2 minuti per vedere l'aggiornamento su Vercel"
    echo "   Vercel rileverà automaticamente il push e farà il deploy"
    echo ""
    echo "🧪 IMPORTANTE PER TESTARE:"
    echo "   1. Apri il sito su Vercel"
    echo "   2. Apri Console browser (F12)"
    echo "   3. Digita: localStorage.removeItem('lastSeenVersion')"
    echo "   4. Ricarica pagina (Cmd+Shift+R)"
    echo "   5. Fai login → Dovresti vedere il nuovo pop-up!"
else
    echo ""
    echo "ℹ️  Ricorda di fare commit e push manualmente!"
fi

echo ""
echo "🎊 Fatto!"