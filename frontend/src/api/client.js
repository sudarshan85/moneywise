const API_BASE = 'http://localhost:3001/api';

async function handleResponse(response) {
    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(error.error || 'Request failed');
    }
    return response.json();
}

// ==================== ACCOUNTS ====================

export async function getAccounts(includeHidden = false) {
    const response = await fetch(`${API_BASE}/accounts?includeHidden=${includeHidden}`);
    return handleResponse(response);
}

export async function getAccount(id) {
    const response = await fetch(`${API_BASE}/accounts/${id}`);
    return handleResponse(response);
}

export async function createAccount(data) {
    const response = await fetch(`${API_BASE}/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    return handleResponse(response);
}

export async function updateAccount(id, data) {
    const response = await fetch(`${API_BASE}/accounts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    return handleResponse(response);
}

export async function deleteAccount(id) {
    const response = await fetch(`${API_BASE}/accounts/${id}`, {
        method: 'DELETE',
    });
    return handleResponse(response);
}

// ==================== CATEGORY GROUPS ====================

export async function getCategoryGroups() {
    const response = await fetch(`${API_BASE}/categories/groups`);
    return handleResponse(response);
}

export async function createCategoryGroup(data) {
    const response = await fetch(`${API_BASE}/categories/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    return handleResponse(response);
}

export async function updateCategoryGroup(id, data) {
    const response = await fetch(`${API_BASE}/categories/groups/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    return handleResponse(response);
}

export async function deleteCategoryGroup(id) {
    const response = await fetch(`${API_BASE}/categories/groups/${id}`, {
        method: 'DELETE',
    });
    return handleResponse(response);
}

// ==================== CATEGORIES ====================

export async function getCategories(includeHidden = false, groupId = null) {
    let url = `${API_BASE}/categories?includeHidden=${includeHidden}`;
    if (groupId) url += `&groupId=${groupId}`;
    const response = await fetch(url);
    return handleResponse(response);
}

export async function getCategory(id) {
    const response = await fetch(`${API_BASE}/categories/${id}`);
    return handleResponse(response);
}

export async function createCategory(data) {
    const response = await fetch(`${API_BASE}/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    return handleResponse(response);
}

export async function updateCategory(id, data) {
    const response = await fetch(`${API_BASE}/categories/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    return handleResponse(response);
}

export async function deleteCategory(id) {
    const response = await fetch(`${API_BASE}/categories/${id}`, {
        method: 'DELETE',
    });
    return handleResponse(response);
}

export async function getCategoryHistory(id) {
    const response = await fetch(`${API_BASE}/categories/${id}/history`);
    return handleResponse(response);
}
