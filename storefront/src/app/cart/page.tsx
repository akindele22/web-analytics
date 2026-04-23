"use client";

import { useEffect, useMemo, useState } from "react";
import PageTracker from "@/components/PageTracker";
import { createOrder } from "@/lib/api";
import { sendEvent } from "@/lib/analytics";
import { cartTotal, clearCart, readCart, removeFromCart, type CartItem } from "@/lib/cart";
import { readProfile } from "@/lib/auth";

function orderId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}_${Math.random()}`;
}

export default function CartPage() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setItems(readCart());
  }, []);

  const total = useMemo(() => cartTotal(items), [items]);
  const profile = typeof window !== "undefined" ? readProfile() : null;

  return (
    <>
      <PageTracker />
      <div className="card">
        <div className="cardBody">
          <h1 className="title">Cart</h1>
          <p className="subtitle">Checkout writes an order to Postgres and emits purchase events for analytics.</p>

          {items.length === 0 ? (
            <div className="muted">Your cart is empty.</div>
          ) : (
            <>
              <table className="table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Qty</th>
                    <th>Unit</th>
                    <th>Total</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.sku}>
                      <td>
                        <div style={{ fontWeight: 700 }}>{it.name}</div>
                        <div className="muted">SKU: {it.sku}</div>
                      </td>
                      <td>{it.quantity}</td>
                      <td>${it.unitPrice.toFixed(2)}</td>
                      <td>${(it.unitPrice * it.quantity).toFixed(2)}</td>
                      <td>
                        <button
                          className="btnSecondary btn"
                          onClick={() => {
                            setItems(removeFromCart(it.sku));
                            void sendEvent({ event_type: "remove_from_cart", product_sku: it.sku });
                          }}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ height: 12 }} />

              <div className="kpiRow">
                <div className="kpi">
                  <div className="kpiLabel">Cart total</div>
                  <div className="kpiValue">${total.toFixed(2)}</div>
                </div>
              </div>

              <div className="btnRow">
                <button
                  className="btn"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setMessage(null);
                    try {
                      const oid = orderId();

                      await sendEvent({
                        event_type: "checkout_start",
                        event_value: total,
                        metadata: {
                          order_id: oid,
                          items_count: items.length,
                          total_value: total,
                          unique_products: items.map((it) => it.sku),
                        },
                      });

                      await createOrder({
                        order_id: oid,
                        user_id: profile?.user_id ?? null,
                        items: items.map((it) => ({
                          product_sku: it.sku,
                          quantity: it.quantity,
                          unit_price: it.unitPrice,
                        })),
                      });

                      // Emit purchase events (per item) plus an order_total event_value
                      for (const it of items) {
                        await sendEvent({
                          event_type: "purchase",
                          product_sku: it.sku,
                          event_value: it.unitPrice * it.quantity,
                          metadata: { order_id: oid, quantity: it.quantity },
                        });
                      }

                      clearCart();
                      setItems([]);
                      setMessage("Checkout complete. Open the admin dashboard to see updated KPIs.");
                    } catch (e) {
                      setMessage(e instanceof Error ? e.message : "Checkout failed.");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy ? "Processing..." : "Checkout"}
                </button>

                <button
                  className="btnSecondary btn"
                  disabled={busy || items.length === 0}
                  onClick={() => {
                    clearCart();
                    setItems([]);
                    void sendEvent({ event_type: "clear_cart" });
                  }}
                >
                  Clear cart
                </button>
              </div>

              {message ? (
                <div style={{ marginTop: 12 }} className="muted">
                  {message}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </>
  );
}
