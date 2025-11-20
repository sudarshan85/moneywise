"""
Pydantic schemas for API request/response validation.
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
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
    name: str = Field(..., min_length=1, description="Account name")
    account_type: AccountType = Field(..., description="Account type: bank or credit")


class AccountUpdate(BaseModel):
    """Schema for updating an account."""
    name: Optional[str] = Field(None, min_length=1, description="Account name")
    account_type: Optional[AccountType] = Field(None, description="Account type")
    is_hidden: Optional[bool] = Field(None, description="Hide account from view")


class AccountResponse(BaseModel):
    """Schema for account API responses."""
    id: int
    name: str
    account_type: AccountType
    is_hidden: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CategoryCreate(BaseModel):
    """Schema for creating a new category."""
    name: str = Field(..., min_length=1, description="Category name")


class CategoryUpdate(BaseModel):
    """Schema for updating a category."""
    name: Optional[str] = Field(None, min_length=1, description="Category name")
    is_hidden: Optional[bool] = Field(None, description="Hide category from view")


class CategoryResponse(BaseModel):
    """Schema for category API responses."""
    id: int
    name: str
    is_hidden: bool
    created_at: datetime
    updated_at: datetime
    renamed_history: List[CategoryRenameInfo] = Field(default_factory=list, description="Rename history")

    class Config:
        from_attributes = True
