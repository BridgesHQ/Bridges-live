import type {Platform, Publisher} from './types';

// Posting to TikTok / Instagram / YouTube / Facebook needs each platform's app review and
// OAuth flow. Until those are added, publishing fails loudly and the UI offers the MP4
// download instead — never pretend a post succeeded.
const unavailable = (p: string): Publisher => ({
  async refresh(a) { return a; },
  async publish() { throw new Error(`${p} account is not connected or API credentials are not configured`); },
  async analytics() { return {}; },
});
export const publishers: Record<Platform, Publisher> = {tiktok: unavailable('TikTok'), instagram: unavailable('Instagram'), youtube: unavailable('YouTube'), facebook: unavailable('Facebook')};
