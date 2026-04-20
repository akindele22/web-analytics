"use client";

import { useEffect, useRef } from "react";
import { sendEvent } from "@/lib/analytics";

type PageTrackerProps = {
  productSku?: string | null;
  pageType?: string | null;
  metadata?: Record<string, unknown>;
};

export default function PageTracker({ productSku, pageType, metadata }: PageTrackerProps) {
  const startedAtRef = useRef<number>(Date.now());

  useEffect(() => {
    startedAtRef.current = Date.now();
    const now = new Date();
    const hourOfDay = now.getHours();
    const dayOfWeek = now.toLocaleDateString("en-US", { weekday: "long" });

    void sendEvent({
      event_type: "page_view",
      product_sku: productSku,
      metadata: {
        page_type: pageType || "page_view",
        hour_of_day: hourOfDay,
        day_of_week: dayOfWeek,
        ...(metadata || {}),
      },
    });

    // One session_start per tab session
    try {
      if (!sessionStorage.getItem("ea_session_started")) {
        sessionStorage.setItem("ea_session_started", "1");
        void sendEvent({ event_type: "session_start" });
      }
    } catch {
      // ignore
    }

    return () => {
      const duration = Math.max(0, Date.now() - startedAtRef.current);
      const exitNow = new Date();
      const exitHourOfDay = exitNow.getHours();
      
      void sendEvent({
        event_type: "page_exit",
        product_sku: productSku,
        page_duration_ms: duration,
        metadata: {
          page_type: pageType || "page_exit",
          hour_of_day: exitHourOfDay,
          ...(metadata || {}),
        },
      });
    };
  }, [productSku, pageType, metadata]);

  return null;
}

