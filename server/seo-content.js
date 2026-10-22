// Answer-engine content for key pages: a 40–60 word "In short" answer that leads the page, a short
// visible FAQ, and the matching FAQPage JSON-LD. Stamped by server/site-shell.js. Facts only — every
// statement here is also stated elsewhere on the site.
export const BROKER = "Dorota Maslowska, Broker Associate with LPT Realty (Florida BK3519799, Texas 829789-SA)";

const SHOWING = { q: "How do I request a showing?", a: "Tap “Request a showing” on any home, live tour or video, or call 813-781-8888. Dorota Maslowska, a licensed broker with LPT Realty, follows up to confirm a private showing in person or on live video. There is no fee to buyers or renters." };

export const PAGES = {
  "index.html": {
    answer: "Bridges Live lets you watch Tampa Bay homes on live video, ask questions in real time and request a private showing in one tap. Tours cover new construction, resale homes and neighborhoods from Tampa to Sarasota. Every request goes to Dorota Maslowska, a licensed Broker Associate with LPT Realty, who speaks English and Polish.",
    faqs: [
      { q: "What is Bridges Live?", a: "Bridges Live is a live video platform for Tampa Bay real estate. Licensed agents and builders stream homes, model homes and neighborhoods; viewers chat, ask questions and request a private showing in one tap. Bridges Global is a marketing and technology service, not a brokerage." },
      SHOWING,
      { q: "Who is the broker behind Bridges Global?", a: "Dorota Maslowska, Broker Associate with LPT Realty, licensed in Florida (BK3519799) and Texas (829789-SA). She works in English and Polish with buyers, sellers and renters relocating to Tampa Bay." },
      { q: "Does it cost anything to use?", a: "No. There are no fees to buyers or renters. Compensation is paid by property owners and builders as allowed by state law, and earnest money is never collected through the website." },
    ],
  },
  "live-marketplace/index.html": {
    answer: "Bridges Live shows every live home tour streaming in Tampa Bay right now, plus recent video walkthroughs between broadcasts. Licensed agents and builders go live from their phones; viewers join the live chat, ask questions and tap “Request a showing.” A LIVE badge appears only when a stream is actually on air.",
    faqs: [
      { q: "When are tours live?", a: "Agents and builders stream throughout the week. A LIVE badge and real viewer count appear only while a stream is on air; between broadcasts you can play recent video tours or ask to be notified when the next one starts." },
      { q: "Can I ask questions during a live tour?", a: "Yes. Join the live chat on any Bridges Live stream to ask the agent about the home, the HOA, schools or the commute, and request a private showing without leaving the stream." },
      { q: "How do agents stream on Bridges Live?", a: "Licensed agents and builders apply on the Stream on Bridges Live page. Once approved they go live from a phone using the free Larix app, or paste a YouTube, TikTok or Facebook live link." },
    ],
  },
  "listings/index.html": {
    answer: "This page lists active homes for sale across Tampa Bay from Stellar MLS, the region's multiple listing service, with each listing brokerage credited. Filter by area, price and bedrooms, then tap “Request a showing.” A licensed broker with LPT Realty confirms a private showing in person or on live video.",
    faqs: [
      { q: "Where do these listings come from?", a: "Active listings come from Stellar MLS through its approved IDX data feed. Each card names the listing brokerage and MLS number. Information is deemed reliable but not guaranteed." },
      SHOWING,
      { q: "Can I see every home for sale?", a: "Yes. “Search every MLS home” opens the full Stellar MLS search on bridgesglobal.co, with saved searches and new-listing alerts." },
    ],
  },
  "dorota-maslowska/index.html": {
    answer: "Dorota Maslowska is a Broker Associate with LPT Realty, licensed in Florida (BK3519799) and Texas (829789-SA), and the founder of Bridges Live. She helps buyers, sellers and renters across Tampa Bay in English and Polish, using live video tours so clients can see a home before they travel.",
    faqs: [
      { q: "Which areas does Dorota Maslowska serve?", a: "Tampa Bay, including Tampa, Brandon, Riverview, Apollo Beach, Wesley Chapel, Parrish, Lakewood Ranch, Sarasota, St. Petersburg and Clearwater." },
      { q: "Which languages does she work in?", a: "English and Polish." },
      { q: "How do I contact her?", a: "Call 813-781-8888, email dd@bridgesglobal.co, message on WhatsApp, or tap “Request a showing” anywhere on the site." },
    ],
  },
  "sell/index.html": {
    answer: "Selling with Bridges Global means your showings can stream live to buyers who are relocating from other states and countries, not just local shoppers. Dorota Maslowska, a Broker Associate with LPT Realty, lists your home, hosts the live showings and handles requests from viewers who want to see it in person.",
    faqs: [
      { q: "What is a live-streamed showing?", a: "Your agent tours the home on live video while buyers watch, chat and ask questions in real time. Viewers can request a private in-person showing directly from the stream." },
      { q: "How do I find out what my home is worth?", a: "Request a free home valuation on the site. A licensed broker with LPT Realty gives you a real market value, not an automated estimate." },
    ],
  },
  "new-construction/index.html": {
    answer: "Buying new construction in Tampa Bay with your own broker costs you nothing — the builder pays the commission — and keeps someone on your side for incentives, upgrades and contract terms. Bridges Global tours model homes on live video in Parrish, Riverview, Wesley Chapel and beyond, then arranges your visit.",
    faqs: [
      { q: "Do I need my own agent to buy from a builder?", a: "You don't have to, but your own broker represents you rather than the builder, and builders typically pay that compensation. Register with your broker before you first tour the sales center." },
      SHOWING,
    ],
  },
  "relocation/index.html": {
    answer: "Relocating to Tampa Bay with Bridges Global starts before you arrive: Dorota Maslowska, a licensed broker with LPT Realty, tours homes and neighborhoods for you on live video in your time zone, explains schools and commutes, and works in English or Polish, so you can choose a home before you fly in.",
    faqs: [
      { q: "Can I buy or rent without visiting first?", a: "You can narrow your choice on live video tours, then visit to confirm. Your broker can tour any home live, answer questions on camera and arrange a showing when you arrive." },
      { q: "Is there a fee for relocation help?", a: "There is no fee to buyers or renters; compensation is paid by property owners and builders as allowed by state law." },
    ],
  },
  "apartment-locating/index.html": {
    answer: "Apartment locating with Bridges Global is free for renters across Tampa Bay — the apartment community pays. Tell us your budget, move-in date and preferred area, and we match you with communities, share current move-in specials and tour units on live video so there are no surprises on moving day.",
    faqs: [
      { q: "Is apartment locating really free?", a: "Yes. Renters pay nothing; participating communities compensate the locator as allowed by state law." },
      { q: "Can I see the actual unit before I apply?", a: "Yes. We can tour the specific unit on live video before you apply." },
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
      areaServed: ["Tampa", "Brandon", "Riverview", "Apollo Beach", "Wesley Chapel", "Parrish", "Lakewood Ranch", "Sarasota", "St. Petersburg", "Clearwater"].map((n) => ({ "@type": "City", name: n })),
      knowsLanguage: ["English", "Polish"], parentOrganization: { "@type": "Organization", name: "LPT Realty" },
    },
  ],
};
