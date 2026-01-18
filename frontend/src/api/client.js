// Use relative URL in production, localhost in development
const API_BASE = import.meta.env.DEV ? 'http://localhost:3001/api' : '/api';

/**
 * Wrapper around fetch that includes credentials for cookie support
 */
function apiFetch(url, options = {}) {
    return fetch(url, {
        ...options,
        credentials: 'include'
    });
}

async function handleResponse(response) {
    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(error.error || 'Request failed');
    }
    return response.json();
}

// ==================== AUTHENTICATION ====================

export async function checkAuthStatus() {
    const response = await apiFetch(`${API_BASE}/auth/status`);
    return handleResponse(response);
}

export async function loginWithPassword(password) {
    const response = await apiFetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
    });
    return handleResponse(response);
}

export async function logout() {
    const response = await apiFetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
    });
    return handleResponse(response);
}

// ==================== ACCOUNTS ====================

export async function getAccounts(includeHidden = false) {
    const response = await apiFetch(`${API_BASE}/accounts?includeHidden=${includeHidden}`);
    return handleResponse(response);
}

export async function getMoneyPotBalance() {
    const response = await apiFetch(`${API_BASE}/accounts/moneypot`);
    return handleResponse(response);
}

export async function getAccount(id) {
    const response = await apiFetch(`${API_BASE}/accounts/${id}`);
    return handleResponse(response);
}

export async function createAccount(data) {
    const response = await apiFetch(`${API_BASE}/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    return handleResponse(response);
}

export async function updateAccount(id, data) {
    const response = await apiFetch(`${API_BASE}/accounts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    return handleResponse(response);
}

export async function deleteAccount(id) {
    const response = await apiFetch(`${API_BASE}/accounts/${id}`, {
        method: 'DELETE',
    });
    return handleResponse(response);
}

// ==================== CATEGORIES ====================

export async function getCategories(includeHidden = false) {
    const response = await apiFetch(`${API_BASE}/categories?includeHidden=${includeHidden}`);
    return handleResponse(response);
}

export async function getCategory(id) {
    const response = await apiFetch(`${API_BASE}/categories/${id}`);
    return handleResponse(response);
}

export async function createCategory(data) {
    const response = await apiFetch(`${API_BASE}/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    return handleResponse(response);
}

export async function updateCategory(id, data) {
    const response = await apiFetch(`${API_BASE}/categories/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    return handleResponse(response);
}

export async function deleteCategory(id) {
    const response = await apiFetch(`${API_BASE}/categories/${id}`, {
        method: 'DELETE',
    });
    return handleResponse(response);
}

export async function getCategoryHistory(id) {
    const response = await apiFetch(`${API_BASE}/categories/${id}/history`);
    return handleResponse(response);
}

// ==================== SETTINGS ====================

export async function getSettings() {
    const response = await apiFetch(`${API_BASE}/categories/settings`);
    return handleResponse(response);
}

export async function updateSettings(data) {
    const response = await apiFetch(`${API_BASE}/categories/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    return handleResponse(response);
}

// ==================== TRANSACTIONS ====================

export async function getTransactions(filters = {}) {
    const params = new URLSearchParams();
    if (filters.account_id) params.append('account_id', filters.account_id);
    if (filters.category_id) params.append('category_id', filters.category_id);
    if (filters.status) params.append('status', filters.status);
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);
    if (filters.memo_search) params.append('memo_search', filters.memo_search);
    if (filters.since_reconciliation) params.append('since_reconciliation', 'true');
    if (filters.limit) params.append('limit', filters.limit);
    if (filters.offset) params.append('offset', filters.offset);

    const response = await apiFetch(`${API_BASE}/transactions?${params}`);
    return handleResponse(response);
}

export async function getTransaction(id) {
    const response = await apiFetch(`${API_BASE}/transactions/${id}`);
    return handleResponse(response);
}

export async function createTransaction(data) {
    const response = await apiFetch(`${API_BASE}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    return handleResponse(response);
}

export async function updateTransaction(id, data) {
    const response = await apiFetch(`${API_BASE}/transactions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    return handleResponse(response);
}

export async function deleteTransaction(id) {
    const response = await apiFetch(`${API_BASE}/transactions/${id}`, {
        method: 'DELETE',
    });
    return handleResponse(response);
}

export async function createAccountTransfer(data) {
    const response = await apiFetch(`${API_BASE}/transactions/account-transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    return handleResponse(response);
}

export async function toggleReconciliation(id) {
    const response = await apiFetch(`${API_BASE}/transactions/${id}/toggle-reconciliation`, {
        method: 'PATCH',
    });
    return handleResponse(response);
}

export async function createReconciliation(data) {
    const response = await apiFetch(`${API_BASE}/transactions/reconciliation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    return handleResponse(response);
}

// ==================== BACKUP ====================

export async function exportBackup() {
    const response = await apiFetch(`${API_BASE}/backup/export`);
    return handleResponse(response);
}

export async function importBackup(data) {
    const response = await apiFetch(`${API_BASE}/backup/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    return handleResponse(response);
}

export async function manualBackup() {
    const response = await apiFetch(`${API_BASE}/backup/manual`, {
        method: 'POST',
    });
    return handleResponse(response);
}

// ==================== STATUS TOGGLE ====================

export async function toggleStatus(id) {
    const response = await apiFetch(`${API_BASE}/transactions/${id}/toggle-status`, {
        method: 'PATCH',
    });
    return handleResponse(response);
}

// ==================== CATEGORY TRANSFERS ====================

export async function getTransfers(filters = {}) {
    const params = new URLSearchParams();
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);
    if (filters.category_id) params.append('category_id', filters.category_id);
    if (filters.limit) params.append('limit', filters.limit);
    if (filters.offset) params.append('offset', filters.offset);

    const response = await apiFetch(`${API_BASE}/transfers?${params}`);
    return handleResponse(response);
}

export async function createTransfer(data) {
    const response = await apiFetch(`${API_BASE}/transfers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    return handleResponse(response);
}

export async function deleteTransfer(id) {
    const response = await apiFetch(`${API_BASE}/transfers/${id}`, {
        method: 'DELETE',
    });
    return handleResponse(response);
}

export async function updateTransfer(id, data) {
    const response = await apiFetch(`${API_BASE}/transfers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    return handleResponse(response);
}

export async function autoPopulateTransfers(date) {
    const response = await apiFetch(`${API_BASE}/transfers/auto-populate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
    });
    return handleResponse(response);
}

// ==================== DASHBOARD ====================

export async function getDashboardData() {
    const response = await apiFetch(`${API_BASE}/dashboard`);
    return handleResponse(response);
}

export async function getCategoryDetails(id) {
    const response = await apiFetch(`${API_BASE}/dashboard/category/${id}`);
    return handleResponse(response);
}

// ==================== REPORTS ====================

export async function getReportsSummary(start, end) {
    const params = new URLSearchParams({ start, end });
    const response = await apiFetch(`${API_BASE}/reports/summary?${params}`);
    return handleResponse(response);
}

export async function getSpendingByCategory(start, end) {
    const params = new URLSearchParams({ start, end });
    const response = await apiFetch(`${API_BASE}/reports/spending-by-category?${params}`);
    return handleResponse(response);
}

export async function getIncomeVsExpenses(start, end, groupBy = 'month') {
    const params = new URLSearchParams({ start, end, groupBy });
    const response = await apiFetch(`${API_BASE}/reports/income-vs-expenses?${params}`);
    return handleResponse(response);
}

export async function getCategoryTrend(start, end, limit = 5) {
    const params = new URLSearchParams({ start, end, limit: String(limit) });
    const response = await apiFetch(`${API_BASE}/reports/category-trend?${params}`);
    return handleResponse(response);
}

export async function getBalanceHistory(start, end) {
    const params = new URLSearchParams({ start, end });
    const response = await apiFetch(`${API_BASE}/reports/balance-history?${params}`);
    return handleResponse(response);
}

export async function getTopExpenses(start, end, limit = 10) {
    const params = new URLSearchParams({ start, end, limit: String(limit) });
    const response = await apiFetch(`${API_BASE}/reports/top-expenses?${params}`);
    return handleResponse(response);
}

export async function getDailySpending(start, end) {
    const params = new URLSearchParams({ start, end });
    const response = await apiFetch(`${API_BASE}/reports/daily-spending?${params}`);
    return handleResponse(response);
}
