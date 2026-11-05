import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChartSpec, formatAxis, formatValue, niceTicks } from '../../lib/chart';

const SERIES_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)'];
const AXIS_TEXT = 'hsl(var(--muted-foreground))';

const useWidth = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
};

interface Hover {
  index: number;
  x: number;
  y: number;
}

const Tooltip: React.FC<{ spec: ChartSpec; hover: Hover; width: number }> = ({ spec, hover, width }) => (
  <div
    role="tooltip"
    className="pointer-events-none absolute z-10 max-w-64 rounded-sm border border-border bg-popover px-2 py-1.5 text-xxs text-popover-foreground shadow-overlay"
    style={{
      top: hover.y,
      ...(hover.x > width / 2 ? { right: width - hover.x + 10 } : { left: hover.x + 10 }),
    }}
  >
    <div className="mb-0.5 truncate font-medium">{spec.categories[hover.index]}</div>
    {spec.series.map((s, i) => (
      <div key={s.name} className="flex items-center gap-1.5">
        <span className="size-2 shrink-0 rounded-[2px]" style={{ background: SERIES_COLORS[i] }} />
        <span className="min-w-0 truncate text-muted-foreground">{s.name}</span>
        <span className="ml-auto pl-3 font-mono tabular-nums">{formatValue(s.values[hover.index])}</span>
      </div>
    ))}
  </div>
);

const Legend: React.FC<{ spec: ChartSpec }> = ({ spec }) =>
  spec.series.length < 2 ? null : (
    <div className="mb-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xxs text-muted-foreground">
      {spec.series.map((s, i) => (
        <span key={s.name} className="flex items-center gap-1">
          <span className="size-2 rounded-[2px]" style={{ background: SERIES_COLORS[i] }} />
          {s.name}
        </span>
      ))}
    </div>
  );

/** Horizontal bars: long category names stay readable and the value axis stays continuous. */
const BarChart: React.FC<{ spec: ChartSpec }> = ({ spec }) => {
  const { ref, width } = useWidth();
  const [hover, setHover] = useState<Hover | null>(null);

  const all = spec.series.flatMap((s) => s.values.map((v) => v ?? 0));
  const ticks = niceTicks(Math.min(...all), Math.max(...all));
  const low = ticks[0];
  const high = ticks[ticks.length - 1];

  const count = spec.categories.length;
  const groupCount = spec.series.length;
  const barThickness = Math.min(24, groupCount === 1 ? 18 : 10);
  const groupHeight = groupCount * barThickness + (groupCount - 1) * 2;
  const rowHeight = groupHeight + 8;
  const axisHeight = 20;
  const height = count * rowHeight + axisHeight;

  const longest = Math.max(...spec.categories.map((c) => c.length));
  const labelWidth = Math.min(160, Math.max(48, longest * 6.4 + 8), width * 0.32);
  const labelledTips = groupCount === 1 && count <= 12;
  const plotLeft = labelWidth + 8;
  const plotRight = Math.max(plotLeft + 40, width - (labelledTips ? 56 : 12));
  const scale = (v: number) => plotLeft + ((v - low) / (high - low || 1)) * (plotRight - plotLeft);
  const zero = scale(0);
  const maxChars = Math.floor(labelWidth / 6.2);

  return (
    <div ref={ref} className="relative">
      <Legend spec={spec} />
      {width > 0 && (
        <svg role="img" aria-label={`Bar chart of ${spec.series.map((s) => s.name).join(', ')} by ${spec.xLabel}`} width={width} height={height}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={scale(t)} x2={scale(t)} y1={0} y2={height - axisHeight} stroke="var(--chart-grid)" />
              <text x={scale(t)} y={height - 6} textAnchor="middle" fontSize={10} fill={AXIS_TEXT}>
                {formatAxis(t, high)}
              </text>
            </g>
          ))}
          {spec.categories.map((category, c) => {
            const top = c * rowHeight + 4;
            return (
              <g
                key={category}
                onMouseMove={(e) => {
                  const box = ref.current!.getBoundingClientRect();
                  setHover({ index: c, x: e.clientX - box.left, y: e.clientY - box.top + 12 });
                }}
                onMouseLeave={() => setHover(null)}
              >
                <rect x={0} y={c * rowHeight} width={width} height={rowHeight} fill={hover?.index === c ? 'hsl(var(--accent))' : 'transparent'} />
                <text x={labelWidth} y={top + groupHeight / 2 + 3.5} textAnchor="end" fontSize={11} fill="hsl(var(--foreground))">
                  {category.length > maxChars ? `${category.slice(0, maxChars - 1)}…` : category}
                </text>
                {spec.series.map((s, i) => {
                  const value = s.values[c] ?? 0;
                  const end = scale(value);
                  const left = Math.min(zero, end);
                  const barWidth = Math.max(value === 0 ? 0 : 1.5, Math.abs(end - zero));
                  const y = top + i * (barThickness + 2);
                  const radius = Math.min(4, barWidth);
                  // Rounded at the data end only; square against the baseline.
                  const path =
                    value >= 0
                      ? `M${left},${y}h${barWidth - radius}a${radius},${radius} 0 0 1 ${radius},${radius}v${barThickness - 2 * radius}a${radius},${radius} 0 0 1 -${radius},${radius}h-${barWidth - radius}z`
                      : `M${left + barWidth},${y}h-${barWidth - radius}a${radius},${radius} 0 0 0 -${radius},${radius}v${barThickness - 2 * radius}a${radius},${radius} 0 0 0 ${radius},${radius}h${barWidth - radius}z`;
                  return (
                    <React.Fragment key={s.name}>
                      <path d={path} fill={SERIES_COLORS[i]} />
                      {labelledTips && (
                        <text x={left + barWidth + 5} y={y + barThickness / 2 + 3.5} fontSize={10.5} fill={AXIS_TEXT}>
                          {formatValue(s.values[c])}
                        </text>
                      )}
                    </React.Fragment>
                  );
                })}
              </g>
            );
          })}
          <line x1={zero} x2={zero} y1={0} y2={height - axisHeight} stroke={AXIS_TEXT} strokeOpacity={0.5} />
        </svg>
      )}
      {hover && <Tooltip spec={spec} hover={hover} width={width} />}
    </div>
  );
};

const LineChart: React.FC<{ spec: ChartSpec }> = ({ spec }) => {
  const { ref, width } = useWidth();
  const [hover, setHover] = useState<Hover | null>(null);

  const height = 208;
  const margin = { top: 8, right: 16, bottom: 20, left: 44 };
  const times = spec.times!;
  const values = spec.series.flatMap((s) => s.values.flatMap((v) => (v === null ? [] : [v])));
  const ticks = niceTicks(Math.min(...values), Math.max(...values));
  const low = ticks[0];
  const high = ticks[ticks.length - 1];
  const start = times[0];
  const end = times[times.length - 1];

  const x = (i: number) =>
    margin.left + ((times[i] - start) / (end - start || 1)) * Math.max(0, width - margin.left - margin.right);
  const y = (v: number) => margin.top + (1 - (v - low) / (high - low || 1)) * (height - margin.top - margin.bottom);

  const xTicks = useMemo(() => {
    const count = Math.max(2, Math.min(6, Math.floor(width / 110)));
    return Array.from({ length: count }, (_, i) => Math.round((i / (count - 1)) * (times.length - 1)));
  }, [width, times.length]);
  const spansYears = new Date(start).getFullYear() !== new Date(end).getFullYear();
  const spansHours = end - start < 2 * 86_400_000;
  const xLabel = (i: number) => {
    const date = new Date(times[i]);
    if (spansHours) return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    return date.toLocaleDateString(undefined, spansYears ? { year: 'numeric', month: 'short' } : { month: 'short', day: 'numeric' });
  };

  return (
    <div ref={ref} className="relative">
      <Legend spec={spec} />
      {width > 0 && (
        <svg
          role="img"
          aria-label={`Line chart of ${spec.series.map((s) => s.name).join(', ')} over ${spec.xLabel}`}
          width={width}
          height={height}
          onMouseMove={(e) => {
            const box = ref.current!.getBoundingClientRect();
            const px = e.clientX - box.left;
            let nearest = 0;
            times.forEach((_, i) => {
              if (Math.abs(x(i) - px) < Math.abs(x(nearest) - px)) nearest = i;
            });
            setHover({ index: nearest, x: x(nearest), y: Math.max(0, e.clientY - box.top - 20) });
          }}
          onMouseLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={margin.left} x2={width - margin.right} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" />
              <text x={margin.left - 6} y={y(t) + 3.5} textAnchor="end" fontSize={10} fill={AXIS_TEXT}>
                {formatAxis(t, high)}
              </text>
            </g>
          ))}
          {xTicks.map((i, position) => (
            <text
              key={`${i}-${position}`}
              x={x(i)}
              y={height - 6}
              fontSize={10}
              fill={AXIS_TEXT}
              textAnchor={position === 0 ? 'start' : position === xTicks.length - 1 ? 'end' : 'middle'}
            >
              {xLabel(i)}
            </text>
          ))}
          {spec.series.map((s, i) => {
            let drawing = false;
            const d = s.values
              .map((v, p) => {
                if (v === null) {
                  drawing = false;
                  return '';
                }
                const command = drawing ? 'L' : 'M';
                drawing = true;
                return `${command}${x(p).toFixed(1)},${y(v).toFixed(1)}`;
              })
              .join('');
            return <path key={s.name} d={d} fill="none" stroke={SERIES_COLORS[i]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />;
          })}
          {hover && (
            <>
              <line x1={hover.x} x2={hover.x} y1={margin.top} y2={height - margin.bottom} stroke={AXIS_TEXT} strokeOpacity={0.5} />
              {spec.series.map((s, i) => {
                const v = s.values[hover.index];
                return v === null ? null : (
                  <circle key={s.name} cx={hover.x} cy={y(v)} r={4} fill={SERIES_COLORS[i]} stroke="hsl(var(--background))" strokeWidth={2} />
                );
              })}
            </>
          )}
        </svg>
      )}
      {hover && <Tooltip spec={spec} hover={hover} width={width} />}
    </div>
  );
};

export const ResultChart: React.FC<{ spec: ChartSpec }> = ({ spec }) => {
  if (spec.form === 'stat') {
    return (
      <div className="py-1">
        <div className="text-2xl font-semibold tabular-nums tracking-tight">{formatValue(spec.series[0].values[0])}</div>
        <div className="font-mono text-xxs text-muted-foreground">{spec.series[0].name}</div>
      </div>
    );
  }
  return (
    <div>
      {spec.form === 'bar' ? <BarChart spec={spec} /> : <LineChart spec={spec} />}
      {spec.omitted > 0 && (
        <p className="mt-1 text-xxs text-muted-foreground">
          Showing the first {spec.categories.length} of {spec.categories.length + spec.omitted} rows. The table has them all.
        </p>
      )}
    </div>
  );
};
