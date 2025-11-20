/**
 * Sidebar Navigation Component
 * Displays MoneyWise branding and navigation links with collapsible reports section
 */

const Sidebar = {
    template: `
        <aside class="sidebar">
            <div class="sidebar-header">
                <div class="logo-container">
                    <div class="logo-icon">💰</div>
                    <h1 class="logo-text">MoneyWise</h1>
                </div>
            </div>

            <nav class="sidebar-nav">
                <!-- Main Navigation -->
                <div class="nav-section">
                    <router-link to="/" class="nav-link" :class="{ active: isActive('/') }">
                        <span class="nav-icon">📊</span>
                        <span class="nav-label">Dashboard</span>
                    </router-link>
                    <router-link to="/transactions" class="nav-link" :class="{ active: isActive('/transactions') }">
                        <span class="nav-icon">💳</span>
                        <span class="nav-label">Transactions</span>
                    </router-link>
                    <router-link to="/category-transfers" class="nav-link" :class="{ active: isActive('/category-transfers') }">
                        <span class="nav-icon">🎯</span>
                        <span class="nav-label">Category Transfers</span>
                    </router-link>
                    <router-link to="/configuration" class="nav-link" :class="{ active: isActive('/configuration') }">
                        <span class="nav-icon">⚙️</span>
                        <span class="nav-label">Configuration</span>
                    </router-link>
                </div>

                <!-- Reports Section (Collapsible) -->
                <div class="nav-section">
                    <button class="nav-section-header" @click="toggleReports" :class="{ active: showReports }">
                        <span class="nav-icon">📈</span>
                        <span class="nav-label">Reports</span>
                        <span class="collapse-icon" :class="{ rotated: showReports }">›</span>
                    </button>
                    <div class="nav-subsection" v-show="showReports">
                        <router-link to="/reports/accounts" class="nav-link sub-link" :class="{ active: isActive('/reports/accounts') }">
                            <span class="nav-icon">🏦</span>
                            <span class="nav-label">Account Reports</span>
                        </router-link>
                        <router-link to="/reports/balances" class="nav-link sub-link" :class="{ active: isActive('/reports/balances') }">
                            <span class="nav-icon">💵</span>
                            <span class="nav-label">Balances</span>
                        </router-link>
                        <router-link to="/reports/spending" class="nav-link sub-link" :class="{ active: isActive('/reports/spending') }">
                            <span class="nav-icon">📉</span>
                            <span class="nav-label">Spending</span>
                        </router-link>
                        <router-link to="/reports/categories" class="nav-link sub-link" :class="{ active: isActive('/reports/categories') }">
                            <span class="nav-icon">🏷️</span>
                            <span class="nav-label">Categories</span>
                        </router-link>
                        <router-link to="/reports/trends" class="nav-link sub-link" :class="{ active: isActive('/reports/trends') }">
                            <span class="nav-icon">📊</span>
                            <span class="nav-label">Trends</span>
                        </router-link>
                    </div>
                </div>
            </nav>

            <div class="sidebar-footer">
                <p class="version-text">v0.1.0-alpha</p>
            </div>
        </aside>
    `,

    data() {
        return {
            showReports: false,
        };
    },

    methods: {
        toggleReports() {
            this.showReports = !this.showReports;
        },

        isActive(path) {
            return this.$route.path === path;
        },
    },
};

export default Sidebar;
