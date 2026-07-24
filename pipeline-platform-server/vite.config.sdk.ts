import { defineConfig } from 'vite'
import path from 'path'

// SDK 打包：把 TypeScript 源码打成单个 JS 文件，供浏览器 <script> 引入
export default defineConfig({
  build: {
    outDir: 'sdk-dist',
    lib: {
      entry: path.resolve(__dirname, 'src/sdk/index.ts'),
      name: 'PipelineSDK',
      formats: ['iife'],        // IIFE 格式：立即执行，不污染全局
      fileName: () => 'sdk.js',
    },
    minify: 'esbuild',
    emptyOutDir: true,
  },
})
