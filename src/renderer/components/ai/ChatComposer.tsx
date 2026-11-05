import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { cn, shortcutLabel } from '../../lib/utils';
import { Button } from '../ui/button';
import { Tooltip } from '../ui/tooltip';

const MAX_HEIGHT = 168;

interface ChatComposerProps {
  streaming: boolean;
  disabled?: boolean;
  placeholder: string;
  active: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  footer: React.ReactNode;
}

export const ChatComposer: React.FC<ChatComposerProps> = ({ streaming, disabled, placeholder, active, onSend, onStop, footer }) => {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  // Grows with its content up to a limit, then scrolls.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
    el.style.overflowY = el.scrollHeight > MAX_HEIGHT ? 'auto' : 'hidden';
  }, [text]);

  useEffect(() => {
    if (active) ref.current?.focus();
  }, [active]);

  const send = () => {
    const message = text.trim();
    if (!message || streaming || disabled) return;
    onSend(message);
    setText('');
  };

  return (
    <div className="rounded-lg border border-input bg-background transition-colors duration-100 focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
      <textarea
        ref={ref}
        rows={1}
        value={text}
        disabled={disabled}
        placeholder={placeholder}
        aria-label="Message"
        spellCheck
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          // isComposing: Enter confirms an IME candidate here rather than sending.
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            send();
          }
        }}
        className="block w-full resize-none bg-transparent px-3 pb-1 pt-2.5 text-sm leading-[22px] outline-none placeholder:text-muted-foreground/80 disabled:opacity-50"
      />
      <div className="flex items-center justify-between gap-2 pb-1.5 pl-1.5 pr-1.5">
        <div className="flex min-w-0 items-center gap-1">{footer}</div>
        {streaming ? (
          <Tooltip content="Stop generating">
            <Button size="icon" aria-label="Stop generating" variant="secondary" className="rounded-full" onClick={onStop}>
              <Square className="fill-current" />
            </Button>
          </Tooltip>
        ) : (
          <Tooltip content="Send" shortcut="Enter">
            <Button
              size="icon"
              aria-label="Send message"
              className={cn('rounded-full', !text.trim() && 'opacity-40')}
              disabled={!text.trim() || disabled}
              onClick={send}
            >
              <ArrowUp />
            </Button>
          </Tooltip>
        )}
      </div>
    </div>
  );
};

export const composerHint = () => `${shortcutLabel('Enter')} to send, ${shortcutLabel('Shift+Enter')} for a new line`;
