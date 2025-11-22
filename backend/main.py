"""
MoneyWise FastAPI application.
Main backend API server with CORS, static file serving, and database initialization.
"""

from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.ext.asyncio import AsyncSession
import os

from backend.config import get_settings
from backend.database import init_db, close_db, get_session
from backend import crud
from backend.schemas import (
    AccountCreate, AccountUpdate, AccountResponse,
    CategoryCreate, CategoryUpdate, CategoryResponse,
    TransactionCreate, TransactionUpdate, TransactionResponse,
    ExchangeRatesResponse, CurrencyConvertResponse
)
from backend.currency import CurrencyService
from datetime import date, datetime
from decimal import Decimal

# Initialize settings
settings = get_settings()

# Create FastAPI app
app = FastAPI(
    title="MoneyWise",
    description="Personal budget and expense tracking application",
    version="0.1.0-alpha",
)

# Add CORS middleware - allow localhost origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:8000",
        "http://localhost:8000",
        "http://127.0.0.1:5173",  # Vite dev server if used
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    """Initialize database on application startup."""
    await init_db()
    print("MoneyWise server started successfully!")


@app.on_event("shutdown")
async def shutdown():
    """Close database connection on application shutdown."""
    await close_db()
    print("MoneyWise server shutdown")


# Health check endpoint
@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}


# ============================================================================
# ACCOUNT ENDPOINTS
# ============================================================================

@app.get("/api/accounts", response_model=list[AccountResponse])
async def list_accounts(db: AsyncSession = Depends(get_session)):
    """Get all accounts (including hidden)."""
    return await crud.get_all_accounts(db)


@app.post("/api/accounts", response_model=AccountResponse, status_code=status.HTTP_201_CREATED)
async def create_account(account: AccountCreate, db: AsyncSession = Depends(get_session)):
    """Create a new account."""
    return await crud.create_account(db, account)


@app.get("/api/accounts/{account_id}", response_model=AccountResponse)
async def get_account(account_id: int, db: AsyncSession = Depends(get_session)):
    """Get a specific account by ID."""
    account = await crud.get_account_by_id(db, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return account


@app.patch("/api/accounts/{account_id}", response_model=AccountResponse)
async def update_account(account_id: int, account_update: AccountUpdate, db: AsyncSession = Depends(get_session)):
    """Update an account."""
    account = await crud.update_account(db, account_id, account_update)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return account


@app.delete("/api/accounts/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(account_id: int, db: AsyncSession = Depends(get_session)):
    """Delete an account."""
    success = await crud.delete_account(db, account_id)
    if not success:
        raise HTTPException(status_code=404, detail="Account not found")


# ============================================================================
# CATEGORY ENDPOINTS
# ============================================================================

@app.get("/api/categories", response_model=list[CategoryResponse])
async def list_categories(db: AsyncSession = Depends(get_session)):
    """Get all categories (including hidden)."""
    categories = await crud.get_all_categories(db)
    # Attach rename history to each category
    result = []
    for cat in categories:
        result.append({
            "id": cat.id,
            "name": cat.name,
            "is_hidden": cat.is_hidden,
            "created_at": cat.created_at,
            "updated_at": cat.updated_at,
            "renamed_history": [{"old_name": r.old_name, "renamed_at": r.renamed_at} for r in cat.renames]
        })
    return result


@app.post("/api/categories", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
async def create_category(category: CategoryCreate, db: AsyncSession = Depends(get_session)):
    """Create a new category."""
    new_cat = await crud.create_category(db, category)
    return {
        "id": new_cat.id,
        "name": new_cat.name,
        "is_hidden": new_cat.is_hidden,
        "created_at": new_cat.created_at,
        "updated_at": new_cat.updated_at,
        "renamed_history": []
    }


@app.get("/api/categories/{category_id}", response_model=CategoryResponse)
async def get_category(category_id: int, db: AsyncSession = Depends(get_session)):
    """Get a specific category by ID."""
    category = await crud.get_category_by_id(db, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    return {
        "id": category.id,
        "name": category.name,
        "is_hidden": category.is_hidden,
        "created_at": category.created_at,
        "updated_at": category.updated_at,
        "renamed_history": [{"old_name": r.old_name, "renamed_at": r.renamed_at} for r in category.renames]
    }


@app.patch("/api/categories/{category_id}", response_model=CategoryResponse)
async def update_category(category_id: int, category_update: CategoryUpdate, db: AsyncSession = Depends(get_session)):
    """Update a category."""
    category = await crud.update_category(db, category_id, category_update)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    return {
        "id": category.id,
        "name": category.name,
        "is_hidden": category.is_hidden,
        "created_at": category.created_at,
        "updated_at": category.updated_at,
        "renamed_history": [{"old_name": r.old_name, "renamed_at": r.renamed_at} for r in category.renames]
    }


@app.delete("/api/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(category_id: int, db: AsyncSession = Depends(get_session)):
    """Delete a category."""
    success = await crud.delete_category(db, category_id)
    if not success:
        raise HTTPException(status_code=404, detail="Category not found")


# ============================================================================
# TRANSACTION ENDPOINTS
# ============================================================================

@app.get("/api/transactions", response_model=list[TransactionResponse])
async def list_transactions(
    account_id: int | None = None,
    category_id: int | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    limit: int = 1000,
    db: AsyncSession = Depends(get_session)
):
    """Get transactions with optional filters."""
    transactions = await crud.get_transactions(
        db,
        account_id=account_id,
        category_id=category_id,
        start_date=start_date,
        end_date=end_date,
        limit=limit
    )

    # Format response with account and category names
    result = []
    for txn in transactions:
        result.append({
            "id": txn.id,
            "date": txn.date,
            "amount": float(txn.amount),
            "account_id": txn.account_id,
            "account_name": txn.account.name if txn.account else "Unknown",
            "category_id": txn.category_id,
            "category_name": txn.category.name if txn.category else None,
            "memo": txn.memo,
            "is_transfer": txn.is_transfer,
            "transfer_id": txn.transfer_id,
            "created_at": txn.created_at,
            "updated_at": txn.updated_at,
        })
    return result


@app.post("/api/transactions", response_model=TransactionResponse, status_code=status.HTTP_201_CREATED)
async def create_transaction(
    transaction: TransactionCreate,
    db: AsyncSession = Depends(get_session)
):
    """Create a new transaction."""
    txn = await crud.create_transaction(db, transaction)
    return {
        "id": txn.id,
        "date": txn.date,
        "amount": float(txn.amount),
        "account_id": txn.account_id,
        "account_name": txn.account.name if txn.account else "Unknown",
        "category_id": txn.category_id,
        "category_name": txn.category.name if txn.category else None,
        "memo": txn.memo,
        "is_transfer": txn.is_transfer,
        "transfer_id": txn.transfer_id,
        "created_at": txn.created_at,
        "updated_at": txn.updated_at,
    }


@app.get("/api/transactions/{transaction_id}", response_model=TransactionResponse)
async def get_transaction(
    transaction_id: int,
    db: AsyncSession = Depends(get_session)
):
    """Get a specific transaction by ID."""
    txn = await crud.get_transaction_by_id(db, transaction_id)
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")

    return {
        "id": txn.id,
        "date": txn.date,
        "amount": float(txn.amount),
        "account_id": txn.account_id,
        "account_name": txn.account.name if txn.account else "Unknown",
        "category_id": txn.category_id,
        "category_name": txn.category.name if txn.category else None,
        "memo": txn.memo,
        "is_transfer": txn.is_transfer,
        "transfer_id": txn.transfer_id,
        "created_at": txn.created_at,
        "updated_at": txn.updated_at,
    }


@app.patch("/api/transactions/{transaction_id}", response_model=TransactionResponse)
async def update_transaction(
    transaction_id: int,
    transaction_update: TransactionUpdate,
    db: AsyncSession = Depends(get_session)
):
    """Update a transaction."""
    txn = await crud.update_transaction(db, transaction_id, transaction_update)
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")

    return {
        "id": txn.id,
        "date": txn.date,
        "amount": float(txn.amount),
        "account_id": txn.account_id,
        "account_name": txn.account.name if txn.account else "Unknown",
        "category_id": txn.category_id,
        "category_name": txn.category.name if txn.category else None,
        "memo": txn.memo,
        "is_transfer": txn.is_transfer,
        "transfer_id": txn.transfer_id,
        "created_at": txn.created_at,
        "updated_at": txn.updated_at,
    }


@app.delete("/api/transactions/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_transaction(
    transaction_id: int,
    db: AsyncSession = Depends(get_session)
):
    """Delete a transaction."""
    success = await crud.delete_transaction(db, transaction_id)
    if not success:
        raise HTTPException(status_code=404, detail="Transaction not found")


# ============================================================================
# CURRENCY ENDPOINTS
# ============================================================================

@app.get("/api/currency/rates", response_model=ExchangeRatesResponse)
async def get_exchange_rates(
    base: str = "USD",
    targets: str | None = None,
    db: AsyncSession = Depends(get_session)
):
    """Get exchange rates for base currency to target currencies."""
    currency_service = CurrencyService(db)

    # Use configured ticker currencies if targets not specified
    if not targets:
        target_list = settings.currency.ticker_currencies
    else:
        target_list = [t.strip().upper() for t in targets.split(",")]

    rates = {}
    now = datetime.utcnow()
    for target in target_list:
        rate = await currency_service.get_rate(base.upper(), target.upper())
        rates[target.upper()] = float(rate)

    await currency_service.close()

    return {
        "base_currency": base.upper(),
        "rates": rates,
        "fetched_at": now
    }


@app.post("/api/currency/refresh")
async def refresh_exchange_rates(db: AsyncSession = Depends(get_session)):
    """Force refresh of all configured exchange rates."""
    currency_service = CurrencyService(db)
    success = await currency_service.refresh_all_rates()
    await currency_service.close()

    if not success:
        raise HTTPException(status_code=500, detail="Failed to refresh exchange rates")

    return {"status": "success", "message": "Exchange rates refreshed"}


@app.get("/api/currency/convert", response_model=CurrencyConvertResponse)
async def convert_currency(
    amount: Decimal,
    from_currency: str = "USD",
    to_currency: str = "USD",
    db: AsyncSession = Depends(get_session)
):
    """Convert amount from one currency to another."""
    currency_service = CurrencyService(db)

    rate = await currency_service.get_rate(from_currency.upper(), to_currency.upper())
    converted = await currency_service.convert_amount(amount, from_currency, to_currency)

    await currency_service.close()

    return {
        "amount": float(amount),
        "from_currency": from_currency.upper(),
        "to_currency": to_currency.upper(),
        "rate": float(rate),
        "converted_amount": float(converted)
    }


# Mount static files (frontend) with SPA fallback for Vue Router
frontend_path = os.path.join(os.path.dirname(__file__), "..", "frontend")
if os.path.exists(frontend_path):
    from fastapi.responses import FileResponse, HTMLResponse

    # Catch-all for serving SPA routes and static files
    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        """
        Serve frontend files:
        1. First check if the file exists directly (CSS, JS, static assets)
        2. If not, serve index.html for Vue Router to handle (SPA routes)
        """
        # Try to serve the file directly
        file_path = os.path.join(frontend_path, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)

        # For SPA routes, serve index.html
        index_path = os.path.join(frontend_path, "index.html")
        if os.path.exists(index_path):
            with open(index_path, 'r', encoding='utf-8') as f:
                return HTMLResponse(content=f.read())

        raise HTTPException(status_code=404, detail="Not found")
