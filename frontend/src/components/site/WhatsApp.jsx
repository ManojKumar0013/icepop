import { useStore } from "@/context/StoreContext";

export const waNumber = (raw) => {
  let d = (raw || "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 10) d = `91${d}`;
  return /^91[6-9]\d{9}$/.test(d) ? d : null;
};

export const waLink = (number, text) => `https://wa.me/${number}?text=${encodeURIComponent(text)}`;

const WaIcon = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
    <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.7-1.2 2.2 2.2 0 0 0 .2-1.2c-.1-.1-.3-.2-.5-.3z" />
  </svg>
);

export const WhatsAppFab = () => {
  const store = useStore();
  const number = waNumber(store?.whatsapp);
  if (!number) return null;
  return (
    <a href={waLink(number, `Hi ${store.business_name}, I'd like to place an order.`)} target="_blank" rel="noopener noreferrer"
      data-testid="whatsapp-fab" aria-label="Order on WhatsApp"
      className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-[#25D366] px-5 py-3 font-bold text-white shadow-xl transition-transform hover:-translate-y-1">
      <WaIcon className="h-5 w-5" /><span className="hidden sm:inline">Order on WhatsApp</span>
    </a>
  );
};

export const WhatsAppCartButton = ({ q, fulfilment }) => {
  const store = useStore();
  const number = waNumber(store?.whatsapp);
  if (!number || !q) return null;
  const lines = q.lines.map((l) => `• ${l.quantity} × ${l.product_name} (${l.variant_name})`).join("\n");
  const text = `Hi ${store.business_name}, I'd like to order:\n${lines}\n\nEstimated total: ₹${q.total_paise / 100} (${fulfilment})`;
  return (
    <a href={waLink(number, text)} target="_blank" rel="noopener noreferrer" data-testid="cart-whatsapp-button"
      className="flex w-full items-center justify-center gap-2 rounded-full border-2 border-[#25D366] py-3 text-sm font-bold text-[#128C7E] transition-colors hover:bg-[#25D366] hover:text-white">
      <WaIcon className="h-4 w-4" />Order on WhatsApp instead
    </a>
  );
};
