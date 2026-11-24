// Ask + Capture views (ADR-0008) and the background semantic index (ADR-0004).
import { createSemanticIndex } from "./lib/semantic.js";
import { ask, capture } from "./lib/ai.js";
import { saveNote } from "./lib/vault.js";
import { icon, swapIcon, whileBusy } from "./icons.js";

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids);
  return n;
};

// anna.llm -> the small interface lib/ai.js and lib/semantic.js expect.
const llmOf = (anna) => ({
  async embed(texts) {
    const r = await anna.llm.embed({ input: texts });
    return { model: r.model, vectors: [...r.data].sort((a, b) => a.index - b.index).map((d) => d.embedding) };
  },
  async complete({ system, prompt, maxTokens }) {
    const r = await anna.llm.complete({
      systemPrompt: system, temperature: 0.2, maxTokens,
      messages: [{ role: "user", content: { type: "text", text: prompt } }],
    });
    return r.content?.text ?? "";
  },
});

export function initAi({ anna, kv, store, enqueue, setStatus, openNote, show, afterSave }) {
  const llm = anna ? llmOf(anna) : null;
  const index = llm ? createSemanticIndex(kv, llm) : null;
  let syncTimer = null;

  const noteChip = (n) => el("button", { type: "button", className: "chip caption-1", onclick: () => openNote(n.id) },
    icon("note"), el("span", { textContent: n.title }));
  const busy = (form, on) => form.querySelectorAll("button, input, textarea").forEach((x) => { x.disabled = on; });
  const label = (text) => el("h3", { className: "result-label caption-3", textContent: text });
  // Inline, specific errors under the form (B9); empty string hides it.
  const fieldError = (id, text) => { $(id).textContent = text; $(id).hidden = !text; };
  // Skeleton shaped like the answer card (B9: no spinners).
  const answerSkeleton = () => el("div", { className: "card answer-skeleton", ariaLabel: "Searching your notes" },
    el("span", { className: "skeleton" }), el("span", { className: "skeleton" }), el("span", { className: "skeleton" }),
    el("div", { className: "chips" }, el("span", { className: "skeleton" }), el("span", { className: "skeleton" })));

  function scheduleSync(delay = 4000) {
    if (!index) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => index.sync(store).catch(() => {}), delay);
  }

  // Load vectors after first paint, then embed anything new/changed.
  if (index) {
    setTimeout(async () => {
      try {
        await whileBusy(async () => {
          await index.load();
          await index.sync(store, {
            onProgress: (d, t) => { if (t > 5) setStatus(`Indexing notes for Ask… ${d} / ${t}`); },
          });
        });
        if (index.size() > 5) setStatus("");
      } catch {
        setStatus("Search index unavailable. Ask will match titles and tags for now.");
      }
    }, 0);
  }

  const NEED_ANNA = "Ask and Capture need Anna. Open Abyss inside the Anna app to use them.";

  async function runAsk(question) {
    const out = $("ask-result");
    out.replaceChildren(answerSkeleton());
    swapIcon($("ask-submit"), "spinner", { spin: true });
    busy($("ask-form"), true);
    try {
      await index.sync(store).catch(() => {});   // include just-edited notes
      const r = await ask({ question, store, index, llm });
      const card = el("div", { className: "card answer-card" });
      if (r.fallback) {
        card.append(el("p", { className: "notice body-6", textContent: "Could not get an answer right now. These notes look closest." }));
      } else if (!r.found) {
        card.append(el("p", { className: "title-4", textContent: "Not found in your notes" }),
          el("p", { className: "answer body-3 muted", textContent: r.answer }));
      } else {
        card.append(el("p", { className: "answer body-3", textContent: r.answer }));
        if (r.citations.length) card.append(el("div", {}, label("Sources"), el("div", { className: "chips" }, ...r.citations.map(noteChip))));
        else card.append(el("p", { className: "notice body-6", textContent: "This answer did not cite a note, so check it before relying on it." }));
      }
      if (r.related.length) card.append(el("div", {}, label(r.found ? "Also related" : "Closest notes"), el("div", { className: "chips" }, ...r.related.map(noteChip))));
      out.replaceChildren(card);
    } catch (e) {
      out.replaceChildren();
      fieldError("ask-error", `Ask failed: ${e.message}. Try again in a moment.`);
    } finally {
      busy($("ask-form"), false);
      swapIcon($("ask-submit"), "sparkle");
      $("ask-input").focus();
    }
  }

  async function runCapture(text) {
    busy($("capture-form"), true);
    setStatus("Writing your note…");
    swapIcon($("capture-submit"), "spinner", { spin: true });
    try {
      // only the final write goes through the save queue; the LLM call doesn't block autosaves
      const { note, fallback } = await capture({ text, store, index, llm, save: (n) => enqueue(() => saveNote(store, n)) });
      $("capture-input").value = "";
      afterSave();
      scheduleSync(0);
      await openNote(note.id, { skipFlush: true });
      setStatus(fallback ? "Saved your text unchanged. The AI was unavailable, so nothing was lost."
        : note.links.length ? `Captured and linked to ${note.links.join(", ")}` : "Captured");
    } catch (e) {
      setStatus("");
      fieldError("capture-error", `Capture failed: ${e.message}. Your text is still in the box.`);
    } finally {
      busy($("capture-form"), false);
      swapIcon($("capture-submit"), "capture");
    }
  }

  $("show-ask").addEventListener("click", async () => { await show("ask"); $("ask-input").focus(); });
  $("show-capture").addEventListener("click", async () => { await show("capture"); $("capture-input").focus(); });
  $("ask-input").addEventListener("input", () => fieldError("ask-error", ""));
  $("capture-input").addEventListener("input", () => fieldError("capture-error", ""));
  $("ask-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = $("ask-input").value.trim();
    if (!q) return fieldError("ask-error", "Type a question first.");
    if (!llm) return fieldError("ask-error", NEED_ANNA);
    fieldError("ask-error", "");
    whileBusy(() => runAsk(q));
  });
  $("capture-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const t = $("capture-input").value.trim();
    if (!t) return fieldError("capture-error", "Paste or type something to capture.");
    if (!llm) return fieldError("capture-error", NEED_ANNA);
    fieldError("capture-error", "");
    whileBusy(() => runCapture(t));
  });
  $("capture-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) $("capture-form").requestSubmit();
  });

  return { scheduleSync };
}
