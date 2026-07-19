import Link from 'next/link';

export default function FinalCTASection() {
  return (
    <section id="cta" className="py-24 md:py-32 px-4 md:px-12 bg-slate-950">
      <div className="max-w-3xl mx-auto text-center">
        <h2 className="text-3xl md:text-5xl font-semibold tracking-tight text-white mb-6">
          ¿Listo para transformar tu contabilidad?
        </h2>
        <p className="text-lg text-slate-300 mb-10 max-w-[50ch] mx-auto">
          Prueba Conta API gratis durante 14 días. Sin tarjeta de crédito.
        </p>
        <Link
          href="mailto:hola@conta-api.com"
          className="inline-block px-10 py-5 bg-accent-600 text-white text-lg font-semibold rounded-lg hover:bg-accent-700 hover:-translate-y-[2px] active:scale-[0.98] transition-all"
        >
          Solicitar demo gratuita
        </Link>
      </div>
    </section>
  );
}
