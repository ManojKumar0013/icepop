import { Link } from "react-router-dom";
import { useStore } from "@/context/StoreContext";

export const Logo = ({ light = false, to = "/" }) => {
  const store = useStore();
  return (
    <Link to={to} data-testid="nav-logo" className="group flex items-center gap-2" aria-label={`${store?.business_name || "ICEPOPS"} home`}>
      {store?.logo_url ? (
        <img src={store.logo_url} alt="" className="h-9 w-9 rounded-2xl object-cover" />
      ) : (
        <span className="relative grid h-9 w-9 place-items-center rounded-2xl bg-pink transition-transform duration-300 group-hover:-rotate-12">
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
            <rect x="6" y="2" width="12" height="14" rx="6" fill="#3D2314" />
            <rect x="11" y="15" width="2" height="7" rx="1" fill="#FFF3E4" stroke="#3D2314" strokeWidth=".6" />
            <circle cx="10" cy="7" r="1.3" fill="#F8A5C2" />
          </svg>
        </span>
      )}
      <span className={`font-display text-xl font-extrabold tracking-tight ${light ? "text-cream" : "text-choco"}`}>
        ICE<span className="text-strawberry">POPS</span>
      </span>
    </Link>
  );
};
