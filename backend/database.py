"""
Database setup and session management using SQLAlchemy with async support.
"""

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import declarative_base

from backend.config import get_settings

# Base class for all ORM models
Base = declarative_base()

# Global engine and session factory (initialized on app startup)
engine = None
AsyncSessionLocal = None


async def init_db():
    """Initialize database engine and create all tables."""
    global engine, AsyncSessionLocal

    settings = get_settings()
    database_url = f"sqlite+aiosqlite:///{settings.database_path}"

    engine = create_async_engine(
        database_url,
        echo=False,  # Set to True for SQL logging
        future=True,
        connect_args={"timeout": 30},
    )

    AsyncSessionLocal = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    # Create all tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    print("Database initialized successfully")


async def get_session() -> AsyncSession:
    """
    Get a database session for FastAPI dependency injection.
    Usage: session: AsyncSession = Depends(get_session)
    """
    if AsyncSessionLocal is None:
        raise RuntimeError("Database not initialized. Call init_db() first.")

    async with AsyncSessionLocal() as session:
        yield session


async def close_db():
    """Close database connection on app shutdown."""
    global engine
    if engine:
        await engine.dispose()
