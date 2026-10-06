import { redirect } from 'next/navigation';

// Pagina antigua: el informe esta ahora en Informes contables (datos reales, con descarga en PDF y Excel).
export default function Page() {
  redirect('/dashboard/informes?tipo=balance');
}
