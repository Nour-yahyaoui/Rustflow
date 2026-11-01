import type { HttpResponse } from "@requestlab/shared";
import type { QuickJSWASMModule } from "quickjs-emscripten-core";
export async function evaluateTests(
  script: string,
  input: HttpResponse,
  QuickJS: QuickJSWASMModule,
) {
  let runtime;
  let context;
  try {
    runtime = QuickJS.newRuntime();
    runtime.setMemoryLimit(16 * 1024 * 1024);
    runtime.setMaxStackSize(512 * 1024);
    const deadline = Date.now() + 500;
    runtime.setInterruptHandler(() => Date.now() > deadline);
    context = runtime.newContext();
    let body: unknown = input.body;
    try {
      body = JSON.parse(input.body);
    } catch {
      /* Non-JSON responses remain text. */
    }
    const response = {
      status: input.status,
      statusText: input.statusText,
      durationMs: input.durationMs,
      size: input.size,
      url: input.url,
      truncated: input.truncated,
      body,
      headers: Object.fromEntries(
        input.headers.map(([k, v]) => [k.toLowerCase(), v]),
      ),
    };
    const source = `"use strict"; const response=${JSON.stringify(response)}; const results=[];
 const test=(name,fn)=>{try{const returned=fn();if(returned&&typeof returned.then==='function')throw Error('Async tests are not supported');results.push({name:String(name),passed:true});}catch(e){results.push({name:String(name),passed:false,error:String(e.message||e)});}};
 const expect=(actual)=>({toBe(expected){if(actual!==expected)throw Error('Expected '+JSON.stringify(expected)+', received '+JSON.stringify(actual));},toEqual(expected){if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('Values are not equal');},toBeDefined(){if(actual===undefined||actual===null)throw Error('Value is not defined');},toContain(expected){if(!actual?.includes(expected))throw Error('Value does not contain '+expected);},toBeLessThan(expected){if(!(actual<expected))throw Error('Expected value below '+expected);}});
 ${script}\nJSON.stringify(results);`;
    const result = context.evalCode(source);
    if (result.error) {
      const error = context.dump(result.error) as { message?: string };
      result.error.dispose();
      throw new Error(error.message ?? "Script failed");
    }
    const results = JSON.parse(context.getString(result.value));
    result.value.dispose();
    return results as { name: string; passed: boolean; error?: string }[];
  } finally {
    context?.dispose();
    runtime?.dispose();
  }
}
