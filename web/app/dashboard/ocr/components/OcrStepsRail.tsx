'use client';

import React from 'react';
import { Check, Clock, AlertCircle } from 'lucide-react';

interface Step {
  id: number;
  label: string;
  status: 'completed' | 'current' | 'pending' | 'error';
}

interface OcrStepsRailProps {
  steps: Step[];
  currentStep: number;
}

export function OcrStepsRail({ steps, currentStep }: OcrStepsRailProps) {
  const getStepIcon = (step: Step) => {
    if (step.status === 'completed') return <Check className="w-4 h-4" />;
    if (step.status === 'error') return <AlertCircle className="w-4 h-4" />;
    if (step.status === 'current') return <Clock className="w-4 h-4 animate-spin" />;
    return <div className="w-4 h-4 rounded-full border border-gray-300" />;
  };

  const getStepStyle = (step: Step) => {
    if (step.status === 'completed') return 'bg-green-100 text-green-700';
    if (step.status === 'error') return 'bg-red-100 text-red-700';
    if (step.status === 'current') return 'bg-blue-100 text-blue-700';
    return 'bg-gray-100 text-gray-400';
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        {steps.map((step, index) => (
          <React.Fragment key={step.id}>
            {/* Círculo del paso */}
            <div className={`flex flex-col items-center ${index !== steps.length - 1 ? 'flex-1' : ''}`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${getStepStyle(step)}`}>
                {getStepIcon(step)}
              </div>
              <p className="text-xs mt-2 text-center text-gray-700 font-medium">{step.label}</p>
            </div>

            {/* Línea conector */}
            {index !== steps.length - 1 && (
              <div className="flex-1 h-0.5 bg-gray-200 mx-2 mt-5" />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
