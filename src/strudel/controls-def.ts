/**
 * Single definition of the 303-specific Strudel controls.
 * Kept free of Strudel imports so it can be registered against any Strudel build
 * (the app's bundled @strudel/web, or @strudel/core in tests).
 *
 * `slide` already exists upstream as an (unused) control name; registering it again is harmless and
 * keeps strudel.cc-style `.slide()` working. Everything 303-specific else is `tb*`-prefixed.
 */
export const TB303_CONTROL_NAMES = [
  'accent',
  'slide',
  'tbcut',
  'tbres',
  'tbenv',
  'tbdec',
  'tbwave',
  'tbslidetime',
  'tbdist',
  'tbdisttone',
  'tbdistmix',
  'tbdisttype',
  'tbfilter',
  'tbdrive',
  'tbasym',
  'tbrel',
  'tbglide',
  'tbslidecurve',
] as const;

export function defineTB303Controls(registerControl: (name: string) => Record<string, any>): Record<string, any> {
  const controls: Record<string, any> = {};
  for (const name of TB303_CONTROL_NAMES) Object.assign(controls, registerControl(name));
  return controls;
}
