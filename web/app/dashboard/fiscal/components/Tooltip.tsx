'use client';

import { useState } from 'react';
import { Info } from '@phosphor-icons/react';

interface TooltipProps {
  text: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  children?: React.ReactNode;
}

export function Tooltip({ text, position = 'top', children }: TooltipProps) {
  const [isOpen, setIsOpen] = useState(false);

  const positionClasses = {
    top: 'bottom-full mb-2 left-1/2 -translate-x-1/2',
    bottom: 'top-full mt-2 left-1/2 -translate-x-1/2',
    left: 'right-full mr-2 top-1/2 -translate-y-1/2',
    right: 'left-full ml-2 top-1/2 -translate-y-1/2',
  };

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center justify-center w-5 h-5 text-slate-400 hover:text-slate-600 transition rounded-full"
        aria-label="Información"
      >
        <Info size={16} weight="fill" />
      </button>

      {isOpen && (
        <div
          className={`absolute z-50 w-48 px-3 py-2 text-xs text-white bg-slate-900 rounded-lg shadow-lg pointer-events-none ${positionClasses[position]}`}
          role="tooltip"
        >
          {text}
          <div
            className={`absolute w-2 h-2 bg-slate-900 transform rotate-45 ${
              position === 'top'
                ? 'top-full left-1/2 -translate-x-1/2 -translate-y-1'
                : position === 'bottom'
                  ? 'bottom-full left-1/2 -translate-x-1/2 translate-y-1'
                  : position === 'left'
                    ? 'left-full top-1/2 -translate-y-1/2 translate-x-1'
                    : 'right-full top-1/2 -translate-y-1/2 -translate-x-1'
            }`}
          />
        </div>
      )}
    </div>
  );
}
