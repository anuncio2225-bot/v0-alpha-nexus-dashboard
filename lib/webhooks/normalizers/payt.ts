import type { NormalizedEvent } from "../types";
import { normalizeGeneric } from "./generic";

/**
 * Detect if payload is from Payt.
 * Permissive: looks for an explicit gateway/platform marker or Payt-specific
 * field names. Returns false when unsure (let detectGateway fall back to the
 * webhook's configured source).
 */
export function isPaytPayload(payload: Record<string, unknown>): boolean {
  const marker = String(
    payload.gateway || payload.platform || payload.source || ""
  ).toLowerCase();
  if (marker.includes("payt")) return true;

  // Payt real payload shape: flat keys with dots + Payt-specific fields.
  if (
    "seller_id" in payload ||
    "cart_id" in payload ||
    "integration_key" in payload ||
    "customer.name" in payload ||
    "transaction_id" in payload ||
    "transaction.payment_status" in payload ||
    "payt_id" in payload ||
    "payt_transaction" in payload
  ) {
    return true;
  }

  // URLs that point to payt domains
  const linkUrl = String(payload["link.url"] || payload.url || "").toLowerCase();
  if (linkUrl.includes("payt")) return true;

  return false;
}

/**
 * Normalize a Payt payload using the shared generic normalizer.
 */
export function normalizePayt(
  payload: Record<string, unknown>
): NormalizedEvent {
  return normalizeGeneric(payload, "payt");
}
