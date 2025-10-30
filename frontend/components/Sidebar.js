/**
 * Sidebar navigation component
 */

const Sidebar = {
    data() {
        return {
            reportsExpanded: false
        };
    },
    methods: {
        toggleReports() {
            this.reportsExpanded = !this.reportsExpanded;
        }
    },
    template: `
        <aside class="sidebar">
            <div class="sidebar-header">
                <h1 class="app-title">MoneyWise</h1>
                <p class="app-subtitle">Budget Tracking</p>
            </div>

            <nav class="sidebar-nav">
                <router-link to="/" class="nav-item">
                    <span class="nav-icon">📊</span>
                    <span class="nav-text">Dashboard</span>
                </router-link>

                <router-link to="/transactions" class="nav-item">
                    <span class="nav-icon">💳</span>
                    <span class="nav-text">Transactions</span>
                </router-link>

                <router-link to="/category-transfers" class="nav-item">
                    <span class="nav-icon">↔️</span>
                    <span class="nav-text">Category Transfers</span>
                </router-link>

                <router-link to="/configuration" class="nav-item">
                    <span class="nav-icon">⚙️</span>
                    <span class="nav-text">Configuration</span>
                </router-link>

                <div class="nav-section">
                    <button @click="toggleReports" class="nav-section-header">
                        <span class="nav-icon">📈</span>
                        <span class="nav-text">Reports</span>
                        <span class="nav-arrow" :class="{ 'expanded': reportsExpanded }">▼</span>
                    </button>

                    <div v-show="reportsExpanded" class="nav-section-content">
                        <router-link to="/reports/accounts" class="nav-item nav-subitem">
                            <span class="nav-text">Account Reports</span>
                        </router-link>

                        <router-link to="/reports/balances" class="nav-item nav-subitem">
                            <span class="nav-text">Balances</span>
                        </router-link>

                        <router-link to="/reports/spending" class="nav-item nav-subitem">
                            <span class="nav-text">Spending Reports</span>
                        </router-link>

                        <router-link to="/reports/categories" class="nav-item nav-subitem">
                            <span class="nav-text">Category Reports</span>
                        </router-link>

                        <router-link to="/reports/trends" class="nav-item nav-subitem">
                            <span class="nav-text">Trend Reports</span>
                        </router-link>
                    </div>
                </div>
            </nav>

            <div class="sidebar-footer">
                <p class="version">v0.1.0-alpha</p>
            </div>
        </aside>
    `
};

export { Sidebar };
