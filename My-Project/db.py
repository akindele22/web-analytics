from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings


class Base(DeclarativeBase):
    pass


# Ensure SQLAlchemy uses the psycopg (v3) driver installed in requirements.txt
dsn = settings.postgres_dsn
try:
    if dsn and dsn.startswith("postgresql://") and "+psycopg" not in dsn:
        dsn = dsn.replace("postgresql://", "postgresql+psycopg://", 1)

    engine = create_engine(dsn, pool_pre_ping=True) if dsn else None
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False) if engine else None
except Exception as e:
    print(f"Database engine initialization failed: {e}")
    engine = None
    SessionLocal = None
