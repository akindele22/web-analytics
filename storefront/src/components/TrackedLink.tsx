"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { sendEvent } from "@/lib/analytics";

type TrackedLinkProps = {
  href: string;
  className?: string;
  children: ReactNode;
  eventLabel?: string;
  productSku?: string;
  metadata?: Record<string, unknown>;
};

type TrackedExternalLinkProps = {
  href: string;
  className?: string;
  children: ReactNode;
  eventLabel?: string;
  metadata?: Record<string, unknown>;
  target?: string;
  rel?: string;
};

export function TrackedLink({ href, className, children, eventLabel, productSku, metadata }: TrackedLinkProps) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => {
        void sendEvent({
          event_type: "click",
          product_sku: productSku,
          metadata: {
            cta_name: eventLabel || "internal_link",
            destination: href,
            ...(metadata || {}),
          },
        });
      }}
    >
      {children}
    </Link>
  );
}

export function TrackedExternalLink({
  href,
  className,
  children,
  eventLabel,
  metadata,
  target,
  rel,
}: TrackedExternalLinkProps) {
  return (
    <a
      href={href}
      className={className}
      target={target}
      rel={rel}
      onClick={() => {
        void sendEvent({
          event_type: "click",
          metadata: {
            cta_name: eventLabel || "external_link",
            destination: href,
            ...(metadata || {}),
          },
        });
      }}
    >
      {children}
    </a>
  );
}
