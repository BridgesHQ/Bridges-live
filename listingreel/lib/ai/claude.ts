import Anthropic from '@anthropic-ai/sdk';
import {betaZodOutputFormat} from '@anthropic-ai/sdk/helpers/beta/zod';
import * as z from 'zod/v4';
import {env} from '@/lib/env';
import {complianceFlags} from './compliance';

export type ListingInput = {address: string; price: number; beds: number; baths: number; sqft: number; highlights: string[]; agentName: string; brokerageName: string; ctaLink: string; photos: string[]};

const Scene = z.object({photoIndex: z.number().int(), caption: z.string(), durationSec: z.number()});
const Script = z.object({title: z.string(), hook: z.string(), scenes: z.array(Scene), cta: z.string(), caption: z.string()});
const Scripts = z.object({scripts: z.array(Script)});
export type ReelScript = z.infer<typeof Script>;

let client: Anthropic | null = null;
const anthropic = () => (client ??= new Anthropic({apiKey: env('anthropic').ANTHROPIC_API_KEY}));

const SYSTEM = `You write short-form vertical video scripts (TikTok / Reels / Shorts) for licensed real-estate agents.
Rules that always apply:
- Use only the property facts supplied. Never invent features, prices, schools, or neighborhood claims.
- U.S. Fair Housing Act: never mention or imply race, color, national origin, religion, sex, familial status, or disability; never say who the home is "perfect" or "ideal" for; never describe the people who live nearby or target a type of buyer. Describe the property, not the person.
- Each script: 4-7 scenes, 15-30 seconds total, scene photoIndex must be a valid index into the supplied photos.
- Every caption includes "Listing courtesy of <brokerage>" and ends with #AIgenerated.`;

/** Generates 10 compliant scripts. Non-compliant scripts are regenerated once, then rejected. */
export async function generateScripts(listing: ListingInput): Promise<ReelScript[]> {
  const {ANTHROPIC_MODEL} = env('anthropic');
  const photoCount = listing.photos.length;
  let feedback = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await anthropic().beta.messages.parse({
      model: ANTHROPIC_MODEL,
      max_tokens: 16000,
      // If the model declines a request, the API retries it on a fallback model instead of failing.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      messages: [{role: 'user', content: `Write exactly 10 distinct scripts for this listing (${photoCount} photos, indexes 0-${photoCount - 1}).\n${feedback}\nListing:\n${JSON.stringify({...listing, photos: undefined})}`}],
      output_config: {format: betaZodOutputFormat(Scripts)},
    });
    if (res.stop_reason === 'refusal') throw new Error('The AI declined to write scripts for this listing. Edit the listing details and try again.');
    const scripts = res.parsed_output?.scripts;
    if (!scripts?.length) throw new Error('Script generation returned no scripts — please try again.');
    const clean = scripts
      .map((s) => ({...s, scenes: s.scenes.filter((sc) => sc.photoIndex >= 0 && sc.photoIndex < photoCount)}))
      .filter((s) => s.scenes.length > 0);
    const flagged = clean.map((s) => complianceFlags(JSON.stringify(s))).filter((f) => f.length);
    if (!flagged.length && clean.length) return clean.slice(0, 10);
    feedback = `Your previous attempt used Fair Housing-sensitive wording (${[...new Set(flagged.flat())].join(', ')}). Remove it entirely.`;
  }
  throw new Error('Could not produce Fair Housing-compliant scripts for this listing. Remove any buyer-type language from the highlights and try again.');
}
