/**
 * Configuration component for managing accounts and categories.
 */

import { showToast } from '../utils.js';

export default {
    name: 'Configuration',
    template: `
    <div class="configuration">
        <h1>Configuration</h1>

        <!-- Confirmation Modal -->
        <div v-if="confirmDialog.show" class="modal-overlay" @click.self="closeConfirmDialog">
            <div class="modal-dialog">
                <div class="modal-header">
                    <h2>Confirm Deletion</h2>
                </div>
                <div class="modal-body">
                    <p>{{ confirmDialog.message }}</p>
                </div>
                <div class="modal-footer">
                    <button @click="closeConfirmDialog" class="btn btn-secondary">Cancel</button>
                    <button @click="confirmDialog.onConfirm" class="btn btn-danger">Delete</button>
                </div>
            </div>
        </div>

        <!-- Accounts Section -->
        <section class="accounts-section">
            <h2>Accounts</h2>

            <!-- Bank Accounts -->
            <div class="account-subsection">
                <h3>Bank Accounts & Cash</h3>
                <div v-if="bankAccounts.length === 0 && !showHiddenAccounts" class="empty-message">
                    No bank accounts yet.
                </div>
                <table v-if="bankAccounts.length > 0" class="accounts-table">
                    <thead>
                        <tr>
                            <th>Account Name</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="account in bankAccounts" :key="account.id">
                            <td class="account-name">
                                <input
                                    v-if="editingAccountId === account.id"
                                    v-model="editingAccountName"
                                    type="text"
                                    class="editable-field"
                                    @keyup.enter="saveAccount(account.id)"
                                    @keyup.escape="cancelEdit"
                                    autofocus
                                />
                                <span v-else>{{ account.name }}</span>
                            </td>
                            <td class="actions">
                                <button
                                    v-if="editingAccountId === account.id"
                                    @click="saveAccount(account.id)"
                                    class="btn btn-success"
                                >
                                    Save
                                </button>
                                <button
                                    v-if="editingAccountId === account.id"
                                    @click="cancelEdit"
                                    class="btn btn-secondary"
                                >
                                    Cancel
                                </button>
                                <button
                                    v-if="editingAccountId !== account.id"
                                    @click="startEditAccount(account.id, account.name)"
                                    class="btn btn-primary"
                                >
                                    Edit
                                </button>
                                <button
                                    v-if="editingAccountId !== account.id"
                                    @click="toggleHideAccount(account.id, !account.is_hidden)"
                                    :class="account.is_hidden ? 'btn btn-success' : 'btn btn-secondary'"
                                >
                                    {{ account.is_hidden ? 'Unhide' : 'Hide' }}
                                </button>
                                <button
                                    v-if="editingAccountId !== account.id"
                                    @click="deleteAccountConfirm(account.id, account.name)"
                                    class="btn btn-danger"
                                >
                                    Delete
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- Credit Cards -->
            <div class="account-subsection">
                <h3>Credit Cards</h3>
                <div v-if="creditAccounts.length === 0 && !showHiddenAccounts" class="empty-message">
                    No credit cards yet.
                </div>
                <table v-if="creditAccounts.length > 0" class="accounts-table">
                    <thead>
                        <tr>
                            <th>Account Name</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="account in creditAccounts" :key="account.id">
                            <td class="account-name">
                                <input
                                    v-if="editingAccountId === account.id"
                                    v-model="editingAccountName"
                                    type="text"
                                    class="editable-field"
                                    @keyup.enter="saveAccount(account.id)"
                                    @keyup.escape="cancelEdit"
                                    autofocus
                                />
                                <span v-else>{{ account.name }}</span>
                            </td>
                            <td class="actions">
                                <button
                                    v-if="editingAccountId === account.id"
                                    @click="saveAccount(account.id)"
                                    class="btn btn-success"
                                >
                                    Save
                                </button>
                                <button
                                    v-if="editingAccountId === account.id"
                                    @click="cancelEdit"
                                    class="btn btn-secondary"
                                >
                                    Cancel
                                </button>
                                <button
                                    v-if="editingAccountId !== account.id"
                                    @click="startEditAccount(account.id, account.name)"
                                    class="btn btn-primary"
                                >
                                    Edit
                                </button>
                                <button
                                    v-if="editingAccountId !== account.id"
                                    @click="toggleHideAccount(account.id, !account.is_hidden)"
                                    :class="account.is_hidden ? 'btn btn-success' : 'btn btn-secondary'"
                                >
                                    {{ account.is_hidden ? 'Unhide' : 'Hide' }}
                                </button>
                                <button
                                    v-if="editingAccountId !== account.id"
                                    @click="deleteAccountConfirm(account.id, account.name)"
                                    class="btn btn-danger"
                                >
                                    Delete
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- Show Hidden Accounts Checkbox -->
            <div class="show-hidden-checkbox">
                <input
                    id="showHiddenAccounts"
                    v-model="showHiddenAccounts"
                    type="checkbox"
                />
                <label for="showHiddenAccounts">Show Hidden Accounts</label>
            </div>

            <!-- Add Account Form -->
            <div class="add-account-form">
                <h3>Add New Account</h3>
                <div class="form-grid">
                    <div class="form-group">
                        <label>Account Name</label>
                        <input
                            v-model="newAccount.name"
                            type="text"
                            placeholder="Account name (e.g., Checking, Visa Card)"
                            class="form-input"
                            @keyup.enter="addAccount"
                        />
                    </div>
                    <div class="form-group">
                        <label>Type</label>
                        <select v-model="newAccount.account_type" class="form-input">
                            <option value="bank">Bank Account/Cash</option>
                            <option value="credit">Credit Card</option>
                        </select>
                    </div>
                    <div class="form-group button-group">
                        <button @click="addAccount" class="btn btn-primary">Add Account</button>
                    </div>
                </div>
            </div>
        </section>

        <!-- Categories Section -->
        <section class="categories-section">
            <h2>Categories</h2>

            <div v-if="visibleCategories.length === 0" class="empty-message">
                No categories yet.
            </div>

            <table v-if="visibleCategories.length > 0" class="categories-table">
                <thead>
                    <tr>
                        <th>Category Name</th>
                        <th>Rename History</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="category in visibleCategories" :key="category.id">
                        <td class="category-name">
                            <input
                                v-if="editingCategoryId === category.id"
                                v-model="editingCategoryName"
                                type="text"
                                class="editable-field"
                                @keyup.enter="saveCategory(category.id)"
                                @keyup.escape="cancelEdit"
                                autofocus
                            />
                            <span v-else>{{ category.name }}</span>
                        </td>
                        <td class="rename-history">
                            <div
                                v-if="category.renamed_history && category.renamed_history.length > 0"
                                class="rename-indicator"
                                @mouseenter="hoveredCategoryId = category.id"
                                @mouseleave="hoveredCategoryId = null"
                            >
                                <span class="rename-icon">ⓡ</span>
                                <div v-if="hoveredCategoryId === category.id" class="rename-tooltip">
                                    <div class="tooltip-title">Rename History</div>
                                    <div v-for="(rename, idx) in category.renamed_history" :key="idx" class="rename-item">
                                        <strong>{{ rename.old_name }}</strong>
                                        <br/>
                                        <small>{{ formatDate(rename.renamed_at) }}</small>
                                    </div>
                                </div>
                            </div>
                        </td>
                        <td class="actions">
                            <button
                                v-if="editingCategoryId === category.id"
                                @click="saveCategory(category.id)"
                                class="btn btn-success"
                            >
                                Save
                            </button>
                            <button
                                v-if="editingCategoryId === category.id"
                                @click="cancelEdit"
                                class="btn btn-secondary"
                            >
                                Cancel
                            </button>
                            <button
                                v-if="editingCategoryId !== category.id"
                                @click="startEditCategory(category.id, category.name)"
                                class="btn btn-primary"
                            >
                                Edit
                            </button>
                            <button
                                v-if="editingCategoryId !== category.id"
                                @click="toggleHideCategory(category.id, !category.is_hidden)"
                                :class="category.is_hidden ? 'btn btn-success' : 'btn btn-secondary'"
                            >
                                {{ category.is_hidden ? 'Unhide' : 'Hide' }}
                            </button>
                            <button
                                v-if="editingCategoryId !== category.id"
                                @click="deleteCategoryConfirm(category.id, category.name)"
                                class="btn btn-danger"
                            >
                                Delete
                            </button>
                        </td>
                    </tr>
                </tbody>
            </table>

            <!-- Show Hidden Categories Checkbox -->
            <div class="show-hidden-checkbox">
                <input
                    id="showHiddenCategories"
                    v-model="showHiddenCategories"
                    type="checkbox"
                />
                <label for="showHiddenCategories">Show Hidden Categories</label>
            </div>

            <!-- Add Category Form -->
            <div class="add-category-form">
                <h3>Add New Category</h3>
                <div class="form-grid">
                    <div class="form-group">
                        <label>Category Name</label>
                        <input
                            v-model="newCategory.name"
                            type="text"
                            placeholder="Category name (e.g., Groceries, Dining Out)"
                            class="form-input"
                            @keyup.enter="addCategory"
                        />
                    </div>
                    <div class="form-group button-group">
                        <button @click="addCategory" class="btn btn-primary">Add Category</button>
                    </div>
                </div>
            </div>
        </section>
    </div>
    `,

    data() {
        return {
            accounts: [],
            categories: [],
            newAccount: {
                name: '',
                account_type: 'bank'
            },
            newCategory: {
                name: ''
            },
            editingAccountId: null,
            editingAccountName: '',
            editingCategoryId: null,
            editingCategoryName: '',
            showHiddenAccounts: false,
            showHiddenCategories: false,
            hoveredCategoryId: null,
            confirmDialog: {
                show: false,
                message: '',
                onConfirm: null
            }
        };
    },

    computed: {
        bankAccounts() {
            return this.accounts.filter(a =>
                a.account_type === 'bank' && (!a.is_hidden || this.showHiddenAccounts)
            );
        },
        creditAccounts() {
            return this.accounts.filter(a =>
                a.account_type === 'credit' && (!a.is_hidden || this.showHiddenAccounts)
            );
        },
        visibleCategories() {
            return this.categories.filter(c =>
                !c.is_hidden || this.showHiddenCategories
            );
        }
    },

    methods: {
        async loadAccounts() {
            try {
                this.accounts = await this.api.getAccounts();
            } catch (error) {
                showToast('Error loading accounts', 'error');
            }
        },

        async loadCategories() {
            try {
                this.categories = await this.api.getCategories();
            } catch (error) {
                showToast('Error loading categories', 'error');
            }
        },

        async addAccount() {
            if (!this.newAccount.name.trim()) {
                showToast('Please enter an account name', 'info');
                return;
            }

            try {
                await this.api.createAccount(this.newAccount);
                this.newAccount = { name: '', account_type: 'bank' };
                await this.loadAccounts();
                showToast('Account created', 'success');
            } catch (error) {
                showToast('Error creating account', 'error');
            }
        },

        startEditAccount(accountId, name) {
            this.editingAccountId = accountId;
            this.editingAccountName = name;
        },

        async saveAccount(accountId) {
            if (!this.editingAccountName.trim()) {
                showToast('Please enter a name', 'info');
                return;
            }

            try {
                await this.api.updateAccount(accountId, { name: this.editingAccountName });
                await this.loadAccounts();
                this.editingAccountId = null;
                this.editingAccountName = '';
                showToast('Account updated', 'success');
            } catch (error) {
                showToast('Error updating account', 'error');
            }
        },

        async toggleHideAccount(accountId, hide) {
            try {
                await this.api.updateAccount(accountId, { is_hidden: hide });
                await this.loadAccounts();
            } catch (error) {
                showToast('Error updating account', 'error');
            }
        },

        deleteAccountConfirm(accountId, name) {
            this.confirmDialog.show = true;
            this.confirmDialog.message = `Are you sure you want to delete the account "${name}"?`;
            this.confirmDialog.onConfirm = () => this.deleteAccount(accountId);
        },

        async deleteAccount(accountId) {
            this.closeConfirmDialog();
            try {
                await this.api.deleteAccount(accountId);
                await this.loadAccounts();
                showToast('Account deleted', 'success');
            } catch (error) {
                showToast('Error deleting account', 'error');
            }
        },

        closeConfirmDialog() {
            this.confirmDialog.show = false;
            this.confirmDialog.message = '';
            this.confirmDialog.onConfirm = null;
        },

        cancelEdit() {
            this.editingAccountId = null;
            this.editingAccountName = '';
            this.editingCategoryId = null;
            this.editingCategoryName = '';
        },

        async addCategory() {
            if (!this.newCategory.name.trim()) {
                showToast('Please enter a category name', 'info');
                return;
            }

            try {
                await this.api.createCategory(this.newCategory);
                this.newCategory = { name: '' };
                await this.loadCategories();
                showToast('Category created', 'success');
            } catch (error) {
                showToast('Error creating category', 'error');
            }
        },

        startEditCategory(categoryId, name) {
            this.editingCategoryId = categoryId;
            this.editingCategoryName = name;
        },

        async saveCategory(categoryId) {
            if (!this.editingCategoryName.trim()) {
                showToast('Please enter a name', 'info');
                return;
            }

            try {
                await this.api.updateCategory(categoryId, { name: this.editingCategoryName });
                await this.loadCategories();
                this.editingCategoryId = null;
                this.editingCategoryName = '';
                showToast('Category updated', 'success');
            } catch (error) {
                showToast('Error updating category', 'error');
            }
        },

        async toggleHideCategory(categoryId, hide) {
            try {
                await this.api.updateCategory(categoryId, { is_hidden: hide });
                await this.loadCategories();
            } catch (error) {
                showToast('Error updating category', 'error');
            }
        },

        deleteCategoryConfirm(categoryId, name) {
            this.confirmDialog.show = true;
            this.confirmDialog.message = `Are you sure you want to delete the category "${name}"?`;
            this.confirmDialog.onConfirm = () => this.deleteCategory(categoryId);
        },

        async deleteCategory(categoryId) {
            this.closeConfirmDialog();
            try {
                await this.api.deleteCategory(categoryId);
                await this.loadCategories();
                showToast('Category deleted', 'success');
            } catch (error) {
                showToast('Error deleting category', 'error');
            }
        },

        formatDate(dateString) {
            const date = new Date(dateString);
            return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
        }
    },

    mounted() {
        this.loadAccounts();
        this.loadCategories();
    }
};
