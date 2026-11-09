import { Link } from "react-router-dom";
import { Bike, Mail, MapPin, Phone } from "lucide-react";
import { Logo } from "@/components/site/Logo";
import { useStore } from "@/context/StoreContext";

const POLICY_LINKS = [
  ["privacy-policy", "Privacy policy"], ["terms", "Terms & conditions"], ["cancellation-policy", "Cancellation policy"],
  ["refund-policy", "Refund policy"], ["delivery-policy", "Delivery policy"], ["allergens", "Allergens & ingredients"],
  ["food-safety", "Food safety & FSSAI"],
];

export const Footer = () => {
  const s = useStore();
  return (
    <footer className="relative mt-24 overflow-hidden bg-choco text-cream grain" data-testid="site-footer">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 md:grid-cols-4 lg:px-8">
        <div className="space-y-4 md:col-span-2">
          <Logo light />
          <p className="max-w-sm text-sm text-cream/70">{s?.tagline}</p>
          <div className="space-y-2 text-sm text-cream/80">
            {(s?.address_line || s?.city) && (
              <p className="flex items-start gap-2">
                <MapPin className="h-4 w-4 shrink-0 text-pink mt-0.5" />
                <span>{[s.address_line, s.city, s.state, s.pincode].filter(Boolean).join(", ")}</span>
              </p>
            )}
            {s?.phone && (
              <p className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-pink" />
                <a href={`tel:${s.phone}`} className="hover:text-pink transition-colors">{s.phone}</a>
              </p>
            )}
            {s?.email && (
              <p className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-pink" />
                <a href={`mailto:${s.email}`} className="hover:text-pink transition-colors">{s.email}</a>
              </p>
            )}
          </div>
        </div>
        <div>
          <h4 className="mb-4 font-display text-sm font-bold uppercase tracking-widest text-pink">Shop</h4>
          <ul className="space-y-2 text-sm text-cream/80">
            <li><Link to="/menu" className="hover:text-pink">Full menu</Link></li>
            <li><Link to="/#offers" className="hover:text-pink">Offers</Link></li>
            <li><Link to="/orders" className="hover:text-pink">Track an order</Link></li>
            <li><Link to="/account" className="hover:text-pink">My account</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="mb-4 font-display text-sm font-bold uppercase tracking-widest text-pink">Policies</h4>
          <ul className="space-y-2 text-sm text-cream/80">
            {POLICY_LINKS.map(([slug, label]) => (
              <li key={slug}><Link to={`/policies/${slug}`} data-testid={`footer-policy-${slug}`} className="hover:text-pink">{label}</Link></li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border-t border-cream/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-xs text-cream/60 sm:flex-row sm:justify-between sm:px-6 lg:px-8">
          <span data-testid="footer-fssai">FSSAI: {s?.fssai_number}</span>
          <span>© {new Date().getFullYear()} {s?.business_name || "ICEPOPS"}. Prices in INR, inclusive of applicable taxes.</span>
        </div>
      </div>
    </footer>
  );
};
