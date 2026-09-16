// Cloudflare Pages Function — hides your RealtyAPI key server-side.
// Set REALTYAPI_KEY in Cloudflare → Pages → Settings → Environment variables.
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const location = url.searchParams.get("location") || "Tampa, FL";
  const perPage = url.searchParams.get("perPage") || "200";
  try {
    const r = await fetch(
      "https://apartments.realtyapi.io/search/bylocation?location=" +
        encodeURIComponent(location) + "&perPage=" + perPage,
      { headers: { "x-realtyapi-key": env.REALTYAPI_KEY } }
    );
    const data = await r.json();
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=1800" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "fetch failed" }), { status: 500 });
  }
}
