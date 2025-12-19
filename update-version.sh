#!/bin/bash

# Script per aggiornare automaticamente la versione dell'app E il pop-up novita

echo "========================================"
echo "  AGGIORNAMENTO VERSIONE APP MAGAZZINO"
echo "========================================"
echo ""

# Chiedi la nuova versione
read -p "Inserisci la nuova versione (es: 4.4.2): " NEW_VERSION

# Chiedi la descrizione breve per VERSION.md
read -p "Descrizione breve per changelog: " DESCRIPTION

echo ""
echo "Ora inserisci le NOVITA' da mostrare nel pop-up (max 4 feature)"
echo "Premi INVIO senza scrivere nulla per fermarti"
echo ""

# Array per le novita
declare -a FEATURES_ICONS
declare -a FEATURES_TITLES
declare -a FEATURES_DESCRIPTIONS

# Icone disponibili (HTML entities)
echo "Icone disponibili:"
echo "  1 = &#11088; Stella"
echo "  2 = &#127912; Palette"
echo "  3 = &#128027; Bug"
echo "  4 = &#128241; Mobile"
echo "  5 = &#9889; Velocita"
echo "  6 = &#128274; Sicurezza"
echo "  7 = &#128202; Report"
echo "  8 = &#128276; Notifica"
echo "  9 = &#128295; Strumento"
echo ""

# Chiedi fino a 4 novita
for i in {1..4}; do
    echo "--- Novita #$i ---"
    read -p "Titolo (lascia vuoto per finire): " TITLE
    
    # Se vuoto, esci dal loop
    if [ -z "$TITLE" ]; then
        break
    fi
    
    read -p "Descrizione: " DESC
    read -p "Numero icona (1-9): " ICON_NUM
    
    # Converti numero in codice HTML entity
    case $ICON_NUM in
        1) ICON="&#11088;" ;;  # Stella
        2) ICON="&#127912;" ;; # Palette
        3) ICON="&#128027;" ;; # Bug
        4) ICON="&#128241;" ;; # Mobile
        5) ICON="&#9889;" ;;   # Velocita
        6) ICON="&#128274;" ;; # Sicurezza
        7) ICON="&#128202;" ;; # Report
        8) ICON="&#128276;" ;; # Notifica
        9) ICON="&#128295;" ;; # Strumento
        *) ICON="&#11088;" ;;  # Default stella
    esac
    
    FEATURES_ICONS+=("$ICON")
    FEATURES_TITLES+=("$TITLE")
    FEATURES_DESCRIPTIONS+=("$DESC")
    
    echo ""
done

# Data corrente in formato italiano
MONTHS=("Gennaio" "Febbraio" "Marzo" "Aprile" "Maggio" "Giugno" "Luglio" "Agosto" "Settembre" "Ottobre" "Novembre" "Dicembre")
DAY=$(date +"%d")
MONTH_NUM=$(date +"%m")
MONTH_NUM=$((10#$MONTH_NUM - 1))  # Rimuovi zero leading e converti a indice array
MONTH=${MONTHS[$MONTH_NUM]}
YEAR=$(date +"%Y")
FORMATTED_DATE="$DAY $MONTH $YEAR"

echo ""
echo "Aggiornamento alla versione v$NEW_VERSION..."
echo ""

# ============================================
# 1. Aggiorna VERSION.md
# ============================================
if [ -f "VERSION.md" ]; then
    cat > temp_version.md << EOF
# Changelog App Magazzino

## v$NEW_VERSION - $(date +"%Y-%m-%d") (PRODUZIONE)
$DESCRIPTION

EOF
    
    # Aggiungi il resto del file (escluso l'header)
    tail -n +3 VERSION.md >> temp_version.md
    mv temp_version.md VERSION.md
    
    echo "[OK] VERSION.md aggiornato"
else
    echo "[WARN] VERSION.md non trovato"
fi

# ============================================
# 2. Aggiorna app.js - Cambia CURRENT_VERSION
# ============================================
if [ -f "app.js" ]; then
    # Cerca e sostituisci la riga con CURRENT_VERSION
    sed -i.bak "s/const CURRENT_VERSION = '[^']*';/const CURRENT_VERSION = '$NEW_VERSION';/" app.js
    rm -f app.js.bak
    echo "[OK] app.js aggiornato (CURRENT_VERSION = '$NEW_VERSION')"
else
    echo "[WARN] app.js non trovato"
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
    
    # 3c. Titolo del pop-up (usa perl per essere sicuri)
    perl -i.bak -pe "s|<h3>&#127881; AGRIMAG v[0-9.]+[^<]*</h3>|<h3>&#127881; AGRIMAG v$NEW_VERSION - Aggiornamento!</h3>|g" index.html
    
    # 3d. Data nel pop-up
    perl -i.bak -pe "s|<p class=\"version-date\">[^<]+</p>|<p class=\"version-date\">$FORMATTED_DATE</p>|g" index.html
    
    # 3e. Genera il nuovo HTML per le novita
    FEATURES_HTML=""
    for i in "${!FEATURES_TITLES[@]}"; do
        # Escape caratteri speciali per sed/perl
        TITLE_ESC="${FEATURES_TITLES[$i]}"
        DESC_ESC="${FEATURES_DESCRIPTIONS[$i]}"
        
        FEATURES_HTML+="
                <div class=\"new-feature\">
                    <span class=\"feature-icon\">${FEATURES_ICONS[$i]}</span>
                    <div class=\"feature-content\">
                        <h4>$TITLE_ESC</h4>
                        <p>$DESC_ESC</p>
                    </div>
                </div>
"
    done
    
    # 3f. Sostituisci il contenuto del pop-up usando perl
    # Crea file temporaneo con il nuovo contenuto
    cat > /tmp/features_temp.html << ENDOFFEATURES
$FEATURES_HTML
ENDOFFEATURES
    
    # Usa perl per sostituire il contenuto tra <div class="whats-new-body"> e </div>
    perl -i.bak -0777 -pe 's|(<div class="whats-new-body">).*?(</div>\s*<div class="modal-buttons">)|$1`cat /tmp/features_temp.html`            $2|s' index.html
    
    rm -f index.html.bak /tmp/features_temp.html
    
    echo "[OK] index.html aggiornato (badge, cache, titolo, data, novita)"
else
    echo "[WARN] index.html non trovato"
fi

echo ""
echo "==================================="
echo "  Versione aggiornata a v$NEW_VERSION!"
echo "==================================="
echo ""
echo "Prossimi passi:"
echo "  1. Verifica le modifiche"
echo "  2. git add ."
echo "  3. git commit -m \"v$NEW_VERSION - $DESCRIPTION\""
echo "  4. git push"
echo ""
read -p "Vuoi fare il commit e push automaticamente? (s/n): " AUTO_PUSH

if [ "$AUTO_PUSH" = "s" ] || [ "$AUTO_PUSH" = "S" ]; then
    git add .
    git commit -m "v$NEW_VERSION - $DESCRIPTION"
    git push
    echo ""
    echo "[OK] Modifiche caricate su GitHub!"
    echo ""
    echo "Attendi 1-2 minuti per vedere l'aggiornamento online"
    echo ""
    echo "IMPORTANTE PER TESTARE IL POP-UP:"
    echo "  1. Apri l'app su browser"
    echo "  2. Apri Console (F12)"
    echo "  3. Digita: localStorage.removeItem('lastSeenVersion')"
    echo "  4. Ricarica pagina (Cmd+Shift+R)"
    echo "  5. Fai login -> Dovresti vedere il nuovo pop-up!"
else
    echo ""
    echo "Ricorda di fare commit e push manualmente!"
fi

echo ""
echo "Fatto!"