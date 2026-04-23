"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Product } from "@/lib/api";
import { TrackedLink } from "@/components/TrackedLink";
import ProductImage from "@/components/ProductImage";

const fallbackCategories = [
  "Beauty",
  "Shoes",
  "Apparel",
  "Accessories",
  "Fitness",
  "Electronics",
  "Misc",
  "Fashion",
  "Sports",
];

type StoreFilterProps = {
  products: Product[];
  categories: string[];
};

export default function StoreFilter({ products, categories }: StoreFilterProps) {
  const searchParams = useSearchParams();
  const [selectedCategory, setSelectedCategory] = useState("");
  const [liveProducts, setLiveProducts] = useState<Product[]>(products);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>(products);

  useEffect(() => {
    const apiBase = (process.env.NEXT_PUBLIC_API_BASE || "").replace(/\/+$/, "");
    const fetchUrl = apiBase ? `${apiBase}/api/products` : "/api/products";
    let isActive = true;

    async function loadProducts() {
      try {
        const response = await fetch(fetchUrl, { cache: "no-store" });
        if (!response.ok) throw new Error(`Failed to load products: ${response.status}`);
        const data = (await response.json()) as { rows: Product[] };
        if (!isActive) return;
        setLiveProducts(data.rows);
      } catch {
        if (!isActive) return;
        setLiveProducts(products);
      }
    }

    void loadProducts();

    return () => {
      isActive = false;
    };
  }, [products]);

  useEffect(() => {
    const category = searchParams.get("category")?.trim() || "";
    setSelectedCategory(category);
    setFilteredProducts(
      category
        ? liveProducts.filter((p) => (p.category || "").trim().toLowerCase() === category.toLowerCase())
        : liveProducts,
    );
  }, [liveProducts, searchParams]);

  const productCategories = useMemo(
    () =>
      Array.from(
        new Set(
          liveProducts
            .map((p) => p.category || "")
            .map((c) => c.trim())
            .filter((c) => c.length > 0),
        ),
      ),
    [liveProducts],
  );

  const allCategories = useMemo(
    () => Array.from(new Set([...productCategories, ...fallbackCategories])),
    [productCategories],
  );

  const missingCategories = useMemo(
    () =>
      allCategories.filter(
        (c) => !productCategories.map((pc) => pc.toLowerCase()).includes(c.toLowerCase()),
      ),
    [allCategories, productCategories],
  );

  return (
    <>
      <section className="card">
        <div className="cardBody">
          <div className="categoryRow compactCategoryRow">
            {allCategories.map((cat) => (
              <TrackedLink
                key={cat}
                href={`/store?category=${encodeURIComponent(cat)}`}
                className={`categoryTile card ${selectedCategory.toLowerCase() === cat.toLowerCase() ? "categoryActive" : ""}`}
                eventLabel="store_category_filter"
                aria-label={`Filter products by ${cat}`}
                aria-pressed={selectedCategory.toLowerCase() === cat.toLowerCase()}
              >
                <div className="cardBody">
                  <div className="categoryIcon">{cat.slice(0, 1)}</div>
                  <h3>{cat}</h3>
                </div>
              </TrackedLink>
            ))}
          </div>
          {selectedCategory && (
            <div className="filterRow">
              <TrackedLink href="/store" className="btn btnSecondary" eventLabel="store_clear_filter">
                Clear filter
              </TrackedLink>
              <span className="filterInfo">
                Showing products for <strong>{selectedCategory}</strong>
              </span>
            </div>
          )}
        </div>
      </section>

      <section className="grid productGrid">
        {filteredProducts.length === 0 ? (
          <article className="card">
            <div className="cardBody">
              <h2 className="productTitle">No products available yet</h2>
              <p className="subtitle">Add items to this category or remove the category filter.</p>
            </div>
          </article>
        ) : (
          filteredProducts.map((p) => (
            <TrackedLink
              key={p.sku}
              href={`/products/${encodeURIComponent(p.sku)}`}
              className="card productCard"
              eventLabel="store_open_product"
              productSku={p.sku}
            >
              <ProductImage sku={p.sku} name={p.name} imageUrl={p.image_url} className="productImage" />
              <div className="cardBody">
                <div className="pill">{p.category || "Uncategorised"}</div>
                <h2 className="productTitle">{p.name}</h2>
                <div className="muted">SKU: {p.sku}</div>
                <div className="priceValue">{p.price == null ? "-" : `£${p.price.toFixed(2)}`}</div>
              </div>
            </TrackedLink>
          ))
        )}
        {!selectedCategory &&
          missingCategories.map((cat) => (
            <article key={`placeholder-${cat}`} className="card productCard placeholderCard">
              <div className="cardBody">
                <div className="pill">{cat}</div>
                <h2 className="productTitle">New items coming soon</h2>
                <p className="subtitle">We are preparing products for this category.</p>
              </div>
            </article>
          ))}
      </section>
    </>
  );
}
