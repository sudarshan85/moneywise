"""
SQLAlchemy ORM models for MoneyWise database schema.
"""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from backend.database import Base


class Account(Base):
    """Bank accounts and credit cards."""

    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), unique=True, nullable=False)
    account_type = Column(String(50), nullable=False)  # "bank" or "credit"
    description = Column(String(500), nullable=True)
    is_hidden = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    transactions = relationship("Transaction", back_populates="account")
    reconciliations = relationship("Reconciliation", back_populates="account")

    def __repr__(self):
        return f"<Account(id={self.id}, name={self.name}, type={self.account_type})>"


class Category(Base):
    """Budget categories for transactions."""

    __tablename__ = "categories"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), unique=True, nullable=False)
    is_hidden = Column(Boolean, default=False)
    monthly_budget = Column(Numeric(12, 2), nullable=True, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    transactions = relationship("Transaction", back_populates="category")
    renames = relationship("CategoryRename", back_populates="category")
    from_transfers = relationship(
        "CategoryTransfer",
        foreign_keys="CategoryTransfer.from_category_id",
        back_populates="from_category",
    )
    to_transfers = relationship(
        "CategoryTransfer",
        foreign_keys="CategoryTransfer.to_category_id",
        back_populates="to_category",
    )

    def __repr__(self):
        return f"<Category(id={self.id}, name={self.name})>"


class CategoryRename(Base):
    """History of category renames."""

    __tablename__ = "category_renames"

    id = Column(Integer, primary_key=True)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    old_name = Column(String(255), nullable=False)
    renamed_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    category = relationship("Category", back_populates="renames")

    def __repr__(self):
        return f"<CategoryRename(category_id={self.category_id}, old_name={self.old_name})>"


class Transaction(Base):
    """Income and expense transactions."""

    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True)
    date = Column(Date, nullable=True)
    inflow = Column(Numeric(12, 2), nullable=False, default=0)  # income/deposits
    outflow = Column(Numeric(12, 2), nullable=False, default=0)  # expenses/withdrawals
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    memo = Column(String(500), nullable=True)
    is_transfer = Column(Boolean, default=False)
    transfer_id = Column(String(36), nullable=True)  # UUID for paired transfers
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    account = relationship("Account", back_populates="transactions")
    category = relationship("Category", back_populates="transactions")

    # Indexes for performance
    __table_args__ = (
        Index("idx_transactions_date", "date"),
        Index("idx_transactions_account_id", "account_id"),
        Index("idx_transactions_category_id", "category_id"),
    )

    def __repr__(self):
        return f"<Transaction(id={self.id}, date={self.date}, inflow={self.inflow}, outflow={self.outflow}, account_id={self.account_id})>"


class CategoryTransfer(Base):
    """Moving money between budget categories (envelope budgeting)."""

    __tablename__ = "category_transfers"

    id = Column(Integer, primary_key=True)
    date = Column(Date, nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)  # always positive
    from_category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)  # None = Available to budget
    to_category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    memo = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    from_category = relationship(
        "Category",
        foreign_keys=[from_category_id],
        back_populates="from_transfers",
    )
    to_category = relationship(
        "Category",
        foreign_keys=[to_category_id],
        back_populates="to_transfers",
    )

    # Indexes for performance
    __table_args__ = (Index("idx_category_transfers_date", "date"),)

    def __repr__(self):
        return f"<CategoryTransfer(id={self.id}, date={self.date}, amount={self.amount})>"


class Reconciliation(Base):
    """Track when accounts were reconciled."""

    __tablename__ = "reconciliations"

    id = Column(Integer, primary_key=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    reconciled_date = Column(Date, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    account = relationship("Account", back_populates="reconciliations")

    def __repr__(self):
        return f"<Reconciliation(id={self.id}, account_id={self.account_id}, reconciled_date={self.reconciled_date})>"


# FEATURE DEFERRED: Exchange rate caching - commented out for future implementation
# class ExchangeRate(Base):
#     """Cache for currency exchange rates."""
#
#     __tablename__ = "exchange_rates"
#
#     id = Column(Integer, primary_key=True)
#     base_currency = Column(String(3), nullable=False)
#     target_currency = Column(String(3), nullable=False)
#     rate = Column(Numeric(12, 6), nullable=False)
#     fetched_at = Column(DateTime, default=datetime.utcnow)
#
#     # Unique constraint on currency pair
#     __table_args__ = (
#         UniqueConstraint(
#             "base_currency",
#             "target_currency",
#             name="uq_exchange_rates_pair",
#         ),
#     )
#
#     def __repr__(self):
#         return f"<ExchangeRate(id={self.id}, {self.base_currency}->{self.target_currency}: {self.rate})>"
