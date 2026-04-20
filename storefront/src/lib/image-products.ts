import fs from "fs";
import path from "path";

import type { Product } from "./api";

const IMAGE_DIR = path.join(process.cwd(), "public", "images", "products");
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".svg"];

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function makeProductName(filename: string): string {
  return filename
    .replace(/\.[^/.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function listProductsFromPublicImages(): Product[] {
  try {
    const entries = fs.readdirSync(IMAGE_DIR, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((filename) => IMAGE_EXTENSIONS.includes(path.extname(filename).toLowerCase()))
      .map((filename) => {
        const sku = slugify(filename);
        return {
          sku,
          name: makeProductName(filename),
          category: "Misc",
          price: 25,
          image_url: `/images/products/${encodeURI(filename)}`,
        } as Product;
      });
  } catch {
    return [];
  }
}

export function findProductFromPublicImages(sku: string): Product | null {
  const normalized = sku.trim().toLowerCase();
  const products = listProductsFromPublicImages();
  return products.find((prod) => prod.sku === normalized) ?? null;
}
