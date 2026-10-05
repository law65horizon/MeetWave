import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
        changeOrigin: true,
      },
    },
  },
});

// import { defineConfig } from 'vite';
// import react from '@vitejs/plugin-react';

// export default defineConfig({
//   plugins: [react()],
//   optimizeDeps: {
//     exclude: ['lucide-react'],
//   },
//   server: {
//     // 1. Remove "https://" and only use the domain name
//     allowedHosts: ["5dc4-98-97-76-110.ngrok-free.app"],
    
//     // 2. Fix HMR by forcing the client to use the standard HTTPS port (443)
//     hmr: {
//       clientPort: 443,
//     },
//   }
// });
