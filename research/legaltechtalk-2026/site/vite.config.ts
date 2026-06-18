import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Static microsite — no backend proxy (unlike the Legalise app this design is
// lifted from). Builds to /dist for any static host (CF Pages / Vercel / GH Pages).
export default defineConfig({
  plugins: [react()],
  base: "./",
});
