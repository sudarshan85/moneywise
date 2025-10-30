/**
 * Vue Router configuration for MoneyWise application
 */

const { createRouter, createWebHistory } = VueRouter;

// Import components
import { Dashboard } from '/frontend/components/Dashboard.js';
import { Transactions } from '/frontend/components/Transactions.js';
import { CategoryTransfers } from '/frontend/components/CategoryTransfers.js';
import { Configuration } from '/frontend/components/Configuration.js';
import { AccountReports } from '/frontend/components/reports/AccountReports.js';
import { Balances } from '/frontend/components/reports/Balances.js';
import { SpendingReports } from '/frontend/components/reports/SpendingReports.js';
import { CategoryReports } from '/frontend/components/reports/CategoryReports.js';
import { TrendReports } from '/frontend/components/reports/TrendReports.js';

// Define routes
const routes = [
    {
        path: '/',
        name: 'Dashboard',
        component: Dashboard
    },
    {
        path: '/transactions',
        name: 'Transactions',
        component: Transactions
    },
    {
        path: '/category-transfers',
        name: 'CategoryTransfers',
        component: CategoryTransfers
    },
    {
        path: '/configuration',
        name: 'Configuration',
        component: Configuration
    },
    {
        path: '/reports/accounts',
        name: 'AccountReports',
        component: AccountReports
    },
    {
        path: '/reports/balances',
        name: 'Balances',
        component: Balances
    },
    {
        path: '/reports/spending',
        name: 'SpendingReports',
        component: SpendingReports
    },
    {
        path: '/reports/categories',
        name: 'CategoryReports',
        component: CategoryReports
    },
    {
        path: '/reports/trends',
        name: 'TrendReports',
        component: TrendReports
    }
];

// Create router instance
const router = createRouter({
    history: createWebHistory(),
    routes
});

export { router };
