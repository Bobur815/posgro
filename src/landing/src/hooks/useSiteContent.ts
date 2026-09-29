import { useEffect, useState } from "react";
import type { LandingPlan, LandingContact } from "@shared/types/landing.types";
import { getJson } from "../api/siteConfig";
import {
  FALLBACK_PLANS,
  FALLBACK_PRICES,
  FALLBACK_CONTACT,
  type Prices,
} from "../content";

/**
 * Starts with the baked-in content from content.ts, then swaps in the live config when it
 * arrives. Nothing waits on the network: with the API down the page is complete and correct.
 */
export function useSiteContent() {
  const [plans, setPlans] = useState<LandingPlan[]>(FALLBACK_PLANS);
  const [prices, setPrices] = useState<Prices>(FALLBACK_PRICES);
  const [contact, setContact] = useState<LandingContact>(FALLBACK_CONTACT);

  useEffect(() => {
    // Live content replaces the baked copy when it arrives. A failure leaves what is rendered.
    getJson("/site-config/landing-plans", FALLBACK_PLANS).then(
      (p) => p.length && setPlans(p),
    );
    getJson("/site-config/subscription-plans", FALLBACK_PRICES).then(setPrices);
    getJson("/site-config/landing-contact", FALLBACK_CONTACT).then(setContact);
  }, []);

  const telegram = contact.socials.find((s) => s.platform === "telegram")?.url;

  return { plans, prices, contact, telegram };
}
