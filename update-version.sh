#!/bin/bash

# Script per aggiornare automaticamente la versione dell'app E il pop-up novita

echo "========================================"
echo "  AGGIORNAMENTO VERSIONE APP MAGAZZINO"
echo "========================================"
echo ""

# Chiedi la nuova versione
read -p "Inserisci la nuova versione (es: 4.4.7): " NEW_VERSION

# Chiedi la descrizione breve per VERSION.md
read -p "Descrizione breve per changelog: " DESCRIPTION

echo ""
echo "Vuoi MOSTRARE il pop-up novit&agrave; per questa versione?"
echo ""
echo "  [s] = S&Igrave;, mostra pop-up (per aggiornamenti IMPORTANTI)"
echo "  [n] = NO, non mostrare (per piccoli fix)"
echo ""
read -p "Mostrare pop-up? (s/n): " SHOW_POPUP

if [ "$SHOW_POPUP" = "s" ] || [ "$SHOW_POPUP" = "S" ]; then
    ENABLE_POPUP=true
    
    echo ""
    echo "Ora inserisci le NOVIT&Agrave; da mostrare nel pop-up (max 4 feature)"
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
    echo "Pop-up NON verr&agrave; mostrato per questa versione."
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
# 2. Aggiorna app.js - Cambia CURRENT_VERSION E SHOW_WHATS_NEW_POPUP
# ============================================
if [ -f "app.js" ]; then
    # Aggiorna versione
    sed -i.bak "s/const CURRENT_VERSION = '[^']*';/const CURRENT_VERSION = '$NEW_VERSION';/" app.js
    
    # Aggiorna flag pop-up
    sed -i.bak "s/const SHOW_WHATS_NEW_POPUP = [^;]*;/const SHOW_WHATS_NEW_POPUP = $ENABLE_POPUP;/" app.js
    
    rm -f app.js.bak
    echo "[OK] app.js aggiornato (CURRENT_VERSION = '$NEW_VERSION', SHOW_POPUP = $ENABLE_POPUP)"
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
    
    # 3c. Titolo del pop-up
    perl -i.bak -pe "s|<h3>&#127881; AGRIMAG v[0-9.]+[^<]*</h3>|<h3>&#127881; AGRIMAG v$NEW_VERSION - Aggiornamento!</h3>|g" index.html
    
    # 3d. Data nel pop-up
    perl -i.bak -pe "s|<p class=\"version-date\">[^<]+</p>|<p class=\"version-date\">$FORMATTED_DATE</p>|g" index.html
    
    # 3e. Genera il nuovo HTML per le novita SOLO se pop-up abilitato
    if [ "$ENABLE_POPUP" = true ]; then
        cat > /tmp/popup_features.html << 'ENDFEATURES'

ENDFEATURES
        
        for i in "${!FEATURES_TITLES[@]}"; do
            cat >> /tmp/popup_features.html << ENDFEATURE
                <div class="new-feature">
                    <span class="feature-icon">${FEATURES_ICONS[$i]}</span>
                    <div class="feature-content">
                        <h4>${FEATURES_TITLES[$i]}</h4>
                        <p>${FEATURES_DESCRIPTIONS[$i]}</p>
                    </div>
                </div>

ENDFEATURE
        done
        
        # 3f. Sostituisci il contenuto usando awk - CORRETTO per evitare duplicati
        awk '
        BEGIN { 
            in_body = 0 
            body_found = 0
        }
        /<div class="whats-new-body">/ {
            if (body_found == 0) {
                print
                system("cat /tmp/popup_features.html")
                printf "            "
                in_body = 1
                body_found = 1
            }
            next
        }
        in_body && /<\/div>/ && !/<div/ {
            print
            in_body = 0
            next
        }
        !in_body {
            print
        }
        ' index.html > index.html.new
        
        mv index.html.new index.html
        rm -f /tmp/popup_features.html
        
        echo "[OK] index.html aggiornato (badge, cache, titolo, data, novit&agrave;)"
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
    echo "Attendi 1-2 minuti per vedere l'aggiornamento online su Vercel"
    
    if [ "$ENABLE_POPUP" = true ]; then
        echo ""
        echo "IMPORTANTE PER TESTARE IL POP-UP:"
        echo "  1. Apri l'app su browser"
        echo "  2. Apri Console (F12)"
        echo "  3. Digita: localStorage.removeItem('lastSeenVersion')"
        echo "  4. Ricarica pagina (Cmd+Shift+R)"
        echo "  5. Fai login -> Dovresti vedere il nuovo pop-up!"
    fi
else
    echo ""
    echo "Ricorda di fare commit e push manualmente!"
fi

echo ""
echo "Fatto!"