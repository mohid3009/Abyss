#!/usr/bin/env node
/**
 * abyss-tools: lets Anna's assistant search, read, create and append Abyss notes.
 * Stdio JSON-RPC Executa (one envelope per line). All note logic and every access rule
 * (chat access, sharing, private notes) live in ./lib/chattools.js; this file only
 * speaks the protocol and bridges storage to the host with reverse RPC.
 */
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { createChatTools, AccessError } from "./lib/chattools.js";

const MANIFEST = {
  display_name: "Abyss notes",
  version: "0.1.0",
  description: "Search, read, create and append the user's Abyss notes. Private notes are never returned or changed.",
  host_capabilities: [],
  tools: [
    { name: "search_notes", description: "Search the user's Abyss notes by words in the title, tags or text. Returns titles, tags and short snippets.",
      parameters: [
        { name: "query", type: "string", description: "Words to look for.", required: true },
        { name: "limit", type: "number", description: "Maximum results (default 5, at most 20).", required: false },
      ] },
    { name: "read_note", description: "Read one Abyss note by its title.",
      parameters: [{ name: "title", type: "string", description: "Exact note title (case does not matter).", required: true }] },
    { name: "create_note", description: "Create a new Abyss note. Use [[Title]] in the body to link other notes.",
      parameters: [
        { name: "title", type: "string", description: "Title of the new note.", required: true },
        { name: "body", type: "string", description: "Markdown body.", required: false },
        { name: "tags", type: "array", description: "Short tags, without #.", required: false },
      ] },
    { name: "append_note", description: "Append text to an existing Abyss note.",
      parameters: [
        { name: "title", type: "string", description: "Title of the note to add to.", required: true },
        { name: "text", type: "string", description: "Text to append.", required: true },
      ] },
  ],
};

const pending = new Map();   // reverse-RPC id -> {resolve, reject}
const write = (env) => process.stdout.write(`${JSON.stringify(env)}\n`);

function hostCall(method, params) {
  return new Promise((resolve, reject) => {
    const id = randomUUID();
    pending.set(id, { resolve, reject });
    write({ jsonrpc: "2.0", id, method, params });
  });
}

// The notes live in the app's own storage (scope "app"), the same keys the UI uses.
const kv = {
  get: (a) => hostCall("storage/get", { ...a, scope: "app" }),
  set: (a) => hostCall("storage/set", { ...a, scope: "app" }),
  delete: (a) => hostCall("storage/delete", { ...a, scope: "app" }),
  list: (a) => hostCall("storage/list", { ...a, scope: "app" }),
};

async function invoke(tool, args, ctx) {
  const tools = createChatTools(kv, { caller: ctx?.caller });
  if (!Object.hasOwn(tools, tool)) return { success: false, error: `unknown tool: ${tool}` };
  try {
    return { success: true, data: await tools[tool](args ?? {}) };
  } catch (e) {
    return { success: false, error: e.message, ...(e instanceof AccessError && { access_denied: true }) };
  }
}

async function dispatch(env) {
  const { method, id, params = {} } = env;
  try {
    let result;
    if (method === "initialize") {
      result = { protocolVersion: "2.0", server_info: { name: MANIFEST.display_name, version: MANIFEST.version }, capabilities: { storage: {} } };
    } else if (method === "describe") result = MANIFEST;
    else if (method === "health") result = { status: "ready" };
    else if (method === "invoke") result = await invoke(params.tool, params.arguments, params.context);
    else throw Object.assign(new Error(`unknown rpc: ${method}`), { code: -32601 });
    write({ jsonrpc: "2.0", id, result });
  } catch (e) {
    write({ jsonrpc: "2.0", id, error: { code: e.code ?? -32000, message: e.message } });
  }
}

function handleLine(line) {
  const env = JSON.parse(line);
  if (env.method == null && pending.has(env.id)) {   // response to one of our storage calls
    const { resolve, reject } = pending.get(env.id);
    pending.delete(env.id);
    if (env.error) reject(Object.assign(new Error(env.error.message), { code: env.error.code }));
    else resolve(env.result);
  } else if (env.method) void dispatch(env);
}

createInterface({ input: process.stdin }).on("line", (raw) => {
  const line = raw.trim();
  if (!line) return;
  try { handleLine(line); } catch (e) { process.stderr.write(`bad json: ${e.message}\n`); }
});
