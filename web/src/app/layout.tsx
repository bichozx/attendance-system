import '@fontsource-variable/playfair-display';
import '@fontsource-variable/source-sans-3';
import './globals.css';

import type { Metadata } from 'next';

import { Providers } from './providers';

export const metadata: Metadata = {
  title: { default: 'Asistencia · Tauras', template: '%s · Asistencia Tauras' },
  description: 'Panel de administración de turnos y asistencia',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CO">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
