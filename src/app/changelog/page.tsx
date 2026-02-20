'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Sparkles, Wrench, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { CHANGELOG_ENTRIES, type ChangeType } from '@/lib/changelog-data';

const FILTERS: { value: ChangeType | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'feature', label: 'Features' },
  { value: 'fix', label: 'Fixes' },
  { value: 'improvement', label: 'Improvements' },
];

function TypeBadge({ type }: { type: ChangeType }) {
  const config: Record<ChangeType, { label: string; colors: string; icon: typeof Sparkles }> = {
    feature: {
      label: 'Feature',
      colors: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
      icon: Sparkles,
    },
    fix: {
      label: 'Fix',
      colors: 'bg-red-500/20 text-red-400 border-red-500/30',
      icon: Wrench,
    },
    improvement: {
      label: 'Improvement',
      colors: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      icon: TrendingUp,
    },
  };

  const { label, colors, icon: Icon } = config[type];

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${colors}`}>
      <Icon size={12} />
      {label}
    </span>
  );
}

export default function ChangelogPage() {
  const [filter, setFilter] = useState<ChangeType | 'all'>('all');

  const filtered = filter === 'all'
    ? CHANGELOG_ENTRIES
    : CHANGELOG_ENTRIES.filter(e => e.type === filter);

  return (
    <div className="min-h-screen p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link
          href="/dashboard"
          className="text-text-secondary hover:text-accent-primary transition-colors"
        >
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-glow">Changelog</h1>
          <p className="text-text-secondary mt-1">{"What's new in Thyme"}</p>
        </div>
      </div>

      {/* Filter buttons */}
      <div className="flex gap-1 mb-6">
        {FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === f.value
                ? 'bg-accent-primary/20 text-accent-primary border border-accent-primary/30'
                : 'text-text-secondary hover:text-text-primary hover:bg-background-hover'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Entries */}
      <div className="space-y-4">
        {filtered.map((entry, i) => (
          <motion.div
            key={`${entry.date}-${entry.title}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: i * 0.05 }}
          >
            <div className="glass-card p-5">
              <div className="flex items-center justify-between mb-2">
                <TypeBadge type={entry.type} />
                <span className="text-xs text-text-secondary font-mono">
                  {new Date(entry.date).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              </div>
              <h3 className="font-semibold text-text-primary mb-1">{entry.title}</h3>
              <p className="text-sm text-text-secondary">{entry.description}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-text-secondary">
          No entries match this filter.
        </div>
      )}
    </div>
  );
}
