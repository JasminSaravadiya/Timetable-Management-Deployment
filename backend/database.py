from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
import os
import ssl
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

# Debug log (temporary) – helps verify connection on Render
print("DATABASE_URL:", DATABASE_URL)

if DATABASE_URL and DATABASE_URL.startswith("postgresql://"):
    # Convert standard PostgreSQL URL to async-compatible asyncpg URL
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

if DATABASE_URL and "asyncpg" in DATABASE_URL:
    # Production: Supabase PostgreSQL via asyncpg
    # asyncpg requires an actual SSLContext object, not just a string
    ssl_context = ssl.create_default_context()
    ssl_context.check_hostname = False
    ssl_context.verify_mode = ssl.CERT_NONE

    engine = create_async_engine(
        DATABASE_URL,
        echo=False,
        pool_pre_ping=True,
        pool_size=10,
        max_overflow=20,
        pool_recycle=1800,
        connect_args={
            "ssl": ssl_context,
            "prepared_statement_cache_size": 0,  # Required for PgBouncer Transaction mode
        },
    )
else:
    # Local development fallback: SQLite via aiosqlite
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    SQLITE_URL = f"sqlite+aiosqlite:///{os.path.join(BASE_DIR, 'timetable.db')}"
    engine = create_async_engine(
        SQLITE_URL,
        echo=True,
        connect_args={"check_same_thread": False},
    )

async_session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

Base = declarative_base()

async def get_db():
    async with async_session_maker() as session:
        yield session
