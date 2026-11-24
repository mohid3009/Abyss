// Phosphor icons (regular), bundled as raw SVG. These strings are static assets
// from the package, never user content, so inserting them as markup is safe.
import search from "@phosphor-icons/core/assets/regular/magnifying-glass.svg?raw";
import ask from "@phosphor-icons/core/assets/regular/chat-circle-text.svg?raw";
import capture from "@phosphor-icons/core/assets/regular/lightning.svg?raw";
import graph from "@phosphor-icons/core/assets/regular/graph.svg?raw";
import plus from "@phosphor-icons/core/assets/regular/plus.svg?raw";
import upload from "@phosphor-icons/core/assets/regular/upload-simple.svg?raw";
import download from "@phosphor-icons/core/assets/regular/download-simple.svg?raw";
import trash from "@phosphor-icons/core/assets/regular/trash.svg?raw";
import lock from "@phosphor-icons/core/assets/regular/lock-simple.svg?raw";
import note from "@phosphor-icons/core/assets/regular/file-text.svg?raw";
import arrow from "@phosphor-icons/core/assets/regular/arrow-right.svg?raw";
import sparkle from "@phosphor-icons/core/assets/regular/sparkle.svg?raw";
import spinner from "@phosphor-icons/core/assets/regular/circle-notch.svg?raw";
import github from "@phosphor-icons/core/assets/regular/github-logo.svg?raw";
import sidebar from "@phosphor-icons/core/assets/regular/sidebar-simple.svg?raw";
import question from "@phosphor-icons/core/assets/regular/question.svg?raw";
import warning from "@phosphor-icons/core/assets/regular/warning.svg?raw";

// Abyss mark: three concentric rings in one colour (currentColor), depth by opacity.
// While the app is busy (.logo.busy) two arcs fade in over the rings and
// counter-rotate (opacity + transform only).
const logo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.25">
  <circle cx="16" cy="16" r="13" stroke-opacity=".3"/>
  <circle cx="16" cy="16" r="8" stroke-opacity=".6"/>
  <circle class="arc arc-outer" cx="16" cy="16" r="13" stroke-dasharray="20 62" stroke-linecap="round"/>
  <circle class="arc arc-inner" cx="16" cy="16" r="8" stroke-dasharray="12 38" stroke-linecap="round"/>
  <circle cx="16" cy="16" r="3" fill="currentColor" stroke="none"/></svg>`;

const ICONS = { search, ask, capture, graph, plus, upload, download, trash, lock, note, arrow, sparkle, spinner, warning, logo, github, sidebar, question };
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// i = position in a list, for a staggered rotate-in (60 ms steps, capped).
export function icon(name, { spin = false, i = 0 } = {}) {
  const span = document.createElement("span");
  span.className = spin ? "icon spin" : "icon";
  span.ariaHidden = "true";
  if (i) span.style.setProperty("--i", Math.min(i, 6));
  span.innerHTML = ICONS[name] ?? "";
  return span;
}

// <button data-icon="plus">New note</button> -> icon prepended once.
export function decorate(root = document) {
  for (const el of root.querySelectorAll("[data-icon]:not([data-iconed])")) {
    const i = el.parentElement?.classList.contains("nav-items") ? [...el.parentElement.children].indexOf(el) + 1 : 0;
    el.prepend(icon(el.dataset.icon, { i }));
    // wrap bare label text in a span so it can fade independently (sidebar collapse)
    for (const n of [...el.childNodes]) {
      if (n.nodeType === 3 && n.textContent.trim()) {
        const span = document.createElement("span");
        span.className = "label";
        span.textContent = n.textContent.trim();
        n.replaceWith(span);
      }
    }
    el.dataset.iconed = "";
  }
}

// Replace a host's icon: the old one rotates out, the new one rotates in.
// Quick successive swaps settle on the latest requested icon.
export function swapIcon(host, name, { spin = false } = {}) {
  host.dataset.icon = name;
  host.dataset.spin = spin ? "1" : "";
  const make = () => icon(host.dataset.icon, { spin: !!host.dataset.spin });
  const cur = host.querySelector(":scope > .icon");
  if (!cur || reducedMotion()) {
    cur ? cur.replaceWith(make()) : host.prepend(make());
    return;
  }
  if (cur.classList.contains("icon-out")) return;   // its animationend picks up the latest name
  cur.classList.add("icon-out");
  // animationend never fires while the page isn't being drawn (hidden tab), which
  // would leave the icon invisible, so a timer finishes the swap as a fallback.
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    cur.replaceWith(make());
  };
  const timer = setTimeout(finish, 300);
  cur.addEventListener("animationend", (e) => { if (e.target === cur) finish(); });
}

// App-wide busy indicator on the sidebar logo; nested calls are counted.
let busyCount = 0;
export function setBusy(delta) {
  busyCount = Math.max(0, busyCount + delta);
  document.querySelector(".logo")?.classList.toggle("busy", busyCount > 0);
}
export async function whileBusy(fn) {
  setBusy(1);
  try { return await fn(); } finally { setBusy(-1); }
}
