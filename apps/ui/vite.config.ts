import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(({ command }) => ({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  esbuild: {
    // only strip on `vite build`, never during `vite dev`
    pure:
      command === "build"
        ? ["console.log", "console.debug", "console.info"]
        : [],
    drop: command === "build" ? ["debugger"] : [],
  },
  server: {
    allowedHosts: [".ngrok-free.app"],
    port: 5173,
    proxy: {
      "/socket.io": {
        target: "http://localhost:3001",
        ws: true,
        changeOrigin: true,
      },
    },
  },
}));
