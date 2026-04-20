export type Product = {
  sku: string;
  name: string;
  category: string | null;
  price: number | null;
  image_url?: string | null;
};

export type OverviewKpis = {
  total_sales: number;
  total_orders: number;
  average_order_value: number;
  page_views_24h: number;
  site_visits_24h: number;
  likes_24h: number;
  unique_users_24h: number;
  ctr_24h: number;
};

export type TopProductRow = {
  product_sku: string;
  likes: number;
};

export type InteractionPoint = {
  product_sku: string;
  views: number;
  likes: number;
  purchases: number;
};

export type SiteAnalytics = {
  click_through_rate: number;
  website_visits: number;
  website_visits_24h: number;
  pages_per_visit: number;
  average_time_on_page_seconds: number;
  average_time_on_product_page_seconds: number;
  time_on_site_total_seconds: number;
  average_time_on_site_per_visit_seconds: number;
  previous_purchases_total: number;
  customers_with_previous_purchase: number;
  average_previous_purchases_per_repeat_customer: number;
  frequent_pages: Array<{ page_url: string; views: number }>;
  frequent_products: Array<{ product_sku: string; interactions: number }>;
  frequent_categories: Array<{ category: string; interactions: number }>;
  customer_frequency: Array<{
    customer_id: string;
    customer_name?: string | null;
    customer_email?: string | null;
    customer_gender?: string | null;
    events: number;
    top_page: string | null;
    top_product: string | null;
    top_category: string | null;
  }>;
  top_returning_customers: Array<{
    customer_id: string;
    customer_name?: string | null;
    customer_email?: string | null;
    customer_gender?: string | null;
    orders: number;
    previous_purchases: number;
  }>;
};

export type CustomerProductInsightRow = {
  group: string;
  category: string;
  events: number;
  purchases: number;
  purchase_share: number;
  avg_base_price: number | null;
  premium_share: number | null;
};

export type CustomerProductInsights = {
  by_age: CustomerProductInsightRow[];
  by_gender: CustomerProductInsightRow[];
  by_country: CustomerProductInsightRow[];
  by_state: CustomerProductInsightRow[];
  by_city: CustomerProductInsightRow[];
  by_city_product: CustomerProductInsightRow[];
  by_loyalty_tier: CustomerProductInsightRow[];
  by_label: CustomerProductInsightRow[];
  notes: string[];
};

export type TimeOfDayBucket = {
  hour: number;
  label: string;
  events: number;
  page_views: number;
  purchases: number;
  likes: number;
  unique_visits: number;
};

export type TimeOfDayInsights = {
  hours: TimeOfDayBucket[];
  summary: string;
};

// Use internal Docker network URL if on server and available, otherwise use public URL (browser).
// In local development, also fall back to localhost if no env is configured.
const API_BASE = (() => {
  if (typeof window === "undefined") {
    const serverBase = process.env.INTERNAL_API_BASE || process.env.NEXT_PUBLIC_API_BASE || "";
    if (serverBase) return serverBase.replace(/\/+$/, "");
    if (process.env.NODE_ENV !== "production") return "http://localhost:8000";
    return "";
  }
  return (process.env.NEXT_PUBLIC_API_BASE || "").replace(/\/+$/, "");
})();

if (!API_BASE) {
  // eslint-disable-next-line no-console
  console.warn("API base URL is not configured. Set NEXT_PUBLIC_API_BASE in .env.local or INTERNAL_API_BASE in Docker.");
}

export async function listProducts(): Promise<Product[]> {
  const res = await fetch(`${API_BASE}/api/products`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load products: ${res.status}`);
  const data = (await res.json()) as { rows: Product[] };
  return data.rows;
}

export async function getProduct(sku: string): Promise<Product | null> {
  const res = await fetch(`${API_BASE}/api/products/${encodeURIComponent(sku)}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to load product: ${res.status}`);
  return (await res.json()) as Product;
}

export async function getOverviewKpis(): Promise<OverviewKpis> {
  const res = await fetch(`${API_BASE}/api/kpis/overview`, { cache: "no-store", credentials: "include" });
  if (!res.ok) throw new Error(`Failed to load KPI overview: ${res.status}`);
  return (await res.json()) as OverviewKpis;
}

export async function getTopProducts(limit = 10): Promise<TopProductRow[]> {
  const res = await fetch(`${API_BASE}/api/kpis/top-products?limit=${Math.max(1, limit)}`, {
    cache: "no-store",
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Failed to load top products: ${res.status}`);
  const data = (await res.json()) as { rows: TopProductRow[] };
  return data.rows;
}

export async function getInteractionCube(limit = 200): Promise<InteractionPoint[]> {
  const res = await fetch(`${API_BASE}/api/kpis/interaction-cube?limit=${Math.max(1, limit)}`, {
    cache: "no-store",
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Failed to load interaction cube: ${res.status}`);
  const data = (await res.json()) as { rows: InteractionPoint[] };
  return data.rows;
}

export async function getSiteAnalytics(limit = 10, customerLimit = 10): Promise<SiteAnalytics> {
  const safeLimit = Math.max(1, limit);
  const safeCustomerLimit = Math.max(1, customerLimit);
  const res = await fetch(
    `${API_BASE}/api/kpis/site-analytics?limit=${safeLimit}&customer_limit=${safeCustomerLimit}`,
    { cache: "no-store", credentials: "include" },
  );
  if (!res.ok) throw new Error(`Failed to load site analytics: ${res.status}`);
  return (await res.json()) as SiteAnalytics;
}

export async function getCustomerProductInsights(limit = 5, minEvents = 20): Promise<CustomerProductInsights> {
  const safeLimit = Math.max(1, limit);
  const safeMinEvents = Math.max(1, minEvents);
  const res = await fetch(
    `${API_BASE}/api/kpis/customer-product-insights?limit=${safeLimit}&min_events=${safeMinEvents}`,
    { cache: "no-store", credentials: "include" },
  );
  if (!res.ok) throw new Error(`Failed to load customer product insights: ${res.status}`);
  return (await res.json()) as CustomerProductInsights;
}

export type RecommendationInsight = {
  product_sku: string;
  product_name: string;
  category: string | null;
  views: number;
  likes: number;
  purchases: number;
  conversion_rate: number;
  action: string;
  confidence?: number | null;
  explanation: string;
};

export type AdminRecommendationInsights = {
  engine: string;
  model_available: boolean;
  recommendations: RecommendationInsight[];
  notes: string[];
};

export async function getAdminRecommendationInsights(): Promise<AdminRecommendationInsights> {
  const res = await fetch(`${API_BASE}/api/admin/recommendations`, {
    cache: "no-store",
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Failed to load admin recommendation insights: ${res.status}`);
  return (await res.json()) as AdminRecommendationInsights;
}

export async function getTimeOfDayInsights(
  eventTypes: string[] = ["page_view", "purchase", "click", "like", "add_to_cart"],
): Promise<TimeOfDayInsights> {
  const params = new URLSearchParams();
  eventTypes.forEach((type) => params.append("event_type", type));
  const res = await fetch(`${API_BASE}/api/kpis/time-of-day?${params.toString()}`, {
    cache: "no-store",
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Failed to load time-of-day insights: ${res.status}`);
  return (await res.json()) as TimeOfDayInsights;
}

export type ShoppingPattern = {
  hour: number;
  label: string;
  total_events: number;
  unique_users: number;
  unique_sessions: number;
  page_views: number;
  purchases: number;
  likes: number;
  add_to_cart: number;
};

export type ShoppingPatternsAnalytics = {
  summary: string;
  peak_hour?: ShoppingPattern;
  average_events_per_hour: number;
  hours: ShoppingPattern[];
};

export async function getShoppingPatterns(): Promise<ShoppingPatternsAnalytics> {
  const res = await fetch(`${API_BASE}/api/kpis/shopping-patterns`, {
    cache: "no-store",
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Failed to load shopping patterns: ${res.status}`);
  return (await res.json()) as ShoppingPatternsAnalytics;
}

export type ProductVisit = {
  product_sku: string;
  name?: string;
  category?: string;
  price?: number;
  visits: number;
};

export type ProductVisitsAnalytics = {
  summary: string;
  total_visits: number;
  unique_users: number;
  unique_sessions: number;
  filters: { user_id?: string | null; hour_of_day?: number | null };
  products: ProductVisit[];
};

export async function getProductVisits(
  userId?: string | null,
  hourOfDay?: number | null,
): Promise<ProductVisitsAnalytics> {
  const params = new URLSearchParams();
  if (userId) params.append("user_id", userId);
  if (hourOfDay !== null && hourOfDay !== undefined) params.append("hour_of_day", String(hourOfDay));

  const res = await fetch(`${API_BASE}/api/kpis/product-visits?${params.toString()}`, {
    cache: "no-store",
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Failed to load product visits: ${res.status}`);
  return (await res.json()) as ProductVisitsAnalytics;
}

export type CreateOrderItem = {
  product_sku: string;
  quantity: number;
  unit_price: number;
};

export async function createOrder(input: {
  order_id: string;
  user_id?: string | null;
  items: CreateOrderItem[];
}): Promise<{ ok: true; order_id: string; total: number }> {
  const res = await fetch(`${API_BASE}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`Checkout failed (${res.status}): ${msg}`);
  }
  return (await res.json()) as { ok: true; order_id: string; total: number };
}
