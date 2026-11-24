// CodeMirror 6 markdown editor with [[ autocomplete and Ctrl/Cmd+click links (ADR-0005).
import { minimalSetup } from "codemirror";
import { EditorView, keymap, Decoration, MatchDecorator, ViewPlugin, placeholder } from "@codemirror/view";
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

const WIKILINK = /\[\[([^[\]\n]+?)\]\]/g;

const linkMarks = ViewPlugin.fromClass(class {
  constructor(view) {
    this.deco = new MatchDecorator({ regexp: WIKILINK, decoration: Decoration.mark({ class: "cm-wikilink" }) });
    this.decorations = this.deco.createDeco(view);
  }
  update(u) { this.decorations = this.deco.updateDeco(u, this.decorations); }
}, { decorations: (p) => p.decorations });

// YAML frontmatter at the top of a note renders muted at body size; without this
// the markdown parser reads "tags: …\n---" as a heading.
const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---(?=\r?\n|$)/;
const frontmatterMark = Decoration.mark({ class: "cm-frontmatter" });
const frontmatter = ViewPlugin.fromClass(class {
  constructor(view) { this.decorations = this.build(view); }
  update(u) { if (u.docChanged) this.decorations = this.build(u.view); }
  build(view) {
    const m = view.state.doc.sliceString(0, 4000).match(FRONTMATTER);
    return m ? Decoration.set([frontmatterMark.range(0, m[0].length)]) : Decoration.none;
  }
}, { decorations: (p) => p.decorations });

// Markdown styling on the design tokens: no underlines, no italics (B1),
// headings snap to the type scale.
const markdownStyle = HighlightStyle.define([
  { tag: tags.heading1, fontSize: "1.5rem", lineHeight: "2rem", fontWeight: "600" },
  { tag: tags.heading2, fontSize: "1.25rem", lineHeight: "1.75rem", fontWeight: "600" },
  { tag: [tags.heading3, tags.heading4, tags.heading5, tags.heading6], fontSize: "1.125rem", lineHeight: "1.75rem", fontWeight: "600" },
  { tag: tags.strong, fontWeight: "600" },
  { tag: tags.emphasis, color: "var(--link)" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: [tags.link, tags.url], color: "var(--link)" },
  { tag: tags.monospace, fontFamily: "ui-monospace, monospace", fontSize: "0.875rem", color: "var(--fg)" },
  { tag: [tags.processingInstruction, tags.meta, tags.contentSeparator], color: "var(--muted)" },
  { tag: tags.quote, color: "var(--muted)" },
  { tag: tags.list, color: "var(--muted)" },
]);

const theme = EditorView.theme({
  "&": { height: "100%", backgroundColor: "var(--bg)", color: "var(--fg)" },
  ".cm-content": { fontFamily: "var(--font-body)", fontSize: "1rem", lineHeight: "1.5rem", padding: "0", caretColor: "var(--fg)", minHeight: "320px" },
  ".cm-placeholder": { color: "var(--muted)" },
  ".cm-line": { padding: "0" },
  ".cm-scroller": { overflow: "auto" },
  "&.cm-focused": { outline: "none" },
  ".cm-wikilink": { color: "var(--link)", cursor: "pointer" },
  ".cm-frontmatter, .cm-frontmatter *": { fontSize: "0.875rem !important", lineHeight: "1.25rem !important", fontWeight: "400 !important", color: "var(--muted) !important" },
  ".cm-tooltip": { backgroundColor: "var(--bg)", border: "1px solid var(--line)", color: "var(--fg)", fontSize: "0.875rem", lineHeight: "1.25rem" },
  ".cm-tooltip-autocomplete ul li": { padding: "4px 8px" },
  ".cm-tooltip-autocomplete ul li[aria-selected]": { backgroundColor: "var(--accent)", color: "var(--accent-fg)" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": { backgroundColor: "var(--accent-soft)" },
});

// Target of the [[link]] under `pos`, or null.
function linkAt(state, pos) {
  const line = state.doc.lineAt(pos);
  for (const m of line.text.matchAll(WIKILINK)) {
    const from = line.from + m.index, to = from + m[0].length;
    if (pos >= from && pos <= to) return m[1].split("|")[0].split("#")[0].trim();
  }
  return null;
}

export function createEditor(parent, { onChange, titles, onOpenLink }) {
  const linkCompletion = (ctx) => {
    const m = ctx.matchBefore(/\[\[[^[\]\n]*/);
    if (!m) return null;
    return {
      from: m.from + 2,
      validFor: /^[^[\]\n]*$/,
      options: titles().map((t) => ({
        label: t,
        apply: (view, _c, from, to) => {
          const closed = view.state.sliceDoc(to, to + 2) === "]]";   // closeBrackets may have added ]]
          const insert = closed ? t : t + "]]";
          view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + insert.length + (closed ? 2 : 0) } });
        },
      })),
    };
  };

  let silent = false;
  const view = new EditorView({
    parent,
    extensions: [
      minimalSetup,
      markdown(),
      syntaxHighlighting(markdownStyle),
      markdownLanguage.data.of({ autocomplete: linkCompletion }),
      autocompletion(),
      closeBrackets(),
      keymap.of([...closeBracketsKeymap, ...completionKeymap]),
      EditorView.lineWrapping,
      linkMarks,
      placeholder("Start writing. Type [[ to link another note."),
      frontmatter,
      theme,
      EditorView.contentAttributes.of({ "aria-label": "Note body" }),
      EditorView.updateListener.of((u) => { if (u.docChanged && !silent) onChange(u.state.doc.toString()); }),
      EditorView.domEventHandlers({
        mousedown(e, v) {
          if (!(e.ctrlKey || e.metaKey)) return false;
          const pos = v.posAtCoords({ x: e.clientX, y: e.clientY });
          const target = pos == null ? null : linkAt(v.state, pos);
          if (!target) return false;
          e.preventDefault();
          onOpenLink(target);
          return true;
        },
      }),
    ],
  });

  return {
    view,
    // Replace the document without firing onChange (opening a note isn't an edit).
    setDoc(text) {
      silent = true;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
      silent = false;
    },
    focus: () => view.focus(),
    // caret at the end of the note (clicks on the empty page below the text)
    focusEnd() {
      view.dispatch({ selection: { anchor: view.state.doc.length } });
      view.focus();
    },
  };
}
