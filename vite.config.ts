import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        spikeNetwork: resolve(__dirname, 'spike-network.html'),
        spikeRender: resolve(__dirname, 'spike-render.html'),
      },
    },
  },
  test: { environment: 'node' },
});
