// Edge function "billing": abbonamenti dei seller con Stripe Billing (vedi handler.ts).
// Segreti richiesti: STRIPE_SECRET_KEY (sk_test_… per le prove, sk_live_… in produzione), STRIPE_WEBHOOK_SECRET (whsec_…).
// Da pubblicare con verify_jwt disattivato: la pagina /pay non ha login e il webhook arriva da Stripe.
import { createClient } from "npm:@supabase/supabase-js@2";
import { handle } from "./handler.ts";
import { makeStripe } from "./stripe.ts";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const secretKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const deps = {
  rpc: async (fn: string, args: Record<string, unknown>) => { const { data, error } = await sb.rpc(fn, args); if (error) throw error; return data; },
  stripe: secretKey ? makeStripe(secretKey) : null,
  secretKey,
  webhookSecret: Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "",
  siteBase: Deno.env.get("SITE_BASE") ?? "https://uniqaia.com",
  log: (...a: unknown[]) => console.error(...a),
};

Deno.serve((req) => handle(req, deps));
