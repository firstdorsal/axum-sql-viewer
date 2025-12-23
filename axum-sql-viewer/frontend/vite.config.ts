import tailwindcssVite from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { visualizer } from "rollup-plugin-visualizer";
import UnpluginInjectPreload from "unplugin-inject-preload/vite";
import { defineConfig } from "vite";

export default defineConfig({
    base: "./",
    resolve: {
        alias: {
            "@": path.resolve(__dirname, `./src`)
        }
    },
    server: {
        port: 5174,
        proxy: {
            "/api": {
                target: "http://localhost:3000/sql-viewer",
                changeOrigin: true
            }
        }
    },
    plugins: [
        tailwindcssVite(),
        react({
            babel: {
                plugins: [["babel-plugin-react-compiler"]]
            }
        }),
        visualizer({
            emitFile: true,
            filename: "stats.html"
        }),
        UnpluginInjectPreload({
            files: [
                {
                    entryMatch: /inter-latin.*\.woff2$/,
                    outputMatch: /inter-latin.*\.woff2$/,
                    attributes: {
                        type: "font/woff2",
                        as: "font",
                        crossorigin: "anonymous",
                        "data-font": "Inter"
                    }
                }
            ]
        })
    ]
});
