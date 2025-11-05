// ========================================
// CONFIGURAZIONE SUPABASE
// ========================================
const SUPABASE_URL = 'https://uiypndhemhgljceylqzl.supabase.co';  
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpeXBuZGhlbWhnbGpjZXlscXpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE2NTc2NDIsImV4cCI6MjA3NzIzMzY0Mn0.zyVrgj3JZaCmOoAGCugPDfEjdEyNj-elbiFFXZJkRmU';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ========================================
// VARIABILI GLOBALI
// ========================================
let currentUser = null;
let currentUserRole = null;
let allArticles = [];
let allMovements = [];
let currentArticleForMovement = null;
let html5QrCode = null;

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
    
    const { data: { session } } = await supabase.auth.getSession();
    
    console.log('Sessione trovata:', session ? 'SI' : 'NO');
    
    if (session) {
        currentUser = session.user;
        console.log('Utente:', currentUser.email);
        await loadUserRole();
        showMainScreen();
    } else {
        console.log('Nessuna sessione, mostro login');
        showLoginScreen();
    }
    
    document.body.classList.remove('loading');
    document.body.classList.add('ready');
    
    setupEventListeners();
    
    initPWAFeatures();
    
    supabase.auth.onAuthStateChange((event, session) => {
        console.log('Auth state changed:', event);
        if (event === 'SIGNED_OUT') {
            currentUser = null;
            currentUserRole = null;
            showLoginScreen();
        } else if (event === 'SIGNED_IN' && session) {
            currentUser = session.user;
            loadUserRole().then(() => showMainScreen());
        }
    });
});

// ========================================
// GESTIONE RUOLI
// ========================================
async function loadUserRole() {
    console.log('Caricamento ruolo per:', currentUser.email);
    
    const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('email', currentUser.email)
        .single();
    
    console.log('Risultato query ruolo:', data, error);
    
    if (error || !data) {
        console.log('Nessun ruolo trovato, imposto operatore');
        currentUserRole = 'operatore';
    } else {
        console.log('Ruolo trovato:', data.role);
        currentUserRole = data.role;
    }
    
    console.log('Ruolo finale assegnato:', currentUserRole);
    applyRolePermissions();
}

function applyRolePermissions() {
    const roleBadge = document.getElementById('user-role');
    roleBadge.innerHTML = currentUserRole === 'admin' ? '&#128081; Admin' : '&#128100; Operatore';
    roleBadge.classList.add(currentUserRole);
    
    if (currentUserRole === 'operatore') {
        document.getElementById('tab-nuovo-btn').style.display = 'none';
        document.getElementById('tab-report-btn').style.display = 'none';
        
        document.querySelectorAll('.btn-edit, .btn-delete').forEach(btn => {
            btn.style.display = 'none';
        });
    }
}

// ========================================
// GESTIONE SCHERMATE
// ========================================
function showLoginScreen() {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('login-screen').classList.add('active');
}

function showMainScreen() {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('main-screen').classList.add('active');
    loadInventory();
    loadMovements();
    
    if (currentUserRole === 'admin') {
        populateReportSelects();
    }
}

// ========================================
// AUTENTICAZIONE
// ========================================
async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    console.log('Tentativo login per:', email);
    
    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
    });
    
    if (error) {
        console.error('Errore login:', error);
        alert('Errore login: ' + error.message);
        return;
    }
    
    console.log('Login riuscito - Supabase manterra la sessione');
    currentUser = data.user;
    await loadUserRole();
    showMainScreen();
}

async function handleLogout() {
    console.log('Logout...');
    await supabase.auth.signOut();
    currentUser = null;
    currentUserRole = null;
    showLoginScreen();
}

// ========================================
// TOGGLE PASSWORD VISIBILITY
// ========================================
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
async function loadInventory(keepFilters = false) {
    let savedBrand = '';
    let savedSearch = '';
    let savedSort = '';
    let savedGroup = true;
    
    if (keepFilters) {
        savedBrand = document.getElementById('filter-brand')?.value || '';
        savedSearch = document.getElementById('search-input')?.value || '';
        savedSort = document.getElementById('sort-select')?.value || 'fornitore-asc';
        savedGroup = document.getElementById('group-by-supplier')?.checked !== false;
    }
    
    const { data, error } = await supabase
        .from('articoli')
        .select('*')
        .order('marca_fornitore, nome');
    
    if (error) {
        console.error('Errore caricamento inventario:', error);
        return;
    }
    
    allArticles = data || [];
    populateBrandFilter();
    
    if (keepFilters) {
        if (savedBrand) document.getElementById('filter-brand').value = savedBrand;
        if (savedSearch) document.getElementById('search-input').value = savedSearch;
        if (savedSort) document.getElementById('sort-select').value = savedSort;
        document.getElementById('group-by-supplier').checked = savedGroup;
    } else {
        // RESET esplicito dei filtri
        document.getElementById('filter-brand').value = '';
        document.getElementById('search-input').value = '';
        document.getElementById('sort-select').value = 'fornitore-asc';
        document.getElementById('group-by-supplier').checked = true;
    }
    
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
            const editBtn = currentUserRole === 'admin' ? `<button onclick="openEditModal(${article.id})" class="btn-edit">&#9997;</button>` : '';
            const deleteBtn = currentUserRole === 'admin' ? `<button onclick="deleteArticle(${article.id})" class="btn-delete">&#128465;</button>` : '';
            
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
        const editBtn = currentUserRole === 'admin' ? `<button onclick="openEditModal(${article.id})" class="btn-edit">&#9997;</button>` : '';
        const deleteBtn = currentUserRole === 'admin' ? `<button onclick="deleteArticle(${article.id})" class="btn-delete">&#128465;</button>` : '';
        
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
    
    const name = document.getElementById('new-name').value;
    const code = document.getElementById('new-code').value;
    const barcode = document.getElementById('new-barcode').value;
    const brand = document.getElementById('new-brand').value;
    const description = document.getElementById('new-description').value.trim();
    const notes = document.getElementById('new-notes').value.trim();
    const quantity = parseInt(document.getElementById('new-quantity').value);
    const threshold = parseInt(document.getElementById('new-threshold').value);
    const priceBuy = parseFloat(document.getElementById('new-price-buy').value);
    const iva = parseFloat(document.getElementById('new-iva').value);
    const price = parseFloat(document.getElementById('new-price').value);
    
    const { data: existingCode } = await supabase
        .from('articoli')
        .select('id')
        .eq('codice_articolo', code)
        .single();
    
    if (existingCode) {
        alert('Codice articolo gia esistente!');
        return;
    }
    
    const { data: existingBarcode } = await supabase
        .from('articoli')
        .select('id')
        .eq('codice_barre', barcode)
        .single();
    
    if (existingBarcode) {
        alert('Codice a barre gia esistente!');
        return;
    }
    
    const { error } = await supabase
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
        }]);
    
    if (error) {
        alert('Errore durante il salvataggio: ' + error.message);
        return;
    }
    
    alert('Articolo aggiunto con successo!');
    document.getElementById('new-article-form').reset();
    document.getElementById('new-quantity').value = 0;
    document.getElementById('new-threshold').value = 10;
    document.getElementById('new-iva').value = 22;
    loadInventory();
    
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
    const name = document.getElementById('edit-name').value;
    const code = document.getElementById('edit-code').value;
    const barcode = document.getElementById('edit-barcode').value;
    const brand = document.getElementById('edit-brand').value;
    const description = document.getElementById('edit-description').value.trim();
    const notes = document.getElementById('edit-notes').value.trim();
    const quantity = parseInt(document.getElementById('edit-quantity').value);
    const threshold = parseInt(document.getElementById('edit-threshold').value);
    const priceBuy = parseFloat(document.getElementById('edit-price-buy').value);
    const iva = parseFloat(document.getElementById('edit-iva').value);
    const price = parseFloat(document.getElementById('edit-price').value);
    
    const { error } = await supabase
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
    loadInventory(true);
}

function closeEditModal() {
    document.getElementById('edit-modal').classList.add('hidden');
}

async function deleteArticle(articleId) {
    const article = allArticles.find(a => a.id === articleId);
    if (!article) return;
    
    const confirm = window.confirm(`Sei sicuro di voler eliminare "${article.nome}"?\n\nQuesta azione non puo essere annullata.`);
    
    if (!confirm) return;
    
    const { error } = await supabase
        .from('articoli')
        .delete()
        .eq('id', articleId);
    
    if (error) {
        alert('Errore durante l\'eliminazione: ' + error.message);
        return;
    }
    
    alert('Articolo eliminato con successo!');
    loadInventory(true);
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
        alert('Quantita non valida');
        return;
    }
    
    let newQuantity = article.quantita;
    if (type === 'carico') {
        newQuantity += quantity;
    } else {
        newQuantity -= quantity;
        if (newQuantity < 0) {
            alert('Quantita insufficiente in magazzino!');
            return;
        }
    }
    
    const { error: updateError } = await supabase
        .from('articoli')
        .update({ quantita: newQuantity })
        .eq('id', article.id);
    
    if (updateError) {
        alert('Errore aggiornamento: ' + updateError.message);
        return;
    }
    
    const { error: movementError } = await supabase
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
    loadInventory(true);
    loadMovements();
    
    // ALERT SOTTO SOGLIA - EMOJI UNICODE CORRETTE
    if (type === 'scarico' && newQuantity <= article.soglia_minima) {
        setTimeout(() => {
            alert('\u26A0\uFE0F ATTENZIONE!\n\nL\'articolo "' + article.nome + '" \u00C8 SOTTO SOGLIA!\n\nQuantit\u00E0 attuale: ' + newQuantity + '\nSoglia minima: ' + article.soglia_minima + '\n\n\uD83D\uDED2 \u00C8 necessario riordinare!');
        }, 300);
    }
    
    alert(`${type === 'carico' ? 'Carico' : 'Scarico'} completato!`);
}

function closeMovementModal() {
    document.getElementById('movement-modal').classList.add('hidden');
    currentArticleForMovement = null;
}

// ========================================
// STORICO MOVIMENTI
// ========================================
async function loadMovements() {
    const { data, error } = await supabase
        .from('movimenti')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
    
    if (error) {
        console.error('Errore caricamento movimenti:', error);
        return;
    }
    
    allMovements = data || [];
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
        const date = new Date(movement.created_at).toLocaleString('it-IT');
        
        const article = allArticles.find(a => a.id === movement.articolo_id);
        const articleName = article ? article.nome : 'Articolo eliminato';
        const articleCode = article ? article.codice_articolo : 'N/D';
        
        row.innerHTML = `
            <td>${date}</td>
            <td>${articleName}</td>
            <td>${articleCode}</td>
            <td><span style="color: ${movement.tipo === 'carico' ? 'var(--success)' : 'var(--danger)'}; font-weight: 700;">${movement.tipo.toUpperCase()}</span></td>
            <td><strong>${movement.quantita}</strong></td>
            <td>${movement.utente}</td>
            <td>${movement.note || '-'}</td>
        `;
        
        tbody.appendChild(row);
    });
}

function applyMovementFilters() {
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
// REPORT PRESTAGIONALE
// ========================================
function populateReportSelects() {
    const articleSelect = document.getElementById('report-article');
    const supplierSelect = document.getElementById('report-supplier');
    
    articleSelect.innerHTML = '<option value="">-- Seleziona articolo --</option>';
    allArticles.forEach(article => {
        const option = document.createElement('option');
        option.value = article.id;
        option.textContent = `${article.nome} (${article.codice_articolo})`;
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
    let query = supabase
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
        <h3>&#128202; REPORT GENERALE ORDINI/VENDITE</h3>
        <p><strong>Periodo:</strong> ${dateFrom || 'Inizio'} &#8594; ${dateTo || 'Oggi'}</p>
        <p><strong>Data Generazione:</strong> ${new Date().toLocaleString('it-IT')}</p>
        <hr>
        <h4>&#128230; RIEPILOGO PER FORNITORE</h4>
        <p style="color: var(--gray); font-size: 13px; margin-bottom: 15px;">
            Questo report mostra quanto materiale hai <strong style="color: var(--success);">ORDINATO (caricato)</strong> e 
            <strong style="color: var(--danger);">VENDUTO (scaricato)</strong> per ogni fornitore.
        </p>
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
                    <div>
                        <strong>Articoli gestiti:</strong> ${data.articoli.size}
                    </div>
                    <div style="color: var(--success);">
                        <strong>&#128229; Ordinato (Carico):</strong> +${data.totalCarico} pz
                    </div>
                    <div style="color: var(--danger);">
                        <strong>&#128228; Venduto (Scarico):</strong> -${data.totalScarico} pz
                    </div>
                    <div style="color: ${differenzaColor};">
                        <strong>&#128176; Differenza:</strong> ${differenza >= 0 ? '+' : ''}${differenza} pz
                    </div>
                    <div style="color: ${lowStockCount > 0 ? 'var(--danger)' : 'var(--success)'};">
                        <strong>&#9888; Sotto soglia:</strong> ${lowStockCount} articoli
                    </div>
                </div>
            </div>
        `;
    });
    
    html += `
        <hr>
        <h4>&#128161; COSA SIGNIFICA</h4>
        <ul style="list-style: none; padding-left: 0; font-size: 13px; line-height: 1.8;">
            <li>&#128229; <strong>Ordinato (Carico):</strong> Quanti pezzi hai ricevuto dai fornitori</li>
            <li>&#128228; <strong>Venduto (Scarico):</strong> Quanti pezzi hai venduto/utilizzato</li>
            <li>&#128176; <strong>Differenza:</strong> Se positiva, hai ancora stock. Se negativa, hai venduto piu di quanto ordinato</li>
            <li>&#9888; <strong>Sotto soglia:</strong> Articoli da riordinare immediatamente</li>
        </ul>
    `;
    
    return html;
}

async function generateSupplierOrderReport(supplier, dateFrom, dateTo) {
    let query = supabase
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
        <h4>&#128230; RIEPILOGO</h4>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin: 15px 0;">
            <div style="background: var(--light); padding: 12px; border-radius: 8px;">
                <div style="color: var(--gray); font-size: 12px;">Articoli Totali</div>
                <div style="font-size: 22px; font-weight: 700;">${supplierArticles.length}</div>
            </div>
            <div style="background: var(--green-light); padding: 12px; border-radius: 8px;">
                <div style="color: var(--success); font-size: 12px;">&#128229; Ordinato</div>
                <div style="font-size: 22px; font-weight: 700; color: var(--success);">+${totalCarico}</div>
            </div>
            <div style="background: #fee2e2; padding: 12px; border-radius: 8px;">
                <div style="color: var(--danger); font-size: 12px;">&#128228; Venduto</div>
                <div style="font-size: 22px; font-weight: 700; color: var(--danger);">-${totalScarico}</div>
            </div>
            <div style="background: ${lowStockCount > 0 ? '#fee2e2' : 'var(--green-light)'}; padding: 12px; border-radius: 8px;">
                <div style="color: ${lowStockCount > 0 ? 'var(--danger)' : 'var(--success)'}; font-size: 12px;">&#9888; Sotto Soglia</div>
                <div style="font-size: 22px; font-weight: 700; color: ${lowStockCount > 0 ? 'var(--danger)' : 'var(--success)'};">${lowStockCount}</div>
            </div>
        </div>
        <hr>
        <h4>&#128203; DETTAGLIO ARTICOLI</h4>
        <table style="width: 100%; font-size: 12px; margin-top: 10px;">
            <thead>
                <tr style="background: var(--primary); color: white;">
                    <th style="padding: 10px; text-align: left;">Nome</th>
                    <th style="padding: 10px;">Codice</th>
                    <th style="padding: 10px;">Qty Attuale</th>
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
    
    html += `
            </tbody>
        </table>
        <hr>
        <div style="background: var(--green-light); padding: 15px; border-radius: 12px; margin-top: 15px;">
            <h4 style="color: var(--primary); margin-bottom: 10px;">&#128161; CONSIGLI PER L'ORDINE</h4>
            <ul style="list-style: none; padding-left: 0; font-size: 13px; line-height: 1.8;">
    `;
    
    if (lowStockCount > 0) {
        html += `<li>&#128722; <strong>${lowStockCount} articoli</strong> sono sotto soglia e vanno riordinati SUBITO</li>`;
    } else {
        html += `<li>&#10004; Tutti gli articoli sono sopra la soglia minima</li>`;
    }
    
    const articoliConDiffNegativa = Object.values(articleData).filter(a => (a.carico - a.scarico) < 0);
    if (articoliConDiffNegativa.length > 0) {
        html += `<li>&#9888; <strong>${articoliConDiffNegativa.length} articoli</strong> hanno venduto piu di quanto ordinato nel periodo</li>`;
    }
    
    html += `
            </ul>
        </div>
    `;
    
    return html;
}

async function generateArticleOrderReport(articleId, dateFrom, dateTo) {
    const article = allArticles.find(a => a.id === articleId);
    if (!article) return '<p>Articolo non trovato</p>';
    
    let query = supabase
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
                <div style="color: var(--gray); font-size: 12px;">Qty Attuale</div>
                <div style="font-size: 22px; font-weight: 700;">${article.quantita}</div>
            </div>
            <div style="background: var(--light); padding: 12px; border-radius: 8px;">
                <div style="color: var(--gray); font-size: 12px;">Soglia Minima</div>
                <div style="font-size: 22px; font-weight: 700;">${article.soglia_minima}</div>
            </div>
            <div style="background: var(--green-light); padding: 12px; border-radius: 8px;">
                <div style="color: var(--success); font-size: 12px;">&#128229; Ordinato</div>
                <div style="font-size: 22px; font-weight: 700; color: var(--success);">+${totalCarico}</div>
            </div>
            <div style="background: #fee2e2; padding: 12px; border-radius: 8px;">
                <div style="color: var(--danger); font-size: 12px;">&#128228; Venduto</div>
                <div style="font-size: 22px; font-weight: 700; color: var(--danger);">-${totalScarico}</div>
            </div>
            <div style="background: var(--light); padding: 12px; border-radius: 8px;">
                <div style="color: var(--gray); font-size: 12px;">&#128176; Differenza</div>
                <div style="font-size: 22px; font-weight: 700; color: ${differenza >= 0 ? 'var(--success)' : 'var(--danger)'};">${differenza >= 0 ? '+' : ''}${differenza}</div>
            </div>
            <div style="background: ${article.quantita <= article.soglia_minima ? '#fee2e2' : 'var(--green-light)'}; padding: 12px; border-radius: 8px;">
                <div style="color: ${article.quantita <= article.soglia_minima ? 'var(--danger)' : 'var(--success)'}; font-size: 12px;">Stato</div>
                <div style="font-size: 18px; font-weight: 700;">${article.quantita <= article.soglia_minima ? '&#9888; ORDINARE' : '&#10004; OK'}</div>
            </div>
        </div>
        <hr>
        <h4>&#128203; STORICO MOVIMENTI</h4>
        <table style="width: 100%; font-size: 12px; margin-top: 10px;">
            <thead>
                <tr style="background: var(--primary); color: white;">
                    <th style="padding: 10px;">Data</th>
                    <th style="padding: 10px;">Tipo</th>
                    <th style="padding: 10px;">Quantita</th>
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
    
    html += `
            </tbody>
        </table>
    `;
    
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
    
    html5QrCode = new Html5Qrcode("reader");
    
    html5QrCode.start(
        { facingMode: "environment" },
        {
            fps: 10,
            qrbox: { width: 250, height: 250 }
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
    
    const article = allArticles.find(a => a.codice_barre === decodedText);
    
    if (!article) {
        alert('Articolo non trovato nel database!');
        setTimeout(() => initScanner(), 500);
        return;
    }
    
    document.getElementById('scanned-article').textContent = 
        `${article.nome} (${article.codice_articolo})\nQuantita: ${article.quantita}`;
    document.getElementById('scanner-result').classList.remove('hidden');
    
    window.scannedArticle = article;
    
    document.getElementById('reader').style.display = 'none';
}

function onScanError(errorMessage) {
    // Ignora errori di scansione continua
}

// ========================================
// NAVIGAZIONE TAB
// ========================================
function switchTab(tabName) {
    closeMobileMenu();
    
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`tab-${tabName}`).classList.add('active');
    
    if (tabName === 'scanner') {
        setTimeout(() => initScanner(), 100);
    } else {
        stopScanner();
    }
    
    if (tabName === 'report' && currentUserRole === 'admin') {
        populateReportSelects();
    }
}

// ========================================
// HAMBURGER MENU MOBILE
// ========================================
function toggleMobileMenu() {
    const hamburger = document.getElementById('hamburger-btn');
    const tabs = document.getElementById('main-tabs');
    const body = document.body;
    
    hamburger.classList.toggle('active');
    tabs.classList.toggle('active');
    body.classList.toggle('menu-open');
}

function closeMobileMenu() {
    const hamburger = document.getElementById('hamburger-btn');
    const tabs = document.getElementById('main-tabs');
    const body = document.body;
    
    hamburger.classList.remove('active');
    tabs.classList.remove('active');
    body.classList.remove('menu-open');
}

// ========================================
// EVENT LISTENERS
// ========================================
function setupEventListeners() {
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
    document.getElementById('toggle-password').addEventListener('click', togglePasswordVisibility);
    
    document.getElementById('new-article-form').addEventListener('submit', handleNewArticle);
    
    document.getElementById('edit-article-form').addEventListener('submit', handleEditArticle);
    document.getElementById('edit-cancel').addEventListener('click', closeEditModal);
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
    
    document.getElementById('modal-confirm').addEventListener('click', confirmMovement);
    document.getElementById('modal-cancel').addEventListener('click', closeMovementModal);
    
    document.getElementById('btn-carico').addEventListener('click', () => {
        if (window.scannedArticle) {
            openMovementModal(window.scannedArticle.id, 'carico');
        }
    });
    document.getElementById('btn-scarico').addEventListener('click', () => {
        if (window.scannedArticle) {
            openMovementModal(window.scannedArticle.id, 'scarico');
        }
    });
    
    document.getElementById('search-input').addEventListener('input', applyFiltersAndSort);
    document.getElementById('filter-brand').addEventListener('change', applyFiltersAndSort);
    document.getElementById('sort-select').addEventListener('change', applyFiltersAndSort);
    document.getElementById('group-by-supplier').addEventListener('change', applyFiltersAndSort);
    
    document.getElementById('apply-movement-filters').addEventListener('click', applyMovementFilters);
    
    document.getElementById('report-type').addEventListener('change', handleReportTypeChange);
    document.getElementById('generate-report').addEventListener('click', generateReport);
    document.getElementById('print-report').addEventListener('click', printReport);

    document.getElementById('btn-rescan').addEventListener('click', () => {
        document.getElementById('scanner-result').classList.add('hidden');
        document.getElementById('reader').style.display = 'block';
        window.scannedArticle = null;
        initScanner();
    });
    
    document.getElementById('hamburger-btn').addEventListener('click', toggleMobileMenu);
    
    document.body.addEventListener('click', (e) => {
        const tabs = document.getElementById('main-tabs');
        const hamburger = document.getElementById('hamburger-btn');
        
        if (document.body.classList.contains('menu-open') && 
            !tabs.contains(e.target) && 
            !hamburger.contains(e.target)) {
            closeMobileMenu();
        }
    });
}

// ========================================
// RILEVAMENTO DISPOSITIVO E PWA
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