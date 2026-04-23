export type CartItem = {
  sku: string;
  name: string;
  unitPrice: number;
  quantity: number;
};

const KEY = "ea_cart_v1";

export function readCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as CartItem[];
  } catch {
    return [];
  }
}

export function writeCart(items: CartItem[]): void {
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function addToCart(item: Omit<CartItem, "quantity">, quantity: number): CartItem[] {
  const cart = readCart();
  const idx = cart.findIndex((c) => c.sku === item.sku);
  if (idx >= 0) {
    cart[idx] = { ...cart[idx], quantity: cart[idx].quantity + quantity };
  } else {
    cart.push({ ...item, quantity });
  }
  writeCart(cart);
  return cart;
}

export function removeFromCart(sku: string): CartItem[] {
  const cart = readCart().filter((c) => c.sku !== sku);
  writeCart(cart);
  return cart;
}

export function clearCart(): void {
  writeCart([]);
}

export function cartTotal(items: CartItem[]): number {
  return items.reduce((sum, it) => sum + it.unitPrice * it.quantity, 0);
}

