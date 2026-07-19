'use client';

import React, { ReactNode } from 'react';

export interface Tab {
  id: string;
  label: string;
  icon?: string;
  component: ReactNode;
}

interface SupplierTabsProps {
  tabs: Tab[];
  defaultTab?: string;
}

export function SupplierTabs({ tabs, defaultTab }: SupplierTabsProps) {
  const [activeTab, setActiveTab] = React.useState<string>(defaultTab || tabs[0]?.id || 'datos');

  const activeTabContent = tabs.find(t => t.id === activeTab)?.component;

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="border-b border-slate-200 overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 font-medium text-sm transition-colors border-b-2 whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-accent-600 text-accent-600'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.icon && <span className="mr-2">{tab.icon}</span>}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {activeTabContent}
      </div>
    </div>
  );
}
