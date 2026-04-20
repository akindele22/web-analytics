import React from "react";
import "./globals.css";
import { TrackedLink } from "@/components/TrackedLink";
import { ToastContainer } from "@/components/Toast";

export const metadata = {
  title: "CommercePulse | Store & Analytics",
  description: "Ecommerce storefront, checkout, and admin KPI analytics",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header className="header">
          <div className="container headerInner">
            <TrackedLink href="/" className="brand" eventLabel="nav_home">
              CommercePulse
            </TrackedLink>
            <nav className="nav">
              <TrackedLink href="/store" eventLabel="nav_store">
                Store
              </TrackedLink>
              <TrackedLink href="/checkout" eventLabel="nav_checkout">
                Checkout
              </TrackedLink>
              <TrackedLink href="/login" eventLabel="nav_login">
                Login
              </TrackedLink>
            </nav>
          </div>
        </header>
        <main className="container main">{children}</main>
        <footer className="footer">
          <div className="container footerInner">
            <span>
              Place product images in `storefront/public/images/products/` or
              set `image_url` in `products.csv`.
            </span>
          </div>
        </footer>
        <ToastContainer />
      </body>
    </html>
  );
}
