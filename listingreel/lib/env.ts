import {z} from 'zod';

// Env vars are validated lazily, per feature, the first time that feature is used.
// (Parsing everything at import time broke `next build` and crashed every page whenever
// an unrelated key — Stripe, Creatomate — was missing.)
const groups = {
  public: z.object({
    NEXT_PUBLIC_APP_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  }),
  supabaseAdmin: z.object({SUPABASE_SERVICE_ROLE_KEY: z.string().min(20)}),
  anthropic: z.object({
    ANTHROPIC_API_KEY: z.string().min(10),
    ANTHROPIC_MODEL: z.string().default('claude-opus-5-5'),
  }),
  creatomate: z.object({CREATOMATE_API_KEY: z.string().min(10), CREATOMATE_TEMPLATE_ID: z.string().min(1)}),
  stripe: z.object({
    STRIPE_SECRET_KEY: z.string().startsWith('sk_'),
    STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_'),
    STRIPE_PRICE_ID: z.string().startsWith('price_'),
    STRIPE_TRIAL_DAYS: z.coerce.number().int().min(0).max(30).default(7),
  }),
  cron: z.object({CRON_SECRET: z.string().min(16, 'CRON_SECRET must be at least 16 characters')}),
} as const;

type Groups = typeof groups;
const cache = new Map<keyof Groups, unknown>();

export function env<K extends keyof Groups>(group: K): z.infer<Groups[K]> {
  if (!cache.has(group)) {
    const r = groups[group].safeParse(process.env);
    if (!r.success) {
      const missing = r.error.issues.map((i) => i.path.join('.')).join(', ');
      throw new Error(`ListingReel is missing configuration for "${group}": ${missing}. See .env.example.`);
    }
    cache.set(group, r.data);
  }
  return cache.get(group) as z.infer<Groups[K]>;
}

/** True when every key of a feature group is configured (for showing setup hints instead of crashing). */
export function configured(group: keyof Groups) {
  return groups[group].safeParse(process.env).success;
}
