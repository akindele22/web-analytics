import { listProducts } from "@/lib/api";
import { listProductsFromPublicImages } from "@/lib/image-products";
import PageTracker from "@/components/PageTracker";
import StoreFilter from "@/components/StoreFilter";

const fallbackCategories = [
  "Beauty",
  "Shoes",
  "Apparel",
  "Accessories",
  "Fitness",
  "Electronics",
  "Misc",
  "Fashion",
  "Sports",
];

export default async function StorePage() {
  const products = await listProducts().catch(() => []);
  const publicImageProducts = listProductsFromPublicImages();
  const combinedProducts = [
    ...products,
    ...publicImageProducts.filter(
      (publicProduct) => !products.some((product) => product.image_url === publicProduct.image_url),
    ),
  ];

  const productCategories = Array.from(
    new Set(
      combinedProducts
        .map((p) => p.category || "")
        .map((c) => c.trim())
        .filter((c) => c.length > 0),
    ),
  );
  const categories = Array.from(new Set([...productCategories, ...fallbackCategories]));

  return (
    <>
      <PageTracker />
      <StoreFilter products={combinedProducts} categories={categories} />
    </>
  );
}
