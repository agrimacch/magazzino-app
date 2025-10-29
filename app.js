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
let allUsers = [];
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
    console.log('🚀 Inizializzazione app...');
    
    // Controlla la sessione corrente
    const { data: { session } } = await supabase.auth.getSession();
    
    console.log('📋 Sessione trovata:', session ? 'SÌ' : 'NO');
    
    if (session) {
        currentUser = session.user;
        console.log('👤 Utente:', currentUser.email);
        await loadUserRole();
        showMainScreen();
    } else {
        console.log('🔐 Nessuna sessione, mostro login');
        showLoginScreen();
    }
    
    setupEventListeners();
    
    // Listener per cambi di stato autenticazione
    supabase.auth.onAuthStateChange((event, session) => {
        console.log('🔄 Auth state changed:', event);
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
    console.log('👔 Caricamento ruolo per:', currentUser.email);
    
    const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('email', currentUser.email)
        .single();
    
    console.log('📊 Risultato query ruolo:', data, error);
    
    if (error || !data) {
        console.log('⚠️ Nessun ruolo trovato, imposto operatore');
        currentUserRole = 'operatore';
    } else {
        console.log('✅ Ruolo trovato:', data.role);
        currentUserRole = data.role;
    }
    
    console.log('🎭 Ruolo finale assegnato:', currentUserRole);
    applyRolePermissions();
}

function applyRolePermissions() {
    const roleBadge = document.getElementById('user-role');
    roleBadge.textContent = currentUserRole === 'admin' ? '👑 Admin' : '👤 Operatore';
    roleBadge.classList.add(currentUserRole);
    
    if (currentUserRole === 'operatore') {
        document.getElementById('tab-nuovo-btn').style.display = 'none';
        document.getElementById('tab-report-btn').style.display = 'none';
        document.getElementById('tab-gestione-btn').style.display = 'none';
        
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
    document.getElementById('user-email').textContent = currentUser.email;
    loadInventory();
    loadMovements();
    
    if (currentUserRole === 'admin') {
        populateReportSelects();
        loadUsers();
    }
}

// ========================================
// AUTENTICAZIONE
// ========================================
async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    console.log('🔐 Tentativo login per:', email);
    
    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
    });
    
    if (error) {
        console.error('❌ Errore login:', error);
        alert('Errore login: ' + error.message);
        return;
    }
    
    console.log('✅ Login riuscito');
    currentUser = data.user;
    await loadUserRole();
    showMainScreen();
}

async function handleLogout() {
    console.log('🚪 Logout...');
    await supabase.auth.signOut();
    currentUser = null;
    currentUserRole = null;
    showLoginScreen();
}

// ========================================
// GESTIONE ARTICOLI
// ========================================
async function loadInventory() {
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
    applyFiltersAndSort();
}

function populateBrandFilter() {
    const brands = [...new Set(allArticles.map(a => a.marca_fornitore).filter(Boolean))];
    const select = document.getElementById('filter-brand');
    
    select.innerHTML = '<option value="">Tutti i fornitori</option>';
    brands.sort().forEach(brand => {
        const option = document.createElement('option');
        option.value = brand;
        option.textContent = brand;
        select.appendChild(option);
    });
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
        // Calcolo valore magazzino con IVA inclusa
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
                <h3>🏢 ${supplier}</h3>
                <div class="supplier-stats">
                    <div class="stat-item">
                        <span class="stat-label">Articoli</span>
                        <span class="stat-value">${supplierArticles.length}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Valore Magazzino</span>
                        <span class="stat-value">€ ${totalValue.toFixed(2)}</span>
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
            const editBtn = currentUserRole === 'admin' ? `<button onclick="openEditModal(${article.id})" class="btn-edit">✏️</button>` : '';
            const deleteBtn = currentUserRole === 'admin' ? `<button onclick="deleteArticle(${article.id})" class="btn-delete">🗑️</button>` : '';
            
            row.innerHTML = `
                <td><strong>${article.nome}</strong></td>
                <td>${article.codice_articolo}</td>
                <td><strong>${article.quantita}</strong></td>
                <td>${article.soglia_minima}</td>
                <td>€ ${parseFloat(article.prezzo_acquisto).toFixed(2)}</td>
                <td>${ivaPerc}%</td>
                <td>€ ${parseFloat(article.prezzo_vendita).toFixed(2)}</td>
                <td>${article.codice_barre}</td>
                <td>${article.note || '-'}</td>
                <td>
                    <button onclick="openMovementModal(${article.id}, 'carico')" class="btn-success" style="padding: 10px 16px; margin-right: 5px;">⬆️</button>
                    <button onclick="openMovementModal(${article.id}, 'scarico')" class="btn-danger" style="padding: 10px 16px; margin-right: 5px;">⬇️</button>
                    ${editBtn}
                    ${deleteBtn}
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
        const editBtn = currentUserRole === 'admin' ? `<button onclick="openEditModal(${article.id})" class="btn-edit">✏️</button>` : '';
        const deleteBtn = currentUserRole === 'admin' ? `<button onclick="deleteArticle(${article.id})" class="btn-delete">🗑️</button>` : '';
        
        html += `
            <tr ${rowClass}>
                <td><strong>${article.nome}</strong></td>
                <td>${article.codice_articolo}</td>
                <td><strong>${article.quantita}</strong></td>
                <td>${article.soglia_minima}</td>
                <td>€ ${parseFloat(article.prezzo_acquisto).toFixed(2)}</td>
                <td>${ivaPerc}%</td>
                <td>€ ${parseFloat(article.prezzo_vendita).toFixed(2)}</td>
                <td>${article.codice_barre}</td>
                <td>${article.marca_fornitore || '-'}</td>
                <td>${article.note || '-'}</td>
                <td>
                    <button onclick="openMovementModal(${article.id}, 'carico')" class="btn-success" style="padding: 10px 16px; margin-right: 5px;">⬆️</button>
                    <button onclick="openMovementModal(${article.id}, 'scarico')" class="btn-danger" style="padding: 10px 16px; margin-right: 5px;">⬇️</button>
                    ${editBtn}
                    ${deleteBtn}
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
        alert('Codice articolo già esistente!');
        return;
    }
    
    const { data: existingBarcode } = await supabase
        .from('articoli')
        .select('id')
        .eq('codice_barre', barcode)
        .single();
    
    if (existingBarcode) {
        alert('Codice a barre già esistente!');
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
    // Reset valori default
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
    loadInventory();
}

function closeEditModal() {
    document.getElementById('edit-modal').classList.add('hidden');
}

async function deleteArticle(articleId) {
    const article = allArticles.find(a => a.id === articleId);
    if (!article) return;
    
    const confirm = window.confirm(`Sei sicuro di voler eliminare "${article.nome}"?\n\nQuesta azione non può essere annullata.`);
    
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
    loadInventory();
}

// ========================================
// MOVIMENTI MAGAZZINO
// ========================================
function openMovementModal(articleId, type) {
    const article = allArticles.find(a => a.id === articleId);
    if (!article) return;
    
    currentArticleForMovement = { article, type };
    
    document.getElementById('modal-title').textContent = 
        type === 'carico' ? '⬆️ Carico Magazzino' : '⬇️ Scarico Magazzino';
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
        alert('Quantità non valida');
        return;
    }
    
    let newQuantity = article.quantita;
    if (type === 'carico') {
        newQuantity += quantity;
    } else {
        newQuantity -= quantity;
        if (newQuantity < 0) {
            alert('Quantità insufficiente in magazzino!');
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
    loadInventory();
    loadMovements();
    
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
// REPORT
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
    
    if (reportType === 'articolo') {
        const articleId = parseInt(document.getElementById('report-article').value);
        if (!articleId) {
            alert('Seleziona un articolo');
            return;
        }
        reportContent = await generateArticleReport(articleId, dateFrom, dateTo);
        
    } else if (reportType === 'fornitore') {
        const supplier = document.getElementById('report-supplier').value;
        if (!supplier) {
            alert('Seleziona un fornitore');
            return;
        }
        reportContent = generateSupplierReport(supplier, dateFrom, dateTo);
        
    } else if (reportType === 'inventario') {
        reportContent = generateInventoryReport();
    }
    
    document.getElementById('report-content').innerHTML = reportContent;
    document.getElementById('report-result').classList.remove('hidden');
}

async function generateArticleReport(articleId, dateFrom, dateTo) {
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
    
    const ivaPerc = article.iva_percentuale || 22;
    const prezzoConIVA = calcolaPrezzoConIVA(article.prezzo_acquisto, ivaPerc);
    const valoreMagazzino = article.quantita * prezzoConIVA;
    
    let html = `
        <h3>REPORT ARTICOLO</h3>
        <p><strong>Articolo:</strong> ${article.nome}</p>
        <p><strong>Codice Articolo:</strong> ${article.codice_articolo}</p>
        <p><strong>Codice a Barre:</strong> ${article.codice_barre}</p>
        <p><strong>Fornitore:</strong> ${article.marca_fornitore || 'N/D'}</p>
        <p><strong>Note:</strong> ${article.note || 'N/D'}</p>
        <p><strong>Quantità Attuale:</strong> ${article.quantita}</p>
        <p><strong>Prezzo Acquisto NETTO:</strong> € ${parseFloat(article.prezzo_acquisto).toFixed(2)}</p>
        <p><strong>IVA:</strong> ${ivaPerc}%</p>
        <p><strong>Prezzo Acquisto IVA inclusa:</strong> € ${prezzoConIVA.toFixed(2)}</p>
        <p><strong>Prezzo Vendita:</strong> € ${parseFloat(article.prezzo_vendita).toFixed(2)}</p>
        <p><strong>Valore Magazzino (IVA inc.):</strong> € ${valoreMagazzino.toFixed(2)}</p>
        <hr>
        <h4>RIEPILOGO MOVIMENTI</h4>
        <p><strong>Periodo:</strong> ${dateFrom || 'Inizio'} - ${dateTo || 'Oggi'}</p>
        <p><strong>Totale Carico:</strong> +${totalCarico}</p>
        <p><strong>Totale Scarico:</strong> -${totalScarico}</p>
        <p><strong>Differenza:</strong> ${totalCarico - totalScarico}</p>
        <hr>
        <h4>DETTAGLIO MOVIMENTI</h4>
        <table style="width: 100%; margin-top: 10px;">
            <thead>
                <tr style="background: var(--primary); color: white;">
                    <th>Data</th>
                    <th>Tipo</th>
                    <th>Quantità</th>
                    <th>Utente</th>
                    <th>Note</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    movements.forEach(m => {
        const date = new Date(m.created_at).toLocaleString('it-IT');
        html += `
            <tr>
                <td>${date}</td>
                <td style="color: ${m.tipo === 'carico' ? 'green' : 'red'}; font-weight: bold;">${m.tipo.toUpperCase()}</td>
                <td>${m.quantita}</td>
                <td>${m.utente}</td>
                <td>${m.note || '-'}</td>
            </tr>
        `;
    });
    
    html += `
            </tbody>
        </table>
    `;
    
    return html;
}

function generateSupplierReport(supplier, dateFrom, dateTo) {
    const supplierArticles = allArticles.filter(a => a.marca_fornitore === supplier);
    
    // Calcolo valore con IVA inclusa
    const totalValue = supplierArticles.reduce((sum, a) => {
        const ivaPerc = a.iva_percentuale || 22;
        const prezzoConIVA = calcolaPrezzoConIVA(a.prezzo_acquisto, ivaPerc);
        return sum + (a.quantita * prezzoConIVA);
    }, 0);
    
    const lowStockCount = supplierArticles.filter(a => a.quantita <= a.soglia_minima).length;
    const totalQuantity = supplierArticles.reduce((sum, a) => sum + a.quantita, 0);
    
    let html = `
        <h3>REPORT FORNITORE</h3>
        <p><strong>Fornitore:</strong> ${supplier}</p>
        <p><strong>Data Report:</strong> ${new Date().toLocaleDateString('it-IT')}</p>
        <p><strong>Periodo:</strong> ${dateFrom || 'Inizio'} - ${dateTo || 'Oggi'}</p>
        <hr>
        <h4>RIEPILOGO</h4>
        <p><strong>Numero Articoli:</strong> ${supplierArticles.length}</p>
        <p><strong>Quantità Totale:</strong> ${totalQuantity} pezzi</p>
        <p><strong>Valore Totale Magazzino (IVA inc.):</strong> € ${totalValue.toFixed(2)}</p>
        <p><strong>Articoli sotto soglia:</strong> ${lowStockCount}</p>
        <hr>
        <h4>DETTAGLIO ARTICOLI</h4>
        <table style="width: 100%; margin-top: 10px;">
            <thead>
                <tr style="background: var(--primary); color: white;">
                    <th>Nome</th>
                    <th>Codice</th>
                    <th>Qty</th>
                    <th>Soglia</th>
                    <th>Pr. Acq. Netto</th>
                    <th>IVA %</th>
                    <th>Valore Tot</th>
                    <th>Note</th>
                    <th>Stato</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    supplierArticles.forEach(article => {
        const ivaPerc = article.iva_percentuale || 22;
        const prezzoConIVA = calcolaPrezzoConIVA(article.prezzo_acquisto, ivaPerc);
        const totalArticleValue = article.quantita * prezzoConIVA;
        const rowStyle = article.quantita <= article.soglia_minima ? 'background: #fee2e2;' : '';
        const stato = article.quantita <= article.soglia_minima ? '⚠️ DA ORDINARE' : '✅ OK';
        
        html += `
            <tr style="${rowStyle}">
                <td><strong>${article.nome}</strong></td>
                <td>${article.codice_articolo}</td>
                <td><strong>${article.quantita}</strong></td>
                <td>${article.soglia_minima}</td>
                <td>€ ${parseFloat(article.prezzo_acquisto).toFixed(2)}</td>
                <td>${ivaPerc}%</td>
                <td>€ ${totalArticleValue.toFixed(2)}</td>
                <td>${article.note || '-'}</td>
                <td>${stato}</td>
            </tr>
        `;
    });
    
    html += `
            </tbody>
        </table>
    `;
    
    return html;
}

function generateInventoryReport() {
    const totalArticles = allArticles.length;
    const totalQuantity = allArticles.reduce((sum, a) => sum + a.quantita, 0);
    
    // Calcolo valore con IVA inclusa
    const totalValue = allArticles.reduce((sum, a) => {
        const ivaPerc = a.iva_percentuale || 22;
        const prezzoConIVA = calcolaPrezzoConIVA(a.prezzo_acquisto, ivaPerc);
        return sum + (a.quantita * prezzoConIVA);
    }, 0);
    
    const lowStockCount = allArticles.filter(a => a.quantita <= a.soglia_minima).length;
    
    const suppliers = [...new Set(allArticles.map(a => a.marca_fornitore).filter(Boolean))];
    
    let html = `
        <h3>REPORT INVENTARIO COMPLETO</h3>
        <p><strong>Data:</strong> ${new Date().toLocaleString('it-IT')}</p>
        <hr>
        <h4>RIEPILOGO GENERALE</h4>
        <p><strong>Totale Articoli:</strong> ${totalArticles}</p>
        <p><strong>Quantità Totale Pezzi:</strong> ${totalQuantity}</p>
        <p><strong>Valore Totale Magazzino (IVA inc.):</strong> € ${totalValue.toFixed(2)}</p>
        <p><strong>Articoli sotto soglia:</strong> ${lowStockCount}</p>
        <p><strong>Numero Fornitori:</strong> ${suppliers.length}</p>
        <hr>
        <h4>DETTAGLIO PER FORNITORE</h4>
    `;
    
    suppliers.sort().forEach(supplier => {
        const supplierArticles = allArticles.filter(a => a.marca_fornitore === supplier);
        const supplierValue = supplierArticles.reduce((sum, a) => {
            const ivaPerc = a.iva_percentuale || 22;
            const prezzoConIVA = calcolaPrezzoConIVA(a.prezzo_acquisto, ivaPerc);
            return sum + (a.quantita * prezzoConIVA);
        }, 0);
        const supplierLowStock = supplierArticles.filter(a => a.quantita <= a.soglia_minima).length;
        
        html += `
            <div style="margin: 20px 0; padding: 15px; background: var(--green-light); border-radius: 12px; border-left: 4px solid var(--primary);">
                <h4 style="margin-bottom: 10px;">🏢 ${supplier}</h4>
                <p><strong>Articoli:</strong> ${supplierArticles.length} | <strong>Valore:</strong> € ${supplierValue.toFixed(2)} | <strong>Da Ordinare:</strong> ${supplierLowStock}</p>
            </div>
        `;
    });
    
    html += `
        <hr>
        <h4>TUTTI GLI ARTICOLI</h4>
        <table style="width: 100%; margin-top: 10px; font-size: 12px;">
            <thead>
                <tr style="background: var(--primary); color: white;">
                    <th>Nome</th>
                    <th>Codice</th>
                    <th>Fornitore</th>
                    <th>Qty</th>
                    <th>Soglia</th>
                    <th>Pr. Acq. Netto</th>
                    <th>IVA %</th>
                    <th>Valore</th>
                    <th>Note</th>
                    <th>Stato</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    allArticles.forEach(article => {
        const ivaPerc = article.iva_percentuale || 22;
        const prezzoConIVA = calcolaPrezzoConIVA(article.prezzo_acquisto, ivaPerc);
        const totalArticleValue = article.quantita * prezzoConIVA;
        const rowStyle = article.quantita <= article.soglia_minima ? 'background: #fee2e2;' : '';
        const stato = article.quantita <= article.soglia_minima ? '⚠️' : '✅';
        
        html += `
            <tr style="${rowStyle}">
                <td><strong>${article.nome}</strong></td>
                <td>${article.codice_articolo}</td>
                <td>${article.marca_fornitore || '-'}</td>
                <td><strong>${article.quantita}</strong></td>
                <td>${article.soglia_minima}</td>
                <td>€ ${parseFloat(article.prezzo_acquisto).toFixed(2)}</td>
                <td>${ivaPerc}%</td>
                <td>€ ${totalArticleValue.toFixed(2)}</td>
                <td>${article.note || '-'}</td>
                <td>${stato}</td>
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
// GESTIONE UTENTI (solo admin)
// ========================================
async function loadUsers() {
    const { data, error } = await supabase
        .from('user_roles')
        .select('*')
        .order('email');
    
    if (error) {
        console.error('Errore caricamento utenti:', error);
        return;
    }
    
    allUsers = data || [];
    renderUsers();
}

function renderUsers() {
    const tbody = document.getElementById('users-tbody');
    tbody.innerHTML = '';
    
    if (allUsers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center">Nessun utente registrato</td></tr>';
        return;
    }
    
    allUsers.forEach(user => {
        const row = document.createElement('tr');
        const roleBadge = user.role === 'admin' ? '<span class="role-badge admin">👑 Admin</span>' : '<span class="role-badge operatore">👤 Operatore</span>';
        
        row.innerHTML = `
            <td>${user.email}</td>
            <td>${roleBadge}</td>
            <td>
                ${user.email !== currentUser.email ? `<button onclick="deleteUser('${user.email}')" class="btn-delete">Elimina</button>` : '<em>Tu</em>'}
            </td>
        `;
        
        tbody.appendChild(row);
    });
}

async function handleAddUser(e) {
    e.preventDefault();
    
    const email = document.getElementById('new-user-email').value;
    const password = document.getElementById('new-user-password').value;
    const role = document.getElementById('new-user-role').value;
    
    if (password.length < 6) {
        alert('La password deve essere di almeno 6 caratteri');
        return;
    }
    
    const { data: existingUser } = await supabase
        .from('user_roles')
        .select('email')
        .eq('email', email)
        .single();
    
    if (existingUser) {
        alert('Utente già registrato!');
        return;
    }
    
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: email,
        password: password,
        email_confirm: true
    });
    
    if (authError) {
        alert('Errore creazione utente: ' + authError.message);
        return;
    }
    
    const { error: roleError } = await supabase
        .from('user_roles')
        .insert([{
            email: email,
            role: role
        }]);
    
    if (roleError) {
        alert('Errore assegnazione ruolo: ' + roleError.message);
        return;
    }
    
    alert('Utente creato con successo!');
    document.getElementById('add-user-form').reset();
    loadUsers();
}

async function deleteUser(email) {
    const confirm = window.confirm(`Sei sicuro di voler eliminare l'utente ${email}?`);
    
    if (!confirm) return;
    
    const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('email', email);
    
    if (error) {
        alert('Errore eliminazione utente: ' + error.message);
        return;
    }
    
    alert('Utente eliminato con successo!');
    loadUsers();
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
    // Ferma lo scanner immediatamente dopo la scansione
    if (html5QrCode && html5QrCode.isScanning) {
        await html5QrCode.stop();
        html5QrCode = null;
    }
    
    const article = allArticles.find(a => a.codice_barre === decodedText);
    
    if (!article) {
        alert('Articolo non trovato nel database!');
        // Riavvia lo scanner
        setTimeout(() => initScanner(), 500);
        return;
    }
    
    document.getElementById('scanned-article').textContent = 
        `${article.nome} (${article.codice_articolo})\nQuantità: ${article.quantita}`;
    document.getElementById('scanner-result').classList.remove('hidden');
    
    window.scannedArticle = article;
    
    // Nascondi il reader video
    document.getElementById('reader').style.display = 'none';
}

function onScanError(errorMessage) {
    // Ignora errori di scansione continua
}

// ========================================
// NAVIGAZIONE TAB
// ========================================
function switchTab(tabName) {
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
    
    if (tabName === 'gestione' && currentUserRole === 'admin') {
        loadUsers();
    }
}

// ========================================
// EVENT LISTENERS
// ========================================
function setupEventListeners() {
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
    
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
    
    document.getElementById('add-user-form').addEventListener('submit', handleAddUser);

    document.getElementById('btn-rescan').addEventListener('click', () => {
        document.getElementById('scanner-result').classList.add('hidden');
        document.getElementById('reader').style.display = 'block';
        window.scannedArticle = null;
        initScanner();
    });
}