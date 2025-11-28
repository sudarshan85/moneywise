/**
 * Transactions Component
 * Displays, creates, edits, and deletes transactions
 * Includes currency selector and category picker
 */

import CurrencySelector from './CurrencySelector.js';

export default {
  name: "Transactions",
  components: {
    CurrencySelector
  },
  template: `
    <div class="transactions-page">
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

      <div class="transactions-header">
        <h1>Transactions</h1>
        <CurrencySelector @currency-changed="onCurrencyChanged" />
      </div>

      <div class="transactions-container">
        <!-- Category Picker Sidebar -->
        <div class="category-picker-sidebar">
          <h3>Categories</h3>
          <div class="category-list">
            <div
              class="category-item"
              :class="{ selected: selectedCategory === null }"
              @click="selectCategory(null)"
            >
              <span>All Categories</span>
            </div>
            <div
              v-for="category in categories"
              :key="category.id"
              class="category-item"
              :class="{ selected: selectedCategory?.id === category.id }"
              @click="selectCategory(category)"
            >
              <span class="category-name">{{ category.name }}</span>
              <span class="category-balance" :class="{ negative: getCategoryBalance(category.id) < 0 }">
                {{ formatAmount(getCategoryBalance(category.id)) }}
              </span>
            </div>
          </div>
        </div>

        <!-- Main Content Area -->
        <div class="transactions-main">
          <!-- Add Transaction Form -->
          <div class="add-transaction-form">
            <h3>Add Transaction</h3>
            <div class="form-grid">
              <div class="form-group">
                <label>Date</label>
                <input
                  v-model="newTransaction.date"
                  type="date"
                  class="form-input"
                  :max="today"
                >
              </div>
              <div class="form-group">
                <label>Outflow (Expense)</label>
                <input
                  v-model.number="newTransaction.outflow"
                  type="number"
                  class="form-input"
                  placeholder="0.00"
                  step="0.01"
                >
              </div>
              <div class="form-group">
                <label>Inflow (Income)</label>
                <input
                  v-model.number="newTransaction.inflow"
                  type="number"
                  class="form-input"
                  placeholder="0.00"
                  step="0.01"
                >
              </div>
              <div class="form-group">
                <label>Account</label>
                <select v-model.number="newTransaction.account_id" class="form-input">
                  <option value="">Select Account</option>
                  <option v-for="account in accounts" :key="account.id" :value="account.id">
                    {{ account.name }}
                  </option>
                </select>
              </div>
              <div class="form-group">
                <label>Category</label>
                <select v-model.number="newTransaction.category_id" class="form-input">
                  <option value="">No Category (Transfer)</option>
                  <option v-for="category in categories" :key="category.id" :value="category.id">
                    {{ category.name }}
                  </option>
                </select>
              </div>
              <div class="form-group">
                <label>Memo</label>
                <input
                  v-model="newTransaction.memo"
                  type="text"
                  class="form-input"
                  placeholder="Optional note"
                >
              </div>
              <div class="form-group button-group">
                <button @click="addTransaction" class="btn btn-primary">
                  Add Transaction
                </button>
              </div>
            </div>
          </div>

          <!-- Transactions Table -->
          <div class="transactions-table-container">
            <h3>Transaction History</h3>
            <table class="transactions-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Outflow</th>
                  <th>Inflow</th>
                  <th>Account</th>
                  <th>Category</th>
                  <th>Memo</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="filteredTransactions.length === 0" class="empty-row">
                  <td colspan="7">No transactions found</td>
                </tr>
                <tr
                  v-for="txn in filteredTransactions"
                  :key="txn.id"
                  class="transaction-row"
                  :class="{
                    'edit-mode': editingId === txn.id,
                    'pending-transaction': !txn.date,
                    'posted-transaction': txn.date
                  }"
                >
                  <!-- Display Mode -->
                  <template v-if="editingId !== txn.id">
                    <td class="date-cell" @click="startEdit(txn)" style="cursor: pointer;">
                      <span v-if="!txn.date" class="pending-indicator">{{ formatDate(txn.date) }}</span>
                      <span v-else>{{ formatDate(txn.date) }}</span>
                    </td>
                    <td class="outflow-cell" :class="{ negative: txn.outflow > 0 }" v-if="txn.outflow > 0">{{ formatAmount(txn.outflow) }}</td>
                    <td class="outflow-cell" v-else>-</td>
                    <td class="inflow-cell" :class="{ positive: txn.inflow > 0 }" v-if="txn.inflow > 0">{{ formatAmount(txn.inflow) }}</td>
                    <td class="inflow-cell" v-else>-</td>
                    <td class="account-cell">{{ txn.account_name }}</td>
                    <td class="category-cell">{{ txn.category_name || '-' }}</td>
                    <td class="memo-cell">{{ txn.memo || '-' }}</td>
                    <td class="actions-cell">
                      <button @click="startEdit(txn)" class="btn btn-small">Edit</button>
                      <button @click="confirmDelete(txn.id)" class="btn btn-small btn-danger">Delete</button>
                    </td>
                  </template>

                  <!-- Edit Mode -->
                  <template v-else>
                    <td class="date-cell">
                      <input v-model="editData.date" type="date" class="form-input-inline" :max="today">
                    </td>
                    <td class="outflow-cell">
                      <input v-model.number="editData.outflow" type="number" class="form-input-inline" step="0.01">
                    </td>
                    <td class="inflow-cell">
                      <input v-model.number="editData.inflow" type="number" class="form-input-inline" step="0.01">
                    </td>
                    <td class="account-cell">
                      <select v-model.number="editData.account_id" class="form-input-inline">
                        <option v-for="account in accounts" :key="account.id" :value="account.id">
                          {{ account.name }}
                        </option>
                      </select>
                    </td>
                    <td class="category-cell">
                      <select v-model.number="editData.category_id" class="form-input-inline">
                        <option value="">No Category</option>
                        <option v-for="category in categories" :key="category.id" :value="category.id">
                          {{ category.name }}
                        </option>
                      </select>
                    </td>
                    <td class="memo-cell">
                      <input v-model="editData.memo" type="text" class="form-input-inline" placeholder="Memo">
                    </td>
                    <td class="actions-cell">
                      <button @click="saveEdit" class="btn btn-small btn-success">Save</button>
                      <button @click="cancelEdit" class="btn btn-small">Cancel</button>
                    </td>
                  </template>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `,
  data() {
    return {
      transactions: [],
      accounts: [],
      categories: [],
      newTransaction: {
        date: null,
        inflow: 0,
        outflow: 0,
        account_id: null,
        category_id: null,
        memo: '',
        is_transfer: false,
        transfer_id: null
      },
      selectedCategory: null,
      editingId: null,
      editData: {},
      editIndex: -1,
      categoryBalances: {},
      confirmDialog: {
        show: false,
        message: '',
        onConfirm: null
      }
    };
  },
  computed: {
    today() {
      return new Date().toISOString().split('T')[0];
    },
    filteredTransactions() {
      if (!this.selectedCategory) {
        return this.transactions;
      }
      return this.transactions.filter(txn => txn.category_id === this.selectedCategory.id);
    }
  },
  async mounted() {
    await this.loadData();
  },
  methods: {
    async loadData() {
      try {
        this.accounts = await this.api.getAccounts();
        this.categories = await this.api.getCategories();
        await this.loadTransactions();
        await this.calculateCategoryBalances();
      } catch (error) {
        console.error('Error loading data:', error);
        this.showToast('Failed to load data', 'error');
      }
    },
    async loadTransactions() {
      try {
        this.transactions = await this.api.getTransactions();
      } catch (error) {
        console.error('Error loading transactions:', error);
        this.showToast('Failed to load transactions', 'error');
      }
    },
    async calculateCategoryBalances() {
      this.categoryBalances = {};
      for (const category of this.categories) {
        let balance = 0;
        for (const txn of this.transactions) {
          if (txn.category_id === category.id) {
            balance += parseFloat(txn.inflow) - parseFloat(txn.outflow);
          }
        }
        this.categoryBalances[category.id] = balance;
      }
    },
    getCategoryBalance(categoryId) {
      return this.categoryBalances[categoryId] || 0;
    },
    selectCategory(category) {
      this.selectedCategory = category;
    },
    async addTransaction() {
      // Validate input
      if (!this.newTransaction.account_id) {
        this.showToast('Please fill in account', 'error');
        return;
      }
      if (this.newTransaction.inflow === 0 && this.newTransaction.outflow === 0) {
        this.showToast('Please enter either an inflow or outflow amount', 'error');
        return;
      }

      try {
        const txnData = {
          ...this.newTransaction,
          inflow: parseFloat(this.newTransaction.inflow) || 0,
          outflow: parseFloat(this.newTransaction.outflow) || 0,
          category_id: this.newTransaction.category_id || null
        };

        await this.api.createTransaction(txnData);
        this.showToast('Transaction added successfully', 'success');

        // Reset form
        this.newTransaction = {
          date: null,
          inflow: 0,
          outflow: 0,
          account_id: null,
          category_id: null,
          memo: '',
          is_transfer: false,
          transfer_id: null
        };

        // Reload data
        await this.loadTransactions();
        await this.calculateCategoryBalances();

      } catch (error) {
        console.error('Error adding transaction:', error);
        this.showToast('Failed to add transaction', 'error');
      }
    },
    startEdit(txn) {
      this.editingId = txn.id;
      this.editData = { ...txn };
      // Ensure date is in YYYY-MM-DD format for date input
      if (this.editData.date && typeof this.editData.date === 'string') {
        this.editData.date = this.editData.date.split('T')[0];
      }
    },
    async saveEdit() {
      if (!this.editingId) return;

      try {
        const updates = {};

        // Only include fields that exist in editData (partial update)
        if (this.editData.date !== undefined) {
          updates.date = this.editData.date || null;
        }
        if (this.editData.inflow !== undefined) {
          updates.inflow = parseFloat(this.editData.inflow);
        }
        if (this.editData.outflow !== undefined) {
          updates.outflow = parseFloat(this.editData.outflow);
        }
        if (this.editData.account_id !== undefined) {
          updates.account_id = parseInt(this.editData.account_id);
        }
        if (this.editData.category_id !== undefined) {
          updates.category_id = this.editData.category_id ? parseInt(this.editData.category_id) : null;
        }
        if (this.editData.memo !== undefined) {
          updates.memo = this.editData.memo;
        }

        await this.api.updateTransaction(this.editingId, updates);
        this.showToast('Transaction updated successfully', 'success');

        this.editingId = null;
        this.editData = {};

        await this.loadTransactions();
        await this.calculateCategoryBalances();

      } catch (error) {
        console.error('Error updating transaction:', error);
        console.error('Update data was:', this.editData);
        if (error.response && error.response.data) {
          console.error('Full API error response:', JSON.stringify(error.response.data, null, 2));
          const details = error.response.data.detail;
          console.error('Details:', details);
          if (Array.isArray(details) && details.length > 0) {
            console.error('First detail:', details[0]);
            const msgs = details.map(d => {
              const loc = Array.isArray(d.loc) ? d.loc.join('.') : d.loc;
              return `${loc}: ${d.msg}`;
            }).join(' | ');
            this.showToast(`Failed to update: ${msgs}`, 'error');
          } else if (typeof details === 'string') {
            this.showToast(`Failed to update transaction: ${details}`, 'error');
          } else {
            this.showToast(`Failed to update transaction: ${JSON.stringify(details)}`, 'error');
          }
        } else {
          this.showToast('Failed to update transaction', 'error');
        }
      }
    },
    cancelEdit() {
      this.editingId = null;
      this.editData = {};
    },
    confirmDelete(txnId) {
      this.confirmDialog = {
        show: true,
        message: 'Are you sure you want to delete this transaction? This cannot be undone.',
        onConfirm: async () => {
          try {
            await this.api.deleteTransaction(txnId);
            this.showToast('Transaction deleted', 'success');
            await this.loadTransactions();
            await this.calculateCategoryBalances();
          } catch (error) {
            console.error('Error deleting transaction:', error);
            this.showToast('Failed to delete transaction', 'error');
          } finally {
            this.closeConfirmDialog();
          }
        }
      };
    },
    closeConfirmDialog() {
      this.confirmDialog.show = false;
      this.confirmDialog.message = '';
      this.confirmDialog.onConfirm = null;
    },
    onCurrencyChanged(currency) {
      // Store selected currency (can be used for display conversion later)
      localStorage.setItem('displayCurrency', currency);
    },
    formatAmount(amount) {
      const num = parseFloat(amount);
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
      }).format(num);
    },
    formatDate(dateStr) {
      if (!dateStr) {
        return 'Pending';
      }
      const date = new Date(dateStr + 'T00:00:00');
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    },
    showToast(message, type = 'info') {
      if (window.showToast) {
        window.showToast(message, type);
      }
    }
  }
};
