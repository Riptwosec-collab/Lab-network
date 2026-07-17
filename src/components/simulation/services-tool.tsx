"use client";

import { useMemo, useState } from "react";
import { DatabaseZap, Globe2, Network } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createDeviceConfigurationState } from "@/domain/configuration/configuration-engine";
import { IPv4PingEngine, type PingResult } from "@/engine/protocols/ping-engine";
import { NetworkServicesEngine, type DhcpLease, type DnsQueryResult } from "@/engine/protocols/services-engine";
import { applyDeviceConfiguration } from "@/services/configuration-service";
import { useConfigurationStore } from "@/stores/configuration-store";
import { useTopologyStore } from "@/stores/topology-store";

export function ServicesTool() {
  const devices = useTopologyStore((state) => state.devices);
  const connections = useTopologyStore((state) => state.connections);
  const groups = useTopologyStore((state) => state.groups);
  const configurations = useConfigurationStore((state) => state.configurationState.devices);
  const topology = useMemo(() => ({ devices, connections, groups }), [connections, devices, groups]);
  const engine = useMemo(() => new NetworkServicesEngine(topology), [topology]);
  const clients = devices.filter(
    (device) => device.category === "end-device" || device.capabilities.includes("client"),
  );
  const servers = devices.filter((device) => configurations[device.id]?.runningConfig.services.dhcp.enabled);
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [serverId, setServerId] = useState(servers[0]?.id ?? "");
  const pools = Object.values(configurations[serverId]?.runningConfig.services.dhcp.pools ?? {});
  const [poolName, setPoolName] = useState("");
  const [leases, setLeases] = useState<readonly DhcpLease[]>([]);
  const [dhcpTimeline, setDhcpTimeline] = useState<readonly string[]>([]);
  const [dnsName, setDnsName] = useState("server.lab.local");
  const [dnsResult, setDnsResult] = useState<DnsQueryResult>();
  const destinations = devices.flatMap((device) =>
    device.interfaces.flatMap((networkInterface) =>
      networkInterface.ipv4 ? [{ device, address: networkInterface.ipv4 }] : [],
    ),
  );
  const [destinationIp, setDestinationIp] = useState(destinations[0]?.address ?? "");
  const [packetResult, setPacketResult] = useState<PingResult>();

  const requestLease = () => {
    const selectedPool = poolName || pools[0]?.name;
    if (!clientId || !serverId || !selectedPool) return;
    const result = engine.requestDhcp(clientId, serverId, selectedPool);
    setDhcpTimeline(result.timeline);
    if (!result.lease) return;
    setLeases((current) => [...current.filter((item) => item.id !== result.lease!.id), result.lease!]);
    const client = devices.find((device) => device.id === clientId);
    if (!client) return;
    const state = configurations[client.id] ?? createDeviceConfigurationState(client);
    const candidate = structuredClone(state.runningConfig);
    const networkInterface = client.interfaces[0];
    if (!networkInterface) return;
    candidate.interfaces[networkInterface.id] = {
      ...candidate.interfaces[networkInterface.id]!,
      enabled: true,
      ipv4: result.lease.ipAddress,
      prefixLength: configurations[serverId]!.runningConfig.services.dhcp.pools[selectedPool]!.prefixLength,
      defaultGateway: result.lease.defaultGateway,
    };
    candidate.system.dnsServers = [...result.lease.dnsServers];
    applyDeviceConfiguration(client.id, candidate, "system");
  };

  const runDns = () => {
    if (clientId && dnsName.trim()) setDnsResult(engine.queryDns(clientId, dnsName.trim()));
  };

  const runPacket = () => {
    if (clientId && destinationIp)
      setPacketResult(new IPv4PingEngine(topology).ping({ sourceDeviceId: clientId, destinationIp }));
  };

  const translations = [
    ...(packetResult?.policy?.natTranslations ?? []),
    ...(packetResult?.returnPolicy?.natTranslations ?? []),
  ];
  const aclEvaluations = [
    ...(packetResult?.policy?.aclEvaluations ?? []),
    ...(packetResult?.returnPolicy?.aclEvaluations ?? []),
  ];

  return (
    <div className="border-border bg-background/55 grid max-h-80 gap-3 overflow-y-auto border-t p-3 lg:grid-cols-3">
      <section className="border-border rounded-lg border p-3">
        <ToolHeading icon={<DatabaseZap />} title="DHCP DORA + Lease Table" />
        <div className="mt-3 space-y-2">
          <DeviceSelect
            label="DHCP client"
            value={clientId}
            onChange={setClientId}
            items={clients.map((device) => ({ value: device.id, label: device.hostname }))}
          />
          <DeviceSelect
            label="DHCP server"
            value={serverId}
            onChange={(value) => {
              setServerId(value);
              setPoolName("");
            }}
            items={servers.map((device) => ({ value: device.id, label: device.hostname }))}
          />
          <DeviceSelect
            label="DHCP pool"
            value={poolName || pools[0]?.name || ""}
            onChange={setPoolName}
            items={pools.map((pool) => ({
              value: pool.name,
              label: `${pool.name} · ${pool.network}/${pool.prefixLength}`,
            }))}
          />
          <Button
            size="sm"
            className="w-full"
            onClick={requestLease}
            disabled={!clientId || !serverId || !pools.length}
          >
            Request DHCP Lease
          </Button>
        </div>
        {dhcpTimeline.length > 0 && (
          <p className="text-muted-foreground mt-2 font-mono text-[9px]">{dhcpTimeline.join(" → ")}</p>
        )}
        <div className="mt-2 space-y-1">
          {leases.map((lease) => (
            <div key={lease.id} className="bg-muted/45 rounded p-2 font-mono text-[9px]">
              {lease.ipAddress} · {lease.clientIdentifier}
              <Badge variant="success" className="ml-2">
                {lease.state}
              </Badge>
            </div>
          ))}
        </div>
      </section>

      <section className="border-border rounded-lg border p-3">
        <ToolHeading icon={<Globe2 />} title="DNS Query + Cache" />
        <div className="mt-3 space-y-2">
          <DeviceSelect
            label="DNS client"
            value={clientId}
            onChange={setClientId}
            items={clients.map((device) => ({ value: device.id, label: device.hostname }))}
          />
          <Input value={dnsName} onChange={(event) => setDnsName(event.target.value)} aria-label="DNS query name" />
          <Button size="sm" className="w-full" onClick={runDns}>
            Run DNS Query
          </Button>
        </div>
        {dnsResult && (
          <div className="mt-2 rounded border p-2 text-[10px]">
            <div className="flex items-center gap-2">
              <Badge variant={dnsResult.success ? "success" : "warning"}>{dnsResult.code}</Badge>
              <Badge variant="outline">cache {dnsResult.cache}</Badge>
            </div>
            <p className="mt-2">{dnsResult.values.join(", ") || dnsResult.reason}</p>
          </div>
        )}
      </section>

      <section className="border-border rounded-lg border p-3">
        <ToolHeading icon={<Network />} title="ACL + NAT Packet Policy" />
        <div className="mt-3 space-y-2">
          <DeviceSelect
            label="Policy source"
            value={clientId}
            onChange={setClientId}
            items={clients.map((device) => ({ value: device.id, label: device.hostname }))}
          />
          <DeviceSelect
            label="Policy destination"
            value={destinationIp}
            onChange={setDestinationIp}
            items={destinations.map((item) => ({
              value: item.address,
              label: `${item.device.hostname} · ${item.address}`,
            }))}
          />
          <Button size="sm" className="w-full" onClick={runPacket}>
            Simulate ICMP Packet
          </Button>
        </div>
        {packetResult && (
          <div className="mt-2 space-y-1 text-[9px]">
            <Badge variant={packetResult.success ? "success" : "warning"}>
              {packetResult.success ? "PERMIT" : packetResult.failureCode}
            </Badge>
            {aclEvaluations.map((item, index) => (
              <p key={`${item.deviceId}:${item.aclName}:${index}`} className="font-mono">
                {item.hostname} {item.interfaceId} {item.direction} · {item.aclName} {item.ruleSequence ?? "implicit"}{" "}
                {item.action}
              </p>
            ))}
            {translations.map((item) => (
              <p key={item.id} className="font-mono">
                {item.type}: {item.insideLocal} → {item.insideGlobal}
              </p>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function DeviceSelect({
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

function ToolHeading({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 text-xs font-semibold">
      <span className="text-primary [&>svg]:size-4">{icon}</span>
      {title}
      <Badge variant="success" className="ml-auto">
        LIVE
      </Badge>
    </div>
  );
}
