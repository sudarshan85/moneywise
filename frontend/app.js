/**
 * MoneyWise Vue.js Root Application
 * Initializes Vue app with router and global components
 */

import router from './router.js';
import Sidebar from './components/Sidebar.js';

const { createApp } = window.Vue;

const app = createApp({
    template: `
        <div class="app-container">
            <Sidebar />
            <main class="main-content">
                <router-view />
            </main>
        </div>
    `,
    components: {
        Sidebar,
    },
});

// Register router
app.use(router);

// Mount app to #app div
app.mount('#app');
