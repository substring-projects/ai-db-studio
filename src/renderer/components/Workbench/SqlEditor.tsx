import React, { useRef, useEffect } from 'react';

interface SqlEditorProps {
  value: string;
  onChange: (val: string) => void;
  onExecute: () => void;
}

export const SqlEditor: React.FC<SqlEditorProps> = ({ value, onChange, onExecute }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Keyboard shortcut: Cmd/Ctrl + Enter to execute query
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      onExecute();
    }
  };

  return (
    <div className="relative w-full h-full flex flex-col bg-[#0f1013] border-b border-studio-border">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="-- Type your SQL statement here (⌘/Ctrl + Enter to run)"
        spellCheck={false}
        className="w-full h-full p-4 font-mono text-[13px] leading-relaxed text-studio-text bg-transparent resize-none focus:outline-none select-text"
      />
    </div>
  );
};
