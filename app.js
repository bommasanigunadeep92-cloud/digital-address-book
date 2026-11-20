let currentUser = null;
let currentCategoryFilter = '';
let currentIsFavoriteFilter = false;
let currentSearchQuery = '';
let currentSort = 'name_asc';
let allContactsCache = [];
let contactToDeleteId = null;
let contactModalInstance = null;
let deleteModalInstance = null;
let detailsModalInstance = null;
let activeContactForDetails = null;
let duplicateContactIds = new Set();
let duplicateBannerDismissed = false;
let showingDuplicatesOnly = false;

document.addEventListener('DOMContentLoaded', async () => {
    contactModalInstance = new bootstrap.Modal(document.getElementById('contactModal'));
    deleteModalInstance = new bootstrap.Modal(document.getElementById('deleteModal'));
    detailsModalInstance = new bootstrap.Modal(document.getElementById('contactDetailsModal'));

    const authenticated = await verifyAuthentication();
    if (!authenticated) return;

    setupSidebarFilters();
    setupSearchAndFilters();
    setupContactForm();
    setupDeleteModal();
    setupDetailsModalActions();
    setupBackNavigation();
    setupDuplicateAdvisor();
    setupCsvExport();
    setupLogout();
    setupMobileSidebar();

    loadDashboardStats();
    loadContacts();
});

async function verifyAuthentication() {
    try {
        const response = await fetch('/api/auth/me', { credentials: 'include' });
        if (!response.ok) {
            window.location.replace('login.html');
            return false;
        }
        const data = await response.json();
        currentUser = data.user;

        document.getElementById('currentUserName').textContent = currentUser.name;
        document.getElementById('currentUserEmail').textContent = currentUser.email;
        document.getElementById('userAvatar').textContent = currentUser.name.charAt(0).toUpperCase();

        return true;
    } catch (error) {
        console.error('Auth verification failed:', error);
        window.location.replace('login.html');
        return false;
    }
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toastId = 'toast_' + Date.now();
    const bgClass = type === 'success' ? 'bg-success text-white' : (type === 'danger' ? 'bg-danger text-white' : 'bg-primary text-white');
    const icon = type === 'success' ? 'bi-check-circle-fill' : (type === 'danger' ? 'bi-exclamation-circle-fill' : 'bi-info-circle-fill');

    const html = `
        <div id="${toastId}" class="toast align-items-center ${bgClass} border-0 shadow-lg rounded-3" role="alert" aria-live="assertive" aria-atomic="true">
            <div class="d-flex">
                <div class="toast-body d-flex align-items-center gap-2 py-3 px-3">
                    <i class="bi ${icon} fs-5"></i>
                    <span class="fw-medium">${message}</span>
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
        </div>
    `;

    container.insertAdjacentHTML('beforeend', html);
    const toastElement = document.getElementById(toastId);
    const toast = new bootstrap.Toast(toastElement, { delay: 3500 });
    toast.show();

    toastElement.addEventListener('hidden.bs.toast', () => {
        toastElement.remove();
    });
}

function copyToClipboard(text, label = 'Copied') {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
        showToast(`${label} copied to clipboard!`, 'primary');
    }).catch(err => {
        console.error('Copy failed:', err);
    });
}

async function loadDashboardStats() {
    try {
        const response = await fetch('/api/contacts/stats', { credentials: 'include' });
        if (!response.ok) return;

        const data = await response.json();
        const stats = data.stats;

        document.getElementById('statTotal').textContent = stats.totalContacts;
        document.getElementById('statFav').textContent = stats.favoriteContacts;
        document.getElementById('statFamily').textContent = stats.categories.Family || 0;
        document.getElementById('statFriends').textContent = stats.categories.Friends || 0;
        document.getElementById('statCollege').textContent = stats.categories.College || 0;
        document.getElementById('statWork').textContent = stats.categories.Work || 0;

        document.getElementById('badgeAll').textContent = stats.totalContacts;
        document.getElementById('badgeFavorites').textContent = stats.favoriteContacts;
        document.getElementById('badgeFamily').textContent = stats.categories.Family || 0;
        document.getElementById('badgeFriends').textContent = stats.categories.Friends || 0;
        document.getElementById('badgeCollege').textContent = stats.categories.College || 0;
        document.getElementById('badgeWork').textContent = stats.categories.Work || 0;
        document.getElementById('badgeOther').textContent = stats.categories.Other || 0;
    } catch (error) {
        console.error('Error loading dashboard stats:', error);
    }
}

async function loadContacts() {
    const tbody = document.getElementById('contactsTableBody');
    const emptyState = document.getElementById('emptyState');
    const countBadge = document.getElementById('contactCountBadge');

    tbody.innerHTML = `
        <tr>
            <td colspan="7" class="text-center py-5 text-muted">
                <div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
                Loading contacts...
            </td>
        </tr>
    `;
    emptyState.classList.add('d-none');

    updateFilterBanner();

    const params = new URLSearchParams();
    if (currentCategoryFilter) params.append('category', currentCategoryFilter);
    if (currentIsFavoriteFilter) params.append('favorite', 'true');
    if (currentSearchQuery) params.append('search', currentSearchQuery);

    try {
        const url = `/api/contacts?${params.toString()}`;
        const response = await fetch(url, { credentials: 'include' });
        if (!response.ok) throw new Error('Failed to fetch contacts');

        const data = await response.json();
        allContactsCache = data.contacts || [];

        // Innovation: Run Duplicate Contact Detection Advisor
        detectDuplicates(allContactsCache);

        let displayContacts = allContactsCache;
        if (showingDuplicatesOnly) {
            displayContacts = allContactsCache.filter(c => duplicateContactIds.has(c.contact_id));
        }

        // Apply client-side sorting
        applySorting(displayContacts);

        if (displayContacts.length === 0) {
            tbody.innerHTML = '';
            emptyState.classList.remove('d-none');
            countBadge.textContent = '0 contacts found';
            return;
        }

        emptyState.classList.add('d-none');
        countBadge.textContent = `Showing ${displayContacts.length} contact${displayContacts.length > 1 ? 's' : ''}${showingDuplicatesOnly ? ' (Duplicates only)' : ''}`;
        tbody.innerHTML = displayContacts.map(c => renderContactRow(c)).join('');
        attachTableEventListeners();
    } catch (error) {
        console.error('Error fetching contacts:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center py-4 text-danger">
                    <i class="bi bi-exclamation-triangle me-1"></i> Failed to load contacts. Please verify backend connection.
                </td>
            </tr>
        `;
    }
}

function applySorting(list = allContactsCache) {
    if (!list || list.length === 0) return;

    if (currentSort === 'name_asc') {
        list.sort((a, b) => a.name.localeCompare(b.name));
    } else if (currentSort === 'name_desc') {
        list.sort((a, b) => b.name.localeCompare(a.name));
    } else if (currentSort === 'newest') {
        list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } else if (currentSort === 'oldest') {
        list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    } else if (currentSort === 'favorites_first') {
        list.sort((a, b) => (b.is_favorite ? 1 : 0) - (a.is_favorite ? 1 : 0) || a.name.localeCompare(b.name));
    }
}

function getAvatarColorClass(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % 6;
    return `avatar-color-${index}`;
}

function getInitials(name) {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function renderContactRow(c) {
    const categoryClass = 'badge-' + (c.category || 'Other').toLowerCase();
    const favClass = c.is_favorite ? 'active' : '';
    const favIcon = c.is_favorite ? 'bi-star-fill' : 'bi-star';
    const avatarClass = getAvatarColorClass(c.name);
    const initials = getInitials(c.name);

    const emailDisplay = c.email ? `
        <div class="d-flex align-items-center gap-1">
            <a href="mailto:${escapeHtml(c.email)}" class="text-decoration-none text-muted">${escapeHtml(c.email)}</a>
            <i class="bi bi-clipboard copy-badge-btn ms-1" title="Copy Email" onclick="copyToClipboard('${escapeHtml(c.email)}', 'Email')"></i>
        </div>
    ` : '<span class="text-muted">-</span>';

    const phoneDisplay = `
        <div class="d-flex align-items-center gap-1">
            <a href="tel:${escapeHtml(c.phone)}" class="text-decoration-none fw-semibold text-dark">${escapeHtml(c.phone)}</a>
            <i class="bi bi-clipboard copy-badge-btn ms-1" title="Copy Phone" onclick="copyToClipboard('${escapeHtml(c.phone)}', 'Phone')"></i>
        </div>
    `;

    let notesAndAddress = '';
    if (c.address) notesAndAddress += `<div><i class="bi bi-geo-alt text-danger me-1"></i>${escapeHtml(c.address)}</div>`;
    if (c.notes) notesAndAddress += `<div class="text-muted small fst-italic"><i class="bi bi-sticky text-warning me-1"></i>${escapeHtml(c.notes)}</div>`;
    if (!notesAndAddress) notesAndAddress = '<span class="text-muted small">-</span>';

    const duplicateBadge = duplicateContactIds.has(c.contact_id) ? `
        <span class="badge bg-warning text-dark border border-warning ms-1" style="font-size: 0.65rem;" title="Duplicate phone or email match detected">
            <i class="bi bi-copy me-1"></i>Duplicate
        </span>
    ` : '';

    return `
        <tr data-id="${c.contact_id}">
            <td class="text-center">
                <button class="btn-favorite ${favClass}" data-action="favorite" data-id="${c.contact_id}" title="Toggle Favorite">
                    <i class="bi ${favIcon}"></i>
                </button>
            </td>
            <td>
                <div class="d-flex align-items-center gap-2">
                    <div class="contact-avatar ${avatarClass}">${initials}</div>
                    <div>
                        <a href="javascript:void(0)" class="fw-bold text-dark text-decoration-none view-contact-link" data-id="${c.contact_id}">
                            ${escapeHtml(c.name)}
                        </a>
                        <div class="text-muted d-flex align-items-center" style="font-size: 0.72rem;">
                            <span>ID: #${c.contact_id}</span>
                            ${duplicateBadge}
                        </div>
                    </div>
                </div>
            </td>
            <td>${phoneDisplay}</td>
            <td>${emailDisplay}</td>
            <td>
                <span class="badge-category ${categoryClass}">
                    ${escapeHtml(c.category || 'Other')}
                </span>
            </td>
            <td>${notesAndAddress}</td>
            <td class="text-end">
                <div class="action-buttons justify-content-end">
                    <button class="btn btn-outline-primary btn-sm action-btn-sm" data-action="view" data-id="${c.contact_id}" title="Scan vCard QR Code & View Details">
                        <i class="bi bi-qr-code"></i>
                    </button>
                    ${(() => {
                        let digits = (c.phone || '').replace(/[^0-9]/g, '');
                        if (digits.length === 10) digits = '91' + digits;
                        return digits ? `
                            <a href="https://wa.me/${digits}" target="_blank" class="btn btn-outline-success btn-sm action-btn-sm" title="1-Click WhatsApp Direct Chat" onclick="event.stopPropagation()">
                                <i class="bi bi-whatsapp"></i>
                            </a>
                        ` : '';
                    })()}
                    <button class="btn btn-outline-secondary btn-sm action-btn-sm" data-action="edit" data-id="${c.contact_id}" title="Edit Contact">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-outline-danger btn-sm action-btn-sm" data-action="delete" data-id="${c.contact_id}" data-name="${escapeHtml(c.name)}" title="Delete Contact">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `;
}

function attachTableEventListeners() {
    const tbody = document.getElementById('contactsTableBody');

    // View Details on eye icon or row name click
    tbody.querySelectorAll('button[data-action="view"], a.view-contact-link').forEach(el => {
        el.addEventListener('click', () => {
            const contactId = el.getAttribute('data-id');
            openContactDetailsModal(contactId);
        });
    });

    tbody.querySelectorAll('button[data-action="favorite"]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const contactId = btn.getAttribute('data-id');
            await toggleFavorite(contactId, btn);
        });
    });

    tbody.querySelectorAll('button[data-action="edit"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const contactId = btn.getAttribute('data-id');
            openEditContactModal(contactId);
        });
    });

    tbody.querySelectorAll('button[data-action="delete"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const contactId = btn.getAttribute('data-id');
            const contactName = btn.getAttribute('data-name');
            openDeleteModal(contactId, contactName);
        });
    });
}

function openContactDetailsModal(contactId) {
    const contact = allContactsCache.find(c => String(c.contact_id) === String(contactId));
    if (!contact) return;

    activeContactForDetails = contact;

    document.getElementById('detailsAvatar').textContent = getInitials(contact.name);
    document.getElementById('detailsName').textContent = contact.name;

    const catBadge = document.getElementById('detailsCategoryBadge');
    catBadge.className = 'badge-category badge-' + (contact.category || 'Other').toLowerCase();
    catBadge.textContent = contact.category || 'Other';

    const favBadge = document.getElementById('detailsFavBadge');
    favBadge.classList.toggle('d-none', !contact.is_favorite);

    document.getElementById('detailsPhone').textContent = contact.phone || '-';
    document.getElementById('detailsCallBtn').href = contact.phone ? `tel:${contact.phone}` : '#';

    // Innovation: WhatsApp Direct Gateway
    const waBtn = document.getElementById('detailsWhatsAppBtn');
    if (waBtn) {
        const cleanPhone = (contact.phone || '').replace(/[^0-9]/g, '');
        if (cleanPhone) {
            let waPhone = cleanPhone;
            if (waPhone.length === 10) waPhone = '91' + waPhone;
            waBtn.href = `https://wa.me/${waPhone}`;
            waBtn.classList.remove('d-none');
        } else {
            waBtn.classList.add('d-none');
        }
    }

    document.getElementById('detailsEmail').textContent = contact.email || 'None';
    const mailBtn = document.getElementById('detailsMailBtn');
    if (contact.email) {
        mailBtn.href = `mailto:${contact.email}`;
        mailBtn.classList.remove('d-none');
    } else {
        mailBtn.classList.add('d-none');
    }

    document.getElementById('detailsAddress').textContent = contact.address || 'No physical address stored.';
    const mapBtn = document.getElementById('detailsMapBtn');
    if (contact.address) {
        mapBtn.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(contact.address)}`;
        mapBtn.classList.remove('d-none');
    } else {
        mapBtn.classList.add('d-none');
    }

    // Innovation: Mobile vCard 3.0 QR Generator (RFC 2426 compatible)
    const vcardString = generateVCardString(contact);
    const qrImg = document.getElementById('detailsQrImg');
    if (qrImg) {
        qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&margin=2&data=${encodeURIComponent(vcardString)}`;
    }

    document.getElementById('detailsNotes').textContent = contact.notes || 'No extra notes provided.';

    const createdDate = contact.created_at ? new Date(contact.created_at).toLocaleString() : '-';
    const updatedDate = contact.updated_at ? new Date(contact.updated_at).toLocaleString() : '-';
    document.getElementById('detailsCreated').textContent = `Created: ${createdDate}`;
    document.getElementById('detailsUpdated').textContent = `Updated: ${updatedDate}`;

    detailsModalInstance.show();
}

function setupDetailsModalActions() {
    document.getElementById('detailsCopyPhoneBtn').addEventListener('click', () => {
        if (activeContactForDetails) copyToClipboard(activeContactForDetails.phone, 'Phone number');
    });

    document.getElementById('detailsCopyEmailBtn').addEventListener('click', () => {
        if (activeContactForDetails && activeContactForDetails.email) copyToClipboard(activeContactForDetails.email, 'Email address');
    });

    const vcfBtn = document.getElementById('detailsDownloadVcfBtn');
    if (vcfBtn) {
        vcfBtn.addEventListener('click', () => {
            if (activeContactForDetails) downloadVCard(activeContactForDetails);
        });
    }

    document.getElementById('detailsEditBtn').addEventListener('click', () => {
        if (!activeContactForDetails) return;
        detailsModalInstance.hide();
        openEditContactModal(activeContactForDetails.contact_id);
    });

    document.getElementById('detailsDeleteBtn').addEventListener('click', () => {
        if (!activeContactForDetails) return;
        detailsModalInstance.hide();
        openDeleteModal(activeContactForDetails.contact_id, activeContactForDetails.name);
    });
}

function updateFilterBanner() {
    const banner = document.getElementById('filterBanner');
    const badgeText = document.getElementById('filterBadgeText');
    const descText = document.getElementById('filterDescriptionText');

    const isFiltering = Boolean(currentCategoryFilter || currentIsFavoriteFilter || currentSearchQuery || showingDuplicatesOnly);

    if (isFiltering) {
        banner.classList.remove('d-none');
        if (showingDuplicatesOnly) {
            badgeText.textContent = 'Smart Advisor';
            badgeText.className = 'badge bg-warning text-dark rounded-pill px-3 py-1';
            descText.textContent = `Reviewing ${duplicateContactIds.size} potential duplicate contact(s)`;
        } else if (currentIsFavoriteFilter) {
            badgeText.textContent = 'Favorites';
            badgeText.className = 'badge bg-primary text-white rounded-pill px-3 py-1';
            descText.textContent = 'Showing pinned favorite contacts';
        } else if (currentCategoryFilter) {
            badgeText.textContent = `Category: ${currentCategoryFilter}`;
            badgeText.className = 'badge bg-primary text-white rounded-pill px-3 py-1';
            descText.textContent = `Showing all contacts in ${currentCategoryFilter}`;
        } else if (currentSearchQuery) {
            badgeText.textContent = `Search: "${currentSearchQuery}"`;
            badgeText.className = 'badge bg-primary text-white rounded-pill px-3 py-1';
            descText.textContent = `Matching results for your keyword`;
        }
    } else {
        banner.classList.add('d-none');
    }
}

function resetToAllContacts() {
    currentCategoryFilter = '';
    currentIsFavoriteFilter = false;
    currentSearchQuery = '';
    showingDuplicatesOnly = false;

    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('clearSearchBtn');
    const categorySelect = document.getElementById('categoryFilterSelect');

    if (searchInput) searchInput.value = '';
    if (clearBtn) clearBtn.classList.add('d-none');
    if (categorySelect) categorySelect.value = '';

    document.querySelectorAll('.sidebar-nav .nav-link-custom').forEach(l => l.classList.remove('active'));
    document.getElementById('navAll').classList.add('active');

    document.getElementById('currentSectionTitle').textContent = 'All Contacts';
    document.getElementById('currentSectionDesc').textContent = 'Manage, search, categorize, and organize your personal and professional network.';

    loadContacts();
}

function setupBackNavigation() {
    const btnBack = document.getElementById('btnBackToAll');
    if (btnBack) {
        btnBack.addEventListener('click', (e) => {
            e.preventDefault();
            resetToAllContacts();
        });
    }

    const emptyBack = document.getElementById('emptyStateBackBtn');
    if (emptyBack) {
        emptyBack.addEventListener('click', (e) => {
            e.preventDefault();
            resetToAllContacts();
        });
    }
}

// ============================================================
// INNOVATION FEATURES: vCard 3.0 & Duplicate Contact Advisor
// ============================================================

function generateVCardString(contact) {
    if (!contact) return '';
    const name = (contact.name || 'Contact').trim();
    const phone = (contact.phone || '').trim();
    const email = (contact.email || '').trim();
    const address = (contact.address || '').trim();
    const notes = (contact.notes || '').trim();
    const category = (contact.category || '').trim();

    const lines = [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `FN:${name}`,
        `N:${name};;;;`
    ];

    if (phone) lines.push(`TEL;TYPE=CELL,VOICE:${phone}`);
    if (email) lines.push(`EMAIL;TYPE=INTERNET,HOME:${email}`);
    if (address) lines.push(`ADR;TYPE=HOME:;;${address.replace(/;/g, ' ')};;;;`);
    if (category) lines.push(`CATEGORIES:${category}`);
    if (notes) lines.push(`NOTE:${notes.replace(/\r?\n/g, ' ')}`);

    lines.push('END:VCARD');
    return lines.join('\r\n');
}

function downloadVCard(contact) {
    if (!contact) return;
    const vcard = generateVCardString(contact);
    const blob = new Blob([vcard], { type: 'text/vcard;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = (contact.name || 'contact').replace(/[^a-zA-Z0-9_-]/g, '_');
    a.href = url;
    a.download = `${safeName}.vcf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`vCard for "${contact.name}" downloaded!`, 'success');
}

function detectDuplicates(contacts) {
    duplicateContactIds.clear();
    const phoneMap = new Map();
    const emailMap = new Map();

    contacts.forEach(c => {
        const cleanPhone = (c.phone || '').replace(/[^0-9]/g, '');
        if (cleanPhone && cleanPhone.length >= 7) {
            if (phoneMap.has(cleanPhone)) {
                duplicateContactIds.add(c.contact_id);
                duplicateContactIds.add(phoneMap.get(cleanPhone));
            } else {
                phoneMap.set(cleanPhone, c.contact_id);
            }
        }

        const cleanEmail = (c.email || '').trim().toLowerCase();
        if (cleanEmail && cleanEmail.includes('@')) {
            if (emailMap.has(cleanEmail)) {
                duplicateContactIds.add(c.contact_id);
                duplicateContactIds.add(emailMap.get(cleanEmail));
            } else {
                emailMap.set(cleanEmail, c.contact_id);
            }
        }
    });

    const banner = document.getElementById('duplicateAlertBanner');
    const alertText = document.getElementById('duplicateAlertText');

    if (banner && alertText) {
        if (duplicateContactIds.size > 0 && !duplicateBannerDismissed && !showingDuplicatesOnly) {
            banner.classList.remove('d-none');
            alertText.textContent = `Found ${duplicateContactIds.size} potential duplicate contact(s) sharing identical phone numbers or email addresses.`;
        } else {
            banner.classList.add('d-none');
        }
    }
}

function setupDuplicateAdvisor() {
    const btnFilter = document.getElementById('btnFilterDuplicates');
    if (btnFilter) {
        btnFilter.addEventListener('click', () => {
            showingDuplicatesOnly = true;
            document.getElementById('duplicateAlertBanner').classList.add('d-none');

            document.querySelectorAll('.sidebar-nav .nav-link-custom').forEach(l => l.classList.remove('active'));
            document.getElementById('currentSectionTitle').textContent = 'Duplicate Contacts Review';
            document.getElementById('currentSectionDesc').textContent = 'Displaying records that share matching phone numbers or emails.';

            loadContacts();
        });
    }

    const btnDismiss = document.getElementById('btnDismissDuplicates');
    if (btnDismiss) {
        btnDismiss.addEventListener('click', () => {
            duplicateBannerDismissed = true;
            document.getElementById('duplicateAlertBanner').classList.add('d-none');
            showToast('Duplicate advisor dismissed for this session.', 'primary');
        });
    }
}

async function toggleFavorite(contactId, btnElement) {
    try {
        const response = await fetch(`/api/contacts/${contactId}/favorite`, {
            method: 'PATCH',
            credentials: 'include'
        });

        const data = await response.json();
        if (response.ok && data.success) {
            const icon = btnElement.querySelector('i');
            if (data.is_favorite) {
                btnElement.classList.add('active');
                icon.className = 'bi bi-star-fill';
                showToast('Marked as favorite!');
            } else {
                btnElement.classList.remove('active');
                icon.className = 'bi bi-star';
                showToast('Removed from favorites.');
            }
            loadDashboardStats();

            // Update in cache
            const target = allContactsCache.find(c => String(c.contact_id) === String(contactId));
            if (target) target.is_favorite = data.is_favorite;

            if (currentIsFavoriteFilter && !data.is_favorite) {
                const row = document.querySelector(`tr[data-id="${contactId}"]`);
                if (row) row.remove();
            }
        } else {
            showToast(data.message || 'Could not update favorite.', 'danger');
        }
    } catch (error) {
        console.error('Toggle favorite error:', error);
        showToast('Network error while updating favorite.', 'danger');
    }
}

function setupSidebarFilters() {
    const links = document.querySelectorAll('.sidebar-nav .nav-link-custom');

    links.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            links.forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            const filter = link.getAttribute('data-filter');
            const titleElem = document.getElementById('currentSectionTitle');
            const descElem = document.getElementById('currentSectionDesc');
            const categorySelect = document.getElementById('categoryFilterSelect');

            if (filter === 'all') {
                currentCategoryFilter = '';
                currentIsFavoriteFilter = false;
                categorySelect.value = '';
                titleElem.textContent = 'All Contacts';
                descElem.textContent = 'Manage, search, categorize, and organize your personal and professional network.';
            } else if (filter === 'favorites') {
                currentCategoryFilter = '';
                currentIsFavoriteFilter = true;
                categorySelect.value = '';
                titleElem.textContent = 'Favorite Contacts';
                descElem.textContent = 'Contacts you have pinned as your favorites.';
            } else {
                currentCategoryFilter = filter;
                currentIsFavoriteFilter = false;
                categorySelect.value = filter;
                titleElem.textContent = `${filter} Contacts`;
                descElem.textContent = `All contacts organized under the "${filter}" category.`;
            }

            loadContacts();
        });
    });
}

function setupSearchAndFilters() {
    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('clearSearchBtn');
    const categorySelect = document.getElementById('categoryFilterSelect');
    const sortSelect = document.getElementById('sortSelect');

    let debounceTimer = null;
    searchInput.addEventListener('input', () => {
        const val = searchInput.value.trim();
        clearBtn.classList.toggle('d-none', !val);

        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            currentSearchQuery = val;
            loadContacts();
        }, 300);
    });

    clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        clearBtn.classList.add('d-none');
        currentSearchQuery = '';
        loadContacts();
    });

    categorySelect.addEventListener('change', () => {
        currentCategoryFilter = categorySelect.value;
        loadContacts();
    });

    sortSelect.addEventListener('change', () => {
        currentSort = sortSelect.value;
        applySorting();
        const tbody = document.getElementById('contactsTableBody');
        tbody.innerHTML = allContactsCache.map(c => renderContactRow(c)).join('');
        attachTableEventListeners();
    });
}

function setupContactForm() {
    const form = document.getElementById('contactForm');
    const modalAlert = document.getElementById('modalAlert');
    const addBtn = document.getElementById('addNewContactBtn');

    addBtn.addEventListener('click', () => {
        form.reset();
        document.getElementById('contactId').value = '';
        document.getElementById('contactModalLabel').textContent = 'Add New Contact';
        modalAlert.classList.add('d-none');
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        modalAlert.classList.add('d-none');

        const contactId = document.getElementById('contactId').value;
        const name = document.getElementById('contactName').value.trim();
        const phone = document.getElementById('contactPhone').value.trim();
        const email = document.getElementById('contactEmail').value.trim();
        const address = document.getElementById('contactAddress').value.trim();
        const category = document.getElementById('contactCategory').value;
        const notes = document.getElementById('contactNotes').value.trim();
        const is_favorite = document.getElementById('contactIsFavorite').checked;

        if (!name) {
            showModalError('Contact name is required.');
            return;
        }

        if (!phone) {
            showModalError('Phone number is required.');
            return;
        }

        const phoneRegex = /^[0-9+\-\s()]{7,15}$/;
        if (!phoneRegex.test(phone)) {
            showModalError('Please enter a valid phone number (7 to 15 digits).');
            return;
        }

        if (email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                showModalError('Please enter a valid email address.');
                return;
            }
        }

        const submitBtn = document.getElementById('saveContactBtn');
        const spinner = document.getElementById('saveContactSpinner');
        submitBtn.disabled = true;
        spinner.classList.remove('d-none');

        const payload = { name, phone, email, address, category, notes, is_favorite };
        const isEdit = Boolean(contactId);
        const url = isEdit ? `/api/contacts/${contactId}` : '/api/contacts';
        const method = isEdit ? 'PUT' : 'POST';

        try {
            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (response.ok && data.success) {
                contactModalInstance.hide();
                showToast(isEdit ? 'Contact updated successfully!' : 'Contact added successfully!');
                loadDashboardStats();
                loadContacts();
            } else {
                showModalError(data.message || 'Operation failed. Please try again.');
            }
        } catch (error) {
            console.error('Contact save error:', error);
            showModalError('Network error while saving contact.');
        } finally {
            submitBtn.disabled = false;
            spinner.classList.add('d-none');
        }
    });
}

function showModalError(msg) {
    const alertBox = document.getElementById('modalAlert');
    alertBox.textContent = msg;
    alertBox.classList.remove('d-none');
}

async function openEditContactModal(contactId) {
    try {
        const response = await fetch(`/api/contacts/${contactId}`, { credentials: 'include' });
        if (!response.ok) throw new Error('Could not fetch contact details');

        const data = await response.json();
        const contact = data.contact;

        document.getElementById('contactId').value = contact.contact_id;
        document.getElementById('contactName').value = contact.name || '';
        document.getElementById('contactPhone').value = contact.phone || '';
        document.getElementById('contactEmail').value = contact.email || '';
        document.getElementById('contactAddress').value = contact.address || '';
        document.getElementById('contactCategory').value = contact.category || 'Other';
        document.getElementById('contactNotes').value = contact.notes || '';
        document.getElementById('contactIsFavorite').checked = Boolean(contact.is_favorite);

        document.getElementById('contactModalLabel').textContent = 'Edit Contact';
        document.getElementById('modalAlert').classList.add('d-none');

        contactModalInstance.show();
    } catch (error) {
        console.error('Error opening edit modal:', error);
        showToast('Could not load contact details.', 'danger');
    }
}

function openDeleteModal(contactId, contactName) {
    contactToDeleteId = contactId;
    document.getElementById('deleteContactName').textContent = `"${contactName}"`;
    deleteModalInstance.show();
}

function setupDeleteModal() {
    const confirmBtn = document.getElementById('confirmDeleteBtn');
    confirmBtn.addEventListener('click', async () => {
        if (!contactToDeleteId) return;

        confirmBtn.disabled = true;
        try {
            const response = await fetch(`/api/contacts/${contactToDeleteId}`, {
                method: 'DELETE',
                credentials: 'include'
            });

            const data = await response.json();
            if (response.ok && data.success) {
                deleteModalInstance.hide();
                showToast('Contact deleted successfully.', 'success');
                loadDashboardStats();
                loadContacts();
            } else {
                showToast(data.message || 'Failed to delete contact.', 'danger');
            }
        } catch (error) {
            console.error('Delete error:', error);
            showToast('Network error while deleting contact.', 'danger');
        } finally {
            confirmBtn.disabled = false;
            contactToDeleteId = null;
        }
    });
}

function setupCsvExport() {
    const exportBtn = document.getElementById('exportCsvBtn');
    exportBtn.addEventListener('click', () => {
        window.location.href = '/api/contacts/export/csv';
        showToast('Exporting contacts to CSV...', 'primary');
    });
}

function setupLogout() {
    const logoutBtn = document.getElementById('logoutBtn');
    logoutBtn.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to sign out?')) return;

        try {
            const response = await fetch('/api/auth/logout', {
                method: 'POST',
                credentials: 'include'
            });

            if (response.ok) {
                window.location.replace('login.html');
            } else {
                alert('Logout failed. Please try again.');
            }
        } catch (error) {
            console.error('Logout error:', error);
            window.location.replace('login.html');
        }
    });
}

function setupMobileSidebar() {
    const toggleBtn = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');

    if (toggleBtn && sidebar) {
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('open');
        });
    }
}

function escapeHtml(string) {
    if (!string) return '';
    return String(string)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
