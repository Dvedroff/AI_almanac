/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEV_SERVER_HOST: string;
  readonly VITE_DEV_SERVER_PORT: string;
  readonly VITE_HMR_PORT: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}