// postcss-import inlines @import directives BEFORE Tailwind processes the
// file, so third-party CSS like @pipecat-ai/voice-ui-kit can use `@layer
// base` and share Tailwind's base layer instead of being orphaned in its
// own chunk (which crashes the build).
module.exports = {
  plugins: { "postcss-import": {}, tailwindcss: {}, autoprefixer: {} },
};
