'use client';

import { useState } from 'react';
import Link from 'next/link';
import { List, X } from '@phosphor-icons/react';

const navLinks = [
  { label: 'Producto', href: '#features' },
  { label: 'Integraciones', href: '#integraciones' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Dashboard demo', href: '/dashboard' },
];

export default function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 h-16 md:h-20 bg-white/95 backdrop-blur border-b border-slate-200 dark:bg-slate-950/95 dark:border-slate-800">
      <div className="max-w-7xl mx-auto px-4 md:px-12 h-full flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-semibold text-xl text-slate-900 dark:text-slate-50">
          <span className="w-8 h-8 bg-accent-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
            CA
          </span>
          Conta API
        </Link>

        <div className="hidden md:flex items-center gap-10">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-50 transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="hidden md:block">
          <Link
            href="#cta"
            className="inline-block px-6 py-3 bg-accent-600 text-white text-sm font-semibold rounded-lg hover:bg-accent-700 hover:-translate-y-[2px] active:scale-[0.98] transition-all"
          >
            Solicitar demo
          </Link>
        </div>

        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="md:hidden p-2 text-slate-900 dark:text-slate-50"
          aria-label="Abrir menú"
        >
          {isMenuOpen ? <X size={24} /> : <List size={24} />}
        </button>
      </div>

      {isMenuOpen && (
        <div className="md:hidden bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-6">
          <div className="flex flex-col gap-4">
            {navLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                onClick={() => setIsMenuOpen(false)}
                className="text-slate-900 dark:text-slate-50 font-medium"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="#cta"
              onClick={() => setIsMenuOpen(false)}
              className="w-full text-center px-6 py-3 bg-accent-600 text-white font-semibold rounded-lg mt-2"
            >
              Solicitar demo
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
