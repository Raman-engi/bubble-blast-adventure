import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Single source of truth for the game name in the HTML shell
// (title, SEO, Open Graph, PWA meta). Change VITE_GAME_NAME in .env and rebuild.
export const fillGameName = (html, name) =>
  html.replaceAll('__GAME_NAME__', name);

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const gameName = env.VITE_GAME_NAME || 'BUBBLE BLAST ADVENTURE';

  return {
    plugins: [
      react(),
      {
        name: 'game-name-html',
        transformIndexHtml: html => fillGameName(html, gameName),
      },
    ],
  };
});
