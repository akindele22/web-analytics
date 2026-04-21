import { getProduct } from "@/lib/api";
import { findProductFromPublicImages } from "@/lib/image-products";
import ProductActions from "@/components/ProductActions";
import ProductImage from "@/components/ProductImage";
import PageTracker from "@/components/PageTracker";
import { notFound } from "next/navigation";

export const dynamic = 'force-static';
export const revalidate = false;

export async function generateStaticParams() {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_BASE}/api/products`
    );
    const data = await res.json();
    return (data.rows || []).map((product: { sku: string }) => ({
      sku: product.sku,
    }));
  } catch {
    return [];
  }
}

// rest of your existing page component...

export default async function ProductPage({ params }: { params: Promise<{ sku: string }> }) {
  const { sku } = await params;
  const product = (await getProduct(sku)) ?? findProductFromPublicImages(sku);
  if (!product) notFound();

  return (
    <>
      <PageTracker pageType="product_detail" productSku={product.sku} />
      <div className="row" data-product-sku={product.sku}>
        <div className="col">
          <div className="card">
            <ProductImage sku={product.sku} name={product.name} imageUrl={product.image_url} className="productImageDetail" />
            <div className="cardBody">
              <div className="pill">{product.category || "Uncategorised"}</div>
              <h1 className="title" style={{ marginTop: 10 }}>
                {product.name}
              </h1>
              <p className="subtitle">SKU: {product.sku}</p>

              <div className="kpiRow">
                <div className="kpi">
                  <div className="kpiLabel">Price</div>
                  <div className="kpiValue">{product.price == null ? "-" : `£${product.price.toFixed(2)}`}</div>
                </div>
                <div className="kpi">
                  <div className="kpiLabel">Category</div>
                  <div className="kpiValue">{product.category || "-"}</div>
                </div>
              </div>

              <ProductActions product={product} />
            </div>
          </div>
        </div>

        <div className="col">
          <div className="card">
            <div className="cardBody">
              <h2 style={{ margin: 0, fontSize: 18 }}>Tracked events on this page</h2>
              <p className="subtitle" style={{ marginTop: 10 }}>
                page views, time on page, like, add to cart, checkout start, purchase.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
