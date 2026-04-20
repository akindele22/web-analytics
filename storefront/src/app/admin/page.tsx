"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PageTracker from "@/components/PageTracker";
import Chatbot from "@/components/Chatbot";
import {
  getAdminRecommendationInsights,
  getCustomerProductInsights,
  getOverviewKpis,
  getSiteAnalytics,
  getTopProducts,
  type AdminRecommendationInsights,
  type CustomerProductInsights,
  type SiteAnalytics,
} from "@/lib/api";
import { fetchMe, logoutUser, type AuthUser } from "@/lib/auth";
import { TrackedLink } from "@/components/TrackedLink";

function money(v: number): string {
  return `£${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function num(v: number): string {
  return v.toLocaleString();
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

type StackedGroup = {
  group: string;
  total: number;
  segments: Array<{ category: string; share: number; events: number }>;
};

type HeatmapData = {
  groups: string[];
  categories: string[];
  values: Record<string, Record<string, number>>;
  maxValue: number;
};

const CATEGORY_PALETTE = ["#f3b82d", "#60a5fa", "#34d399", "#f87171", "#a78bfa", "#fb7185"];

function buildHeatmap(rows: CustomerProductInsights["by_age"] | undefined, maxCategories = 6): HeatmapData {
  if (!rows || rows.length === 0) {
    return { groups: [], categories: [], values: {}, maxValue: 0 };
  }

  const totals = new Map<string, number>();
  rows.forEach((row) => {
    if (row?.category) totals.set(row.category, (totals.get(row.category) || 0) + (row.events || 0));
  });
  const categories = [...totals.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, maxCategories)
    .map(([cat]) => cat);

  const groupSet = new Set<string>();
  const values: Record<string, Record<string, number>> = {};
  let maxValue = 0;

  rows.forEach((row) => {
    if (!row?.category || !categories.includes(row.category) || !row.group) return;
    groupSet.add(row.group);
    values[row.group] = values[row.group] || {};
    values[row.group][row.category] = row.purchase_share || 0;
    maxValue = Math.max(maxValue, row.purchase_share || 0);
  });

  return {
    groups: [...groupSet.values()],
    categories,
    values,
    maxValue: maxValue || 1,
  };
}

function buildStackedBars(
  rows: CustomerProductInsights["by_gender"] | undefined,
  maxGroups = 6,
  maxCategories = 5,
): { categories: string[]; groups: StackedGroup[] } {
  if (!rows || rows.length === 0) return { categories: [], groups: [] };

  const catTotals = new Map<string, number>();
  const groupTotals = new Map<string, number>();
  rows.forEach((row) => {
    if (row?.category) catTotals.set(row.category, (catTotals.get(row.category) || 0) + (row.events || 0));
    if (row?.group) groupTotals.set(row.group, (groupTotals.get(row.group) || 0) + (row.events || 0));
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
    const groupRows = rows.filter((row) => row?.group === group && row?.category && categories.includes(row.category));
    const total = groupRows.reduce((sum, row) => sum + row.events, 0);
    const segments = categories.map((category) => {
      const match = groupRows.find((row) => row.category === category);
      const events = (match && match.events) ? match.events : 0;
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
  const total = values.reduce((sum, item) => sum + item.value, 0);

  if (total <= 0) {
    return { background: "#e5e7eb", total: 0 };
  }

  let start = 0;
  const stops = values.map((item, index) => {
    const portion = (item.value / total) * 100;
    const color = CATEGORY_PALETTE[index % CATEGORY_PALETTE.length];
    const stop = `${color} ${start.toFixed(2)}% ${(start + portion).toFixed(2)}%`;
    start += portion;
    return stop;
  });

  return { background: `conic-gradient(${stops.join(", ")})`, total };
}

function buildCategorySlices(
  rows: CustomerProductInsights["by_gender"] | undefined,
  maxCategories = 5,
): { label: string; value: number }[] {
  if (!rows || rows.length === 0) return [];
  const totals = new Map<string, number>();
  rows.forEach((row) => {
    if (row?.category) totals.set(row.category, (totals.get(row.category) || 0) + (row.events || 0));
  });
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, maxCategories)
    .map(([label, value]) => ({ label, value }));
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

export default function AdminPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState({
    total_sales: 0,
    total_orders: 0,
    average_order_value: 0,
    page_views_24h: 0,
    site_visits_24h: 0,
    likes_24h: 0,
    unique_users_24h: 0,
    ctr_24h: 0,
  });
  const [site, setSite] = useState<SiteAnalytics>(emptySiteAnalytics);
  const [top, setTop] = useState<{ product_sku: string; likes: number }[]>([]);
  const [insights, setInsights] = useState<CustomerProductInsights>(emptyCustomerProductInsights);
  const [recommendations, setRecommendations] = useState<AdminRecommendationInsights | null>(null);
  const [recommendationsError, setRecommendationsError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const me = await fetchMe();
      if (!me || me.role !== "admin") {
        router.replace("/login");
        return;
      }
      setUser(me);
      const [ov, s, t, i, r] = await Promise.all([
        getOverviewKpis().catch(() => overview),
        getSiteAnalytics(8, 8).catch(() => emptySiteAnalytics),
        getTopProducts(8).catch(() => []),
        getCustomerProductInsights(5, 20).catch(() => emptyCustomerProductInsights),
        getAdminRecommendationInsights().catch((error) => {
          setRecommendationsError(error instanceof Error ? error.message : String(error));
          return null;
        }),
      ]);
      setOverview(ov);
      setSite(s);
      setTop(t);
      setInsights(i);
      if (r) {
        setRecommendations(r);
      }
      setLoading(false);
    }
    void load();
  }, [router]);

  const userLabel = useMemo(() => (user ? `${user.name} (${user.email})` : "Admin"), [user]);

  if (loading) {
    return (
      <>
        <PageTracker />
        <section className="card">
          <div className="cardBody">
            <div className="pill">Admin Dashboard</div>
            <h1 className="title">Loading admin metrics...</h1>
          </div>
        </section>
      </>
    );
  }

  const categorySlices = buildCategorySlices(insights.by_gender, 5);
  const categoryPie = buildPieChart(categorySlices);
  const genderStack = buildStackedBars(insights.by_gender, 6, 5);
  const loyaltyStack = buildStackedBars(insights.by_loyalty_tier, 6, 5);
  const countryStack = buildStackedBars(insights.by_country, 6, 5);
  const stateStack = buildStackedBars(insights.by_state, 6, 5);
  const cityProductStack = buildStackedBars(insights.by_city_product, 6, 5);
  const ageHeatmap = buildHeatmap(insights.by_age, 6);

  return (
    <>
      <PageTracker />
      <div className="adminDashboard">
        <section className="card adminHero">
          <div className="cardBody">
            <div className="pill">Admin Dashboard</div>
            <h1 className="title">KPI Control Center</h1>
            <p className="subtitle">Signed in as {userLabel}</p>
            <div className="adminHeroActions">
              <TrackedLink href="/analytics" className="btn adminActionButton" eventLabel="admin_open_analytics">
                Open Analytics
              </TrackedLink>
              <button
                className="btn btnMuted adminActionButton"
                onClick={async () => {
                  await logoutUser();
                  router.replace("/login");
                }}
              >
                Log out
              </button>
            </div>
          </div>
        </section>

      <section className="adminKpiGrid">
        <article className="card adminKpiCard"><div className="cardBody"><p className="statLabel">Total Sales</p><p className="statValue">{money(overview.total_sales)}</p></div></article>
        <article className="card adminKpiCard"><div className="cardBody"><p className="statLabel">Orders</p><p className="statValue">{overview.total_orders}</p></div></article>
        <article className="card adminKpiCard"><div className="cardBody"><p className="statLabel">AOV</p><p className="statValue">{money(overview.average_order_value)}</p></div></article>
        <article className="card adminKpiCard"><div className="cardBody"><p className="statLabel">CTR</p><p className="statValue">{site.click_through_rate.toFixed(2)}%</p></div></article>
        <article className="card adminKpiCard"><div className="cardBody"><p className="statLabel">Website Visits</p><p className="statValue">{site.website_visits}</p></div></article>
        <article className="card adminKpiCard"><div className="cardBody"><p className="statLabel">Avg Time On Site</p><p className="statValue">{site.average_time_on_site_per_visit_seconds.toFixed(1)}s</p></div></article>
      </section>

      <section className="analyticsRow">
        <article className="card analyticsPanel">
          <div className="cardBody">
            <h2 className="title panelTitle">Top liked products</h2>
            <ul className="compactList">
              {top.length === 0 ? <li><span>No likes yet</span><span>0</span></li> : top.map((row) => (
                <li key={row.product_sku}><span>{row.product_sku}</span><span>{row.likes}</span></li>
              ))}
            </ul>
          </div>
        </article>
        <article className="card analyticsPanel">
          <div className="cardBody">
            <h2 className="title panelTitle">Frequent pages</h2>
            <ul className="compactList">
              {site.frequent_pages.length === 0 ? <li><span>No pages yet</span><span>0</span></li> : site.frequent_pages.map((row) => (
                <li key={row.page_url}><span className="truncate">{row.page_url}</span><span>{row.views}</span></li>
              ))}
            </ul>
          </div>
        </article>
      </section>

      <section className="card">
        <div className="cardBody">
          <h2 className="title panelTitle">Recommendation Insights</h2>
          {recommendationsError ? (
            <p className="muted">Unable to load recommendation insights: {recommendationsError}</p>
          ) : recommendations ? (
            <div className="recommendationsList">
              {(recommendations.recommendations?.length ?? 0) === 0 ? (
                <p className="muted">No recommendation insights available yet.</p>
              ) : (
                <ul>
                  {recommendations.recommendations?.map((item) => (
                    <li key={item.product_sku} className="recommendationItem">
                      <strong>{item.product_name}</strong> ({item.product_sku})
                      <div>{item.action}</div>
                      <div className="muted">
                        views: {item.views}, likes: {item.likes}, purchases: {item.purchases}
                        {item.confidence != null ? `, confidence: ${item.confidence}` : ""}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <p className="muted">Loading recommendation insights...</p>
          )}
        </div>
      </section>

      <section className="card">
        <div className="cardBody">
          <h2 className="title panelTitle">Admin Chatbot</h2>
          <p className="muted">Ask for data-driven website recommendations, product improvements, and admin analytics insights.</p>
          <Chatbot />
        </div>
      </section>

      <section className="analyticsRow">
        <article className="card analyticsPanel">
          <div className="cardBody">
            <h2 className="title panelTitle">Customer Category Mix</h2>
            {categorySlices.length === 0 ? (
              <p className="muted">No demographic category insights yet.</p>
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
                        <span
                          className="pieLegendSwatch"
                        style={{ backgroundColor: CATEGORY_PALETTE[index % CATEGORY_PALETTE.length] }}
                        />
                        <span className="truncate">{row.label}</span>
                        <strong>{percentage.toFixed(1)}%</strong>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </article>
        <article className="card analyticsPanel">
          <div className="cardBody">
            <h2 className="title panelTitle">Category Share by Gender</h2>
            {genderStack.groups.length === 0 ? (
              <p className="muted">No stacked bar data available yet.</p>
            ) : (
              <>
                <div className="stackedLegend">
                  {genderStack.categories.map((cat, idx) => (
                    <span key={cat}>
                      <span className="legendSwatch" style={{ backgroundColor: CATEGORY_PALETTE[idx % CATEGORY_PALETTE.length] }} />
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
                              backgroundColor: CATEGORY_PALETTE[idx % CATEGORY_PALETTE.length],
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
            <h2 className="title panelTitle">Age Group vs Category (Purchase Share)</h2>
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
                      const value = ageHeatmap.values[group]?.[cat] ?? 0;
                      const shade = Math.max(0.08, value / ageHeatmap.maxValue);
                      return (
                        <div
                          key={`${group}-${cat}`}
                          className="heatmapCell"
                          style={{
                            background: `rgba(96, 165, 250, ${shade})`,
                          }}
                        >
                          {pct(value)}
                        </div>
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
            <h2 className="title panelTitle">Loyalty Tier Category Mix</h2>
            {loyaltyStack.groups.length === 0 ? (
              <p className="muted">No stacked bar data available yet.</p>
            ) : (
              <>
                <div className="stackedLegend">
                  {loyaltyStack.categories.map((cat, idx) => (
                    <span key={cat}>
                      <span className="legendSwatch" style={{ backgroundColor: CATEGORY_PALETTE[idx % CATEGORY_PALETTE.length] }} />
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
                              backgroundColor: CATEGORY_PALETTE[idx % CATEGORY_PALETTE.length],
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
            <h2 className="title panelTitle">Country Category Mix</h2>
            {countryStack.groups.length === 0 ? (
              <p className="muted">No country data available yet.</p>
            ) : (
              <>
                <div className="stackedLegend">
                  {countryStack.categories.map((cat, idx) => (
                    <span key={cat}>
                      <span className="legendSwatch" style={{ backgroundColor: CATEGORY_PALETTE[idx % CATEGORY_PALETTE.length] }} />
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
                              backgroundColor: CATEGORY_PALETTE[idx % CATEGORY_PALETTE.length],
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
            <h2 className="title panelTitle">State Category Mix</h2>
            {stateStack.groups.length === 0 ? (
              <p className="muted">No state data available yet.</p>
            ) : (
              <>
                <div className="stackedLegend">
                  {stateStack.categories.map((cat, idx) => (
                    <span key={cat}>
                      <span className="legendSwatch" style={{ backgroundColor: CATEGORY_PALETTE[idx % CATEGORY_PALETTE.length] }} />
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
                              backgroundColor: CATEGORY_PALETTE[idx % CATEGORY_PALETTE.length],
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
                      <span className="legendSwatch" style={{ backgroundColor: CATEGORY_PALETTE[idx % CATEGORY_PALETTE.length] }} />
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
                              backgroundColor: CATEGORY_PALETTE[idx % CATEGORY_PALETTE.length],
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

      {insights.notes.length > 0 ? (
        <section className="card adminPanel">
          <div className="cardBody">
            <h2 className="title panelTitle">Insight Notes</h2>
            <ul className="compactList">
              {insights.notes.map((note) => (
                <li key={note}>
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
      </div>
    </>
  );
}
