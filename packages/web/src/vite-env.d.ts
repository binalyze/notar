/// <reference types="vite/client" />

declare const __DEV_PRIVATE_KEY__: string;
declare const __DEV_PUBLIC_KEY__: string;
declare const __DEV_KEY_ID__: string;

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<object, object, unknown>;
  export default component;
}
