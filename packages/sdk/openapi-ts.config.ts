import { defineConfig } from "@hey-api/openapi-ts";

// Generates a fully-typed, resource-based TS SDK from the OpenAPI spec that the
// api emits from its Zod route schemas. Methods are grouped by resource tag
// (e.g. a `Courses` service) via the byTags strategy.
export default defineConfig({
  input: "./openapi.json",
  output: {
    path: "./src/generated",
    postProcess: ["prettier"],
  },
  plugins: [
    "@hey-api/client-fetch",
    "@hey-api/typescript",
    // `responseStyle: "data"` makes methods resolve to the response body itself
    // rather than a `{ data, error, response }` envelope. Paired with the
    // client's `throwOnError`, failures throw instead of being returned, so
    // call sites never unwrap.
    { name: "@hey-api/sdk", operations: { strategy: "byTags" }, responseStyle: "data" },
  ],
});
