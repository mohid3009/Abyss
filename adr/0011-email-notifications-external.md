# ADR-0011: Email notifications via external Cloudflare Worker + Resend

**Date**: 2026-11-24
**Status**: accepted
**Deciders**: Project owner, Claude (AI assistant)

## Context

Milestone 4: scheduled reminders delivered **by email**, firing on time even when Abyss and Anna are closed. Anna documents no cron, scheduler or webhooks, and Executas only run when invoked — nothing inside Anna can fire at 9:00 on Friday. Requirements: opt-in, confirmed address, one-click unsubscribe, email contains only title + short preview + link.

## Decision

A small external **notification service**:
- **Cloudflare Worker** (HTTP API) + **D1** (SQLite) table `schedules(id, user_hash, email, send_at_utc, tz, rrule, title, preview, deep_link, unsub_token, status)` + **Cron Trigger** every minute. `tz` is the user's IANA zone (e.g. `Europe/Berlin`); after each send the next `send_at_utc` is computed from the rrule **in `tz`**, so "Friday 9 am" stays 9 am across DST changes.
- Email sent via **Resend**, from a domain with SPF/DKIM/DMARC.
- Abyss UI calls the Worker (origin declared in the UI manifest CSP) to create/update/delete schedules, authenticated by a per-user secret generated on opt-in and stored in APS `settings`.
- **Double opt-in**: the Worker emails a confirmation link before any reminder is sent.
- Only `title`, a ≤ 140-char `preview` and a link leave Anna — never the note body. Due reminders are mirrored in APS `sched/*` and shown in-app on next open.

## Alternatives Considered

### Alternative 1: Send from the user's Gmail via Anna Google OAuth
- **Pros**: no email provider; lands in inbox
- **Cons**: still needs something running at send time — nothing in Anna does
- **Why not**: doesn't solve scheduling

### Alternative 2: Supabase (pg_cron + Edge Function)
- **Pros**: Postgres; familiar
- **Cons**: free projects pause when idle — missed reminders
- **Why not**: the clock must be reliable

### Alternative 3: GitHub Actions cron
- **Pros**: free
- **Cons**: runs can be delayed by many minutes; not meant for user data
- **Why not**: unreliable timing

### Alternative 4: In-app reminders only
- **Pros**: no external service
- **Cons**: only seen when Abyss is open
- **Why not**: user chose email; kept as the fallback

## Consequences

### Positive
- Reminders fire on time with Anna closed; free tiers cover early usage
- Minimal data outside Anna

### Negative
- First piece of infrastructure we run and pay for; needs a privacy-policy section
- `ponytail:` Resend free tier ≈ 100 emails/day — upgrade past ~50 active reminder users

### Risks
- Emails land in spam → authenticated domain, plain content, low volume
- Platform unknowns (Worker origin in CSP, email → desktop deep link into a note, Mermaid inline styles for ADR-0009) → one **throwaway-app spike right after v1 submission**, before milestones 3 and 4 are planned — not deferred to milestone 4
- Deep link into a specific note may not work from email → link opens Abyss; the note opens from the in-app reminder list. If the spike fails, update the Friday scene in the use-case story
