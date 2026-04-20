from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd

from app.store import read_table


@dataclass
class OverviewKpis:
    total_sales: float
    total_orders: int
    average_order_value: float
    page_views_24h: int
    site_visits_24h: int
    likes_24h: int
    unique_users_24h: int
    ctr_24h: float

    def to_dict(self) -> dict:
        return asdict(self)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _to_num(s: pd.Series) -> pd.Series:
    return pd.to_numeric(s, errors="coerce").fillna(0)


def _normalise_identity(primary: pd.Series, secondary: pd.Series) -> pd.Series:
    primary_clean = primary.fillna("").astype(str).str.strip()
    secondary_clean = secondary.fillna("").astype(str).str.strip()
    return primary_clean.mask(primary_clean == "", secondary_clean)


def _events_last_24h(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df
    tmp = df.copy()
    tmp["created_at"] = pd.to_datetime(tmp["created_at"], utc=True, errors="coerce")
    tmp = tmp.dropna(subset=["created_at"])
    since = _utc_now() - timedelta(hours=24)
    return tmp[tmp["created_at"] >= since]


def _safe_top_str_value(df: pd.DataFrame, col: str) -> str | None:
    if df.empty or col not in df.columns:
        return None
    ser = df[col].fillna("").astype(str).str.strip()
    ser = ser[ser != ""]
    if ser.empty:
        return None
    top = ser.value_counts().head(1)
    return str(top.index[0]) if not top.empty else None


def overview_kpis() -> OverviewKpis:
    orders = read_table("orders")
    events = read_table("web_events")
    recent = _events_last_24h(events)

    total_sales = float(_to_num(orders["total"]).sum()) if not orders.empty else 0.0
    total_orders = int(len(orders.index))
    aov = total_sales / total_orders if total_orders else 0.0

    page_views = recent[recent["event_type"] == "page_view"]
    likes = recent[recent["event_type"] == "like"]
    likes_24h = int(len(likes.index))

    if page_views.empty:
        site_visits_24h = 0
    else:
        visit_ids = _normalise_identity(page_views["session_id"], page_views["user_id"])
        site_visits_24h = int(visit_ids.replace("", pd.NA).dropna().nunique())

    if recent.empty:
        unique_users_24h = 0
    else:
        user_keys = _normalise_identity(recent["user_id"], recent["session_id"])
        unique_users_24h = int(user_keys.replace("", pd.NA).dropna().nunique())

    clicks_24h = int(recent["event_type"].isin(["click", "like", "add_to_cart", "checkout_start", "purchase"]).sum())
    page_views_24h = int(len(page_views.index))
    ctr_24h = (clicks_24h / page_views_24h * 100.0) if page_views_24h > 0 else 0.0

    return OverviewKpis(
        total_sales=total_sales,
        total_orders=total_orders,
        average_order_value=aov,
        page_views_24h=page_views_24h,
        site_visits_24h=site_visits_24h,
        likes_24h=likes_24h,
        unique_users_24h=unique_users_24h,
        ctr_24h=ctr_24h,
    )


def top_products_by_likes(limit: int = 10) -> pd.DataFrame:
    events = read_table("web_events")
    if events.empty:
        return pd.DataFrame(columns=["product_sku", "likes"])
    likes = events[(events["event_type"] == "like") & (events["product_sku"] != "")]
    if likes.empty:
        return pd.DataFrame(columns=["product_sku", "likes"])
    grouped = likes.groupby("product_sku", as_index=False).size().rename(columns={"size": "likes"})
    grouped = grouped.sort_values(["likes", "product_sku"], ascending=[False, True]).head(limit)
    return grouped.reset_index(drop=True)


def product_interaction_cube(limit: int = 200) -> pd.DataFrame:
    """
    3D points for products: x=views, y=likes, z=purchases (via events).
    """
    events = read_table("web_events")
    base = events[events["product_sku"].notna() & (events["product_sku"] != "")]
    if base.empty:
        return pd.DataFrame(columns=["product_sku", "views", "likes", "purchases"])

    views = base[base["event_type"] == "page_view"].groupby("product_sku").size().rename("views")
    likes = base[base["event_type"] == "like"].groupby("product_sku").size().rename("likes")
    purchases = base[base["event_type"] == "purchase"].groupby("product_sku").size().rename("purchases")

    merged = pd.concat([views, likes, purchases], axis=1).reset_index()
    merged = merged.fillna(0)

    for col in ["views", "likes", "purchases"]:
        if col not in merged.columns:
            merged[col] = 0

    merged[["views", "likes", "purchases"]] = merged[["views", "likes", "purchases"]].astype(int)
    merged = merged.sort_values(["likes", "views", "product_sku"], ascending=[False, False, True]).head(limit)
    return merged.reset_index(drop=True)


def website_analytics(limit: int = 10, customer_limit: int = 10) -> dict:
    events = read_table("web_events")
    orders = read_table("orders")
    products = read_table("products")
    users = read_table("users")

    user_map: dict[str, dict[str, str | None]] = {}
    if not users.empty:
        tmp = users.copy()
        tmp["user_id"] = tmp["user_id"].fillna("").astype(str).str.strip()
        for _, row in tmp.iterrows():
            uid = str(row.get("user_id") or "").strip()
            if not uid:
                continue
            user_map[uid] = {
                "name": str(row.get("name") or "").strip() or None,
                "email": str(row.get("email") or "").strip() or None,
                "gender": str(row.get("gender") or "").strip() or None,
                "role": str(row.get("role") or "").strip() or None,
            }

    if events.empty:
        return {
            "click_through_rate": 0.0,
            "website_visits": 0,
            "website_visits_24h": 0,
            "pages_per_visit": 0.0,
            "average_time_on_page_seconds": 0.0,
            "average_time_on_product_page_seconds": 0.0,
            "time_on_site_total_seconds": 0.0,
            "average_time_on_site_per_visit_seconds": 0.0,
            "previous_purchases_total": 0,
            "customers_with_previous_purchase": 0,
            "average_previous_purchases_per_repeat_customer": 0.0,
            "frequent_pages": [],
            "frequent_products": [],
            "frequent_categories": [],
            "customer_frequency": [],
            "top_returning_customers": [],
        }

    e = events.copy()
    e["user_id"] = e["user_id"].fillna("").astype(str)
    e["session_id"] = e["session_id"].fillna("").astype(str)
    e["page_url"] = e["page_url"].fillna("").astype(str)
    e["product_sku"] = e["product_sku"].fillna("").astype(str)
    e["visit_key"] = _normalise_identity(e["session_id"], e["user_id"])  # session-first visit identity
    e["customer_key"] = _normalise_identity(e["user_id"], e["session_id"])  # user-first customer identity

    page_views = e[e["event_type"] == "page_view"].copy()
    page_exits = e[e["event_type"] == "page_exit"].copy()
    clicks = e[e["event_type"].isin(["click", "like", "add_to_cart", "checkout_start", "purchase"])].copy()

    page_views_count = int(len(page_views.index))
    website_visits = int(page_views["visit_key"].replace("", pd.NA).dropna().nunique()) if page_views_count else 0
    click_through_rate = (len(clicks.index) / page_views_count * 100.0) if page_views_count else 0.0
    pages_per_visit = (page_views_count / website_visits) if website_visits else 0.0

    page_exits["page_duration_ms"] = _to_num(page_exits["page_duration_ms"])
    avg_time_on_page_seconds = float(page_exits["page_duration_ms"].mean() / 1000.0) if not page_exits.empty else 0.0

    product_exits = page_exits[page_exits["page_url"].str.contains("/products/", case=False, regex=False)]
    avg_time_on_product_page_seconds = (
        float(product_exits["page_duration_ms"].mean() / 1000.0) if not product_exits.empty else 0.0
    )

    time_on_site_total_seconds = float(page_exits["page_duration_ms"].sum() / 1000.0) if not page_exits.empty else 0.0
    session_time = page_exits.groupby("visit_key", as_index=False)["page_duration_ms"].sum()
    session_time = session_time[session_time["visit_key"].astype(str).str.strip() != ""]
    average_time_on_site_per_visit_seconds = (
        float(session_time["page_duration_ms"].mean() / 1000.0) if not session_time.empty else 0.0
    )

    recent = _events_last_24h(e)
    recent_views = recent[recent["event_type"] == "page_view"]
    website_visits_24h = (
        int(recent_views["visit_key"].replace("", pd.NA).dropna().nunique()) if not recent_views.empty else 0
    )

    frequent_pages = []
    if not page_views.empty:
        page_counts = (
            page_views[page_views["page_url"].str.strip() != ""]
            .groupby("page_url", as_index=False)
            .size()
            .rename(columns={"size": "views"})
            .sort_values(["views", "page_url"], ascending=[False, True])
            .head(limit)
        )
        frequent_pages = page_counts.to_dict(orient="records")

    product_events = e[e["product_sku"].str.strip() != ""]
    frequent_products = []
    if not product_events.empty:
        product_counts = (
            product_events.groupby("product_sku", as_index=False)
            .size()
            .rename(columns={"size": "interactions"})
            .sort_values(["interactions", "product_sku"], ascending=[False, True])
            .head(limit)
        )
        frequent_products = product_counts.to_dict(orient="records")

    frequent_categories = []
    if not product_events.empty and not products.empty:
        sku_map = products[["sku", "category"]].copy()
        sku_map["sku"] = sku_map["sku"].fillna("").astype(str)
        sku_map["category"] = sku_map["category"].fillna("").astype(str)
        with_cat = product_events.merge(sku_map, left_on="product_sku", right_on="sku", how="left")
        cat_counts = (
            with_cat[with_cat["category"].str.strip() != ""]
            .groupby("category", as_index=False)
            .size()
            .rename(columns={"size": "interactions"})
            .sort_values(["interactions", "category"], ascending=[False, True])
            .head(limit)
        )
        frequent_categories = cat_counts.to_dict(orient="records")

    customer_frequency = []
    customer_events = e[e["customer_key"].str.strip() != ""].copy()
    if not customer_events.empty:
        active_customers = (
            customer_events.groupby("customer_key", as_index=False)
            .size()
            .rename(columns={"size": "events"})
            .sort_values(["events", "customer_key"], ascending=[False, True])
            .head(customer_limit)
        )
        sku_map = products[["sku", "category"]].copy() if not products.empty else pd.DataFrame(columns=["sku", "category"])
        if not sku_map.empty:
            sku_map["sku"] = sku_map["sku"].fillna("").astype(str)
            sku_map["category"] = sku_map["category"].fillna("").astype(str)
        for rec in active_customers.to_dict(orient="records"):
            cid = str(rec["customer_key"])
            subset = customer_events[customer_events["customer_key"] == cid]
            top_page = _safe_top_str_value(subset[subset["page_url"].str.strip() != ""], "page_url")
            top_product = _safe_top_str_value(subset[subset["product_sku"].str.strip() != ""], "product_sku")
            top_category = None
            if top_product and not sku_map.empty:
                match = sku_map[sku_map["sku"] == top_product]
                if not match.empty:
                    val = str(match.iloc[0]["category"]).strip()
                    top_category = val or None
            user_info = user_map.get(cid, {})
            customer_frequency.append(
                {
                    "customer_id": cid,
                    "customer_name": user_info.get("name"),
                    "customer_email": user_info.get("email"),
                    "customer_gender": user_info.get("gender"),
                    "events": int(rec["events"]),
                    "top_page": top_page,
                    "top_product": top_product,
                    "top_category": top_category,
                }
            )

    previous_purchases_total = 0
    customers_with_previous_purchase = 0
    average_previous_purchases_per_repeat_customer = 0.0
    top_returning_customers = []

    if not orders.empty:
        o = orders.copy()
        o["user_id"] = o["user_id"].fillna("").astype(str).str.strip()
        o = o[o["user_id"] != ""]
        if not o.empty:
            order_counts = o.groupby("user_id", as_index=False).size().rename(columns={"size": "orders"})
            order_counts["previous_purchases"] = (order_counts["orders"] - 1).clip(lower=0)
            repeat = order_counts[order_counts["previous_purchases"] > 0]

            previous_purchases_total = int(repeat["previous_purchases"].sum()) if not repeat.empty else 0
            customers_with_previous_purchase = int(len(repeat.index))
            average_previous_purchases_per_repeat_customer = (
                float(previous_purchases_total / customers_with_previous_purchase)
                if customers_with_previous_purchase
                else 0.0
            )

            top_returning_customers = []
            for rec in (
                repeat.sort_values(["previous_purchases", "user_id"], ascending=[False, True])
                .head(limit)
                .to_dict(orient="records")
            ):
                cid = str(rec.get("user_id") or "")
                user_info = user_map.get(cid, {})
                top_returning_customers.append(
                    {
                        "customer_id": cid,
                        "customer_name": user_info.get("name"),
                        "customer_email": user_info.get("email"),
                        "customer_gender": user_info.get("gender"),
                        "orders": int(rec.get("orders") or 0),
                        "previous_purchases": int(rec.get("previous_purchases") or 0),
                    }
                )

    return {
        "click_through_rate": float(click_through_rate),
        "website_visits": int(website_visits),
        "website_visits_24h": int(website_visits_24h),
        "pages_per_visit": float(pages_per_visit),
        "average_time_on_page_seconds": float(avg_time_on_page_seconds),
        "average_time_on_product_page_seconds": float(avg_time_on_product_page_seconds),
        "time_on_site_total_seconds": float(time_on_site_total_seconds),
        "average_time_on_site_per_visit_seconds": float(average_time_on_site_per_visit_seconds),
        "previous_purchases_total": int(previous_purchases_total),
        "customers_with_previous_purchase": int(customers_with_previous_purchase),
        "average_previous_purchases_per_repeat_customer": float(average_previous_purchases_per_repeat_customer),
        "frequent_pages": frequent_pages,
        "frequent_products": frequent_products,
        "frequent_categories": frequent_categories,
        "customer_frequency": customer_frequency,
        "top_returning_customers": top_returning_customers,
    }


def time_of_day_analytics(event_types: list[str] | None = None) -> dict:
    events = read_table("web_events")
    if events.empty:
        return {
            "hours": [
                {"hour": h, "label": f"{h:02d}:00-{(h + 1) % 24:02d}:00", "events": 0, "page_views": 0, "purchases": 0, "likes": 0, "unique_visits": 0}
                for h in range(24)
            ],
            "summary": "No event data is available yet.",
        }

    e = events.copy()
    e["created_at"] = pd.to_datetime(e.get("created_at"), utc=True, errors="coerce")
    e = e.dropna(subset=["created_at"])
    e["event_type"] = e.get("event_type", "").fillna("unknown").astype(str).str.lower()
    e["hour"] = e["created_at"].dt.hour
    if event_types:
        normalized = [str(et).strip().lower() for et in event_types if str(et).strip()]
        if normalized:
            e = e[e["event_type"].isin(normalized)]

    rows = []
    for hour in range(24):
        subset = e[e["hour"] == hour]
        if subset.empty:
            rows.append({
                "hour": hour,
                "label": f"{hour:02d}:00-{(hour + 1) % 24:02d}:00",
                "events": 0,
                "page_views": 0,
                "purchases": 0,
                "likes": 0,
                "unique_visits": 0,
            })
            continue

        page_views = int(subset[subset["event_type"] == "page_view"].shape[0])
        purchases = int(subset[subset["event_type"] == "purchase"].shape[0])
        likes = int(subset[subset["event_type"] == "like"].shape[0])
        unique_visits = int(
            _normalise_identity(subset["session_id"].fillna(""), subset["user_id"].fillna("") )
            .replace("", pd.NA)
            .dropna()
            .nunique()
        )

        rows.append({
            "hour": hour,
            "label": f"{hour:02d}:00-{(hour + 1) % 24:02d}:00",
            "events": int(subset.shape[0]),
            "page_views": page_views,
            "purchases": purchases,
            "likes": likes,
            "unique_visits": unique_visits,
        })

    max_events = max((row["events"] for row in rows), default=0)
    best = next((row for row in rows if row["events"] == max_events), None)
    summary = (
        f"Peak activity is between {best['label']} with {best['events']} events."
        if best and best["events"] > 0
        else "No hourly event data is available."
    )

    return {
        "hours": rows,
        "summary": summary,
    }


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _load_demographic_sources() -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    root = _repo_root()

    def _pick_case_insensitive(folder: Path, candidates: list[str]) -> Path | None:
        for name in candidates:
            path = folder / name
            if path.exists():
                return path
        try:
            files = {p.name.lower(): p for p in folder.iterdir() if p.is_file()}
        except FileNotFoundError:
            return None
        for name in candidates:
            match = files.get(name.lower())
            if match:
                return match
        return None

    customer_candidates = ["customers.csv"]
    product_candidates = ["products.csv"]
    events_candidates = ["events.xlsx", "eventss.xlsx", "events.xls", "events.xlsm"]
    constructed_candidates = [
        "customer_dataset.csv",
        "customer dataset.csv",
        "constructed_customer_dataset.csv",
        "constructed customer dataset.csv",
        "Constructed  Customer Dataset.csv",
        "Constructed Customer Dataset.csv",
    ]

    search_dirs = [root / "old_data", root]
    for folder in search_dirs:
        customers_path = _pick_case_insensitive(folder, customer_candidates)
        products_path = _pick_case_insensitive(folder, product_candidates)
        events_path = _pick_case_insensitive(folder, events_candidates)
        constructed_path = _pick_case_insensitive(folder, constructed_candidates)

        if not customers_path or not products_path or not events_path or not constructed_path:
            continue

        customers = pd.read_csv(customers_path)
        products = pd.read_csv(products_path)
        events = pd.read_excel(events_path, sheet_name=0)
        constructed = pd.read_csv(constructed_path)
        return customers, products, events, constructed

    return (
        pd.DataFrame(),
        pd.DataFrame(),
        pd.DataFrame(),
        pd.DataFrame(),
    )


def _age_bands(series: pd.Series) -> pd.Series:
    ages = pd.to_numeric(series, errors="coerce")
    bins = [0, 17, 24, 34, 44, 54, 64, 200]
    labels = ["<18", "18-24", "25-34", "35-44", "45-54", "55-64", "65+"]
    grouped = pd.cut(ages, bins=bins, labels=labels, include_lowest=True)
    return grouped.astype(str).replace("nan", "Unknown")


def _top_category_by_group(
    df: pd.DataFrame,
    group_col: str,
    limit: int,
    min_events: int,
    max_groups: int,
) -> list[dict]:
    if df.empty:
        return []

    tmp = df.copy()
    tmp[group_col] = tmp[group_col].fillna("Unknown").astype(str).replace("", "Unknown")
    tmp["category"] = tmp["category"].fillna("Unknown").astype(str).replace("", "Unknown")
    tmp["is_purchase"] = tmp["event_type"].str.lower().eq("purchase")

    agg = (
        tmp.groupby([group_col, "category"], as_index=False)
        .agg(
            events=("event_id", "count"),
            purchases=("is_purchase", "sum"),
            avg_base_price=("base_price", "mean"),
            premium_share=("is_premium", "mean"),
        )
        .sort_values(["events", "purchases"], ascending=[False, False])
    )
    agg = agg[agg["events"] >= min_events]
    if agg.empty:
        return []

    agg["purchase_share"] = agg["purchases"] / agg["events"]

    rows: list[dict] = []
    group_totals = (
        agg.groupby(group_col, as_index=False)["events"].sum().sort_values(["events", group_col], ascending=[False, True])
    )
    allowed_groups = set(group_totals.head(max_groups)[group_col].tolist())
    for group_value, grp in agg.groupby(group_col, sort=False):
        if group_value not in allowed_groups:
            continue
        top = grp.sort_values(["purchases", "events", "category"], ascending=[False, False, True]).head(limit)
        for _, row in top.iterrows():
            rows.append(
                {
                    "group": str(group_value),
                    "category": str(row["category"]),
                    "events": int(row["events"]),
                    "purchases": int(row["purchases"]),
                    "purchase_share": float(row["purchase_share"]),
                    "avg_base_price": float(row["avg_base_price"]) if pd.notna(row["avg_base_price"]) else None,
                    "premium_share": float(row["premium_share"]) if pd.notna(row["premium_share"]) else None,
                }
            )
    return rows


def _top_item_by_group(
    df: pd.DataFrame,
    group_col: str,
    item_col: str,
    limit: int,
    min_events: int,
    max_groups: int,
) -> list[dict]:
    if df.empty or item_col not in df.columns:
        return []

    tmp = df.copy()
    tmp[group_col] = tmp[group_col].fillna("Unknown").astype(str).replace("", "Unknown")
    tmp[item_col] = tmp[item_col].fillna("Unknown").astype(str).replace("", "Unknown")
    tmp["is_purchase"] = tmp["event_type"].str.lower().eq("purchase")

    agg = (
        tmp.groupby([group_col, item_col], as_index=False)
        .agg(
            events=("event_id", "count"),
            purchases=("is_purchase", "sum"),
            avg_base_price=("base_price", "mean"),
            premium_share=("is_premium", "mean"),
        )
        .sort_values(["events", "purchases"], ascending=[False, False])
    )
    agg = agg[agg["events"] >= min_events]
    if agg.empty:
        return []

    agg["purchase_share"] = agg["purchases"] / agg["events"]

    rows: list[dict] = []
    group_totals = (
        agg.groupby(group_col, as_index=False)["events"].sum().sort_values(["events", group_col], ascending=[False, True])
    )
    allowed_groups = set(group_totals.head(max_groups)[group_col].tolist())
    for group_value, grp in agg.groupby(group_col, sort=False):
        if group_value not in allowed_groups:
            continue
        top = grp.sort_values(["purchases", "events", item_col], ascending=[False, False, True]).head(limit)
        for _, row in top.iterrows():
            rows.append(
                {
                    "group": str(group_value),
                    "category": str(row[item_col]),
                    "events": int(row["events"]),
                    "purchases": int(row["purchases"]),
                    "purchase_share": float(row["purchase_share"]),
                    "avg_base_price": float(row["avg_base_price"]) if pd.notna(row["avg_base_price"]) else None,
                    "premium_share": float(row["premium_share"]) if pd.notna(row["premium_share"]) else None,
                }
            )
    return rows


def customer_product_insights(limit: int = 5, min_events: int = 20) -> dict:
    customers, products, events, constructed = _load_demographic_sources()
    if customers.empty or products.empty or events.empty or constructed.empty:
        return {
            "by_age": [],
            "by_gender": [],
            "by_country": [],
            "by_state": [],
            "by_city": [],
            "by_loyalty_tier": [],
            "by_label": [],
            "notes": [
                "Missing one or more required files in old_data/: customers.csv, products.csv, events.xlsx (or Eventss.xlsx), customer_dataset.csv (or Constructed  Customer Dataset.csv).",
            ],
        }

    customers = customers.copy()
    products = products.copy()
    events = events.copy()
    constructed = constructed.copy()

    customers["customer_id"] = pd.to_numeric(customers["customer_id"], errors="coerce").astype("Int64")
    customers["age_group"] = _age_bands(customers.get("age"))
    customers["gender"] = customers.get("gender", "").fillna("Unknown").astype(str).str.strip().replace("", "Unknown")
    customers["country"] = customers.get("country", "").fillna("Unknown").astype(str).str.strip().replace("", "Unknown")
    customers["loyalty_tier"] = (
        customers.get("loyalty_tier", "").fillna("Unknown").astype(str).str.strip().replace("", "Unknown")
    )

    products["product_id_int"] = pd.to_numeric(products["product_id"], errors="coerce").astype("Int64")
    products["category"] = products.get("category", "").fillna("Unknown").astype(str).str.strip().replace("", "Unknown")
    products["base_price"] = pd.to_numeric(products.get("base_price"), errors="coerce")
    products["is_premium"] = pd.to_numeric(products.get("is_premium"), errors="coerce").fillna(0)

    events["customer_id"] = pd.to_numeric(events.get("customer_id"), errors="coerce").astype("Int64")
    events["product_id_int"] = pd.to_numeric(events.get("product_id"), errors="coerce").astype("Int64")
    events["event_type"] = events.get("event_type", "").fillna("").astype(str).str.strip().str.lower()

    constructed["customer_id"] = pd.to_numeric(constructed.get("customer_id"), errors="coerce").astype("Int64")
    constructed["state"] = constructed.get("state", "").fillna("Unknown").astype(str).str.strip().replace("", "Unknown")
    constructed["city"] = constructed.get("city", "").fillna("Unknown").astype(str).str.strip().replace("", "Unknown")
    constructed["label"] = pd.to_numeric(constructed.get("label"), errors="coerce").fillna(-1).astype(int)

    customer_profile = customers.merge(constructed, on="customer_id", how="left", suffixes=("", "_constructed"))

    merged = events.merge(customer_profile, on="customer_id", how="left", suffixes=("", "_cust"))
    merged = merged.merge(
        products.drop(columns=["product_id"], errors="ignore"),
        on="product_id_int",
        how="left",
        suffixes=("", "_prod"),
    )

    usable = merged[merged["category"].notna()].copy()
    if usable.empty:
        return {
            "by_age": [],
            "by_gender": [],
            "by_country": [],
            "by_state": [],
            "by_city": [],
            "by_city_product": [],
            "by_loyalty_tier": [],
            "by_label": [],
            "notes": [
                "No events could be linked to products for category insights.",
            ],
        }

    max_groups = 10
    by_age = _top_category_by_group(usable, "age_group", limit=limit, min_events=min_events, max_groups=max_groups)
    by_gender = _top_category_by_group(usable, "gender", limit=limit, min_events=min_events, max_groups=max_groups)
    by_country = _top_category_by_group(usable, "country", limit=limit, min_events=min_events, max_groups=max_groups)
    by_state = _top_category_by_group(usable, "state", limit=limit, min_events=min_events, max_groups=max_groups)
    by_city = _top_category_by_group(usable, "city", limit=limit, min_events=min_events, max_groups=max_groups)
    by_loyalty = _top_category_by_group(
        usable, "loyalty_tier", limit=limit, min_events=min_events, max_groups=max_groups
    )
    by_label = _top_category_by_group(usable, "label", limit=limit, min_events=min_events, max_groups=max_groups)
    usable["product_label"] = usable["product_id_int"].apply(
        lambda value: f"Product {int(value)}" if pd.notna(value) else "Unknown"
    )
    by_city_product = _top_item_by_group(
        usable, "city", "product_label", limit=limit, min_events=min_events, max_groups=max_groups
    )

    return {
        "by_age": by_age,
        "by_gender": by_gender,
        "by_country": by_country,
        "by_state": by_state,
        "by_city": by_city,
        "by_city_product": by_city_product,
        "by_loyalty_tier": by_loyalty,
        "by_label": by_label,
        "notes": [
            "Insights are derived from events.xlsx (or Eventss.xlsx) joined to customers.csv, products.csv, and customer_dataset.csv (Constructed Customer Dataset).",
            "Location is based on city/state from the constructed dataset; demographics are from customers.csv.",
        ],
    }


def product_visits_by_user(user_id: str | None = None, hour_of_day: int | None = None) -> dict:
    """Get product visits (page_views) by user with optional hour of day filtering.
    
    Args:
        user_id: Optional user ID to filter by
        hour_of_day: Optional hour (0-23) to filter by
    
    Returns:
        Dictionary with product visits summary and details
    """
    events = read_table("web_events")
    if events.empty:
        return {"summary": "No event data available", "products": [], "total_visits": 0}
    
    e = events.copy()
    e["created_at"] = pd.to_datetime(e.get("created_at"), utc=True, errors="coerce")
    e = e.dropna(subset=["created_at"])
    
    # Extract hour from created_at
    e["hour"] = e["created_at"].dt.hour
    
    # Filter by event type
    e = e[e["event_type"].astype(str).str.lower().isin(["page_view", "product_detail"])]
    
    # Filter by user_id if provided
    if user_id:
        e = e[e["user_id"] == user_id]
    
    # Filter by hour of day if provided
    if hour_of_day is not None and 0 <= hour_of_day <= 23:
        e = e[e["hour"] == hour_of_day]
    
    if e.empty:
        return {"summary": "No matching visits found", "products": [], "total_visits": 0, "filters": {"user_id": user_id, "hour_of_day": hour_of_day}}
    
    # Group by product_sku and count visits
    product_visits = e.groupby("product_sku", as_index=False).size().rename(columns={"size": "visits"})
    product_visits = product_visits.sort_values("visits", ascending=False)
    
    # Add product details if available
    products_df = read_table("products")
    if not products_df.empty:
        product_visits = product_visits.merge(
            products_df[["sku", "name", "category", "price"]],
            left_on="product_sku",
            right_on="sku",
            how="left"
        )
        product_visits = product_visits.drop(columns=["sku"])
    
    total_visits = len(e)
    unique_users = e["user_id"].nunique() if user_id is None else 1
    unique_sessions = e["session_id"].nunique()
    
    return {
        "summary": f"Found {total_visits} visits across {product_visits.shape[0]} products",
        "total_visits": int(total_visits),
        "unique_users": int(unique_users),
        "unique_sessions": int(unique_sessions),
        "filters": {"user_id": user_id, "hour_of_day": hour_of_day},
        "products": product_visits.to_dict(orient="records"),
    }


def shopping_patterns_by_hour() -> dict:
    """Get shopping patterns aggregated by hour of day.
    
    Returns:
        Dictionary with hourly shopping metrics
    """
    events = read_table("web_events")
    if events.empty:
        return {"summary": "No event data available", "hours": []}
    
    e = events.copy()
    e["created_at"] = pd.to_datetime(e.get("created_at"), utc=True, errors="coerce")
    e = e.dropna(subset=["created_at"])
    e["hour"] = e["created_at"].dt.hour
    e["event_type"] = e["event_type"].astype(str).str.lower()
    
    # Aggregate by hour
    hourly_data = []
    for hour in range(24):
        hour_events = e[e["hour"] == hour]
        if hour_events.empty:
            hourly_data.append({
                "hour": hour,
                "label": f"{hour:02d}:00-{(hour + 1) % 24:02d}:00",
                "total_events": 0,
                "unique_users": 0,
                "unique_sessions": 0,
                "page_views": 0,
                "purchases": 0,
                "likes": 0,
                "add_to_cart": 0,
            })
        else:
            hourly_data.append({
                "hour": hour,
                "label": f"{hour:02d}:00-{(hour + 1) % 24:02d}:00",
                "total_events": len(hour_events),
                "unique_users": hour_events["user_id"].nunique(),
                "unique_sessions": hour_events["session_id"].nunique(),
                "page_views": len(hour_events[hour_events["event_type"] == "page_view"]),
                "purchases": len(hour_events[hour_events["event_type"] == "purchase"]),
                "likes": len(hour_events[hour_events["event_type"] == "like"]),
                "add_to_cart": len(hour_events[hour_events["event_type"] == "add_to_cart"]),
            })
    
    # Find peak hours
    peak_hour = max(hourly_data, key=lambda x: x["total_events"])
    avg_events_per_hour = sum(h["total_events"] for h in hourly_data) / 24
    
    return {
        "summary": f"Peak shopping hour: {peak_hour['label']} with {peak_hour['total_events']} events",
        "peak_hour": peak_hour,
        "average_events_per_hour": avg_events_per_hour,
        "hours": hourly_data,
    }

