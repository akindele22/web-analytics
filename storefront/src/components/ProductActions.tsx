"use client";

import { useState } from "react";
import type { Product } from "@/lib/api";
import { sendEvent } from "@/lib/analytics";
import { addToCart } from "@/lib/cart";
import { TrackedLink } from "@/components/TrackedLink";
import { showToast } from "@/components/Toast";

export default function ProductActions({ product }: { product: Product }) {
  const [qty, setQty] = useState(1);
  const price = product.price ?? 0;

  const handleAddToCart = () => {
    addToCart({ sku: product.sku, name: product.name, unitPrice: price }, qty);
    void sendEvent({ event_type: "add_to_cart", product_sku: product.sku, metadata: { quantity: qty } });
    
    showToast(`✓ Added ${qty} "${product.name}" to cart!`, "success");
  };

  return (
    <div className="btnRow">
      <button
        className="btn"
        onClick={() => {
          void sendEvent({ event_type: "like", product_sku: product.sku, metadata: { source: "product_like" } });
        }}
      >
        Like
      </button>

      <button className="btnSecondary btn btnMuted" onClick={handleAddToCart}>
        Add to cart
      </button>

      <label className="pill qtyPill" style={{ cursor: "default" }}>
        Qty
        <input
          type="number"
          min={1}
          value={qty}
          onChange={(e) => setQty(Math.max(1, Number(e.target.value || 1)))}
          className="qtyInput"
        />
      </label>

      <TrackedLink
        href="/checkout"
        className="btnSecondary btn btnMuted"
        eventLabel="product_go_checkout"
        productSku={product.sku}
      >
        Go to checkout
      </TrackedLink>
    </div>
  );
}
