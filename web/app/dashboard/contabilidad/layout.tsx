import type { ReactNode } from 'react';
import MargenPagina from '@/components/MargenPagina';

/** Las páginas de esta sección no llevan margen propio: se lo pone el layout. */
export default function Layout({ children }: { children: ReactNode }) {
  return <MargenPagina>{children}</MargenPagina>;
}
