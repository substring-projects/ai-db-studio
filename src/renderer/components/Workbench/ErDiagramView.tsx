import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  ExternalLink,
  Eye,
  FileCode2,
  Filter,
  Key,
  Layers,
  Link2,
  Maximize2,
  Network,
  RefreshCw,
  RotateCcw,
  Rows3,
  Search,
  Table2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { DbTable, Engine, ForeignKey, TableColumn, TableStructure } from '../../../shared/types';
import { useStudio } from '../../context/StudioContext';
import { useSchema } from '../../context/SchemaContext';
import { useWorkspace, WorkspaceTab } from '../../context/WorkspaceContext';
import { engineInfo } from '../../../shared/engines';
import { columnKey, qualifiedName } from '../../lib/sql';
import { cn, formatCount } from '../../lib/utils';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { EmptyState, Skeleton } from '../ui/feedback';
import { Input } from '../ui/input';
import { Tooltip } from '../ui/tooltip';

const CARD_WIDTH = 270;
const HEADER_HEIGHT = 38;
const ROW_HEIGHT = 22;

interface TableNode {
  id: string;
  table: DbTable;
  columns: TableColumn[];
  foreignKeys: ForeignKey[];
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Relationship {
  id: string;
  sourceTable: string;
  sourceColumn: string;
  targetTable: string;
  targetColumn: string;
  constraintName: string;
}

export const ErDiagramView: React.FC<{ tab: Extract<WorkspaceTab, { kind: 'er' }> }> = ({ tab }) => {
  const { profiles, connectionStates, connectProfile } = useStudio();
  const { schemas, loadSchema, loadStructure, structures } = useSchema();
  const { openTableData, openStructure, newQuery } = useWorkspace();

  const profile = profiles.find((p) => p.id === tab.profileId);
  const connected = connectionStates[tab.profileId]?.state === 'connected';

  const [loading, setLoading] = useState(true);
  const [tableNodes, setTableNodes] = useState<TableNode[]>([]);
  const [search, setSearch] = useState('');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 40, y: 40 });
  const [draggingNode, setDraggingNode] = useState<{ id: string; startX: number; startY: number; nodeX: number; nodeY: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [hoveredTable, setHoveredTable] = useState<string | null>(null);
  const [hoveredRel, setHoveredRel] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Load schema and all table structures
  useEffect(() => {
    if (!connected) return;
    let cancelled = false;

    const fetchAll = async () => {
      setLoading(true);
      try {
        const schemaEntry = schemas[tab.profileId];
        let tables = schemaEntry?.tables;
        if (!tables || schemaEntry.status !== 'ready') {
          await loadSchema(tab.profileId);
          tables = schemas[tab.profileId]?.tables || (await window.electronAPI.getTables(tab.profileId));
        }

        // Filter by tab.schema if specified
        const targetTables = tab.schema ? tables.filter((t) => !t.schema || t.schema === tab.schema) : tables;

        // Fetch structures for all tables in parallel
        const structPromises = targetTables.map(async (t) => {
          try {
            return await loadStructure(tab.profileId, t.name, t.schema);
          } catch {
            return null;
          }
        });

        const loadedStructures = (await Promise.all(structPromises)).filter(Boolean) as TableStructure[];
        if (cancelled) return;

        // Compute auto layout in multi-column grid
        const cols = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(targetTables.length))));
        const colWidth = CARD_WIDTH + 80;
        const colHeights = new Array(cols).fill(40);

        const nodes: TableNode[] = targetTables.map((t, idx) => {
          const struct = loadedStructures.find((s) => s.tableName.toLowerCase() === t.name.toLowerCase());
          const colsList = struct?.columns || schemas[tab.profileId]?.columns[columnKey(t.name, t.schema)] || [];
          const fks = struct?.foreignKeys || [];

          // Sort columns: Primary keys first, then foreign keys, then others
          const sortedCols = [...colsList].sort((a, b) => {
            if (a.primaryKey && !b.primaryKey) return -1;
            if (!a.primaryKey && b.primaryKey) return 1;
            const aIsFk = fks.some((f) => f.column.toLowerCase() === a.name.toLowerCase());
            const bIsFk = fks.some((f) => f.column.toLowerCase() === b.name.toLowerCase());
            if (aIsFk && !bIsFk) return -1;
            if (!aIsFk && bIsFk) return 1;
            return 0;
          });

          // Pick shortest column for grid placement
          let chosenCol = 0;
          let minH = colHeights[0];
          for (let c = 1; c < cols; c++) {
            if (colHeights[c] < minH) {
              minH = colHeights[c];
              chosenCol = c;
            }
          }

          const height = HEADER_HEIGHT + Math.min(sortedCols.length, 12) * ROW_HEIGHT + (sortedCols.length > 12 ? 24 : 10);
          const x = 50 + chosenCol * colWidth;
          const y = colHeights[chosenCol];
          colHeights[chosenCol] += height + 50;

          return {
            id: t.name,
            table: t,
            columns: sortedCols,
            foreignKeys: fks,
            x,
            y,
            width: CARD_WIDTH,
            height,
          };
        });

        setTableNodes(nodes);
      } catch (err) {
        console.error('Failed to load ER diagram data', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchAll();
    return () => {
      cancelled = true;
    };
  }, [connected, loadSchema, loadStructure, tab.profileId, tab.schema]);

  // Extract all foreign key relationships between tables
  const relationships = useMemo<Relationship[]>(() => {
    const list: Relationship[] = [];
    for (const node of tableNodes) {
      for (const fk of node.foreignKeys) {
        // Only include if target table exists in diagram
        const target = tableNodes.find((t) => t.table.name.toLowerCase() === fk.refTable.toLowerCase());
        if (target) {
          list.push({
            id: `${node.table.name}:${fk.column}->${fk.refTable}:${fk.refColumn}`,
            sourceTable: node.table.name,
            sourceColumn: fk.column,
            targetTable: fk.refTable,
            targetColumn: fk.refColumn,
            constraintName: fk.name,
          });
        }
      }
    }
    return list;
  }, [tableNodes]);

  // Node Dragging Handlers
  const handleMouseDownNode = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const node = tableNodes.find((n) => n.id === id);
    if (!node) return;
    setDraggingNode({
      id,
      startX: e.clientX,
      startY: e.clientY,
      nodeX: node.x,
      nodeY: node.y,
    });
  };

  // Canvas Pan Handlers
  const handleMouseDownCanvas = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsPanning(true);
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (draggingNode) {
        const dx = (e.clientX - draggingNode.startX) / zoom;
        const dy = (e.clientY - draggingNode.startY) / zoom;
        setTableNodes((prev) =>
          prev.map((n) =>
            n.id === draggingNode.id
              ? { ...n, x: Math.round(draggingNode.nodeX + dx), y: Math.round(draggingNode.nodeY + dy) }
              : n
          )
        );
      } else if (isPanning) {
        setPan({
          x: e.clientX - panStart.x,
          y: e.clientY - panStart.y,
        });
      }
    },
    [draggingNode, isPanning, panStart, zoom]
  );

  const handleMouseUp = useCallback(() => {
    setDraggingNode(null);
    setIsPanning(false);
  }, []);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const zoomFactor = -e.deltaY * 0.002;
      setZoom((z) => Math.min(2.0, Math.max(0.35, z + zoomFactor)));
    } else {
      setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
    }
  };

  const fitToView = () => {
    if (tableNodes.length === 0 || !containerRef.current) return;
    const padding = 60;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const node of tableNodes) {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + node.width);
      maxY = Math.max(maxY, node.y + node.height);
    }

    const boundsWidth = maxX - minX;
    const boundsHeight = maxY - minY;
    const containerWidth = containerRef.current.clientWidth - padding * 2;
    const containerHeight = containerRef.current.clientHeight - padding * 2;

    const scale = Math.min(1.2, Math.max(0.35, Math.min(containerWidth / boundsWidth, containerHeight / boundsHeight)));
    setZoom(scale);
    setPan({
      x: padding + (containerWidth - boundsWidth * scale) / 2 - minX * scale,
      y: padding + (containerHeight - boundsHeight * scale) / 2 - minY * scale,
    });
  };

  const filteredNodes = useMemo(() => {
    if (!search.trim()) return tableNodes;
    const q = search.toLowerCase();
    return tableNodes.filter(
      (n) => n.table.name.toLowerCase().includes(q) || n.columns.some((c) => c.name.toLowerCase().includes(q))
    );
  }, [tableNodes, search]);

  const filteredNodeIds = useMemo(() => new Set(filteredNodes.map((n) => n.id)), [filteredNodes]);

  if (!connected) {
    return (
      <EmptyState
        icon={<Network />}
        title={profile ? `Connect to ${profile.name} to view ER diagram` : 'No database connected'}
        description="Connect to this database profile to visualize tables, columns, and foreign key relationships."
        action={
          profile && (
            <Button size="sm" onClick={() => connectProfile(profile)}>
              Connect
            </Button>
          )
        }
      />
    );
  }

  if (loading) {
    return (
      <div className="flex h-full flex-col p-6 space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-52" />
          <Skeleton className="h-6 w-32" />
        </div>
        <div className="grid grid-cols-3 gap-6 pt-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (tableNodes.length === 0) {
    return (
      <EmptyState
        icon={<Table2 />}
        title={`No ${engineInfo(profile?.engine).terms.tables} found`}
        description={
          tab.schema
            ? `No ${engineInfo(profile?.engine).terms.tables} found in schema "${tab.schema}".`
            : `This database does not contain any ${engineInfo(profile?.engine).terms.tables} yet.`
        }
      />
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-background select-none"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Top Header / Toolbar */}
      <div className="z-20 flex h-9 shrink-0 items-center justify-between border-b border-border bg-chrome/95 px-3 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <Network className="size-4 text-primary" />
          <span className="text-xs font-semibold text-foreground">
            {profile?.name} {tab.schema ? `· ${tab.schema}` : ''}
          </span>
          <Badge variant="outline" className="font-mono text-2xs text-muted-foreground">
            {formatCount(tableNodes.length)} tables · {formatCount(relationships.length)} relationships
          </Badge>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find table or column…"
              className="h-6 w-44 pl-6 text-xxs"
            />
          </div>

          <div className="h-4 w-px bg-border mx-1" />

          <Tooltip content="Zoom out">
            <Button variant="quiet" size="icon-xs" onClick={() => setZoom((z) => Math.max(0.35, z - 0.15))}>
              <ZoomOut className="size-3.5" />
            </Button>
          </Tooltip>
          <span className="w-10 text-center font-mono text-2xs text-muted-foreground tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <Tooltip content="Zoom in">
            <Button variant="quiet" size="icon-xs" onClick={() => setZoom((z) => Math.min(2.0, z + 0.15))}>
              <ZoomIn className="size-3.5" />
            </Button>
          </Tooltip>
          <Tooltip content="Fit to screen">
            <Button variant="quiet" size="icon-xs" onClick={fitToView}>
              <Maximize2 className="size-3.5" />
            </Button>
          </Tooltip>
          <Tooltip content="Reset zoom">
            <Button variant="quiet" size="icon-xs" onClick={() => { setZoom(1); setPan({ x: 40, y: 40 }); }}>
              <RotateCcw className="size-3.5" />
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* Canvas Area with Dot Grid */}
      <div
        className={cn(
          'relative flex-1 overflow-hidden cursor-grab active:cursor-grabbing',
          'bg-[radial-gradient(#80808020_1px,transparent_1px)] [background-size:16px_16px]'
        )}
        onMouseDown={handleMouseDownCanvas}
        onWheel={handleWheel}
      >
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
          }}
          className="absolute inset-0 pointer-events-none transition-none"
        >
          {/* SVG Relationships Layer */}
          <svg className="absolute inset-0 h-[8000px] w-[8000px] overflow-visible pointer-events-none">
            <defs>
              <marker
                id="fk-arrow"
                viewBox="0 0 10 10"
                refX="7"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="currentColor" />
              </marker>
              <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="hsl(var(--primary))" floodOpacity="0.6" />
              </filter>
            </defs>

            {relationships.map((rel) => {
              const source = tableNodes.find((n) => n.table.name.toLowerCase() === rel.sourceTable.toLowerCase());
              const target = tableNodes.find((n) => n.table.name.toLowerCase() === rel.targetTable.toLowerCase());
              if (!source || !target) return null;

              // Find column index for vertical anchor point
              const srcColIdx = Math.max(
                0,
                source.columns.findIndex((c) => c.name.toLowerCase() === rel.sourceColumn.toLowerCase())
              );
              const tgtColIdx = Math.max(
                0,
                target.columns.findIndex((c) => c.name.toLowerCase() === rel.targetColumn.toLowerCase())
              );

              const srcY = source.y + HEADER_HEIGHT + Math.min(srcColIdx, 12) * ROW_HEIGHT + ROW_HEIGHT / 2;
              const tgtY = target.y + HEADER_HEIGHT + Math.min(tgtColIdx, 12) * ROW_HEIGHT + ROW_HEIGHT / 2;

              // Connect from closest side
              let srcX: number;
              let tgtX: number;
              let startCurveX: number;
              let endCurveX: number;

              if (source.x + source.width < target.x) {
                // Source is to the left of target
                srcX = source.x + source.width;
                tgtX = target.x;
                const offset = Math.max(40, (tgtX - srcX) * 0.45);
                startCurveX = srcX + offset;
                endCurveX = tgtX - offset;
              } else if (target.x + target.width < source.x) {
                // Source is to the right of target
                srcX = source.x;
                tgtX = target.x + target.width;
                const offset = Math.max(40, (srcX - tgtX) * 0.45);
                startCurveX = srcX - offset;
                endCurveX = tgtX + offset;
              } else {
                // Vertical alignment: connect right side to right side
                srcX = source.x + source.width;
                tgtX = target.x + target.width;
                const offset = 60;
                startCurveX = Math.max(srcX, tgtX) + offset;
                endCurveX = Math.max(srcX, tgtX) + offset;
              }

              const pathData = `M ${srcX} ${srcY} C ${startCurveX} ${srcY}, ${endCurveX} ${tgtY}, ${tgtX} ${tgtY}`;

              const isHighlighted =
                hoveredRel === rel.id ||
                hoveredTable === rel.sourceTable ||
                hoveredTable === rel.targetTable;

              return (
                <g
                  key={rel.id}
                  className="pointer-events-auto cursor-pointer"
                  onMouseEnter={() => setHoveredRel(rel.id)}
                  onMouseLeave={() => setHoveredRel(null)}
                >
                  {/* Invisible wide hit area for hover */}
                  <path d={pathData} fill="none" stroke="transparent" strokeWidth="14" />
                  {/* Visible Relationship Line */}
                  <path
                    d={pathData}
                    fill="none"
                    stroke={isHighlighted ? 'hsl(var(--primary))' : 'currentColor'}
                    strokeWidth={isHighlighted ? 2.5 : 1.25}
                    strokeDasharray={isHighlighted ? undefined : '4 2'}
                    className={cn(
                      'transition-colors duration-150',
                      isHighlighted ? 'text-primary' : 'text-border opacity-70'
                    )}
                    filter={isHighlighted ? 'url(#glow)' : undefined}
                  />
                  {/* Small endpoints */}
                  <circle cx={srcX} cy={srcY} r={isHighlighted ? 4 : 2.5} className={isHighlighted ? 'fill-primary' : 'fill-muted-foreground'} />
                  <circle cx={tgtX} cy={tgtY} r={isHighlighted ? 4 : 2.5} className={isHighlighted ? 'fill-primary' : 'fill-muted-foreground'} />
                </g>
              );
            })}
          </svg>

          {/* Table Cards Layer */}
          {tableNodes.map((node) => {
            const isMatch = filteredNodeIds.has(node.id);
            const isHovered = hoveredTable === node.table.name;

            return (
              <div
                key={node.id}
                style={{
                  transform: `translate(${node.x}px, ${node.y}px)`,
                  width: node.width,
                }}
                className={cn(
                  'pointer-events-auto absolute left-0 top-0 overflow-hidden rounded-lg border bg-card/95 shadow-md backdrop-blur-sm transition-all duration-100',
                  isHovered ? 'ring-2 ring-primary border-primary shadow-xl z-10' : 'border-border/80',
                  !isMatch && 'opacity-25'
                )}
                onMouseEnter={() => setHoveredTable(node.table.name)}
                onMouseLeave={() => setHoveredTable(null)}
              >
                {/* Table Header (Draggable) */}
                <div
                  onMouseDown={(e) => handleMouseDownNode(e, node.id)}
                  className="group/th flex h-[38px] cursor-move items-center justify-between border-b border-border/70 bg-secondary/50 px-3 transition-colors hover:bg-secondary/80"
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    <Table2 className="size-3.5 shrink-0 text-primary" />
                    <span className="truncate font-mono text-xs font-semibold text-foreground" title={node.table.name}>
                      {node.table.name}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    {node.table.type === 'VIEW' ? (
                      <Badge variant="outline" className="text-[10px] py-0 px-1">VIEW</Badge>
                    ) : node.table.rowCountEstimate !== undefined ? (
                      <span className="text-[10px] tabular-nums text-muted-foreground">
                        ~{formatCount(node.table.rowCountEstimate)}
                      </span>
                    ) : null}

                    <div className="opacity-0 transition-opacity group-hover/th:opacity-100 flex items-center gap-0.5 ml-1">
                      <Tooltip content="View Data">
                        <Button
                          variant="quiet"
                          size="icon-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            openTableData(tab.profileId, node.table);
                          }}
                        >
                          <Rows3 className="size-3" />
                        </Button>
                      </Tooltip>
                      <Tooltip content="Structure">
                        <Button
                          variant="quiet"
                          size="icon-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            openStructure(tab.profileId, node.table);
                          }}
                        >
                          <Layers className="size-3" />
                        </Button>
                      </Tooltip>
                    </div>
                  </div>
                </div>

                {/* Columns List */}
                <div className="divide-y divide-border/30 overflow-hidden">
                  {node.columns.slice(0, 12).map((col) => {
                    const isFk = node.foreignKeys.some((f) => f.column.toLowerCase() === col.name.toLowerCase());
                    const fkDetail = node.foreignKeys.find((f) => f.column.toLowerCase() === col.name.toLowerCase());

                    return (
                      <div
                        key={col.name}
                        className={cn(
                          'flex h-[22px] items-center justify-between px-2.5 text-xxs transition-colors hover:bg-accent/40',
                          col.primaryKey && 'bg-warning/5 font-medium',
                          isFk && 'bg-sky-500/5'
                        )}
                        title={
                          fkDetail
                            ? fkDetail.inferred
                              ? `Likely reference → ${fkDetail.refTable}.${fkDetail.refColumn} (inferred from the field name and ObjectId values)`
                              : `Foreign Key → ${fkDetail.refTable}.${fkDetail.refColumn}`
                            : undefined
                        }
                      >
                        <div className="flex min-w-0 items-center gap-1.5">
                          {col.primaryKey ? (
                            <Key className="size-2.5 shrink-0 text-warning" />
                          ) : isFk ? (
                            <Link2 className="size-2.5 shrink-0 text-sky-500" />
                          ) : (
                            <span className="size-1 rounded-full bg-muted-foreground/40 shrink-0 mx-0.5" />
                          )}
                          <span className={cn('truncate font-mono', col.primaryKey && 'font-semibold text-foreground')}>
                            {col.name}
                          </span>
                        </div>

                        <div className="flex shrink-0 items-center gap-1 pl-2 font-mono text-[10px] text-muted-foreground">
                          <span className="truncate max-w-[85px]">{col.typeName}</span>
                          {col.primaryKey && (
                            <span className="rounded px-0.5 text-[9px] font-semibold text-warning bg-warning/10">PK</span>
                          )}
                          {isFk && (
                            <span className="rounded px-0.5 text-[9px] font-semibold text-sky-500 bg-sky-500/10">FK</span>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {node.columns.length > 12 && (
                    <div className="px-2.5 py-1 text-center font-mono text-[10px] text-muted-foreground bg-secondary/30">
                      +{node.columns.length - 12} more columns
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
