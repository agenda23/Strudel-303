declare module '@strudel/web' {
  export function initStrudel(options?: any): Promise<any>;
  export function evaluate(code: string, autoplay?: boolean): Promise<any>;
  export function hush(): void;
  export function getAudioContext(): AudioContext;
  export function samples(...args: any[]): Promise<any>;
  export const webaudioOutput: any;
  export function registerSound(key: string, onTrigger: any, data?: any): void;
  export function getSuperdoughAudioController(): any;
  export const Pattern: any;
  export * from '@strudel/core';
}

declare module '@strudel/core' {
  export class Pattern {
    static [key: string]: any;
    [key: string]: any;
  }
  export function registerControl(name: string | string[], ...aliases: string[]): any;
  export function createParam(names: string | string[]): any;
  export function evalScope(...args: any[]): Promise<any>;
  export function setTime(func: () => number): void;
  export function evaluate(code: string, transpiler?: any): Promise<{ mode: string; pattern: any; meta?: any }>;
}

declare module 'superdough' {
  export function getSuperdoughAudioController(): any;
  export function registerSound(key: string, onTrigger: any, data?: any): void;
  export const soundMap: any;
  export class Orbit {
    summingNode: GainNode;
    output: GainNode;
  }
}

declare module '*?worker&url' {
  const src: string;
  export default src;
}

declare module '@strudel/mini' {
  export function miniAllStrings(): void;
  export const mini: any;
}

declare module '@strudel/transpiler' {
  export const transpiler: any;
}
