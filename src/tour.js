// First run tutorial: a spotlight tour. Each step may point at an element; steps without
// a target are centred. Esc skips, arrow keys move, focus stays inside the card.
const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids);
  return n;
};

export const STEPS = [
  { title: "Welcome to Abyss", body: "Abyss links your notes, answers questions using only what you wrote, and draws everything as a graph. This quick tour takes under a minute." },
  { target: "#import", title: "Bring your notes", body: "Import an Obsidian vault as a .zip, or a public GitHub repository of markdown files. Links, tags and folders stay intact, and you can export everything back at any time." },
  { target: "#show-capture", title: "Capture as you go", body: "Paste or type anything messy. Abyss turns it into a clean, titled, tagged note and links it to related notes." },
  { target: "#show-ask", title: "Ask your notes", body: "Ask a question and get an answer built only from your notes, with the notes it used listed underneath." },
  { target: "#show-graph", title: "See how it connects", body: "Every link becomes a line. Drag one node onto another to link them, or drag a note from the list into the text to insert a link." },
  { target: "#sidebar-toggle", title: "Write and link", body: "Type [[ in any note to link another one. Press Ctrl+B to collapse the sidebar. You can replay this tour from Tutorial at the bottom of the sidebar." },
];

export function createTour({ steps = STEPS, onDone = () => {} } = {}) {
  let i = 0, root = null, prevFocus = null, lit = null;

  const finish = (completed) => {
    window.removeEventListener("resize", place);
    document.removeEventListener("keydown", onKey, true);
    lit?.classList.remove("tour-target");
    root?.remove();
    root = lit = null;
    prevFocus?.focus?.();
    onDone(completed);
  };

  function place() {
    if (!root) return;
    const step = steps[i];
    const target = step.target ? document.querySelector(step.target) : null;
    lit?.classList.remove("tour-target");
    lit = target;
    const card = root.querySelector(".tour-card"), spot = root.querySelector(".tour-spot");
    if (target) {
      target.classList.add("tour-target");
      const r = target.getBoundingClientRect(), pad = 6;
      Object.assign(spot.style, { display: "block", left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
      const w = card.offsetWidth, h = card.offsetHeight;
      const left = Math.min(Math.max(12, r.right + 20), window.innerWidth - w - 12);
      const top = Math.min(Math.max(12, r.top + r.height / 2 - h / 2), window.innerHeight - h - 12);
      Object.assign(card.style, { left: `${left}px`, top: `${top}px`, transform: "none" });
    } else {
      spot.style.display = "none";
      Object.assign(card.style, { left: "50%", top: "50%", transform: "translate(-50%, -50%)" });
    }
  }

  function render() {
    const step = steps[i], last = i === steps.length - 1;
    const card = root.querySelector(".tour-card");
    card.replaceChildren(
      el("p", { className: "caption-3 tour-count", textContent: `Step ${i + 1} of ${steps.length}` }),
      el("h2", { id: "tour-title", className: "title-1", textContent: step.title }),
      el("p", { className: "body-6 tour-body", textContent: step.body }),
      el("div", { className: "tour-actions" },
        el("button", { type: "button", className: "btn btn-quiet button-sm", textContent: "Skip tour", onclick: () => finish(false) }),
        el("span", { className: "tour-spacer" }),
        ...(i > 0 ? [el("button", { type: "button", className: "btn button-sm", textContent: "Back", onclick: () => go(i - 1) })] : []),
        el("button", { type: "button", className: "btn btn-primary button-sm", id: "tour-next", textContent: last ? "Start writing" : "Next", onclick: () => (last ? finish(true) : go(i + 1)) }),
      ),
    );
    card.classList.remove("tour-in"); void card.offsetWidth; card.classList.add("tour-in");   // replay the entry animation
    place();
    card.querySelector("#tour-next").focus({ preventScroll: true });
  }

  const go = (n) => { i = n; render(); };

  function onKey(e) {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish(false); }
    else if (e.key === "ArrowRight" && i < steps.length - 1) go(i + 1);
    else if (e.key === "ArrowLeft" && i > 0) go(i - 1);
    else if (e.key === "Tab") {   // keep focus inside the card
      const f = [...root.querySelectorAll("button")];
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  return {
    start() {
      if (root) return;
      prevFocus = document.activeElement;
      i = 0;
      root = el("div", { id: "tour", role: "dialog", ariaModal: "true", ariaLabelledby: "tour-title" },
        el("div", { className: "tour-spot" }), el("div", { className: "tour-card card" }));
      document.body.append(root);
      window.addEventListener("resize", place);
      document.addEventListener("keydown", onKey, true);
      render();
    },
  };
}
