import React, { useState } from 'react';
import { Sliders, Plus, Trash2, X } from 'lucide-react';
import { FilterOperator, FilterRule } from '../../../shared/types';

interface AdvancedFilterModalProps {
  tableName: string;
  columns: string[];
  initialRules: FilterRule[];
  initialMatchAny: boolean;
  onApply: (rules: FilterRule[], matchAny: boolean) => void;
  onClose: () => void;
}

const OPERATORS: { label: string; value: FilterOperator }[] = [
  { label: 'contains', value: 'CONTAINS' },
  { label: 'equals', value: 'EQUALS' },
  { label: 'not equals', value: 'NOT_EQUALS' },
  { label: 'starts with', value: 'STARTS_WITH' },
  { label: 'ends with', value: 'ENDS_WITH' },
  { label: '>', value: 'GREATER_THAN' },
  { label: '>=', value: 'GREATER_OR_EQUAL' },
  { label: '<', value: 'LESS_THAN' },
  { label: '<=', value: 'LESS_OR_EQUAL' },
  { label: 'is null', value: 'IS_NULL' },
  { label: 'is not null', value: 'IS_NOT_NULL' },
];

export const AdvancedFilterModal: React.FC<AdvancedFilterModalProps> = ({
  tableName,
  columns,
  initialRules,
  initialMatchAny,
  onApply,
  onClose,
}) => {
  const [matchAny, setMatchAny] = useState(initialMatchAny);
  const [rules, setRules] = useState<FilterRule[]>(
    initialRules.length > 0
      ? initialRules
      : [{ column: columns[0] || '', operator: 'CONTAINS', value: '' }]
  );

  const addRow = () => {
    setRules((prev) => [
      ...prev,
      { column: columns[0] || '', operator: 'CONTAINS', value: '' },
    ]);
  };

  const removeRow = (index: number) => {
    setRules((prev) => prev.filter((_, i) => i !== index));
  };

  const updateRule = (index: number, patch: Partial<FilterRule>) => {
    setRules((prev) =>
      prev.map((r, i) => (i === index ? { ...r, ...patch } : r))
    );
  };

  const handleApply = () => {
    const valid = rules.filter(
      (r) =>
        r.column &&
        (r.value.trim() !== '' || r.operator === 'IS_NULL' || r.operator === 'IS_NOT_NULL')
    );
    onApply(valid, matchAny);
    onClose();
  };

  const handleClear = () => {
    onApply([], false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-xl bg-studio-surface border border-studio-border rounded-xl shadow-2xl overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="flex items-center gap-4 px-6 py-5 border-b border-studio-border bg-studio-surface/50">
          <div className="w-11 h-11 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center shrink-0 shadow-sm animate-badge-bounce">
            <Sliders className="w-5 h-5 text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-studio-text leading-tight">Advanced Filters</h3>
            <p className="text-xs text-studio-muted truncate mt-0.5">
              Table: <span className="font-mono text-studio-accent">{tableName}</span> · Define multi-condition filter rules
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-studio-muted hover:text-studio-text rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 max-h-[65vh] overflow-y-auto">
          {/* Match criteria */}
          <div className="flex items-center gap-6 p-3 bg-studio-bg rounded-lg border border-studio-border text-xs">
            <span className="text-studio-muted font-medium">Match Criteria:</span>
            <label className="flex items-center gap-2 cursor-pointer text-studio-text">
              <input
                type="radio"
                name="match"
                checked={!matchAny}
                onChange={() => setMatchAny(false)}
                className="text-studio-accent focus:ring-0"
              />
              <span>Match ALL (AND)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-studio-text">
              <input
                type="radio"
                name="match"
                checked={matchAny}
                onChange={() => setMatchAny(true)}
                className="text-studio-accent focus:ring-0"
              />
              <span>Match ANY (OR)</span>
            </label>
          </div>

          {/* Condition rows */}
          <div className="space-y-2.5">
            {rules.map((rule, idx) => {
              const noValue = rule.operator === 'IS_NULL' || rule.operator === 'IS_NOT_NULL';
              return (
                <div key={idx} className="flex items-center gap-2">
                  <select
                    value={rule.column}
                    onChange={(e) => updateRule(idx, { column: e.target.value })}
                    className="flex-1 px-3 py-2 text-xs bg-studio-bg text-studio-text border border-studio-border rounded-lg focus:outline-none focus:border-studio-accent cursor-pointer"
                  >
                    {columns.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>

                  <select
                    value={rule.operator}
                    onChange={(e) => updateRule(idx, { operator: e.target.value as FilterOperator })}
                    className="w-32 px-3 py-2 text-xs bg-studio-bg text-studio-text border border-studio-border rounded-lg focus:outline-none focus:border-studio-accent cursor-pointer"
                  >
                    {OPERATORS.map((op) => (
                      <option key={op.value} value={op.value}>
                        {op.label}
                      </option>
                    ))}
                  </select>

                  <input
                    type="text"
                    disabled={noValue}
                    value={noValue ? '' : rule.value}
                    placeholder={noValue ? 'N/A' : 'Value…'}
                    onChange={(e) => updateRule(idx, { value: e.target.value })}
                    className="flex-1 px-3 py-2 text-xs bg-studio-bg text-studio-text border border-studio-border rounded-lg focus:outline-none focus:border-studio-accent disabled:opacity-40"
                  />

                  <button
                    onClick={() => removeRow(idx)}
                    className="p-2 text-studio-muted hover:text-destructive rounded-lg hover:bg-destructive/10 transition-colors cursor-pointer"
                    title="Remove rule"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>

          <button
            onClick={addRow}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-studio-accent hover:text-studio-accentHover border border-dashed border-studio-border hover:border-studio-accent rounded-lg transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Condition</span>
          </button>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 bg-studio-bg border-t border-studio-border">
          <button
            onClick={handleClear}
            className="px-3 py-1.5 text-xs font-medium text-studio-muted hover:text-studio-text hover:bg-accent rounded-lg transition-colors cursor-pointer"
          >
            Clear Filters
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-medium text-studio-muted hover:text-studio-text hover:bg-accent rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              className="px-4 py-1.5 text-xs font-semibold text-white bg-studio-accent hover:bg-studio-accentHover rounded-lg transition-all shadow-sm cursor-pointer"
            >
              Apply Filters
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
