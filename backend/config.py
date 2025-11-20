"""
Configuration management for MoneyWise application.
Loads settings from config.toml or creates default if missing.
"""

import os
from pathlib import Path
from typing import Optional

import tomli
import tomli_w
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from config.toml"""

    # Database
    database_path: str = "./moneywise.db"

    # Backup
    backup_enabled: bool = True
    backup_path: str = "./backups"
    auto_backup_on_start: bool = False

    # UI
    currency_symbol: str = "$"
    date_format: str = "MM/DD/YYYY"

    # Currency
    base_currency: str = "USD"
    display_currency: str = "USD"
    ticker_currencies: list[str] = ["USD", "AED", "INR"]

    # Exchange Rates
    api_provider: str = "exchangerate-api"
    api_url: str = "https://api.exchangerate-api.com/v4/latest/"
    cache_duration_hours: int = 24
    auto_update: bool = True

    # Server
    host: str = "127.0.0.1"
    port: int = 8000
    auto_open_browser: bool = True

    class Config:
        case_sensitive = False


def load_config(config_path: str = "config.toml") -> Settings:
    """
    Load configuration from TOML file or create default if missing.

    Args:
        config_path: Path to config.toml file

    Returns:
        Settings object with loaded configuration
    """
    config_file = Path(config_path)

    if not config_file.exists():
        # Create default configuration
        default_config = {
            "database": {"path": "./moneywise.db"},
            "backup": {
                "enabled": True,
                "path": "./backups",
                "auto_backup_on_start": False,
            },
            "ui": {"currency_symbol": "$", "date_format": "MM/DD/YYYY"},
            "currency": {
                "base_currency": "USD",
                "display_currency": "USD",
                "ticker_currencies": ["USD", "AED", "INR"],
            },
            "exchange_rates": {
                "api_provider": "exchangerate-api",
                "api_url": "https://api.exchangerate-api.com/v4/latest/",
                "cache_duration_hours": 24,
                "auto_update": True,
            },
            "server": {
                "host": "127.0.0.1",
                "port": 8000,
                "auto_open_browser": True,
            },
        }

        with open(config_file, "wb") as f:
            tomli_w.dump(default_config, f)
        print(f"Created default config.toml")

    # Load from TOML file
    with open(config_file, "rb") as f:
        config_dict = tomli.load(f)

    # Flatten nested config for Settings
    flat_config = {
        "database_path": config_dict.get("database", {}).get("path", "./moneywise.db"),
        "backup_enabled": config_dict.get("backup", {}).get("enabled", True),
        "backup_path": config_dict.get("backup", {}).get("path", "./backups"),
        "auto_backup_on_start": config_dict.get("backup", {}).get(
            "auto_backup_on_start", False
        ),
        "currency_symbol": config_dict.get("ui", {}).get("currency_symbol", "$"),
        "date_format": config_dict.get("ui", {}).get("date_format", "MM/DD/YYYY"),
        "base_currency": config_dict.get("currency", {}).get("base_currency", "USD"),
        "display_currency": config_dict.get("currency", {}).get(
            "display_currency", "USD"
        ),
        "ticker_currencies": config_dict.get("currency", {}).get(
            "ticker_currencies", ["USD", "AED", "INR"]
        ),
        "api_provider": config_dict.get("exchange_rates", {}).get(
            "api_provider", "exchangerate-api"
        ),
        "api_url": config_dict.get("exchange_rates", {}).get(
            "api_url", "https://api.exchangerate-api.com/v4/latest/"
        ),
        "cache_duration_hours": config_dict.get("exchange_rates", {}).get(
            "cache_duration_hours", 24
        ),
        "auto_update": config_dict.get("exchange_rates", {}).get("auto_update", True),
        "host": config_dict.get("server", {}).get("host", "127.0.0.1"),
        "port": config_dict.get("server", {}).get("port", 8000),
        "auto_open_browser": config_dict.get("server", {}).get(
            "auto_open_browser", True
        ),
    }

    return Settings(**flat_config)


# Global settings instance
settings: Optional[Settings] = None


def get_settings() -> Settings:
    """Get global settings instance, loading if necessary."""
    global settings
    if settings is None:
        settings = load_config()
    return settings
