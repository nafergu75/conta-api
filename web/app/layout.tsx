import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';

export const metadata: Metadata = {
  title: 'Conta API - Automatización contable para pymes y despachos',
  description:
    'Conecta tu facturación, ERP y herramientas con tus asientos contables en tiempo real. Cero errores, cero retrasos.',
  openGraph: {
    title: 'Conta API - Automatización contable',
    description:
      'Automatiza tu contabilidad desde cualquier sistema. Para pymes, despachos y asesores.',
    type: 'website',
    url: 'https://conta-api-alpha.vercel.app',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="es"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="font-sans">{children}</body>
    </html>
  );
}
