import { registerControl, evalScope } from '@strudel/web';
import { defineTB303Controls } from './controls-def';

/** Register the TB-303 controls on the app's Strudel instance and expose them to evaluated code. */
export function registerTB303Controls() {
  const controls = defineTB303Controls((name) => registerControl(name));
  try {
    evalScope(controls);
  } catch (e) {
    console.warn('evalScope registration warning:', e);
  }
  return controls;
}
