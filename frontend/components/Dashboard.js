/**
 * Dashboard Component - Budget overview with account/category balances
 */

import { getDashboardData } from '../api.js';

export default {
    name: "Dashboard",
    template: `
        <div class="dashboard-page">
            <!-- Error Message -->
            <div v-if="error" class="alert alert-error">
                <strong>Error:</strong> {{ error }}
            </div>

            <!-- Loading State -->
            <div v-if="loading" class="loading-container">
                <p>Loading dashboard data...</p>
            </div>

            <!-- Dashboard Content -->
            <div v-else class="dashboard-container">
                <h1 class="page-title">Dashboard</h1>

                <!-- Stat Boxes -->
                <div class="stat-boxes-grid">
                    <div class="stat-box stat-box-available">
                        <div class="stat-box-value">{{ formatAmount(dashboardData.available_to_budget) }}</div>
                        <div class="stat-box-label">Available to Budget</div>
                    </div>
                    <div class="stat-box stat-box-spent">
                        <div class="stat-box-value">{{ formatAmount(dashboardData.spent_this_month) }}</div>
                        <div class="stat-box-label">Spent This Month</div>
                    </div>
                    <div class="stat-box stat-box-budgeted">
                        <div class="stat-box-value">{{ formatAmount(dashboardData.budgeted_this_month) }}</div>
                        <div class="stat-box-label">Budgeted This Month</div>
                    </div>
                    <div class="stat-box stat-box-pending">
                        <div class="stat-box-value">{{ dashboardData.pending_count }}</div>
                        <div class="stat-box-label">Pending Transactions</div>
                    </div>
                </div>

                <!-- Main Content: Accounts Sidebar + Categories Table -->
                <div class="dashboard-main-content">
                    <!-- Accounts Sidebar -->
                    <div class="dashboard-accounts-sidebar">
                        <h3>Accounts</h3>
                        <div class="accounts-list">
                            <div v-if="dashboardData.accounts.length === 0" class="empty-message">
                                No accounts
                            </div>
                            <div v-for="account in dashboardData.accounts" :key="account.id" class="account-item">
                                <div class="account-name">{{ account.name }}</div>
                                <div :class="['account-balance', { negative: account.balance < 0 }]">
                                    {{ formatAmount(account.balance) }}
                                </div>
                                <div v-if="account.last_transaction_date" class="account-last-date">
                                    Last: {{ formatDate(account.last_transaction_date) }}
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Categories Table -->
                    <div class="dashboard-categories-section">
                        <h3>Categories</h3>
                        <div v-if="dashboardData.categories.length === 0" class="empty-message">
                            No categories
                        </div>
                        <table v-else class="dashboard-categories-table">
                            <thead>
                                <tr>
                                    <th class="col-name">Category</th>
                                    <th class="col-available">Available</th>
                                    <th class="col-activity">Activity</th>
                                    <th class="col-budgeted">Budgeted</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="category in dashboardData.categories" :key="category.id" class="category-row">
                                    <td class="col-name">{{ category.name }}</td>
                                    <td :class="['col-available', { negative: category.balance < 0, positive: category.balance > 0 }]">
                                        {{ formatAmount(category.balance) }}
                                    </td>
                                    <td :class="['col-activity', { negative: category.current_month_spending > 0 }]">
                                        {{ formatAmount(-category.current_month_spending) }}
                                    </td>
                                    <td class="col-budgeted">
                                        {{ formatAmount(category.monthly_budget) }}
                                    </td>
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
            dashboardData: {
                available_to_budget: 0,
                spent_this_month: 0,
                budgeted_this_month: 0,
                pending_count: 0,
                accounts: [],
                categories: [],
                current_date: new Date().toISOString().split('T')[0]
            },
            loading: true,
            error: null
        };
    },
    async created() {
        try {
            this.loading = true;
            this.error = null;
            const data = await getDashboardData();
            this.dashboardData = data;
        } catch (err) {
            this.error = err.message || 'Failed to load dashboard data';
            console.error('Dashboard error:', err);
        } finally {
            this.loading = false;
        }
    },
    methods: {
        formatAmount(value) {
            if (typeof value !== 'number') {
                value = parseFloat(value) || 0;
            }
            return new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD'
            }).format(value);
        },
        formatDate(dateStr) {
            if (!dateStr) return 'N/A';
            try {
                const date = new Date(dateStr);
                return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            } catch {
                return dateStr;
            }
        }
    }
};
