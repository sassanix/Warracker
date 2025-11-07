import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: 'src',
  publicDir: resolve(__dirname, 'public'),
  build: {
    outDir: '../dist',
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'src/index.html'),
        login: resolve(__dirname, 'src/login.html'),
        register: resolve(__dirname, 'src/register.html'),
        status: resolve(__dirname, 'src/status.html'),
        settings: resolve(__dirname, 'src/settings-new.html'),
        resetPassword: resolve(__dirname, 'src/reset-password.html'),
        resetPasswordRequest: resolve(__dirname, 'src/reset-password-request.html'),
        authRedirect: resolve(__dirname, 'src/auth-redirect.html'),
        about: resolve(__dirname, 'src/about.html'),
        debugExport: resolve(__dirname, 'src/debug-export.html'),
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});


