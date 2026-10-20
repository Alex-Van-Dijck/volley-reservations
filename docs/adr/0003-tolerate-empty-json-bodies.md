# ADR 0003: Accept empty bodies under application/json

- Status: Accepted
- Date: 2026-10-20
- Detailed design: `docs/superpowers/specs/2026-10-20-volleyball-reservations-design.md`, section on the HTTP API

## Context

Fastify's built-in JSON parser rejects a request that has `Content-Type: application/json` and a zero-length body with `FST_ERR_CTP_EMPTY_JSON_BODY` (`fastify/lib/content-type-parser.js`, `defaultJsonParser`). The error is raised before any route code runs and surfaces as a 400 `VALIDATION_ERROR` through the error handler in `app.ts`.

Several endpoints legitimately take no body or an optional one: `PUT /api/blocks/:date/:slotId` (optional `reason`), `DELETE /api/blocks/:date/:slotId`, `DELETE /api/events/:id` and `POST /api/auth/logout`. Many HTTP clients set `Content-Type: application/json` on every mutating request regardless of whether a body exists. That includes common fetch wrappers, ad-hoc scripts, and the planned Java port. The API tests did not catch this because `app.inject` sends no content type when there is no payload.

Task 7 review surfaced the issue. The PWA would fail on every block without a reason unless its client special-cased bodyless calls.

## Decision

Replace Fastify's default JSON parser with one that treats an empty body as "no body".

- In `buildApp`, take Fastify's own parser with `app.getDefaultJsonParser("error", "error")`, call `app.removeContentTypeParser("application/json")`, then register `app.addContentTypeParser("application/json", { parseAs: "string" }, ...)` that wraps it.
- An empty string body resolves to `undefined`, so `req.body` is `undefined`. Route handlers and the content-type guard already treat a missing body as absent.
- A non-empty body is passed to Fastify's default parser unchanged, so prototype-poisoning protection, malformed-JSON errors and their 400 status stay exactly as before.
- No new dependency: the wrapper reuses the parser Fastify ships, so `secure-json-parse` is not added to `@volley/api`.

The web client may therefore set `Content-Type` only when it has a body, or always. Both work.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| Web client omits the header on bodyless calls | Fixes only our own client. Every other caller must remember the rule, forever, and a missed case fails with a confusing 400. |
| Web client always sends `{}` | Same limitation, and it changes the semantics of DELETE and logout for no reason. |
| Per-route parser override | Spreads the exception across routes and leaves new bodyless routes exposed. |
| Disable the JSON parser and parse in handlers | Loses framework-level body limits and error handling. |

## Consequences

Positive:

- One change in one place. No client needs a special case, including the PWA and a future Java client.
- Bodyless mutating requests with a JSON content type behave like bodyless requests without one.

Negative and risks:

| Risk | Mitigation |
| --- | --- |
| The project now owns a small wrapper around the parser | It is a few lines and delegates to Fastify's default parser. Tests cover empty, valid, malformed and poisoned bodies. |
| `getDefaultJsonParser` is a Fastify API that could change | A major Fastify upgrade is reviewed anyway, and the tests fail loudly if the wrapper breaks. |
| A future Fastify upgrade may change content-type parser registration | A test sends an empty JSON body to a block route, so a regression fails loudly. |
| The content-type guard in `app.ts` skips requests with no body | Unchanged. SameSite=Lax on the session cookie remains the CSRF defence for bodyless mutating requests. |
