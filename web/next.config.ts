import type { NextConfig } from 'next';

const dev = process.env.NODE_ENV !== 'production';

/**
 * Política de contenido: el panel solo carga código, estilos, imágenes y datos de su propio
 * origen (la API se consulta a través de /api/backend, en el mismo dominio). Next necesita
 * 'unsafe-inline' para sus scripts de arranque; 'unsafe-eval' solo en desarrollo.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${dev ? ' ws: wss:' : ''}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // Nadie puede meter el panel dentro de otra página (evita engaños de "clickjacking")
  "frame-ancestors 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // El panel no usa cámara, micrófono ni ubicación (eso lo hace la app móvil)
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  // HTTPS obligatorio por 1 año (solo tiene efecto cuando el panel se sirve por HTTPS)
  ...(dev ? [] : [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]),
];

const nextConfig: NextConfig = {
  // Imagen Docker pequeña: .next/standalone trae solo lo necesario para `node server.js`
  output: 'standalone',
  // No anunciar "X-Powered-By: Next.js"
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
