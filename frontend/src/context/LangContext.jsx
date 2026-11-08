import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { TE } from "@/lib/i18n";
import { useAuth } from "@/context/AuthContext";

const KEY = "icepops_lang";
const LangContext = createContext({ lang: "en", t: (s) => s, pn: (p) => p?.name, pd: (p) => p?.description, setLang: () => {} });

export const LangProvider = ({ children }) => {
  const { user } = useAuth();
  const [lang, setLangState] = useState(() => localStorage.getItem(KEY) || "en");

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    if (user && (user.language || "en") !== lang) api.put("/account/language", { language: lang }).catch(() => {});
  }, [user, lang]);

  const setLang = useCallback((l) => {
    localStorage.setItem(KEY, l);
    setLangState(l);
  }, []);

  const value = useMemo(() => {
    const te = lang === "te";
    return {
      lang, setLang,
      t: (s) => (te && TE[s]) || s,
      pn: (p) => (te && p?.name_te) || p?.name,
      pd: (p) => (te && p?.description_te) || p?.description,
    };
  }, [lang, setLang]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
};

export const useLang = () => useContext(LangContext);

export const LangSwitch = () => {
  const { lang, setLang } = useLang();
  return (
    <div className="flex rounded-full border border-choco/20 bg-white p-0.5 text-xs font-bold" role="group" aria-label="Language">
      {[["en", "EN"], ["te", "తెలుగు"]].map(([k, l]) => (
        <button key={k} data-testid={`lang-switch-${k}`} aria-pressed={lang === k} onClick={() => setLang(k)}
          className={`rounded-full px-2.5 py-1 text-xs transition-colors ${lang === k ? "bg-choco text-cream shadow-sm" : "text-choco/75 hover:text-choco"} ${k === "te" ? "font-telugu tracking-normal" : ""}`}>{l}</button>
      ))}
    </div>
  );
};
