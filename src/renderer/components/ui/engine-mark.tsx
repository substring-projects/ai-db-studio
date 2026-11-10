import * as React from 'react';
import { engineInfo } from '../../../shared/engines';
import type { Engine } from '../../../shared/types';
import { cn } from '../../lib/utils';

/** Each database's familiar colour, used only as a tint behind its two-letter mark. */
const TINT: Record<Engine, string> = {
  POSTGRESQL: 'bg-[#336791]/15 text-[#336791] ring-[#336791]/30 dark:bg-[#5b8ec2]/20 dark:text-[#8ab4e0] dark:ring-[#5b8ec2]/35',
  MYSQL: 'bg-[#00758f]/10 text-[#00758f] ring-[#00758f]/30 dark:bg-[#2aa3bf]/15 dark:text-[#6cc7db] dark:ring-[#2aa3bf]/35',
  MONGODB: 'bg-[#13aa52]/10 text-[#0f8a43] ring-[#13aa52]/30 dark:bg-[#13aa52]/15 dark:text-[#5fd08f] dark:ring-[#13aa52]/35',
};

const SIZE = {
  xs: 'h-[15px] min-w-[20px] px-1 text-[9.5px] rounded',
  sm: 'size-7 text-[10.5px] rounded-md',
  md: 'size-9 text-xs rounded-lg',
};

/** A compact, recognisable mark for a database engine, e.g. "PG" on Postgres blue. */
export const EngineMark: React.FC<{ engine: Engine | undefined; size?: keyof typeof SIZE; className?: string }> = ({
  engine,
  size = 'sm',
  className,
}) => {
  const info = engineInfo(engine);
  return (
    <span
      title={info.label}
      aria-hidden
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center font-semibold tracking-wide ring-1 ring-inset',
        TINT[info.id],
        SIZE[size],
        className
      )}
    >
      {info.badge}
    </span>
  );
};
