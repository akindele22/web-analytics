import PageTracker from "@/components/PageTracker";
import { listProducts } from "@/lib/api";
import { TrackedLink } from "@/components/TrackedLink";

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
      <section 
        className="heroBlock card"
        style={{ backgroundImage: 'url(/modern-man.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }}
      >
        <div className="heroShade" />
        <div className="cardBody heroBody">
          <div className="pill">CommercePulse Experience</div>
          <h1 className="heroTitle">Modern commerce with faster product discovery</h1>
          <p className="subtitle heroSubtitle">
            Start in the store page and use category filters to find products that match your style.
          </p>
          <div className="btnRow">
            <TrackedLink href="/store?category=Fashion" className="btn" eventLabel="hero_go_store">
              Browse Fashion
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
