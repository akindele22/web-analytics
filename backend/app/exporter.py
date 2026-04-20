from __future__ import annotations

import os
import threading
import time

from app.config import settings
from app.kpi import overview_kpis, product_interaction_cube, top_products_by_likes


def _ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def export_csv_once(export_dir: str) -> None:
    _ensure_dir(export_dir)

    kpis = overview_kpis().to_dict()
    top = top_products_by_likes(limit=50)
    cube = product_interaction_cube(limit=500)

    # Single-row KPI CSV (overwritten each run)
    kpi_path = os.path.join(export_dir, "admin_kpis.csv")
    with open(kpi_path, "w", encoding="utf-8") as f:
        headers = list(kpis.keys())
        f.write(",".join(headers) + "\n")
        f.write(",".join(str(kpis[h]) for h in headers) + "\n")

    top.to_csv(os.path.join(export_dir, "top_products_by_likes.csv"), index=False)
    cube.to_csv(os.path.join(export_dir, "product_interaction_cube.csv"), index=False)


def start_exporter_thread() -> threading.Thread:
    export_dir = settings.export_dir
    interval = max(2, int(settings.export_interval_seconds))

    def loop() -> None:
        while True:
            try:
                export_csv_once(export_dir=export_dir)
            except Exception:
                # Keep running even if export fails transiently
                pass
            time.sleep(interval)

    t = threading.Thread(target=loop, name="csv_exporter", daemon=True)
    t.start()
    return t

