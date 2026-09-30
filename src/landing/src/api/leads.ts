import { API_BASE } from "../config";

export type LeadStoreType =
  | "GROCERY"
  | "SUPERMARKET"
  | "MINIMARKET"
  | "PHARMACY"
  | "HOUSEHOLD"
  | "CLOTHING"
  | "ELECTRONICS"
  | "SPORTS"
  | "TOYS"
  | "FURNITURE"
  | "COSMETICS"
  | "JEWELRY"
  | "BOOKS"
  | "PET"
  | "OTHER";

/** Mirrors CreateLeadDto in src/server/modules/leads — the server rejects unknown fields. */
export interface LeadInput {
  fullName: string;
  /** `+998` and nine digits. */
  phone: string;
  storeName: string;
  storeType: LeadStoreType;
  lang: "uz" | "ru";
  /** Honeypot, always empty from a person. */
  website: string;
}

export type LeadResult = "ok" | "rate-limited" | "failed";

/** Never throws: the form shows a message for every outcome. */
export async function sendLead(input: LeadInput): Promise<LeadResult> {
  try {
    const res = await fetch(`${API_BASE}/leads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(input),
    });
    if (res.ok) return "ok";
    return res.status === 429 ? "rate-limited" : "failed";
  } catch {
    return "failed";
  }
}
