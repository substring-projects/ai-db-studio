import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { FilterOperator, FilterRule } from '../../../shared/types';
import { FILTER_OPERATORS } from '../../lib/grid';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '../ui/dialog';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

interface AdvancedFilterModalProps {
  tableName: string;
  columns: string[];
  initialRules: FilterRule[];
  initialMatchAny: boolean;
  onApply: (rules: FilterRule[], matchAny: boolean) => void;
  onClose: () => void;
}

export const AdvancedFilterModal: React.FC<AdvancedFilterModalProps> = ({
  tableName,
  columns,
  initialRules,
  initialMatchAny,
  onApply,
  onClose,
}) => {
  const blank = (): FilterRule => ({ column: columns[0] ?? '', operator: 'CONTAINS', value: '' });
  const [matchAny, setMatchAny] = useState(initialMatchAny);
  const [rules, setRules] = useState<FilterRule[]>(initialRules.length > 0 ? initialRules : [blank()]);

  const update = (index: number, patch: Partial<FilterRule>) => {
    setRules((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };
  const needsValue = (operator: FilterOperator) => FILTER_OPERATORS.find((o) => o.value === operator)?.needsValue ?? true;

  const apply = () => {
    onApply(rules.filter((r) => r.column && (!needsValue(r.operator) || r.value.trim() !== '')), matchAny);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title="Filter rows" description={tableName} className="max-w-xl">
        <DialogBody className="space-y-2.5">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Match</span>
            <div role="radiogroup" aria-label="Match" className="flex rounded-md border border-input p-0.5">
              {[
                { any: false, label: 'All conditions' },
                { any: true, label: 'Any condition' },
              ].map((option) => (
                <button
                  key={option.label}
                  type="button"
                  role="radio"
                  aria-checked={matchAny === option.any}
                  onClick={() => setMatchAny(option.any)}
                  className={cn(
                    'rounded-sm px-2 py-0.5 text-xxs transition-colors duration-75',
                    matchAny === option.any ? 'bg-secondary font-medium' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            {rules.map((rule, index) => (
              <div key={index} className="grid grid-cols-[minmax(0,1fr)_120px_minmax(0,1fr)_24px] items-center gap-1.5">
                <Select value={rule.column} onValueChange={(column) => update(index, { column })}>
                  <SelectTrigger aria-label="Column" className="font-mono text-xxs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {columns.map((c) => (
                      <SelectItem key={c} value={c} className="font-mono text-xxs">
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={rule.operator} onValueChange={(operator) => update(index, { operator: operator as FilterOperator })}>
                  <SelectTrigger aria-label="Operator" className="text-xxs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FILTER_OPERATORS.map((op) => (
                      <SelectItem key={op.value} value={op.value}>
                        {op.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  aria-label="Value"
                  disabled={!needsValue(rule.operator)}
                  value={needsValue(rule.operator) ? rule.value : ''}
                  onChange={(e) => update(index, { value: e.target.value })}
                  className="font-mono text-xxs"
                />
                <Button
                  variant="quiet"
                  size="icon-sm"
                  aria-label="Remove condition"
                  onClick={() => setRules((prev) => prev.filter((_, i) => i !== index))}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
          <Button variant="quiet" size="sm" onClick={() => setRules((prev) => [...prev, blank()])}>
            <Plus /> Add condition
          </Button>
        </DialogBody>
        <DialogFooter className="justify-between">
          <Button
            variant="quiet"
            onClick={() => {
              onApply([], false);
              onClose();
            }}
          >
            Clear filters
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={apply}>Apply</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
