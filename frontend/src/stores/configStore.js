import { create } from 'zustand';
import * as api from '../api/client.js';

export const useConfigStore = create((set, get) => ({
    // State
    accounts: [],
    categories: [],
    settings: {},
    showHidden: false,
    isLoading: false,
    error: null,

    // Toggle show hidden
    toggleShowHidden: () => set((state) => ({ showHidden: !state.showHidden })),

    // ==================== ACCOUNTS ====================

    fetchAccounts: async () => {
        set({ isLoading: true, error: null });
        try {
            const accounts = await api.getAccounts(get().showHidden);
            set({ accounts, isLoading: false });
        } catch (error) {
            set({ error: error.message, isLoading: false });
        }
    },

    createAccount: async (data) => {
        set({ isLoading: true, error: null });
        try {
            const account = await api.createAccount(data);
            set((state) => ({ accounts: [...state.accounts, account], isLoading: false }));
            return account;
        } catch (error) {
            set({ error: error.message, isLoading: false });
            throw error;
        }
    },

    updateAccount: async (id, data) => {
        set({ isLoading: true, error: null });
        try {
            const account = await api.updateAccount(id, data);
            set((state) => ({
                accounts: state.accounts.map((a) => (a.id === id ? account : a)),
                isLoading: false,
            }));
            // Trigger refresh of Available to Budget in header
            window.dispatchEvent(new CustomEvent('moneywise:refresh-balance'));
            return account;
        } catch (error) {
            set({ error: error.message, isLoading: false });
            throw error;
        }
    },

    deleteAccount: async (id) => {
        set({ isLoading: true, error: null });
        try {
            await api.deleteAccount(id);
            set((state) => ({
                accounts: state.accounts.filter((a) => a.id !== id),
                isLoading: false,
            }));
        } catch (error) {
            set({ error: error.message, isLoading: false });
            throw error;
        }
    },

    // ==================== CATEGORIES ====================

    fetchCategories: async () => {
        set({ isLoading: true, error: null });
        try {
            const categories = await api.getCategories(get().showHidden);
            set({ categories, isLoading: false });
        } catch (error) {
            set({ error: error.message, isLoading: false });
        }
    },

    createCategory: async (data) => {
        set({ isLoading: true, error: null });
        try {
            const category = await api.createCategory(data);
            set((state) => ({ categories: [...state.categories, category], isLoading: false }));
            return category;
        } catch (error) {
            set({ error: error.message, isLoading: false });
            throw error;
        }
    },

    updateCategory: async (id, data) => {
        set({ isLoading: true, error: null });
        try {
            const category = await api.updateCategory(id, data);
            set((state) => ({
                categories: state.categories.map((c) => (c.id === id ? category : c)),
                isLoading: false,
            }));
            return category;
        } catch (error) {
            set({ error: error.message, isLoading: false });
            throw error;
        }
    },

    deleteCategory: async (id) => {
        set({ isLoading: true, error: null });
        try {
            await api.deleteCategory(id);
            set((state) => ({
                categories: state.categories.filter((c) => c.id !== id),
                isLoading: false,
            }));
        } catch (error) {
            set({ error: error.message, isLoading: false });
            throw error;
        }
    },

    // ==================== SETTINGS ====================

    fetchSettings: async () => {
        try {
            const settings = await api.getSettings();
            set({ settings });
        } catch (error) {
            set({ error: error.message });
        }
    },

    updateSettings: async (data) => {
        set({ isLoading: true, error: null });
        try {
            const settings = await api.updateSettings(data);
            set({ settings, isLoading: false });
            return settings;
        } catch (error) {
            set({ error: error.message, isLoading: false });
            throw error;
        }
    },

    // Fetch all data
    fetchAll: async () => {
        await Promise.all([
            get().fetchAccounts(),
            get().fetchCategories(),
            get().fetchSettings(),
        ]);
    },

    // Clear error
    clearError: () => set({ error: null }),
}));
