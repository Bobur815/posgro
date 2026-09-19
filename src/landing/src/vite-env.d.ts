/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Only for `vite dev`; in production the portal is same-origin with the API via nginx. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
