"""SQLAlchemy ORM models for MoneyWise database."""
from datetime import datetime, date
from decimal import Decimal
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Date,
    Numeric, ForeignKey, Index, UniqueConstraint
)
from sqlalchemy.orm import relationship
from backend.database import Base


class Account(Base):
    """Account model - represents bank accounts or credit cards."""
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    account_type = Column(String, nullable=False)  # "bank" or "credit"
    is_hidden = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    transactions = relationship("Transaction", back_populates="account", cascade="all, delete-orphan")
    reconciliations = relationship("Reconciliation", back_populates="account", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Account(id={self.id}, name='{self.name}', type='{self.account_type}')>"


class Category(Base):
    """Category model - represents budget categories."""
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    is_hidden = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    transactions = relationship("Transaction", back_populates="category")
    category_renames = relationship("CategoryRename", back_populates="category", cascade="all, delete-orphan")
    transfers_from = relationship(
        "CategoryTransfer",
        foreign_keys="CategoryTransfer.from_category_id",
        back_populates="from_category"
    )
    transfers_to = relationship(
        "CategoryTransfer",
        foreign_keys="CategoryTransfer.to_category_id",
        back_populates="to_category",
        cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<Category(id={self.id}, name='{self.name}')>"


class CategoryRename(Base):
    """CategoryRename model - tracks category name change history."""
    __tablename__ = "category_renames"

    id = Column(Integer, primary_key=True, index=True)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    old_name = Column(String, nullable=False)
    renamed_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    # Relationships
    category = relationship("Category", back_populates="category_renames")

    def __repr__(self):
        return f"<CategoryRename(id={self.id}, category_id={self.category_id}, old_name='{self.old_name}')>"


class Transaction(Base):
    """Transaction model - represents financial transactions."""
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, nullable=False, index=True)
    amount = Column(Numeric(12, 2), nullable=False)  # Positive=inflow, Negative=outflow
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False, index=True)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True, index=True)
    memo = Column(String, nullable=True)
    is_transfer = Column(Boolean, default=False)  # True for account transfers
    transfer_id = Column(String, nullable=True)  # UUID linking paired transfers
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    account = relationship("Account", back_populates="transactions")
    category = relationship("Category", back_populates="transactions")

    def __repr__(self):
        return f"<Transaction(id={self.id}, date={self.date}, amount={self.amount})>"


class CategoryTransfer(Base):
    """CategoryTransfer model - represents budget allocations between categories."""
    __tablename__ = "category_transfers"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, nullable=False, index=True)
    amount = Column(Numeric(12, 2), nullable=False)  # Always positive
    from_category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)  # Null = from Available to Budget
    to_category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    memo = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    from_category = relationship("Category", foreign_keys=[from_category_id], back_populates="transfers_from")
    to_category = relationship("Category", foreign_keys=[to_category_id], back_populates="transfers_to")

    def __repr__(self):
        return f"<CategoryTransfer(id={self.id}, date={self.date}, amount={self.amount})>"


class Reconciliation(Base):
    """Reconciliation model - tracks when accounts were reconciled."""
    __tablename__ = "reconciliations"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    reconciled_date = Column(Date, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    account = relationship("Account", back_populates="reconciliations")

    def __repr__(self):
        return f"<Reconciliation(id={self.id}, account_id={self.account_id}, date={self.reconciled_date})>"


class ExchangeRate(Base):
    """ExchangeRate model - caches currency exchange rates."""
    __tablename__ = "exchange_rates"

    id = Column(Integer, primary_key=True, index=True)
    base_currency = Column(String(3), nullable=False)  # e.g., "USD"
    target_currency = Column(String(3), nullable=False)  # e.g., "EUR"
    rate = Column(Numeric(12, 6), nullable=False)
    fetched_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    # Unique constraint for base_currency + target_currency combination
    __table_args__ = (
        UniqueConstraint('base_currency', 'target_currency', name='uix_currency_pair'),
        Index('idx_currency_pair', 'base_currency', 'target_currency'),
    )

    def __repr__(self):
        return f"<ExchangeRate(base={self.base_currency}, target={self.target_currency}, rate={self.rate})>"
