"""FastAPI application main module."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager

from backend.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup and shutdown events."""
    # Startup: Initialize database
    await init_db()
    print("Application startup complete")
    yield
    # Shutdown: Cleanup (if needed in future)
    print("Application shutdown")


# Create FastAPI application
app = FastAPI(
    title="MoneyWise",
    description="Personal budget and expense tracking application",
    version="0.1.0-alpha",
    lifespan=lifespan
)

# Configure CORS middleware to allow frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://localhost:3000",  # For future development servers
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Health check endpoint
@app.get("/api/health")
async def health_check():
    """
    Health check endpoint to verify the API is running.

    Returns:
        dict: Status message indicating the API is healthy
    """
    return {"status": "healthy"}


# Root endpoint - serve index.html
@app.get("/")
async def serve_root():
    """Serve the main index.html file."""
    return FileResponse("frontend/index.html")


# Mount static files for frontend
# This serves all static assets (JS, CSS, images, etc.)
app.mount("/frontend", StaticFiles(directory="frontend", html=True), name="frontend")


# API route placeholder for future endpoints
@app.get("/api")
async def api_root():
    """API root endpoint."""
    return {
        "message": "MoneyWise API",
        "version": "0.1.0-alpha",
        "endpoints": {
            "health": "/api/health",
            "docs": "/docs",
            "redoc": "/redoc"
        }
    }
