from __future__ import annotations

from app.csv_store import add_products_if_missing


def main() -> None:
    demo = [
        {"sku": "sku-001", "name": "Classic Sneakers", "category": "Shoes", "price": 79.99},
        {"sku": "sku-002", "name": "Everyday Hoodie", "category": "Apparel", "price": 49.0},
        {"sku": "sku-003", "name": "Minimal Backpack", "category": "Accessories", "price": 59.5},
        {"sku": "sku-004", "name": "Wireless Earbuds", "category": "Electronics", "price": 89.99},
        {"sku": "sku-005", "name": "Stainless Water Bottle", "category": "Home", "price": 18.99},
    ]

    inserted = add_products_if_missing(demo)
    print(f"Seeded {inserted} products.")


if __name__ == "__main__":
    main()

