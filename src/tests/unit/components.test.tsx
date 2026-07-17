import { ReactFlowProvider } from "@xyflow/react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { NetworkCanvas } from "@/components/canvas/network-canvas";
import { DeviceLibrary } from "@/components/devices/device-library";
import { DeviceInspector } from "@/components/inspector/device-inspector";
import { createDemoProject } from "@/data/demo-topology";
import { useTopologyStore } from "@/stores/topology-store";
import { useWorkspaceStore } from "@/stores/workspace-store";

describe("workspace components", () => {
  it("renders the device library", () => {
    render(<DeviceLibrary />);
    expect(screen.getByText("Branch Router")).toBeInTheDocument();
    expect(screen.getByText("Layer 2 Switch")).toBeInTheDocument();
  });

  it("filters the device library through registry metadata", async () => {
    const user = userEvent.setup();
    render(<DeviceLibrary />);
    await user.type(screen.getByPlaceholderText("ค้นหาชื่อหรือ capability"), "VXLAN");
    expect(screen.getByText("Leaf Switch")).toBeInTheDocument();
    expect(screen.queryByText("Branch Router")).not.toBeInTheDocument();
  });

  it("renders the network canvas", () => {
    render(
      <div style={{ width: 1200, height: 800 }}>
        <ReactFlowProvider>
          <NetworkCanvas />
        </ReactFlowProvider>
      </div>,
    );
    expect(screen.getByTestId("network-canvas")).toBeInTheDocument();
  });

  it("renders real configuration tabs for a selected device", async () => {
    const user = userEvent.setup();
    const project = createDemoProject();
    const device = project.devices.find((item) => item.type === "firewall")!;
    useTopologyStore
      .getState()
      .replaceTopology({ devices: project.devices, connections: project.connections, groups: [] });
    useTopologyStore.getState().selectDevice(device.id);
    useWorkspaceStore.getState().setInspectorOpen(true);
    render(<DeviceInspector />);
    expect(screen.getByRole("tab", { name: "security" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "ip" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "cli" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "raw-config" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "history" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "services" })).toBeInTheDocument();
    expect(screen.getByDisplayValue(device.hostname)).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "routing" }));
    expect(screen.getByText("Static / default route")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "services" }));
    expect(screen.getByText("DHCP pools")).toBeInTheDocument();
    expect(screen.getByText("Ordered ACL policy")).toBeInTheDocument();
  });
});
