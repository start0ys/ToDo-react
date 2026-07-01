import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 정적 배포(Netlify)를 위한 설정. base './' 로 두면 어떤 경로에 올려도 동작.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
