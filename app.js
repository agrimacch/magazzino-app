// ========================================
// CONFIGURAZIONE SUPABASE
// ========================================
const SUPABASE_URL = 'https://uiypndhemhgljceylqzl.supabase.co';  
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpeXBuZGhlbWhnbGpjZXlscXpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE2NTc2NDIsImV4cCI6MjA3NzIzMzY0Mn0.zyVrgj3JZaCmOoAGCugPDfEjdEyNj-elbiFFXZJkRmU';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ========================================
// VARIABILI GLOBALI
// ========================================
const CURRENT_VERSION = '4.7.0';
const SHOW_WHATS_NEW_POPUP = true;

let currentUser = null;
let currentUserRole = null;
let loggedInUserEmail = null;
let allArticles = [];
let allMovements = [];
let currentArticleForMovement = null;
let html5QrCode = null;
let audioContext = null;
let audioInitialized = false;
let userInitials = {};

// Variabili per ricambi
let allRicambi = [];
let allMovementsRicambi = [];
let currentRicambioForMovement = null;

// Variabile per sezione attiva
let currentSection = 'dashboard';

// ========================================
// FUNZIONI PERSISTENZA FILTRI
// ========================================

function saveInventoryFilters() {
    const filters = {
        brand: document.getElementById('filter-brand')?.value || '',
        search: document.getElementById('search-input')?.value || '',
        sort: document.getElementById('sort-select')?.value || 'fornitore-asc',
        group: document.getElementById('group-by-supplier')?.checked !== false
    };
    sessionStorage.setItem('inventoryFilters', JSON.stringify(filters));
}

function restoreInventoryFilters() {
    const saved = sessionStorage.getItem('inventoryFilters');
    if (saved) {
        try {
            const filters = JSON.parse(saved);
            if (document.getElementById('filter-brand')) {
                document.getElementById('filter-brand').value = filters.brand || '';
                document.getElementById('search-input').value = filters.search || '';
                document.getElementById('sort-select').value = filters.sort || 'fornitore-asc';
                document.getElementById('group-by-supplier').checked = filters.group !== false;
            }
        } catch(e) {
            console.error('Errore ripristino filtri inventario:', e);
        }
    }
}

function saveMovementFilters() {
    const filters = {
        type: document.getElementById('filter-movement-type')?.value || '',
        dateFrom: document.getElementById('filter-date-from')?.value || '',
        dateTo: document.getElementById('filter-date-to')?.value || ''
    };
    sessionStorage.setItem('movementFilters', JSON.stringify(filters));
}

function restoreMovementFilters() {
    const saved = sessionStorage.getItem('movementFilters');
    if (saved) {
        try {
            const filters = JSON.parse(saved);
            if (document.getElementById('filter-movement-type')) {
                document.getElementById('filter-movement-type').value = filters.type || '';
                document.getElementById('filter-date-from').value = filters.dateFrom || '';
                document.getElementById('filter-date-to').value = filters.dateTo || '';
            }
        } catch(e) {
            console.error('Errore ripristino filtri movimenti:', e);
        }
    }
}

// ========================================
// INIZIALIZZAZIONE AUDIO (iOS FIX)
// ========================================
function initAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    
    audioInitialized = true;
}

// ========================================
// FUNZIONI AUDIO PER SCANNER
// ========================================
function playSuccessSound() {
    if (!audioContext || !audioInitialized) {
        initAudioContext();
    }
    
    try {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 1200;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.15);
    } catch (e) {
        console.log('Audio non disponibile:', e);
    }
}

function playErrorSound() {
    if (!audioContext || !audioInitialized) {
        initAudioContext();
    }
    
    try {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 250;
        oscillator.type = 'sawtooth';
        
        gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0, audioContext.currentTime + 0.08);
        gainNode.gain.setValueAtTime(0.5, audioContext.currentTime + 0.12);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.25);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.25);
    } catch (e) {
        console.log('Audio non disponibile:', e);
    }
}

// ========================================
// FEEDBACK VISIVO
// ========================================
function showVisualFeedback(type) {
    const feedbackDiv = document.createElement('div');
    feedbackDiv.style.position = 'fixed';
    feedbackDiv.style.top = '50%';
    feedbackDiv.style.left = '50%';
    feedbackDiv.style.transform = 'translate(-50%, -50%)';
    feedbackDiv.style.zIndex = '9999';
    feedbackDiv.style.padding = '30px 50px';
    feedbackDiv.style.borderRadius = '20px';
    feedbackDiv.style.fontSize = '48px';
    feedbackDiv.style.fontWeight = 'bold';
    feedbackDiv.style.color = 'white';
    feedbackDiv.style.textAlign = 'center';
    feedbackDiv.style.boxShadow = '0 8px 32px rgba(0,0,0,0.4)';
    feedbackDiv.style.animation = 'feedbackPulse 0.3s ease-out';
    
    if (type === 'success') {
        feedbackDiv.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
        feedbackDiv.innerHTML = '&#10004; TROVATO!';
    } else {
        feedbackDiv.style.background = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
        feedbackDiv.innerHTML = '&#10060; NON TROVATO';
    }
    
    if (!document.getElementById('feedback-animation-style')) {
        const style = document.createElement('style');
        style.id = 'feedback-animation-style';
        style.textContent = `
            @keyframes feedbackPulse {
                0% { transform: translate(-50%, -50%) scale(0.8); opacity: 0; }
                50% { transform: translate(-50%, -50%) scale(1.05); }
                100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }
    
    document.body.appendChild(feedbackDiv);
    
    const displayTime = type === 'success' ? 1200 : 1800;
    setTimeout(() => {
        feedbackDiv.style.opacity = '0';
        feedbackDiv.style.transition = 'opacity 0.3s ease-out';
        setTimeout(() => feedbackDiv.remove(), 300);
    }, displayTime);
}

// ========================================
// GESTIONE "RESTA CONNESSO"
// ========================================
function saveCredentials(email, password) {
    localStorage.setItem('savedEmail', email);
    localStorage.setItem('savedPassword', password);
    localStorage.setItem('rememberMe', 'true');
}

function loadSavedCredentials() {
    const rememberMe = localStorage.getItem('rememberMe') === 'true';
    if (rememberMe) {
        const email = localStorage.getItem('savedEmail');
        const password = localStorage.getItem('savedPassword');
        if (email && password) {
            document.getElementById('login-email').value = email;
            document.getElementById('login-password').value = password;
            document.getElementById('remember-me').checked = true;
        }
    }
}

function clearSavedCredentials() {
    localStorage.removeItem('savedEmail');
    localStorage.removeItem('savedPassword');
    localStorage.removeItem('rememberMe');
}

// ========================================
// SISTEMA POP-UP NOVITA VERSIONE
// ========================================
function checkAndShowWhatsNew() {
    if (!SHOW_WHATS_NEW_POPUP) {
        localStorage.setItem('lastSeenVersion', CURRENT_VERSION);
        return;
    }
    
    const lastSeenVersion = localStorage.getItem('lastSeenVersion');
    
    if (lastSeenVersion !== CURRENT_VERSION) {
        showWhatsNewModal();
    }
}

function showWhatsNewModal() {
    const modal = document.getElementById('whats-new-modal');
    if (!modal) return;
    
    modal.classList.remove('hidden');
    
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closeWhatsNewModal();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
}

function closeWhatsNewModal() {
    const modal = document.getElementById('whats-new-modal');
    if (!modal) return;
    
    modal.classList.add('hidden');
    localStorage.setItem('lastSeenVersion', CURRENT_VERSION);
}

// ========================================
// FUNZIONE HELPER PER CALCOLO PREZZO CON IVA
// ========================================
function calcolaPrezzoConIVA(prezzoNetto, ivaPercentuale) {
    return prezzoNetto * (1 + (ivaPercentuale / 100));
}

// ========================================
// INIZIALIZZAZIONE
// ========================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Inizializzazione app...');
    
    if (!SHOW_WHATS_NEW_POPUP) {
        const whatsNewModal = document.getElementById('whats-new-modal');
        if (whatsNewModal) {
            whatsNewModal.remove();
        }
        localStorage.setItem('lastSeenVersion', CURRENT_VERSION);
    }
    
    sessionStorage.removeItem('inventoryFilters');
    sessionStorage.removeItem('movementFilters');
    
    loadSavedCredentials();
    
    document.addEventListener('touchstart', function initAudio() {
        initAudioContext();
        document.removeEventListener('touchstart', initAudio);
    }, { once: true });
    
    const { data: { session } } = await supabaseClient.auth.getSession();
    
    if (session) {
        currentUser = session.user;
        loggedInUserEmail = session.user.email;
        await loadUserRole();
        showMainScreen();
    } else {
        showLoginScreen();
    }
    
    document.body.classList.remove('loading');
    document.body.classList.add('ready');
    
    setupEventListeners();
    
    initPWAFeatures();
    
    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') {
            currentUser = null;
            currentUserRole = null;
            loggedInUserEmail = null;
            showLoginScreen();
        } else if (event === 'SIGNED_IN' && session) {
            currentUser = session.user;
            loggedInUserEmail = session.user.email;
            loadUserRole().then(() => showMainScreen());
        }
    });
});

// ========================================
// GESTIONE RUOLI
// ========================================
async function loadUserRole() {
    const { data, error } = await supabaseClient
        .from('user_roles')
        .select('role')
        .eq('email', currentUser.email)
        .single();
    
    if (error || !data) {
        currentUserRole = 'operatore';
    } else {
        currentUserRole = data.role;
    }
    
    applyRolePermissions();
}

function applyRolePermissions() {
    const roleBadge = document.getElementById('user-role');
    
    roleBadge.classList.remove('admin', 'operatore');
    
    roleBadge.innerHTML = currentUserRole === 'admin' ? '&#128081; Admin' : '&#128100; Operatore';
    roleBadge.classList.add(currentUserRole);
    
    // Gestione visibilit&agrave; card dashboard
    const utentiCard = document.getElementById('dashboard-utenti-card');
    if (utentiCard) {
        if (currentUserRole === 'operatore') {
            utentiCard.style.display = 'none';
        } else {
            utentiCard.style.display = 'flex';
        }
    }
    
    // Gestione tab report (solo admin)
    const tabReportBtn = document.getElementById('tab-report-btn');
    if (tabReportBtn) {
        tabReportBtn.style.display = currentUserRole === 'admin' ? 'inline-flex' : 'none';
    }
    
    const tabRicambiReportBtn = document.getElementById('tab-ricambi-report-btn');
    if (tabRicambiReportBtn) {
        tabRicambiReportBtn.style.display = currentUserRole === 'admin' ? 'inline-flex' : 'none';
    }
}

// ========================================
// GESTIONE SCHERMATE
// ========================================
function showLoginScreen() {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('login-screen').classList.add('active');
}

async function showMainScreen() {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('main-screen').classList.add('active');
    
    // Carica dati PRIMA di ripristinare la sezione
    await loadAllUsers();
    loadInventory();
    loadMovements();
    loadRicambi();
    loadMovementsRicambi();
    
    if (currentUserRole === 'admin') {
        populateReportSelects();
        populateReportRicambiSelects();
    }
    
    // Ripristina sezione salvata o mostra dashboard
    const savedSection = sessionStorage.getItem('currentSection');
    const savedTab = sessionStorage.getItem('currentTab');
    
    if (savedSection && savedSection !== 'dashboard') {
        // Ripristina la sezione dove eravamo
        openSection(savedSection);
        
        // Ripristina anche la tab se salvata
        if (savedTab) {
            switchTab(savedTab);
        }
    } else {
        // Prima volta o era sulla dashboard
        showDashboard();
    }
    
    checkAndShowWhatsNew();
}

// ========================================
// NAVIGAZIONE DASHBOARD E SEZIONI
// ========================================
function showDashboard() {
    currentSection = 'dashboard';
    
    // Salva stato in sessionStorage
    sessionStorage.setItem('currentSection', 'dashboard');
    sessionStorage.removeItem('currentTab');
    
    // Nascondi tutte le sezioni
    document.querySelectorAll('.section-container').forEach(s => s.classList.add('hidden'));
    
    // Mostra dashboard
    document.getElementById('dashboard-view').style.display = 'block';
    
    // Ferma scanner se attivo
    stopScanner();
}

function openSection(sectionName) {
    currentSection = sectionName;
    
    // Salva sezione in sessionStorage
    sessionStorage.setItem('currentSection', sectionName);
    
    // Nascondi dashboard
    document.getElementById('dashboard-view').style.display = 'none';
    
    // Nascondi tutte le sezioni
    document.querySelectorAll('.section-container').forEach(s => s.classList.add('hidden'));
    
    // Mostra la sezione richiesta
    const sectionId = 'section-' + sectionName;
    const section = document.getElementById(sectionId);
    if (section) {
        section.classList.remove('hidden');
    }
    
    // Azioni specifiche per sezione
    if (sectionName === 'consumabili') {
        restoreInventoryFilters();
        applyFiltersAndSort();
    } else if (sectionName === 'ricambi') {
        restoreRicambiFilters();
        applyRicambiFiltersAndSort();
    } else if (sectionName === 'scanner') {
        setTimeout(() => initScanner(), 100);
    } else if (sectionName === 'utenti') {
        renderUsersList();
    }
}

function backToDashboard() {
    showDashboard();
}

// Esponi funzioni globalmente
window.openSection = openSection;
window.backToDashboard = backToDashboard;

// ========================================
// NAVIGAZIONE TAB INTERNE
// ========================================
function switchTab(tabName, sectionPrefix) {
    // Salva tab corrente in sessionStorage
    sessionStorage.setItem('currentTab', tabName);
    
    // Determina il prefisso basato sulla sezione corrente
    let prefix = '';
    let tabsContainer = null;
    
    if (currentSection === 'consumabili' || !sectionPrefix) {
        prefix = '';
        tabsContainer = document.getElementById('tabs-consumabili');
    } else if (currentSection === 'ricambi' || sectionPrefix === 'ricambi') {
        prefix = 'ricambi-';
        tabsContainer = document.getElementById('tabs-ricambi');
    }
    
    // Rimuovi active da tutti i tab button nella sezione
    if (tabsContainer) {
        tabsContainer.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    }
    
    // Trova e attiva il tab button corretto
    const tabBtn = tabsContainer?.querySelector(`[data-tab="${prefix}${tabName}"]`) || 
                   tabsContainer?.querySelector(`[data-tab="${tabName}"]`);
    if (tabBtn) {
        tabBtn.classList.add('active');
    }
    
    // Nascondi tutti i tab content della sezione
    const sectionContainer = document.getElementById('section-' + currentSection);
    if (sectionContainer) {
        sectionContainer.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
    }
    
    // Mostra il tab content richiesto
    const tabId = prefix ? `tab-${prefix}${tabName}` : `tab-${tabName}`;
    const tabContent = document.getElementById(tabId) || document.getElementById(`tab-${tabName}`);
    if (tabContent) {
        tabContent.classList.add('active');
    }
    
    // Azioni specifiche per tab
    if (tabName === 'inventario' && currentSection === 'consumabili') {
        restoreInventoryFilters();
        applyFiltersAndSort();
    } else if (tabName === 'movimenti' && currentSection === 'consumabili') {
        restoreMovementFilters();
        applyMovementFilters();
    } else if (tabName === 'report' && currentUserRole === 'admin') {
        populateReportSelects();
    } else if (tabName === 'inventario' && currentSection === 'ricambi') {
        restoreRicambiFilters();
        applyRicambiFiltersAndSort();
    } else if (tabName === 'movimenti' && currentSection === 'ricambi') {
        restoreMovementRicambiFilters();
        applyMovementRicambiFilters();
    } else if (tabName === 'report' && currentSection === 'ricambi' && currentUserRole === 'admin') {
        populateReportRicambiSelects();
    }
}

// ========================================
// AUTENTICAZIONE
// ========================================
async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const rememberMe = document.getElementById('remember-me').checked;
    
    const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password
    });
    
    if (error) {
        alert('Errore login: ' + error.message);
        return;
    }
    
    if (rememberMe) {
        saveCredentials(email, password);
    } else {
        clearSavedCredentials();
    }
    
    currentUser = data.user;
    await loadUserRole();
    showMainScreen();
}

async function handleLogout() {
    // Pulisci tutti i filtri e stati salvati
    sessionStorage.removeItem('inventoryFilters');
    sessionStorage.removeItem('movementFilters');
    sessionStorage.removeItem('currentSection');
    sessionStorage.removeItem('currentTab');
    
    await supabaseClient.auth.signOut();
    currentUser = null;
    currentUserRole = null;
    loggedInUserEmail = null;
    
    location.reload();
}

function togglePasswordVisibility() {
    const passwordInput = document.getElementById('login-password');
    const toggleBtn = document.getElementById('toggle-password');
    
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        toggleBtn.innerHTML = '&#128070;';
    } else {
        passwordInput.type = 'password';
        toggleBtn.innerHTML = '&#128065;';
    }
}

// ========================================
// GESTIONE ARTICOLI
// ========================================
async function loadInventory() {
    const { data, error } = await supabaseClient
        .from('articoli')
        .select('*')
        .order('marca_fornitore, nome');
    
    if (error) {
        console.error('Errore caricamento inventario:', error);
        return;
    }
    
    allArticles = data || [];
    populateBrandFilter();
    restoreInventoryFilters();
    applyFiltersAndSort();
}

function populateBrandFilter() {
    const brands = [...new Set(allArticles.map(a => a.marca_fornitore).filter(Boolean))];
    const select = document.getElementById('filter-brand');
    
    const currentValue = select.value;
    
    select.innerHTML = '<option value="">Tutti i fornitori</option>';
    brands.sort().forEach(brand => {
        const option = document.createElement('option');
        option.value = brand;
        option.textContent = brand;
        select.appendChild(option);
    });
    
    if (currentValue && brands.includes(currentValue)) {
        select.value = currentValue;
    }
}

function applyFiltersAndSort() {
    saveInventoryFilters();
    
    const searchQuery = document.getElementById('search-input').value.toLowerCase();
    const brandFilter = document.getElementById('filter-brand').value;
    const sortValue = document.getElementById('sort-select').value;
    const groupBySupplier = document.getElementById('group-by-supplier').checked;
    
    let filtered = allArticles.filter(article => {
        const matchesSearch = 
            article.nome.toLowerCase().includes(searchQuery) ||
            article.codice_articolo.toLowerCase().includes(searchQuery) ||
            article.codice_barre.includes(searchQuery) ||
            (article.marca_fornitore && article.marca_fornitore.toLowerCase().includes(searchQuery)) ||
            (article.descrizione && article.descrizione.toLowerCase().includes(searchQuery)) ||
            (article.note && article.note.toLowerCase().includes(searchQuery));
        
        const matchesBrand = !brandFilter || article.marca_fornitore === brandFilter;
        
        return matchesSearch && matchesBrand;
    });
    
    const [sortField, sortOrder] = sortValue.split('-');
    
    filtered.sort((a, b) => {
        let valA, valB;
        
        if (sortField === 'nome') {
            valA = a.nome.toLowerCase();
            valB = b.nome.toLowerCase();
        } else if (sortField === 'quantita') {
            valA = a.quantita;
            valB = b.quantita;
        } else if (sortField === 'fornitore') {
            valA = (a.marca_fornitore || 'ZZZ').toLowerCase();
            valB = (b.marca_fornitore || 'ZZZ').toLowerCase();
        }
        
        if (sortOrder === 'asc') {
            return valA > valB ? 1 : -1;
        } else {
            return valA < valB ? 1 : -1;
        }
    });
    
    if (groupBySupplier) {
        renderInventoryBySupplier(filtered);
    } else {
        renderInventoryFlat(filtered);
    }
}

function renderInventoryBySupplier(articles) {
    const container = document.getElementById('inventory-container');
    container.innerHTML = '';
    
    if (articles.length === 0) {
        container.innerHTML = '<div class="card"><p style="text-align:center">Nessun articolo trovato</p></div>';
        return;
    }
    
    const groupedBySupplier = {};
    
    articles.forEach(article => {
        const supplier = article.marca_fornitore || 'Senza Fornitore';
        if (!groupedBySupplier[supplier]) {
            groupedBySupplier[supplier] = [];
        }
        groupedBySupplier[supplier].push(article);
    });
    
    Object.keys(groupedBySupplier).sort().forEach(supplier => {
        const supplierArticles = groupedBySupplier[supplier];
        const totalValue = supplierArticles.reduce((sum, a) => {
            const ivaPerc = a.iva_percentuale || 22;
            const prezzoConIVA = calcolaPrezzoConIVA(a.prezzo_acquisto, ivaPerc);
            return sum + (a.quantita * prezzoConIVA);
        }, 0);
        const lowStockCount = supplierArticles.filter(a => a.quantita <= a.soglia_minima).length;
        
        const section = document.createElement('div');
        section.className = 'supplier-section';
        
        section.innerHTML = `
            <div class="supplier-header">
                <h3>&#127970; ${supplier}</h3>
                <div class="supplier-stats">
                    <div class="stat-item">
                        <span class="stat-label">Articoli</span>
                        <span class="stat-value">${supplierArticles.length}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Valore Magazzino</span>
                        <span class="stat-value">&#8364; ${totalValue.toFixed(2)}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Sotto Soglia</span>
                        <span class="stat-value ${lowStockCount > 0 ? 'warning' : ''}">${lowStockCount}</span>
                    </div>
                </div>
            </div>
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Nome</th>
                            <th>Codice</th>
                            <th>Qty</th>
                            <th>Soglia</th>
                            <th>Pr. Acq. NETTO</th>
                            <th>IVA %</th>
                            <th>Pr. Vend.</th>
                            <th>Barcode</th>
                            <th>Note</th>
                            <th>Azioni</th>
                        </tr>
                    </thead>
                    <tbody id="supplier-tbody-${supplier.replace(/\s+/g, '-')}">
                    </tbody>
                </table>
            </div>
        `;
        
        container.appendChild(section);
        
        const tbody = section.querySelector('tbody');
        supplierArticles.forEach(article => {
            const row = document.createElement('tr');
            
            if (article.quantita <= article.soglia_minima) {
                row.classList.add('low-stock');
            }
            
            const ivaPerc = article.iva_percentuale || 22;
            const editBtn = `<button onclick="openEditModal(${article.id})" class="btn-edit">&#9997;</button>`;
            const deleteBtn = `<button onclick="deleteArticle(${article.id})" class="btn-delete">&#128465;</button>`;
            
            row.innerHTML = `
                <td><strong>${article.nome}</strong></td>
                <td>${article.codice_articolo}</td>
                <td><strong>${article.quantita}</strong></td>
                <td>${article.soglia_minima}</td>
                <td>&#8364; ${parseFloat(article.prezzo_acquisto).toFixed(2)}</td>
                <td>${ivaPerc}%</td>
                <td>&#8364; ${parseFloat(article.prezzo_vendita).toFixed(2)}</td>
                <td>${article.codice_barre}</td>
                <td>${article.note || '-'}</td>
                <td>
                    <div class="action-buttons-grid">
                        <button onclick="openMovementModal(${article.id}, 'carico')" class="btn-success">&#10133;</button>
                        <button onclick="openMovementModal(${article.id}, 'scarico')" class="btn-danger">&#10134;</button>
                        ${editBtn}
                        ${deleteBtn}
                    </div>
                </td>
            `;
            
            tbody.appendChild(row);
        });
    });
}

function renderInventoryFlat(articles) {
    const container = document.getElementById('inventory-container');
    
    if (articles.length === 0) {
        container.innerHTML = '<div class="card"><p style="text-align:center">Nessun articolo trovato</p></div>';
        return;
    }
    
    let html = `
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>Nome</th>
                        <th>Codice</th>
                        <th>Qty</th>
                        <th>Soglia</th>
                        <th>Pr. Acq. NETTO</th>
                        <th>IVA %</th>
                        <th>Pr. Vend.</th>
                        <th>Barcode</th>
                        <th>Fornitore</th>
                        <th>Note</th>
                        <th>Azioni</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    articles.forEach(article => {
        const rowClass = article.quantita <= article.soglia_minima ? 'class="low-stock"' : '';
        const ivaPerc = article.iva_percentuale || 22;
        const editBtn = `<button onclick="openEditModal(${article.id})" class="btn-edit">&#9997;</button>`;
        const deleteBtn = `<button onclick="deleteArticle(${article.id})" class="btn-delete">&#128465;</button>`;
        
        html += `
            <tr ${rowClass}>
                <td><strong>${article.nome}</strong></td>
                <td>${article.codice_articolo}</td>
                <td><strong>${article.quantita}</strong></td>
                <td>${article.soglia_minima}</td>
                <td>&#8364; ${parseFloat(article.prezzo_acquisto).toFixed(2)}</td>
                <td>${ivaPerc}%</td>
                <td>&#8364; ${parseFloat(article.prezzo_vendita).toFixed(2)}</td>
                <td>${article.codice_barre}</td>
                <td>${article.marca_fornitore || '-'}</td>
                <td>${article.note || '-'}</td>
                <td>
                    <div class="action-buttons-grid">
                        <button onclick="openMovementModal(${article.id}, 'carico')" class="btn-success">&#10133;</button>
                        <button onclick="openMovementModal(${article.id}, 'scarico')" class="btn-danger">&#10134;</button>
                        ${editBtn}
                        ${deleteBtn}
                    </div>
                </td>
            </tr>
        `;
    });
    
    html += `
                </tbody>
            </table>
        </div>
    `;
    
    container.innerHTML = html;
}

async function handleNewArticle(e) {
    e.preventDefault();
    
    // Converti tutto in maiuscolo
    const name = document.getElementById('new-name').value.toUpperCase();
    const code = document.getElementById('new-code').value.toUpperCase();
    const barcode = document.getElementById('new-barcode').value.toUpperCase();
    const brand = document.getElementById('new-brand').value.toUpperCase();
    const description = document.getElementById('new-description').value.trim().toUpperCase();
    const notes = document.getElementById('new-notes').value.trim().toUpperCase();
    const quantity = parseInt(document.getElementById('new-quantity').value);
    const threshold = parseInt(document.getElementById('new-threshold').value);
    const priceBuy = parseFloat(document.getElementById('new-price-buy').value);
    const iva = parseFloat(document.getElementById('new-iva').value);
    const price = parseFloat(document.getElementById('new-price').value);
    
    const { data: existingCode } = await supabaseClient
        .from('articoli')
        .select('id')
        .eq('codice_articolo', code)
        .single();
    
    if (existingCode) {
        alert('Codice articolo gi\u00E0 esistente!');
        return;
    }
    
    const { data: existingBarcode } = await supabaseClient
        .from('articoli')
        .select('id')
        .eq('codice_barre', barcode)
        .single();
    
    if (existingBarcode) {
        alert('Codice a barre gi\u00E0 esistente!');
        return;
    }
    
    const { data: newArticle, error } = await supabaseClient
        .from('articoli')
        .insert([{
            nome: name,
            codice_articolo: code,
            codice_barre: barcode,
            marca_fornitore: brand || null,
            descrizione: description || null,
            note: notes || null,
            quantita: quantity,
            soglia_minima: threshold,
            prezzo_acquisto: priceBuy,
            iva_percentuale: iva,
            prezzo_vendita: price
        }])
        .select('id')
        .single();
    
    if (error) {
        alert('Errore durante il salvataggio: ' + error.message);
        return;
    }
    
    if (quantity > 0 && newArticle) {
        const { error: movementError } = await supabaseClient
            .from('movimenti')
            .insert([{
                articolo_id: newArticle.id,
                tipo: 'carico',
                quantita: quantity,
                utente: currentUser.email,
                note: 'Carico da creazione articolo'
            }]);
        
        if (movementError) {
            console.error('Errore registrazione movimento iniziale:', movementError);
        }
    }
    
    alert('Articolo aggiunto con successo!');
    document.getElementById('new-article-form').reset();
    document.getElementById('new-quantity').value = 0;
    document.getElementById('new-threshold').value = 10;
    document.getElementById('new-iva').value = 22;
    loadInventory();
    loadMovements();
    
    switchTab('inventario');
}

// ========================================
// MODIFICA E CANCELLAZIONE ARTICOLI
// ========================================
function openEditModal(articleId) {
    const article = allArticles.find(a => a.id === articleId);
    if (!article) return;
    
    document.getElementById('edit-id').value = article.id;
    document.getElementById('edit-name').value = article.nome;
    document.getElementById('edit-code').value = article.codice_articolo;
    document.getElementById('edit-barcode').value = article.codice_barre;
    document.getElementById('edit-brand').value = article.marca_fornitore || '';
    document.getElementById('edit-description').value = article.descrizione || '';
    document.getElementById('edit-notes').value = article.note || '';
    document.getElementById('edit-quantity').value = article.quantita;
    document.getElementById('edit-threshold').value = article.soglia_minima;
    document.getElementById('edit-price-buy').value = article.prezzo_acquisto;
    document.getElementById('edit-iva').value = article.iva_percentuale || 22;
    document.getElementById('edit-price').value = article.prezzo_vendita;
    
    document.getElementById('edit-modal').classList.remove('hidden');
}

async function handleEditArticle(e) {
    e.preventDefault();
    
    const id = parseInt(document.getElementById('edit-id').value);
    // Converti tutto in maiuscolo
    const name = document.getElementById('edit-name').value.toUpperCase();
    const code = document.getElementById('edit-code').value.toUpperCase();
    const barcode = document.getElementById('edit-barcode').value.toUpperCase();
    const brand = document.getElementById('edit-brand').value.toUpperCase();
    const description = document.getElementById('edit-description').value.trim().toUpperCase();
    const notes = document.getElementById('edit-notes').value.trim().toUpperCase();
    const quantity = parseInt(document.getElementById('edit-quantity').value);
    const threshold = parseInt(document.getElementById('edit-threshold').value);
    const priceBuy = parseFloat(document.getElementById('edit-price-buy').value);
    const iva = parseFloat(document.getElementById('edit-iva').value);
    const price = parseFloat(document.getElementById('edit-price').value);
    
    const { error } = await supabaseClient
        .from('articoli')
        .update({
            nome: name,
            codice_articolo: code,
            codice_barre: barcode,
            marca_fornitore: brand || null,
            descrizione: description || null,
            note: notes || null,
            quantita: quantity,
            soglia_minima: threshold,
            prezzo_acquisto: priceBuy,
            iva_percentuale: iva,
            prezzo_vendita: price
        })
        .eq('id', id);
    
    if (error) {
        alert('Errore durante la modifica: ' + error.message);
        return;
    }
    
    alert('Articolo modificato con successo!');
    closeEditModal();
    loadInventory();
}

function closeEditModal() {
    document.getElementById('edit-modal').classList.add('hidden');
}

async function deleteArticle(articleId) {
    const article = allArticles.find(a => a.id === articleId);
    if (!article) return;
    
    const confirm = window.confirm('Sei sicuro di voler eliminare "' + article.nome + '"?\n\nQuesta azione non pu\u00F2 essere annullata.');
    
    if (!confirm) return;
    
    const { error } = await supabaseClient
        .from('articoli')
        .delete()
        .eq('id', articleId);
    
    if (error) {
        alert('Errore durante l\'eliminazione: ' + error.message);
        return;
    }
    
    alert('Articolo eliminato con successo!');
    loadInventory();
}

// ========================================
// MOVIMENTI MAGAZZINO
// ========================================
function openMovementModal(articleId, type) {
    const article = allArticles.find(a => a.id === articleId);
    if (!article) return;
    
    currentArticleForMovement = { article, type };
    
    document.getElementById('modal-title').innerHTML = 
        type === 'carico' ? '&#10133; Carico Magazzino' : '&#10134; Scarico Magazzino';
    document.getElementById('modal-article-name').textContent = article.nome;
    document.getElementById('modal-current-qty').textContent = article.quantita;
    document.getElementById('modal-quantity').value = 1;
    document.getElementById('modal-notes').value = '';
    
    document.getElementById('movement-modal').classList.remove('hidden');
}

async function confirmMovement() {
    if (!currentArticleForMovement) return;
    
    const { article, type } = currentArticleForMovement;
    const quantity = parseInt(document.getElementById('modal-quantity').value);
    const notes = document.getElementById('modal-notes').value.trim();
    
    if (quantity <= 0) {
        alert('Quantit\u00E0 non valida');
        return;
    }
    
    let newQuantity = article.quantita;
    if (type === 'carico') {
        newQuantity += quantity;
    } else {
        newQuantity -= quantity;
        if (newQuantity < 0) {
            alert('Quantit\u00E0 insufficiente in magazzino!');
            return;
        }
    }
    
    const { error: updateError } = await supabaseClient
        .from('articoli')
        .update({ quantita: newQuantity })
        .eq('id', article.id);
    
    if (updateError) {
        alert('Errore aggiornamento: ' + updateError.message);
        return;
    }
    
    const { error: movementError } = await supabaseClient
        .from('movimenti')
        .insert([{
            articolo_id: article.id,
            tipo: type,
            quantita: quantity,
            utente: currentUser.email,
            note: notes || null
        }]);
    
    if (movementError) {
        console.error('Errore registrazione movimento:', movementError);
    }
    
    closeMovementModal();
    loadInventory();
    loadMovements();
    
    if (type === 'scarico' && newQuantity <= article.soglia_minima) {
        alert('\u26A0\uFE0F ATTENZIONE!\n\nL\'articolo "' + article.nome + '" \u00C8 SOTTO SOGLIA!\n\nQuantit\u00E0 attuale: ' + newQuantity + '\nSoglia minima: ' + article.soglia_minima + '\n\n\uD83D\uDED2 \u00C8 necessario riordinare!');
    } else {
        alert((type === 'carico' ? 'Carico' : 'Scarico') + ' completato!');
    }
    
    // Se siamo nella sezione scanner, torna a scansionare
    if (currentSection === 'scanner') {
        setTimeout(() => {
            document.getElementById('reader').style.display = 'block';
            initScanner();
        }, 1000);
    }
}

function closeMovementModal() {
    document.getElementById('movement-modal').classList.add('hidden');
    currentArticleForMovement = null;
}

// ========================================
// STORICO MOVIMENTI
// ========================================
async function loadMovements() {
    const { data, error } = await supabaseClient
        .from('movimenti')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
    
    if (error) {
        console.error('Errore caricamento movimenti:', error);
        return;
    }
    
    allMovements = data || [];
    restoreMovementFilters();
    renderMovements(allMovements);
}

function renderMovements(movements) {
    const tbody = document.getElementById('movements-tbody');
    tbody.innerHTML = '';
    
    if (!movements || movements.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center">Nessun movimento registrato</td></tr>';
        return;
    }
    
    movements.forEach(movement => {
        const row = document.createElement('tr');
        
        const fullDate = new Date(movement.created_at).toLocaleString('it-IT');
        const movementDate = new Date(movement.created_at);
        const day = String(movementDate.getDate()).padStart(2, '0');
        const month = String(movementDate.getMonth() + 1).padStart(2, '0');
        const year = String(movementDate.getFullYear()).slice(-2);
        const dateOnly = day + '/' + month + '/' + year;
        
        const article = allArticles.find(a => a.id === movement.articolo_id);
        const articleName = article ? article.nome : 'Articolo eliminato';
        const articleCode = article ? article.codice_articolo : 'N/D';
        
        const tipoEmoji = movement.tipo === 'carico' ? '&#10133;' : '&#10134;';
        const tipoColor = movement.tipo === 'carico' ? 'var(--success)' : 'var(--danger)';
        
        const userDisplay = userInitials[movement.utente] || movement.utente.substring(0, 2).toUpperCase();
        
        row.innerHTML = `
            <td><span class="show-on-mobile">${dateOnly}</span><span class="hide-on-mobile">${fullDate}</span></td>
            <td><span class="show-on-mobile" style="font-weight: 700;">${userDisplay}</span><span class="hide-on-mobile">${movement.utente}</span></td>
            <td>${articleName}</td>
            <td><span style="color: ${tipoColor}; font-weight: 700; font-size: 18px;">${tipoEmoji}</span></td>
            <td style="text-align: center;"><strong>${movement.quantita}</strong></td>
            <td class="hide-on-mobile">${articleCode}</td>
            <td class="hide-on-mobile">${movement.note || '-'}</td>
        `;
        
        tbody.appendChild(row);
    });
}

function applyMovementFilters() {
    saveMovementFilters();
    
    const typeFilter = document.getElementById('filter-movement-type').value;
    const dateFrom = document.getElementById('filter-date-from').value;
    const dateTo = document.getElementById('filter-date-to').value;
    
    let filtered = allMovements.filter(movement => {
        const matchesType = !typeFilter || movement.tipo === typeFilter;
        
        let matchesDate = true;
        if (dateFrom || dateTo) {
            const movementDate = new Date(movement.created_at);
            if (dateFrom) {
                const fromDate = new Date(dateFrom);
                matchesDate = matchesDate && movementDate >= fromDate;
            }
            if (dateTo) {
                const toDate = new Date(dateTo);
                toDate.setHours(23, 59, 59);
                matchesDate = matchesDate && movementDate <= toDate;
            }
        }
        
        return matchesType && matchesDate;
    });
    
    renderMovements(filtered);
}

// ========================================
// REPORT CONSUMABILI
// ========================================
function populateReportSelects() {
    const articleSelect = document.getElementById('report-article');
    const supplierSelect = document.getElementById('report-supplier');
    
    articleSelect.innerHTML = '<option value="">-- Seleziona articolo --</option>';
    allArticles.forEach(article => {
        const option = document.createElement('option');
        option.value = article.id;
        option.textContent = article.nome + ' (' + article.codice_articolo + ')';
        articleSelect.appendChild(option);
    });
    
    const suppliers = [...new Set(allArticles.map(a => a.marca_fornitore).filter(Boolean))];
    supplierSelect.innerHTML = '<option value="">-- Seleziona fornitore --</option>';
    suppliers.sort().forEach(supplier => {
        const option = document.createElement('option');
        option.value = supplier;
        option.textContent = supplier;
        supplierSelect.appendChild(option);
    });
}

function handleReportTypeChange() {
    const reportType = document.getElementById('report-type').value;
    
    document.getElementById('report-article-select').classList.add('hidden');
    document.getElementById('report-supplier-select').classList.add('hidden');
    
    if (reportType === 'articolo') {
        document.getElementById('report-article-select').classList.remove('hidden');
    } else if (reportType === 'fornitore') {
        document.getElementById('report-supplier-select').classList.remove('hidden');
    }
}

async function generateReport() {
    const reportType = document.getElementById('report-type').value;
    const dateFrom = document.getElementById('report-date-from').value;
    const dateTo = document.getElementById('report-date-to').value;
    
    let reportContent = '';
    
    if (reportType === 'generale') {
        reportContent = await generateGeneralOrderReport(dateFrom, dateTo);
    } else if (reportType === 'fornitore') {
        const supplier = document.getElementById('report-supplier').value;
        if (!supplier) {
            alert('Seleziona un fornitore');
            return;
        }
        reportContent = await generateSupplierOrderReport(supplier, dateFrom, dateTo);
    } else if (reportType === 'articolo') {
        const articleId = parseInt(document.getElementById('report-article').value);
        if (!articleId) {
            alert('Seleziona un articolo');
            return;
        }
        reportContent = await generateArticleOrderReport(articleId, dateFrom, dateTo);
    }
    
    document.getElementById('report-content').innerHTML = reportContent;
    document.getElementById('report-result').classList.remove('hidden');
}

async function generateGeneralOrderReport(dateFrom, dateTo) {
    let query = supabaseClient
        .from('movimenti')
        .select('*')
        .order('created_at', { ascending: false });
    
    if (dateFrom) {
        query = query.gte('created_at', new Date(dateFrom).toISOString());
    }
    if (dateTo) {
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59);
        query = query.lte('created_at', endDate.toISOString());
    }
    
    const { data: movements } = await query;
    
    const supplierData = {};
    
    movements.forEach(movement => {
        const article = allArticles.find(a => a.id === movement.articolo_id);
        if (!article) return;
        
        const supplier = article.marca_fornitore || 'Senza Fornitore';
        
        if (!supplierData[supplier]) {
            supplierData[supplier] = {
                totalCarico: 0,
                totalScarico: 0,
                articoli: new Set()
            };
        }
        
        if (movement.tipo === 'carico') {
            supplierData[supplier].totalCarico += movement.quantita;
        } else {
            supplierData[supplier].totalScarico += movement.quantita;
        }
        
        supplierData[supplier].articoli.add(article.id);
    });
    
    let html = `
        <h3>&#128202; REPORT GENERALE CONSUMABILI</h3>
        <p><strong>Periodo:</strong> ${dateFrom || 'Inizio'} &#8594; ${dateTo || 'Oggi'}</p>
        <p><strong>Data Generazione:</strong> ${new Date().toLocaleString('it-IT')}</p>
        <hr>
        <h4>&#128230; RIEPILOGO PER FORNITORE</h4>
    `;
    
    Object.keys(supplierData).sort().forEach(supplier => {
        const data = supplierData[supplier];
        const differenza = data.totalCarico - data.totalScarico;
        const differenzaColor = differenza >= 0 ? 'var(--success)' : 'var(--danger)';
        
        const supplierArticles = allArticles.filter(a => (a.marca_fornitore || 'Senza Fornitore') === supplier);
        const lowStockCount = supplierArticles.filter(a => a.quantita <= a.soglia_minima).length;
        
        html += `
            <div style="background: var(--light); padding: 15px; border-radius: 12px; margin-bottom: 15px; border-left: 4px solid var(--primary);">
                <h4 style="margin-bottom: 10px; color: var(--primary);">&#127970; ${supplier}</h4>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; font-size: 13px;">
                    <div><strong>Articoli gestiti:</strong> ${data.articoli.size}</div>
                    <div style="color: var(--success);"><strong>&#128229; Ordinato:</strong> +${data.totalCarico} pz</div>
                    <div style="color: var(--danger);"><strong>&#128228; Venduto:</strong> -${data.totalScarico} pz</div>
                    <div style="color: ${differenzaColor};"><strong>&#128176; Differenza:</strong> ${differenza >= 0 ? '+' : ''}${differenza} pz</div>
                    <div style="color: ${lowStockCount > 0 ? 'var(--danger)' : 'var(--success)'};">
                        <strong>&#9888; Sotto soglia:</strong> ${lowStockCount} articoli
                    </div>
                </div>
            </div>
        `;
    });
    
    return html;
}

async function generateSupplierOrderReport(supplier, dateFrom, dateTo) {
    let query = supabaseClient
        .from('movimenti')
        .select('*')
        .order('created_at', { ascending: false });
    
    if (dateFrom) {
        query = query.gte('created_at', new Date(dateFrom).toISOString());
    }
    if (dateTo) {
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59);
        query = query.lte('created_at', endDate.toISOString());
    }
    
    const { data: movements } = await query;
    
    const supplierArticles = allArticles.filter(a => a.marca_fornitore === supplier);
    const supplierArticleIds = supplierArticles.map(a => a.id);
    
    const supplierMovements = movements.filter(m => supplierArticleIds.includes(m.articolo_id));
    
    const articleData = {};
    
    supplierArticles.forEach(article => {
        articleData[article.id] = {
            nome: article.nome,
            codice: article.codice_articolo,
            quantitaAttuale: article.quantita,
            soglia: article.soglia_minima,
            carico: 0,
            scarico: 0
        };
    });
    
    supplierMovements.forEach(movement => {
        if (articleData[movement.articolo_id]) {
            if (movement.tipo === 'carico') {
                articleData[movement.articolo_id].carico += movement.quantita;
            } else {
                articleData[movement.articolo_id].scarico += movement.quantita;
            }
        }
    });
    
    const totalCarico = Object.values(articleData).reduce((sum, a) => sum + a.carico, 0);
    const totalScarico = Object.values(articleData).reduce((sum, a) => sum + a.scarico, 0);
    const lowStockCount = supplierArticles.filter(a => a.quantita <= a.soglia_minima).length;
    
    let html = `
        <h3>&#128202; REPORT FORNITORE: ${supplier}</h3>
        <p><strong>Periodo:</strong> ${dateFrom || 'Inizio'} &#8594; ${dateTo || 'Oggi'}</p>
        <p><strong>Data Generazione:</strong> ${new Date().toLocaleString('it-IT')}</p>
        <hr>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin: 15px 0;">
            <div style="background: var(--light); padding: 12px; border-radius: 8px;">
                <div style="font-size: 12px; color: var(--gray);">Articoli Totali</div>
                <div style="font-size: 22px; font-weight: 700;">${supplierArticles.length}</div>
            </div>
            <div style="background: var(--green-light); padding: 12px; border-radius: 8px;">
                <div style="font-size: 12px; color: var(--success);">&#128229; Ordinato</div>
                <div style="font-size: 22px; font-weight: 700; color: var(--success);">+${totalCarico}</div>
            </div>
            <div style="background: #fee2e2; padding: 12px; border-radius: 8px;">
                <div style="font-size: 12px; color: var(--danger);">&#128228; Venduto</div>
                <div style="font-size: 22px; font-weight: 700; color: var(--danger);">-${totalScarico}</div>
            </div>
        </div>
        <hr>
        <h4>&#128203; DETTAGLIO ARTICOLI</h4>
        <table style="width: 100%; font-size: 12px; margin-top: 10px;">
            <thead>
                <tr style="background: var(--primary); color: white;">
                    <th style="padding: 10px;">Nome</th>
                    <th style="padding: 10px;">Codice</th>
                    <th style="padding: 10px;">Qty</th>
                    <th style="padding: 10px;">Soglia</th>
                    <th style="padding: 10px; color: #dcfce7;">Ordinato</th>
                    <th style="padding: 10px; color: #fee2e2;">Venduto</th>
                    <th style="padding: 10px;">Diff.</th>
                    <th style="padding: 10px;">Stato</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    Object.values(articleData).forEach(article => {
        const diff = article.carico - article.scarico;
        const diffColor = diff >= 0 ? 'var(--success)' : 'var(--danger)';
        const rowStyle = article.quantitaAttuale <= article.soglia ? 'background: #fee2e2;' : '';
        const stato = article.quantitaAttuale <= article.soglia ? '&#9888; DA ORDINARE' : '&#10004; OK';
        
        html += `
            <tr style="${rowStyle}">
                <td style="padding: 8px;"><strong>${article.nome}</strong></td>
                <td style="padding: 8px; text-align: center;">${article.codice}</td>
                <td style="padding: 8px; text-align: center;"><strong>${article.quantitaAttuale}</strong></td>
                <td style="padding: 8px; text-align: center;">${article.soglia}</td>
                <td style="padding: 8px; text-align: center; color: var(--success);"><strong>+${article.carico}</strong></td>
                <td style="padding: 8px; text-align: center; color: var(--danger);"><strong>-${article.scarico}</strong></td>
                <td style="padding: 8px; text-align: center; color: ${diffColor};"><strong>${diff >= 0 ? '+' : ''}${diff}</strong></td>
                <td style="padding: 8px; text-align: center;">${stato}</td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    
    return html;
}

async function generateArticleOrderReport(articleId, dateFrom, dateTo) {
    const article = allArticles.find(a => a.id === articleId);
    if (!article) return '<p>Articolo non trovato</p>';
    
    let query = supabaseClient
        .from('movimenti')
        .select('*')
        .eq('articolo_id', articleId)
        .order('created_at', { ascending: false });
    
    if (dateFrom) {
        query = query.gte('created_at', new Date(dateFrom).toISOString());
    }
    if (dateTo) {
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59);
        query = query.lte('created_at', endDate.toISOString());
    }
    
    const { data: movements } = await query;
    
    const totalCarico = movements.filter(m => m.tipo === 'carico').reduce((sum, m) => sum + m.quantita, 0);
    const totalScarico = movements.filter(m => m.tipo === 'scarico').reduce((sum, m) => sum + m.quantita, 0);
    const differenza = totalCarico - totalScarico;
    
    let html = `
        <h3>&#128202; REPORT ARTICOLO: ${article.nome}</h3>
        <p><strong>Codice:</strong> ${article.codice_articolo} | <strong>Fornitore:</strong> ${article.marca_fornitore || 'N/D'}</p>
        <p><strong>Periodo:</strong> ${dateFrom || 'Inizio'} &#8594; ${dateTo || 'Oggi'}</p>
        <hr>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin: 15px 0;">
            <div style="background: var(--light); padding: 12px; border-radius: 8px;">
                <div style="font-size: 12px; color: var(--gray);">Qty Attuale</div>
                <div style="font-size: 22px; font-weight: 700;">${article.quantita}</div>
            </div>
            <div style="background: var(--green-light); padding: 12px; border-radius: 8px;">
                <div style="font-size: 12px; color: var(--success);">&#128229; Ordinato</div>
                <div style="font-size: 22px; font-weight: 700; color: var(--success);">+${totalCarico}</div>
            </div>
            <div style="background: #fee2e2; padding: 12px; border-radius: 8px;">
                <div style="font-size: 12px; color: var(--danger);">&#128228; Venduto</div>
                <div style="font-size: 22px; font-weight: 700; color: var(--danger);">-${totalScarico}</div>
            </div>
            <div style="background: var(--light); padding: 12px; border-radius: 8px;">
                <div style="font-size: 12px; color: var(--gray);">Differenza</div>
                <div style="font-size: 22px; font-weight: 700; color: ${differenza >= 0 ? 'var(--success)' : 'var(--danger)'};">
                    ${differenza >= 0 ? '+' : ''}${differenza}
                </div>
            </div>
        </div>
        <hr>
        <h4>&#128203; STORICO MOVIMENTI</h4>
        <table style="width: 100%; font-size: 12px; margin-top: 10px;">
            <thead>
                <tr style="background: var(--primary); color: white;">
                    <th style="padding: 10px;">Data</th>
                    <th style="padding: 10px;">Tipo</th>
                    <th style="padding: 10px;">Qty</th>
                    <th style="padding: 10px;">Utente</th>
                    <th style="padding: 10px;">Note</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    movements.forEach(m => {
        const date = new Date(m.created_at).toLocaleString('it-IT');
        const typeColor = m.tipo === 'carico' ? 'var(--success)' : 'var(--danger)';
        
        html += `
            <tr>
                <td style="padding: 8px;">${date}</td>
                <td style="padding: 8px; text-align: center; color: ${typeColor}; font-weight: 700;">${m.tipo.toUpperCase()}</td>
                <td style="padding: 8px; text-align: center;"><strong>${m.quantita}</strong></td>
                <td style="padding: 8px;">${m.utente}</td>
                <td style="padding: 8px;">${m.note || '-'}</td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    
    return html;
}

function printReport() {
    window.print();
}

// ========================================
// SCANNER CODICE A BARRE
// ========================================
function initScanner() {
    if (html5QrCode) return;
    
    initAudioContext();
    
    html5QrCode = new Html5Qrcode("reader");
    
    html5QrCode.start(
        { facingMode: "environment" },
        {
            fps: 60,
            qrbox: { width: 200, height: 200 },
            aspectRatio: 1.0
        },
        onScanSuccess,
        onScanError
    ).catch(err => {
        console.error('Errore avvio scanner:', err);
        alert('Impossibile avviare la fotocamera. Controlla i permessi.');
    });
}

function stopScanner() {
    if (html5QrCode) {
        html5QrCode.stop().then(() => {
            html5QrCode = null;
        }).catch(err => console.error('Errore stop scanner:', err));
    }
}

async function onScanSuccess(decodedText) {
    if (html5QrCode && html5QrCode.isScanning) {
        await html5QrCode.stop();
        html5QrCode = null;
    }
    
    let article = allArticles.find(a => a.codice_barre === decodedText);
    let ricambio = allRicambi.find(r => r.codice_barre === decodedText);
    
    if (!article && !ricambio) {
        playErrorSound();
        showVisualFeedback('error');
        
        if (navigator.vibrate) {
            navigator.vibrate([100, 50, 100]);
        }
        
        setTimeout(() => {
            initScanner();
        }, 2000);
        return;
    }
    
    playSuccessSound();
    showVisualFeedback('success');
    
    if (navigator.vibrate) {
        navigator.vibrate(200);
    }
    
    document.getElementById('reader').style.display = 'none';
    
    setTimeout(() => {
        if (article) {
            showScanActionModal(article);
        } else if (ricambio) {
            showScanActionModalRicambio(ricambio);
        }
    }, 1500);
}

function onScanError(errorMessage) {
    // Ignora errori di scansione continua
}

function showScanActionModal(article) {
    const modal = document.createElement('div');
    modal.id = 'scan-action-modal';
    modal.className = 'modal';
    modal.style.display = 'flex';
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 400px;">
            <h3 style="color: var(--primary); margin-bottom: 15px; text-align: center;">
                &#128230; ${article.nome}
            </h3>
            <div style="background: var(--light); padding: 15px; border-radius: 12px; margin-bottom: 20px; text-align: center;">
                <div style="font-size: 13px; color: var(--gray); margin-bottom: 5px;">Codice: ${article.codice_articolo}</div>
                <div style="font-size: 24px; font-weight: 700; color: var(--primary);">
                    Quantit&#224;: ${article.quantita}
                </div>
                <div style="font-size: 12px; color: var(--gray); margin-top: 5px;">
                    Soglia minima: ${article.soglia_minima}
                </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
                <button id="scan-btn-carico" class="btn-success" style="padding: 20px 15px; font-size: 18px; font-weight: 700;">
                    &#10133; CARICO
                </button>
                <button id="scan-btn-scarico" class="btn-danger" style="padding: 20px 15px; font-size: 18px; font-weight: 700;">
                    &#10134; SCARICO
                </button>
            </div>
            <button id="scan-btn-cancel" class="btn-secondary" style="width: 100%; padding: 12px;">
                &#8592; Torna allo Scanner
            </button>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    document.getElementById('scan-btn-carico').addEventListener('click', () => {
        closeScanActionModal();
        openMovementModal(article.id, 'carico');
    });
    
    document.getElementById('scan-btn-scarico').addEventListener('click', () => {
        closeScanActionModal();
        openMovementModal(article.id, 'scarico');
    });
    
    document.getElementById('scan-btn-cancel').addEventListener('click', () => {
        closeScanActionModal();
        document.getElementById('reader').style.display = 'block';
        initScanner();
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeScanActionModal();
            document.getElementById('reader').style.display = 'block';
            initScanner();
        }
    });
}

function closeScanActionModal() {
    const modal = document.getElementById('scan-action-modal');
    if (modal) {
        modal.remove();
    }
}

function showScanActionModalRicambio(ricambio) {
    const modal = document.createElement('div');
    modal.id = 'scan-action-ricambi-modal';
    modal.className = 'modal';
    modal.style.display = 'flex';
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 400px;">
            <h3 style="color: var(--primary); margin-bottom: 15px; text-align: center;">
                &#128295; ${ricambio.nome}
            </h3>
            <div style="background: var(--light); padding: 15px; border-radius: 12px; margin-bottom: 20px; text-align: center;">
                <div style="font-size: 13px; color: var(--gray); margin-bottom: 5px;">Codice: ${ricambio.codice_articolo}</div>
                <div style="font-size: 24px; font-weight: 700; color: var(--primary);">
                    Quantit&#224;: ${ricambio.quantita}
                </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
                <button id="scan-ricambio-btn-carico" class="btn-success" style="padding: 20px 15px; font-size: 18px; font-weight: 700;">
                    &#10133; CARICO
                </button>
                <button id="scan-ricambio-btn-scarico" class="btn-danger" style="padding: 20px 15px; font-size: 18px; font-weight: 700;">
                    &#10134; SCARICO
                </button>
            </div>
            <button id="scan-ricambio-btn-cancel" class="btn-secondary" style="width: 100%; padding: 12px;">
                &#8592; Torna allo Scanner
            </button>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    document.getElementById('scan-ricambio-btn-carico').addEventListener('click', () => {
        closeScanActionModalRicambio();
        openMovementRicambiModal(ricambio.id, 'carico');
    });
    
    document.getElementById('scan-ricambio-btn-scarico').addEventListener('click', () => {
        closeScanActionModalRicambio();
        openMovementRicambiModal(ricambio.id, 'scarico');
    });
    
    document.getElementById('scan-ricambio-btn-cancel').addEventListener('click', () => {
        closeScanActionModalRicambio();
        document.getElementById('reader').style.display = 'block';
        initScanner();
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeScanActionModalRicambio();
            document.getElementById('reader').style.display = 'block';
            initScanner();
        }
    });
}

function closeScanActionModalRicambio() {
    const modal = document.getElementById('scan-action-ricambi-modal');
    if (modal) {
        modal.remove();
    }
}

// ========================================
// GESTIONE UTENTI
// ========================================
async function loadAllUsers() {
    const { data, error } = await supabaseClient
        .from('user_roles')
        .select('*');
    
    if (error) {
        console.error('Errore caricamento utenti:', error);
        return [];
    }
    
    userInitials = {};
    if (data) {
        data.forEach(user => {
            if (user.iniziali) {
                userInitials[user.email] = user.iniziali;
            }
        });
    }
    
    return data || [];
}

async function renderUsersList() {
    const tbody = document.getElementById('users-tbody');
    tbody.innerHTML = '';
    
    const users = await loadAllUsers();
    
    if (!users || users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center">Nessun utente registrato</td></tr>';
        return;
    }
    
    users.forEach(user => {
        const row = document.createElement('tr');
        const isCurrentUser = user.email === loggedInUserEmail;
        const roleClass = user.role === 'admin' ? 'admin' : 'operatore';
        const roleText = user.role === 'admin' ? '&#128081; Admin' : '&#128100; Operatore';
        
        row.innerHTML = `
            <td>${user.email}</td>
            <td style="font-weight: 700; text-align: center;">${user.iniziali || '-'}</td>
            <td><span class="role-badge ${roleClass}">${roleText}</span></td>
            <td>
                ${isCurrentUser ? 
                    '<span style="color: var(--gray); font-size: 12px;">Il tuo account</span>' : 
                    `<button class="btn-primary btn-edit-user" data-email="${user.email}" data-initials="${user.iniziali || ''}" data-role="${user.role}" style="padding: 6px 12px; font-size: 12px; margin-right: 5px;">Modifica</button>
                    <button class="btn-danger btn-delete-user" data-email="${user.email}" style="padding: 6px 12px; font-size: 12px;">Elimina</button>`
                }
            </td>
        `;
        
        tbody.appendChild(row);
    });
    
    document.querySelectorAll('.btn-edit-user').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const email = e.target.dataset.email;
            const initials = e.target.dataset.initials;
            const role = e.target.dataset.role;
            openEditUserModal(email, initials, role);
        });
    });
    
    document.querySelectorAll('.btn-delete-user').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const email = e.target.dataset.email;
            if (confirm('Vuoi davvero eliminare l\'utente ' + email + '?')) {
                await deleteUser(email);
            }
        });
    });
}

async function handleNewUserForm(e) {
    e.preventDefault();
    
    const email = document.getElementById('new-user-email').value;
    const password = document.getElementById('new-user-password').value;
    const initials = document.getElementById('new-user-initials').value.toUpperCase();
    const role = document.getElementById('new-user-role').value;
    
    try {
        const { data: { session: adminSession } } = await supabaseClient.auth.getSession();
        
        if (!adminSession) {
            alert('Errore: Sessione non valida');
            return;
        }
        
        const adminEmail = adminSession.user.email;
        const adminRefreshToken = adminSession.refresh_token;
        
        const { data: authData, error: authError } = await supabaseClient.auth.signUp({
            email,
            password
        });
        
        if (authError) {
            alert('Errore creazione utente: ' + authError.message);
            return;
        }
        
        await supabaseClient.auth.setSession({
            access_token: adminSession.access_token,
            refresh_token: adminRefreshToken
        });
        
        currentUser = adminSession.user;
        loggedInUserEmail = adminEmail;
        
        const { error: roleError } = await supabaseClient
            .from('user_roles')
            .insert([
                { email, role, iniziali: initials }
            ]);
        
        if (roleError) {
            alert('Errore salvataggio ruolo: ' + roleError.message);
            return;
        }
        
        alert('Utente creato con successo!');
        document.getElementById('new-user-form').reset();
        await renderUsersList();
        
    } catch (error) {
        console.error('Errore:', error);
        alert('Errore durante la creazione dell\'utente');
    }
}

async function deleteUser(email) {
    try {
        const { error } = await supabaseClient
            .from('user_roles')
            .delete()
            .eq('email', email);
        
        if (error) {
            alert('Errore eliminazione utente: ' + error.message);
            return;
        }
        
        alert('Utente eliminato con successo!');
        renderUsersList();
        
    } catch (error) {
        console.error('Errore:', error);
        alert('Errore durante l\'eliminazione dell\'utente');
    }
}

function openEditUserModal(email, initials, role) {
    document.getElementById('edit-user-email').value = email;
    document.getElementById('edit-user-email-display').textContent = email;
    document.getElementById('edit-user-initials').value = initials || '';
    document.getElementById('edit-user-role').value = role;
    
    document.getElementById('edit-user-modal').classList.remove('hidden');
}

function closeEditUserModal() {
    document.getElementById('edit-user-modal').classList.add('hidden');
    document.getElementById('edit-user-form').reset();
}

async function handleEditUserForm(e) {
    e.preventDefault();
    
    const email = document.getElementById('edit-user-email').value;
    const initials = document.getElementById('edit-user-initials').value.toUpperCase();
    const role = document.getElementById('edit-user-role').value;
    
    try {
        const { error } = await supabaseClient
            .from('user_roles')
            .update({
                iniziali: initials,
                role: role
            })
            .eq('email', email);
        
        if (error) {
            alert('Errore modifica utente: ' + error.message);
            return;
        }
        
        alert('Utente modificato con successo!');
        closeEditUserModal();
        renderUsersList();
        
    } catch (error) {
        console.error('Errore:', error);
        alert('Errore durante la modifica dell\'utente');
    }
}

// ========================================
// EVENT LISTENERS
// ========================================
function setupEventListeners() {
    // Login
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
    document.getElementById('toggle-password').addEventListener('click', togglePasswordVisibility);
    
    document.getElementById('remember-me').addEventListener('change', (e) => {
        if (!e.target.checked) {
            clearSavedCredentials();
        }
    });
    
    // Form articoli
    document.getElementById('new-article-form').addEventListener('submit', handleNewArticle);
    document.getElementById('edit-article-form').addEventListener('submit', handleEditArticle);
    document.getElementById('edit-cancel').addEventListener('click', closeEditModal);
    
    // Pop-up novit&agrave;
    const closeWhatsNewBtn = document.getElementById('close-whats-new');
    if (closeWhatsNewBtn) {
        closeWhatsNewBtn.addEventListener('click', closeWhatsNewModal);
    }
    
    const whatsNewModal = document.getElementById('whats-new-modal');
    if (whatsNewModal) {
        whatsNewModal.addEventListener('click', (e) => {
            if (e.target === whatsNewModal) {
                closeWhatsNewModal();
            }
        });
    }
    
    // Tab buttons - Consumabili
    const tabsConsumabili = document.getElementById('tabs-consumabili');
    if (tabsConsumabili) {
        tabsConsumabili.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tabName = btn.dataset.tab;
                switchTab(tabName);
            });
        });
    }
    
    // Tab buttons - Ricambi
    const tabsRicambi = document.getElementById('tabs-ricambi');
    if (tabsRicambi) {
        tabsRicambi.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tabName = btn.dataset.tab.replace('ricambi-', '');
                switchTab(tabName, 'ricambi');
            });
        });
    }
    
    // Movement modals
    document.getElementById('modal-confirm').addEventListener('click', confirmMovement);
    document.getElementById('modal-cancel').addEventListener('click', closeMovementModal);
    
    // Filtri inventario
    document.getElementById('search-input').addEventListener('input', applyFiltersAndSort);
    document.getElementById('filter-brand').addEventListener('change', applyFiltersAndSort);
    document.getElementById('sort-select').addEventListener('change', applyFiltersAndSort);
    document.getElementById('group-by-supplier').addEventListener('change', applyFiltersAndSort);
    
    // Filtri movimenti
    document.getElementById('apply-movement-filters').addEventListener('click', applyMovementFilters);
    
    // Report consumabili
    document.getElementById('report-type').addEventListener('change', handleReportTypeChange);
    document.getElementById('generate-report').addEventListener('click', generateReport);
    document.getElementById('print-report').addEventListener('click', printReport);
    
    // Gestione utenti
    document.getElementById('new-user-form').addEventListener('submit', handleNewUserForm);
    document.getElementById('edit-user-form').addEventListener('submit', handleEditUserForm);
    document.getElementById('edit-user-cancel').addEventListener('click', closeEditUserModal);
    document.getElementById('edit-user-close').addEventListener('click', closeEditUserModal);
    
    const editUserModal = document.getElementById('edit-user-modal');
    if (editUserModal) {
        editUserModal.addEventListener('click', (e) => {
            if (e.target === editUserModal) {
                closeEditUserModal();
            }
        });
    }
    
    // ========================================
    // EVENT LISTENERS RICAMBI
    // ========================================
    
    // Import Excel
    const btnSelectExcel = document.getElementById('btn-select-excel');
    if (btnSelectExcel) {
        btnSelectExcel.addEventListener('click', () => {
            document.getElementById('excel-file-input').click();
        });
    }
    
    const excelFileInput = document.getElementById('excel-file-input');
    if (excelFileInput) {
        excelFileInput.addEventListener('change', handleExcelImport);
    }
    
    const btnImportExcel = document.getElementById('btn-import-excel');
    if (btnImportExcel) {
        btnImportExcel.addEventListener('click', confirmExcelImport);
    }
    
    const btnCancelExcel = document.getElementById('btn-cancel-excel');
    if (btnCancelExcel) {
        btnCancelExcel.addEventListener('click', cancelExcelImport);
    }
    
    // Form nuovo ricambio
    const newRicambioForm = document.getElementById('new-ricambio-form');
    if (newRicambioForm) {
        newRicambioForm.addEventListener('submit', handleNewRicambio);
    }
    
    // Filtri ricambi
    const searchRicambiInput = document.getElementById('search-ricambi-input');
    if (searchRicambiInput) {
        searchRicambiInput.addEventListener('input', applyRicambiFiltersAndSort);
    }
    
    const filterRicambiBrand = document.getElementById('filter-ricambi-brand');
    if (filterRicambiBrand) {
        filterRicambiBrand.addEventListener('change', applyRicambiFiltersAndSort);
    }
    
    const sortRicambiSelect = document.getElementById('sort-ricambi-select');
    if (sortRicambiSelect) {
        sortRicambiSelect.addEventListener('change', applyRicambiFiltersAndSort);
    }
    
    const groupRicambiBySupplier = document.getElementById('group-ricambi-by-supplier');
    if (groupRicambiBySupplier) {
        groupRicambiBySupplier.addEventListener('change', applyRicambiFiltersAndSort);
    }
    
    // Modal ricambi
    const modalRicambiConfirm = document.getElementById('modal-ricambi-confirm');
    if (modalRicambiConfirm) {
        modalRicambiConfirm.addEventListener('click', confirmMovementRicambi);
    }
    
    const modalRicambiCancel = document.getElementById('modal-ricambi-cancel');
    if (modalRicambiCancel) {
        modalRicambiCancel.addEventListener('click', closeMovementRicambiModal);
    }
    
    // Form modifica ricambio
    const editRicambioForm = document.getElementById('edit-ricambio-form');
    if (editRicambioForm) {
        editRicambioForm.addEventListener('submit', handleEditRicambio);
    }
    
    const editRicambioCancel = document.getElementById('edit-ricambio-cancel');
    if (editRicambioCancel) {
        editRicambioCancel.addEventListener('click', closeEditRicambioModal);
    }
    
    // Filtri movimenti ricambi
    const applyMovementRicambiFiltersBtn = document.getElementById('apply-movement-ricambi-filters');
    if (applyMovementRicambiFiltersBtn) {
        applyMovementRicambiFiltersBtn.addEventListener('click', applyMovementRicambiFilters);
    }
    
    // Report ricambi
    const reportRicambiType = document.getElementById('report-ricambi-type');
    if (reportRicambiType) {
        reportRicambiType.addEventListener('change', handleReportRicambiTypeChange);
    }
    
    const generateReportRicambiBtn = document.getElementById('generate-report-ricambi');
    if (generateReportRicambiBtn) {
        generateReportRicambiBtn.addEventListener('click', generateReportRicambi);
    }
    
    const printReportRicambiBtn = document.getElementById('print-report-ricambi');
    if (printReportRicambiBtn) {
        printReportRicambiBtn.addEventListener('click', printReportRicambi);
    }
}

// ========================================
// PWA FEATURES
// ========================================
function isMobile() {
    return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

function isIOS() {
    return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function isAndroid() {
    return /Android/i.test(navigator.userAgent);
}

function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || 
           window.navigator.standalone || 
           document.referrer.includes('android-app://');
}

function initPWAFeatures() {
    const mobileWarning = document.getElementById('mobile-warning');
    const installContainer = document.getElementById('install-app-container');
    const showInstructionsBtn = document.getElementById('show-install-instructions');
    const installModal = document.getElementById('install-instructions-modal');
    const closeModalBtn = document.getElementById('close-install-modal');
    
    if (isMobile() && !isStandalone()) {
        mobileWarning.classList.remove('hidden');
        installContainer.classList.remove('hidden');
    }
    
    showInstructionsBtn.addEventListener('click', () => {
        showInstallInstructions();
    });
    
    closeModalBtn.addEventListener('click', () => {
        installModal.classList.add('hidden');
    });
    
    installModal.addEventListener('click', (e) => {
        if (e.target === installModal) {
            installModal.classList.add('hidden');
        }
    });
}

function showInstallInstructions() {
    const modal = document.getElementById('install-instructions-modal');
    const iosInstructions = document.getElementById('ios-instructions');
    const androidInstructions = document.getElementById('android-instructions');
    const desktopMessage = document.getElementById('desktop-message');
    
    iosInstructions.classList.add('hidden');
    androidInstructions.classList.add('hidden');
    desktopMessage.classList.add('hidden');
    
    if (isIOS()) {
        iosInstructions.classList.remove('hidden');
    } else if (isAndroid()) {
        androidInstructions.classList.remove('hidden');
    } else {
        desktopMessage.classList.remove('hidden');
    }
    
    modal.classList.remove('hidden');
}