import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, ChevronDown, ChevronRight, Maximize2, Minimize2 } from 'lucide-react';
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type NodeMouseHandler,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/base.css';
import { cn } from '@/utils/cn';
import { isAncestorPath, type JsonPath } from '@/utils/jsonPath/path';
import {
  descendantIds,
  graphNodesWithChildren,
  visibleGraph,
  type JsonGraph,
  type JsonGraphNodeKind,
} from '@/utils/jsonPath/graph';
import { GRAPH_NODE_HEIGHT, GRAPH_NODE_WIDTH, layoutJsonGraph, type GraphLayoutDirection } from '@/utils/jsonPath/layout';

/**
 * Node-kind colour, reused for the left accent stripe on a card and its
 * MiniMap dot — the one place kind→colour is decided. Dev X-Ray's tokens
 * (src/index.css) store raw "R G B" triples, not full colours, so every
 * reference needs the same `rgb(var(--dx-x))` wrapper Tailwind's own config
 * uses — a bare `var(--dx-x)` is not valid CSS on its own here.
 */
const KIND_ACCENT_VAR: Record<JsonGraphNodeKind, string> = {
  root: 'rgb(var(--dx-secondary))',
  object: 'rgb(var(--dx-info))',
  array: 'rgb(var(--dx-success))',
  value: 'rgb(var(--dx-line-strong))',
};

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
  readonly direction: GraphLayoutDirection;
  /** Identical action a mouse click on this node performs — Enter/Space calls this, not a second implementation of the click logic. */
  readonly onActivate: () => void;
  /** Alt+click / Alt+Enter: expand or collapse this node's entire subtree in one action, not just this one node. */
  readonly onActivateRecursive: () => void;
}

type JsonRFNode = Node<JsonNodeData, 'jsonNode'>;

const KIND_DETAIL_CLASS: Record<JsonGraphNodeKind, string> = {
  root: 'text-fg',
  object: 'text-fg-muted',
  array: 'text-fg-muted',
  value: 'text-accent',
};

function JsonFlowNode({ data }: NodeProps<JsonRFNode>) {
  const [targetPos, sourcePos] =
    data.direction === 'vertical' ? [Position.Top, Position.Bottom] : [Position.Left, Position.Right];

  return (
    <div
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        // WAI-ARIA: role="button" must be activatable via Enter and Space,
        // and must do exactly what a click does — not a second, drifting
        // implementation of "what happens when you activate this node". Alt
        // mirrors the mouse's Alt+click for the recursive variant.
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          if (event.altKey) data.onActivateRecursive();
          else data.onActivate();
        }
      }}
      aria-pressed={data.isSelected}
      aria-expanded={data.hasChildren ? !data.isCollapsed : undefined}
      aria-label={
        data.hasChildren
          ? `${data.label || 'root'}: ${data.detail}, ${data.isCollapsed ? 'collapsed' : 'expanded'}. Alt+Enter to ${data.isCollapsed ? 'expand' : 'collapse'} the whole branch.`
          : `${data.label || 'root'}: ${data.detail}`
      }
      title={data.hasChildren ? 'Click to expand/collapse. Alt+click to expand/collapse the whole branch.' : undefined}
      style={{ width: GRAPH_NODE_WIDTH }}
      className={cn(
        'relative flex items-start gap-1 overflow-hidden rounded border py-1.5 pl-3.5 pr-3 shadow-sm transition-colors',
        data.isSelected
          ? 'border-accent bg-accent-soft'
          : 'border-line bg-surface hover:border-line-strong hover:bg-surface-raised',
      )}
    >
      {/* Kind stripe: the fastest way to tell root/object/array/value apart at a glance, especially once a graph has dozens of cards. */}
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-1"
        style={{ backgroundColor: KIND_ACCENT_VAR[data.kind] }}
      />
      <Handle type="target" position={targetPos} className="!opacity-0" />
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
      <Handle type="source" position={sourcePos} className="!opacity-0" />
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
  const containerRef = useRef<HTMLDivElement>(null);
  const rfInstance = useRef<ReactFlowInstance<JsonRFNode, Edge> | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [direction, setDirection] = useState<GraphLayoutDirection>('vertical');

  // Collapsed-by-the-user containers. Starts empty (everything shown), same
  // default as Tree's "expand all". Lives here, not in JSONTab: it's this
  // view's own display state, not part of the document-derived graph model.
  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<string>>(new Set());

  // "Where it happened" — an auto-pan effect further down reacts to this
  // changing. Wrapped in a fresh object on every call (not stored as a bare
  // id) so toggling the *same* node twice in a row still re-triggers the
  // pan — React bails out of a state update, and thus the effect, when a
  // primitive is set to the value it already held. Declared here (before
  // activateNode/activateNodeRecursive) since both set it directly on a
  // container toggle; a leaf selection sets it via the `selectedId` sync
  // effect below instead, since that's driven externally.
  const [focus, setFocus] = useState<{ readonly id: string } | null>(null);
  const focusNode = useCallback((id: string) => setFocus({ id }), []);

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
  const positions = useMemo(() => layoutJsonGraph(visible, direction), [visible, direction]);

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
        focusNode(nodeId);
      } else {
        onSelectNode(path);
      }
    },
    [withChildren, onSelectNode, focusNode],
  );

  // Alt+click / Alt+Enter variant: expand or collapse a node's whole subtree
  // in one action instead of one level per click. Direction follows the
  // node's own current state — collapsed opens everything beneath it,
  // expanded closes everything beneath it (so re-expanding it later starts
  // from fully collapsed again, not wherever nested toggles happened to be).
  const activateNodeRecursive = useCallback(
    (nodeId: string) => {
      if (!withChildren.has(nodeId)) return;
      const below = descendantIds(graph, nodeId);
      setCollapsedIds((prev) => {
        const next = new Set(prev);
        if (next.has(nodeId)) {
          next.delete(nodeId);
          for (const id of below) next.delete(id);
        } else {
          next.add(nodeId);
          for (const id of below) {
            if (withChildren.has(id)) next.add(id);
          }
        }
        return next;
      });
      focusNode(nodeId);
    },
    [graph, withChildren, focusNode],
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
          direction,
          onActivate: () => activateNode(node.id, node.path),
          onActivateRecursive: () => activateNodeRecursive(node.id),
        },
        draggable: false,
        connectable: false,
      })),
    [visible.nodes, positions, selectedId, withChildren, collapsedIds, direction, activateNode, activateNodeRecursive],
  );

  // Edges touching the selected node pick up the accent colour too, so the
  // path from wherever you are back toward the root reads at a glance instead
  // of blending into the rest of the graph's neutral lines.
  const edges = useMemo<Edge[]>(
    () =>
      visible.edges.map((edge) => {
        const isNearSelection = selectedId !== null && (edge.source === selectedId || edge.target === selectedId);
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: 'smoothstep',
          style: {
            stroke: isNearSelection ? 'rgb(var(--dx-accent))' : 'rgb(var(--dx-line-strong))',
            strokeWidth: isNearSelection ? 2.5 : 1.5,
          },
        };
      }),
    [visible.edges, selectedId],
  );

  const handleNodeClick = useCallback<NodeMouseHandler<JsonRFNode>>(
    (event, node) => {
      if (event.altKey) activateNodeRecursive(node.id);
      else activateNode(node.id, node.data.path);
    },
    [activateNode, activateNodeRecursive],
  );

  // Read fresh positions/visible-edges from refs in the focus effect below,
  // instead of listing them as its deps: those are recomputed on every
  // layout change anywhere in the graph, and depending on them directly
  // would re-fire the pan on unrelated toggles far away — fine for "did the
  // selection move", wrong for "did I just interact with this node". Keying
  // the effect on `focus` alone fires exactly once per interaction.
  const positionsRef = useRef(positions);
  positionsRef.current = positions;
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  useEffect(() => {
    if (selectedId !== null) focusNode(selectedId);
  }, [selectedId, focusNode]);

  useEffect(() => {
    if (focus === null) return;
    const focusId = focus.id;
    const instance = rfInstance.current;
    const target = positionsRef.current.get(focusId);
    if (!instance || !target) return;

    // Expanding (single-level or, via Alt+click, the whole subtree at once)
    // reveals descendants that can land off-screen; frame the node together
    // with whatever it just revealed — `visibleRef` already reflects the
    // post-toggle graph, so only descendants actually still visible (i.e.
    // exactly the newly-revealed ones for a single-level expand, or the
    // whole subtree for a recursive one) end up in the shot. Collapsing (or
    // a leaf select) leaves nothing extra visible, so centering on the node
    // itself is the whole story.
    const visibleIds = new Set(visibleRef.current.nodes.map((node) => node.id));
    const revealed = [...descendantIds(graph, focusId)].filter((id) => visibleIds.has(id));
    if (revealed.length > 0) {
      const framed = [focusId, ...revealed].filter((id) => positionsRef.current.has(id));
      instance.fitView({ nodes: framed.map((id) => ({ id })), padding: 0.35, duration: 350, maxZoom: 1.1 });
    } else {
      instance.setCenter(target.x + GRAPH_NODE_WIDTH / 2, target.y + GRAPH_NODE_HEIGHT / 2, {
        zoom: Math.max(instance.getZoom(), 0.85),
        duration: 350,
      });
    }
  }, [focus, graph]);

  // Switching axis reshuffles every coordinate at once — reframe the whole
  // graph rather than leaving the viewport centered on where the old layout
  // used to put things.
  useEffect(() => {
    rfInstance.current?.fitView({ padding: 0.2, duration: 350 });
  }, [direction]);

  useEffect(() => {
    const handleChange = () => setIsFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener('fullscreenchange', handleChange);
    return () => document.removeEventListener('fullscreenchange', handleChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void containerRef.current?.requestFullscreen();
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative h-full min-h-0 flex-1 [&:fullscreen]:h-screen [&:fullscreen]:w-screen [&:fullscreen]:bg-canvas"
      role="group"
      aria-label="JSON structure graph"
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodeClick={handleNodeClick}
        onInit={(instance) => {
          rfInstance.current = instance;
        }}
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
        {graph.nodes.length > 20 && (
          <MiniMap<JsonRFNode>
            nodeColor={(node) => KIND_ACCENT_VAR[node.data.kind]}
            nodeStrokeWidth={0}
            maskColor="rgb(var(--dx-overlay) / 0.15)"
            className="!border !border-line !bg-surface"
            pannable
            zoomable
          />
        )}
        <Panel position="top-left">
          <div
            className="flex overflow-hidden rounded border border-line bg-surface shadow-sm"
            role="group"
            aria-label="Layout direction"
          >
            <button
              type="button"
              onClick={() => setDirection('vertical')}
              aria-pressed={direction === 'vertical'}
              aria-label="Top-down layout"
              title="Top-down layout"
              className={cn(
                'flex h-7 w-7 items-center justify-center',
                direction === 'vertical' ? 'bg-accent text-accent-on' : 'text-fg-muted hover:bg-surface-raised hover:text-fg',
              )}
            >
              <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setDirection('horizontal')}
              aria-pressed={direction === 'horizontal'}
              aria-label="Left-to-right layout"
              title="Left-to-right layout"
              className={cn(
                'flex h-7 w-7 items-center justify-center border-l border-line',
                direction === 'horizontal' ? 'bg-accent text-accent-on' : 'text-fg-muted hover:bg-surface-raised hover:text-fg',
              )}
            >
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </Panel>
        {typeof document !== 'undefined' && document.fullscreenEnabled && (
          <Panel position="top-right">
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? 'Exit full screen' : 'View graph full screen'}
              title={isFullscreen ? 'Exit full screen' : 'View graph full screen'}
              className="flex h-7 w-7 items-center justify-center rounded border border-line bg-surface text-fg shadow-sm hover:bg-surface-raised"
            >
              {isFullscreen ? (
                <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </button>
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}
