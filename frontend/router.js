/**
 * Vue Router 4 configuration for MoneyWise
 * Defines routes for all pages and reports
 */

const { createRouter, createWebHistory } = window.VueRouter;

// Dynamically import components
const Dashboard = () => import('./components/Dashboard.js');
const Transactions = () => import('./components/Transactions.js');
const CategoryTransfers = () => import('./components/CategoryTransfers.js');
const Configuration = () => import('./components/Configuration.js');

// Report components
const AccountReports = () => import('./components/reports/AccountReports.js');
const Balances = () => import('./components/reports/Balances.js');
const SpendingReports = () => import('./components/reports/SpendingReports.js');
const CategoryReports = () => import('./components/reports/CategoryReports.js');
const TrendReports = () => import('./components/reports/TrendReports.js');

const routes = [
    {
        path: '/',
        name: 'Dashboard',
        component: Dashboard,
    },
    {
        path: '/transactions',
        name: 'Transactions',
        component: Transactions,
    },
    {
        path: '/category-transfers',
        name: 'CategoryTransfers',
        component: CategoryTransfers,
    },
    {
        path: '/configuration',
        name: 'Configuration',
        component: Configuration,
    },
    {
        path: '/reports/accounts',
        name: 'AccountReports',
        component: AccountReports,
    },
    {
        path: '/reports/balances',
        name: 'Balances',
        component: Balances,
    },
    {
        path: '/reports/spending',
        name: 'SpendingReports',
        component: SpendingReports,
    },
    {
        path: '/reports/categories',
        name: 'CategoryReports',
        component: CategoryReports,
    },
    {
        path: '/reports/trends',
        name: 'TrendReports',
        component: TrendReports,
    },
];

const router = createRouter({
    history: createWebHistory(),
    routes,
});

export default router;
