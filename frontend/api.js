/**
 * API client for MoneyWise backend.
 * Uses Axios for HTTP requests.
 */

const API_BASE_URL = '/api';

// ============================================================================
// ACCOUNT API FUNCTIONS
// ============================================================================

/**
 * Get all accounts (including hidden).
 */
export async function getAccounts() {
    try {
        const response = await axios.get(`${API_BASE_URL}/accounts`);
        return response.data;
    } catch (error) {
        console.error('Error fetching accounts:', error);
        throw error;
    }
}

/**
 * Create a new account.
 * @param {Object} account - Account data { name, account_type }
 */
export async function createAccount(account) {
    try {
        const response = await axios.post(`${API_BASE_URL}/accounts`, account);
        return response.data;
    } catch (error) {
        console.error('Error creating account:', error);
        throw error;
    }
}

/**
 * Get a specific account by ID.
 * @param {number} accountId - Account ID
 */
export async function getAccount(accountId) {
    try {
        const response = await axios.get(`${API_BASE_URL}/accounts/${accountId}`);
        return response.data;
    } catch (error) {
        console.error('Error fetching account:', error);
        throw error;
    }
}

/**
 * Update an account.
 * @param {number} accountId - Account ID
 * @param {Object} updates - Partial account data { name, account_type, is_hidden }
 */
export async function updateAccount(accountId, updates) {
    try {
        const response = await axios.patch(`${API_BASE_URL}/accounts/${accountId}`, updates);
        return response.data;
    } catch (error) {
        console.error('Error updating account:', error);
        throw error;
    }
}

/**
 * Delete an account.
 * @param {number} accountId - Account ID
 */
export async function deleteAccount(accountId) {
    try {
        await axios.delete(`${API_BASE_URL}/accounts/${accountId}`);
        return true;
    } catch (error) {
        console.error('Error deleting account:', error);
        throw error;
    }
}

// ============================================================================
// CATEGORY API FUNCTIONS
// ============================================================================

/**
 * Get all categories (including hidden).
 */
export async function getCategories() {
    try {
        const response = await axios.get(`${API_BASE_URL}/categories`);
        return response.data;
    } catch (error) {
        console.error('Error fetching categories:', error);
        throw error;
    }
}

/**
 * Create a new category.
 * @param {Object} category - Category data { name }
 */
export async function createCategory(category) {
    try {
        const response = await axios.post(`${API_BASE_URL}/categories`, category);
        return response.data;
    } catch (error) {
        console.error('Error creating category:', error);
        throw error;
    }
}

/**
 * Get a specific category by ID.
 * @param {number} categoryId - Category ID
 */
export async function getCategory(categoryId) {
    try {
        const response = await axios.get(`${API_BASE_URL}/categories/${categoryId}`);
        return response.data;
    } catch (error) {
        console.error('Error fetching category:', error);
        throw error;
    }
}

/**
 * Update a category.
 * @param {number} categoryId - Category ID
 * @param {Object} updates - Partial category data { name, is_hidden }
 */
export async function updateCategory(categoryId, updates) {
    try {
        const response = await axios.patch(`${API_BASE_URL}/categories/${categoryId}`, updates);
        return response.data;
    } catch (error) {
        console.error('Error updating category:', error);
        throw error;
    }
}

/**
 * Delete a category.
 * @param {number} categoryId - Category ID
 */
export async function deleteCategory(categoryId) {
    try {
        await axios.delete(`${API_BASE_URL}/categories/${categoryId}`);
        return true;
    } catch (error) {
        console.error('Error deleting category:', error);
        throw error;
    }
}
