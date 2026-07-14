"use client";

import { useCallback, useEffect, useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  SelectionMode,
  type Connection,
  type EdgeMouseHandler,
  type NodeMouseHandler,
  useReactFlow,
} from "@xyflow/react";
import { nanoid } from "nanoid";

import { NetworkEdge } from "@/components/connections/network-edge";
import { DeviceNode } from "@/components/devices/device-node";
import { deviceRegistry } from "@/data/device-catalog";
import { useTopologyStore } from "@/stores/topology-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { NetworkConnection, NetworkFlowEdge, NetworkFlowNode } from "@/types/network";

const nodeTypes = { device: DeviceNode };
const edgeTypes = { network: NetworkEdge };

export function NetworkCanvas() {
  const devices = useTopologyStore((state) => state.devices);
  const connections = useTopologyStore((state) => state.connections);
  const selectedDeviceId = useTopologyStore((state) => state.selectedDeviceId);
  const selectedConnectionId = useTopologyStore((state) => state.selectedConnectionId);
  const addDevice = useTopologyStore((state) => state.addDevice);
  const moveDevice = useTopologyStore((state) => state.moveDevice);
  const addConnection = useTopologyStore((state) => state.addConnection);
  const selectDevice = useTopologyStore((state) => state.selectDevice);
  const selectConnection = useTopologyStore((state) => state.selectConnection);
  const { screenToFlowPosition, fitView } = useReactFlow();
  const activeTool = useWorkspaceStore((state) => state.activeTool);
  const setInspectorOpen = useWorkspaceStore((state) => state.setInspectorOpen);

  const nodes = useMemo<NetworkFlowNode[]>(
    () =>
      devices.map((device) => ({
        id: device.id,
        type: "device",
        position: device.position,
        data: { deviceId: device.id },
        selected: device.id === selectedDeviceId,
        draggable: !device.locked && activeTool === "select",
        connectable: activeTool === "connect",
      })),
    [activeTool, devices, selectedDeviceId],
  );
  const edges = useMemo<NetworkFlowEdge[]>(
    () =>
      connections.map((connection) => ({
        id: connection.id,
        type: "network",
        source: connection.sourceDeviceId,
        target: connection.targetDeviceId,
        data: connection,
        selected: connection.id === selectedConnectionId,
      })),
    [connections, selectedConnectionId],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const now = new Date().toISOString();
      const networkConnection: NetworkConnection = {
        id: nanoid(),
        sourceDeviceId: connection.source,
        sourceInterfaceId: connection.sourceHandle ?? undefined,
        targetDeviceId: connection.target,
        targetInterfaceId: connection.targetHandle ?? undefined,
        cableType: "copper",
        status: "up",
        bandwidthMbps: 1000,
        latencyMs: 1,
        jitterMs: 0,
        packetLossPercent: 0,
        duplex: "full",
        createdAt: now,
      };
      addConnection(networkConnection);
    },
    [addConnection],
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData("application/netlab-device");
      if (!type) return;
      addDevice(deviceRegistry.create(type, screenToFlowPosition({ x: event.clientX, y: event.clientY })));
    },
    [addDevice, screenToFlowPosition],
  );

  const onNodeClick: NodeMouseHandler<NetworkFlowNode> = useCallback(
    (_event, node) => {
      selectDevice(node.id);
      setInspectorOpen(true);
    },
    [selectDevice, setInspectorOpen],
  );
  const onEdgeClick: EdgeMouseHandler<NetworkFlowEdge> = useCallback(
    (_event, edge) => selectConnection(edge.id),
    [selectConnection],
  );

  useEffect(() => {
    const handleFit = () => void fitView({ duration: 300, padding: 0.2 });
    window.addEventListener("netlab:fit-view", handleFit);
    return () => window.removeEventListener("netlab:fit-view", handleFit);
  }, [fitView]);

  return (
    <div
      className="h-full min-h-0 flex-1"
      onDrop={onDrop}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      data-testid="network-canvas"
    >
      <ReactFlow<NetworkFlowNode, NetworkFlowEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={() => selectDevice()}
        onNodeDragStop={(_event, node) => moveDevice(node.id, node.position)}
        panOnDrag={activeTool === "pan"}
        nodesDraggable={activeTool === "select"}
        nodesConnectable={activeTool === "connect"}
        selectionOnDrag={activeTool === "select"}
        selectionMode={SelectionMode.Partial}
        className={
          activeTool === "connect" ? "cursor-crosshair" : activeTool === "pan" ? "cursor-grab" : "cursor-default"
        }
        fitView
        minZoom={0.2}
        maxZoom={2.5}
        snapToGrid
        snapGrid={[20, 20]}
        deleteKeyCode={null}
        colorMode="system"
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="var(--canvas-grid)" />
        <Controls position="bottom-right" showInteractive={false} />
        <MiniMap
          position="bottom-left"
          pannable
          zoomable
          nodeColor="var(--primary)"
          maskColor="color-mix(in oklab, var(--background) 72%, transparent)"
          className="!border-border !bg-panel !hidden !border sm:!block"
        />
      </ReactFlow>
    </div>
  );
}
