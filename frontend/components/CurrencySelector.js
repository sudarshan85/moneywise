/**
 * CurrencySelector Component - FEATURE DEFERRED
 * Displays currency dropdown and exchange rate ticker
 * Handles currency selection and rate refreshing
 * Commented out for future implementation
 */

/*
export default {
  name: "CurrencySelector",
  template: `
    <div class="currency-selector">
      <div class="currency-controls">
        <label for="currency-dropdown" class="currency-label">Display Currency:</label>
        <select id="currency-dropdown" v-model="selectedCurrency" @change="onCurrencyChange" class="currency-dropdown">
          <option v-for="curr in availableCurrencies" :key="curr" :value="curr">
            {{ curr }}
          </option>
        </select>
        <button @click="refreshRates" class="btn-refresh" :disabled="isLoadingRates">
          <span v-if="!isLoadingRates">🔄 Refresh Rates</span>
          <span v-else>Loading...</span>
        </button>
      </div>

      <div class="exchange-ticker">
        <h3 class="ticker-title">Exchange Rates</h3>
        <div class="ticker-rates">
          <div v-for="(rate, currency) in rates" :key="currency" class="ticker-item">
            <span class="ticker-currency">{{ currency }}</span>
            <span class="ticker-rate">{{ formatRate(rate) }}</span>
          </div>
        </div>
        <p v-if="lastUpdated" class="ticker-updated">Updated: {{ lastUpdated }}</p>
      </div>
    </div>
  `,
  data() {
    return {
      selectedCurrency: "USD",
      availableCurrencies: ["USD", "AED", "INR"],
      rates: {
        "USD": 1.0,
        "AED": 1.0,
        "INR": 1.0
      },
      isLoadingRates: false,
      lastUpdated: null,
      refreshInterval: null
    };
  },
  async mounted() {
    // Load saved currency from localStorage
    const saved = localStorage.getItem("selectedCurrency");
    if (saved) {
      this.selectedCurrency = saved;
    }

    // Load initial rates (but don't fail if API not working)
    try {
      await this.loadRates();
    } catch (error) {
      console.warn('Could not load exchange rates on mount:', error);
    }

    // Auto-refresh every 5 minutes
    this.refreshInterval = setInterval(() => {
      this.loadRates().catch(err => {
        console.warn('Could not refresh exchange rates:', err);
      });
    }, 5 * 60 * 1000);
  },
  beforeUnmount() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  },
  methods: {
    async loadRates() {
      try {
        this.isLoadingRates = true;
        const response = await this.api.getExchangeRates();

        // Update rates from response
        this.rates = response.rates || this.rates;
        this.lastUpdated = new Date().toLocaleTimeString();

      } catch (error) {
        console.error("Error loading exchange rates:", error);
        // Keep existing rates on error
      } finally {
        this.isLoadingRates = false;
      }
    },
    async refreshRates() {
      try {
        this.isLoadingRates = true;
        await this.api.refreshExchangeRates();
        await this.loadRates();
        this.showToast("Exchange rates refreshed", "success");
      } catch (error) {
        console.error("Error refreshing rates:", error);
        this.showToast("Failed to refresh exchange rates", "error");
      } finally {
        this.isLoadingRates = false;
      }
    },
    onCurrencyChange() {
      // Save selection to localStorage
      localStorage.setItem("selectedCurrency", this.selectedCurrency);

      // Emit event to parent component
      this.$emit("currency-changed", this.selectedCurrency);
    },
    formatRate(rate) {
      return parseFloat(rate).toFixed(4);
    },
    showToast(message, type = "info") {
      if (window.showToast) {
        window.showToast(message, type);
      }
    }
  },
  computed: {
    api() {
      return window.api;
    }
  }
};
*/
