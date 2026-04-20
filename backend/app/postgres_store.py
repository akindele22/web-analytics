from __future__ import annotations

import threading
from datetime import datetime, timezone
from typing import Any

import pandas as pd
import psycopg

from app import csv_store
from app.config import settings


_LOCK = threading.RLock()
_INITIALIZED = False
_READY = False

_PRIMARY_KEYS: dict[str, str] = {
    "products": "sku",
    "users": "user_id",
    "orders": "order_id",
    "web_events": "id",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _serialise(v: Any) -> str:
    if v is None:
        return ""
    if isinstance(v, (dict, list)):
        return csv_store._serialise(v)
    return str(v)


def is_configured() -> bool:
    return bool(settings.postgres_dsn)


def is_ready() -> bool:
    return _READY


def _connect() -> psycopg.Connection:
    return psycopg.connect(settings.postgres_dsn)


def _ensure_schema() -> None:
    global _INITIALIZED, _READY
    with _LOCK:
        if _INITIALIZED:
            return
        if not is_configured():
            return

        try:
            with _connect() as conn:
                with conn.cursor() as cur:
                    for table, cols in csv_store.SCHEMA.items():
                        pk = _PRIMARY_KEYS.get(table)
                        cols_sql = ", ".join([f'"{c}" TEXT' for c in cols])
                        if pk:
                            cols_sql = f"{cols_sql}, PRIMARY KEY (\"{pk}\")"
                        cur.execute(f'CREATE TABLE IF NOT EXISTS "{table}" ({cols_sql});')
                conn.commit()
            _INITIALIZED = True
            _READY = True
        except Exception:
            _READY = False


def ensure_ready() -> bool:
    if not is_configured():
        return False
    if not _INITIALIZED:
        _ensure_schema()
        if _READY:
            _bootstrap_from_csv()
    return _READY


def _table_empty(conn: psycopg.Connection, table: str) -> bool:
    with conn.cursor() as cur:
        cur.execute(f'SELECT 1 FROM "{table}" LIMIT 1;')
        return cur.fetchone() is None


def _bootstrap_from_csv() -> None:
    if not _READY:
        return
    with _LOCK:
        try:
            with _connect() as conn:
                for table, cols in csv_store.SCHEMA.items():
                    if not _table_empty(conn, table):
                        continue
                    df = csv_store.read_table(table)
                    if df.empty:
                        continue
                    rows = df[cols].fillna("").to_dict(orient="records")
                    _insert_rows(conn, table, rows)
                conn.commit()
        except Exception:
            pass


def _insert_rows(conn: psycopg.Connection, table: str, rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    cols = csv_store.SCHEMA[table]
    col_list = ", ".join([f'"{c}"' for c in cols])
    placeholders = ", ".join(["%s"] * len(cols))
    pk = _PRIMARY_KEYS.get(table)
    conflict = f' ON CONFLICT ("{pk}") DO NOTHING' if pk else ""
    sql = f'INSERT INTO "{table}" ({col_list}) VALUES ({placeholders}){conflict};'
    values = [[_serialise(row.get(c)) for c in cols] for row in rows]
    with conn.cursor() as cur:
        cur.executemany(sql, values)


def read_table(table: str) -> pd.DataFrame:
    if not ensure_ready():
        return pd.DataFrame(columns=csv_store.SCHEMA.get(table, []))
    cols = csv_store.SCHEMA[table]
    with _connect() as conn:
        with conn.cursor() as cur:
            col_list = ", ".join([f'"{c}"' for c in cols])
            cur.execute(f'SELECT {col_list} FROM "{table}";')
            rows = cur.fetchall()
    df = pd.DataFrame(rows, columns=cols)
    return df.fillna("")


def append_rows(table: str, rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    if not ensure_ready():
        return
    with _connect() as conn:
        _insert_rows(conn, table, rows)
        conn.commit()


def create_order(order_id: str, user_id: str | None, items: list[dict[str, Any]]) -> tuple[bool, float]:
    if not ensure_ready():
        return False, 0.0

    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute('SELECT 1 FROM "orders" WHERE "order_id" = %s LIMIT 1;', (order_id,))
            if cur.fetchone() is not None:
                return False, 0.0

        line_items: list[dict[str, Any]] = []
        total = 0.0
        for it in items:
            sku = str(it.get("product_sku") or "").strip()
            qty = int(it.get("quantity") or 0)
            unit_price = float(it.get("unit_price") or 0.0)
            if not sku or qty <= 0:
                continue
            line_items.append(
                {
                    "order_id": order_id,
                    "product_sku": sku,
                    "quantity": qty,
                    "unit_price": unit_price,
                }
            )
            total += qty * unit_price

        order_row = {
            "order_id": order_id,
            "user_id": user_id or "",
            "total": total,
            "created_at": _now_iso(),
        }

        _insert_rows(conn, "orders", [order_row])
        if line_items:
            _insert_rows(conn, "order_items", line_items)
        conn.commit()
        return True, total
