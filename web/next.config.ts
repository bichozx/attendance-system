import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Imagen Docker pequeña: .next/standalone trae solo lo necesario para `node server.js`
  output: 'standalone',
};

export default nextConfig;
