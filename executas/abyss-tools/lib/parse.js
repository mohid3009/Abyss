// Obsidian-compatible link/tag parsing (ADR-0007). Pure functions — shared by
// the UI, import/export and (later) the abyss-tools Executa.

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const LINK = /(!?)\[\[([^[\]\n]+?)\]\]/g;
const INLINE_TAG = /(?:^|\s)#([\p{L}\p{N}_\-/]+)/gu;

const stripCode = (s) => s.replace(/(```|~~~)[\s\S]*?(\1|$)/g, " ").replace(/`[^`\n]*`/g, " ");
const dedupe = (xs) => {
  const seen = new Set();
  return xs.filter((x) => { const k = x.toLowerCase(); return !seen.has(k) && seen.add(k); });
};

export function splitFrontmatter(body) {
  const m = body.match(FRONTMATTER);
  return m ? { yaml: m[1], rest: body.slice(m[0].length) } : { yaml: "", rest: body };
}

// Only the `tags:` / `tag:` key is read; the rest of the frontmatter is kept verbatim.
function frontmatterTags(yaml) {
  const lines = yaml.split(/\r?\n/);
  const i = lines.findIndex((l) => /^tags?:/i.test(l));
  if (i < 0) return [];
  let raw = lines[i].replace(/^tags?:/i, "").trim();
  if (!raw) {
    const items = [];
    for (const l of lines.slice(i + 1)) {
      const m = l.match(/^\s*-\s*(.+)$/);
      if (!m) break;
      items.push(m[1]);
    }
    raw = items.join(",");
  }
  return raw.replace(/^\[|\]$/g, "").split(/[,\s]+/)
    .map((t) => t.trim().replace(/^["']|["']$/g, "").replace(/^#/, ""))
    .filter(Boolean);
}

export function parseTags(body) {
  const { yaml, rest } = splitFrontmatter(body);
  const inline = [...stripCode(rest).matchAll(INLINE_TAG)].map((m) => m[1]).filter((t) => /\D/.test(t));
  return dedupe([...frontmatterTags(yaml), ...inline]);
}

export function parseLinks(body) {
  const out = [];
  for (const [, embed, inner] of stripCode(splitFrontmatter(body).rest).matchAll(LINK)) {
    if (embed) continue;                                  // ![[attachment]]
    const target = inner.split("|")[0].split("#")[0].trim();
    if (target) out.push(target);                         // [[#heading]] = self link, skip
  }
  return dedupe(out);
}

export const deriveMeta = ({ body }) => ({ links: parseLinks(body), tags: parseTags(body) });

// Characters that break [[links]] (path separator, alias, heading, brackets, block ref) become "-".
export const cleanTitle = (t) => String(t).replace(/\s+/g, " ").trim().replace(/[\\/|#[\]^]/g, "-");

// Rewrites [[old]], [[old|alias]], [[old#h]] and [[folder/old]] to the new title.
export function renameLinks(body, oldTitle, newTitle) {
  const old = oldTitle.toLowerCase();
  return body.replace(/\[\[([^[\]\n|#]+?)((?:#[^[\]\n|]*)?(?:\|[^[\]\n]*)?)\]\]/g, (m, target, rest) => {
    const t = target.trim();
    const slash = t.lastIndexOf("/");
    if (t.toLowerCase() === old) return `[[${newTitle}${rest}]]`;
    if (slash >= 0 && t.slice(slash + 1).toLowerCase() === old) return `[[${t.slice(0, slash + 1)}${newTitle}${rest}]]`;
    return m;
  });
}

// Link target -> index entry. "folder/Title" matches the path exactly; a bare
// title matches case-insensitively, shortest path first (Obsidian's rule).
export function makeResolver(entries) {
  const byTitle = new Map();
  for (const e of entries) {
    const k = e.title.toLowerCase();
    const list = byTitle.get(k) ?? [];
    list.push(e);
    byTitle.set(k, list);
  }
  for (const list of byTitle.values()) list.sort((a, b) => (a.path ?? "").length - (b.path ?? "").length);
  return (target) => {
    const t = target.trim().toLowerCase();
    const slash = t.lastIndexOf("/");
    if (slash >= 0) {
      const [path, title] = [t.slice(0, slash), t.slice(slash + 1)];
      const hit = byTitle.get(title)?.find((e) => (e.path ?? "").toLowerCase() === path);
      if (hit) return hit;
      return byTitle.get(title)?.[0] ?? null;
    }
    return byTitle.get(t)?.[0] ?? null;
  };
}

export const resolveLink = (target, entries) => makeResolver(entries)(target);
