import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const CartContext = createContext(null);
const KEY = "icepops_cart";

const readLocal = () => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v.filter((i) => i.variant_id && i.quantity > 0) : [];
  } catch {
    return [];
  }
};

const mergeItems = (a, b) => {
  const map = new Map();
  [...a, ...b].forEach((i) => map.set(i.variant_id, Math.min(50, Math.max(map.get(i.variant_id) || 0, i.quantity))));
  return [...map].map(([variant_id, quantity]) => ({ variant_id, quantity }));
};

export function CartProvider({ children }) {
  const { user, loading } = useAuth();
  const [items, setItems] = useState(readLocal);
  const syncedFor = useRef(null);
  const timer = useRef(null);
  const dirty = useRef(false);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(items));
    if (!dirty.current || !syncedFor.current) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => api.put("/cart", { items }).catch(() => {}), 500);
  }, [items]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      if (syncedFor.current) setItems([]);
      syncedFor.current = null;
      return;
    }
    if (syncedFor.current === user.id) return;
    syncedFor.current = user.id;
    api.get("/cart").then(({ data }) => {
      const merged = mergeItems(data.items, readLocal());
      setItems(merged);
      api.put("/cart", { items: merged }).catch(() => {});
    }).catch(() => {});
  }, [user, loading]);

  const update = useCallback((fn) => {
    dirty.current = true;
    setItems(fn);
  }, []);

  const upsert = (list, variant_id, quantity) => {
    const rest = list.filter((i) => i.variant_id !== variant_id);
    return (quantity > 0 ? [...rest, { variant_id, quantity: Math.min(50, quantity) }] : rest).sort((a, b) => a.variant_id - b.variant_id);
  };
  const setQty = (variant_id, quantity) => update((prev) => upsert(prev, variant_id, quantity));
  const addMany = (lines) => update((prev) => lines.reduce(
    (acc, l) => upsert(acc, l.variant_id, (acc.find((i) => i.variant_id === l.variant_id)?.quantity || 0) + l.quantity), prev));
  const add = (variant_id, qty = 1) => addMany([{ variant_id, quantity: qty }]);
  const clear = () => update(() => []);
  const count = items.reduce((s, i) => s + i.quantity, 0);

  return <CartContext.Provider value={{ items, add, addMany, setQty, clear, count }}>{children}</CartContext.Provider>;
}

export const useCart = () => useContext(CartContext);
