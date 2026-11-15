import { createContext, useContext } from "react";
import { useStorefrontData } from "@/lib/useStorefrontData";

const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  const request = useStorefrontData("/store/info", { list: false });
  return <StoreContext.Provider value={request}>{children}</StoreContext.Provider>;
}

export const useStoreRequest = () => useContext(StoreContext);
export const useStore = () => useStoreRequest()?.data ?? null;
