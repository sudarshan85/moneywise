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
                <label>Amount</label>
                <input
                  v-model.number="newTransaction.amount"
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
                  <th>Amount</th>
                  <th>Account</th>
                  <th>Category</th>
                  <th>Memo</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="filteredTransactions.length === 0" class="empty-row">
                  <td colspan="6">No transactions found</td>
                </tr>
                <tr
                  v-for="(txn, index) in filteredTransactions"
                  :key="txn.id"
                  class="transaction-row"
                  :class="{ 'edit-mode': editingId === txn.id }"
                >
                  <!-- Display Mode -->
                  <template v-if="editingId !== txn.id">
                    <td class="date-cell">{{ formatDate(txn.date) }}</td>
                    <td class="amount-cell" :class="{ negative: txn.amount < 0, positive: txn.amount > 0 }">
                      {{ formatAmount(txn.amount) }}
                    </td>
                    <td class="account-cell">{{ txn.account_name }}</td>
                    <td class="category-cell">{{ txn.category_name || '-' }}</td>
                    <td class="memo-cell">{{ txn.memo || '-' }}</td>
                    <td class="actions-cell">
                      <button @click="startEdit(index)" class="btn btn-small">Edit</button>
                      <button @click="deleteTransaction(txn.id, index)" class="btn btn-small btn-danger">Delete</button>
                    </td>
                  </template>

                  <!-- Edit Mode -->
                  <template v-else>
                    <td class="date-cell">
                      <input v-model="editData.date" type="date" class="form-input-inline" :max="today">
                    </td>
                    <td class="amount-cell">
                      <input v-model.number="editData.amount" type="number" class="form-input-inline" step="0.01">
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
                      <button @click="saveEdit(index)" class="btn btn-small btn-success">Save</button>
                      <button @click="cancelEdit" class="btn btn-small">Cancel</button>
                    </td>
                  </template>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Confirmation Modal -->
      <ConfirmModal
        v-if="showConfirmModal"
        :title="confirmModal.title"
        :message="confirmModal.message"
        @confirm="confirmModal.callback"
        @cancel="showConfirmModal = false"
      />
    </div>
  `,
  data() {
    return {
      transactions: [],
      accounts: [],
      categories: [],
      newTransaction: {
        date: new Date().toISOString().split('T')[0],
        amount: null,
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
      showConfirmModal: false,
      confirmModal: {
        title: "",
        message: "",
        callback: null
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
    },
    api() {
      return this.$root.$options.globalProperties.api || window.api;
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
            balance += parseFloat(txn.amount);
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
      if (!this.newTransaction.date || this.newTransaction.amount === null || !this.newTransaction.account_id) {
        this.showToast('Please fill in date, amount, and account', 'error');
        return;
      }

      try {
        const txnData = {
          ...this.newTransaction,
          amount: parseFloat(this.newTransaction.amount),
          category_id: this.newTransaction.category_id || null
        };

        await this.api.createTransaction(txnData);
        this.showToast('Transaction added successfully', 'success');

        // Reset form
        this.newTransaction = {
          date: new Date().toISOString().split('T')[0],
          amount: null,
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
    startEdit(index) {
      this.editingId = this.transactions[index].id;
      this.editIndex = index;
      this.editData = { ...this.transactions[index] };
    },
    async saveEdit(index) {
      if (!this.editingId) return;

      try {
        const updates = {
          date: this.editData.date,
          amount: parseFloat(this.editData.amount),
          account_id: this.editData.account_id,
          category_id: this.editData.category_id || null,
          memo: this.editData.memo
        };

        await this.api.updateTransaction(this.editingId, updates);
        this.showToast('Transaction updated successfully', 'success');

        this.editingId = null;
        this.editIndex = -1;
        this.editData = {};

        await this.loadTransactions();
        await this.calculateCategoryBalances();

      } catch (error) {
        console.error('Error updating transaction:', error);
        this.showToast('Failed to update transaction', 'error');
      }
    },
    cancelEdit() {
      this.editingId = null;
      this.editIndex = -1;
      this.editData = {};
    },
    deleteTransaction(txnId, index) {
      this.confirmModal = {
        title: "Delete Transaction",
        message: "Are you sure you want to delete this transaction? This cannot be undone.",
        callback: async () => {
          try {
            await this.api.deleteTransaction(txnId);
            this.showToast('Transaction deleted', 'success');
            await this.loadTransactions();
            await this.calculateCategoryBalances();
          } catch (error) {
            console.error('Error deleting transaction:', error);
            this.showToast('Failed to delete transaction', 'error');
          } finally {
            this.showConfirmModal = false;
          }
        }
      };
      this.showConfirmModal = true;
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
