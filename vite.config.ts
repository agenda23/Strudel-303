/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    headers: {
      // Future-proofing in case SharedArrayBuffer is needed
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  build: {
    target: 'esnext',
  },
  test: {
    // Strudel packages ship browser-oriented ESM; let Vite transform them for the compat tests.
    server: { deps: { inline: [/@strudel\/(core|mini|transpiler)/, /@kabelsalat\//] } },
  },
  worker: {
    format: 'es',
  },
});
