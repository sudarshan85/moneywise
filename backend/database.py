"""Database setup and session management."""
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import declarative_base

from backend.config import settings

# Create async SQLite engine
# SQLite async URL format: sqlite+aiosqlite:///path/to/db
DATABASE_URL = f"sqlite+aiosqlite:///{settings.database.path}"

# Create async engine
engine = create_async_engine(
    DATABASE_URL,
    echo=False,  # Set to True for SQL query logging during development
    future=True
)

# Create async session factory
async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)

# Declarative base for ORM models
Base = declarative_base()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Dependency function for FastAPI to get database sessions.

    Usage in FastAPI endpoints:
        @app.get("/example")
        async def example(db: AsyncSession = Depends(get_db)):
            # Use db here
    """
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db() -> None:
    """
    Initialize database by creating all tables.
    Called on application startup.
    """
    async with engine.begin() as conn:
        # Import models to ensure they're registered with Base
        from backend import models  # noqa: F401

        # Create all tables
        await conn.run_sync(Base.metadata.create_all)

    print(f"Database initialized at {settings.database.path}")
