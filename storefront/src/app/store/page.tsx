import { listProducts } from "@/lib/api";
import { listProductsFromPublicImages } from "@/lib/image-products";
import PageTracker from "@/components/PageTracker";
import ProductImage from "@/components/ProductImage";
import { TrackedLink } from "@/components/TrackedLink";

export const dynamic = 'force-static';

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

function formatMoney(value: number | null): string {
  return value == null ? "-" : `£${value.toFixed(2)}`;
}

type SearchParams = {
  category?: string | string[];
};

export default async function StorePage({
  searchParams,
}: {
  searchParams?: SearchParams | Promise<SearchParams>;
}) {
  const products = await listProducts().catch(() => []);
  const publicImageProducts = listProductsFromPublicImages();
  const combinedProducts = [
    ...products,
    ...publicImageProducts.filter(
      (publicProduct) => !products.some((product) => product.image_url === publicProduct.image_url),
    ),
  ];

  const productCategories = Array.from(
    new Set(
      combinedProducts
        .map((p) => p.category || "")
        .map((c) => c.trim())
        .filter((c) => c.length > 0),
    ),
  );
  const categories = Array.from(new Set([...productCategories, ...fallbackCategories]));
  const resolvedSearchParams = await searchParams;
  const rawCategory = resolvedSearchParams?.category;
  const selectedCategory = typeof rawCategory === "string"
    ? rawCategory.trim()
    : Array.isArray(rawCategory)
      ? rawCategory[0]?.trim() || ""
      : "";
  const filtered = selectedCategory
    ? combinedProducts.filter((p) => (p.category || "").trim().toLowerCase() === selectedCategory.toLowerCase())
    : combinedProducts;
  const missingCategories = categories.filter(
    (c) => !productCategories.map((pc) => pc.toLowerCase()).includes(c.toLowerCase()),
  );

  return (
    <>
      <PageTracker />
      <section className="grid productGrid">
        {filtered.length === 0 ? (
          <article className="card">
            <div className="cardBody">
              <h2 className="productTitle">No products available yet</h2>
              <p className="subtitle">Add items to this category or remove the category filter.</p>
            </div>
          </article>
        ) : (
          filtered.map((p) => (
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
                <div className="priceValue">{formatMoney(p.price)}</div>
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
