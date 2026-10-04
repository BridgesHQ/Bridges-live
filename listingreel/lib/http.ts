import {NextResponse} from 'next/server';

/** Reads a JSON or HTML-form body. (The old code called req.json() then req.formData() on the
 *  same request — the body was already consumed, so every form submit crashed.) */
export async function readBody(req: Request): Promise<{data: Record<string, any>; isForm: boolean}> {
  const ct = req.headers.get('content-type') || '';
  if (ct.includes('application/json')) return {data: await req.json().catch(() => ({})), isForm: false};
  if (ct.includes('form')) return {data: Object.fromEntries((await req.formData()).entries()), isForm: true};
  return {data: {}, isForm: false};
}

/** HTML forms get a redirect back to the page (with a message); fetch callers get JSON. */
export function reply(req: Request, isForm: boolean, back: string, body: Record<string, any>, status = 200) {
  if (!isForm) return NextResponse.json(body, {status});
  const url = new URL(back, req.url);
  if (body.error) url.searchParams.set('error', String(body.error));
  else if (body.message) url.searchParams.set('notice', String(body.message));
  return NextResponse.redirect(url, 303);
}

export const json = (body: unknown, status = 200) => NextResponse.json(body, {status});
