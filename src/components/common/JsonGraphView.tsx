import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/base.css';
import { cn } from '@/utils/cn';
import { isAncestorPath, type JsonPath } from '@/utils/jsonPath/path';
import { graphNodesWithChildren, visibleGraph, type JsonGraph, type JsonGraphNodeKind } from '@/utils/jsonPath/graph';
import { GRAPH_NODE_WIDTH, layoutJsonGraph } from '@/utils/jsonPath/layout';

/**
 * React Flow lives only in this file, imported dynamically by JSONTab — see
 * the `lazy()` call there. Nothing here is reachable from the app's initial
 * bundle. Only `base.css` (structural: transforms, pan/zoom, handles) is
 * imported, not React Flow's full default theme — node/edge/control colors
 * below are Dev X-Ray's own tokens via Tailwind classes and CSS vars, so
 * Graph looks like the rest of the app in both Clay and Grass.
 */

interface JsonNodeData extends Record<string, unknown> {
  readonly label: string;
  readonly detail: string;
  readonly kind: JsonGraphNodeKind;
  readonly path: JsonPath;
  readonly isSelected: boolean;
  readonly hasChildren: boolean;
  readonly isCollapsed: boolean;
  /** Identical action a mouse click on this node performs — Enter/Space calls this, not a second implementation of the click logic. */
  readonly onActivate: () => void;
}

type JsonRFNode = Node<JsonNodeData, 'jsonNode'>;

const KIND_DETAIL_CLASS: Record<JsonGraphNodeKind, string> = {
  root: 'text-fg',
  object: 'text-fg-muted',
  array: 'text-fg-muted',
  value: 'text-accent',
};

function JsonFlowNode({ data }: NodeProps<JsonRFNode>) {
  return (
    <div
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        // WAI-ARIA: role="button" must be activatable via Enter and Space,
        // and must do exactly what a click does — not a second, drifting
        // implementation of "what happens when you activate this node".
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          data.onActivate();
        }
      }}
      aria-pressed={data.isSelected}
      aria-expanded={data.hasChildren ? !data.isCollapsed : undefined}
      aria-label={
        data.hasChildren
          ? `${data.label || 'root'}: ${data.detail}, ${data.isCollapsed ? 'collapsed' : 'expanded'}`
          : `${data.label || 'root'}: ${data.detail}`
      }
      style={{ width: GRAPH_NODE_WIDTH }}
      className={cn(
        'flex items-start gap-1 rounded border px-3 py-1.5 shadow-sm',
        data.isSelected ? 'border-accent bg-accent-soft' : 'border-line bg-surface',
      )}
    >
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      {data.hasChildren &&
        (data.isCollapsed ? (
          <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-fg-subtle" aria-hidden="true" />
        ) : (
          <ChevronDown className="mt-0.5 h-3 w-3 shrink-0 text-fg-subtle" aria-hidden="true" />
        ))}
      <div className="min-w-0 flex-1">
        {data.label !== '' && (
          <div className="truncate font-mono text-[10px] uppercase tracking-wide text-fg-subtle">{data.label}</div>
        )}
        <div className={cn('truncate font-mono text-xs', KIND_DETAIL_CLASS[data.kind])}>{data.detail}</div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
    </div>
  );
}

const NODE_TYPES = { jsonNode: JsonFlowNode };

interface JsonGraphViewProps {
  graph: JsonGraph;
  selectedId: string | null;
  /** Only ever called for a leaf (no-children) node — see the click handler below. */
  onSelectNode: (path: JsonPath) => void;
}

export function JsonGraphView({ graph, selectedId, onSelectNode }: JsonGraphViewProps) {
  const nodesById = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph.nodes]);
  const withChildren = useMemo(() => graphNodesWithChildren(graph), [graph]);

  // Collapsed-by-the-user containers. Starts empty (everything shown), same
  // default as Tree's "expand all". Lives here, not in JSONTab: it's this
  // view's own display state, not part of the document-derived graph model.
  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<string>>(new Set());

  // Mirrors Tree's ancestor-auto-expand: a node selected from search or Tree
  // must actually be reachable here, so open anything collapsed on its way.
  useEffect(() => {
    if (selectedId === null) return;
    const selectedNode = nodesById.get(selectedId);
    if (!selectedNode) return;
    setCollapsedIds((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set(prev);
      let changed = false;
      for (const id of prev) {
        const candidate = nodesById.get(id);
        if (candidate && isAncestorPath(candidate.path, selectedNode.path)) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [selectedId, nodesById]);

  // Visible-subset + layout are recomputed on collapse (bounded by the same
  // graph-node ceiling as the full graph), never a re-walk of the document —
  // buildJsonGraph itself stays memoized on the document alone, in JSONTab.
  const visible = useMemo(() => visibleGraph(graph, collapsedIds), [graph, collapsedIds]);
  const positions = useMemo(() => layoutJsonGraph(visible), [visible]);

  // A node with children only ever toggles collapse — selecting (and, in the
  // JSON tool, copying) on every expand/collapse was noisy, the same reason
  // Tree's container click no longer selects either. A leaf still selects.
  // This is the one place that decision is made — mouse click and keyboard
  // activation (JsonFlowNode's onKeyDown, via data.onActivate) both call it.
  const activateNode = useCallback(
    (nodeId: string, path: JsonPath) => {
      if (withChildren.has(nodeId)) {
        setCollapsedIds((prev) => {
          const next = new Set(prev);
          if (next.has(nodeId)) next.delete(nodeId);
          else next.add(nodeId);
          return next;
        });
      } else {
        onSelectNode(path);
      }
    },
    [withChildren, onSelectNode],
  );

  const nodes = useMemo<JsonRFNode[]>(
    () =>
      visible.nodes.map((node) => ({
        id: node.id,
        type: 'jsonNode',
        position: positions.get(node.id) ?? { x: 0, y: 0 },
        data: {
          label: node.label,
          detail: node.detail,
          kind: node.kind,
          path: node.path,
          isSelected: node.id === selectedId,
          hasChildren: withChildren.has(node.id),
          isCollapsed: collapsedIds.has(node.id),
          onActivate: () => activateNode(node.id, node.path),
        },
        draggable: false,
        connectable: false,
      })),
    [visible.nodes, positions, selectedId, withChildren, collapsedIds, activateNode],
  );

  const edges = useMemo<Edge[]>(
    () =>
      visible.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'smoothstep',
        style: { stroke: 'rgb(var(--dx-line-strong))', strokeWidth: 1.5 },
      })),
    [visible.edges],
  );

  const handleNodeClick = useCallback<NodeMouseHandler<JsonRFNode>>(
    (_event, node) => activateNode(node.id, node.data.path),
    [activateNode],
  );

  return (
    <div className="relative h-full min-h-0 flex-1" role="group" aria-label="JSON structure graph">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodeClick={handleNodeClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
      >
        <Background color="rgb(var(--dx-line-strong))" gap={24} size={1} />
        <Controls
          className="!border !border-line !bg-surface !shadow-sm [&_button]:!border-line [&_button]:!bg-surface [&_button]:!fill-fg [&_button]:!text-fg hover:[&_button]:!bg-surface-raised"
          showInteractive={false}
        />
      </ReactFlow>
    </div>
  );
}
