import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 60000,
    // Node builtins under the `node:` namespace must be left to Node's
    // native loader; Vite would otherwise try to resolve them as bare
    // packages and fail (e.g. `node:sqlite` -> "sqlite" not found).
    server: {
      deps: {
        external: [/^node:/],
      },
    },
  },
});
