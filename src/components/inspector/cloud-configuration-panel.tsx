"use client";

import { Cloud, Network, Plus, Route, ShieldCheck, Server } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createDeviceConfigurationState } from "@/domain/configuration/configuration-engine";
import { applyDeviceConfiguration } from "@/services/configuration-service";
import { useConfigurationStore } from "@/stores/configuration-store";
import type { CloudRouteTargetType, DeviceRuntimeConfig, NetworkDevice } from "@/types/network";

const routeTargets: Array<{ type: CloudRouteTargetType; id: string; label: string }> = [
  { type: "internet-gateway", id: "igw-main", label: "Internet Gateway" },
  { type: "nat-gateway", id: "nat-main", label: "NAT Gateway" },
  { type: "vpn-gateway", id: "vpn-main", label: "VPN Gateway" },
  { type: "transit-network", id: "transit-main", label: "Transit Network" },
];

export function CloudConfigurationPanel({ device }: { device: NetworkDevice }) {
  const stored = useConfigurationStore((state) => state.configurationState.devices[device.id]);
  const configuration = stored ?? createDeviceConfigurationState(device);
  const cloud = configuration.runningConfig.cloud;
  const [peerNetworkId, setPeerNetworkId] = useState("network-peer");
  const [peerCidr, setPeerCidr] = useState("10.30.0.0/16");

  const apply = (update: (candidate: DeviceRuntimeConfig) => void) => {
    const candidate = structuredClone(configuration.runningConfig);
    update(candidate);
    const result = applyDeviceConfiguration(device.id, candidate, "form");
    if (!result.applied) toast.error(result.validation.issues[0]?.message ?? "Cloud configuration is invalid");
    return result.applied;
  };
  const resources = Object.values(cloud.resources);
  const network = resources.find((item) => item.type === "cloud-network");
  const subnets = resources.filter((item) => item.type === "public-subnet" || item.type === "private-subnet");
  const routeTables = resources.filter((item) => item.type === "route-table");
  const instances = resources.filter((item) =>
    ["virtual-machine", "cloud-database", "load-balancer", "private-endpoint"].includes(item.type),
  );
  const policies = resources.filter((item) => item.type === "security-group" || item.type === "network-acl");

  const changeDefaultRoute = (routeTableId: string, value: string) => {
    const target = routeTargets.find((item) => item.type === value);
    if (!target) return;
    apply((candidate) => {
      const routeTable = candidate.cloud.resources[routeTableId];
      const route = routeTable?.configuration.routes?.find((item) => item.destinationCidr === "0.0.0.0/0");
      if (route) {
        route.targetType = target.type;
        route.targetResourceId = target.id;
      }
    });
  };

  const addPeering = () => {
    const peeringCount = resources.filter((item) => item.type === "vpc-peering").length;
    const id = `peering-${peeringCount + 1}`;
    const applied = apply((candidate) => {
      candidate.cloud.resources[id] = {
        id,
        name: `Peering to ${peerNetworkId}`,
        type: "vpc-peering",
        region: network?.region ?? "generic-1",
        networkId: network?.id,
        tags: { environment: "lab" },
        status: "available",
        configuration: { targetNetworkId: peerNetworkId, targetCidr: peerCidr },
      };
    });
    if (applied) toast.success("VPC peering framework added");
  };

  return (
    <div className="space-y-4" data-testid="cloud-configuration-panel">
      <div className="border-border bg-muted/25 rounded-xl border p-3">
        <div className="flex items-center gap-2">
          <Cloud className="text-primary size-4" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold">{network?.name ?? "Cloud Networking"}</p>
            <p className="text-muted-foreground font-mono text-[10px]">
              {network?.configuration.cidr ?? "No network CIDR"}
            </p>
          </div>
          <Badge variant={cloud.enabled ? "success" : "outline"}>{cloud.enabled ? "ACTIVE" : "OFF"}</Badge>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10px]">
          <Metric label="Resources" value={resources.length} />
          <Metric label="Subnets" value={subnets.length} />
          <Metric label="Regions" value={new Set(resources.map((item) => item.region)).size} />
        </div>
      </div>

      <section>
        <Heading icon={<Network />} title="Nested Cloud Canvas" />
        <div className="border-border mt-2 rounded-lg border p-2">
          <p className="text-xs font-semibold">{network?.name}</p>
          <div className="border-border mt-2 ml-2 space-y-2 border-l pl-3">
            {subnets.map((subnet) => (
              <div key={subnet.id} className="bg-muted/35 rounded-md p-2">
                <div className="flex items-center gap-2">
                  <Badge variant={subnet.type === "public-subnet" ? "success" : "outline"}>
                    {subnet.type === "public-subnet" ? "PUBLIC" : "PRIVATE"}
                  </Badge>
                  <span className="text-xs font-medium">{subnet.name}</span>
                </div>
                <p className="text-muted-foreground mt-1 font-mono text-[10px]">{subnet.configuration.cidr}</p>
                <p className="text-muted-foreground mt-1 text-[10px]">
                  {instances
                    .filter((item) => item.subnetId === subnet.id)
                    .map((item) => item.name)
                    .join(" · ") || "No attached resources"}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <Heading icon={<Route />} title="Route Tables" />
        <div className="mt-2 space-y-2">
          {routeTables.map((table) => {
            const defaultRoute = table.configuration.routes?.find((item) => item.destinationCidr === "0.0.0.0/0");
            return (
              <div key={table.id} className="border-border rounded-lg border p-2">
                <p className="text-xs font-medium">{table.name}</p>
                {(table.configuration.routes ?? []).map((route) => (
                  <p key={route.id} className="text-muted-foreground mt-1 font-mono text-[10px]">
                    {route.destinationCidr} → {route.targetType}/{route.targetResourceId}
                  </p>
                ))}
                {defaultRoute && (
                  <Select
                    value={defaultRoute.targetType}
                    onValueChange={(value) => changeDefaultRoute(table.id, value)}
                  >
                    <SelectTrigger className="mt-2 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {routeTargets.map((target) => (
                        <SelectItem key={target.type} value={target.type}>
                          {target.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <Heading icon={<ShieldCheck />} title="Security Policies" />
        <div className="mt-2 space-y-2">
          {policies.map((policy) => (
            <div key={policy.id} className="border-border rounded-lg border p-2">
              <div className="flex items-center gap-2">
                <p className="flex-1 text-xs font-medium">{policy.name}</p>
                <Badge variant="outline">{policy.type === "security-group" ? "STATEFUL" : "STATELESS"}</Badge>
              </div>
              {(policy.configuration.rules ?? []).map((rule) => (
                <button
                  type="button"
                  key={rule.id}
                  className="border-border mt-1 flex w-full items-center gap-2 rounded border px-2 py-1 text-left text-[10px]"
                  onClick={() =>
                    apply((candidate) => {
                      const item = candidate.cloud.resources[policy.id]?.configuration.rules?.find(
                        (entry) => entry.id === rule.id,
                      );
                      if (item) item.action = item.action === "allow" ? "deny" : "allow";
                    })
                  }
                >
                  <span className={rule.action === "allow" ? "text-success" : "text-destructive"}>
                    {rule.priority} {rule.action.toUpperCase()}
                  </span>
                  <span className="text-muted-foreground">
                    {rule.direction} {rule.protocol} {rule.cidr}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section>
        <Heading icon={<Server />} title="Peering / VPN Framework" />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Input
            value={peerNetworkId}
            onChange={(event) => setPeerNetworkId(event.target.value)}
            aria-label="Peer network ID"
          />
          <Input value={peerCidr} onChange={(event) => setPeerCidr(event.target.value)} aria-label="Peer CIDR" />
        </div>
        <Button className="mt-2 w-full" variant="outline" size="sm" onClick={addPeering}>
          <Plus /> Add VPC Peering
        </Button>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-background rounded-md p-2">
      <p className="font-semibold">{value}</p>
      <p className="text-muted-foreground">{label}</p>
    </div>
  );
}

function Heading({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="text-muted-foreground flex items-center gap-2 text-xs font-semibold [&_svg]:size-3.5">
      <span>{icon}</span>
      {title}
    </div>
  );
}
