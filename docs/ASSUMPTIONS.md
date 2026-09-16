# Assumptions & Decisions Log
- ASSUME: RealtyAPI license permits displaying listings on the site (verify with vendor).
- DECISION: Dark theme = default (Netflix-meets-Sotheby's), light theme optional later.
- DECISION: Track A uses YouTube/TikTok embed (free, no dev) until Amazon IVS is built.
- ASSUME: All streaming agents are licensed; onboarding enforces license verification.
- DECISION: "Reserve" = express interest + refundable hold; NOT a property reservation (compliance).
- FLAG: Earnest money → broker trust/title escrow, never Stripe (broker/attorney to confirm).
