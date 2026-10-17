import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  test: {
    environment: 'jsdom',
    setupFiles: ['fake-indexeddb/auto', './src/test/setup.ts'],
    // 完整測試會多個檔案並行跑 jsdom／fake-indexeddb，這台機器負載高時 5 秒預設太緊（偶發逾時，單獨跑都過）
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
