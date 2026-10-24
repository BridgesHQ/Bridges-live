// Answer-engine content for key pages: a 40–60 word "In short" answer that leads the page, a short
// visible FAQ, and the matching FAQPage JSON-LD. Stamped by server/site-shell.js. Facts only — every
// statement here is also stated elsewhere on the site.
export const BROKER = "Dorota Maslowska, Broker Associate with LPT Realty (Florida BK3519799, Texas 829789-SA)";

const SHOWING = { q: "How do I request a showing?", a: "Tap “Request a showing” on any home, live tour or video, or call 813-781-8888. Dorota Maslowska, a licensed broker with LPT Realty, follows up to confirm a private showing in person or on live video." };
const MARKETS = { q: "Which markets do you cover?", a: "Tampa Bay and Sarasota in Florida, and Austin, Texas. Relocation clients moving from other states and other countries are toured live on video in their own time zone." };

export const PAGES = {
  "index.html": {
    answer: "Bridges Live lets you watch homes on live video, ask the agent questions on camera and request a private showing in one tap. Tours cover new construction, apartments and resale homes across Tampa Bay, Sarasota and Austin, and every request goes to Dorota Maslowska, a licensed Broker Associate with LPT Realty.",
    faqs: [
      { q: "What is Bridges Live?", a: "Bridges Live is a live video platform for real estate. Licensed agents and builders stream homes, model homes, apartments and neighborhoods; viewers chat, ask questions and request a private showing in one tap. Bridges Global is a marketing and technology service, not a brokerage." },
      SHOWING, MARKETS,
      { q: "Who is the broker behind Bridges Global?", a: "Dorota Maslowska, Broker Associate with LPT Realty, licensed in Florida (BK3519799) and Texas (829789-SA). She works in English and Polish with buyers, sellers and renters, including clients relocating from other states and countries." },
    ],
  },
  "live-marketplace/index.html": {
    answer: "Bridges Live shows every home tour streaming right now across Tampa Bay, Sarasota and Austin, and the tours scheduled next. Licensed agents and builders go live from their phones; viewers join the chat, ask questions on camera and tap “Request a showing.” A LIVE badge appears only while a stream is actually on air.",
    faqs: [
      { q: "When are tours live?", a: "Agents and builders stream throughout the week. A LIVE badge and real viewer count appear only while a stream is on air; when no one is on air you can ask to be notified the moment the next tour starts." },
      { q: "Can I ask questions during a live tour?", a: "Yes. Join the live chat on any Bridges Live stream to ask about the home, the HOA, schools or the commute, and request a private showing without leaving the stream." },
      { q: "How do agents stream on Bridges Live?", a: "Licensed agents and builders apply on the Stream on Bridges Live page. Once approved they go live from a phone using the Larix app, or paste a YouTube, TikTok or Facebook live link." },
    ],
  },
  "listings/index.html": {
    answer: "This page lists active homes for sale from Stellar MLS across Tampa Bay and Sarasota, with each listing brokerage credited. Filter by area, price and bedrooms, then tap “Request a showing” for any home. A licensed broker with LPT Realty confirms a private showing in person or on live video, from anywhere in the world.",
    faqs: [
      { q: "Where do these listings come from?", a: "Active listings come from Stellar MLS through its approved IDX data feed. Each card names the listing brokerage and MLS number. Information is deemed reliable but not guaranteed." },
      SHOWING,
      { q: "Can I see every home for sale?", a: "Yes. “Search every MLS home” opens the full MLS search on bridgesglobal.co, with saved searches and new-listing alerts. For Austin, Texas, request a showing and we will send matching homes." },
    ],
  },
  "buy/index.html": {
    answer: "Buying with Bridges Global starts on live video: shortlist homes across Tampa Bay, Sarasota and Austin from wherever you are, ask the agent anything on camera, and book in-person showings only for the homes that make the cut. Dorota Maslowska, a licensed Broker Associate with LPT Realty, guides the purchase from offer to closing.",
    faqs: [
      { q: "Can I buy a home without visiting first?", a: "You can narrow your shortlist on live video tours, then visit in person to confirm the one you choose. Your broker can tour any home live and answer questions on camera." },
      SHOWING, MARKETS,
    ],
  },
  "dorota-maslowska/index.html": {
    answer: "Dorota Maslowska is a Broker Associate with LPT Realty, licensed in Florida (BK3519799) and Texas (829789-SA), and the founder of Bridges Live. She helps buyers, sellers and renters in Tampa Bay, Sarasota and Austin in English and Polish, using live video tours so clients can see a home before they travel.",
    faqs: [
      MARKETS,
      { q: "Which languages does she work in?", a: "English and Polish." },
      { q: "How do I contact her?", a: "Call 813-781-8888, email dd@bridgesglobal.co, message on WhatsApp, or tap “Request a showing” anywhere on the site." },
    ],
  },
  "sell/index.html": {
    answer: "Selling with Bridges Global means your showings can stream live to buyers who are relocating from other states and countries, not just local shoppers. Dorota Maslowska, a Broker Associate with LPT Realty, lists your home in Tampa Bay, Sarasota or Austin, hosts the live showings and handles requests from viewers who want to see it in person.",
    faqs: [
      { q: "What is a live-streamed showing?", a: "Your agent tours the home on live video while buyers watch, chat and ask questions in real time. Viewers can request a private in-person showing directly from the stream." },
      { q: "How do I find out what my home is worth?", a: "Request a home valuation on the site. A licensed broker with LPT Realty gives you a real market value, not an automated estimate." },
    ],
  },
  "new-construction/index.html": {
    answer: "New construction on Bridges Live is toured from the model home: builders stream the floor plans, the lots and current incentives, and you ask questions in real time. Your own broker, Dorota Maslowska with LPT Realty, represents you with builders across Tampa Bay, Sarasota and Austin, then arranges your visit to the community.",
    faqs: [
      { q: "Do I need my own agent to buy from a builder?", a: "You don't have to, but your own broker represents you rather than the builder. Register with your broker before you first tour the sales center." },
      SHOWING,
    ],
  },
  "relocation/index.html": {
    answer: "Relocating with Bridges Global starts before you arrive: Dorota Maslowska, a licensed broker with LPT Realty, tours homes and neighborhoods for you on live video in your time zone, explains schools and commutes, and works in English or Polish, so you can choose a home in Tampa Bay, Sarasota or Austin before you fly in.",
    faqs: [
      { q: "Can I buy or rent without visiting first?", a: "You can narrow your choice on live video tours, then visit to confirm. Your broker can tour any home live, answer questions on camera and arrange a showing when you arrive." },
      MARKETS,
    ],
  },
  "apartment-locating/index.html": {
    answer: "Apartment locating with Bridges Global matches renters to apartment communities across Tampa Bay, Sarasota and Austin. Tell us your budget, move-in date and preferred area; we shortlist communities, share current move-in specials and tour the actual unit on live video before you apply, so there are no surprises on moving day.",
    faqs: [
      { q: "Can I see the actual unit before I apply?", a: "Yes. We tour the specific unit on live video before you apply, and you can ask about the view, noise, parking and finishes on camera." },
      { q: "Which areas do you cover for apartments?", a: "Tampa Bay, Sarasota and Austin, Texas — including renters relocating from other states and countries." },
    ],
  },
  "neighborhoods/index.html": {
    answer: "Bridges Global covers neighborhoods across Tampa Bay, Sarasota and Austin, from Tampa, St. Petersburg and Clearwater to Lakewood Ranch, Parrish and Sarasota. Ask for a live video tour and a licensed broker with LPT Realty walks the streets, the commute and the homes with you, so you can choose before you fly in.",
    faqs: [
      { q: "Can you tour a neighborhood for me on live video?", a: "Yes. Tell us which neighborhoods you are considering and what matters to you — schools, commute, water, walkability — and we tour the streets and homes live, in your time zone." },
      MARKETS, SHOWING,
    ],
  },
  "home-value/index.html": {
    answer: "A home valuation from Bridges Global is a licensed broker's opinion of what your home will sell for, not an automated estimate. Dorota Maslowska, Broker Associate with LPT Realty, studies recent comparable sales and active competition in Tampa Bay, Sarasota or Austin, adjusts for condition and upgrades, and explains the range she recommends.",
    faqs: [
      { q: "How is a broker's valuation different from an online estimate?", a: "Online estimates use public records and cannot see your home's condition, upgrades or the street it sits on. A broker compares recent nearby sales in person and explains the reasoning behind the range." },
      { q: "Do I have to list my home after a valuation?", a: "No. A valuation carries no obligation to list or sell." },
    ],
  },
  "tampa/index.html": {
    answer: "Tampa is one of the most in-demand housing markets in the country, with options from walkable city neighborhoods to new-construction suburbs like Riverview, Wesley Chapel and Parrish. Bridges Global tours Tampa homes on live video, so buyers and renters moving from other states or countries can see a home before they visit.",
    faqs: [
      { q: "Which Tampa-area suburbs have the most new construction?", a: "Parrish, Riverview and Wesley Chapel are among the most active areas for new construction around Tampa." },
      SHOWING,
    ],
  },
};

export const words = (t) => String(t).trim().split(/\s+/).length;

export function faqJsonLd(faqs) {
  return {
    "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
}

export const PERSON = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": ["Person"], "@id": "https://live.bridgesglobal.co/#dorota", name: "Dorota Maslowska", jobTitle: "Broker Associate",
      image: "https://live.bridgesglobal.co/assets/dorota.webp", url: "https://live.bridgesglobal.co/dorota-maslowska",
      telephone: "+1-813-781-8888", email: "dd@bridgesglobal.co", knowsLanguage: ["English", "Polish"],
      sameAs: ["https://www.facebook.com/DorotaBRIDGES/", "https://www.zillow.com/profile/realtordorota"],
      worksFor: { "@type": "RealEstateAgent", name: "LPT Realty" }, founder: { "@id": "https://live.bridgesglobal.co/#org" },
      hasCredential: [
        { "@type": "EducationalOccupationalCredential", credentialCategory: "Real estate broker license", identifier: "BK3519799", recognizedBy: { "@type": "State", name: "Florida" } },
        { "@type": "EducationalOccupationalCredential", credentialCategory: "Real estate license", identifier: "829789-SA", recognizedBy: { "@type": "State", name: "Texas" } },
      ],
    },
    {
      "@type": "RealEstateAgent", "@id": "https://live.bridgesglobal.co/#org", name: "Bridges Global — Dorota Maslowska, LPT Realty",
      url: "https://live.bridgesglobal.co", image: "https://live.bridgesglobal.co/assets/hero-luxury.jpg", logo: "https://live.bridgesglobal.co/assets/logo.svg",
      telephone: "+1-813-781-8888", email: "dd@bridgesglobal.co", employee: { "@id": "https://live.bridgesglobal.co/#dorota" },
      address: { "@type": "PostalAddress", addressLocality: "Tampa", addressRegion: "FL", addressCountry: "US" },
      areaServed: [["Tampa", "FL"], ["St. Petersburg", "FL"], ["Clearwater", "FL"], ["Brandon", "FL"], ["Riverview", "FL"], ["Wesley Chapel", "FL"], ["Parrish", "FL"], ["Lakewood Ranch", "FL"], ["Sarasota", "FL"], ["Austin", "TX"]].map(([n, st]) => ({ "@type": "City", name: n, containedInPlace: { "@type": "State", name: st } })),
      knowsLanguage: ["English", "Polish"], parentOrganization: { "@type": "Organization", name: "LPT Realty" },
    },
  ],
};
