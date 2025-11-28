"""
Pydantic schemas for API request/response validation.
"""

from pydantic import BaseModel, field_validator, ConfigDict
from typing import Optional, List, Union
from datetime import datetime, date
from enum import Enum


class AccountType(str, Enum):
    """Account type enumeration."""
    BANK = "bank"
    CREDIT = "credit"


class CategoryRenameInfo(BaseModel):
    """Information about a single category rename."""
    old_name: str
    renamed_at: datetime


class AccountCreate(BaseModel):
    """Schema for creating a new account."""
    name: str
    account_type: AccountType
    description: Optional[str] = None


class AccountUpdate(BaseModel):
    """Schema for updating an account."""
    name: Optional[str] = None
    account_type: Optional[AccountType] = None
    description: Optional[str] = None
    is_hidden: Optional[bool] = None


class AccountResponse(BaseModel):
    """Schema for account API responses."""
    id: int
    name: str
    account_type: AccountType
    description: Optional[str]
    is_hidden: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CategoryCreate(BaseModel):
    """Schema for creating a new category."""
    name: str


class CategoryUpdate(BaseModel):
    """Schema for updating a category."""
    name: Optional[str] = None
    is_hidden: Optional[bool] = None


class CategoryResponse(BaseModel):
    """Schema for category API responses."""
    id: int
    name: str
    is_hidden: bool
    created_at: datetime
    updated_at: datetime
    renamed_history: List[CategoryRenameInfo] = []

    class Config:
        from_attributes = True


class TransactionCreate(BaseModel):
    """Schema for creating a new transaction."""
    model_config = ConfigDict(from_attributes=True)

    date: Union[date, None] = None
    inflow: float = 0
    outflow: float = 0
    account_id: int
    category_id: Optional[int] = None
    memo: Optional[str] = None
    is_transfer: bool = False
    transfer_id: Optional[str] = None

    @field_validator('date', mode='before')
    @classmethod
    def parse_date(cls, v):
        """Parse date string or None."""
        if v is None or v == '':
            return None
        if isinstance(v, str):
            return date.fromisoformat(v)
        return v


class TransactionUpdate(BaseModel):
    """Schema for updating a transaction."""
    model_config = ConfigDict(from_attributes=True)

    date: Union[date, None] = None
    inflow: Optional[float] = None
    outflow: Optional[float] = None
    account_id: Optional[int] = None
    category_id: Optional[int] = None
    memo: Optional[str] = None
    is_transfer: Optional[bool] = None
    transfer_id: Optional[str] = None

    @field_validator('date', mode='before')
    @classmethod
    def parse_date(cls, v):
        """Parse date string or None."""
        if v is None or v == '':
            return None
        if isinstance(v, str):
            return date.fromisoformat(v)
        return v


class TransactionResponse(BaseModel):
    """Schema for transaction API responses."""
    id: int
    date: Union[date, None]
    inflow: float
    outflow: float
    account_id: int
    account_name: str
    category_id: Optional[int]
    category_name: Optional[str]
    memo: Optional[str]
    is_transfer: bool
    transfer_id: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ExchangeRateResponse(BaseModel):
    """Schema for exchange rate API responses."""
    base_currency: str
    target_currency: str
    rate: float
    fetched_at: datetime

    class Config:
        from_attributes = True


class ExchangeRatesResponse(BaseModel):
    """Schema for multiple exchange rates response."""
    base_currency: str
    rates: dict
    fetched_at: datetime

    class Config:
        from_attributes = True


class CurrencyConvertResponse(BaseModel):
    """Schema for currency conversion response."""
    amount: float
    from_currency: str
    to_currency: str
    rate: float
    converted_amount: float

    class Config:
        from_attributes = True
