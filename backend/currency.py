"""
Currency exchange rate service for MoneyWise.
Fetches and caches exchange rates from exchangerate-api.com
"""

from datetime import datetime, timedelta
from decimal import Decimal
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.models import ExchangeRate
from backend.config import settings


class CurrencyService:
    """Service for managing currency exchange rates."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.client = httpx.AsyncClient()
        self.api_url = settings.exchange_rates.api_url
        self.cache_duration = timedelta(hours=settings.exchange_rates.cache_duration_hours)

    async def get_rate(self, base: str, target: str) -> Decimal:
        """
        Get exchange rate from base to target currency.
        Checks database cache first, fetches from API if needed.

        Args:
            base: Base currency code (e.g., "USD")
            target: Target currency code (e.g., "EUR")

        Returns:
            Exchange rate as Decimal
        """
        # Normalize currency codes to uppercase
        base = base.upper()
        target = target.upper()

        # Return 1.0 if converting to same currency
        if base == target:
            return Decimal("1.0")

        # Check if we have a cached rate
        stmt = select(ExchangeRate).where(
            ExchangeRate.base_currency == base,
            ExchangeRate.target_currency == target
        )
        result = await self.session.execute(stmt)
        cached_rate = result.scalar_one_or_none()

        # If cache exists and is fresh, return it
        if cached_rate:
            age = datetime.utcnow() - cached_rate.fetched_at
            if age < self.cache_duration:
                return cached_rate.rate

        # Fetch fresh rate from API
        try:
            rate = await self._fetch_rate_from_api(base, target)

            # Update database cache
            if cached_rate:
                cached_rate.rate = rate
                cached_rate.fetched_at = datetime.utcnow()
            else:
                cached_rate = ExchangeRate(
                    base_currency=base,
                    target_currency=target,
                    rate=rate,
                    fetched_at=datetime.utcnow()
                )
                self.session.add(cached_rate)

            await self.session.commit()
            return rate

        except Exception as e:
            print(f"Error fetching rate {base}/{target}: {e}")
            # Return cached rate even if stale, or 1.0 as fallback
            if cached_rate:
                return cached_rate.rate
            return Decimal("1.0")

    async def _fetch_rate_from_api(self, base: str, target: str) -> Decimal:
        """
        Fetch exchange rate directly from exchangerate-api.com

        Args:
            base: Base currency code
            target: Target currency code

        Returns:
            Exchange rate as Decimal

        Raises:
            Exception: If API call fails
        """
        url = f"{self.api_url}{base}"

        try:
            response = await self.client.get(url, timeout=10)
            response.raise_for_status()
            data = response.json()

            # API returns rates under "rates" key
            rates = data.get("rates", {})
            rate = rates.get(target)

            if rate is None:
                raise ValueError(f"No rate found for {target}")

            return Decimal(str(rate))

        except httpx.RequestError as e:
            raise Exception(f"API request failed: {e}")
        except (KeyError, ValueError) as e:
            raise Exception(f"Invalid API response: {e}")

    async def convert_amount(self, amount: Decimal, from_currency: str, to_currency: str) -> Decimal:
        """
        Convert amount from one currency to another.

        Args:
            amount: Amount to convert
            from_currency: Source currency code
            to_currency: Target currency code

        Returns:
            Converted amount as Decimal
        """
        if from_currency.upper() == to_currency.upper():
            return amount

        rate = await self.get_rate(from_currency, to_currency)
        return amount * rate

    async def get_ticker_rates(self) -> dict:
        """
        Get exchange rates for all configured ticker currencies.

        Returns:
            Dictionary with currency codes as keys and rates as values
        """
        base = settings.currency.base_currency
        ticker_currencies = settings.currency.ticker_currencies

        rates = {}
        for target in ticker_currencies:
            try:
                rate = await self.get_rate(base, target)
                rates[target] = float(rate)
            except Exception as e:
                print(f"Error getting rate for {target}: {e}")
                rates[target] = 1.0

        return rates

    async def refresh_all_rates(self) -> bool:
        """
        Force refresh of all configured ticker currency rates.

        Returns:
            True if successful, False otherwise
        """
        try:
            base = settings.currency.base_currency
            ticker_currencies = settings.currency.ticker_currencies

            for target in ticker_currencies:
                if base.upper() != target.upper():
                    # Delete stale cache entry to force fresh fetch
                    stmt = select(ExchangeRate).where(
                        ExchangeRate.base_currency == base.upper(),
                        ExchangeRate.target_currency == target.upper()
                    )
                    result = await self.session.execute(stmt)
                    cached = result.scalar_one_or_none()
                    if cached:
                        await self.session.delete(cached)

                    # Fetch fresh rate
                    await self.get_rate(base, target)

            await self.session.commit()
            return True

        except Exception as e:
            print(f"Error refreshing rates: {e}")
            return False

    async def close(self):
        """Close the HTTP client connection."""
        await self.client.aclose()
