"""
MoneyWise FastAPI application.
Main backend API server with CORS, static file serving, and database initialization.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from backend.config import get_settings
from backend.database import init_db, close_db

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


# Mount static files (frontend)
frontend_path = os.path.join(os.path.dirname(__file__), "..", "frontend")
if os.path.exists(frontend_path):
    app.mount("/", StaticFiles(directory=frontend_path, html=True), name="frontend")
