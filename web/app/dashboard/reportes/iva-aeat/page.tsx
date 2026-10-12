import { redirect } from 'next/navigation';

// Página antigua con cifras de ejemplo fijas (2025 y 2026): el IVA real de cada trimestre está en el modelo 303.
export default function Page() {
  redirect('/dashboard/fiscal/modelo-303');
}
