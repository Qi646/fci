"use client";

import { useEffect, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Edge,
  MarkerType,
  Node,
  Panel,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from "reactflow";
import "reactflow/dist/style.css";

type DepartmentRecord = {
  id: string;
  label: string;
  datasets: number;
  tier: string;
  color: string;
  position: { x: number; y: number };
};

type DepartmentNodeData = DepartmentRecord & {
  active?: boolean;
  role?: "Source" | "Target";
};

type FederationNodeData = {
  label: string;
  sub: string;
  queryCount: number;
  routeLabel: string;
  purpose: string;
  accent: string;
};

type QueryScenario = {
  from: DepartmentRecord["id"];
  to: DepartmentRecord["id"];
  label: string;
  purpose: string;
  accent: string;
};

type RouteEvent = {
  id: number;
  label: string;
  path: string;
  accent: string;
  purpose: string;
};

const DEPARTMENTS: DepartmentRecord[] = [
  {
    id: "engineering",
    label: "Engineering",
    datasets: 1,
    tier: "Internal",
    color: "#7c3aed",
    position: { x: 60, y: 70 },
  },
  {
    id: "planning",
    label: "Planning",
    datasets: 2,
    tier: "Personal Sensitive",
    color: "#d97706",
    position: { x: 350, y: 70 },
  },
  {
    id: "public_health",
    label: "Public Health",
    datasets: 1,
    tier: "Health Sensitive",
    color: "#dc2626",
    position: { x: 640, y: 70 },
  },
  {
    id: "transit",
    label: "Transit",
    datasets: 1,
    tier: "Open",
    color: "#059669",
    position: { x: 60, y: 420 },
  },
  {
    id: "social_services",
    label: "Social Services",
    datasets: 1,
    tier: "Confidential",
    color: "#6366f1",
    position: { x: 350, y: 420 },
  },
  {
    id: "climate",
    label: "Climate",
    datasets: 1,
    tier: "Open",
    color: "#0891b2",
    position: { x: 640, y: 420 },
  },
];

const QUERY_SCENARIOS: QueryScenario[] = [
  {
    from: "engineering",
    to: "planning",
    label: "Pressure surge fused with permit demand",
    purpose: "Capital planning",
    accent: "#7c3aed",
  },
  {
    from: "planning",
    to: "social_services",
    label: "Housing placement demand check",
    purpose: "Service planning",
    accent: "#d97706",
  },
  {
    from: "public_health",
    to: "climate",
    label: "Heat-risk vulnerability sweep",
    purpose: "Climate resilience",
    accent: "#dc2626",
  },
  {
    from: "transit",
    to: "planning",
    label: "Station-area growth model",
    purpose: "Public information",
    accent: "#059669",
  },
  {
    from: "social_services",
    to: "public_health",
    label: "Outreach demand escalation",
    purpose: "Service delivery",
    accent: "#6366f1",
  },
  {
    from: "climate",
    to: "engineering",
    label: "Flood corridor mitigation queue",
    purpose: "Infrastructure operations",
    accent: "#0891b2",
  },
];

const FEDERATION_NODE = {
  id: "federation",
  label: "Federation Layer",
  sub: "Access control, audit, joins",
};

const INITIAL_QUERY_COUNT = 8;

const DEPARTMENT_LOOKUP = Object.fromEntries(
  DEPARTMENTS.map((department) => [department.id, department])
) as Record<string, DepartmentRecord>;

function buildRouteEvent(count: number, scenario: QueryScenario): RouteEvent {
  const from = DEPARTMENT_LOOKUP[scenario.from];
  const to = DEPARTMENT_LOOKUP[scenario.to];

  return {
    id: count,
    label: scenario.label,
    purpose: scenario.purpose,
    accent: scenario.accent,
    path: `${from.label} -> Federation -> ${to.label}`,
  };
}

function idleEdgeStyle(color: string) {
  return {
    stroke: `${color}22`,
    strokeWidth: 2.25,
    opacity: 0.6,
    strokeDasharray: "4 16",
    strokeLinecap: "round" as const,
    transition: "stroke 240ms ease, stroke-width 240ms ease, opacity 240ms ease, filter 240ms ease",
  };
}

function activeEdgeStyle(color: string) {
  return {
    stroke: color,
    strokeWidth: 5,
    opacity: 1,
    strokeDasharray: "12 10",
    strokeLinecap: "round" as const,
    filter: `drop-shadow(0 0 6px ${color}66)`,
    transition: "stroke 240ms ease, stroke-width 240ms ease, opacity 240ms ease, filter 240ms ease",
  };
}

function DepartmentNode({ data }: { data: DepartmentNodeData }) {
  const active = Boolean(data.active);

  return (
    <div
      style={{
        position: "relative",
        padding: "16px 18px 14px",
        minWidth: 180,
        borderRadius: 4,
        border: `1px solid ${active ? data.color : `${data.color}33`}`,
        background: active
          ? `linear-gradient(180deg, ${data.color}12 0%, #ffffff 70%)`
          : "#ffffff",
        boxShadow: active
          ? `0 0 20px ${data.color}22, 0 2px 8px rgba(0,0,0,0.06)`
          : `0 2px 8px rgba(0,0,0,0.04)`,
        transform: active ? "translateY(-6px) scale(1.02)" : "translateY(0) scale(1)",
        transition: "transform 220ms ease, box-shadow 220ms ease, border-color 220ms ease, background 220ms ease",
        animation: active ? "pulse-glow 1.8s ease-in-out infinite" : undefined,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 10,
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.2em",
            textTransform: "uppercase" as const,
            color: data.color,
          }}
        >
          Department
        </div>
        {active ? (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              minHeight: 20,
              padding: "0 8px",
              borderRadius: 999,
              border: `1px solid ${data.color}66`,
              background: `${data.color}18`,
              color: data.color,
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.16em",
              textTransform: "uppercase" as const,
            }}
          >
            {data.role}
          </span>
        ) : null}
      </div>

      <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a2e", marginBottom: 8 }}>
        {data.label}
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: active ? 10 : 0 }}>
        <span
          style={{
            padding: "2px 8px",
            border: `1px solid ${data.color}33`,
            borderRadius: 2,
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            fontWeight: 600,
            color: data.color,
          }}
        >
          {data.datasets} dataset{data.datasets !== 1 ? "s" : ""}
        </span>
        <span
          style={{
            padding: "2px 8px",
            border: "1px solid rgba(124,58,237,0.12)",
            borderRadius: 2,
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            fontWeight: 600,
            color: "#8888a0",
          }}
        >
          {data.tier}
        </span>
      </div>

      {active ? (
        <div
          style={{
            display: "grid",
            gap: 4,
            paddingTop: 10,
            borderTop: `1px solid ${data.color}22`,
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.16em",
              textTransform: "uppercase" as const,
              color: data.color,
            }}
          >
            Link state
          </div>
          <div style={{ fontSize: 11, color: "#4a4a5e" }}>
            {data.role === "Source" ? "Streaming a cross-department request" : "Receiving a governed data join"}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FederationNode({ data }: { data: FederationNodeData }) {
  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        padding: "22px 28px 20px",
        minWidth: 260,
        borderRadius: 6,
        textAlign: "center" as const,
        background: `linear-gradient(180deg, ${data.accent}08, #ffffff)`,
        border: `1px solid ${data.accent}33`,
        boxShadow: `0 0 24px ${data.accent}15, 0 4px 16px rgba(0,0,0,0.06)`,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: "0 auto auto 0",
          width: "100%",
          height: 3,
          background: `linear-gradient(90deg, transparent, ${data.accent}, transparent)`,
          opacity: 0.9,
          animation: "shimmer 3s linear infinite",
          backgroundSize: "200% 100%",
        }}
      />

      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.2em",
          textTransform: "uppercase" as const,
          color: data.accent,
          marginBottom: 8,
        }}
      >
        Core
      </div>

      <div style={{ fontSize: 18, fontWeight: 700, color: "#1a1a2e", marginBottom: 6 }}>
        {data.label}
      </div>

      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "#8888a0",
          marginBottom: 12,
        }}
      >
        {data.sub}
      </div>

      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 30,
          fontWeight: 700,
          color: "#1a1a2e",
          lineHeight: 1,
        }}
      >
        {data.queryCount}
      </div>

      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase" as const,
          color: "#8888a0",
          marginTop: 6,
          marginBottom: 14,
        }}
      >
        Cross-dept queries
      </div>

      <div
        style={{
          display: "grid",
          gap: 6,
          padding: "12px 14px",
          borderRadius: 4,
          border: `1px solid ${data.accent}33`,
          background: "rgba(124, 58, 237, 0.04)",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.16em",
            textTransform: "uppercase" as const,
            color: data.accent,
          }}
        >
          Active route
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#F2F6FA" }}>{data.routeLabel}</div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "#8888a0",
          }}
        >
          {data.purpose}
        </div>
      </div>
    </div>
  );
}

const nodeTypes = {
  department: DepartmentNode,
  federation: FederationNode,
};

const baseNodes: Node[] = [
  ...DEPARTMENTS.map((department) => ({
    id: department.id,
    type: "department",
    position: department.position,
    data: department,
    sourcePosition: department.position.y < 200 ? Position.Bottom : Position.Top,
    targetPosition: department.position.y < 200 ? Position.Bottom : Position.Top,
  })),
  {
    id: "federation",
    type: "federation",
    position: { x: 330, y: 235 },
    data: {
      ...FEDERATION_NODE,
      queryCount: INITIAL_QUERY_COUNT,
      routeLabel: QUERY_SCENARIOS[0].label,
      purpose: QUERY_SCENARIOS[0].purpose,
      accent: QUERY_SCENARIOS[0].accent,
    },
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
  },
];

const baseEdges: Edge[] = DEPARTMENTS.map((department) => ({
  id: `${department.id}-federation`,
  source: department.id,
  target: "federation",
  type: "smoothstep",
  animated: false,
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 16,
    height: 16,
    color: `${department.color}66`,
  },
  style: idleEdgeStyle(department.color),
}));

function decorateNodes(nodes: Node[], scenario: QueryScenario, queryCount: number): Node[] {
  return nodes.map((node) => {
    if (node.id === "federation") {
      return {
        ...node,
        data: {
          ...FEDERATION_NODE,
          queryCount,
          routeLabel: scenario.label,
          purpose: scenario.purpose,
          accent: scenario.accent,
        },
      };
    }

    const department = DEPARTMENT_LOOKUP[node.id];
    if (!department) {
      return node;
    }

    const isSource = node.id === scenario.from;
    const isTarget = node.id === scenario.to;

    return {
      ...node,
      data: {
        ...department,
        active: isSource || isTarget,
        role: isSource ? "Source" : isTarget ? "Target" : undefined,
      },
    };
  });
}

function decorateEdges(edges: Edge[], scenario: QueryScenario): Edge[] {
  return edges.map((edge) => {
    const departmentId = edge.id.replace(/-federation$/, "");
    const department = DEPARTMENT_LOOKUP[departmentId];
    const active = departmentId === scenario.from || departmentId === scenario.to;

    return {
      ...edge,
      animated: active,
      className: active ? "topologyEdge topologyEdgeActive" : "topologyEdge",
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: active ? 20 : 16,
        height: active ? 20 : 16,
        color: active ? department.color : `${department.color}66`,
      },
      style: active ? activeEdgeStyle(department.color) : idleEdgeStyle(department.color),
      zIndex: active ? 10 : 1,
    };
  });
}

export default function TopologyDiagram() {
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [queryCount, setQueryCount] = useState(INITIAL_QUERY_COUNT);
  const [recentEvents, setRecentEvents] = useState<RouteEvent[]>([
    buildRouteEvent(INITIAL_QUERY_COUNT, QUERY_SCENARIOS[0]),
  ]);
  const [nodes, setNodes, onNodesChange] = useNodesState(
    decorateNodes(baseNodes, QUERY_SCENARIOS[0], INITIAL_QUERY_COUNT)
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    decorateEdges(baseEdges, QUERY_SCENARIOS[0])
  );

  const activeScenario = QUERY_SCENARIOS[scenarioIndex];
  const currentRoute = buildRouteEvent(queryCount, activeScenario);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setScenarioIndex((current) => {
        const next = (current + 1) % QUERY_SCENARIOS.length;
        setQueryCount((count) => {
          const nextCount = count + 1;
          setRecentEvents((events) => [buildRouteEvent(nextCount, QUERY_SCENARIOS[next]), ...events].slice(0, 4));
          return nextCount;
        });
        return next;
      });
    }, 2400);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    setNodes((current) => decorateNodes(current, activeScenario, queryCount));
    setEdges((current) => decorateEdges(current, activeScenario));
  }, [activeScenario, queryCount, setEdges, setNodes]);

  return (
    <div
      style={{
        position: "relative",
        height: "100%",
        overflow: "hidden",
        background: "var(--bg)",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: `radial-gradient(circle at 50% 52%, ${activeScenario.accent}0a 0%, transparent 22%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 360,
          height: 360,
          transform: "translate(-50%, -50%)",
          borderRadius: "50%",
          border: `1px solid ${activeScenario.accent}22`,
          boxShadow: `0 0 90px ${activeScenario.accent}22`,
          animation: "pulse-glow 2.4s ease-in-out infinite",
          opacity: 0.9,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 220,
          height: 220,
          transform: "translate(-50%, -50%)",
          borderRadius: "50%",
          border: `1px solid ${activeScenario.accent}33`,
          boxShadow: `inset 0 0 40px ${activeScenario.accent}14`,
          animation: "pulse-glow 1.8s ease-in-out infinite",
          pointerEvents: "none",
        }}
      />

      <ReactFlow
        className="topologyFlow"
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        proOptions={{ hideAttribution: true }}
        style={{ background: "transparent" }}
        nodesDraggable
        nodesConnectable={false}
        zoomOnScroll={false}
        panOnDrag
        panOnScroll
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={28}
          size={1.2}
          color="rgba(124, 58, 237, 0.08)"
        />

        <Panel position="top-left">
          <div
            style={{
              minWidth: 320,
              padding: "14px 16px",
              borderRadius: 6,
              border: `1px solid ${activeScenario.accent}33`,
              background: "rgba(255, 255, 255, 0.95)",
              boxShadow: "0 4px 24px rgba(0, 0, 0, 0.08)",
              backdropFilter: "blur(14px)",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.2em",
                textTransform: "uppercase" as const,
                color: "#7F93A8",
                marginBottom: 10,
              }}
            >
              Live federation traffic
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase" as const,
                  color: activeScenario.accent,
                }}
              >
                Q-{String(queryCount).padStart(3, "0")}
              </div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  minHeight: 22,
                  padding: "0 10px",
                  borderRadius: 999,
                  border: `1px solid ${activeScenario.accent}55`,
                  background: `${activeScenario.accent}18`,
                  color: activeScenario.accent,
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase" as const,
                }}
              >
                Route active
              </div>
            </div>
            <div style={{ fontSize: 24, lineHeight: 1.05, fontWeight: 700, color: "#F5FBFF", marginBottom: 8 }}>
              {currentRoute.label}
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "#9DB1C5",
                marginBottom: 10,
              }}
            >
              {currentRoute.path}
            </div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                minHeight: 24,
                padding: "0 10px",
                borderRadius: 999,
                border: "1px solid rgba(124,58,237,0.12)",
                background: "rgba(124,58,237,0.04)",
                color: "#C9D7E4",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {currentRoute.purpose}
            </div>
          </div>
        </Panel>

        <Panel position="bottom-right">
          <div
            style={{
              width: 320,
              display: "grid",
              gap: 10,
              padding: "14px",
              borderRadius: 6,
              border: "1px solid rgba(124, 58, 237, 0.12)",
              background: "rgba(255, 255, 255, 0.95)",
              boxShadow: "0 4px 24px rgba(0, 0, 0, 0.08)",
              backdropFilter: "blur(14px)",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.2em",
                textTransform: "uppercase" as const,
                color: "#7F93A8",
              }}
            >
              Recent federation events
            </div>
            {recentEvents.map((event) => (
              <div
                key={event.id}
                style={{
                  display: "grid",
                  gap: 6,
                  padding: "10px 12px",
                  borderRadius: 4,
                  border: `1px solid ${event.accent}22`,
                  background: "rgba(124, 58, 237, 0.03)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.16em",
                      textTransform: "uppercase" as const,
                      color: event.accent,
                    }}
                  >
                    Q-{String(event.id).padStart(3, "0")}
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      color: "#8888a0",
                    }}
                  >
                    {event.purpose}
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#F2F6FA" }}>{event.label}</div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: "#8888a0",
                  }}
                >
                  {event.path}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </ReactFlow>

      <style jsx global>{`
        .topologyFlow .react-flow__edge-path {
          transition: stroke 240ms ease, stroke-width 240ms ease, opacity 240ms ease, filter 240ms ease;
        }

        .topologyFlow .react-flow__edge.topologyEdgeActive .react-flow__edge-path {
          stroke-linecap: round;
        }

        .topologyFlow .react-flow__pane {
          cursor: crosshair;
        }
      `}</style>
    </div>
  );
}
