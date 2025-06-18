import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Qualquer requisição que o frontend fizer para '/api'
      // será redirecionada para o backend.
      '/api': {
        target: 'http://localhost:7000', // O endereço do seu backend Docker
        changeOrigin: true, // Necessário para a correta configuração do proxy
      },
    },
  },
});
