import { create } from 'zustand';
import * as api from '../api/client.js';

export const useTransactionStore = create((set, get) => ({
    // State
    transactions: [],
    total: 0,
    isLoading: false,
    isLoadingMore: false,
    error: null,

    // Filters
    filters: {
        account_id: null,
        category_id: null,
        status: null, // 'settled', 'pending', or null for all
        startDate: null,
        endDate: null,
        memo_search: null, // lowercase partial match search on memo
        since_reconciliation: true, // default to showing only since last reconciliation
        limit: 50,
        offset: 0,
    },

    // Computed: has more pages to load
    hasMore: () => {
        const state = get();
        return state.transactions.length < state.total;
    },

    // Derived: pending transactions
    get pendingTransactions() {
        return get().transactions.filter(t => t.status === 'pending');
    },

    // Derived: settled transactions
    get settledTransactions() {
        return get().transactions.filter(t => t.status === 'settled');
    },

    // Set filters (resets offset to 0)
    setFilters: (newFilters) => {
        set((state) => ({
            filters: { ...state.filters, ...newFilters, offset: 0 }
        }));
    },

    // Set page size (updates limit and resets offset)
    setPageSize: (size) => {
        const validSize = Math.max(10, Math.min(500, parseInt(size) || 50));
        set((state) => ({
            filters: { ...state.filters, limit: validSize, offset: 0 }
        }));
    },

    // Reset filters
    resetFilters: () => {
        set({
            filters: {
                account_id: null,
                category_id: null,
                status: null,
                startDate: null,
                endDate: null,
                memo_search: null,
                since_reconciliation: true,
                limit: 50,
                offset: 0,
            }
        });
    },

    // Reset pagination (go back to first page)
    resetPagination: () => {
        set((state) => ({
            filters: { ...state.filters, offset: 0 }
        }));
    },

    // ==================== FETCH TRANSACTIONS ====================

    fetchTransactions: async () => {
        set({ isLoading: true, error: null });
        try {
            const filters = get().filters;
            // Build clean filters for API call
            const cleanFilters = {};
            Object.keys(filters).forEach(key => {
                if (filters[key] !== null && filters[key] !== undefined) {
                    cleanFilters[key] = filters[key];
                }
            });
            // Always fetch from offset 0 for fresh fetch
            cleanFilters.offset = 0;

            const result = await api.getTransactions(cleanFilters);
            // Only update data, NOT filters (to avoid infinite loop)
            set({
                transactions: result.transactions,
                total: result.total,
                isLoading: false
            });
        } catch (error) {
            set({ error: error.message, isLoading: false });
        }
    },

    // ==================== LOAD MORE TRANSACTIONS ====================

    loadMore: async () => {
        const state = get();
        if (state.isLoadingMore || !state.hasMore()) return;

        set({ isLoadingMore: true, error: null });
        try {
            const filters = state.filters;
            const newOffset = filters.offset + filters.limit;

            // Build clean filters with new offset
            const cleanFilters = { ...filters, offset: newOffset };
            Object.keys(cleanFilters).forEach(key => {
                if (cleanFilters[key] === null || cleanFilters[key] === undefined) {
                    delete cleanFilters[key];
                }
            });

            const result = await api.getTransactions(cleanFilters);
            set({
                transactions: [...state.transactions, ...result.transactions],
                total: result.total,
                filters: { ...filters, offset: newOffset },
                isLoadingMore: false
            });
        } catch (error) {
            set({ error: error.message, isLoadingMore: false });
        }
    },

    // ==================== CREATE TRANSACTION ====================

    createTransaction: async (data) => {
        set({ isLoading: true, error: null });
        try {
            const transaction = await api.createTransaction(data);
            set((state) => ({
                transactions: [transaction, ...state.transactions],
                total: state.total + 1,
                isLoading: false
            }));
            return transaction;
        } catch (error) {
            set({ error: error.message, isLoading: false });
            throw error;
        }
    },

    // ==================== UPDATE TRANSACTION ====================

    updateTransaction: async (id, data) => {
        set({ isLoading: true, error: null });
        try {
            const transaction = await api.updateTransaction(id, data);
            set((state) => ({
                transactions: state.transactions.map((t) =>
                    t.id === id ? transaction : t
                ),
                isLoading: false,
            }));
            return transaction;
        } catch (error) {
            set({ error: error.message, isLoading: false });
            throw error;
        }
    },

    // ==================== DELETE TRANSACTION ====================

    deleteTransaction: async (id) => {
        set({ isLoading: true, error: null });
        try {
            const transaction = get().transactions.find(t => t.id === id);
            await api.deleteTransaction(id);

            // If it was a transfer, remove both transactions
            if (transaction?.transfer_pair_id) {
                set((state) => ({
                    transactions: state.transactions.filter(
                        (t) => t.id !== id && t.id !== transaction.transfer_pair_id
                    ),
                    total: state.total - 2,
                    isLoading: false,
                }));
            } else {
                set((state) => ({
                    transactions: state.transactions.filter((t) => t.id !== id),
                    total: state.total - 1,
                    isLoading: false,
                }));
            }
        } catch (error) {
            set({ error: error.message, isLoading: false });
            throw error;
        }
    },

    // ==================== ACCOUNT TRANSFER ====================

    createAccountTransfer: async (data) => {
        set({ isLoading: true, error: null });
        try {
            const result = await api.createAccountTransfer(data);
            set((state) => ({
                transactions: [result.outflow, result.inflow, ...state.transactions],
                total: state.total + 2,
                isLoading: false
            }));
            return result;
        } catch (error) {
            set({ error: error.message, isLoading: false });
            throw error;
        }
    },

    // ==================== CREATE RECONCILIATION ====================

    createReconciliation: async (data) => {
        set({ isLoading: true, error: null });
        try {
            const transaction = await api.createReconciliation(data);
            set((state) => ({
                transactions: [transaction, ...state.transactions],
                total: state.total + 1,
                isLoading: false
            }));
            return transaction;
        } catch (error) {
            set({ error: error.message, isLoading: false });
            throw error;
        }
    },

    // ==================== TOGGLE RECONCILIATION ====================

    toggleReconciliation: async (id) => {
        set({ isLoading: true, error: null });
        try {
            const transaction = await api.toggleReconciliation(id);
            set((state) => ({
                transactions: state.transactions.map((t) =>
                    t.id === id ? transaction : t
                ),
                isLoading: false,
            }));
            return transaction;
        } catch (error) {
            set({ error: error.message, isLoading: false });
            throw error;
        }
    },

    // ==================== TOGGLE STATUS ====================

    toggleStatus: async (id) => {
        set({ isLoading: true, error: null });
        try {
            const transaction = await api.toggleStatus(id);
            set((state) => ({
                transactions: state.transactions.map((t) =>
                    t.id === id ? transaction : t
                ),
                isLoading: false,
            }));
            return transaction;
        } catch (error) {
            set({ error: error.message, isLoading: false });
            throw error;
        }
    },

    // Clear error
    clearError: () => set({ error: null }),
}));
