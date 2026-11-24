// End-to-end check of the v1 review demo (abyss-usecase-story.md, "v1 review cut").
// Builds a self-contained snippet with the fixture vault embedded:
//   npm run e2e            -> writes scripts/out/demo-flow.browser.js
// then run `npm run dev`, open the harness page, and paste the file into the
// devtools console. It resolves to {pass, steps:[{name, ok, detail}]}.
// ponytail: console-driven instead of Playwright (≈150 MB of browsers); switch
// when this needs to run in CI.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const zip = readFileSync(join(here, "../test/fixtures/sample-vault.zip")).toString("base64");

const flow = async (B64) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const f = document.querySelector("iframe");
  const until = async (fn, ms = 40000) => { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await sleep(300); } return false; };
  const steps = [];
  const step = (name, ok, detail = "") => steps.push({ name, ok: !!ok, detail });

  f.contentWindow.location.reload();
  await sleep(3500);
  const W = f.contentWindow, d = f.contentDocument, $ = (id) => d.getElementById(id);
  step("app boots", /\d+ notes/.test($("count").textContent), $("count").textContent);
  const errors = [];
  W.addEventListener("error", (e) => errors.push(e.message));
  W.addEventListener("unhandledrejection", (e) => errors.push(String(e.reason)));

  // 1. import the Obsidian vault by drop
  const bytes = Uint8Array.from(atob(B64), (c) => c.charCodeAt(0));
  const dt = new W.DataTransfer();
  dt.items.add(new W.File([bytes], "Rhea Vault.zip", { type: "application/zip" }));
  d.dispatchEvent(new W.DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
  await until(() => /Import finished|Import failed/.test($("status").textContent));
  step("import vault", /Import finished/.test($("status").textContent), $("status").textContent);

  // 2. graph blooms
  if ($("graph-view").hidden) $("show-graph").click();
  await sleep(1500);
  const nodes = Number(($("graph-count").textContent.match(/^(\d+)/) ?? [])[1] ?? 0);
  step("graph shows the vault", nodes >= 10 && d.querySelector("#graph-canvas canvas"), $("graph-count").textContent);

  // 3. theme switch
  $("theme").value = "dark"; $("theme").dispatchEvent(new W.Event("change"));
  const dark = d.documentElement.dataset.theme === "dark";
  $("theme").value = "light"; $("theme").dispatchEvent(new W.Event("change"));
  const light = d.documentElement.dataset.theme === "light";
  $("theme").value = "anna"; $("theme").dispatchEvent(new W.Event("change"));
  step("light/dark theme", dark && light);

  // 4. Ask with citations, click a citation -> note + local graph
  $("show-ask").click();
  $("ask-input").value = "What did I decide about annual pricing?";
  $("ask-form").requestSubmit();
  await sleep(300);
  await until(() => !$("ask-input").disabled);
  const sources = [...d.querySelectorAll("#ask-result h3")].find((h) => h.textContent === "Sources")?.nextElementSibling;
  const chips = sources ? [...sources.querySelectorAll("button")] : [];
  step("ask answers with citations", d.querySelector("#ask-result .answer") && chips.some((c) => /Pricing v2/.test(c.textContent)),
    chips.map((c) => c.textContent).join(", "));
  if (chips[0]) {
    chips[0].click();
    await sleep(1500);
    step("citation opens the note", $("title").value === chips[0].textContent && d.querySelector("#local-graph canvas"), $("title").value);
  }

  // 5. capture
  $("show-capture").click();
  $("capture-input").value = "call w arjun - wants slack before jan renewal, would pay annual upfront for 2 months free. send integration timeline friday";
  $("capture-form").requestSubmit();
  await until(() => /Captured|Saved your text|Capture failed/.test($("status").textContent));
  step("capture makes a linked note", /Captured/.test($("status").textContent) && $("title").value, `${$("title").value} — ${$("status").textContent}`);

  // 6. export
  let download = null;
  const click = W.HTMLAnchorElement.prototype.click;
  W.HTMLAnchorElement.prototype.click = function () { download = this.download; };
  $("export").click();
  await until(() => /Exported|Export failed/.test($("status").textContent), 15000);
  W.HTMLAnchorElement.prototype.click = click;
  step("export .zip", /^abyss-vault-\d{4}-\d{2}-\d{2}\.zip$/.test(download ?? ""), download);

  step("no uncaught errors", errors.length === 0, errors.join(" | "));
  f.contentWindow.location.reload();
  await sleep(3500);
  const count = f.contentDocument.getElementById("count").textContent;
  step("notes persist after reload", /\d+ notes/.test(count), count);
  return { pass: steps.every((s) => s.ok), steps };
};

mkdirSync(join(here, "out"), { recursive: true });
const outFile = join(here, "out", "demo-flow.browser.js");
writeFileSync(outFile, `(${flow.toString()})(${JSON.stringify(zip)});\n`);
console.log(`wrote ${outFile} — paste it into the anna-app dev harness console`);
