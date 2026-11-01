import { performance } from "node:perf_hooks";
import {
  resolveVariables,
  pair,
  safeExport,
  emptyWorkspace,
  newRequest,
} from "../packages/shared/src";
function measure(name: string, iterations: number, operation: () => void) {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) operation();
  console.log(
    `${name}: ${iterations} operations in ${(performance.now() - start).toFixed(2)} ms (this machine only)`,
  );
}
const scopes = [
  [
    pair("HOST", "http://localhost"),
    pair("URL", "{{HOST}}/v1"),
    pair("ID", "123"),
  ],
];
measure("Nested variable resolution", 10000, () => {
  resolveVariables("{{URL}}/users/{{ID}}", scopes);
});
const workspace = emptyWorkspace();
workspace.requests = Array.from({ length: 1000 }, () => newRequest());
measure("Sanitized export of 1,000 requests", 100, () => {
  safeExport(workspace);
});
