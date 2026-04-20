from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import pandas as pd

from app import csv_store, postgres_store


def ensure_store() -> None:
    csv_store.ensure_data_files()
    if postgres_store.is_configured():
        postgres_store.ensure_ready()


def _use_postgres() -> bool:
    return postgres_store.is_ready()


def read_table(table: str) -> pd.DataFrame:
    # Prefer CSV files for data insights as primary source
    df_csv = csv_store.read_table(table)
    if not df_csv.empty:
        return df_csv

    if _use_postgres():
        try:
            return postgres_store.read_table(table)
        except Exception:
            return pd.DataFrame(columns=csv_store.SCHEMA.get(table, []))

    return df_csv
def append_rows(table: str, rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    if _use_postgres():
        postgres_store.append_rows(table, rows)
        csv_store.append_rows(table, rows)
        return
    csv_store.append_rows(table, rows)


def create_order(order_id: str, user_id: str | None, items: list[dict[str, Any]]) -> tuple[bool, float]:
    if _use_postgres():
        ok, total = postgres_store.create_order(order_id=order_id, user_id=user_id, items=items)
        if ok:
            # Mirror to CSV for compatibility and exports
            csv_store.append_rows(
                "orders",
                [
                    {
                        "order_id": order_id,
                        "user_id": user_id or "",
                        "total": total,
                        "created_at": datetime.now(timezone.utc).isoformat(),
                    }
                ],
            )
            if items:
                line_items = []
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
                if line_items:
                    csv_store.append_rows("order_items", line_items)
        return ok, total
    return csv_store.create_order(order_id=order_id, user_id=user_id, items=items)
