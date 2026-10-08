import '@fontsource-variable/atkinson-hyperlegible-next';
import './globals.css';

import type { Metadata } from 'next';

import { Providers } from './providers';

export const metadata: Metadata = {
  title: { default: 'Control de asistencia', template: '%s · Control de asistencia' },
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
