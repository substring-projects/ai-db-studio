import React, { useRef, useState, useEffect } from 'react';
import { AlignLeft, Sparkles, HelpCircle } from 'lucide-react';

interface SqlEditorProps {
  value: string;
  onChange: (val: string) => void;
  onExecute: () => void;
  onExplain?: () => void;
}

const SQL_KEYWORDS = [
  'SELECT',
  'FROM',
  'WHERE',
  'GROUP BY',
  'HAVING',
  'ORDER BY',
  'LIMIT',
  'OFFSET',
  'JOIN',
  'LEFT JOIN',
  'RIGHT JOIN',
  'INNER JOIN',
  'OUTER JOIN',
  'CROSS JOIN',
  'ON',
  'AND',
  'OR',
  'NOT',
  'IN',
  'IS',
  'NULL',
  'AS',
  'DISTINCT',
  'CASE',
  'WHEN',
  'THEN',
  'ELSE',
  'END',
  'INSERT INTO',
  'VALUES',
  'UPDATE',
  'SET',
  'DELETE FROM',
  'CREATE TABLE',
  'ALTER TABLE',
  'DROP TABLE',
  'TRUNCATE',
  'PRIMARY KEY',
  'FOREIGN KEY',
  'REFERENCES',
  'EXPLAIN',
  'UNION',
  'ALL',
];

export const SqlEditor: React.FC<SqlEditorProps> = ({ value, onChange, onExecute, onExplain }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });

  // Sync line numbers count
  const lines = value.split('\n');
  const lineCount = Math.max(lines.length, 1);

  // Sync scrolling between textarea and line gutter
  const handleScroll = () => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const updateCursorPosition = () => {
    if (!textareaRef.current) return;
    const pos = textareaRef.current.selectionStart;
    const textBefore = value.substring(0, pos);
    const lineArr = textBefore.split('\n');
    setCursorPos({
      line: lineArr.length,
      col: lineArr[lineArr.length - 1].length + 1,
    });
  };

  // Keyboard shortcut: Cmd/Ctrl + Enter to execute query
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      onExecute();
    }
    // Tab key handling for indentation
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = e.currentTarget.selectionStart;
      const end = e.currentTarget.selectionEnd;
      const newValue = value.substring(0, start) + '  ' + value.substring(end);
      onChange(newValue);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 2;
        }
      }, 0);
    }
  };

  // Basic SQL Formatter
  const formatSql = () => {
    if (!value.trim()) return;

    let formatted = value;
    // Replace keywords case-insensitively while preserving quoted strings
    SQL_KEYWORDS.sort((a, b) => b.length - a.length).forEach((kw) => {
      const regex = new RegExp(`\\b${kw}\\b`, 'gi');
      formatted = formatted.replace(regex, kw);
    });

    // Clean multiple empty lines
    formatted = formatted.replace(/\n{3,}/g, '\n\n');

    onChange(formatted);
  };

  return (
    <div className="relative w-full h-full flex flex-col bg-[#0d0e11] border-b border-studio-border">
      {/* Editor Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Line Numbers Gutter */}
        <div
          ref={lineNumbersRef}
          className="w-11 py-3 bg-[#0a0a0d] border-r border-studio-border select-none overflow-hidden text-right pr-2.5 font-mono text-xs text-studio-muted/40 shrink-0 leading-5"
        >
          {Array.from({ length: lineCount }).map((_, i) => (
            <div
              key={i + 1}
              className={`${cursorPos.line === i + 1 ? 'text-studio-accent font-semibold' : ''}`}
            >
              {i + 1}
            </div>
          ))}
        </div>

        {/* Text Area */}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              updateCursorPosition();
            }}
            onScroll={handleScroll}
            onSelect={updateCursorPosition}
            onClick={updateCursorPosition}
            onKeyUp={updateCursorPosition}
            onKeyDown={handleKeyDown}
            placeholder="-- Type your SQL statement here (⌘/Ctrl + Enter to run)"
            spellCheck={false}
            className="w-full h-full py-3 px-4 font-mono text-xs leading-5 text-studio-text bg-transparent resize-none focus:outline-none select-text whitespace-pre tab-size-2"
          />
        </div>
      </div>

      {/* Editor Footer Status Bar */}
      <div className="h-6 px-3 flex items-center justify-between border-t border-studio-border bg-studio-surface/30 text-[10px] text-studio-muted shrink-0 font-mono select-none">
        <div className="flex items-center gap-3">
          <span>
            Ln {cursorPos.line}, Col {cursorPos.col}
          </span>
          <span>{lines.length} lines</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={formatSql}
            title="Format SQL Keywords"
            className="flex items-center gap-1 hover:text-studio-accent transition-colors cursor-pointer px-1.5 py-0.5 rounded hover:bg-white/5"
          >
            <AlignLeft className="w-3 h-3" />
            <span>Format</span>
          </button>
        </div>
      </div>
    </div>
  );
};
