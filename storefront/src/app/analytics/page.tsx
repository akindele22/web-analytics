"use client";

import { useEffect, useState } from "react";
import PageTracker from "@/components/PageTracker";
import AdminGuard from "@/components/AdminGuard";
import { TrackedLink } from "@/components/TrackedLink";
import {
  getCustomerProductInsights,
  getInteractionCube,
  getOverviewKpis,
  getSiteAnalytics,
  getTimeOfDayInsights,
  getTopProducts,
  type CustomerProductInsights,
  type SiteAnalytics,
  type TimeOfDayInsights,
} from "@/lib/api";

function money(v: number): string {
  return `£${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function num(v: number): string {
  return v.toLocaleString();
}

function secs(v: number): string {
  return `${v.toFixed(1)}s`;
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

type HeatmapData = {
  groups: string[];
  categories: string[];
  values: Record<string, Record<string, number>>;
  maxValue: number;
};

function buildHeatmap(rows: CustomerProductInsights["by_age"] | undefined, maxCategories = 6): HeatmapData {
  if (!rows || rows.length === 0) {
    return { groups: [], categories: [], values: {}, maxValue: 0 };
  }

  const totals = new Map<string, number>();
  rows.forEach((row) => {
    totals.set(row.category, (totals.get(row.category) || 0) + row.events);
  });
  const categories = [...totals.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, maxCategories)
    .map(([cat]) => cat);

  const groupSet = new Set<string>();
  const values: Record<string, Record<string, number>> = {};
  let maxValue = 0;

  rows.forEach((row) => {
    if (!categories.includes(row.category)) return;
    groupSet.add(row.group);
    values[row.group] = values[row.group] || {};
    values[row.group][row.category] = row.purchase_share;
    maxValue = Math.max(maxValue, row.purchase_share);
  });

  return {
    groups: [...groupSet.values()],
    categories,
    values,
    maxValue: maxValue || 1,
  };
}

type StackedGroup = {
  group: string;
  total: number;
  segments: Array<{ category: string; share: number; events: number }>;
};

function buildStackedBars(
  rows: CustomerProductInsights["by_gender"] | undefined,
  maxGroups = 6,
  maxCategories = 5,
): { categories: string[]; groups: StackedGroup[] } {
  if (!rows || rows.length === 0) return { categories: [], groups: [] };

  const catTotals = new Map<string, number>();
  const groupTotals = new Map<string, number>();
  rows.forEach((row) => {
    catTotals.set(row.category, (catTotals.get(row.category) || 0) + row.events);
    groupTotals.set(row.group, (groupTotals.get(row.group) || 0) + row.events);
  });

  const categories = [...catTotals.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, maxCategories)
    .map(([cat]) => cat);

  const topGroups = [...groupTotals.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, maxGroups)
    .map(([group]) => group);

  const groups: StackedGroup[] = topGroups.map((group) => {
    const groupRows = rows.filter((row) => row.group === group && categories.includes(row.category));
    const total = groupRows.reduce((sum, row) => sum + row.events, 0);
    const segments = categories.map((category) => {
      const match = groupRows.find((row) => row.category === category);
      const events = match ? match.events : 0;
      return {
        category,
        events,
        share: total > 0 ? events / total : 0,
      };
    });
    return { group, total, segments };
  });

  return { categories, groups };
}

function buildPieChart(values: { label: string; value: number }[]): { background: string; total: number } {
  const palette = ["#f3b82d", "#60a5fa", "#34d399", "#f87171", "#a78bfa", "#fb7185"];
  const total = values.reduce((sum, item) => sum + item.value, 0);

  if (total <= 0) {
    return { background: "#e5e7eb", total: 0 };
  }

  let start = 0;
  const stops = values.map((item, index) => {
    const portion = (item.value / total) * 100;
    const color = palette[index % palette.length];
    const stop = `${color} ${start.toFixed(2)}% ${(start + portion).toFixed(2)}%`;
    start += portion;
    return stop;
  });

  return { background: `conic-gradient(${stops.join(", ")})`, total };
}

const emptySiteAnalytics: SiteAnalytics = {
  click_through_rate: 0,
  website_visits: 0,
  website_visits_24h: 0,
  pages_per_visit: 0,
  average_time_on_page_seconds: 0,
  average_time_on_product_page_seconds: 0,
  time_on_site_total_seconds: 0,
  average_time_on_site_per_visit_seconds: 0,
  previous_purchases_total: 0,
  customers_with_previous_purchase: 0,
  average_previous_purchases_per_repeat_customer: 0,
  frequent_pages: [],
  frequent_products: [],
  frequent_categories: [],
  customer_frequency: [],
  top_returning_customers: [],
};

const emptyCustomerProductInsights: CustomerProductInsights = {
  by_age: [],
  by_gender: [],
  by_country: [],
  by_state: [],
  by_city: [],
  by_city_product: [],
  by_loyalty_tier: [],
  by_label: [],
  notes: [],
};

export default function AnalyticsPage() {
  const [kpis, setKpis] = useState({
    total_sales: 0,
    total_orders: 0,
    average_order_value: 0,
    page_views_24h: 0,
    site_visits_24h: 0,
    likes_24h: 0,
    unique_users_24h: 0,
    ctr_24h: 0,
  });
  const [topProducts, setTopProducts] = useState<{ product_sku: string; likes: number }[]>([]);
  const [interactions, setInteractions] = useState<
    { product_sku: string; views: number; likes: number; purchases: number }[]
  >([]);
  const [site, setSite] = useState<SiteAnalytics>(emptySiteAnalytics);
  const [customerProductInsights, setCustomerProductInsights] =
    useState<CustomerProductInsights>(emptyCustomerProductInsights);
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDayInsights>({ hours: [], summary: "Loading hourly behavior..." });
  const [selectedHour, setSelectedHour] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [nextKpis, nextTop, nextInteractions, nextSite, nextInsights, nextTimeOfDay] = await Promise.all([
          getOverviewKpis(),
          getTopProducts(8),
          getInteractionCube(20),
          getSiteAnalytics(10, 10),
          getCustomerProductInsights(5, 20),
          getTimeOfDayInsights(),
        ]);
        if (!active) return;
        setKpis(nextKpis);
        setTopProducts(nextTop);
        setInteractions(nextInteractions);
        setSite(nextSite);
        setCustomerProductInsights(nextInsights);
        setTimeOfDay(nextTimeOfDay);
      } catch {
        // Keep page resilient when API is not ready.
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  const strongestLike = topProducts.reduce((m, r) => Math.max(m, r.likes), 1);
  const topInteraction = [...interactions]
    .sort((a, b) => b.purchases - a.purchases || b.likes - a.likes || b.views - a.views)
    .slice(0, 8);

  const categorySlices = site.frequent_categories
    .filter((row) => row.interactions > 0)
    .slice(0, 5)
    .map((row) => ({
      label: row.category,
      value: row.interactions,
    }));
  const categoryPalette = ["#f3b82d", "#60a5fa", "#34d399", "#f87171", "#a78bfa", "#fb7185"];
  const categoryPie = buildPieChart(categorySlices);

  const ageHeatmap = buildHeatmap(customerProductInsights.by_age, 6);
  const genderStack = buildStackedBars(customerProductInsights.by_gender, 6, 5);
  const loyaltyStack = buildStackedBars(customerProductInsights.by_loyalty_tier, 6, 5);
  const countryStack = buildStackedBars(customerProductInsights.by_country, 6, 5);
  const stateStack = buildStackedBars(customerProductInsights.by_state, 6, 5);
  const cityProductStack = buildStackedBars(customerProductInsights.by_city_product, 6, 5);

  const demographicTables = [
    { title: "Product Categories by Age Group", rows: customerProductInsights.by_age || [] },
    { title: "Product Categories by Gender", rows: customerProductInsights.by_gender || [] },
    { title: "Product Categories by Country", rows: customerProductInsights.by_country || [] },
    { title: "Product Categories by State", rows: customerProductInsights.by_state || [] },
    { title: "Product Categories by City", rows: customerProductInsights.by_city || [] },
    { title: "Product Categories by Loyalty Tier", rows: customerProductInsights.by_loyalty_tier || [] },
    { title: "Product Categories by Label", rows: customerProductInsights.by_label || [] },
  ];

  return (
    <AdminGuard>
      <>
        <div className="adminDashboard">
          <PageTracker />
          <section className="card adminHero">
            <div className="cardBody">
              <div className="pill">Analytics Overview</div>
              <h1 className="title">Operational + website behavior analytics</h1>
              <p className="subtitle">This page now includes CTR, website visits, time-on-page/product/site, frequency patterns, and previous purchase behavior.</p>
              <div className="btnRow">
                <TrackedLink href="/analytics/products" className="btn btnSecondary" eventLabel="analytics_product_drilldown">
                  Product Drilldown
                </TrackedLink>
                <TrackedLink href="/store" className="btn btnSecondary" eventLabel="analytics_back_to_store">
                  Back to Store
                </TrackedLink>
              </div>
            </div>
          </section>

      <section className="statsGrid">
        <article className="statCard card">
          <div className="cardBody">
            <p className="statLabel">Total Sales</p>
            <p className="statValue">{money(kpis.total_sales)}</p>
          </div>
        </article>
        <article className="statCard card">
          <div className="cardBody">
            <p className="statLabel">Orders</p>
            <p className="statValue">{num(kpis.total_orders)}</p>
          </div>
        </article>
        <article className="statCard card">
          <div className="cardBody">
            <p className="statLabel">Average Order Value</p>
            <p className="statValue">{money(kpis.average_order_value)}</p>
          </div>
        </article>
        <article className="statCard card">
          <div className="cardBody">
            <p className="statLabel">Website Visits (All)</p>
            <p className="statValue">{num(site.website_visits)}</p>
          </div>
        </article>
        <article className="statCard card">
          <div className="cardBody">
            <p className="statLabel">Website Visits (24h)</p>
            <p className="statValue">{num(site.website_visits_24h)}</p>
          </div>
        </article>
        <article className="statCard card">
          <div className="cardBody">
            <p className="statLabel">Click Through Rate</p>
            <p className="statValue">{site.click_through_rate.toFixed(2)}%</p>
          </div>
        </article>
      </section>

      <section className="statsGrid">
        <article className="statCard card">
          <div className="cardBody">
            <p className="statLabel">Pages Per Visit</p>
            <p className="statValue">{site.pages_per_visit.toFixed(2)}</p>
          </div>
        </article>
        <article className="statCard card">
          <div className="cardBody">
            <p className="statLabel">Avg Time On Page</p>
            <p className="statValue">{secs(site.average_time_on_page_seconds)}</p>
          </div>
        </article>
        <article className="statCard card">
          <div className="cardBody">
            <p className="statLabel">Avg Time On Product Page</p>
            <p className="statValue">{secs(site.average_time_on_product_page_seconds)}</p>
          </div>
        </article>
        <article className="statCard card">
          <div className="cardBody">
            <p className="statLabel">Avg Time On Site / Visit</p>
            <p className="statValue">{secs(site.average_time_on_site_per_visit_seconds)}</p>
          </div>
        </article>
        <article className="statCard card">
          <div className="cardBody">
            <p className="statLabel">Total Time On Site</p>
            <p className="statValue">{secs(site.time_on_site_total_seconds)}</p>
          </div>
        </article>
        <article className="statCard card">
          <div className="cardBody">
            <p className="statLabel">Previous Purchases</p>
            <p className="statValue">{num(site.previous_purchases_total)}</p>
            <p className="muted">Repeat customers: {num(site.customers_with_previous_purchase)}</p>
          </div>
        </article>
      </section>

      <section className="card">
        <div className="cardBody">
          <div className="pill">Hourly Insights</div>
          <h2 className="title">Time-of-day activity</h2>
          <p className="subtitle">Filter behavior by hour and see when visitors are most active.</p>
          <div className="btnRow">
            <label className="inputLabel">
              Hour filter
              <select
                value={selectedHour ?? ""}
                onChange={(event) => {
                  const hourValue = event.target.value;
                  setSelectedHour(hourValue === "" ? null : Number(hourValue));
                }}
              >
                <option value="">All hours</option>
                {timeOfDay.hours.map((row) => (
                  <option key={row.hour} value={row.hour}>
                    {row.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="subtitle" style={{ marginTop: 12 }}>
            {selectedHour === null
              ? timeOfDay.summary
              : timeOfDay.hours.find((row) => row.hour === selectedHour)
                  ? `During ${timeOfDay.hours.find((row) => row.hour === selectedHour)?.label}: ${num(
                      timeOfDay.hours.find((row) => row.hour === selectedHour)?.events ?? 0,
                    )} events, ${num(
                      timeOfDay.hours.find((row) => row.hour === selectedHour)?.page_views ?? 0,
                    )} page views, ${num(
                      timeOfDay.hours.find((row) => row.hour === selectedHour)?.purchases ?? 0,
                    )} purchases.`
                  : "No data for this hour yet."
            }
          </div>
        </div>
      </section>

      <section className="analyticsRow">
        <article className="card analyticsPanel">
          <div className="cardBody">
            <h2 className="title panelTitle">Top products by likes</h2>
            {topProducts.length === 0 ? (
              <p className="muted">No likes tracked yet.</p>
            ) : (
              <ul className="rankList">
                {topProducts.map((row) => (
                  <li key={row.product_sku}>
                    <div className="rankHead">
                      <span>{row.product_sku}</span>
                      <span>{num(row.likes)}</span>
                    </div>
                    <div className="meter">
                      <span style={{ width: `${Math.max(8, (row.likes / strongestLike) * 100)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </article>

        <article className="card analyticsPanel">
          <div className="cardBody">
            <h2 className="title panelTitle">Interaction leaderboard</h2>
            {topInteraction.length === 0 ? (
              <p className="muted">No product interaction data yet.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Views</th>
                    <th>Likes</th>
                    <th>Purchases</th>
                  </tr>
                </thead>
                <tbody>
                  {topInteraction.map((row) => (
                    <tr key={row.product_sku}>
                      <td>{row.product_sku}</td>
                      <td>{num(row.views)}</td>
                      <td>{num(row.likes)}</td>
                      <td>{num(row.purchases)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </article>
      </section>

      <section className="analyticsRow">
        <article className="card analyticsPanel">
          <div className="cardBody">
            <h2 className="title panelTitle">Frequent Pages</h2>
            {site.frequent_pages.length === 0 ? (
              <p className="muted">No page view events yet.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Page</th>
                    <th>Views</th>
                  </tr>
                </thead>
                <tbody>
                  {site.frequent_pages.map((row) => (
                    <tr key={row.page_url}>
                      <td>{row.page_url}</td>
                      <td>{num(row.views)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </article>

        <article className="card analyticsPanel">
          <div className="cardBody">
            <h2 className="title panelTitle">Frequent Products & Categories</h2>
            <div className="stackSplit">
              <div>
                <h3 className="miniTitle">Products</h3>
                {site.frequent_products.length === 0 ? (
                  <p className="muted">No product interaction events yet.</p>
                ) : (
                  <ul className="compactList">
                    {site.frequent_products.map((row) => (
                      <li key={row.product_sku}>
                        <span>{row.product_sku}</span>
                        <span>{num(row.interactions)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h3 className="miniTitle">Category Share</h3>
                {categorySlices.length === 0 ? (
                  <p className="muted">No category interaction events yet.</p>
                ) : (
                  <div className="pieChartPanel">
                    <div
                      className="pieChart"
                      style={{
                        background: categoryPie.background,
                      }}
                      aria-label="Pie chart showing category interaction share"
                    >
                      <div className="pieChartHole">
                        <strong>{num(categoryPie.total)}</strong>
                        <span>Total</span>
                      </div>
                    </div>
                    <ul className="pieLegend">
                      {categorySlices.map((row, index) => {
                        const percentage = categoryPie.total === 0 ? 0 : (row.value / categoryPie.total) * 100;
                        return (
                          <li key={row.label}>
                            <span className="pieLegendSwatch" style={{ backgroundColor: categoryPalette[index % categoryPalette.length] }} />
                            <span className="truncate">{row.label}</span>
                            <strong>{percentage.toFixed(1)}%</strong>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        </article>
      </section>

      <section className="analyticsRow">
        <article className="card analyticsPanel">
          <div className="cardBody">
            <h2 className="title panelTitle">Customer Frequent Behavior</h2>
            {site.customer_frequency.length === 0 ? (
              <p className="muted">No customer patterns yet.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Email</th>
                    <th>Gender</th>
                    <th>Events</th>
                    <th>Top Page</th>
                    <th>Top Product</th>
                    <th>Top Category</th>
                  </tr>
                </thead>
                <tbody>
                  {site.customer_frequency.map((row) => (
                    <tr key={row.customer_id}>
                      <td>{row.customer_name || row.customer_id}</td>
                      <td>{row.customer_email || "-"}</td>
                      <td>{row.customer_gender || "-"}</td>
                      <td>{num(row.events)}</td>
                      <td>{row.top_page || "-"}</td>
                      <td>{row.top_product || "-"}</td>
                      <td>{row.top_category || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </article>

        <article className="card analyticsPanel">
          <div className="cardBody">
            <h2 className="title panelTitle">Previous Purchases by Customer</h2>
            <p className="subtitle" style={{ marginBottom: 10 }}>
              Avg previous purchases per repeat customer: {site.average_previous_purchases_per_repeat_customer.toFixed(2)}
            </p>
            {site.top_returning_customers.length === 0 ? (
              <p className="muted">No repeat customers yet.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Email</th>
                    <th>Gender</th>
                    <th>Total Orders</th>
                    <th>Previous Purchases</th>
                  </tr>
                </thead>
                <tbody>
                  {site.top_returning_customers.map((row) => (
                    <tr key={row.customer_id}>
                      <td>{row.customer_name || row.customer_id}</td>
                      <td>{row.customer_email || "-"}</td>
                      <td>{row.customer_gender || "-"}</td>
                      <td>{num(row.orders)}</td>
                      <td>{num(row.previous_purchases)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </article>
      </section>

      <section className="analyticsRow">
        {demographicTables.map((table) => (
          <article className="card analyticsPanel" key={table.title}>
            <div className="cardBody">
              <h2 className="title panelTitle">{table.title}</h2>
              {table.rows.length === 0 ? (
                <p className="muted">No demographic product insights available yet.</p>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Group</th>
                      <th>Category</th>
                      <th>Events</th>
                      <th>Purchases</th>
                      <th>Purchase Share</th>
                      <th>Avg Price</th>
                      <th>Premium Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.map((row, idx) => (
                      <tr key={`${row.group}-${row.category}-${idx}`}>
                        <td>{row.group}</td>
                        <td>{row.category}</td>
                        <td>{num(row.events)}</td>
                        <td>{num(row.purchases)}</td>
                        <td>{pct(row.purchase_share)}</td>
                        <td>{row.avg_base_price == null ? "-" : money(row.avg_base_price)}</td>
                        <td>{row.premium_share == null ? "-" : pct(row.premium_share)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </article>
        ))}
      </section>

      <section className="analyticsRow">
        <article className="card analyticsPanel">
          <div className="cardBody">
            <h2 className="title panelTitle">Age x Category Heatmap (Purchase Share)</h2>
            {ageHeatmap.groups.length === 0 ? (
              <p className="muted">No heatmap data available yet.</p>
            ) : (
              <div className="heatmap">
                <div className="heatmapRow heatmapHeader">
                  <span className="heatmapLabel">Age</span>
                  {ageHeatmap.categories.map((cat) => (
                    <span key={cat} className="heatmapLabel heatmapCat">
                      {cat}
                    </span>
                  ))}
                </div>
                {ageHeatmap.groups.map((group) => (
                  <div className="heatmapRow" key={group}>
                    <span className="heatmapLabel">{group}</span>
                    {ageHeatmap.categories.map((cat) => {
                      const value = ageHeatmap.values[group]?.[cat] || 0;
                      const intensity = Math.max(0.08, value / ageHeatmap.maxValue);
                      return (
                        <span
                          key={`${group}-${cat}`}
                          className="heatmapCell"
                          style={{ backgroundColor: `rgba(243, 184, 45, ${intensity})` }}
                          title={`${group} • ${cat}: ${pct(value)}`}
                        >
                          {pct(value)}
                        </span>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        </article>

        <article className="card analyticsPanel">
          <div className="cardBody">
            <h2 className="title panelTitle">Gender Category Mix (Events)</h2>
            {genderStack.groups.length === 0 ? (
              <p className="muted">No stacked bar data available yet.</p>
            ) : (
              <>
                <div className="stackedLegend">
                  {genderStack.categories.map((cat, idx) => (
                    <span key={cat}>
                      <span className="legendSwatch" style={{ backgroundColor: categoryPalette[idx % categoryPalette.length] }} />
                      {cat}
                    </span>
                  ))}
                </div>
                <div className="stackedBars">
                  {genderStack.groups.map((group) => (
                    <div className="stackedRow" key={group.group}>
                      <div className="stackedLabel">
                        <strong>{group.group}</strong>
                        <span>{num(group.total)} events</span>
                      </div>
                      <div className="stackedBar">
                        {group.segments.map((seg, idx) => (
                          <span
                            key={`${group.group}-${seg.category}`}
                            className="stackedSeg"
                            style={{
                              width: `${(seg.share * 100).toFixed(2)}%`,
                              backgroundColor: categoryPalette[idx % categoryPalette.length],
                            }}
                            title={`${seg.category}: ${pct(seg.share)} (${seg.events} events)`}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </article>
      </section>

        <section className="analyticsRow">
          <article className="card analyticsPanel">
            <div className="cardBody">
              <h2 className="title panelTitle">Loyalty Tier Category Mix (Events)</h2>
            {loyaltyStack.groups.length === 0 ? (
              <p className="muted">No stacked bar data available yet.</p>
            ) : (
              <>
                <div className="stackedLegend">
                  {loyaltyStack.categories.map((cat, idx) => (
                    <span key={cat}>
                      <span className="legendSwatch" style={{ backgroundColor: categoryPalette[idx % categoryPalette.length] }} />
                      {cat}
                    </span>
                  ))}
                </div>
                <div className="stackedBars">
                  {loyaltyStack.groups.map((group) => (
                    <div className="stackedRow" key={group.group}>
                      <div className="stackedLabel">
                        <strong>{group.group}</strong>
                        <span>{num(group.total)} events</span>
                      </div>
                      <div className="stackedBar">
                        {group.segments.map((seg, idx) => (
                          <span
                            key={`${group.group}-${seg.category}`}
                            className="stackedSeg"
                            style={{
                              width: `${(seg.share * 100).toFixed(2)}%`,
                              backgroundColor: categoryPalette[idx % categoryPalette.length],
                            }}
                            title={`${seg.category}: ${pct(seg.share)} (${seg.events} events)`}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
            </div>
          </article>
        </section>

        <section className="analyticsRow">
          <article className="card analyticsPanel">
            <div className="cardBody">
              <h2 className="title panelTitle">Country Category Mix (Events)</h2>
              {countryStack.groups.length === 0 ? (
                <p className="muted">No stacked bar data available yet.</p>
              ) : (
                <>
                  <div className="stackedLegend">
                    {countryStack.categories.map((cat, idx) => (
                      <span key={cat}>
                        <span className="legendSwatch" style={{ backgroundColor: categoryPalette[idx % categoryPalette.length] }} />
                        {cat}
                      </span>
                    ))}
                  </div>
                  <div className="stackedBars">
                    {countryStack.groups.map((group) => (
                      <div className="stackedRow" key={group.group}>
                        <div className="stackedLabel">
                          <strong>{group.group}</strong>
                          <span>{num(group.total)} events</span>
                        </div>
                        <div className="stackedBar">
                          {group.segments.map((seg, idx) => (
                            <span
                              key={`${group.group}-${seg.category}`}
                              className="stackedSeg"
                              style={{
                                width: `${(seg.share * 100).toFixed(2)}%`,
                                backgroundColor: categoryPalette[idx % categoryPalette.length],
                              }}
                              title={`${seg.category}: ${pct(seg.share)} (${seg.events} events)`}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </article>
          <article className="card analyticsPanel">
            <div className="cardBody">
              <h2 className="title panelTitle">State Category Mix (Events)</h2>
              {stateStack.groups.length === 0 ? (
                <p className="muted">No stacked bar data available yet.</p>
              ) : (
                <>
                  <div className="stackedLegend">
                    {stateStack.categories.map((cat, idx) => (
                      <span key={cat}>
                        <span className="legendSwatch" style={{ backgroundColor: categoryPalette[idx % categoryPalette.length] }} />
                        {cat}
                      </span>
                    ))}
                  </div>
                  <div className="stackedBars">
                    {stateStack.groups.map((group) => (
                      <div className="stackedRow" key={group.group}>
                        <div className="stackedLabel">
                          <strong>{group.group}</strong>
                          <span>{num(group.total)} events</span>
                        </div>
                        <div className="stackedBar">
                          {group.segments.map((seg, idx) => (
                            <span
                              key={`${group.group}-${seg.category}`}
                              className="stackedSeg"
                              style={{
                                width: `${(seg.share * 100).toFixed(2)}%`,
                                backgroundColor: categoryPalette[idx % categoryPalette.length],
                              }}
                              title={`${seg.category}: ${pct(seg.share)} (${seg.events} events)`}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </article>
        </section>

        <section className="analyticsRow">
          <article className="card analyticsPanel">
            <div className="cardBody">
              <h2 className="title panelTitle">City Top Products (Events)</h2>
              {cityProductStack.groups.length === 0 ? (
                <p className="muted">No city product data available yet.</p>
              ) : (
                <>
                  <div className="stackedLegend">
                    {cityProductStack.categories.map((cat, idx) => (
                      <span key={cat}>
                        <span className="legendSwatch" style={{ backgroundColor: categoryPalette[idx % categoryPalette.length] }} />
                        {cat}
                      </span>
                    ))}
                  </div>
                  <div className="stackedBars">
                    {cityProductStack.groups.map((group) => (
                      <div className="stackedRow" key={group.group}>
                        <div className="stackedLabel">
                          <strong>{group.group}</strong>
                          <span>{num(group.total)} events</span>
                        </div>
                        <div className="stackedBar">
                          {group.segments.map((seg, idx) => (
                            <span
                              key={`${group.group}-${seg.category}`}
                              className="stackedSeg"
                              style={{
                                width: `${(seg.share * 100).toFixed(2)}%`,
                                backgroundColor: categoryPalette[idx % categoryPalette.length],
                              }}
                              title={`${seg.category}: ${pct(seg.share)} (${seg.events} events)`}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </article>
        </section>
      </div>
    </>
  </AdminGuard>
);
}
