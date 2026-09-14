import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const __dirname = import.meta.dirname;

// En dev, el SPA (Vite, puerto 5173) y el backend PHP (puerto 8801, `php -S`)
// corren separados — se proxea todo lo que empiece con /api- y /uploads
// hacia el PHP, igual que hvac-manager-web-NEW-MODEL. En producción, ambos
// se suben a la misma carpeta/dominio en cPanel, así que no hace falta
// proxy ni CORS ahí.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "^/api-.*\\.php": {
        target: "http://127.0.0.1:8801",
        changeOrigin: true,
      },
      "/uploads": {
        target: "http://127.0.0.1:8801",
        changeOrigin: true,
      },
    },
  },
});
