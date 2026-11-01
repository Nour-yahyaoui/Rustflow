import RELEASE_SYNC from "@jitl/quickjs-wasmfile-release-sync";
import wasmUrl from "@jitl/quickjs-wasmfile-release-sync/wasm?url";
import type { HttpResponse } from "@requestlab/shared";
import {
  newQuickJSWASMModuleFromVariant,
  newVariant,
} from "quickjs-emscripten-core";
import { evaluateTests } from "../lib/isolation";
const modulePromise = newQuickJSWASMModuleFromVariant(
  newVariant(RELEASE_SYNC, {
    wasmBinary: async () => {
      const result = await fetch(wasmUrl);
      if (!result.ok) throw new Error("Could not load sandbox runtime");
      return result.arrayBuffer();
    },
  }),
);
self.onmessage = async (
  event: MessageEvent<{ script: string; response: HttpResponse }>,
) => {
  try {
    self.postMessage({
      results: await evaluateTests(
        event.data.script,
        event.data.response,
        await modulePromise,
      ),
    });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
