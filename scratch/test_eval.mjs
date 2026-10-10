import { evalScope, evaluate } from '@strudel/core';
import * as core from '@strudel/core';
import * as mini from '@strudel/mini';
import { transpiler } from '@strudel/transpiler';
import { defineTB303Controls } from '../src/strudel/controls-def.js';

await evalScope(core, mini);
mini.miniAllStrings?.();
await evalScope({ setcps: () => {} });
await evalScope(defineTB303Controls((n) => core.registerControl(n)));

const code = `
setcps(138/60/4)

$: n("<[0 ~ 3 ~]*4 [0 12 7 10]*4>").scale("c2:minor")
  .s("tb303")
  .accent("<[1 0 0 0]*4 [1 0 1 0]*4>")
  .slide("<[0 0 0 0]*4 [0 0 1 0]*4>")
  .tbcut(sine.range(300, 3200).slow(8))
  .tbres(0.9)
  .tbenv(0.7)
  .tbdec(0.2)
  .gain("<[0.8]*4 [0.9]*4>")

$: s("<[bd*4]*4 [bd*4]*4>").bank("RolandTR909")
`;

try {
  const result = await evaluate(code, transpiler);
  console.log("Evaluation SUCCESS!", !!result.pattern);
} catch (err) {
  console.error("Evaluation FAILED:", err);
}
