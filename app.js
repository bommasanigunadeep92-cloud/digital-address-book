let currentUser = null;
let currentCategoryFilter = '';
let currentIsFavoriteFilter = false;
let currentSearchQuery = '';
let contactToDeleteId = null;
let contactModalInstance = null;
let deleteModalInstance = null;

document.addEventListener('DOMContentLoaded', async () => {
    contactModalInstance = new bootstrap.Modal(document.getElementById('contactModal'));
    deleteModalInstance = new bootstrap.Modal(document.getElementById('deleteModal'));

    const authenticated = await verifyAuthentication();
    if (!authenticated) return;

    setupSidebarFilters();
    setupSearchAndFilters();
    setupContactForm();
    setupDeleteModal();
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
        <div id="${toastId}" class="toast align-items-center ${bgClass} border-0 shadow" role="alert" aria-live="assertive" aria-atomic="true">
            <div class="d-flex">
                <div class="toast-body d-flex align-items-center gap-2">
                    <i class="bi ${icon}"></i>
                    <span>${message}</span>
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

    tbody.innerHTML = `
        <tr>
            <td colspan="7" class="text-center py-5 text-muted">
                <div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
                Loading contacts...
            </td>
        </tr>
    `;
    emptyState.classList.add('d-none');

    const params = new URLSearchParams();
    if (currentCategoryFilter) params.append('category', currentCategoryFilter);
    if (currentIsFavoriteFilter) params.append('favorite', 'true');
    if (currentSearchQuery) params.append('search', currentSearchQuery);

    try {
        const url = `/api/contacts?${params.toString()}`;
        const response = await fetch(url, { credentials: 'include' });
        if (!response.ok) throw new Error('Failed to fetch contacts');

        const data = await response.json();
        const contacts = data.contacts;

        if (contacts.length === 0) {
            tbody.innerHTML = '';
            emptyState.classList.remove('d-none');
            return;
        }

        emptyState.classList.add('d-none');
        tbody.innerHTML = contacts.map(c => renderContactRow(c)).join('');
        attachTableEventListeners();
    } catch (error) {
        console.error('Error fetching contacts:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center py-4 text-danger">
                    <i class="bi bi-exclamation-triangle me-1"></i> Failed to load contacts. Please try again.
                </td>
            </tr>
        `;
    }
}

function renderContactRow(c) {
    const categoryClass = 'badge-' + (c.category || 'Other').toLowerCase();
    const favClass = c.is_favorite ? 'active' : '';
    const favIcon = c.is_favorite ? 'bi-star-fill' : 'bi-star';
    const emailDisplay = c.email ? `<a href="mailto:${escapeHtml(c.email)}" class="text-decoration-none text-muted">${escapeHtml(c.email)}</a>` : '<span class="text-muted">-</span>';
    const phoneDisplay = `<a href="tel:${escapeHtml(c.phone)}" class="text-decoration-none fw-medium text-dark">${escapeHtml(c.phone)}</a>`;

    let notesAndAddress = '';
    if (c.address) notesAndAddress += `<div><i class="bi bi-geo-alt text-muted me-1"></i>${escapeHtml(c.address)}</div>`;
    if (c.notes) notesAndAddress += `<div class="text-muted small fst-italic">${escapeHtml(c.notes)}</div>`;
    if (!notesAndAddress) notesAndAddress = '<span class="text-muted small">-</span>';

    return `
        <tr data-id="${c.contact_id}">
            <td class="text-center">
                <button class="btn-favorite ${favClass}" data-action="favorite" data-id="${c.contact_id}" title="Toggle Favorite">
                    <i class="bi ${favIcon}"></i>
                </button>
            </td>
            <td>
                <div class="fw-bold text-dark">${escapeHtml(c.name)}</div>
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
                    <button class="btn btn-outline-secondary btn-sm p-1 px-2" data-action="edit" data-id="${c.contact_id}" title="Edit Contact">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-outline-danger btn-sm p-1 px-2" data-action="delete" data-id="${c.contact_id}" data-name="${escapeHtml(c.name)}" title="Delete Contact">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `;
}

function attachTableEventListeners() {
    const tbody = document.getElementById('contactsTableBody');

    tbody.querySelectorAll('button[data-action="favorite"]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const contactId = btn.getAttribute('data-id');
            await toggleFavorite(contactId, btn);
        });
    });

    tbody.querySelectorAll('button[data-action="edit"]').forEach(btn => {
        btn.addEventListener('click', () => {
            const contactId = btn.getAttribute('data-id');
            openEditContactModal(contactId);
        });
    });

    tbody.querySelectorAll('button[data-action="delete"]').forEach(btn => {
        btn.addEventListener('click', () => {
            const contactId = btn.getAttribute('data-id');
            const contactName = btn.getAttribute('data-name');
            openDeleteModal(contactId, contactName);
        });
    });
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
                descElem.textContent = 'Manage, search and organize your personal and professional contacts.';
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
