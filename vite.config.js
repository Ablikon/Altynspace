import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'three': ['three'],
          'react-three': ['@react-three/fiber', '@react-three/drei'],
          'framer': ['framer-motion']
        }
      }
    },
    chunkSizeWarningLimit: 1000,
    minify: 'esbuild', // Используем esbuild вместо terser (быстрее)
    target: 'es2015',
    cssCodeSplit: true,
    sourcemap: false, // Отключаем sourcemap для production
    assetsInlineLimit: 4096 // Инлайним маленькие файлы
  },
  optimizeDeps: {
    include: ['three', '@react-three/fiber', '@react-three/drei', 'framer-motion']
  }
})
