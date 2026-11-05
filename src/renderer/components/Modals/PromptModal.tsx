import React, { useState, useRef, useEffect } from 'react';
import { Edit3, X } from 'lucide-react';

interface PromptModalProps {
  title: string;
  subtitle: string;
  fieldLabel: string;
  initialValue?: string;
  placeholder?: string;
  validate?: (val: string) => boolean;
  errorMsg?: string;
  onConfirm: (val: string) => void;
  onClose: () => void;
}

export const PromptModal: React.FC<PromptModalProps> = ({
  title,
  subtitle,
  fieldLabel,
  initialValue = '',
  placeholder = '',
  validate,
  errorMsg = 'This field cannot be empty.',
  onConfirm,
  onClose,
}) => {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [isShaking, setIsShaking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = value.trim();

    if (validate ? !validate(trimmed) : !trimmed) {
      setError(errorMsg);
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 350);
      inputRef.current?.focus();
      return;
    }

    onConfirm(trimmed);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div
        className={`w-full max-w-md bg-studio-surface border border-studio-border rounded-xl shadow-2xl overflow-hidden animate-pop-in ${
          isShaking ? 'animate-shake' : ''
        }`}
      >
        {/* Header */}
        <div className="flex items-center gap-4 px-6 py-5 border-b border-studio-border bg-studio-surface/50">
          <div className="w-11 h-11 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center shrink-0 shadow-sm animate-badge-bounce">
            <Edit3 className="w-5 h-5 text-purple-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-studio-text leading-tight">{title}</h3>
            <p className="text-xs text-studio-muted truncate mt-0.5">{subtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-studio-muted hover:text-studio-text rounded-lg hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-studio-text">{fieldLabel}</label>
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                if (error) setError(null);
              }}
              placeholder={placeholder}
              className={`w-full px-3.5 py-2.5 text-sm bg-studio-bg text-studio-text border rounded-lg focus:outline-none transition-all ${
                error
                  ? 'border-red-500 focus:ring-2 focus:ring-red-500/30'
                  : 'border-studio-border focus:border-studio-accent focus:ring-2 focus:ring-studio-accent/20'
              }`}
            />
            {error && <p className="text-xs text-red-500 pt-0.5">{error}</p>}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-studio-muted hover:text-studio-text hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-studio-sidebar bg-studio-accent hover:bg-studio-accentHover active:scale-95 rounded-lg shadow-sm transition-all cursor-pointer"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
