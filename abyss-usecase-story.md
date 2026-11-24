# Abyss — Use-Case Stories

Companion to [abyss.prd.md](abyss.prd.md). One main story that touches every capability, three short ones for other users, and a demo script cut from the main story.

---

## Main story — Rhea, solo founder

**Who:** Rhea is building a small SaaS product alone. Two years of notes live in Obsidian — about 400 of them: customer calls, pricing ideas, feature specs, monthly numbers, half-finished thoughts. They use Anna daily for drafting emails and research.

**The pain:** Rhea knows the answers are *somewhere* in those notes but never finds them in time. Every Anna chat starts from zero — they paste the same product context again and again. When an investor asks for an update, they spend an evening turning notes into slides by hand.

### Monday morning — moving in
Rhea installs Abyss from the Anna App Store and drops in a zip of their Obsidian vault. Two minutes later all 400 notes are there with links, tags and folders intact. The **graph** fills the screen: a dense cluster around "Pricing", another around customers, a few lonely orphan notes at the edge. They switch to the dark theme and colour customer notes green, product notes blue.

They type into **Ask**: *"What did I decide about annual pricing?"*
Abyss answers in three sentences and cites `[[Pricing v2]]`, `[[Call — Arjun, March]]` and `[[Board notes Q2]]` — notes written seven months apart that Rhea had never connected. Clicking a citation opens the note; the **local graph** beside it shows its neighbours.

> *Qualified run: Ask.*

### Monday noon — after a customer call
Rhea hangs up with Arjun, a customer, and dictates a rambling 90-second voice memo into **Capture**. Abyss turns it into a clean note — *"Call — Arjun, Nov: integrations + renewal"* — tagged `#customer`, with links added to `[[Arjun]]`, `[[Integrations roadmap]]` and `[[Pricing v2]]`. The new node appears in the graph already wired in.

They type: *"Remind me Friday 9 am to send Arjun the integration timeline."* Abyss schedules a **notification** attached to the note.

> *Qualified run: Capture.*

### Wednesday — writing in Anna chat
Rhea is drafting a reply to Arjun in a normal Anna chat. Instead of pasting context, they write:
*"#abyss what did Arjun ask for last time, and what did we promise?"*
Anna searches their vault, answers with citations, and drafts the email using it. Rhea adds: *"Save this reply to Arjun's note."* Anna **appends** it to the note in Abyss.

Anna remembered — because the memory lives in Abyss.

### Thursday — investor update
Rhea selects the onboarding notes and asks Abyss for a **process flowchart** of the signup-to-activation journey; they swap two steps in the flow's source panel and the preview redraws. Then they select the twelve monthly-metrics notes and generate an **infographic**: MRR trend, churn, top three customer requests. They change the colours to match their brand and export both as images straight into the update.

An evening job becomes twenty minutes.

> *Qualified runs: Visualize ×2.*

Rhea had turned on **"Let other apps use my notes"** in settings, so they open Anna's PPT app and ask it to build the investor deck from the `#metrics` notes. Their `[[Personal finances]]` note is marked **private**, so no other app or chat can ever see it.

### Friday 9:00 am
An **email** arrives: *"Reminder: send Arjun the integration timeline"* with a short preview and a link. Rhea clicks it, Abyss opens on the note, the timeline is right there. Sent by 9:05.

### Next month
Rhea doesn't think of Abyss as "an app" any more. Every call becomes a capture, every question goes to Ask or `#abyss` in chat. They still open Obsidian sometimes — and export from Abyss whenever they want, nothing locked in.

> *Counts as a returning monthly user.*

### What changed for Rhea
| Before | After |
|---|---|
| Answers buried in 400 notes | Cited answers in seconds |
| Re-pasting context into every Anna chat | `#abyss` — Anna knows |
| Messy call notes, never linked | Voice → clean, linked note |
| Evening spent making update visuals | Flowchart + infographic in minutes |
| Forgotten follow-ups | Email reminder tied to the note |

---

## Short stories

### Karan — CS student, exam season
Karan's lecture notes are scattered across a semester. Before the Operating Systems exam they open the **graph**, filter by `#os`, and see that "Deadlocks" has no links to "Scheduling" — a gap in their understanding. They ask *"Explain how deadlock avoidance relates to scheduling, from my notes"*, get an answer citing their own lecture notes, then turn the "Process states" note into a **mind map** to revise from. A **weekly email reminder** nudges them to review the week's notes every Sunday.

### Meera — freelance designer
Meera keeps one note per client. Before every client call they ask Abyss *"What's pending for Studio Nine and what did they reject last time?"*. After the call, a quick **Capture** logs feedback and links it to the client and project notes. At month end they turn the project notes into a **timeline** to show the client what was delivered. They pick a light theme with a serif font because Abyss is where they think, and it should look calm.

### Dev — engineer with an Obsidian habit
Dev has kept a dev log in Obsidian for three years and doesn't want to leave it. They **import** the vault to try Abyss, and the first `#abyss` question in Anna chat — *"How did I fix the Redis timeout last year?"* — returns the exact note with the fix. They keep writing in Obsidian and re-import monthly — notes they edited in Abyss are kept, never overwritten; Abyss is the part of their notes that answers back. *(A live two-way link to the local folder is a later milestone.)*

---

## Demo script — v1 review cut (45 seconds, MVP features only)

Use this for the Nov 25 review submission: every shot is in v1 scope (text Capture, Ask, graph, import/export, light/dark).

| Time | On screen | Voice-over |
|---|---|---|
| 0–5s | Obsidian vault with hundreds of notes | "Two years of notes. I can never find anything." |
| 5–13s | Drop zip into Abyss → graph blooms; switch to dark theme | "Abyss imports your Obsidian vault — links and all." |
| 13–24s | Ask "What did I decide about annual pricing?" → cited answer → click citation, local graph shows neighbours | "Ask anything. It answers from *your* notes, with sources." |
| 24–35s | Paste messy call notes into Capture → clean, titled, tagged note appears wired into the graph | "Paste the mess — it writes, tags and links the note." |
| 35–45s | Export vault as .zip. Logo + "Abyss on Anna" | "Export any time. No lock-in. Abyss." |

## Demo script — full vision, 60 seconds (from Rhea's story)

Covers milestones 2–4 (voice, chat, visualize, email); use after those ship.

| Time | On screen | Voice-over |
|---|---|---|
| 0–6s | Obsidian vault with hundreds of notes | "Two years of notes. I can never find anything." |
| 6–14s | Drop zip into Abyss → graph blooms | "Abyss imports your Obsidian vault — links and all." |
| 14–24s | Ask "What did I decide about annual pricing?" → cited answer | "Ask anything. It answers from *your* notes, with sources." |
| 24–32s | Voice capture → clean linked note appears in graph | "Talk after a call — it writes, tags and links the note." |
| 32–42s | Anna chat: `#abyss what did Arjun ask for?` → cited reply | "And Anna finally remembers — in any chat." |
| 42–52s | Notes → flowchart + infographic, recolour, export | "Turn notes into flows and infographics in one click." |
| 52–60s | Email reminder → opens note. Logo + "Abyss on Anna" | "Reminders that bring you back to the right note. Abyss." |

---

## Capability coverage
| Capability (PRD) | Where it appears |
|---|---|
| 1. Interconnected notes + Obsidian import/export | Rhea Mon, Dev |
| 2. AI reads/writes/references, Anna chat, other apps | Rhea Mon/Wed/Thu, Meera, Dev |
| 3. Graph | Rhea Mon, Karan |
| 4. Flow graphs & infographics | Rhea Thu, Karan, Meera |
| 5. Scheduled email notifications | Rhea Mon/Fri, Karan |
| 6. Styles & customization | Rhea Mon/Thu, Meera |
