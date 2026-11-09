import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";

export function useQuote({ coupon = "", fulfilment = "delivery", pincode = "", useReward = false, tip_paise = 0, referral_code = "" } = {}) {
  const { items } = useCart();
  const { user } = useAuth();
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadTick, setReloadTick] = useState(0);

  const refetch = () => setReloadTick((t) => t + 1);

  useEffect(() => {
    if (!items.length) {
      setQuote(null);
      setError(null);
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(true);
    setError(null);
    const t = setTimeout(() => {
      api.post("/cart/quote", {
        items, coupon_code: coupon || null, fulfilment_type: fulfilment,
        pincode: /^\d{6}$/.test(pincode) ? pincode : null, use_loyalty_reward: useReward,
        tip_paise: tip_paise || 0, referral_code: referral_code || null,
      }).then(({ data }) => {
        if (live) {
          setQuote(data);
          setError(null);
        }
      })
      .catch((err) => {
        if (live) {
          const detail = err?.response?.data?.detail;
          const msg = typeof detail === "string" ? detail : (err?.message || "Failed to connect to cart service.");
          setError(msg);
          setQuote(null);
        }
      })
      .finally(() => live && setLoading(false));
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [items, coupon, fulfilment, pincode, useReward, tip_paise, referral_code, user?.id, reloadTick]);

  return { quote, loading, error, refetch };
}
