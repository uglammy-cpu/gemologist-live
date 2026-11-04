// Stripe senza librerie: chiamate all'API REST e verifica della firma dei webhook.
// Niente dipendenze, così lo stesso file gira nella edge function (Deno) e nei test (Node).

export type Params = Record<string, string | number | boolean | null | undefined>;
export type StripeCall = (method: "GET" | "POST" | "DELETE", path: string, params?: Params, idempotencyKey?: string) => Promise<any>;
export class StripeError extends Error { constructor(message: string, public status: number, public code?: string) { super(message); } }

export function form(params: Params = {}): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") u.append(k, String(v));
  return u.toString();
}

export function makeStripe(secretKey: string, fetchImpl: typeof fetch = fetch): StripeCall {
  return async (method, path, params, idempotencyKey) => {
    const query = method === "GET" && params ? "?" + form(params) : "";
    const res = await fetchImpl("https://api.stripe.com" + path + query, {
      method,
      headers: {
        authorization: `Bearer ${secretKey}`,
        "content-type": "application/x-www-form-urlencoded",
        ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
      },
      body: method === "GET" ? undefined : form(params),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new StripeError(j?.error?.message ?? `Stripe ${res.status}`, res.status, j?.error?.code);
    return j;
  };
}

const enc = (s: string) => new TextEncoder().encode(s);
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
function same(a: string, b: string) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }

/** Firma dei webhook Stripe: header "t=…,v1=…", HMAC-SHA256 di "t.payload", tolleranza di 5 minuti. */
export async function verifyStripeSignature(payload: string, header: string | null, secret: string, toleranceSec = 300, nowSec = Date.now() / 1000): Promise<boolean> {
  if (!header || !secret) return false;
  let t = ""; const v1: string[] = [];
  for (const part of header.split(",")) {
    const i = part.indexOf("="); if (i < 0) continue;
    const k = part.slice(0, i).trim(), v = part.slice(i + 1).trim();
    if (k === "t") t = v; else if (k === "v1") v1.push(v);
  }
  if (!/^\d+$/.test(t) || !v1.length || Math.abs(nowSec - Number(t)) > toleranceSec) return false;
  const key = await crypto.subtle.importKey("raw", enc(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = hex(await crypto.subtle.sign("HMAC", key, enc(`${t}.${payload}`)));
  return v1.some((s) => same(s, expected));
}

/** Il prezzo ricorrente da 149 €/mese: si cerca per lookup_key, si crea una volta sola, si controlla che sia giusto. */
export async function ensurePrice(stripe: StripeCall, cents: number): Promise<string> {
  const lookup = `uniqaia_monthly_${cents}`;
  const list = await stripe("GET", "/v1/prices", { "lookup_keys[]": lookup, active: true, limit: 1 });
  let p = list?.data?.[0];
  if (!p) {
    const product = await stripe("POST", "/v1/products", { name: "Uniqaia — monthly subscription" }, `uq-product-${lookup}`);
    p = await stripe("POST", "/v1/prices", { product: product.id, currency: "eur", unit_amount: cents, "recurring[interval]": "month", lookup_key: lookup, nickname: `Uniqaia ${cents / 100}/month` }, `uq-price-${lookup}`);
  }
  if (p.unit_amount !== cents || p.currency !== "eur" || p.recurring?.interval !== "month") throw new Error("Il prezzo su Stripe non corrisponde a quello del piano");
  return p.id;
}

/** Lo sconto della ruota: buono da N centesimi valido una volta sola, cioè solo sulla prima fattura. */
export async function ensureCoupon(stripe: StripeCall, discountCents: number): Promise<string> {
  const id = `uniqaia_welcome_${discountCents}`;
  let c: any;
  try { c = await stripe("GET", `/v1/coupons/${id}`); }
  catch (e) {
    if (!(e instanceof StripeError) || e.status !== 404) throw e;
    c = await stripe("POST", "/v1/coupons", { id, amount_off: discountCents, currency: "eur", duration: "once", name: "Uniqaia welcome offer" }, `uq-coupon-${id}`);
  }
  if (c.amount_off !== discountCents || c.currency !== "eur" || c.duration !== "once" || c.valid === false) throw new Error("Il buono su Stripe non corrisponde allo sconto");
  return id;
}
