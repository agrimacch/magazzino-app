// ========================================
// GESTIONE RICAMBI STOCK - FUNZIONI DEDICATE
// ========================================

// Variabile temporanea per dati Excel
let excelDataToImport = null;
let excelFileName = '';

// ========================================
// CUSTOM ALERT CON HTML ENTITIES
// ========================================
function showCustomAlert(message, title = 'Attenzione', icon = '&#9888;&#65039;') {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-alert-modal');
        const iconEl = document.getElementById('custom-alert-icon');
        const titleEl = document.getElementById('custom-alert-title');
        const messageEl = document.getElementById('custom-alert-message');
        const okBtn = document.getElementById('custom-alert-ok');
        
        iconEl.innerHTML = icon;
        titleEl.innerHTML = title;
        messageEl.innerHTML = message;
        
        modal.classList.remove('hidden');
        
        const handleOk = () => {
            modal.classList.add('hidden');
            okBtn.removeEventListener('click', handleOk);
            resolve();
        };
        
        okBtn.addEventListener('click', handleOk);
    });
}

// ========================================
// IMPORT EXCEL - RICAMBI (STEP 1: PREVIEW)
// ========================================
function handleExcelImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    excelFileName = file.name;
    const reader = new FileReader();
    
    reader.onload = async function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
            
            const dataRows = rows.slice(1).filter(row => row && row.length > 0 && row[0]);
            
            if (dataRows.length > 100) {
                await showCustomAlert(
                    'Il file contiene <strong>' + dataRows.length + ' righe</strong>.<br><br>' +
                    'MASSIMO CONSENTITO: <strong>100 righe</strong><br><br>' +
                    'Riduci il numero di righe e riprova.',
                    'Limite Superato',
                    '&#9888;&#65039;'
                );
                event.target.value = '';
                cancelExcelImport();
                return;
            }
            
            if (dataRows.length === 0) {
                await showCustomAlert('Il file non contiene dati validi.', 'Errore', '&#10060;');
                event.target.value = '';
                cancelExcelImport();
                return;
            }
            
            excelDataToImport = dataRows;
            showExcelPreview(excelFileName, dataRows.length);
            
        } catch (error) {
            console.error('Errore lettura Excel:', error);
            await showCustomAlert(
                'Errore durante la lettura del file Excel.<br><br>' +
                'Verifica che il file sia in formato .xlsx valido.<br><br>' +
                '<strong>Errore:</strong> ' + error.message,
                'Errore Lettura',
                '&#10060;'
            );
            event.target.value = '';
            cancelExcelImport();
        }
    };
    
    reader.readAsArrayBuffer(file);
}

function showExcelPreview(filename, numRows) {
    document.getElementById('excel-filename').textContent = filename;
    document.getElementById('excel-info').textContent = numRows + ' ricambi pronti per l\'importazione';
    document.getElementById('btn-select-excel').style.display = 'none';
    document.getElementById('excel-preview').style.display = 'block';
}

function cancelExcelImport() {
    excelDataToImport = null;
    excelFileName = '';
    document.getElementById('excel-file-input').value = '';
    document.getElementById('excel-preview').style.display = 'none';
    document.getElementById('btn-select-excel').style.display = 'block';
}

// ========================================
// IMPORT EXCEL - AGGIORNA ANCHE RICAMBI A ZERO
// ========================================
async function confirmExcelImport() {
    if (!excelDataToImport || excelDataToImport.length === 0) {
        await showCustomAlert('Nessun dato da importare', 'Errore', '&#10060;');
        return;
    }
    
    const btnImport = document.getElementById('btn-import-excel');
    btnImport.disabled = true;
    btnImport.innerHTML = '&#8987; Importazione in corso...';
    
    let nuoviInseriti = 0;
    let esistentiAggiornati = 0;
    let errori = [];
    
    for (let i = 0; i < excelDataToImport.length; i++) {
        const row = excelDataToImport[i];
        
        // Converti tutto in maiuscolo
        const codice = row[0] ? String(row[0]).trim().toUpperCase() : '';
        const nome = row[1] ? String(row[1]).trim().toUpperCase() : '';
        const barcode = row[2] ? String(row[2]).trim().toUpperCase() : '';
        const quantitaDaAggiungere = row[3] ? parseInt(row[3]) : 0;
        const fornitore = row[4] ? String(row[4]).trim().toUpperCase() : '';
        const note = row[5] ? String(row[5]).trim().toUpperCase() : null;
        
        if (!codice || !nome || !fornitore) {
            errori.push('Riga ' + (i+2) + ': Campi obbligatori mancanti');
            continue;
        }
        
        if (quantitaDaAggiungere <= 0) {
            errori.push('Riga ' + (i+2) + ': Quantit&#224; non valida');
            continue;
        }
        
        // Verifica se esiste (ANCHE SE quantita = 0)
        const { data: existing, error: selectError } = await supabaseClient
            .from('ricambi_stock')
            .select('id, quantita')
            .eq('codice_articolo', codice)
            .maybeSingle();
        
        if (selectError) {
            errori.push('Riga ' + (i+2) + ': Errore query - ' + selectError.message);
            continue;
        }
        
        if (existing) {
            // ESISTE (anche se a zero) Ã¢â€ â€™ AGGIORNA
            const nuovaQuantita = existing.quantita + quantitaDaAggiungere;
            
            const { error: updateError } = await supabaseClient
                .from('ricambi_stock')
                .update({ quantita: nuovaQuantita })
                .eq('id', existing.id);
            
            if (updateError) {
                errori.push('Riga ' + (i+2) + ': Errore aggiornamento - ' + updateError.message);
                continue;
            }
            
            // Registra movimento CARICO
            await supabaseClient
                .from('movimenti_ricambi')
                .insert([{
                    ricambio_id: existing.id,
                    tipo: 'carico',
                    quantita: quantitaDaAggiungere,
                    utente: currentUser.email,
                    note: 'Import Excel: ' + excelFileName
                }]);
            
            esistentiAggiornati++;
            
        } else {
            // NON ESISTE Ã¢â€ â€™ INSERISCI NUOVO
            const { data: inserted, error: insertError } = await supabaseClient
                .from('ricambi_stock')
                .insert([{
                    codice_articolo: codice,
                    nome: nome,
                    codice_barre: barcode || null,
                    quantita: quantitaDaAggiungere,
                    soglia_minima: 1,
                    marca_fornitore: fornitore,
                    note: note
                }])
                .select('id')
                .single();
            
            if (insertError) {
                errori.push('Riga ' + (i+2) + ': Errore inserimento - ' + insertError.message);
                continue;
            }
            
            if (inserted) {
                await supabaseClient
                    .from('movimenti_ricambi')
                    .insert([{
                        ricambio_id: inserted.id,
                        tipo: 'carico',
                        quantita: quantitaDaAggiungere,
                        utente: currentUser.email,
                        note: 'Import Excel: ' + excelFileName
                    }]);
            }
            
            nuoviInseriti++;
        }
    }
    
    cancelExcelImport();
    btnImport.disabled = false;
    btnImport.innerHTML = '&#128229; IMPORTA RICAMBI';
    
    let messaggio = 'Nuovi ricambi inseriti: <strong>' + nuoviInseriti + '</strong><br>';
    messaggio += 'Ricambi esistenti aggiornati: <strong>' + esistentiAggiornati + '</strong><br>';
    
    if (errori.length > 0) {
        messaggio += '<br><strong>Errori (' + errori.length + '):</strong><br>';
        messaggio += errori.slice(0, 5).join('<br>');
        if (errori.length > 5) {
            messaggio += '<br>... e altri ' + (errori.length - 5) + ' errori';
        }
    }
    
    await showCustomAlert(
        messaggio,
        errori.length > 0 ? 'Import con Errori' : 'Import Completato',
        errori.length > 0 ? '&#9888;&#65039;' : '&#10004;'
    );
    
    loadRicambi();
    loadMovementsRicambi();
}

// ========================================
// PERSISTENZA FILTRI
// ========================================
function saveRicambiFilters() {
    const filters = {
        brand: document.getElementById('filter-ricambi-brand')?.value || '',
        search: document.getElementById('search-ricambi-input')?.value || '',
        sort: document.getElementById('sort-ricambi-select')?.value || 'fornitore-asc',
        group: document.getElementById('group-ricambi-by-supplier')?.checked !== false
    };
    sessionStorage.setItem('ricambiFilters', JSON.stringify(filters));
}

function restoreRicambiFilters() {
    // MODIFICA: reset sempre a default (vedi nota in app.js restoreInventoryFilters)
    if (document.getElementById('filter-ricambi-brand')) {
        document.getElementById('filter-ricambi-brand').value = '';
        document.getElementById('search-ricambi-input').value = '';
        document.getElementById('sort-ricambi-select').value = 'fornitore-asc';
        document.getElementById('group-ricambi-by-supplier').checked = true;
    }
}

// ========================================
// CARICAMENTO RICAMBI
// ========================================
async function loadRicambi() {
    const { data, error } = await supabaseClient
        .from('ricambi_stock')
        .select('*')
        .order('marca_fornitore, nome');
    
    if (error) {
        console.error('Errore caricamento ricambi:', error);
        return;
    }
    
    allRicambi = data || [];
    populateRicambiBrandFilter();
    restoreRicambiFilters();
    applyRicambiFiltersAndSort();
}

function populateRicambiBrandFilter() {
    const brands = [...new Set(allRicambi.map(r => r.marca_fornitore).filter(Boolean))];
    const select = document.getElementById('filter-ricambi-brand');
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

// ========================================
// FILTRI E ORDINAMENTO
// ========================================
function applyRicambiFiltersAndSort() {
    saveRicambiFilters();
    
    const searchQuery = document.getElementById('search-ricambi-input').value.toLowerCase();
    const brandFilter = document.getElementById('filter-ricambi-brand').value;
    const sortValue = document.getElementById('sort-ricambi-select').value;
    const groupBySupplier = document.getElementById('group-ricambi-by-supplier').checked;
    
    let filtered = allRicambi.filter(ricambio => {
        const matchesSearch = 
            ricambio.nome.toLowerCase().includes(searchQuery) ||
            ricambio.codice_articolo.toLowerCase().includes(searchQuery) ||
            (ricambio.codice_barre && ricambio.codice_barre.includes(searchQuery)) ||
            (ricambio.marca_fornitore && ricambio.marca_fornitore.toLowerCase().includes(searchQuery)) ||
            (ricambio.note && ricambio.note.toLowerCase().includes(searchQuery));
        
        const matchesBrand = !brandFilter || ricambio.marca_fornitore === brandFilter;
        
        return matchesSearch && matchesBrand;
    });
    
    const [sortField, sortOrder] = sortValue.split('-');
    
    filtered.sort((a, b) => {
        let valA, valB;
        
        if (sortField === 'nome') {
            valA = a.nome.toLowerCase();
            valB = b.nome.toLowerCase();
        } else if (sortField === 'codice') {
            valA = a.codice_articolo.toLowerCase();
            valB = b.codice_articolo.toLowerCase();
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
    
    // SEPARA: Ricambi disponibili (qty > 0) ed esauriti (qty = 0)
    const disponibili = filtered.filter(r => r.quantita > 0);
    const esauriti = filtered.filter(r => r.quantita === 0);
    
    // Rendering inventario principale (SOLO qty > 0)
    if (groupBySupplier) {
        renderRicambiBySupplier(disponibili);
    } else {
        renderRicambiFlat(disponibili);
    }
    
    // Rendering sezione esauriti (qty = 0)
    renderRicambiEsauriti(esauriti);
}

// ========================================
// RENDERING INVENTARIO PRINCIPALE (qty > 0)
// ========================================
function renderRicambiBySupplier(ricambi) {
    const container = document.getElementById('ricambi-inventory-container');
    
    if (!container) {
        console.error('ERRORE: ricambi-inventory-container NON TROVATO!');
        return;
    }
    
    container.innerHTML = '';
    
    if (ricambi.length === 0) {
        container.innerHTML = '<div class="card"><p style="text-align:center">Nessun ricambio disponibile</p></div>';
        return;
    }
    
    const groupedBySupplier = {};
    
    ricambi.forEach(ricambio => {
        const supplier = ricambio.marca_fornitore || 'Senza Fornitore';
        if (!groupedBySupplier[supplier]) {
            groupedBySupplier[supplier] = [];
        }
        groupedBySupplier[supplier].push(ricambio);
    });
    
    Object.keys(groupedBySupplier).sort().forEach(supplier => {
        const supplierRicambi = groupedBySupplier[supplier];
        const totalItems = supplierRicambi.length;
        
        const section = document.createElement('div');
        section.className = 'supplier-section';
        
        section.innerHTML = `
            <div class="supplier-header">
                <h3>&#127970; ${supplier}</h3>
                <div class="supplier-stats">
                    <div class="stat-item">
                        <span class="stat-label">Ricambi</span>
                        <span class="stat-value">${totalItems}</span>
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
                            <th class="hide-on-mobile">Barcode</th>
                            <th class="hide-on-mobile">Note</th>
                            <th>Azioni</th>
                        </tr>
                    </thead>
                    <tbody id="supplier-ricambi-tbody-${supplier.replace(/\s+/g, '-')}">
                    </tbody>
                </table>
            </div>
        `;
        
        container.appendChild(section);
        
        const tbody = section.querySelector('tbody');
        supplierRicambi.forEach(ricambio => {
            const row = document.createElement('tr');
            
            const editBtn = currentUserRole === 'admin' ? 
                `<button onclick="window.openEditRicambioModal(${ricambio.id})" class="btn-edit">&#9997;</button>` : '';
            const deleteBtn = currentUserRole === 'admin' ? 
                `<button onclick="window.deleteRicambio(${ricambio.id})" class="btn-delete">&#128465;</button>` : '';
            
            row.innerHTML = `
                <td><strong>${ricambio.nome}</strong></td>
                <td>${ricambio.codice_articolo}</td>
                <td><strong>${ricambio.quantita}</strong></td>
                <td class="hide-on-mobile">${ricambio.codice_barre || '-'}</td>
                <td class="hide-on-mobile">${ricambio.note || '-'}</td>
                <td>
                    <div class="action-buttons-grid">
                        <button onclick="window.openMovementRicambiModal(${ricambio.id}, 'carico')" class="btn-success">&#10133;</button>
                        <button onclick="window.openMovementRicambiModal(${ricambio.id}, 'scarico')" class="btn-danger">&#10134;</button>
                        ${editBtn}
                        ${deleteBtn}
                    </div>
                </td>
            `;
            
            tbody.appendChild(row);
        });
    });
}

function renderRicambiFlat(ricambi) {
    const container = document.getElementById('ricambi-inventory-container');
    
    if (ricambi.length === 0) {
        container.innerHTML = '<div class="card"><p style="text-align:center">Nessun ricambio disponibile</p></div>';
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
                        <th class="hide-on-mobile">Barcode</th>
                        <th>Fornitore</th>
                        <th class="hide-on-mobile">Note</th>
                        <th>Azioni</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    ricambi.forEach(ricambio => {
        const editBtn = currentUserRole === 'admin' ? 
            `<button onclick="window.openEditRicambioModal(${ricambio.id})" class="btn-edit">&#9997;</button>` : '';
        const deleteBtn = currentUserRole === 'admin' ? 
            `<button onclick="window.deleteRicambio(${ricambio.id})" class="btn-delete">&#128465;</button>` : '';
        
        html += `
            <tr>
                <td><strong>${ricambio.nome}</strong></td>
                <td>${ricambio.codice_articolo}</td>
                <td><strong>${ricambio.quantita}</strong></td>
                <td class="hide-on-mobile">${ricambio.codice_barre || '-'}</td>
                <td>${ricambio.marca_fornitore || '-'}</td>
                <td class="hide-on-mobile">${ricambio.note || '-'}</td>
                <td>
                    <div class="action-buttons-grid">
                        <button onclick="window.openMovementRicambiModal(${ricambio.id}, 'carico')" class="btn-success">&#10133;</button>
                        <button onclick="window.openMovementRicambiModal(${ricambio.id}, 'scarico')" class="btn-danger">&#10134;</button>
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

// ========================================
// RENDERING RICAMBI ESAURITI (qty = 0)
// ========================================
function renderRicambiEsauriti(ricambi) {
    const container = document.getElementById('ricambi-inventory-container');
    
    if (ricambi.length === 0) {
        // Nessun ricambio esaurito, non mostrare nulla
        return;
    }
    
    // Crea sezione collassabile
    const section = document.createElement('div');
    section.className = 'card';
    section.style.marginTop = '30px';
    section.style.background = '#fef3c7';
    section.style.borderLeft = '4px solid #f59e0b';
    
    section.innerHTML = `
        <div style="cursor: pointer;" onclick="window.toggleRicambiEsauriti()">
            <h3 style="color: #92400e; display: flex; align-items: center; gap: 10px;">
                <span id="ricambi-esauriti-toggle">&#9660;</span>
                &#128230; Ricambi Esauriti (${ricambi.length})
            </h3>
            <p style="font-size: 13px; color: #78350f; margin-top: 8px;">
                Clicca per visualizzare i ricambi terminati. Puoi ricaricarli per riportarli in inventario.
            </p>
        </div>
        <div id="ricambi-esauriti-content" style="display: none; margin-top: 20px;">
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Nome</th>
                            <th>Codice</th>
                            <th class="hide-on-mobile">Barcode</th>
                            <th>Fornitore</th>
                            <th class="hide-on-mobile">Note</th>
                            <th>Azioni</th>
                        </tr>
                    </thead>
                    <tbody id="ricambi-esauriti-tbody">
                    </tbody>
                </table>
            </div>
        </div>
    `;
    
    container.appendChild(section);
    
    const tbody = document.getElementById('ricambi-esauriti-tbody');
    ricambi.forEach(ricambio => {
        const row = document.createElement('tr');
        
        const editBtn = currentUserRole === 'admin' ? 
            `<button onclick="window.openEditRicambioModal(${ricambio.id})" class="btn-edit">&#9997;</button>` : '';
        const deleteBtn = currentUserRole === 'admin' ? 
            `<button onclick="window.deleteRicambio(${ricambio.id})" class="btn-delete">&#128465;</button>` : '';
        
        row.innerHTML = `
            <td><strong>${ricambio.nome}</strong></td>
            <td>${ricambio.codice_articolo}</td>
            <td class="hide-on-mobile">${ricambio.codice_barre || '-'}</td>
            <td>${ricambio.marca_fornitore || '-'}</td>
            <td class="hide-on-mobile">${ricambio.note || '-'}</td>
            <td>
                <div class="action-buttons-grid">
                    <button onclick="window.openMovementRicambiModal(${ricambio.id}, 'carico')" class="btn-success">&#10133; Ricarica</button>
                    ${editBtn}
                    ${deleteBtn}
                </div>
            </td>
        `;
        
        tbody.appendChild(row);
    });
}

// Toggle sezione esauriti
function toggleRicambiEsauriti() {
    const content = document.getElementById('ricambi-esauriti-content');
    const toggle = document.getElementById('ricambi-esauriti-toggle');
    
    if (content.style.display === 'none') {
        content.style.display = 'block';
        toggle.innerHTML = '&#9650;';
    } else {
        content.style.display = 'none';
        toggle.innerHTML = '&#9660;';
    }
}

// ========================================
// NUOVO RICAMBIO MANUALE
// ========================================
async function handleNewRicambio(e) {
    e.preventDefault();
    
    // Converti tutto in maiuscolo
    const code = document.getElementById('new-ricambio-code').value.trim().toUpperCase();
    const name = document.getElementById('new-ricambio-name').value.trim().toUpperCase();
    const barcode = document.getElementById('new-ricambio-barcode').value.trim().toUpperCase() || null;
    const brand = document.getElementById('new-ricambio-brand').value.trim().toUpperCase();
    const quantity = parseInt(document.getElementById('new-ricambio-quantity').value);
    const notes = document.getElementById('new-ricambio-notes').value.trim().toUpperCase() || null;
    
    const { data: existingCode } = await supabaseClient
        .from('ricambi_stock')
        .select('id')
        .eq('codice_articolo', code)
        .single();
    
    if (existingCode) {
        await showCustomAlert('Codice articolo gi&#224; esistente!', 'Errore', '&#10060;');
        return;
    }
    
    // INSERISCI RICAMBIO E OTTIENI L'ID
    const { data: newRicambio, error } = await supabaseClient
        .from('ricambi_stock')
        .insert([{
            codice_articolo: code,
            nome: name,
            codice_barre: barcode,
            marca_fornitore: brand,
            quantita: quantity,
            soglia_minima: 1,
            note: notes
        }])
        .select('id')
        .single();
    
    if (error) {
        await showCustomAlert('Errore durante il salvataggio:<br>' + error.message, 'Errore', '&#10060;');
        return;
    }
    
    // SE QUANTITA INIZIALE > 0, CREA MOVIMENTO DI CARICO
    if (quantity > 0 && newRicambio) {
        console.log('DEBUG: Tento di creare movimento ricambio con ID:', newRicambio.id);
        
        const { error: movementError } = await supabaseClient
            .from('movimenti_ricambi')
            .insert([{
                ricambio_id: newRicambio.id,
                tipo: 'carico',
                quantita: quantity,
                utente: currentUser.email,
                note: 'Carico da creazione ricambio'
            }]);
        
        if (movementError) {
            console.error('ERRORE registrazione movimento ricambio:', movementError);
            await showCustomAlert(
                'Ricambio creato ma movimento NON registrato:<br><br>' + movementError.message,
                'Warning',
                '&#9888;&#65039;'
            );
        } else {
            console.log('DEBUG: Movimento ricambio registrato con successo!');
        }
    } else {
        console.log('DEBUG: Nessun movimento da creare (qty=' + quantity + ', newRicambio=' + (newRicambio ? 'OK' : 'NULL') + ')');
    }
    
    await showCustomAlert('Ricambio aggiunto con successo!', 'Successo', '&#10004;');
    document.getElementById('new-ricambio-form').reset();
    document.getElementById('new-ricambio-quantity').value = 0;
    loadRicambi();
    loadMovementsRicambi(); // Ricarica anche i movimenti
}

// ========================================
// MODIFICA RICAMBIO
// ========================================
function openEditRicambioModal(ricambioId) {
    const ricambio = allRicambi.find(r => r.id === ricambioId);
    if (!ricambio) return;
    
    document.getElementById('edit-ricambio-id').value = ricambio.id;
    document.getElementById('edit-ricambio-code').value = ricambio.codice_articolo;
    document.getElementById('edit-ricambio-name').value = ricambio.nome;
    document.getElementById('edit-ricambio-barcode').value = ricambio.codice_barre || '';
    document.getElementById('edit-ricambio-brand').value = ricambio.marca_fornitore;
    document.getElementById('edit-ricambio-quantity').value = ricambio.quantita;
    document.getElementById('edit-ricambio-notes').value = ricambio.note || '';
    
    document.getElementById('edit-ricambio-modal').classList.remove('hidden');
}

async function handleEditRicambio(e) {
    e.preventDefault();
    
    const id = parseInt(document.getElementById('edit-ricambio-id').value);
    // Converti tutto in maiuscolo
    const code = document.getElementById('edit-ricambio-code').value.trim().toUpperCase();
    const name = document.getElementById('edit-ricambio-name').value.trim().toUpperCase();
    const barcode = document.getElementById('edit-ricambio-barcode').value.trim().toUpperCase() || null;
    const brand = document.getElementById('edit-ricambio-brand').value.trim().toUpperCase();
    const quantity = parseInt(document.getElementById('edit-ricambio-quantity').value);
    const notes = document.getElementById('edit-ricambio-notes').value.trim().toUpperCase() || null;
    
    const { error } = await supabaseClient
        .from('ricambi_stock')
        .update({
            codice_articolo: code,
            nome: name,
            codice_barre: barcode,
            marca_fornitore: brand,
            quantita: quantity,
            soglia_minima: 1,
            note: notes
        })
        .eq('id', id);
    
    if (error) {
        await showCustomAlert('Errore durante la modifica:<br>' + error.message, 'Errore', '&#10060;');
        return;
    }
    
    await showCustomAlert('Ricambio modificato con successo!', 'Successo', '&#10004;');
    closeEditRicambioModal();
    loadRicambi();
}

function closeEditRicambioModal() {
    document.getElementById('edit-ricambio-modal').classList.add('hidden');
}

// ========================================
// ELIMINA RICAMBIO
// ========================================
async function deleteRicambio(ricambioId) {
    const ricambio = allRicambi.find(r => r.id === ricambioId);
    if (!ricambio) return;
    
    const confirm = window.confirm('Sei sicuro di voler eliminare "' + ricambio.nome + '"?\n\nQuesta azione non pu&#242; essere annullata.');
    
    if (!confirm) return;
    
    const { error } = await supabaseClient
        .from('ricambi_stock')
        .delete()
        .eq('id', ricambioId);
    
    if (error) {
        await showCustomAlert('Errore durante l\'eliminazione:<br>' + error.message, 'Errore', '&#10060;');
        return;
    }
    
    await showCustomAlert('Ricambio eliminato con successo!', 'Successo', '&#10004;');
    loadRicambi();
}

// ========================================
// MOVIMENTI RICAMBI
// ========================================
function openMovementRicambiModal(ricambioId, type) {
    const ricambio = allRicambi.find(r => r.id === ricambioId);
    if (!ricambio) return;
    
    currentRicambioForMovement = { ricambio, type };
    
    document.getElementById('modal-ricambi-title').innerHTML = 
        type === 'carico' ? '&#10133; Carico Ricambio' : '&#10134; Scarico Ricambio';
    document.getElementById('modal-ricambi-name').textContent = ricambio.nome;
    document.getElementById('modal-ricambi-current-qty').textContent = ricambio.quantita;
    document.getElementById('modal-ricambi-quantity').value = 1;
    document.getElementById('modal-ricambi-notes').value = '';
    
    document.getElementById('movement-ricambi-modal').classList.remove('hidden');
}

async function confirmMovementRicambi() {
    if (!currentRicambioForMovement) return;
    
    const { ricambio, type } = currentRicambioForMovement;
    const quantity = parseInt(document.getElementById('modal-ricambi-quantity').value);
    const notes = document.getElementById('modal-ricambi-notes').value.trim();
    
    if (quantity <= 0) {
        await showCustomAlert('Quantit&#224; non valida', 'Errore', '&#10060;');
        return;
    }
    
    let newQuantity = ricambio.quantita;
    if (type === 'carico') {
        newQuantity += quantity;
    } else {
        newQuantity -= quantity;
        if (newQuantity < 0) {
            await showCustomAlert('Quantit&#224; insufficiente in magazzino!', 'Errore', '&#10060;');
            return;
        }
    }
    
    const { error: updateError } = await supabaseClient
        .from('ricambi_stock')
        .update({ quantita: newQuantity })
        .eq('id', ricambio.id);
    
    if (updateError) {
        await showCustomAlert('Errore aggiornamento:<br>' + updateError.message, 'Errore', '&#10060;');
        return;
    }
    
    const { error: movementError } = await supabaseClient
        .from('movimenti_ricambi')
        .insert([{
            ricambio_id: ricambio.id,
            tipo: type,
            quantita: quantity,
            utente: currentUser.email,
            note: notes || null
        }]);
    
    if (movementError) {
        console.error('Errore registrazione movimento:', movementError);
    }
    
    closeMovementRicambiModal();
    loadRicambi();
    loadMovementsRicambi();
    
    // MESSAGGIO PERSONALIZZATO IN BASE ALLA QUANTIT&#192;
    if (type === 'scarico' && newQuantity === 0) {
        // SCORTE FINITE
        await showCustomAlert(
            '<strong>&#128230; ' + ricambio.nome + '</strong><br><br>' +
            '&#10060; <strong>SCORTE FINITE!</strong><br><br>' +
            'Quantit&#224; attuale: <strong>0</strong><br><br>' +
            '&#128206; L\'articolo &#232; stato spostato in <strong>"Ricambi Esauriti"</strong><br>' +
            'a fondo pagina.<br><br>' +
            'Potrai ricaricarlo in qualsiasi momento.',
            'Scorte Esaurite',
            '&#9888;&#65039;'
        );
    } else {
        // OPERAZIONE NORMALE
        await showCustomAlert(
            (type === 'carico' ? 'Carico' : 'Scarico') + ' completato!',
            'Successo',
            '&#10004;'
        );
    }
    
    const scannerTab = document.getElementById('tab-scanner');
    if (scannerTab && scannerTab.classList.contains('active')) {
        setTimeout(() => {
            document.getElementById('reader').style.display = 'block';
            initScanner();
        }, 1000);
    }
}

function closeMovementRicambiModal() {
    document.getElementById('movement-ricambi-modal').classList.add('hidden');
    currentRicambioForMovement = null;
}

// ========================================
// STORICO MOVIMENTI
// ========================================
function saveMovementRicambiFilters() {
    const filters = {
        type: document.getElementById('filter-movement-ricambi-type')?.value || '',
        dateFrom: document.getElementById('filter-ricambi-date-from')?.value || '',
        dateTo: document.getElementById('filter-ricambi-date-to')?.value || ''
    };
    sessionStorage.setItem('movementRicambiFilters', JSON.stringify(filters));
}

function restoreMovementRicambiFilters() {
    // MODIFICA: reset sempre a default (vedi nota in app.js restoreInventoryFilters)
    if (document.getElementById('filter-movement-ricambi-type')) {
        document.getElementById('filter-movement-ricambi-type').value = '';
        document.getElementById('filter-ricambi-date-from').value = '';
        document.getElementById('filter-ricambi-date-to').value = '';
    }
}

async function loadMovementsRicambi() {
    const { data, error } = await supabaseClient
        .from('movimenti_ricambi')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
    
    if (error) {
        console.error('Errore caricamento movimenti:', error);
        return;
    }
    
    allMovementsRicambi = data || [];
    restoreMovementRicambiFilters();
    renderMovementsRicambi(allMovementsRicambi);
}

function renderMovementsRicambi(movements) {
    const tbody = document.getElementById('movements-ricambi-tbody');
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
        
        const ricambio = allRicambi.find(r => r.id === movement.ricambio_id);
        const ricambioName = ricambio ? ricambio.nome : 'Ricambio eliminato';
        const ricambioCode = ricambio ? ricambio.codice_articolo : 'N/D';
        
        const tipoEmoji = movement.tipo === 'carico' ? '&#10133;' : '&#10134;';
        const tipoColor = movement.tipo === 'carico' ? 'var(--success)' : 'var(--danger)';
        
        const userDisplay = userInitials[movement.utente] || movement.utente.substring(0, 2).toUpperCase();
        
        row.innerHTML = `
            <td><span class="show-on-mobile">${dateOnly}</span><span class="hide-on-mobile">${fullDate}</span></td>
            <td><span class="show-on-mobile" style="font-weight: 700;">${userDisplay}</span><span class="hide-on-mobile">${movement.utente}</span></td>
            <td>${ricambioName}</td>
            <td><span style="color: ${tipoColor}; font-weight: 700; font-size: 18px;">${tipoEmoji}</span></td>
            <td style="text-align: center;"><strong>${movement.quantita}</strong></td>
            <td class="hide-on-mobile">${ricambioCode}</td>
            <td class="hide-on-mobile">${movement.note || '-'}</td>
        `;
        
        tbody.appendChild(row);
    });
}

function applyMovementRicambiFilters() {
    saveMovementRicambiFilters();
    
    const typeFilter = document.getElementById('filter-movement-ricambi-type').value;
    const dateFrom = document.getElementById('filter-ricambi-date-from').value;
    const dateTo = document.getElementById('filter-ricambi-date-to').value;
    
    let filtered = allMovementsRicambi.filter(movement => {
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
    
    renderMovementsRicambi(filtered);
}

// ========================================
// REPORT RICAMBI - IMPLEMENTAZIONE COMPLETA
// ========================================
function populateReportRicambiSelects() {
    const ricambioSelect = document.getElementById('report-ricambi-item');
    const supplierSelect = document.getElementById('report-ricambi-supplier');
    
    // Popola select ricambi
    ricambioSelect.innerHTML = '<option value="">-- Seleziona ricambio --</option>';
    allRicambi.forEach(ricambio => {
        const option = document.createElement('option');
        option.value = ricambio.id;
        option.textContent = ricambio.nome + ' (' + ricambio.codice_articolo + ')';
        ricambioSelect.appendChild(option);
    });
    
    // Popola select fornitori
    const suppliers = [...new Set(allRicambi.map(r => r.marca_fornitore).filter(Boolean))];
    supplierSelect.innerHTML = '<option value="">-- Seleziona fornitore --</option>';
    suppliers.sort().forEach(supplier => {
        const option = document.createElement('option');
        option.value = supplier;
        option.textContent = supplier;
        supplierSelect.appendChild(option);
    });
}

function handleReportRicambiTypeChange() {
    const reportType = document.getElementById('report-ricambi-type').value;
    
    document.getElementById('report-ricambi-item-select').classList.add('hidden');
    document.getElementById('report-ricambi-supplier-select').classList.add('hidden');
    
    if (reportType === 'ricambio') {
        document.getElementById('report-ricambi-item-select').classList.remove('hidden');
    } else if (reportType === 'fornitore') {
        document.getElementById('report-ricambi-supplier-select').classList.remove('hidden');
    }
}

async function generateReportRicambi() {
    const reportType = document.getElementById('report-ricambi-type').value;
    const dateFrom = document.getElementById('report-ricambi-date-from').value;
    const dateTo = document.getElementById('report-ricambi-date-to').value;
    
    let reportContent = '';
    
    try {
        if (reportType === 'generale') {
            reportContent = await generateGeneralRicambiReport(dateFrom, dateTo);
        } else if (reportType === 'fornitore') {
            const supplier = document.getElementById('report-ricambi-supplier').value;
            if (!supplier) {
                await showCustomAlert('Seleziona un fornitore', 'Attenzione', '&#9888;&#65039;');
                return;
            }
            reportContent = await generateSupplierRicambiReport(supplier, dateFrom, dateTo);
        } else if (reportType === 'ricambio') {
            const ricambioId = parseInt(document.getElementById('report-ricambi-item').value);
            if (!ricambioId) {
                await showCustomAlert('Seleziona un ricambio', 'Attenzione', '&#9888;&#65039;');
                return;
            }
            reportContent = await generateRicambioReport(ricambioId, dateFrom, dateTo);
        }
    } catch (err) {
        // PRIMA: se la query falliva, l'errore veniva "inghiottito" in silenzio
        // e il report restava vuoto/nascosto senza alcuna spiegazione.
        // ORA: mostriamo sempre un messaggio chiaro con il dettaglio dell'errore.
        console.error('Errore generazione report ricambi:', err);
        await showCustomAlert(
            'Non &#232; stato possibile generare il report.<br><br>' +
            '<strong>Dettaglio errore:</strong><br>' + err.message +
            '<br><br>Apri la Console del browser (F12) per maggiori dettagli tecnici.',
            'Errore Generazione Report',
            '&#10060;'
        );
        return;
    }
    
    document.getElementById('report-ricambi-content').innerHTML = reportContent;
    document.getElementById('report-ricambi-result').classList.remove('hidden');
}

async function generateGeneralRicambiReport(dateFrom, dateTo) {
    let query = supabaseClient
        .from('movimenti_ricambi')
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
    
    const { data: movements, error } = await query;
    
    if (error) {
        throw new Error('Errore caricamento movimenti dal database: ' + error.message);
    }
    
    const supplierData = {};
    
    (movements || []).forEach(movement => {
        const ricambio = allRicambi.find(r => r.id === movement.ricambio_id);
        if (!ricambio) return;
        
        const supplier = ricambio.marca_fornitore || 'Senza Fornitore';
        
        if (!supplierData[supplier]) {
            supplierData[supplier] = {
                totalCarico: 0,
                totalScarico: 0,
                ricambi: new Set()
            };
        }
        
        if (movement.tipo === 'carico') {
            supplierData[supplier].totalCarico += movement.quantita;
        } else {
            supplierData[supplier].totalScarico += movement.quantita;
        }
        
        supplierData[supplier].ricambi.add(ricambio.id);
    });
    
    let html = `
        <h3>&#128201; REPORT GENERALE RICAMBI STOCK</h3>
        <p><strong>Periodo:</strong> ${dateFrom || 'Inizio'} &#8594; ${dateTo || 'Oggi'}</p>
        <p><strong>Data Generazione:</strong> ${new Date().toLocaleString('it-IT')}</p>
        <hr>
        <h4>&#128230; RIEPILOGO PER FORNITORE</h4>
        <p style="color: var(--gray); font-size: 13px; margin-bottom: 15px;">
            Questo report mostra quanto materiale hai <strong style="color: var(--success);">ORDINATO (caricato)</strong> e 
            <strong style="color: var(--danger);">UTILIZZATO (scaricato)</strong> per ogni fornitore.
        </p>
    `;
    
    if (Object.keys(supplierData).length === 0) {
        html += `
            <div style="background: #fef3c7; padding: 15px; border-radius: 12px; border-left: 4px solid #f59e0b; text-align: center;">
                <strong>&#9888;&#65039; Nessun movimento trovato</strong><br>
                <span style="font-size: 13px; color: var(--gray);">Non risultano carichi o scarichi di ricambi nel periodo selezionato.<br>Prova ad allargare il periodo (campi Da/A) oppure lasciali vuoti per vedere tutto lo storico.</span>
            </div>
        `;
    }
    
    Object.keys(supplierData).sort().forEach(supplier => {
        const data = supplierData[supplier];
        const differenza = data.totalCarico - data.totalScarico;
        const differenzaColor = differenza >= 0 ? 'var(--success)' : 'var(--danger)';
        
        html += `
            <div style="background: var(--light); padding: 15px; border-radius: 12px; margin-bottom: 15px; border-left: 4px solid var(--primary);">
                <h4 style="margin-bottom: 10px; color: var(--primary);">&#127970; ${supplier}</h4>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; font-size: 13px;">
                    <div>
                        <strong>Ricambi gestiti:</strong> ${data.ricambi.size}
                    </div>
                    <div style="color: var(--success);">
                        <strong>&#128229; Ordinato (Carico):</strong> +${data.totalCarico} pz
                    </div>
                    <div style="color: var(--danger);">
                        <strong>&#128228; Utilizzato (Scarico):</strong> -${data.totalScarico} pz
                    </div>
                    <div style="color: ${differenzaColor};">
                        <strong>&#128176; Differenza:</strong> ${differenza >= 0 ? '+' : ''}${differenza} pz
                    </div>
                </div>
            </div>
        `;
    });
    
    html += `
        <hr>
        <h4>&#128161; COSA SIGNIFICA</h4>
        <ul style="list-style: none; padding-left: 0; font-size: 13px; line-height: 1.8;">
            <li>&#128229; <strong>Ordinato (Carico):</strong> Quanti ricambi hai ricevuto dai fornitori</li>
            <li>&#128228; <strong>Utilizzato (Scarico):</strong> Quanti ricambi hai usato/venduto</li>
            <li>&#128176; <strong>Differenza:</strong> Se positiva, hai ancora stock. Se negativa, hai usato pi&#249; di quanto ordinato</li>
        </ul>
    `;
    
    return html;
}

async function generateSupplierRicambiReport(supplier, dateFrom, dateTo) {
    let query = supabaseClient
        .from('movimenti_ricambi')
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
    
    const { data: movements, error } = await query;
    
    if (error) {
        throw new Error('Errore caricamento movimenti dal database: ' + error.message);
    }
    
    const supplierRicambi = allRicambi.filter(r => r.marca_fornitore === supplier);
    const supplierRicambiIds = supplierRicambi.map(r => r.id);
    
    const supplierMovements = (movements || []).filter(m => supplierRicambiIds.includes(m.ricambio_id));
    
    const ricambioData = {};
    
    supplierRicambi.forEach(ricambio => {
        ricambioData[ricambio.id] = {
            nome: ricambio.nome,
            codice: ricambio.codice_articolo,
            quantitaAttuale: ricambio.quantita,
            carico: 0,
            scarico: 0
        };
    });
    
    supplierMovements.forEach(movement => {
        if (ricambioData[movement.ricambio_id]) {
            if (movement.tipo === 'carico') {
                ricambioData[movement.ricambio_id].carico += movement.quantita;
            } else {
                ricambioData[movement.ricambio_id].scarico += movement.quantita;
            }
        }
    });
    
    const totalCarico = Object.values(ricambioData).reduce((sum, r) => sum + r.carico, 0);
    const totalScarico = Object.values(ricambioData).reduce((sum, r) => sum + r.scarico, 0);
    
    let html = `
        <h3>&#128201; REPORT FORNITORE: ${supplier}</h3>
        <p><strong>Periodo:</strong> ${dateFrom || 'Inizio'} &#8594; ${dateTo || 'Oggi'}</p>
        <p><strong>Data Generazione:</strong> ${new Date().toLocaleString('it-IT')}</p>
        <hr>
        <h4>&#128230; RIEPILOGO</h4>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin: 15px 0;">
            <div style="background: var(--light); padding: 12px; border-radius: 8px;">
                <div style="color: var(--gray); font-size: 12px;">Ricambi Totali</div>
                <div style="font-size: 22px; font-weight: 700;">${supplierRicambi.length}</div>
            </div>
            <div style="background: var(--green-light); padding: 12px; border-radius: 8px;">
                <div style="color: var(--success); font-size: 12px;">&#128229; Ordinato</div>
                <div style="font-size: 22px; font-weight: 700; color: var(--success);">+${totalCarico}</div>
            </div>
            <div style="background: #fee2e2; padding: 12px; border-radius: 8px;">
                <div style="color: var(--danger); font-size: 12px;">&#128228; Utilizzato</div>
                <div style="font-size: 22px; font-weight: 700; color: var(--danger);">-${totalScarico}</div>
            </div>
        </div>
        <hr>
        <h4>&#128203; DETTAGLIO RICAMBI</h4>
        <table style="width: 100%; font-size: 12px; margin-top: 10px;">
            <thead>
                <tr style="background: var(--primary); color: white;">
                    <th style="padding: 10px; text-align: left;">Nome</th>
                    <th style="padding: 10px;">Codice</th>
                    <th style="padding: 10px;">Qty Attuale</th>
                    <th style="padding: 10px; color: #dcfce7;">Ordinato</th>
                    <th style="padding: 10px; color: #fee2e2;">Utilizzato</th>
                    <th style="padding: 10px;">Diff.</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    if (supplierRicambi.length === 0) {
        html += `
            <tr><td colspan="6" style="padding: 15px; text-align: center; background: #fef3c7;">
                &#9888;&#65039; Nessun ricambio trovato per il fornitore "${supplier}"
            </td></tr>
        `;
    }
    
    Object.values(ricambioData).forEach(ricambio => {
        const diff = ricambio.carico - ricambio.scarico;
        const diffColor = diff >= 0 ? 'var(--success)' : 'var(--danger)';
        
        html += `
            <tr>
                <td style="padding: 8px;"><strong>${ricambio.nome}</strong></td>
                <td style="padding: 8px; text-align: center;">${ricambio.codice}</td>
                <td style="padding: 8px; text-align: center;"><strong>${ricambio.quantitaAttuale}</strong></td>
                <td style="padding: 8px; text-align: center; color: var(--success);"><strong>+${ricambio.carico}</strong></td>
                <td style="padding: 8px; text-align: center; color: var(--danger);"><strong>-${ricambio.scarico}</strong></td>
                <td style="padding: 8px; text-align: center; color: ${diffColor};"><strong>${diff >= 0 ? '+' : ''}${diff}</strong></td>
            </tr>
        `;    });
    
    html += `
            </tbody>
        </table>
    `;
    
    return html;
}

async function generateRicambioReport(ricambioId, dateFrom, dateTo) {
    const ricambio = allRicambi.find(r => r.id === ricambioId);
    if (!ricambio) return '<p>Ricambio non trovato</p>';
    
    let query = supabaseClient
        .from('movimenti_ricambi')
        .select('*')
        .eq('ricambio_id', ricambioId)
        .order('created_at', { ascending: false });
    
    if (dateFrom) {
        query = query.gte('created_at', new Date(dateFrom).toISOString());
    }
    if (dateTo) {
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59);
        query = query.lte('created_at', endDate.toISOString());
    }
    
    const { data: movements, error } = await query;
    
    if (error) {
        throw new Error('Errore caricamento movimenti dal database: ' + error.message);
    }
    
    const safeMovements = movements || [];
    const totalCarico = safeMovements.filter(m => m.tipo === 'carico').reduce((sum, m) => sum + m.quantita, 0);
    const totalScarico = safeMovements.filter(m => m.tipo === 'scarico').reduce((sum, m) => sum + m.quantita, 0);
    const differenza = totalCarico - totalScarico;
    
    let html = `
        <h3>&#128201; REPORT RICAMBIO: ${ricambio.nome}</h3>
        <p><strong>Codice:</strong> ${ricambio.codice_articolo} | <strong>Fornitore:</strong> ${ricambio.marca_fornitore || 'N/D'}</p>
        <p><strong>Periodo:</strong> ${dateFrom || 'Inizio'} &#8594; ${dateTo || 'Oggi'}</p>
        <hr>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin: 15px 0;">
            <div style="background: var(--light); padding: 12px; border-radius: 8px;">
                <div style="color: var(--gray); font-size: 12px;">Qty Attuale</div>
                <div style="font-size: 22px; font-weight: 700;">${ricambio.quantita}</div>
            </div>
            <div style="background: var(--green-light); padding: 12px; border-radius: 8px;">
                <div style="color: var(--success); font-size: 12px;">&#128229; Ordinato</div>
                <div style="font-size: 22px; font-weight: 700; color: var(--success);">+${totalCarico}</div>
            </div>
            <div style="background: #fee2e2; padding: 12px; border-radius: 8px;">
                <div style="color: var(--danger); font-size: 12px;">&#128228; Utilizzato</div>
                <div style="font-size: 22px; font-weight: 700; color: var(--danger);">-${totalScarico}</div>
            </div>
            <div style="background: var(--light); padding: 12px; border-radius: 8px;">
                <div style="color: var(--gray); font-size: 12px;">&#128176; Differenza</div>
                <div style="font-size: 22px; font-weight: 700; color: ${differenza >= 0 ? 'var(--success)' : 'var(--danger)'};">${differenza >= 0 ? '+' : ''}${differenza}</div>
            </div>
        </div>
        <hr>
        <h4>&#128203; STORICO MOVIMENTI</h4>
        <table style="width: 100%; font-size: 12px; margin-top: 10px;">
            <thead>
                <tr style="background: var(--primary); color: white;">
                    <th style="padding: 10px;">Data</th>
                    <th style="padding: 10px;">Tipo</th>
                    <th style="padding: 10px;">Quantit&#224;</th>
                    <th style="padding: 10px;">Utente</th>
                    <th style="padding: 10px;">Note</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    if (safeMovements.length === 0) {
        html += `
            <tr><td colspan="5" style="padding: 15px; text-align: center; background: #fef3c7;">
                &#9888;&#65039; Nessun movimento registrato per questo ricambio nel periodo selezionato
            </td></tr>
        `;
    }
    
    safeMovements.forEach(m => {
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

function printReportRicambi() {
    window.print();
}

// ========================================
// ESPONI FUNZIONI GLOBALMENTE
// ========================================
window.handleExcelImport = handleExcelImport;
window.cancelExcelImport = cancelExcelImport;
window.confirmExcelImport = confirmExcelImport;
window.loadRicambi = loadRicambi;
window.applyRicambiFiltersAndSort = applyRicambiFiltersAndSort;
window.handleNewRicambio = handleNewRicambio;
window.openEditRicambioModal = openEditRicambioModal;
window.handleEditRicambio = handleEditRicambio;
window.closeEditRicambioModal = closeEditRicambioModal;
window.deleteRicambio = deleteRicambio;
window.openMovementRicambiModal = openMovementRicambiModal;
window.confirmMovementRicambi = confirmMovementRicambi;
window.closeMovementRicambiModal = closeMovementRicambiModal;
window.loadMovementsRicambi = loadMovementsRicambi;
window.applyMovementRicambiFilters = applyMovementRicambiFilters;
window.toggleRicambiEsauriti = toggleRicambiEsauriti;
window.populateReportRicambiSelects = populateReportRicambiSelects;
window.handleReportRicambiTypeChange = handleReportRicambiTypeChange;
window.generateReportRicambi = generateReportRicambi;
window.printReportRicambi = printReportRicambi;