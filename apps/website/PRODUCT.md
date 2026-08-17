# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Developers evaluating an LMS backend, in three confirmed segments (in order):

1. Product/SaaS dev teams adding courses or training to an existing product behind their own frontend.
2. Indie developers and founders building a course or membership business who want full code ownership.
3. Agencies and consultancies building learning platforms for clients.

They arrive technical, skeptical of LMS monoliths, and evaluate by reading code, docs, and API surface — not by watching demos.

## Product Purpose

Headless LMS is an open-source (MIT), API-first LMS platform in TypeScript. The website (headless-lms.dev) exists to get a developer from landing to a running installation (`npm create headless-lms`) and to serve as the ongoing docs/reference/blog/changelog home. Success right now is OSS adoption: installs, stars, and developers who stay for the docs.

## Positioning

A composable TypeScript LMS backend: a real framework-free domain layer where every adapter (auth, db, email, storage, workflows) is swappable. Anchor claim, confirmed by the user, with two supporting proof points:

- Headless with a typed SDK — schema-first API, Zod-validated routes, SDK generated from the OpenAPI spec; build any frontend.
- AI-operable via MCP — agents connect over OAuth and operate the LMS through the same domain layer as every other client.

Neighbors (Moodle/Open edX monoliths, hosted LMS SaaS) cannot truthfully claim the composable domain-layer architecture.

## Operating Context

The site is landing page + Fumadocs-powered docs, generated API reference, blog, and changelog (Next.js 16, Tailwind 4, shadcn). Ships with the product monorepo: backend (`@headless-lms/core` + `@headless-lms/server`), admin portal, student portal, CLI scaffolder. Self-host anywhere Node and Postgres run. Repo docs at `docs/architecture.md` and `docs/domain/*` are the domain-truth source; domain docs stay in domain vocabulary.

## Capabilities and Constraints

Product capabilities the site may claim (all shipped): course builder, per-activity progress tracking, entitlements, multi-tenancy, admin back-office, student portal, media/file assets via presigned URLs, plugin system, MCP endpoint, typed SDK + OpenAPI, transactional email. Membership is a content type — a peer of courses/podcasts; no billing exists in the product, and entitlement semantics are uniform across content types.

Undecided: no commercial/hosted offering is planned or to be implied.

## Brand Commitments

Name: Headless LMS. Domain: headless-lms.dev. License: MIT (public commitment).
Voice: plain capability statements; no punchy marketing taglines, no competitor sneering.

## Evidence on Hand

Real: the open codebase, the working `npm create headless-lms` scaffolder, generated API reference, live docs, README header asset at `docs/assets/headless-lms-header.png`.
Absent (must not be fabricated): users, customer logos, testimonials, case studies, deployment counts, benchmarks, press.

## Product Principles

1. The code is the pitch — show real API, SDK, and architecture; never a mockup of them.
2. Claims stay truthful and shipped; capability statements over slogans.
3. Shortest path to running: landing → scaffold command → docs, with no gate in between.
4. Composability is the anchor; typed SDK and MCP are its proof, not separate stories.
5. Docs are a first-class product surface, not marketing collateral.
