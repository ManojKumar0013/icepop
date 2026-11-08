import { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";

const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  const [store, setStore] = useState(null);
  useEffect(() => {
    api.get("/store/info").then(({ data }) => setStore(data)).catch(() => setStore(null));
  }, []);
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export const useStore = () => useContext(StoreContext);
