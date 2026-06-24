/// <reference types="vite/client" />

declare const __QANDA_APP_VERSION__: string;
declare const __QANDA_BUILD_ID__: string;

declare namespace JSX {
  interface Element {}
  interface IntrinsicElements {
    [elem: string]: any;
  }
}
