type WebEvent = {
  event_type: string;
  user_id?: string | null;
  session_id?: string | null;
  page_url?: string | null;
  product_sku?: string | null;
  platform?: string | null;
  channel?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  email_campaign_id?: string | null;
  social_network?: string | null;
  page_duration_ms?: number | null;
  event_value?: number | null;
  metadata?: Record<string, unknown>;
};

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || "").replace(/\/+$/, "");

function safeUUID(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}_${Math.random()}`;
}

function getOrCreate(storage: Storage, key: string): string {
  const existing = storage.getItem(key);
  if (existing) return existing;
  const v = safeUUID();
  storage.setItem(key, v);
  return v;
}

function readUtm(): { utm_source: string | null; utm_medium: string | null; utm_campaign: string | null } {
  try {
    const u = new URL(window.location.href);
    const p = u.searchParams;
    return {
      utm_source: p.get("utm_source"),
      utm_medium: p.get("utm_medium"),
      utm_campaign: p.get("utm_campaign"),
    };
  } catch {
    return { utm_source: null, utm_medium: null, utm_campaign: null };
  }
}

function guessChannel(utm: { utm_medium: string | null }): string {
  const medium = (utm.utm_medium || "").toLowerCase();
  if (medium.includes("email")) return "email";
  if (medium.includes("cpc") || medium.includes("ppc") || medium.includes("paid")) return "paid";
  if (medium.includes("social")) return "social";
  return "organic";
}

export function getIds(): { userId: string; sessionId: string } {
  const userId = getOrCreate(localStorage, "ea_user_id");
  const sessionId = getOrCreate(localStorage, "ea_session_id");
  return { userId, sessionId };
}

function readProfile(): { name?: string; email?: string; gender?: string } {
  try {
    const raw = localStorage.getItem("ea_user_profile");
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { name?: string; email?: string; gender?: string };
    return parsed || {};
  } catch {
    return {};
  }
}

export async function sendEvent(evt: WebEvent): Promise<void> {
  if (!API_BASE) return;
  try {
    const { userId, sessionId } = getIds();
    const utm = readUtm();
    const profile = readProfile();
    await fetch(`${API_BASE}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        ...evt,
        user_id: evt.user_id ?? userId,
        session_id: evt.session_id ?? sessionId,
        page_url: evt.page_url ?? window.location.href,
        platform: evt.platform ?? "web",
        channel: evt.channel ?? guessChannel(utm),
        ...utm,
        metadata: {
          ...(evt.metadata || {}),
          user_name: profile.name,
          user_email: profile.email,
          user_gender: profile.gender,
        },
      }),
      keepalive: true,
    });
  } catch {
    // swallow analytics failures
  }
}

