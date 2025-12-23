#!/bin/bash

# Script per aggiornare automaticamente la versione dell'app E il pop-up novita

echo "========================================"
echo "  AGGIORNAMENTO VERSIONE APP MAGAZZINO"
echo "========================================"
echo ""

# Chiedi la nuova versione
read -p "Inserisci la nuova versione (es: 4.5.3): " NEW_VERSION

# Chiedi la descrizione breve per VERSION.md
read -p "Descrizione breve per changelog: " DESCRIPTION

echo ""
echo "Vuoi MOSTRARE il pop-up novita per questa versione?"
echo ""
echo "  [s] = SI, mostra pop-up (per aggiornamenti IMPORTANTI)"
echo "  [n] = NO, non mostrare (per piccoli fix)"
echo ""
read -p "Mostrare pop-up? (s/n): " SHOW_POPUP

if [ "$SHOW_POPUP" = "s" ] || [ "$SHOW_POPUP" = "S" ]; then
    ENABLE_POPUP=true
    
    echo ""
    echo "Ora inserisci le NOVITA da mostrare nel pop-up (max 4 feature)"
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
else
    ENABLE_POPUP=false
    echo ""
    echo "Pop-up NON verra mostrato per questa versione."
fi

# Data corrente in formato italiano
MONTHS=("Gennaio" "Febbraio" "Marzo" "Aprile" "Maggio" "Giugno" "Luglio" "Agosto" "Settembre" "Ottobre" "Novembre" "Dicembre")
DAY=$(date +"%d")
MONTH_NUM=$(date +"%m")
MONTH_NUM=$((10#$MONTH_NUM - 1))
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
# 2. Aggiorna app.js
# ============================================
if [ -f "app.js" ]; then
    sed -i.bak "s/const CURRENT_VERSION = '[^']*';/const CURRENT_VERSION = '$NEW_VERSION';/" app.js
    sed -i.bak "s/const SHOW_WHATS_NEW_POPUP = [^;]*;/const SHOW_WHATS_NEW_POPUP = $ENABLE_POPUP;/" app.js
    rm -f app.js.bak
    echo "[OK] app.js aggiornato (CURRENT_VERSION = '$NEW_VERSION', SHOW_POPUP = $ENABLE_POPUP)"
else
    echo "[WARN] app.js non trovato"
fi

# ============================================
# 3. Aggiorna index.html - METODO CON MARKER
# ============================================
if [ -f "index.html" ]; then
    # 3a. Badge versione
    sed -i.bak "s/<div class=\"version-badge\">v[0-9.]*<\/div>/<div class=\"version-badge\">v$NEW_VERSION<\/div>/g" index.html
    
    # 3b. Cache CSS e JS
    sed -i.bak "s/style\.css?v=[0-9.]*/style.css?v=$NEW_VERSION/g" index.html
    sed -i.bak "s/app\.js?v=[0-9.]*/app.js?v=$NEW_VERSION/g" index.html
    
    # 3c. Titolo popup
    perl -i.bak -pe "s|<h3>&#127881; AGRIMAG v[0-9.]+[^<]*</h3>|<h3>&#127881; AGRIMAG v$NEW_VERSION - Aggiornamento!</h3>|g" index.html
    
    # 3d. Data popup
    perl -i.bak -pe "s|<p class=\"version-date\">[^<]+</p>|<p class=\"version-date\">$FORMATTED_DATE</p>|g" index.html
    
    # 3e. SOSTITUISCI CONTENUTO TRA I MARKER
    if [ "$ENABLE_POPUP" = true ]; then
        # Crea il nuovo contenuto
        cat > /tmp/new_features.txt << 'MARKER_START'
            <!-- INIZIO_FEATURES -->
            <div class="whats-new-body">
MARKER_START
        
        # Aggiungi le features
        for i in "${!FEATURES_TITLES[@]}"; do
            ICON="${FEATURES_ICONS[$i]}"
            TITLE="${FEATURES_TITLES[$i]}"
            DESC="${FEATURES_DESCRIPTIONS[$i]}"
            
            cat >> /tmp/new_features.txt << FEATURE_EOF

                <div class="new-feature">
                    <span class="feature-icon">$ICON</span>
                    <div class="feature-content">
                        <h4>$TITLE</h4>
                        <p>$DESC</p>
                    </div>
                </div>
FEATURE_EOF
        done
        
        # Chiudi
        cat >> /tmp/new_features.txt << 'MARKER_END'

            </div>
            <!-- FINE_FEATURES -->
MARKER_END
        
        # Sostituisci usando sed TRA I MARKER
        sed -i.bak '/<!-- INIZIO_FEATURES -->/,/<!-- FINE_FEATURES -->/{ 
            /<!-- INIZIO_FEATURES -->/r /tmp/new_features.txt
            d
        }' index.html
        
        rm -f /tmp/new_features.txt
        echo "[OK] index.html aggiornato (badge, cache, titolo, data, novita)"
    else
        echo "[OK] index.html aggiornato (badge, cache - pop-up NON modificato)"
    fi
    
    rm -f index.html.bak
else
    echo "[WARN] index.html non trovato"
fi

echo ""
echo "==================================="
echo "  Versione aggiornata a v$NEW_VERSION!"
if [ "$ENABLE_POPUP" = true ]; then
    echo "  Pop-up: ABILITATO"
else
    echo "  Pop-up: DISABILITATO"
fi
echo "==================================="
echo ""
read -p "Vuoi fare il commit e push automaticamente? (s/n): " AUTO_PUSH

if [ "$AUTO_PUSH" = "s" ] || [ "$AUTO_PUSH" = "S" ]; then
    git add .
    git commit -m "v$NEW_VERSION - $DESCRIPTION"
    git push
    echo ""
    echo "[OK] Modifiche caricate su GitHub!"
    echo ""
    echo "Attendi 1-2 minuti per l'aggiornamento online"
    
    if [ "$ENABLE_POPUP" = true ]; then
        echo ""
        echo "PER TESTARE IL POP-UP:"
        echo "  Console (F12) -> localStorage.removeItem('lastSeenVersion')"
        echo "  Refresh (Cmd+Shift+R)"
        echo "  Login"
    fi
else
    echo ""
    echo "Ricorda di fare commit e push manualmente!"
fi

echo ""
echo "Fatto!"