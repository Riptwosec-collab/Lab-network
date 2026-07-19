"use client";

import { FastForward, Filter, Focus, Pause, Play, RotateCcw, Send, SkipForward, Square } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PacketProtocol, PacketTrace } from "@/engine/packets/packet-simulation-engine";
import { usePacketWorker } from "@/hooks/use-packet-worker";
import { cn } from "@/lib/utils";
import { useTopologyStore } from "@/stores/topology-store";

const protocols: PacketProtocol[] = ["arp", "icmp", "dhcp", "dns", "tcp", "udp"];

export function PacketSimulationTool() {
  const devices = useTopologyStore((state) => state.devices);
  const connections = useTopologyStore((state) => state.connections);
  const groups = useTopologyStore((state) => state.groups);
  const configuredDevices = useMemo(
    () => devices.filter((device) => device.interfaces.some((item) => item.ipv4)),
    [devices],
  );
  const [sourceDeviceId, setSourceDeviceId] = useState("");
  const sourceId = configuredDevices.some((item) => item.id === sourceDeviceId)
    ? sourceDeviceId
    : (configuredDevices[0]?.id ?? "");
  const destinations = configuredDevices.flatMap((device) =>
    device.id === sourceId
      ? []
      : device.interfaces
          .filter((item) => item.ipv4)
          .map((item) => ({ id: `${device.id}:${item.id}`, device, networkInterface: item })),
  );
  const [destinationIp, setDestinationIp] = useState("");
  const effectiveDestinationIp = destinations.some((item) => item.networkInterface.ipv4 === destinationIp)
    ? destinationIp
    : (destinations[0]?.networkInterface.ipv4 ?? "");
  const [protocol, setProtocol] = useState<PacketProtocol>("icmp");
  const [ttl, setTtl] = useState("64");
  const [size, setSize] = useState("84");
  const [destinationPort, setDestinationPort] = useState("443");
  const [trace, setTrace] = useState<PacketTrace>();
  const [sending, setSending] = useState(false);
  const worker = usePacketWorker();

  const sendPacket = async () => {
    if (!sourceId || !effectiveDestinationIp) return;
    setSending(true);
    try {
      const nextTrace = await worker.sendPacket(
        { devices, connections, groups },
        {
          sourceDeviceId: sourceId,
          destinationIp: effectiveDestinationIp,
          protocol,
          ttl: Number(ttl),
          sizeBytes: Number(size),
          sourcePort: protocol === "tcp" || protocol === "udp" || protocol === "dns" ? 49_152 : undefined,
          destinationPort:
            protocol === "dns"
              ? 53
              : protocol === "dhcp"
                ? 67
                : protocol === "tcp" || protocol === "udp"
                  ? Number(destinationPort)
                  : undefined,
        },
      );
      setTrace(nextTrace);
    } finally {
      setSending(false);
    }
  };

  const filteredEvents = worker.state.events.filter(
    (event) => worker.state.protocolFilter === "all" || event.protocol === worker.state.protocolFilter,
  );
  const currentFilteredIndex = worker.state.currentEvent
    ? filteredEvents.findIndex((event) => event.id === worker.state.currentEvent?.id)
    : -1;
  const windowStart =
    worker.state.followPacket && currentFilteredIndex >= 0
      ? Math.max(0, currentFilteredIndex - 25)
      : Math.max(0, filteredEvents.length - 80);
  const visibleEvents = filteredEvents.slice(windowStart, windowStart + 80);

  return (
    <div
      className="border-border bg-background/55 h-80 min-h-0 overflow-y-auto border-t p-3"
      data-testid="packet-simulation-tool"
    >
      <div className="grid gap-2 xl:grid-cols-[1.2fr_1.2fr_.65fr_.45fr_.5fr_.55fr_auto]">
        <Select value={sourceId} onValueChange={setSourceDeviceId}>
          <SelectTrigger aria-label="Packet source">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            {configuredDevices.map((device) => (
              <SelectItem key={device.id} value={device.id}>
                {device.hostname}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={effectiveDestinationIp} onValueChange={setDestinationIp}>
          <SelectTrigger aria-label="Packet destination">
            <SelectValue placeholder="Destination" />
          </SelectTrigger>
          <SelectContent>
            {destinations.map((item) => (
              <SelectItem key={item.id} value={item.networkInterface.ipv4!}>
                {item.device.hostname} · {item.networkInterface.ipv4}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={protocol} onValueChange={(value) => setProtocol(value as PacketProtocol)}>
          <SelectTrigger aria-label="Packet protocol">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {protocols.map((item) => (
              <SelectItem key={item} value={item}>
                {item.toUpperCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input aria-label="Packet TTL" value={ttl} onChange={(event) => setTtl(event.target.value)} />
        <Input aria-label="Packet size" value={size} onChange={(event) => setSize(event.target.value)} />
        <Input
          aria-label="Packet destination port"
          value={destinationPort}
          disabled={!["tcp", "udp"].includes(protocol)}
          onChange={(event) => setDestinationPort(event.target.value)}
        />
        <Button onClick={() => void sendPacket()} disabled={sending || !sourceId || !effectiveDestinationIp}>
          <Send /> Send
        </Button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Button size="sm" variant="outline" onClick={() => worker.command("START")}>
          <Play /> Start
        </Button>
        <Button size="sm" variant="outline" onClick={() => worker.command("PAUSE")}>
          <Pause /> Pause
        </Button>
        <Button size="sm" variant="outline" onClick={() => worker.command("STOP")}>
          <Square /> Stop
        </Button>
        <Button size="sm" variant="outline" onClick={() => worker.command("STEP")}>
          <SkipForward /> Step
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            worker.command("RESET");
            setTrace(undefined);
          }}
        >
          <RotateCcw /> Reset
        </Button>
        <Select value={String(worker.state.speed)} onValueChange={(value) => worker.setSpeed(Number(value))}>
          <SelectTrigger className="h-8 w-24" aria-label="Packet speed">
            <FastForward className="size-3" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[0.5, 1, 2, 4, 8].map((speed) => (
              <SelectItem key={speed} value={String(speed)}>
                {speed}×
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={worker.state.protocolFilter}
          onValueChange={(value) => worker.setFilter(value as PacketProtocol | "all")}
        >
          <SelectTrigger className="h-8 w-28" aria-label="Packet filter">
            <Filter className="size-3" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {protocols.map((item) => (
              <SelectItem key={item} value={item}>
                {item.toUpperCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant={worker.state.followPacket ? "default" : "outline"}
          onClick={() => worker.setFollow(!worker.state.followPacket)}
        >
          <Focus /> Follow
        </Button>
        <Badge variant={worker.state.status === "running" ? "success" : "outline"}>
          {worker.state.status.toUpperCase()} · EVENT {Math.max(0, worker.state.cursor + 1)}/
          {worker.state.events.length}
        </Badge>
        {worker.error && <span className="text-destructive text-xs">{worker.error}</span>}
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[260px_1fr_260px]">
        <section className="border-border rounded-lg border p-3">
          <h3 className="text-xs font-semibold">Packet Inspector</h3>
          {trace ? (
            <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[10px]">
              <Field label="Packet ID" value={trace.packet.id} />
              <Field label="Status" value={trace.packet.status} />
              <Field label="Source MAC" value={trace.packet.sourceMac} />
              <Field label="Destination MAC" value={trace.packet.destinationMac} />
              <Field label="Source IP" value={trace.packet.sourceIp} />
              <Field label="Destination IP" value={trace.packet.destinationIp} />
              <Field label="Protocol" value={trace.packet.protocol.toUpperCase()} />
              <Field label="TTL" value={`${trace.packet.ttl}/${trace.packet.initialTtl}`} />
              <Field label="Size" value={`${trace.packet.sizeBytes} B`} />
              <Field label="VLAN" value={String(trace.packet.vlan ?? "untagged")} />
              <Field label="Current device" value={trace.packet.currentDeviceId} />
              <Field label="Interface" value={trace.packet.currentInterfaceId ?? "—"} />
              {trace.packet.dropReason && (
                <div className="border-destructive/30 bg-destructive/8 col-span-2 mt-1 rounded border p-2">
                  <dt className="text-destructive">Drop reason</dt>
                  <dd className="mt-1">{trace.packet.dropReason}</dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="text-muted-foreground mt-4 text-center text-xs">Send a packet to inspect its full model.</p>
          )}
        </section>

        <section className="border-border min-w-0 rounded-lg border p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold">Windowed Event Timeline</h3>
            <span className="text-muted-foreground font-mono text-[9px]">
              {windowStart + 1}–{windowStart + visibleEvents.length} of {filteredEvents.length}
            </span>
          </div>
          <ol className="mt-2 max-h-40 space-y-1 overflow-y-auto">
            {visibleEvents.map((event) => (
              <li
                key={event.id}
                className={cn(
                  "grid grid-cols-[10px_100px_1fr_auto] items-start gap-2 rounded px-1.5 py-1 text-[9px]",
                  event.id === worker.state.currentEvent?.id && "bg-primary/10 ring-primary/30 ring-1",
                )}
              >
                <span
                  className={cn(
                    "mt-1 size-2 rounded-full",
                    event.status === "failure" ? "bg-destructive" : protocolColor(event.protocol),
                  )}
                />
                <span className="font-medium">{event.type}</span>
                <span className="text-muted-foreground truncate">{event.explanation}</span>
                <span className="font-mono">TTL {event.ttl}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-border rounded-lg border p-3">
          <h3 className="text-xs font-semibold">Active Path</h3>
          {trace?.pathDeviceIds.length ? (
            <div className="mt-2 space-y-1">
              {trace.pathDeviceIds.map((deviceId, index) => (
                <div key={deviceId} className="bg-primary/8 border-primary/20 rounded border px-2 py-1 text-[10px]">
                  <span className="text-primary font-mono">{index + 1}</span> ·{" "}
                  {devices.find((item) => item.id === deviceId)?.hostname ?? deviceId}
                </div>
              ))}
              <p className="text-muted-foreground mt-2 text-[9px]">
                {trace.pathConnectionIds.length} active link(s); unrelated links are omitted from this focused trace.
              </p>
            </div>
          ) : (
            <p className="text-muted-foreground mt-4 text-center text-xs">No active path.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate font-mono">{value}</dd>
    </div>
  );
}

function protocolColor(protocol: PacketProtocol): string {
  return {
    arp: "bg-amber-500",
    icmp: "bg-sky-500",
    dhcp: "bg-violet-500",
    dns: "bg-emerald-500",
    tcp: "bg-blue-500",
    udp: "bg-orange-500",
  }[protocol];
}
