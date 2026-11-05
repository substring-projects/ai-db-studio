import React, { useMemo } from 'react';
import { tokenizeSql } from '../../lib/sql';
import { cn } from '../../lib/utils';

/** Read-only highlighted SQL, coloured from the same theme tokens as the editor. */
export const SqlCode: React.FC<{ sql: string; className?: string; wrap?: boolean }> = ({ sql, className, wrap = true }) => {
  const tokens = useMemo(() => tokenizeSql(sql), [sql]);
  return (
    <code
      className={cn(
        'selectable block font-mono text-xxs leading-[18px]',
        wrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre',
        className
      )}
    >
      {tokens.map((token, i) =>
        token.kind === 'plain' ? (
          <React.Fragment key={i}>{token.text}</React.Fragment>
        ) : (
          <span key={i} className={`sql-${token.kind}`}>
            {token.text}
          </span>
        )
      )}
    </code>
  );
};
