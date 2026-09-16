// Airbnb short-term rentals via RealtyAPI — key hidden server-side
export async function onRequest(context){
  const {request,env}=context; const url=new URL(request.url);
  const location=url.searchParams.get("location")||"Tampa, FL";
  try{
    const r=await fetch("https://airbnb.realtyapi.io/search/bylocation?location="+encodeURIComponent(location)+"&perPage=50",{headers:{"x-realtyapi-key":env.REALTYAPI_KEY}});
    const data=await r.json();
    return new Response(JSON.stringify(data),{headers:{"Content-Type":"application/json","Cache-Control":"public, max-age=3600"}});
  }catch(e){return new Response(JSON.stringify({error:"fetch failed"}),{status:500});}
}
