// GitHub import: public repositories only (no tokens are ever handled).
// Accepts "owner/repo", "owner/repo@branch", or a github.com URL (optionally /tree/<branch>).
export function parseRepo(input) {
  let s = String(input).trim().replace(/\.git$/, "").replace(/\/+$/, "");
  s = s.replace(/^https?:\/\/(www\.)?github\.com\//i, "");
  let ref = "";
  const tree = s.match(/^([^/\s]+)\/([^/\s]+)\/tree\/(.+)$/);
  if (tree) { s = `${tree[1]}/${tree[2]}`; ref = tree[3]; }
  const at = s.match(/^([^/\s@]+)\/([^/\s@]+)@(.+)$/);
  if (at) { s = `${at[1]}/${at[2]}`; ref = at[3]; }
  const m = s.match(/^([A-Za-z0-9-_.]+)\/([A-Za-z0-9-_.]+)$/);
  if (!m) return null;
  return { owner: m[1], repo: m[2], ref };
}

export const MAX_FILES = 400;

// codeload.github.com (the zip host) only allows one origin, so a browser can't
// download the zip. Instead: one API call lists the tree, then each markdown file
// comes from raw.githubusercontent.com (open CORS, not rate limited). The files are
// packed into a zip in memory so the normal import path handles them.
export async function fetchRepoZip(spec, { fetchFn = fetch, JSZip, onProgress } = {}) {
  const treeRes = await fetchFn(`https://api.github.com/repos/${spec.owner}/${spec.repo}/git/trees/${encodeURIComponent(spec.ref || "HEAD")}?recursive=1`);
  if (treeRes.status === 404) throw new Error("Repository or branch not found. Only public repositories can be imported.");
  if (treeRes.status === 403 || treeRes.status === 429) throw new Error("GitHub is rate limiting requests. Try again in a few minutes.");
  if (!treeRes.ok) throw new Error(`GitHub returned ${treeRes.status}.`);
  const tree = await treeRes.json();
  const files = (tree.tree ?? []).filter((n) => n.type === "blob" && /\.md$/i.test(n.path) && !/(^|\/)\./.test(n.path));
  if (!files.length) throw new Error("No markdown files found in that repository.");
  const picked = files.slice(0, MAX_FILES);
  const ref = encodeURIComponent(spec.ref || "HEAD");   // a branch/tag/HEAD (tree.sha is a tree hash, not a commit)
  const zip = new JSZip();
  let done = 0, next = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (next < picked.length) {
      const f = picked[next++];
      const r = await fetchFn(`https://raw.githubusercontent.com/${spec.owner}/${spec.repo}/${ref}/${f.path.split("/").map(encodeURIComponent).join("/")}`);
      if (r.ok) zip.file(f.path, await r.text());
      onProgress?.(++done, picked.length);
    }
  }));
  if (!Object.keys(zip.files).length) throw new Error("Could not download any notes from that repository.");
  const bytes = await zip.generateAsync({ type: "arraybuffer" });
  return { bytes, truncated: files.length > MAX_FILES, total: files.length };
}
