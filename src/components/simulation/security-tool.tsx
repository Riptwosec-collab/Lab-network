"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  SecuritySimulationEngine,
  type VpnNegotiationResult,
  type WirelessAssociationResult,
} from "@/engine/protocols/security-engine";
import { useTopologyStore } from "@/stores/topology-store";
import type { DeviceRuntimeConfig } from "@/types/network";

export function SecurityTool() {
  const devices = useTopologyStore((state) => state.devices);
  const connections = useTopologyStore((state) => state.connections);
  const groups = useTopologyStore((state) => state.groups);
  const engine = useMemo(
    () => new SecuritySimulationEngine({ devices, connections, groups }),
    [connections, devices, groups],
  );
  const vpnDevices = devices.filter((device) => Object.keys(runtime(device)?.security.vpn.tunnels ?? {}).length);
  const aps = devices.filter((device) => Object.keys(runtime(device)?.security.wireless.ssids ?? {}).length);
  const clients = devices.filter(
    (device) => device.category === "end-device" || device.capabilities.includes("client"),
  );
  const [vpnDeviceId, setVpnDeviceId] = useState(vpnDevices[0]?.id ?? "");
  const tunnels = Object.values(runtime(devices.find((item) => item.id === vpnDeviceId))?.security.vpn.tunnels ?? {});
  const [tunnelId, setTunnelId] = useState("");
  const [vpnResult, setVpnResult] = useState<VpnNegotiationResult>();
  const [apId, setApId] = useState(aps[0]?.id ?? "");
  const ssids = Object.values(runtime(devices.find((item) => item.id === apId))?.security.wireless.ssids ?? {});
  const [ssid, setSsid] = useState("");
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [username, setUsername] = useState("student");
  const [password, setPassword] = useState("netlab-demo");
  const [wirelessResult, setWirelessResult] = useState<WirelessAssociationResult>();

  return (
    <div className="border-border bg-background/55 grid max-h-72 gap-3 overflow-y-auto border-t p-3 md:grid-cols-2">
      <section className="border-border rounded-lg border p-3">
        <Header title="VPN Negotiation" />
        <div className="mt-3 space-y-2">
          <Picker
            label="VPN device"
            value={vpnDeviceId}
            onChange={(value) => {
              setVpnDeviceId(value);
              setTunnelId("");
            }}
            items={vpnDevices.map((device) => ({ value: device.id, label: device.hostname }))}
          />
          <Picker
            label="VPN tunnel"
            value={tunnelId || tunnels[0]?.id || ""}
            onChange={setTunnelId}
            items={tunnels.map((tunnel) => ({ value: tunnel.id, label: `${tunnel.name} · ${tunnel.remotePeer}` }))}
          />
          <Button
            size="sm"
            className="w-full"
            onClick={() => {
              const id = tunnelId || tunnels[0]?.id;
              if (vpnDeviceId && id) setVpnResult(engine.negotiateVpn(vpnDeviceId, id));
            }}
          >
            Negotiate Tunnel
          </Button>
        </div>
        {vpnResult && <Result ok={vpnResult.success} code={vpnResult.reason} detail={vpnResult.detail} />}
      </section>
      <section className="border-border rounded-lg border p-3">
        <Header title="Wireless / RADIUS Association" />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Picker
            label="Wireless client"
            value={clientId}
            onChange={setClientId}
            items={clients.map((device) => ({ value: device.id, label: device.hostname }))}
          />
          <Picker
            label="Access point"
            value={apId}
            onChange={(value) => {
              setApId(value);
              setSsid("");
            }}
            items={aps.map((device) => ({ value: device.id, label: device.hostname }))}
          />
          <Picker
            label="SSID"
            value={ssid || ssids[0]?.name || ""}
            onChange={setSsid}
            items={ssids.map((item) => ({ value: item.name, label: `${item.name} · ${item.securityMode}` }))}
          />
          <Input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            aria-label="Wireless username"
          />
          <Input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-label="Wireless credential"
            className="col-span-2"
          />
          <Button
            size="sm"
            className="col-span-2"
            onClick={() => {
              const name = ssid || ssids[0]?.name;
              if (clientId && apId && name)
                setWirelessResult(engine.associateWireless(clientId, apId, name, { username, password }));
            }}
          >
            Associate Client
          </Button>
        </div>
        {wirelessResult && (
          <Result ok={wirelessResult.success} code={wirelessResult.code} detail={wirelessResult.reason} />
        )}
      </section>
    </div>
  );
}

function runtime(
  device: ReturnType<typeof useTopologyStore.getState>["devices"][number] | undefined,
): DeviceRuntimeConfig | undefined {
  const value = device?.configuration.runtimeConfig;
  return value && typeof value === "object" ? (value as DeviceRuntimeConfig) : undefined;
}
function Picker({
  label,
  value,
  onChange,
  items,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  items: readonly { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function Header({ title }: { title: string }) {
  return (
    <div className="flex items-center text-xs font-semibold">
      {title}
      <Badge variant="success" className="ml-auto">
        LIVE
      </Badge>
    </div>
  );
}
function Result({ ok, code, detail }: { ok: boolean; code: string; detail: string }) {
  return (
    <div className="mt-2 rounded border p-2 text-[10px]">
      <Badge variant={ok ? "success" : "warning"}>{code}</Badge>
      <p className="mt-2">{detail}</p>
    </div>
  );
}
