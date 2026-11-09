import axios from "axios";

const rawUrl = process.env.REACT_APP_BACKEND_URL || "";
// Normalize localhost to 127.0.0.1 to prevent Windows IPv6 (::1) ERR_CONNECTION_REFUSED
const backendUrl = rawUrl.replace("://localhost:", "://127.0.0.1:").replace("://localhost/", "://127.0.0.1/");

export const api = axios.create({
  baseURL: `${backendUrl || ""}/api`,
  withCredentials: true,
  headers: { "X-CSRF-Guard": "1" },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("icepops_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const errMsg = (e, fallback = "Something went wrong. Please try again.") => {
  const d = e?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => (x.msg || "").replace(/^Value error, /, "")).join(", ");
  return fallback;
};

export const newKey = () =>
  (window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`);
