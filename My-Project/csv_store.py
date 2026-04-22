from __future__ import annotations

import csv
import json
import os
import threading
from datetime import datetime, timezone
from typing import Any

import pandas as pd

from app.config import settings


SCHEMA: dict[str, list[str]] = {
    "products": ["sku", "name", "category", "price", "image_url"],
    "users": ["user_id", "name", "email", "gender", "password_hash", "role", "created_at", "last_login_at"],
    "orders": ["order_id", "user_id", "total", "created_at"],
    "order_items": ["order_id", "product_sku", "quantity", "unit_price"],
    "web_events": [
        "id",
        "event_type",
        "user_id",
        "session_id",
        "page_url",
        "product_sku",
        "platform",
        "channel",
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "advertising_platform",
        "ad_id",
        "email_campaign_id",
        "social_network",
        "page_duration_ms",
        "event_value",
        "referrer",
        "user_agent",
        "created_at",
        "metadata",
    ],
}

_LOCK = threading.RLock()
_IN_MEMORY_STORE: dict[str, pd.DataFrame] = {}
_STORE_INITIALIZED = False


def _path(table: str) -> str:
    return os.path.join(settings.data_dir, f"{table}.csv")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _serialise(v: Any) -> str:
    if v is None:
        return ""
    if isinstance(v, (dict, list)):
        return json.dumps(v, ensure_ascii=True)
    return str(v)


def _rewrite_table(path: str, cols: list[str], df: pd.DataFrame) -> None:
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=cols)
        writer.writeheader()
        for rec in df[cols].fillna("").to_dict(orient="records"):
            writer.writerow({c: _serialise(rec.get(c)) for c in cols})


def _initialize_store():
    """
    Run once to create data files and load all existing data from CSVs into memory.
    """
    global _STORE_INITIALIZED
    with _LOCK:
        if _STORE_INITIALIZED:
            return

        os.makedirs(settings.data_dir, exist_ok=True)
        for table, cols in SCHEMA.items():
            path = _path(table)
            if not os.path.exists(path):
                with open(path, "w", newline="", encoding="utf-8") as f:
                    writer = csv.DictWriter(f, fieldnames=cols)
                    writer.writeheader()

            try:
                df = pd.read_csv(path, dtype=str)
            except pd.errors.EmptyDataError:
                df = pd.DataFrame(columns=cols)

            original_cols = list(df.columns)
            for c in cols:
                if c not in df.columns:
                    df[c] = ""

            df = df[cols].fillna("")

            # If schema changed (new/missing/reordered columns), rewrite the file once.
            if original_cols != cols:
                _rewrite_table(path, cols, df)

            _IN_MEMORY_STORE[table] = df

        _STORE_INITIALIZED = True


def ensure_data_files() -> None:
    _initialize_store()


def read_table(table: str) -> pd.DataFrame:
    _initialize_store()
    if not os.path.exists(_path(table)):
        with _LOCK:
            return pd.DataFrame(columns=SCHEMA.get(table, []))

    try:
        df = pd.read_csv(_path(table), dtype=str)
    except pd.errors.EmptyDataError:
        df = pd.DataFrame(columns=SCHEMA.get(table, []))

    cols = SCHEMA.get(table, [])
    for c in cols:
        if c not in df.columns:
            df[c] = ""
    df = df[cols].fillna("")

    with _LOCK:
        _IN_MEMORY_STORE[table] = df
    return df.copy()


def append_rows(table: str, rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    _initialize_store()
    cols = SCHEMA[table]
    os.makedirs(settings.data_dir, exist_ok=True)
    with _LOCK:
        with open(_path(table), "a", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=cols)
            rows_to_write = [{c: _serialise(row.get(c)) for c in cols} for row in rows]
            writer.writerows(rows_to_write)

        if rows_to_write:
            new_df = pd.DataFrame(rows_to_write, columns=cols)
            _IN_MEMORY_STORE[table] = pd.concat([_IN_MEMORY_STORE[table], new_df], ignore_index=True)


def add_products_if_missing(products: list[dict[str, Any]]) -> int:
    ensure_data_files()
    with _LOCK:
        existing = read_table("products")
        existing_skus = set(existing["sku"].tolist()) if not existing.empty else set()
        to_add = [p for p in products if str(p.get("sku", "")).strip() and p.get("sku") not in existing_skus]
        append_rows("products", to_add)
        return len(to_add)


def create_order(order_id: str, user_id: str | None, items: list[dict[str, Any]]) -> tuple[bool, float]:
    ensure_data_files()
    with _LOCK:
        orders = read_table("orders")
        if not orders.empty and order_id in set(orders["order_id"].tolist()):
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

        append_rows(
            "orders",
            [
                {
                    "order_id": order_id,
                    "user_id": user_id or "",
                    "total": total,
                    "created_at": _now_iso(),
                }
            ],
        )
        if line_items:
            append_rows("order_items", line_items)
        return True, total
