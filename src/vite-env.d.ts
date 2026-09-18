/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CONVEX_URL: string;
  readonly VITE_ANALYST_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
