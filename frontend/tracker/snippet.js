/*
  Minimal website tracking snippet.

  - Sends page views automatically
  - Exposes window.EcomAnalytics.like(sku) for "like" buttons

  Configure:
    window.ECOM_ANALYTICS_API_BASE = "http://localhost:8000";
*/

(function () {
  const apiBase = (window.ECOM_ANALYTICS_API_BASE || "").replace(/\/+$/, "");
  if (!apiBase) return;

  const pageStart = Date.now();

  function getOrCreate(key) {
    try {
      const existing = localStorage.getItem(key);
      if (existing) return existing;
      const v = (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random();
      localStorage.setItem(key, v);
      return v;
    } catch {
      return null;
    }
  }

  const userId = getOrCreate("ea_user_id");
  const sessionId = getOrCreate("ea_session_id");

  function readUtm() {
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

  function guessChannel(utm) {
    const medium = (utm.utm_medium || "").toLowerCase();
    if (medium.includes("email")) return "email";
    if (medium.includes("cpc") || medium.includes("ppc") || medium.includes("paid")) return "paid";
    if (medium.includes("social")) return "social";
    return "organic";
  }

  async function send(event) {
    try {
      const utm = readUtm();
      await fetch(apiBase + "/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...event,
          user_id: userId,
          session_id: sessionId,
          page_url: window.location.href,
          referrer: document.referrer || null,
          platform: "web",
          channel: event.channel || guessChannel(utm),
          ...utm,
        }),
        keepalive: true,
      });
    } catch {
      // ignore
    }
  }

  function extractSkuFromDom() {
    const el = document.querySelector("[data-product-sku]");
    return el ? el.getAttribute("data-product-sku") : null;
  }

  // Auto page view
  send({ event_type: "page_view", product_sku: extractSkuFromDom() });

  // Emit one session_start per tab session
  try {
    if (!sessionStorage.getItem("ea_session_started")) {
      sessionStorage.setItem("ea_session_started", "1");
      send({ event_type: "session_start" });
    }
  } catch {
    // ignore
  }

  // Track time on page via page_exit
  window.addEventListener("beforeunload", function () {
    const durationMs = Math.max(0, Date.now() - pageStart);
    send({ event_type: "page_exit", product_sku: extractSkuFromDom(), page_duration_ms: durationMs });
  });

  window.EcomAnalytics = {
    like: function (sku) {
      return send({ event_type: "like", product_sku: sku || extractSkuFromDom() });
    },
    addToCart: function (sku) {
      return send({ event_type: "add_to_cart", product_sku: sku || extractSkuFromDom() });
    },
    purchase: function (sku, metadata) {
      return send({ event_type: "purchase", product_sku: sku || extractSkuFromDom(), metadata: metadata || {} });
    },
    emailOpen: function (emailCampaignId) {
      return send({ event_type: "email_open", email_campaign_id: emailCampaignId || null, channel: "email" });
    },
    emailClick: function (emailCampaignId) {
      return send({ event_type: "email_click", email_campaign_id: emailCampaignId || null, channel: "email" });
    },
    socialShare: function (network, sku) {
      return send({
        event_type: "social_share",
        social_network: network || null,
        product_sku: sku || extractSkuFromDom(),
        channel: "social",
      });
    },
  };
})();

