import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { memKv } from "../src/lib/memkv.js";
import { SHARED } from "../scripts/sync-executa.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

test("the Executa's copies of the shared note logic match src/lib (run `npm run sync` if this fails)", () => {
  for (const f of SHARED) {
    const a = readFileSync(`${root}src/lib/${f}`, "utf8"), b = readFileSync(`${root}executas/abyss-tools/lib/${f}`, "utf8");
    assert.equal(b, a, `${f} drifted`);
  }
});

// Plays the Anna host: speaks JSON-RPC with the plugin and serves storage/* from memKv.
function startHost() {
  const kv = memKv();
  const child = spawn(process.execPath, [`${root}executas/abyss-tools/plugin.mjs`], { stdio: ["pipe", "pipe", "inherit"] });
  const waiting = new Map();
  const storageCalls = [];
  let n = 0;
  const send = (env) => child.stdin.write(JSON.stringify(env) + "\n");
  createInterface({ input: child.stdout }).on("line", async (line) => {
    const env = JSON.parse(line);
    if (env.method?.startsWith("storage/")) {   // reverse RPC from the plugin
      storageCalls.push({ method: env.method, scope: env.params.scope });
      const { scope, ...args } = env.params;
      try { send({ jsonrpc: "2.0", id: env.id, result: await kv[env.method.slice(8)](args) }); }
      catch (e) { send({ jsonrpc: "2.0", id: env.id, error: { code: e.code ?? -32000, message: e.message } }); }
    } else if (waiting.has(env.id)) { waiting.get(env.id)(env); waiting.delete(env.id); }
  });
  const rpc = (method, params = {}) => new Promise((resolve) => { const id = `h${++n}`; waiting.set(id, resolve); send({ jsonrpc: "2.0", id, method, params }); });
  return { kv, rpc, storageCalls, stop: () => child.kill() };
}

test("handshake, describe and health", async () => {
  const h = startHost();
  try {
    assert.equal((await h.rpc("initialize")).result.protocolVersion, "2.0");
    const d = (await h.rpc("describe")).result;
    assert.deepEqual(d.tools.map((t) => t.name), ["search_notes", "read_note", "create_note", "append_note"]);
    assert.equal((await h.rpc("health")).result.status, "ready");
    assert.equal((await h.rpc("nope")).error.code, -32601);
  } finally { h.stop(); }
});

test("create, search, read and append through the protocol, all in app scope", async () => {
  const h = startHost();
  try {
    const call = async (tool, args, context) => (await h.rpc("invoke", { tool, arguments: args, context })).result;
    const made = await call("create_note", { title: "Call with Dana", body: "Wants the Slack integration before renewal.", tags: ["customer"] });
    assert.deepEqual(made, { success: true, data: { created: true, title: "Call with Dana" } });
    const found = await call("search_notes", { query: "slack renewal" });
    assert.equal(found.data.results[0].title, "Call with Dana");
    assert.equal((await call("append_note", { title: "call with dana", text: "Sent the timeline." })).data.appended, true);
    assert.match((await call("read_note", { title: "Call with Dana" })).data.body, /Slack[\s\S]*Sent the timeline/);
    assert.equal((await call("nothing", {})).success, false);
    assert.ok(h.storageCalls.length > 0 && h.storageCalls.every((c) => c.scope === "app"));
  } finally { h.stop(); }
});

test("access rules hold over the protocol: other apps off by default, chat off blocks everything", async () => {
  const h = startHost();
  try {
    const call = async (tool, args, context) => (await h.rpc("invoke", { tool, arguments: args, context })).result;
    await call("create_note", { title: "Plan", body: "roadmap" });
    const denied = await call("search_notes", { query: "roadmap" }, { caller: "ppt-app" });
    assert.equal(denied.success, false);
    assert.equal(denied.access_denied, true);
    await h.kv.set({ key: "settings", value: { chatAccess: false } });
    assert.equal((await call("read_note", { title: "Plan" })).access_denied, true);
  } finally { h.stop(); }
});

test("called as a command, it answers at once instead of waiting on stdin", async () => {
  const run = (args) => new Promise((resolve) => {
    const c = spawn(process.execPath, [`${root}executas/abyss-tools/plugin.mjs`, ...args], { stdio: ["pipe", "pipe", "inherit"] });
    let out = "";
    c.stdout.on("data", (d) => { out += d; });
    const timer = setTimeout(() => { c.kill(); resolve({ hung: true }); }, 4000);
    c.on("close", (code) => { clearTimeout(timer); resolve({ code, out }); });
  });
  const r = await run(["search_notes", 'query=meeting']);
  assert.equal(r.hung, undefined, "must not hang");
  assert.equal(r.code, 2);
  assert.equal(JSON.parse(r.out).success, false);
  const d = await run(["describe"]);
  assert.equal(d.code, 0);
  assert.equal(JSON.parse(d.out).tools.length, 4);
});
