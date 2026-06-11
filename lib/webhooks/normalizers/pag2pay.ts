import type { NormalizedEvent } from "../types";
import { normalizeGeneric } from "./generic";

/**
 * Detect if payload is from Pag2Pay.
 * Permissive: looks for an explicit gateway/platform marker or Pag2Pay-specific
 * field names. Returns false when unsure (let detectGateway fall back to the
 * webhook's configured source).
 */
export function isPag2PayPayload(payload: Record<string, unknown>): boolean {
  const marker = String(
    payload.gateway || payload.platform || payload.source || ""
  )
    .toLowerCase()
    .replace(/\s+/g, "");
  // aceita variacoes/grafias antigas como alias
  if (marker === "pag2pay" || marker === "pag2ppay" || marker === "pag2p")
    return true;

  if (
    "pag2pay_id" in payload ||
    "pag2p_id" in payload ||
    "pag2ppay_id" in payload
  )
    return true;

  return false;
}

/**
 * Normalize a Pag2Pay payload using the shared generic normalizer.
 */
export function normalizePag2Pay(
  payload: Record<string, unknown>
): NormalizedEvent {
  return normalizeGeneric(payload, "pag2pay");
}
