/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the ai-usage-backend REST API. See .env.example. */
  readonly VITE_BACKEND_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
