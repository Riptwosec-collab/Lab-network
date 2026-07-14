"use client";

import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from "@xyflow/react";

import type { NetworkFlowEdge } from "@/types/network";

export function NetworkEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  data,
  selected,
}: EdgeProps<NetworkFlowEdge>) {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 16,
  });
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke:
            data?.status === "down" || data?.status === "administratively-down"
              ? "var(--link-down)"
              : data?.status === "degraded"
                ? "var(--warning)"
                : "var(--link-active)",
          strokeWidth: selected ? 3 : 2,
          strokeDasharray:
            data?.status === "down" || data?.status === "administratively-down"
              ? "7 6"
              : data?.pathStyle === "logical" || data?.pathStyle === "tunnel"
                ? "4 5"
                : data?.pathStyle === "wireless" || data?.status === "degraded"
                  ? "2 5"
                  : undefined,
        }}
      />
      <EdgeLabelRenderer>
        <span
          className="nodrag nopan border-border bg-background text-muted-foreground absolute rounded-full border px-2 py-0.5 font-mono text-[9px]"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
        >
          <span
            className={
              data?.status === "down" || data?.status === "administratively-down"
                ? "text-destructive"
                : data?.status === "degraded"
                  ? "text-warning"
                  : "text-success"
            }
          >
            {data?.status?.toUpperCase() ?? "UP"}
          </span>{" "}
          · {data?.bandwidthMbps ?? 1000}M · {data?.cableType ?? "copper"}
        </span>
      </EdgeLabelRenderer>
    </>
  );
}
