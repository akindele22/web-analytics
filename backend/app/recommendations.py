from __future__ import annotations

from typing import Any

import pandas as pd

from app.store import read_table

try:
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.svm import SVC
    from sklearn.preprocessing import StandardScaler
    SKLEARN_AVAILABLE = True
except ImportError:  # pragma: no cover
    SKLEARN_AVAILABLE = False


DEFAULT_MODEL = "random_forest"


def _safe_int(value: Any) -> int:
    try:
        return int(value)
    except Exception:
        return 0


def _safe_float(value: Any) -> float:
    try:
        return float(value)
    except Exception:
        return 0.0


def _aggregate_product_metrics() -> pd.DataFrame:
    events = read_table("web_events")
    products = read_table("products")
    if events.empty or products.empty:
        return pd.DataFrame()

    events = events.copy()
    events["product_sku"] = events["product_sku"].fillna("").astype(str).str.strip()
    events = events[events["product_sku"] != ""]
    if events.empty:
        return pd.DataFrame()

    page_views = events[events["event_type"] == "page_view"].groupby("product_sku").size().rename("page_views")
    clicks = events[events["event_type"] == "click"].groupby("product_sku").size().rename("clicks")
    likes = events[events["event_type"] == "like"].groupby("product_sku").size().rename("likes")
    purchases = events[events["event_type"] == "purchase"].groupby("product_sku").size().rename("purchases")

    table = pd.concat([page_views, clicks, likes, purchases], axis=1).fillna(0)
    table["views"] = table["page_views"] + table["clicks"]
    table["views"] = table["views"].astype(int)
    table["page_views"] = table["page_views"].astype(int)
    table["clicks"] = table["clicks"].astype(int)
    table["likes"] = table["likes"].astype(int)
    table["purchases"] = table["purchases"].astype(int)
    table["conversion_rate"] = table.apply(lambda row: float(row["purchases"]) / row["views"] if row["views"] > 0 else 0.0, axis=1)
    table["like_rate"] = table.apply(lambda row: float(row["likes"]) / row["views"] if row["views"] > 0 else 0.0, axis=1)
    table["engagement_score"] = table["likes"] + table["purchases"] * 2

    product_map = products[["sku", "name", "category", "price"]].copy()
    product_map["sku"] = product_map["sku"].fillna("").astype(str).str.strip()
    product_map["name"] = product_map["name"].fillna("Unknown").astype(str)
    product_map["category"] = product_map["category"].fillna("Unknown").astype(str)
    product_map["price"] = pd.to_numeric(product_map["price"], errors="coerce").fillna(0.0)

    table = table.reset_index().rename(columns={"index": "product_sku"})
    table = table.merge(product_map, left_on="product_sku", right_on="sku", how="left")
    table["product_name"] = table["name"].fillna("Unknown")
    table["category"] = table["category"].fillna("Unknown")
    table["price"] = table["price"].fillna(0.0)
    return table[[
        "product_sku",
        "product_name",
        "category",
        "price",
        "views",
        "page_views",
        "clicks",
        "likes",
        "purchases",
        "conversion_rate",
        "like_rate",
        "engagement_score",
    ]]


def _label_action(row: pd.Series) -> str:
    views = _safe_int(row["views"])
    likes = _safe_int(row["likes"])
    purchases = _safe_int(row["purchases"])
    conversion_rate = _safe_float(row["conversion_rate"])

    if views >= 30 and conversion_rate < 0.05:
        return "Improve product page and pricing to boost conversions"
    if likes >= 15 and conversion_rate < 0.08:
        return "Run a promotional campaign; product has interest but low conversion"
    if purchases >= 10 and conversion_rate >= 0.15:
        return "Strong performer; feature this product in campaigns"
    if views < 20 and purchases < 2:
        return "Increase visibility with targeted marketing or homepage placement"
    if likes > 0 and purchases == 0:
        return "Check product messaging and images; customers are interested but not buying"
    return "Monitor performance and collect more customer feedback"


def _build_training_data(table: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series]:
    if table.empty:
        return pd.DataFrame(), pd.Series(dtype=str)

    labeled = table.copy()
    labeled["action"] = labeled.apply(_label_action, axis=1)
    feature_columns = ["views", "likes", "purchases", "conversion_rate", "like_rate", "price"]
    features = labeled[feature_columns].copy()
    labels = labeled["action"].astype(str)
    return features, labels


def _make_model(model_name: str):
    if not SKLEARN_AVAILABLE:
        raise RuntimeError("scikit-learn is not installed")

    model_name = (model_name or DEFAULT_MODEL).strip().lower()
    if model_name == "svm":
        return SVC(probability=True, kernel="rbf", random_state=42)
    return RandomForestClassifier(n_estimators=200, random_state=42)


def generate_admin_recommendation_insights(model_name: str = DEFAULT_MODEL, top_n: int = 8) -> dict[str, Any]:
    table = _aggregate_product_metrics()
    if table.empty:
        return {
            "engine": model_name,
            "model_available": SKLEARN_AVAILABLE,
            "recommendations": [],
            "notes": ["Not enough analytics data available to generate recommendations."],
        }

    features, labels = _build_training_data(table)
    recommendations: list[dict[str, Any]] = []
    notes: list[str] = []

    if SKLEARN_AVAILABLE and len(set(labels.tolist())) > 1:
        try:
            scaler = StandardScaler()
            X = scaler.fit_transform(features)
            model = _make_model(model_name)
            model.fit(X, labels)
            probabilities = model.predict_proba(X)
            predictions = model.predict(X)
            for idx, row in table.iterrows():
                prediction = str(predictions[idx])
                probability = float(max(probabilities[idx])) if probabilities.ndim == 2 else 0.0
                recommendations.append(
                    {
                        "product_sku": row["product_sku"],
                        "product_name": row["product_name"],
                        "category": row["category"],
                        "views": int(row["views"]),
                        "page_views": int(row["page_views"]),
                        "clicks": int(row["clicks"]),
                        "likes": int(row["likes"]),
                        "purchases": int(row["purchases"]),
                        "conversion_rate": float(row["conversion_rate"]),
                        "action": prediction,
                        "confidence": round(probability, 3),
                        "explanation": "Predicted by the analytics recommendation model.",
                    }
                )
            notes.append("Trained a recommendation model from engagement analytics.")
        except Exception as error:
            notes.append(f"Failed to train recommendation model: {error}")
            notes.append("Falling back to heuristic recommendations.")

    if not recommendations:
        notes.append("Using heuristic recommendation rules because the model could not be trained.")
        for _, row in table.iterrows():
            recommendations.append(
                {
                    "product_sku": row["product_sku"],
                    "product_name": row["product_name"],
                    "category": row["category"],
                    "views": int(row["views"]),
                    "page_views": int(row["page_views"]),
                    "clicks": int(row["clicks"]),
                    "likes": int(row["likes"]),
                    "purchases": int(row["purchases"]),
                    "conversion_rate": float(row["conversion_rate"]),
                    "action": _label_action(row),
                    "confidence": None,
                    "explanation": "Heuristic recommendation based on product engagement and conversion rates.",
                }
            )

    recommendations = sorted(
        recommendations,
        key=lambda item: (
            -item["views"],
            -item["likes"],
            -item["purchases"],
        ),
    )[:top_n]

    if not notes:
        notes.append("Generated recommendation insights from analytics data.")

    return {
        "engine": model_name,
        "model_available": SKLEARN_AVAILABLE,
        "recommendations": recommendations,
        "notes": notes,
    }


def format_admin_recommendation_summary(insights: dict[str, Any], max_items: int = 3) -> str:
    recommendations = insights.get("recommendations") or []
    if not recommendations:
        return "No recommendation insights are available."

    summary_lines = [
        "Here are the top e-commerce recommendation insights from your analytics data:",
    ]
    for row in recommendations[:max_items]:
        summary_lines.append(
            f"• {row['product_name']} ({row['product_sku']}): {row['action']} "
            f"(views={row['views']}, likes={row['likes']}, purchases={row['purchases']})"
        )
    if insights.get("engine"):
        summary_lines.append(f"Model engine: {insights['engine']}.")
    if not insights.get("model_available"):
        summary_lines.append("Note: scikit-learn is unavailable; using heuristic recommendations.")
    return "\n".join(summary_lines)
