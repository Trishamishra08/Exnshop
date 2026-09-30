import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { serveAssetsPlugin } from './vite-plugin-serve-assets'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    serveAssetsPlugin()
  ],
  assetsInclude: ['**/*.jpg', '**/*.jpeg', '**/*.png', '**/*.webp'],
  server: {
    fs: {
      strict: false,
    },
    middlewareMode: false,
    proxy: {
      '/api/v1': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@assets': path.resolve(__dirname, './assets'),
    },
    // Ensure single React instance
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    // Force include React and react-dom to ensure single instance
    include: ['react', 'react-dom', 'react-apexcharts', 'apexcharts'],
    // Exclude problematic packages if needed
    exclude: [],
  },
  build: {
    commonjsOptions: {
      // Ensure proper CommonJS handling
      include: [/node_modules/],
      transformMixedEsModules: true,
    },
    // Code splitting optimization.
    // NOTE: this MUST be the function form, not a static { chunkName: [...packages] }
    // object. The static form pins these packages into one shared chunk regardless of
    // which lazy route actually needs them, which can produce an out-of-order/circular
    // chunk load graph against route-level `import()` code-splitting — when that
    // happens, a chunk can start evaluating before its vendor chunk has finished
    // initializing, leaving an imported binding `undefined` at the moment something
    // (e.g. React.lazy, or a library's CJS interop) reads `.default` off it. That's
    // what caused "Cannot read properties of undefined (reading 'default')" crashes,
    // seen in the delivery app when navigating into screens using
    // @react-google-maps/api (map-vendor) or framer-motion (ui-vendor). The function
    // form still groups these into named vendor chunks, but lets Rollup compute chunk
    // boundaries from the real import graph instead of a hardcoded package list.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('react-router-dom') || id.includes(`${path.sep}react${path.sep}`) || id.includes(`${path.sep}react-dom${path.sep}`)) {
            return 'react-vendor';
          }
          if (id.includes('framer-motion') || id.includes('gsap')) {
            return 'ui-vendor';
          }
          if (id.includes('apexcharts')) {
            return 'chart-vendor';
          }
          // recharts is intentionally NOT force-grouped into chart-vendor: it calls
          // React.forwardRef at module top-level, and forcing it into a shared vendor
          // chunk alongside apexcharts produced a chunk-load-order race where that code
          // ran before react-vendor had finished initializing ("Cannot read properties
          // of undefined (reading 'forwardRef')"). Left unchunked, Rollup bundles it
          // with whichever chunk actually imports it and orders that load correctly.
          if (id.includes('@react-google-maps') || id.includes('leaflet')) {
            return 'map-vendor';
          }
          return undefined;
        },
      },
    },
    // Optimize chunk size
    chunkSizeWarningLimit: 1000,
    // Enable source maps for production debugging (optional)
    sourcemap: false,
    // Minify with esbuild (built-in, faster than terser, no extra dependencies needed)
    minify: 'esbuild',
  },
})
