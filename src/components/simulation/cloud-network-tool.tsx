"use client";

import { Cloud, Play, Route, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CloudNetworkEngine, type CloudFlowResult } from "@/engine/cloud/cloud-network-engine";
import { useConfigurationStore } from "@/stores/configuration-store";
import { useTopologyStore } from "@/stores/topology-store";
import type { CloudRuleProtocol } from "@/types/network";

export function CloudNetworkTool() {
  const devices = useTopologyStore((state) => state.devices);
  const configurationState = useConfigurationStore((state) => state.configurationState);
  const cloudDevices = devices.filter((device) => {
    const config = configurationState.devices[device.id]?.runningConfig.cloud;
    return config?.enabled;
  });
  const [selectedCloudDeviceId, setSelectedCloudDeviceId] = useState("");
  const cloudDeviceId = cloudDevices.some((item) => item.id === selectedCloudDeviceId)
    ? selectedCloudDeviceId
    : (cloudDevices[0]?.id ?? "");
  const cloud = cloudDeviceId ? configurationState.devices[cloudDeviceId]?.runningConfig.cloud : undefined;
  const sources = Object.values(cloud?.resources ?? {}).filter((item) => item.type === "virtual-machine");
  const destinations = Object.values(cloud?.resources ?? {}).filter((item) =>
    ["virtual-machine", "cloud-database", "private-endpoint", "load-balancer"].includes(item.type),
  );
  const [selectedSourceId, setSelectedSourceId] = useState("vm-private");
  const sourceId = sources.some((item) => item.id === selectedSourceId) ? selectedSourceId : (sources[0]?.id ?? "");
  const [selectedDestination, setSelectedDestination] = useState("internet");
  const destination =
    selectedDestination === "internet" || destinations.some((item) => item.id === selectedDestination)
      ? selectedDestination
      : "internet";
  const [protocol, setProtocol] = useState<Exclude<CloudRuleProtocol, "any">>("tcp");
  const [port, setPort] = useState("443");
  const [result, setResult] = useState<CloudFlowResult>();

  const run = () => {
    if (!cloud || !sourceId) return;
    setResult(
      new CloudNetworkEngine(cloud).simulate({
        sourceResourceId: sourceId,
        destination,
        protocol,
        port: protocol === "icmp" ? undefined : Number(port),
      }),
    );
  };

  return (
    <div className="border-border bg-background/55 min-h-36 border-t p-3" data-testid="cloud-network-tool">
      <div className="grid gap-2 lg:grid-cols-[1.1fr_1fr_1fr_.7fr_.6fr_auto]">
        <Select value={cloudDeviceId} onValueChange={setSelectedCloudDeviceId}>
          <SelectTrigger aria-label="Cloud network device">
            <SelectValue placeholder="Cloud network" />
          </SelectTrigger>
          <SelectContent>
            {cloudDevices.map((device) => (
              <SelectItem key={device.id} value={device.id}>
                {device.hostname}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sourceId} onValueChange={setSelectedSourceId}>
          <SelectTrigger aria-label="Cloud source">
            <SelectValue placeholder="Source VM" />
          </SelectTrigger>
          <SelectContent>
            {sources.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={destination} onValueChange={setSelectedDestination}>
          <SelectTrigger aria-label="Cloud destination">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="internet">Internet (8.8.8.8)</SelectItem>
            {destinations
              .filter((item) => item.id !== sourceId)
              .map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Select value={protocol} onValueChange={(value) => setProtocol(value as typeof protocol)}>
          <SelectTrigger aria-label="Cloud protocol">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["icmp", "tcp", "udp"].map((item) => (
              <SelectItem key={item} value={item}>
                {item.toUpperCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          aria-label="Cloud port"
          value={port}
          disabled={protocol === "icmp"}
          onChange={(event) => setPort(event.target.value)}
        />
        <Button onClick={run} disabled={!cloud || !sourceId}>
          <Play /> Simulate
        </Button>
      </div>

      {!cloud && (
        <p className="text-muted-foreground mt-3 text-xs">
          Add a Cloud/VPC device to the topology to simulate vendor-neutral cloud routing.
        </p>
      )}
      {result && (
        <div className="mt-3 grid gap-3 lg:grid-cols-[240px_1fr]" aria-live="polite">
          <div className="border-border rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <Cloud className={result.success ? "text-success size-4" : "text-destructive size-4"} />
              <p className="text-xs font-semibold">{result.success ? "CLOUD REACHABLE" : result.code}</p>
              <Badge className="ml-auto" variant={result.success ? "success" : "warning"}>
                {result.success ? "ALLOW" : "DENY"}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-2 text-[10px] leading-4">{result.reason}</p>
            {result.translatedSourceIp && (
              <p className="mt-2 font-mono text-[10px]">SNAT → {result.translatedSourceIp}</p>
            )}
          </div>
          <div className="border-border grid gap-2 rounded-lg border p-3 sm:grid-cols-2 xl:grid-cols-4">
            {result.steps.map((step, index) => (
              <div key={`${step.component}-${index}`} className="bg-muted/35 rounded-md p-2">
                <div className="flex items-center gap-1.5">
                  {step.component.includes("Route") ? <Route className="size-3" /> : <ShieldCheck className="size-3" />}
                  <p className="truncate text-[10px] font-semibold">{step.component}</p>
                </div>
                <Badge
                  className="mt-1"
                  variant={step.decision === "deny" ? "warning" : step.decision === "allow" ? "success" : "outline"}
                >
                  {step.decision}
                </Badge>
                <p className="text-muted-foreground mt-1 text-[9px] leading-3">{step.detail}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
