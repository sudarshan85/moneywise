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
    CategoryCreate, CategoryUpdate, CategoryResponse
)

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
