import PageTracker from "@/components/PageTracker";
import { getInteractionCube } from "@/lib/api";

function pct(part: number, whole: number): string {
  if (whole <= 0) return "0.0%";
  return `${((part / whole) * 100).toFixed(1)}%`;
}

export default async function ProductInsightsPage() {
  let rows: { product_sku: string; views: number; likes: number; purchases: number }[] = [];

  try {
    rows = await getInteractionCube(200);
  } catch {
    // Keep page resilient when API is not ready.
  }

  const totals = rows.reduce(
    (acc, row) => {
      acc.views += row.views;
      acc.likes += row.likes;
      acc.purchases += row.purchases;
      return acc;
    },
    { views: 0, likes: 0, purchases: 0 },
  );

  const ranked = [...rows]
    .sort((a, b) => b.purchases - a.purchases || b.likes - a.likes || b.views - a.views)
    .slice(0, 15);

  return (
    <>
      <PageTracker />
      <section className="card">
        <div className="cardBody">
          <div className="pill">Product Insights</div>
          <h1 className="title">View to like to purchase funnel</h1>
          <p className="subtitle">Track where product attention converts and where interest drops before purchase.</p>
        </div>
      </section>

      <section className="funnelGrid">
        <article className="card">
          <div className="cardBody">
            <p className="statLabel">Views</p>
            <p className="statValue">{totals.views.toLocaleString()}</p>
          </div>
        </article>
        <article className="card">
          <div className="cardBody">
            <p className="statLabel">Likes</p>
            <p className="statValue">{totals.likes.toLocaleString()}</p>
            <p className="muted">Like rate: {pct(totals.likes, totals.views)}</p>
          </div>
        </article>
        <article className="card">
          <div className="cardBody">
            <p className="statLabel">Purchases</p>
            <p className="statValue">{totals.purchases.toLocaleString()}</p>
            <p className="muted">Purchase rate: {pct(totals.purchases, totals.views)}</p>
          </div>
        </article>
      </section>

      <section className="card">
        <div className="cardBody">
          <h2 className="title panelTitle">Top converting products</h2>
          {ranked.length === 0 ? (
            <p className="muted">No interaction data yet.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Views</th>
                  <th>Likes</th>
                  <th>Purchases</th>
                  <th>Purchase/View</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((row) => (
                  <tr key={row.product_sku}>
                    <td>{row.product_sku}</td>
                    <td>{row.views.toLocaleString()}</td>
                    <td>{row.likes.toLocaleString()}</td>
                    <td>{row.purchases.toLocaleString()}</td>
                    <td>{pct(row.purchases, row.views)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </>
  );
}
