from __future__ import annotations

import math
import json
import secrets
from datetime import datetime, timedelta, timezone
from hashlib import pbkdf2_hmac
from pathlib import Path
from typing import Any
from uuid import uuid4

from flask import Blueprint, jsonify, make_response, request
import pandas as pd

from app.config import settings
from app.store import append_rows, create_order, read_table
from app.kpi import (
    customer_product_insights,
    overview_kpis,
    product_interaction_cube,
    product_visits_by_user,
    shopping_patterns_by_hour,
    time_of_day_analytics,
    top_products_by_likes,
    website_analytics,
)
from app.chatbot import get_chatbot
from app.recommendations import generate_admin_recommendation_insights


api = Blueprint("api", __name__, url_prefix="/api")
_CHATBOT = None  # Lazy-loaded on first use

def _get_sessions_path() -> Path:
    return Path(settings.data_dir, "sessions.json")

def _load_sessions() -> dict[str, Any]:
    path = _get_sessions_path()
    if not path.exists():
        return {}
    try:
        with open(path, "r") as f:
            content = f.read().strip()
            if not content:
                return {}
            data = json.loads(content)
            # Convert ISO strings back to datetime objects
            for token in data:
                if "created_at" in data[token]:
                    data[token]["created_at"] = datetime.fromisoformat(data[token]["created_at"])
            return data
    except Exception:
        return {}

def _save_sessions(sessions: dict[str, Any]):
    path = _get_sessions_path()
    # Convert datetimes to ISO strings for JSON
    to_save = {k: {**v, "created_at": v["created_at"].isoformat() if isinstance(v.get("created_at"), datetime) else v.get("created_at")} for k, v in sessions.items()}
    with open(path, "w") as f:
        json.dump(to_save, f)


def _json_safe(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: _json_safe(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_json_safe(v) for v in value]
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    try:
        if pd.isna(value):
            return None
    except Exception:
        pass
    return value


def _json_response(payload: Any, status: int = 200):
    return jsonify(_json_safe(payload)), status


def _cors_response(payload: Any, status: int = 200):
    resp = make_response(jsonify(_json_safe(payload)), status)
    origin = request.headers.get("Origin") or settings.frontend_origin
    resp.headers["Access-Control-Allow-Origin"] = origin
    resp.headers["Vary"] = "Origin"
    resp.headers["Access-Control-Allow-Credentials"] = "true"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return resp


def _export_path(*parts: str) -> Path:
    return Path(settings.export_dir, *parts)


def _read_export_csv(path: Path) -> pd.DataFrame:
    if not path.exists():
        return pd.DataFrame()
    try:
        return pd.read_csv(path)
    except Exception:
        return pd.DataFrame()


def _read_export_insight(name: str) -> pd.DataFrame:
    return _read_export_csv(_export_path("insights", name))


def _overview_from_export() -> dict[str, Any] | None:
    df = _read_export_csv(_export_path("admin_kpis.csv"))
    if df.empty:
        return None
    df = df.apply(pd.to_numeric, errors="coerce")
    df = df.where(pd.notna(df), None)
    row = df.iloc[0].to_dict()
    return row


def _top_products_from_export(limit: int) -> pd.DataFrame | None:
    df = _read_export_csv(_export_path("top_products_by_likes.csv"))
    if df.empty:
        return None
    df = df.copy()
    if "likes" in df.columns:
        df["likes"] = pd.to_numeric(df["likes"], errors="coerce").fillna(0).astype(int)
    df = df.head(limit)
    return df


def _interaction_cube_from_export(limit: int) -> pd.DataFrame | None:
    df = _read_export_csv(_export_path("product_interaction_cube.csv"))
    if df.empty:
        return None
    df = df.copy()
    for col in ["views", "likes", "purchases"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0).astype(int)
    df = df.head(limit)
    return df


def _insight_rows(df: pd.DataFrame, group_col: str) -> list[dict]:
    if df.empty or group_col not in df.columns:
        return []
    tmp = df.copy()
    tmp = tmp.rename(columns={group_col: "group"})
    for col in ["events", "purchases", "avg_base_price", "purchase_share", "premium_share"]:
        if col in tmp.columns:
            tmp[col] = pd.to_numeric(tmp[col], errors="coerce")
    tmp["group"] = tmp["group"].fillna("Unknown").astype(str).replace("", "Unknown")
    tmp["category"] = tmp.get("category", "").fillna("Unknown").astype(str).replace("", "Unknown")
    tmp["events"] = tmp.get("events", 0).fillna(0).astype(int)
    tmp["purchases"] = tmp.get("purchases", 0).fillna(0).astype(int)
    tmp["purchase_share"] = tmp.get("purchase_share", 0).fillna(0).astype(float)
    tmp["avg_base_price"] = tmp.get("avg_base_price", pd.NA)
    tmp["premium_share"] = tmp.get("premium_share", pd.NA)
    return tmp[
        ["group", "category", "events", "purchases", "purchase_share", "avg_base_price", "premium_share"]
    ].to_dict(orient="records")


def _city_product_from_export(limit: int, min_events: int) -> list[dict]:
    df = _read_export_insight("unified_customer_product_events.csv")
    if df.empty:
        return []
    tmp = df.copy()
    tmp["city"] = tmp.get("city", "").fillna("Unknown").astype(str).replace("", "Unknown")
    if "product_id_int" in tmp.columns:
        tmp["product_id_int"] = pd.to_numeric(tmp["product_id_int"], errors="coerce")
        tmp["product_label"] = tmp["product_id_int"].apply(
            lambda value: f"Product {int(value)}" if pd.notna(value) else "Unknown"
        )
    else:
        tmp["product_label"] = tmp.get("product_id", "").fillna("Unknown").astype(str).replace("", "Unknown")
    tmp["event_type"] = tmp.get("event_type", "").fillna("").astype(str).str.lower()
    tmp["is_purchase"] = tmp["event_type"].eq("purchase")

    agg = (
        tmp.groupby(["city", "product_label"], as_index=False)
        .agg(
            events=("event_id", "count"),
            purchases=("is_purchase", "sum"),
            avg_base_price=("base_price", "mean"),
        )
        .sort_values(["events", "purchases"], ascending=[False, False])
    )
    agg = agg[agg["events"] >= min_events]
    if agg.empty:
        return []

    agg["purchase_share"] = agg["purchases"] / agg["events"]

    rows: list[dict] = []
    group_totals = (
        agg.groupby("city", as_index=False)["events"].sum().sort_values(["events", "city"], ascending=[False, True])
    )
    allowed_groups = set(group_totals.head(6)["city"].tolist())
    for group_value, grp in agg.groupby("city", sort=False):
        if group_value not in allowed_groups:
            continue
        top = grp.sort_values(["purchases", "events", "product_label"], ascending=[False, False, True]).head(limit)
        for _, row in top.iterrows():
            rows.append(
                {
                    "group": str(group_value),
                    "category": str(row["product_label"]),
                    "events": int(row["events"]),
                    "purchases": int(row["purchases"]),
                    "purchase_share": float(row["purchase_share"]),
                    "avg_base_price": float(row["avg_base_price"]) if pd.notna(row["avg_base_price"]) else None,
                    "premium_share": None,
                }
            )
    return rows


def _customer_product_insights_from_export(limit: int, min_events: int) -> dict[str, Any] | None:
    base_files = {
        "by_age": ("unified_category_by_age_group.csv", "age_group"),
        "by_gender": ("unified_category_by_gender.csv", "gender"),
        "by_country": ("unified_category_by_country.csv", "country"),
        "by_state": ("unified_category_by_state.csv", "state"),
        "by_city": ("unified_category_by_city.csv", "city"),
        "by_loyalty_tier": ("unified_category_by_loyalty_tier.csv", "loyalty_tier"),
        "by_label": ("unified_category_by_label.csv", "label"),
    }

    missing = []
    rows: dict[str, list[dict]] = {}
    for key, (filename, group_col) in base_files.items():
        df = _read_export_insight(filename)
        if df.empty:
            missing.append(filename)
            rows[key] = []
        else:
            rows[key] = _insight_rows(df, group_col)

    rows["by_city_product"] = _city_product_from_export(limit=limit, min_events=min_events)

    if all(len(v) == 0 for v in rows.values()):
        return None

    notes = []
    if missing:
        notes.append(f"Missing insight export files: {', '.join(missing)}.")
    notes.append("Insights loaded from exports/insights CSVs.")

    return {
        "by_age": rows["by_age"],
        "by_gender": rows["by_gender"],
        "by_country": rows["by_country"],
        "by_state": rows["by_state"],
        "by_city": rows["by_city"],
        "by_city_product": rows["by_city_product"],
        "by_loyalty_tier": rows["by_loyalty_tier"],
        "by_label": rows["by_label"],
        "notes": notes,
    }


def _site_frequents_from_export(limit: int) -> dict[str, list[dict]] | None:
    df = _read_export_insight("unified_customer_product_events.csv")
    if df.empty:
        return None

    tmp = df.copy()
    page_col = "page_url" if "page_url" in tmp.columns else "page_category"
    tmp[page_col] = tmp.get(page_col, "").fillna("").astype(str).str.strip()
    tmp["product_id"] = tmp.get("product_id_int", tmp.get("product_id", "")).fillna("").astype(str).str.strip()
    tmp["category"] = tmp.get("category", "").fillna("").astype(str).str.strip()

    frequent_pages = []
    if page_col in tmp.columns:
        page_counts = (
            tmp[tmp[page_col] != ""]
            .groupby(page_col, as_index=False)
            .size()
            .rename(columns={"size": "views", page_col: "page_url"})
            .sort_values(["views", "page_url"], ascending=[False, True])
            .head(limit)
        )
        frequent_pages = page_counts.to_dict(orient="records")

    frequent_products = []
    if "product_id" in tmp.columns:
        product_counts = (
            tmp[tmp["product_id"] != ""]
            .groupby("product_id", as_index=False)
            .size()
            .rename(columns={"size": "interactions", "product_id": "product_sku"})
            .sort_values(["interactions", "product_sku"], ascending=[False, True])
            .head(limit)
        )
        frequent_products = product_counts.to_dict(orient="records")

    frequent_categories = []
    if "category" in tmp.columns:
        category_counts = (
            tmp[tmp["category"] != ""]
            .groupby("category", as_index=False)
            .size()
            .rename(columns={"size": "interactions"})
            .sort_values(["interactions", "category"], ascending=[False, True])
            .head(limit)
        )
        frequent_categories = category_counts.to_dict(orient="records")

    return {
        "frequent_pages": frequent_pages,
        "frequent_products": frequent_products,
        "frequent_categories": frequent_categories,
    }


@api.before_request
def handle_preflight():
    if request.method == "OPTIONS":
        return _cors_response({"ok": True})
    return None


@api.get("/health")
def health():
    return _cors_response({"status": "ok"})


def _hash_password(password: str, salt_hex: str | None = None) -> str:
    salt = bytes.fromhex(salt_hex) if salt_hex else secrets.token_bytes(16)
    digest = pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 120_000)
    return f"{salt.hex()}${digest.hex()}"


def _verify_password(password: str, stored: str) -> bool:
    if not stored or "$" not in stored:
        return False
    salt_hex, digest_hex = stored.split("$", 1)
    candidate = _hash_password(password, salt_hex)
    return secrets.compare_digest(candidate, stored)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _get_user_by_email(email: str) -> dict[str, Any] | None:
    users = read_table("users")
    if users is None or users.empty:
        return None
    email_norm = email.strip().lower()
    match = users[users["email"].fillna("").str.lower() == email_norm]
    if match.empty:
        return None
    return match.iloc[0].to_dict()


def _get_user_by_id(user_id: str) -> dict[str, Any] | None:
    users = read_table("users")
    if users is None or users.empty:
        return None
    match = users[users["user_id"].astype(str) == str(user_id)]
    if match.empty:
        return None
    return match.iloc[0].to_dict()


def _create_session(user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    sessions = _load_sessions()
    sessions[token] = {"user_id": user_id, "created_at": datetime.now(timezone.utc)}
    _save_sessions(sessions)
    return token


def _current_user() -> dict[str, Any] | None:
    token = request.cookies.get(settings.session_cookie_name)
    if not token:
        return None
    sessions = _load_sessions()
    session = sessions.get(token)
    if not session or not isinstance(session, dict):
        return None
    created_at = session.get("created_at")
    if isinstance(created_at, datetime):
        if datetime.now(timezone.utc) - created_at > timedelta(seconds=settings.session_ttl_seconds):
            sessions.pop(token, None)
            _save_sessions(sessions)
            return None
    return _get_user_by_id(session.get("user_id", ""))


def _require_admin() -> dict[str, Any] | tuple[dict, int]:
    """
    Decorable function that checks if current user is admin.
    Returns user dict if admin, otherwise returns error response tuple.
    """
    user = _current_user()
    if not user:
        return {"error": "unauthorized"}, 401
    if user.get("role") != "admin":
        return {"error": "forbidden: admin role required"}, 403
    return user


@api.post("/events")
def ingest_event():
    payload = request.get_json(silent=True) or {}
    event_type = str(payload.get("event_type") or "").strip()
    if not event_type:
        return jsonify({"error": "event_type is required"}), 400

    created_at = payload.get("created_at")
    if created_at:
        try:
            created_at = datetime.fromisoformat(str(created_at).replace("Z", "+00:00")).astimezone(
                timezone.utc
            ).isoformat()
        except Exception:
            created_at = datetime.now(timezone.utc).isoformat()
    else:
        created_at = datetime.now(timezone.utc).isoformat()

    event_id = str(uuid4())
    append_rows(
        "web_events",
        [
            {
                "id": event_id,
                "event_type": event_type,
                "user_id": payload.get("user_id"),
                "session_id": payload.get("session_id"),
                "page_url": payload.get("page_url"),
                "product_sku": payload.get("product_sku"),
                "platform": payload.get("platform"),
                "channel": payload.get("channel"),
                "utm_source": payload.get("utm_source"),
                "utm_medium": payload.get("utm_medium"),
                "utm_campaign": payload.get("utm_campaign"),
                "advertising_platform": payload.get("advertising_platform"),
                "ad_id": payload.get("ad_id"),
                "email_campaign_id": payload.get("email_campaign_id"),
                "social_network": payload.get("social_network"),
                "page_duration_ms": payload.get("page_duration_ms"),
                "event_value": payload.get("event_value"),
                "referrer": payload.get("referrer"),
                "user_agent": payload.get("user_agent") or request.headers.get("User-Agent"),
                "created_at": created_at,
                "metadata": payload.get("metadata") or {},
            }
        ],
    )
    return _cors_response({"ok": True, "id": event_id, "created_at": created_at})


@api.post("/auth/register")
def register_user():
    payload = request.get_json(silent=True) or {}
    name = str(payload.get("name") or "").strip()
    email = str(payload.get("email") or "").strip().lower()
    password = str(payload.get("password") or "").strip()
    gender = str(payload.get("gender") or "").strip()
    role = str(payload.get("role") or "user").strip().lower()

    if not name or not email or not password:
        return _cors_response({"error": "name, email, and password are required"}, 400)

    if _get_user_by_email(email):
        return _cors_response({"error": "email already exists"}, 409)

    user_id = str(uuid4())
    password_hash = _hash_password(password)
    append_rows(
        "users",
        [
            {
                "user_id": user_id,
                "name": name,
                "email": email,
                "gender": gender,
                "password_hash": password_hash,
                "role": role,
                "created_at": _now_iso(),
                "last_login_at": _now_iso(),
            }
        ],
    )

    token = _create_session(user_id)
    resp = _cors_response(
        {"ok": True, "user": {"user_id": user_id, "name": name, "email": email, "gender": gender, "role": role}}
    )
    resp.set_cookie(
        settings.session_cookie_name,
        token,
        httponly=True,
        samesite="None",   # ← changed
        secure=True,       # ← added
        max_age=settings.session_ttl_seconds,
    )
    return resp


@api.post("/auth/login")
def login_user():
    payload = request.get_json(silent=True) or {}
    email = str(payload.get("email") or "").strip().lower()
    password = str(payload.get("password") or "").strip()
    if not email or not password:
        return _cors_response({"error": "email and password are required"}, 400)

    user = _get_user_by_email(email)
    if not user or not _verify_password(password, str(user.get("password_hash") or "")):
        return _cors_response({"error": "invalid credentials"}, 401)

    token = _create_session(str(user.get("user_id")))
    resp = _cors_response(
        {
            "ok": True,
            "user": {
                "user_id": user.get("user_id"),
                "name": user.get("name"),
                "email": user.get("email"),
                "gender": user.get("gender"),
                "role": user.get("role"),
            },
        }
    )
    resp.set_cookie(
        settings.session_cookie_name,
        token,
        httponly=True,
        samesite="None",   # ← changed
        secure=True,       # ← added
        max_age=settings.session_ttl_seconds,
    )
    return resp

@api.post("/auth/logout")
def logout_user():
    token = request.cookies.get(settings.session_cookie_name)
    if token:
        sessions = _load_sessions()
        if token in sessions:
            sessions.pop(token)
            _save_sessions(sessions)
    resp = _cors_response({"ok": True})
    resp.delete_cookie(settings.session_cookie_name)
    return resp


@api.get("/auth/me")
def auth_me():
    user = _current_user()
    if not user:
        return _cors_response({"ok": False, "user": None}, 401)
    return _cors_response(
        {
            "ok": True,
            "user": {
                "user_id": user.get("user_id"),
                "name": user.get("name"),
                "email": user.get("email"),
                "gender": user.get("gender"),
                "role": user.get("role"),
            },
        }
    )


@api.get("/kpis/overview")
def kpis_overview():
    result = _require_admin()
    if isinstance(result, tuple):
        return _cors_response(result[0], result[1])

    # Initialize default structure to prevent frontend crashes
    default_kpis = {
        "total_sales": 0.0,
        "total_orders": 0,
        "average_order_value": 0.0,
        "page_views_24h": 0,
        "site_visits_24h": 0,
        "likes_24h": 0,
        "unique_users_24h": 0,
        "ctr_24h": 0.0
    }

    try:
        return _cors_response(overview_kpis().to_dict())
    except Exception as e:
        print(f"KPI calculation failed: {e}")
        export = _overview_from_export()
        return _cors_response(export or default_kpis)


@api.get("/kpis/top-products")
def kpis_top_products():
    result = _require_admin()
    if isinstance(result, tuple):
        return _cors_response(result[0], result[1])
    limit = int(request.args.get("limit", "10"))
    limit = max(1, min(limit, 200))
    try:
        df = top_products_by_likes(limit=limit)
    except Exception:
        df = _top_products_from_export(limit=limit) or pd.DataFrame(columns=["product_sku", "likes"])
    return _cors_response({"rows": df.to_dict(orient="records")})


@api.get("/kpis/interaction-cube")
def kpis_interaction_cube():
    result = _require_admin()
    if isinstance(result, tuple):
        return _cors_response(result[0], result[1])
    limit = int(request.args.get("limit", "200"))
    limit = max(1, min(limit, 500))
    try:
        df = product_interaction_cube(limit=limit)
    except Exception:
        df = _interaction_cube_from_export(limit=limit) or pd.DataFrame(columns=["product_sku", "views", "likes", "purchases"])
    return _cors_response({"rows": df.to_dict(orient="records")})


@api.get("/kpis/site-analytics")
def kpis_site_analytics():
    result = _require_admin()
    if isinstance(result, tuple):
        return _cors_response(result[0], result[1])
    limit = int(request.args.get("limit", "10"))
    customer_limit = int(request.args.get("customer_limit", str(limit)))
    limit = max(1, min(limit, 200))
    customer_limit = max(1, min(customer_limit, 200))
    return _cors_response(website_analytics(limit=limit, customer_limit=customer_limit))


@api.get("/kpis/time-of-day")
def kpis_time_of_day():
    result = _require_admin()
    if isinstance(result, tuple):
        return _cors_response(result[0], result[1])

    event_types = request.args.getlist("event_type")
    if not event_types:
        event_types = ["page_view", "purchase", "click", "like", "add_to_cart"]

    return _cors_response(time_of_day_analytics(event_types=event_types))


@api.get("/kpis/shopping-patterns")
def kpis_shopping_patterns():
    result = _require_admin()
    if isinstance(result, tuple):
        return _cors_response(result[0], result[1])

    return _cors_response(shopping_patterns_by_hour())


@api.get("/kpis/product-visits")
def kpis_product_visits():
    result = _require_admin()
    if isinstance(result, tuple):
        return _cors_response(result[0], result[1])

    user_id = request.args.get("user_id", default=None, type=str)
    hour_of_day_str = request.args.get("hour_of_day", default=None, type=str)
    hour_of_day = None
    
    if hour_of_day_str:
        try:
            hour_of_day = int(hour_of_day_str)
            if not (0 <= hour_of_day <= 23):
                hour_of_day = None
        except (ValueError, TypeError):
            hour_of_day = None

    return _cors_response(product_visits_by_user(user_id=user_id, hour_of_day=hour_of_day))


@api.get("/kpis/customer-product-insights")
def kpis_customer_product_insights():
    result = _require_admin()
    if isinstance(result, tuple):
        return _cors_response(result[0], result[1])
    limit = int(request.args.get("limit", "5"))
    min_events = int(request.args.get("min_events", "20"))
    limit = max(1, min(limit, 20))
    min_events = max(1, min(min_events, 500))
    export = _customer_product_insights_from_export(limit=limit, min_events=min_events)
    if export is not None:
        return _cors_response(export)
    return _cors_response(customer_product_insights(limit=limit, min_events=min_events))


@api.get("/products")
def list_products():
    rows = read_table("products")
    if rows.empty:
        return _cors_response({"rows": []})

    rows = rows.copy()
    rows["price"] = pd.to_numeric(rows["price"], errors="coerce")
    rows["price"] = rows["price"].where(rows["price"].notna(), None)
    rows["image_url"] = rows["image_url"].fillna("").astype(str).str.strip()
    rows["image_url"] = rows["image_url"].where(rows["image_url"] != "", None)
    rows = rows.sort_values("name", ascending=True).head(500)
    return _cors_response({"rows": rows.to_dict(orient="records")})


@api.get("/products/<sku>")
def get_product(sku: str):
    rows = read_table("products")
    if rows.empty:
        return _cors_response({"error": "not found"}, 404)
    match = rows[rows["sku"] == sku]
    if match.empty:
        return _cors_response({"error": "not found"}, 404)
    rec = match.iloc[0].to_dict()
    try:
        rec["price"] = float(rec["price"]) if str(rec["price"]).strip() else None
    except ValueError:
        rec["price"] = None
    img = str(rec.get("image_url") or "").strip()
    rec["image_url"] = img or None
    return _cors_response(rec)


@api.post("/orders")
def create_order_route():
    payload = request.get_json(silent=True) or {}
    order_id = str(payload.get("order_id") or "").strip()
    items = payload.get("items") or []
    user_id = payload.get("user_id") or None

    if not order_id:
        return _cors_response({"error": "order_id is required"}, 400)
    if not isinstance(items, list) or not items:
        return _cors_response({"error": "items must be a non-empty list"}, 400)

    ok, total = create_order(order_id=order_id, user_id=user_id, items=items)
    if not ok:
        return _cors_response({"error": "order_id already exists"}, 409)
    return _cors_response({"ok": True, "order_id": order_id, "total": total})


@api.post("/chat")
def chat_message():
    """Chat endpoint for AI chatbot."""
    global _CHATBOT

    # Lazy load chatbot
    if _CHATBOT is None:
        _CHATBOT = get_chatbot()

    payload = request.get_json(silent=True) or {}
    message = str(payload.get("message") or "").strip()
    action = str(payload.get("action") or "chat").strip().lower()
    session_id = str(payload.get("session_id") or "").strip() or None
    user_id = str(payload.get("user_id") or "").strip() or None

    if action != "clear" and not message:
        return _cors_response({"error": "message is required"}, 400)

    try:
        if action == "clear":
            _CHATBOT.clear_history(session_id or user_id or "anonymous")
            return _cors_response({"ok": True, "message": "Chat history cleared"})

        response = _CHATBOT.generate_response(message, user_id=user_id, session_id=session_id)

        return _cors_response({
            "ok": True,
            "message": response,
            "user_id": user_id,
            "session_id": session_id,
            "timestamp": _now_iso(),
        })
    except Exception as e:
        print(f"Chat error: {e}")
        return _cors_response({
            "error": "Failed to generate response",
            "details": str(e)
        }, 500)


@api.get("/admin/recommendations")
def admin_recommendations():
    """Admin-only recommendation insights based on analytics CSV data."""
    result = _require_admin()
    if isinstance(result, tuple):
        return _cors_response(result[0], result[1])

    insights = generate_admin_recommendation_insights()
    return _cors_response(insights)
