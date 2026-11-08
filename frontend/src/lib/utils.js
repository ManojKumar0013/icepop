import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { inr } from "./format";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export const formatPaise = inr;
