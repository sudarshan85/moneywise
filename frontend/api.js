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

// ============================================================================
// TRANSACTION API FUNCTIONS
// ============================================================================

/**
 * Get transactions with optional filters.
 * @param {Object} filters - Filter options { accountId, categoryId, startDate, endDate, limit }
 */
export async function getTransactions(filters = {}) {
    try {
        const params = new URLSearchParams();
        if (filters.account_id) params.append('account_id', filters.account_id);
        if (filters.category_id) params.append('category_id', filters.category_id);
        if (filters.start_date) params.append('start_date', filters.start_date);
        if (filters.end_date) params.append('end_date', filters.end_date);
        if (filters.limit) params.append('limit', filters.limit);

        const url = params.toString() ? `${API_BASE_URL}/transactions?${params}` : `${API_BASE_URL}/transactions`;
        const response = await axios.get(url);
        return response.data;
    } catch (error) {
        console.error('Error fetching transactions:', error);
        throw error;
    }
}

/**
 * Create a new transaction.
 * @param {Object} transaction - Transaction data { date, inflow, outflow, account_id, category_id, memo, is_transfer, transfer_id }
 */
export async function createTransaction(transaction) {
    try {
        const response = await axios.post(`${API_BASE_URL}/transactions`, transaction);
        return response.data;
    } catch (error) {
        console.error('Error creating transaction:', error);
        throw error;
    }
}

/**
 * Get a specific transaction by ID.
 * @param {number} transactionId - Transaction ID
 */
export async function getTransaction(transactionId) {
    try {
        const response = await axios.get(`${API_BASE_URL}/transactions/${transactionId}`);
        return response.data;
    } catch (error) {
        console.error('Error fetching transaction:', error);
        throw error;
    }
}

/**
 * Update a transaction.
 * @param {number} transactionId - Transaction ID
 * @param {Object} updates - Partial transaction data
 */
export async function updateTransaction(transactionId, updates) {
    try {
        const response = await axios.patch(`${API_BASE_URL}/transactions/${transactionId}`, updates);
        return response.data;
    } catch (error) {
        console.error('Error updating transaction:', error);
        throw error;
    }
}

/**
 * Delete a transaction.
 * @param {number} transactionId - Transaction ID
 */
export async function deleteTransaction(transactionId) {
    try {
        await axios.delete(`${API_BASE_URL}/transactions/${transactionId}`);
        return true;
    } catch (error) {
        console.error('Error deleting transaction:', error);
        throw error;
    }
}

// ============================================================================
// CURRENCY API FUNCTIONS - FEATURE DEFERRED: Commented out for future implementation
// ============================================================================
//
// /**
//  * Get exchange rates.
//  * @param {string} base - Base currency code (default: USD)
//  * @param {Array<string>} targets - Target currency codes (optional)
//  */
// export async function getExchangeRates(base = 'USD', targets = null) {
//     try {
//         let url = `${API_BASE_URL}/currency/rates?base=${base}`;
//         if (targets && targets.length > 0) {
//             url += `&targets=${targets.join(',')}`;
//         }
//         const response = await axios.get(url);
//         return response.data;
//     } catch (error) {
//         console.error('Error fetching exchange rates:', error);
//         throw error;
//     }
// }
//
// /**
//  * Refresh exchange rates from API.
//  */
// export async function refreshExchangeRates() {
//     try {
//         const response = await axios.post(`${API_BASE_URL}/currency/refresh`);
//         return response.data;
//     } catch (error) {
//         console.error('Error refreshing exchange rates:', error);
//         throw error;
//     }
// }
//
// /**
//  * Convert amount between currencies.
//  * @param {number} amount - Amount to convert
//  * @param {string} fromCurrency - Source currency code
//  * @param {string} toCurrency - Target currency code
//  */
// export async function convertCurrency(amount, fromCurrency = 'USD', toCurrency = 'USD') {
//     try {
//         const response = await axios.get(`${API_BASE_URL}/currency/convert`, {
//             params: {
//                 amount,
//                 from_currency: fromCurrency,
//                 to_currency: toCurrency
//             }
//         });
//         return response.data;
//     } catch (error) {
//         console.error('Error converting currency:', error);
//         throw error;
//     }
// }
