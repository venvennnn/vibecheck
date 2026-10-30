# VibeCheck

VibeCheck helps a brand team find unexpected cultural partners and turn them into a campaign portfolio they can review.

A visitor writes a brief, confirms at least two Qloo references, and inspects real connections across music, books, podcasts, places, and brands. An optimiser picks a complementary mix inside a capped pool. Gemini can draft the proposal from that evidence. Nothing is booked, bought, or stored in an account.

Work lives in the current browser session. Clear session removes it. There is no database and no durable recovery.

## What affinity means

Qloo affinity is shown as a raw number labeled **Qloo affinity**. It is a cultural signal. It is not a match percentage, a sponsorship price, availability, or predicted business lift.

Portfolio scoring uses a separate product heuristic: within-domain rank utility with averaged ties, minus tag overlap and cost. That score is optimal only inside the displayed pool of at most 40 candidates.

## Evidence labels

Every factual claim stays in one of three lanes:

- **Qloo cultural signal** — affinity, entity id, request parameters, and explainability when Qloo returned it. Missing explainability stays missing.
- **External research lead** — optional Tavily results. Snippets do not confirm a quote, a right, or a date.
- **User-confirmed commercial detail** — what your team attested. A confirmed quote needs a source URL, the campaign currency, dates that cover the brief, cleared rights, geographic fit, and a check within 30 days. Anything else is an **allocation, not a quote**. Currencies are never converted.

A book or artist is an IP or reference opportunity. The rights-holder still has to be checked. A place filter does not mean an artist can perform there.

## Setup

Node.js 20.9 or newer.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. **Try the demo** loads the running-brand brief and resolves references against Qloo. **Start a campaign** begins empty. Both paths can discover, inspect evidence, change the budget, remove a partner, and export.

### Server environment

Set these in `.env.local` and in the Vercel project for preview and production. They stay on the server.

| Name | Required | Notes |
| --- | --- | --- |
| `QLOO_API_KEY` | Yes, for live discovery | Sent as `X-Api-Key`. |
| `QLOO_BASE_URL` | Yes | `https://hackathon.api.qloo.com` for a hackathon key. `https://api.qloo.com` for a production key. Other hosts are rejected. |
| `GEMINI_API_KEY` | For proposal prose | |
| `GEMINI_MODEL` | For proposal prose | A model that supports structured JSON output. |
| `TAVILY_API_KEY` | No | Public research. Omitted searches are skipped. |
| `EVIDENCE_SIGNING_SECRET` | Yes, before evidence can be reused | Signs expiring Qloo envelopes. Later routes reject unsigned or expired provider evidence. |

The in-memory rate limit on a single instance is only a backstop. Put a Vercel firewall rule in front of `/api/*`, and set spending caps on Qloo, Gemini, and Tavily. An unsigned counter in the browser is not abuse prevention.

Discovery routes declare `maxDuration` (120 seconds on `/api/discover`). That requires a Vercel plan that allows it. The run itself also stops at 120 seconds, 30 Qloo calls, 8 searches, and 6 Gemini calls.

## Scripts

```bash
npm run dev
npm run lint
npm test
npm run typecheck
npm run build
npm run test:e2e
```

`npm test` covers schema gates, both Qloo envelope shapes, missing affinity, quote and currency rules, pins, exclusions, infeasible mixes, optimiser enumeration, signed evidence, cancellation, provider failure, replacement, and exports. End-to-end tests drive the demo and custom flows in a browser with mocked provider routes. Mocked tests do not prove the live keys work. After configuring `.env.local`, run the demo once and confirm `/api/discover` returns candidates.

## How a run moves

1. The brief and two distinct confirmed references are validated.
2. Five domains are queried with concurrency two. Places also send `filter.location.query` and `filter.location.radius=0`.
3. Ids are deduped. Coverage is inspected.
4. If coverage is thin, one wider round runs. Locality is not relaxed.
5. Up to six public research lookups run when Tavily is configured.
6. Open commercial checks are listed and the pool is optimised.
7. Gemini writes concepts from the signed evidence. Unknown ids and citations are rejected.
8. Removing a partner excludes that id and recomputes. If the mix is then impossible, one substitute search runs and the outcome is explained. Hard constraints are not relaxed on their own.

Slider changes recompute in a Web Worker and mark campaign prose stale until it is regenerated. Changing the budget, dates, currency, or wording keeps the discoveries and marks that prose stale. Changing the city, country, confirmed references, or partner exclusions starts a new revision and clears discoveries, so a late response cannot overwrite them. Exports are JSON, CSV, and print. CSV cells that start with `=`, `+`, `-`, or `@` are prefixed so a spreadsheet does not treat them as formulas.

## Deployment

The app is a Next.js App Router project. Route handlers use the default Node.js runtime. Cache Components is enabled, so the routes do not set a `runtime` export; they do set `maxDuration`.

This checkout has no public production URL. A Vercel project and the server variables above are required before an anonymous demo can be opened.

1. Push this repository.
2. Import it in Vercel and select the Pro settings that allow the route `maxDuration` values.
3. Add the environment variables above to Preview and Production.
4. Add a firewall rate limit on the API routes.
5. Deploy and open the production URL in a private window. Try the demo, then a second brand, without signing in.

Do not commit `.env.local` or real Qloo responses. Recorded responses may be replayed only when publication is allowed, and the screen must say **Recorded example** with the retrieval date. This build does not ship a recorded corpus. Illustrative photographs on the landing page and the idle canvas are a design preview, not recommendations.

## Limits

- No accounts, payments, booking, outreach, or collaboration.
- Session storage can disappear when the tab closes. Clear session wipes it on purpose.
- Optimality is only inside the 40-candidate pool. Four partners is the maximum, which keeps enumeration at or under 91,390 combinations.
- Tag overlap estimates redundancy. It is not audience overlap. Missing tags use a declared same-category fallback of 0.5.
- Gemini citation checks stop invented sources. They do not make the prose true. Read it before exporting.
- The optional comparison gives both arms the same brief and commercial evidence. Only one arm receives Qloo evidence. Blind ratings are not proof of improvement.
- Server memory is not a session store. Each request sends the validated brief and, where needed, signed evidence.
