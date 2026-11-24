// Builds src/ into bundle/ (the Anna App static SPA, ADR-0005).
// The Anna SDK is served by the host at /static/anna-apps/_sdk/… — never bundle it.
export default {
  root: "src",
  base: "./",
  build: {
    outDir: "../bundle",
    emptyOutDir: true,
    rollupOptions: { external: [/^\/static\/anna-apps\//] },
  },
};
