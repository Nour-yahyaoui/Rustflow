import type { HttpResponse } from "@requestlab/shared";
export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}
export function runTests(
  script: string,
  response: HttpResponse,
): Promise<TestResult[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("../workers/test.worker.ts", import.meta.url),
      { type: "module" },
    );
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error("Script execution exceeded 2 seconds"));
    }, 2000);
    worker.onmessage = (
      event: MessageEvent<{ results?: TestResult[]; error?: string }>,
    ) => {
      clearTimeout(timer);
      worker.terminate();
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data.results ?? []);
    };
    worker.onerror = () => {
      clearTimeout(timer);
      worker.terminate();
      reject(new Error("Script worker failed"));
    };
    worker.postMessage({ script, response });
  });
}
