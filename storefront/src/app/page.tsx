import PageTracker from "@/components/PageTracker";
import { listProducts } from "@/lib/api";
import { TrackedLink } from "@/components/TrackedLink";

const fallbackCategories = ["Electronics", "Fashion", "Beauty", "Sports", "Accessories"];

export default async function HomePage() {
  const products = await listProducts().catch(() => []);
  const productCategories = Array.from(
    new Set(
      products
        .map((p) => p.category || "")
        .map((c) => c.trim())
        .filter((c) => c.length > 0),
    ),
  );
  const categories = Array.from(new Set([...productCategories, ...fallbackCategories]));

  return (
    <>
      <PageTracker />
      <section className="heroBlock card">
        <div className="heroShade" />
        <div className="cardBody heroBody">
          <div className="pill">CommercePulse Experience</div>
          <h1 className="heroTitle">Build a premium storefront and monitor KPIs in one flow</h1>
          <p className="subtitle heroSubtitle">
            Run your product showcase, checkout workflow, and admin analytics dashboard from a unified UI inspired by
            modern commercial templates.
          </p>
          <div className="btnRow">
            <TrackedLink href="/store" className="btn" eventLabel="hero_go_store">
              Explore Store
            </TrackedLink>
          </div>
        </div>
      </section>

      <section className="categoryRow">
        {categories.map((cat) => (
          <TrackedLink
            key={cat}
            href={`/store?category=${encodeURIComponent(cat)}`}
            className="categoryTile card"
            eventLabel="home_category_select"
          >
            <div className="cardBody">
              <div className="categoryIcon">{cat.slice(0, 1)}</div>
              <h3>{cat}</h3>
            </div>
          </TrackedLink>
        ))}
      </section>
    </>
  );
}
