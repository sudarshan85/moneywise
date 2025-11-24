"""
CRUD operations for database models.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from datetime import datetime, date
from decimal import Decimal

from backend.models import Account, Category, CategoryRename, Transaction
from backend.schemas import (
    AccountCreate, AccountUpdate,
    CategoryCreate, CategoryUpdate,
    CategoryRenameInfo,
    TransactionCreate, TransactionUpdate
)


# ============================================================================
# ACCOUNT OPERATIONS
# ============================================================================

async def create_account(db: AsyncSession, account_data: AccountCreate) -> Account:
    """Create a new account."""
    account = Account(
        name=account_data.name,
        account_type=account_data.account_type,
        description=account_data.description,
        is_hidden=False,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )
    db.add(account)
    await db.commit()
    await db.refresh(account)
    return account


async def get_account_by_id(db: AsyncSession, account_id: int) -> Account | None:
    """Get account by ID."""
    stmt = select(Account).where(Account.id == account_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_all_accounts(db: AsyncSession) -> list[Account]:
    """Get all accounts (including hidden)."""
    stmt = select(Account).order_by(Account.created_at)
    result = await db.execute(stmt)
    return result.scalars().all()


async def update_account(db: AsyncSession, account_id: int, account_data: AccountUpdate) -> Account | None:
    """Update an account."""
    account = await get_account_by_id(db, account_id)
    if not account:
        return None

    update_data = account_data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(account, key, value)

    account.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(account)
    return account


async def delete_account(db: AsyncSession, account_id: int) -> bool:
    """Delete an account."""
    account = await get_account_by_id(db, account_id)
    if not account:
        return False

    await db.delete(account)
    await db.commit()
    return True


# ============================================================================
# CATEGORY OPERATIONS
# ============================================================================

async def create_category(db: AsyncSession, category_data: CategoryCreate) -> Category:
    """Create a new category."""
    category = Category(
        name=category_data.name,
        is_hidden=False,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )
    db.add(category)
    await db.commit()
    await db.refresh(category)
    return category


async def get_category_by_id(db: AsyncSession, category_id: int) -> Category | None:
    """Get category by ID with rename history."""
    stmt = (
        select(Category)
        .where(Category.id == category_id)
        .options(selectinload(Category.renames))
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_all_categories(db: AsyncSession) -> list[Category]:
    """Get all categories (including hidden) with rename history."""
    stmt = (
        select(Category)
        .order_by(Category.created_at)
        .options(selectinload(Category.renames))
    )
    result = await db.execute(stmt)
    return result.scalars().all()


async def update_category(db: AsyncSession, category_id: int, category_data: CategoryUpdate) -> Category | None:
    """Update a category and track name changes in rename history."""
    category = await get_category_by_id(db, category_id)
    if not category:
        return None

    update_data = category_data.model_dump(exclude_unset=True)

    # If name is being changed, create a rename history record
    if "name" in update_data and update_data["name"] != category.name:
        old_name = category.name
        rename_record = CategoryRename(
            category_id=category_id,
            old_name=old_name,
            renamed_at=datetime.utcnow()
        )
        db.add(rename_record)

    # Update the category fields
    for key, value in update_data.items():
        setattr(category, key, value)

    category.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(category)

    # Reload to get updated rename history
    return await get_category_by_id(db, category_id)


async def delete_category(db: AsyncSession, category_id: int) -> bool:
    """Delete a category and its rename history."""
    category = await get_category_by_id(db, category_id)
    if not category:
        return False

    await db.delete(category)
    await db.commit()
    return True


async def get_category_rename_history(db: AsyncSession, category_id: int) -> list[CategoryRenameInfo]:
    """Get rename history for a category."""
    stmt = (
        select(CategoryRename)
        .where(CategoryRename.category_id == category_id)
        .order_by(CategoryRename.renamed_at)
    )
    result = await db.execute(stmt)
    renames = result.scalars().all()
    return [
        CategoryRenameInfo(old_name=r.old_name, renamed_at=r.renamed_at)
        for r in renames
    ]


# ============================================================================
# TRANSACTION OPERATIONS
# ============================================================================

async def create_transaction(db: AsyncSession, transaction_data: TransactionCreate) -> Transaction:
    """Create a new transaction."""
    transaction = Transaction(
        date=transaction_data.date,
        inflow=transaction_data.inflow,
        outflow=transaction_data.outflow,
        account_id=transaction_data.account_id,
        category_id=transaction_data.category_id,
        memo=transaction_data.memo,
        is_transfer=transaction_data.is_transfer,
        transfer_id=transaction_data.transfer_id,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )
    db.add(transaction)
    await db.commit()
    await db.refresh(transaction)
    # Re-fetch with relationships eager-loaded to avoid lazy loading issues
    return await get_transaction_by_id(db, transaction.id)


async def get_transaction_by_id(db: AsyncSession, transaction_id: int) -> Transaction | None:
    """Get transaction by ID with account and category relationships."""
    stmt = (
        select(Transaction)
        .where(Transaction.id == transaction_id)
        .options(
            selectinload(Transaction.account),
            selectinload(Transaction.category)
        )
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_transactions(
    db: AsyncSession,
    account_id: int | None = None,
    category_id: int | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    limit: int = 1000
) -> list[Transaction]:
    """Get transactions with optional filters, ordered newest first."""
    stmt = (
        select(Transaction)
        .options(
            selectinload(Transaction.account),
            selectinload(Transaction.category)
        )
    )

    # Apply filters
    if account_id is not None:
        stmt = stmt.where(Transaction.account_id == account_id)
    if category_id is not None:
        stmt = stmt.where(Transaction.category_id == category_id)
    if start_date is not None:
        stmt = stmt.where(Transaction.date >= start_date)
    if end_date is not None:
        stmt = stmt.where(Transaction.date <= end_date)

    # Order by date descending (newest first), limit results
    stmt = stmt.order_by(Transaction.date.desc()).limit(limit)

    result = await db.execute(stmt)
    return result.scalars().all()


async def update_transaction(
    db: AsyncSession,
    transaction_id: int,
    transaction_data: TransactionUpdate
) -> Transaction | None:
    """Update a transaction."""
    transaction = await get_transaction_by_id(db, transaction_id)
    if not transaction:
        return None

    update_data = transaction_data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(transaction, key, value)

    transaction.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(transaction)

    # Reload to get relationships
    return await get_transaction_by_id(db, transaction_id)


async def delete_transaction(db: AsyncSession, transaction_id: int) -> bool:
    """Delete a transaction."""
    transaction = await get_transaction_by_id(db, transaction_id)
    if not transaction:
        return False

    await db.delete(transaction)
    await db.commit()
    return True


async def get_category_balance(db: AsyncSession, category_id: int) -> Decimal:
    """Get total balance for a category (sum of inflows minus outflows)."""
    stmt = select(Transaction).where(
        Transaction.category_id == category_id
    )
    result = await db.execute(stmt)
    transactions = result.scalars().all()

    balance = Decimal("0.00")
    for txn in transactions:
        balance += Decimal(str(txn.inflow)) - Decimal(str(txn.outflow))

    return balance
