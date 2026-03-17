import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/ws": {
        target: "https://localhost",
        ws: true,
        secure: false,
      },
      "/v1": {
        target: "https://localhost",
        secure: false,
      },
      "/healthz": {
        target: "https://localhost",
        secure: false,
      },
    },
  },
});
