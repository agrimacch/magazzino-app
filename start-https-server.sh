#!/bin/bash

# ========================================
# SCRIPT: Avvia Server HTTPS Locale
# Per testare app magazzino con fotocamera iPhone
# ========================================

echo ""
echo "🔒 AVVIO SERVER HTTPS LOCALE"
echo "============================"
echo ""

# Vai nella cartella del progetto
cd ~/Desktop/magazzino-app

# 1. Crea certificato SSL se non esiste
if [ ! -f "localhost.pem" ] || [ ! -f "localhost-key.pem" ]; then
    echo "📜 Creazione certificato SSL autofirmato..."
    echo ""
    
    # Installa mkcert se non è presente
    if ! command -v mkcert &> /dev/null; then
        echo "📦 Installazione mkcert..."
        brew install mkcert
        brew install nss # per Firefox
        mkcert -install
    fi
    
    # Crea certificati
    mkcert -key-file localhost-key.pem -cert-file localhost.pem localhost 127.0.0.1 ::1 $(ipconfig getifaddr en0)
    
    echo ""
    echo "✅ Certificati creati!"
    echo ""
fi

# 2. Trova IP del Mac
IP=$(ipconfig getifaddr en0)

echo "📋 INFORMAZIONI SERVER:"
echo "======================="
echo "IP del Mac: $IP"
echo ""
echo "🌐 Accedi da iPhone/Android:"
echo "   https://$IP:8443"
echo ""
echo "⚠️  IMPORTANTE:"
echo "   1. La prima volta Safari dirà 'Non sicuro'"
echo "   2. Clicca 'Avanzate' → 'Visita sito'"
echo "   3. Poi l'app funzionerà!"
echo ""
echo "🛑 Per fermare il server: Ctrl + C"
echo ""
echo "=================================="
echo ""

# 3. Avvia server HTTPS con Python
python3 << 'PYTHON_SCRIPT'
import http.server
import ssl
import socketserver

PORT = 8443

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Aggiungi header per permettere fotocamera
        self.send_header('Permissions-Policy', 'camera=(self)')
        super().end_headers()

Handler = MyHTTPRequestHandler

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    # Crea contesto SSL
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain('localhost.pem', 'localhost-key.pem')
    
    httpd.socket = context.wrap_socket(httpd.socket, server_side=True)
    
    print("✅ Server HTTPS attivo sulla porta", PORT)
    print("🚀 Pronto per connessioni!\n")
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n\n🛑 Server fermato.")
PYTHON_SCRIPT