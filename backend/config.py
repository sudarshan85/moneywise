"""Configuration management for MoneyWise application."""
import os
from pathlib import Path
from typing import List
from pydantic_settings import BaseSettings
import tomli
import tomli_w


class DatabaseSettings(BaseSettings):
    """Database configuration."""
    path: str = "./moneywise.db"


class BackupSettings(BaseSettings):
    """Backup configuration."""
    enabled: bool = True
    path: str = "./backups"
    auto_backup_on_start: bool = False


class UISettings(BaseSettings):
    """UI configuration."""
    currency_symbol: str = "$"
    date_format: str = "MM/DD/YYYY"


class CurrencySettings(BaseSettings):
    """Currency configuration."""
    base_currency: str = "USD"
    display_currency: str = "USD"
    ticker_currencies: List[str] = ["USD", "AED", "INR"]


class ExchangeRateSettings(BaseSettings):
    """Exchange rate API configuration."""
    api_provider: str = "exchangerate-api"
    api_url: str = "https://api.exchangerate-api.com/v4/latest/"
    cache_duration_hours: int = 24
    auto_update: bool = True


class ServerSettings(BaseSettings):
    """Server configuration."""
    host: str = "127.0.0.1"
    port: int = 8000
    auto_open_browser: bool = True


class Settings(BaseSettings):
    """Main application settings."""
    database: DatabaseSettings = DatabaseSettings()
    backup: BackupSettings = BackupSettings()
    ui: UISettings = UISettings()
    currency: CurrencySettings = CurrencySettings()
    exchange_rates: ExchangeRateSettings = ExchangeRateSettings()
    server: ServerSettings = ServerSettings()


def create_default_config(config_path: Path) -> None:
    """Create default config.toml file if it doesn't exist."""
    default_config = {
        "database": {
            "path": "./moneywise.db"
        },
        "backup": {
            "enabled": True,
            "path": "./backups",
            "auto_backup_on_start": False
        },
        "ui": {
            "currency_symbol": "$",
            "date_format": "MM/DD/YYYY"
        },
        "currency": {
            "base_currency": "USD",
            "display_currency": "USD",
            "ticker_currencies": ["USD", "AED", "INR"]
        },
        "exchange_rates": {
            "api_provider": "exchangerate-api",
            "api_url": "https://api.exchangerate-api.com/v4/latest/",
            "cache_duration_hours": 24,
            "auto_update": True
        },
        "server": {
            "host": "127.0.0.1",
            "port": 8000,
            "auto_open_browser": True
        }
    }

    with open(config_path, "wb") as f:
        tomli_w.dump(default_config, f)
    print(f"Created default configuration file at {config_path}")


def load_settings() -> Settings:
    """Load settings from config.toml or create defaults."""
    config_path = Path("config.toml")

    # Create default config if it doesn't exist
    if not config_path.exists():
        create_default_config(config_path)

    # Load configuration from TOML file
    with open(config_path, "rb") as f:
        config_data = tomli.load(f)

    # Create Settings object from loaded data
    return Settings(
        database=DatabaseSettings(**config_data.get("database", {})),
        backup=BackupSettings(**config_data.get("backup", {})),
        ui=UISettings(**config_data.get("ui", {})),
        currency=CurrencySettings(**config_data.get("currency", {})),
        exchange_rates=ExchangeRateSettings(**config_data.get("exchange_rates", {})),
        server=ServerSettings(**config_data.get("server", {}))
    )


# Global settings object
settings = load_settings()
