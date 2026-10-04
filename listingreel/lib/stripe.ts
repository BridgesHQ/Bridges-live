import Stripe from 'stripe';
import {env} from './env';

// No explicit apiVersion: the SDK pins the version its types were built for.
// ('2025-09-30.clover' did not match stripe@18.5 and failed the build.)
let client: Stripe | null = null;
export function stripe() {
  if (!client) client = new Stripe(env('stripe').STRIPE_SECRET_KEY);
  return client;
}
