# Abyss

> Interconnected notes that Anna can read, write and reference — everywhere.

## Problem
Anna desktop users who keep notes (developers, founders, early AI adopters) write things down but rarely find or reuse them: notes sit disconnected, and turning them into something presentable (a flow, a diagram, a summary) is manual work. Meanwhile Anna forgets everything between chats, so users re-explain the same context every time. Left unsolved, notes stay a write-only graveyard and Anna stays a stranger every session.

## Evidence
- Anna has no built-in memory, notes or knowledge tool, and apps can't share data with each other (Anna developer docs, Nov 2026).
- The only memory app in the Anna App Store (Mnemos) has 5 installs; no notes or knowledge-graph app exists in the store (App Store scan, Nov 23 2026).
- That users *want* their notes connected to AI and visualized — **Assumption — needs validation via 5-user prototype test + Anna Builder Discord feedback.**
- That Obsidian users would adopt a second notes tool if import is lossless — **Assumption — needs validation via prototype test with real Obsidian vaults.**

## Users
- **Primary**: Anna desktop users who take notes — devs, founders, freelancers, early AI adopters. Trigger: they want to save an idea, find something they wrote, or explain/present a set of notes.
- **Secondary**: Obsidian / markdown users curious about AI on top of their vault. Trigger: want answers from their notes without setting up plugins and API keys.
- **Not for**: teams needing real-time collaboration; mobile-first note-takers; users who need end-to-end encrypted or offline-only notes.

## Hypothesis
We believe **interconnected notes with AI capture, cited answers, a knowledge graph, visual flows/infographics, and access from Anna's chat and other apps** will **turn neglected notes into memory people actually use** for **Anna desktop users who take notes**.
We'll know we're right when **200+ signed-in users complete a capture, ask or visualize run in one calendar month (Dec 2026 or Jan 2027)** and **40% of them return the following month**.

## Product capabilities (what must be true)

### 1. Interconnected notes
- Markdown notes with `[[links]]`, backlinks, tags.
- **Import from Obsidian** (vault .zip) preserving links, tags and folders; **export** back at any time — no lock-in.
- **Re-import** an updated vault: changed notes update, edits made in Abyss are never overwritten (conflicts kept side by side), nothing is deleted.

### 2. AI that reads, writes and references notes
- **Capture**: paste or speak messy input → clean, titled, tagged note linked to related notes.
- **Ask**: question → answer citing the exact notes used; says so when the answer isn't in the notes.
- **Talk to it**: conversational back-and-forth with the vault, not just one-shot questions.
- **Anna chat access**: from any Anna chat, the assistant can search, read, create and append to notes, and cite them. **On by default**; the user can turn it off in Settings.
- **Reference from other apps**: other Anna apps can open or use a specific note — **only if the user turns this on**. A vault-wide setting (off by default) plus a per-note "private" flag that always keeps a note out of reach of other apps and Anna chat.

### 3. Graph (Obsidian-style)
- Whole-vault graph and per-note local graph with depth control.
- Hover highlight, click to open, node size by connections, unresolved-link nodes, orphan toggle, search/tag filters, colour groups.

### 4. Flow graphs & infographics
- Turn a note or a set of notes into a **flow graph** the user can edit. Order of delivery:
  1. **Mind map** — closest to how notes and links already work; works on any note.
  2. **Process flowchart** — steps and branches from how-to, plans and meeting notes.
  3. **Timeline** — dated events from journals and project notes.
  4. **Decision tree** — options and outcomes from decision notes.
- Turn data in notes (lists, tables, numbers) into an **infographic** (charts, stat cards, comparisons) for easy reading and sharing.
- Outputs saved back as notes / attachments and exportable as images.

### 5. Scheduled notifications
- User schedules a **notification to themselves** at a chosen date/time, optionally repeating (daily, weekly, custom).
- A notification can be attached to a note ("revisit this idea Friday") or standalone; clicking it opens the linked note.
- Can be created from a note, from the notes list, or by asking ("remind me about the pricing note tomorrow at 9").
- Upcoming notifications are listed in one place where they can be edited, snoozed or deleted.
- **Delivered by email** to the user's address, so they arrive even when Abyss and Anna are closed. Also shown in-app when Abyss is next opened.
- Email is opt-in: the user confirms their address before the first send, and every email has a one-click unsubscribe.
- Email contains the note title, a short preview and a link back to the note — never the full note body.
- Must fire on time with Abyss closed — requires an always-on scheduler outside the App window (approach decided in /plan).
- Not in scope: messages sent to other people, Slack/SMS delivery.

### 6. Styles & customization
- Visual themes (light/dark + accent colours, fonts).
- Note styles / templates (e.g. daily note, meeting, idea, project).
- Customizable graph, flow and infographic appearance (colours, layouts, shapes).
- Styles are **visual only** — they don't change how the AI writes.

## Success Metrics
| Metric | Target | How measured |
|---|---|---|
| Qualified monthly users (capture / ask / visualize run) | ≥ 200 in Dec 2026 or Jan 2027 | Anna server-side run records |
| Month-2 return rate | ≥ 40% | Users with a qualified run in month N who also have one in N+1 |
| Activation (first AI run in first session) | TBD — set after first 50 users | In-app event log |
| Obsidian import success (vault opens with links intact) | TBD — set after prototype test | Import completion + link resolution rate |
| Chat-access adoption (users who use Abyss from Anna chat) | TBD — set after launch | Tool call counts |

## Scope
**MVP (v1.0, submitted for review Wed Nov 25)** — the minimum to test the hypothesis:
- Notes with `[[links]]`, backlinks, tags
- Obsidian .zip import + export
- Capture (text) and Ask with citations
- Whole-vault + local graph
- Light/dark theme

**Out of scope for MVP** (planned in milestones below)
- Talk mode, Anna chat access, reference from other apps — milestone 2
- Flow graphs and infographics — milestone 3
- Scheduled email notifications — milestone 4; needs an always-on scheduler and email sending
- Advanced themes, note templates, visual customization — milestone 5
- AI graph layers (semantic edges, topic clusters, gap finder) — milestone 6

**Out of scope entirely**
- Multi-device sync, real-time collaboration — not needed to test the hypothesis
- Native mobile app — Anna's audience is desktop
- Third-party plugin system, canvas — high cost, low signal
- End-to-end encryption — platform storage model doesn't support it today

## Delivery Milestones
| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | Core vault (MVP) | Users import or write linked notes, capture and ask with citations, explore the graph | pending | — |
| 2 | Abyss everywhere | Users talk to their vault, and use/write notes from Anna chat and other apps | pending | — |
| 3 | Visualize | Users turn notes into editable flow graphs and infographics | pending | — |
| 4 | Scheduled notifications | Users get email reminders at times they choose, linked to their notes | pending | — |
| 5 | Make it yours | Users pick themes, note templates and customize visuals | pending | — |
| 6 | Smarter graph | Graph suggests missing links, names topic clusters, highlights answer paths | pending | — |

## Open Questions
- [x] Notification delivery — email, plus in-app when opened.
- [x] Other apps referencing notes — user-controlled option, off by default.
- [x] Flow-graph order — mind map → process → timeline → decision tree.
- [x] Name — "Abyss" confirmed available.
- [ ] How much of "reference from other apps" the platform allows beyond Anna chat (affects how far capability 2 goes, not whether the option exists).

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Scope too broad for one builder; MVP slips past review date | High | High | Strict MVP; milestones 2–6 ship as updates |
| Review rejects as "just a notes app" | Medium | High | Lead with AI capture/ask/visualize in listing and first-run |
| Users won't switch from Obsidian | High | Medium | Lossless import/export; position as AI layer on top of existing notes |
| Email reminders land in spam or feel spammy | Medium | Medium | Opt-in + address confirmation, unsubscribe link, sender domain authenticated, title + preview only |
| Email scheduler adds an external service to run and pay for | High | Medium | Keep it to one small scheduled job + email provider free tier; milestone 4 only |
| Platform limits what other apps can access | Medium | Low | Anna chat access works regardless; expand when the platform allows |
| AI cites wrong notes or invents content | Medium | High | Answers only from provided notes; visible citations |
| Users don't install Anna desktop just for Abyss | High | High | Target existing Anna users first; Obsidian community second |

---
*Status: DRAFT — requirements only. Implementation planning pending via /plan.*
