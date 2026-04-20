"use client";

import { useState, useEffect, useMemo } from "react";

function slugSku(sku: string): string {
  return sku.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
}

function normalizeUrl(url?: string | null): string {
  if (!url) return "";
  try {
    const trimmed = url.trim();
    if (!trimmed) return "";
    return encodeURI(trimmed);
  } catch {
    return url;
  }
}

function basename(path: string): string {
  return path.replace(/\\/g, "/").split("/").filter(Boolean).pop() || path;
}

export default function ProductImage({ sku, name, imageUrl, className }: { sku: string; name: string; imageUrl?: string | null; className?: string; }) {
  const base = `/images/products/${slugSku(sku)}`;
  const encodedImageUrl = normalizeUrl(imageUrl);
  const fallbackFromFile = imageUrl ? normalizeUrl(`/images/products/${basename(imageUrl)}`) : "";
  const candidates = useMemo(
    () => [
      encodedImageUrl,
      fallbackFromFile,
      `${base}.jpg`,
      `${base}.jpeg`,
      `${base}.png`,
      `${base}.webp`,
      "/images/products/placeholder.svg",
    ].filter(Boolean),
    [encodedImageUrl, fallbackFromFile, base],
  );

  const [src, setSrc] = useState(candidates[0]);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    setIdx(0);
    setSrc(candidates[0]);
  }, [candidates]);

  return (
    <img
      src={src}
      alt={name}
      className={className}
      loading="lazy"
      onError={() => {
        const next = idx + 1;
        if (next < candidates.length) {
          setIdx(next);
          setSrc(candidates[next]);
        }
      }}
    />
  );
}
