import { create } from 'zustand';
import * as api from '../api/client.js';

export const useTransactionStore = create((set, get) => ({
    // State
    transactions: [],
    total: 0,
    isLoading: false,
    error: null,

    // Filters
    filters: {
        account_id: null,
        category_id: null,
        status: null, // 'settled', 'pending', or null for all
        startDate: null,
        endDate: null,
        limit: 100,
        offset: 0,
    },

    // Derived: pending transactions
    get pendingTransactions() {
        return get().transactions.filter(t => t.status === 'pending');
    },

    // Derived: settled transactions
    get settledTransactions() {
        return get().transactions.filter(t => t.status === 'settled');
    },

    // Set filters
    setFilters: (newFilters) => {
        set((state) => ({
            filters: { ...state.filters, ...newFilters, offset: 0 }
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
                limit: 100,
                offset: 0,
            }
        });
    },

    // ==================== FETCH TRANSACTIONS ====================

    fetchTransactions: async () => {
        set({ isLoading: true, error: null });
        try {
            const filters = get().filters;
            // Clean up null values
            const cleanFilters = {};
            Object.keys(filters).forEach(key => {
                if (filters[key] !== null && filters[key] !== undefined) {
                    cleanFilters[key] = filters[key];
                }
            });

            const result = await api.getTransactions(cleanFilters);
            set({
                transactions: result.transactions,
                total: result.total,
                isLoading: false
            });
        } catch (error) {
            set({ error: error.message, isLoading: false });
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
