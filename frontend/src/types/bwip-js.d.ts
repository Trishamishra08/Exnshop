// bwip-js publishes its browser types under the "browser" export condition,
// which TypeScript's "bundler" resolution doesn't select (Vite does). Declare
// the browser encoders this app uses.
declare module 'bwip-js' {
  interface RenderOptions {
    bcid: string;
    text: string;
    scale?: number;
    height?: number;
    includetext?: boolean;
    [option: string]: unknown;
  }
  export function code128(canvas: string | HTMLCanvasElement, opts: RenderOptions): HTMLCanvasElement;
  export function datamatrix(canvas: string | HTMLCanvasElement, opts: RenderOptions): HTMLCanvasElement;
}
