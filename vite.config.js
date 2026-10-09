import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  const ollamaEndpoint = env.VITE_OLLAMA_ENDPOINT || "http://localhost:11434";
  const devHost = env.VITE_DEV_SERVER_HOST || "0.0.0.0";
  const devPort = Number(env.VITE_DEV_SERVER_PORT) || 3000;
  const hmrPort = Number(env.VITE_HMR_PORT) || 3001;

  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: devHost,
      port: devPort,
      strictPort: true,
      hmr: {
        port: hmrPort,
      },
      // Proxy for Ollama — решает CORS и Private Network Access в браузере
      proxy: {
        "/ollama-proxy": {
          target: ollamaEndpoint,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/ollama-proxy/, ""),
        },
      },
    },
  };
});
