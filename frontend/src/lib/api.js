import axios from "axios";

export const api = axios.create({
  baseURL: `${process.env.REACT_APP_BACKEND_URL || ""}/api`,
  withCredentials: true,
  headers: { "X-CSRF-Guard": "1" },
});

export const errMsg = (e, fallback = "Something went wrong. Please try again.") => {
  const d = e?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => (x.msg || "").replace(/^Value error, /, "")).join(", ");
  return fallback;
};

export const newKey = () =>
  (window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`);
