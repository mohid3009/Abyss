// Demo mode: open the app outside Anna with ?demo and it loads a small sample vault into
// memory (nothing is saved). Used for the README screenshots and for trying Abyss quickly.
//   ?demo&theme=dark|light&view=welcome|note|graph|ask|capture&note=Title
import { newNote } from "./lib/store.js";
import { saveNote } from "./lib/vault.js";

const NOTES = [
  ["Pricing v2", "", "---\ntags: [pricing]\n---\n# Pricing v2\nDecision: annual plan at 10x monthly (2 months free). Monthly stays $29.\nRaised by [[Call with Arjun, March]] and confirmed in [[Board notes Q2]].\nSee also [[Usage based add on]].\n"],
  ["Board notes Q2", "", "# Board notes Q2\n- Approved annual pricing from [[Pricing v2]].\n- Churn target under 3%. #metrics\n- Hire the first support person in Q3. See [[2026 11 metrics]].\n"],
  ["Arjun", "customers", "#customer\nArjun runs ops at Northwind. Renewal due January. See [[Call with Arjun, March]] and [[Integrations roadmap]].\n"],
  ["Call with Arjun, March", "customers", "#customer #call\n[[Arjun]] asked for an annual option and a Slack integration. Would pay upfront for a discount.\n\nRelated: [[Pricing v2]] · [[Integrations roadmap]]\n"],
  ["Integrations roadmap", "product", "#product\n1. Slack (Q1)\n2. Zapier (Q2)\n3. HubSpot (later)\nRequested by [[Arjun]].\n"],
  ["Onboarding flow", "product", "#product\nSignup, verify email, create workspace, invite team, first project, activated.\nDrop off is highest at invite team. Compare with [[2026 11 metrics]].\n"],
  ["2026 10 metrics", "metrics", "#metrics\nMRR: $18,400\nChurn: 2.8%\nNew customers: 23\n"],
  ["2026 11 metrics", "metrics", "#metrics\nMRR: $19,900\nChurn: 2.5%\nNew customers: 27\nUp from [[2026 10 metrics]].\n"],
  ["Usage based add on", "ideas", "#idea\nCharge per extra seat over 10? Compare with [[Pricing v2]]. Also see [[Competitor pricing]].\n"],
];

export const isDemo = () => new URLSearchParams(location.search).has("demo");

export async function seedDemo(store, settings) {
  const p = new URLSearchParams(location.search);
  settings.tutorial = "done";
  if (p.get("theme")) settings.theme = p.get("theme");
  for (const [title, path, body] of NOTES) await saveNote(store, newNote({ title, path, body }));
  return { view: p.get("view") ?? "welcome", note: p.get("note") ?? "Pricing v2" };
}
