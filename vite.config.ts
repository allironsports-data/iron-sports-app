import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// Inyecta un id de build en el código (__BUILD_ID__) y emite /version.json
// con el mismo id. La app los compara para avisar de versiones nuevas.
function buildIdPlugin(): Plugin {
  const id = Date.now().toString(36);
  return {
    name: "build-id",
    config: () => ({ define: { __BUILD_ID__: JSON.stringify(id) } }),
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ buildId: id }) });
    },
  };
}

export default defineConfig({
  plugins: [react(), buildIdPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
