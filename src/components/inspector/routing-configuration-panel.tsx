"use client";

import { useMemo, useState } from "react";
import { Plus, Route, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createDeviceConfigurationState } from "@/domain/configuration/configuration-engine";
import { IPv4RoutingEngine } from "@/engine/protocols/routing-engine";
import { applyDeviceConfiguration } from "@/services/configuration-service";
import { useConfigurationStore } from "@/stores/configuration-store";
import { useTopologyStore } from "@/stores/topology-store";
import type { DeviceRuntimeConfig, NetworkDevice } from "@/types/network";

export function RoutingConfigurationPanel({ device }: { device: NetworkDevice }) {
  const stored = useConfigurationStore((state) => state.configurationState.devices[device.id]);
  const configuration = stored ?? createDeviceConfigurationState(device);
  const devices = useTopologyStore((state) => state.devices);
  const connections = useTopologyStore((state) => state.connections);
  const groups = useTopologyStore((state) => state.groups);
  const [destination, setDestination] = useState("0.0.0.0");
  const [prefixLength, setPrefixLength] = useState("0");
  const [nextHop, setNextHop] = useState("");
  const [distance, setDistance] = useState("1");
  const [sviVlan, setSviVlan] = useState("1");
  const [sviIp, setSviIp] = useState("");
  const [sviPrefix, setSviPrefix] = useState("24");
  const routing = configuration.runningConfig.routing;
  const routingTable = useMemo(
    () => new IPv4RoutingEngine({ devices, connections, groups }).buildRoutingTable(device),
    [connections, device, devices, groups],
  );
  const vlans = Object.values(configuration.runningConfig.switching?.vlans ?? {});

  const apply = (update: (candidate: DeviceRuntimeConfig) => void) => {
    const candidate = structuredClone(configuration.runningConfig);
    update(candidate);
    const result = applyDeviceConfiguration(device.id, candidate, "form");
    if (!result.applied) toast.error(result.validation.issues[0]?.message ?? "Routing configuration ไม่ถูกต้อง");
    return result.applied;
  };

  const addRoute = () => {
    const prefix = Number(prefixLength);
    const administrativeDistance = Number(distance);
    if (
      apply((candidate) => {
        candidate.routing.staticRoutes.push({
          destination: destination.trim(),
          prefixLength: prefix,
          nextHop: nextHop.trim(),
          administrativeDistance,
          metric: 0,
        });
      })
    ) {
      toast.success(`เพิ่ม route ${destination}/${prefix} แล้ว`);
      setNextHop("");
    }
  };

  const addSvi = () => {
    const vlanId = Number(sviVlan);
    if (
      apply((candidate) => {
        candidate.routing.svis[String(vlanId)] = {
          vlanId,
          enabled: true,
          ipv4: sviIp.trim(),
          prefixLength: Number(sviPrefix),
        };
      })
    ) {
      toast.success(`สร้าง SVI Vlan${vlanId} แล้ว`);
      setSviIp("");
    }
  };

  return (
    <div className="space-y-5">
      <section className="border-border rounded-lg border p-3">
        <label className="flex items-center justify-between gap-3 text-xs font-medium">
          <span>
            IP routing
            <span className="text-muted-foreground mt-1 block text-[10px] font-normal">
              เปิด packet forwarding ระหว่าง subnets
            </span>
          </span>
          <input
            type="checkbox"
            checked={routing.ipRouting}
            onChange={(event) =>
              apply((candidate) => {
                candidate.routing.ipRouting = event.target.checked;
              })
            }
            aria-label="Enable IP routing"
          />
        </label>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold">Static / default route</h3>
        <div className="grid grid-cols-[1fr_70px] gap-2">
          <Input
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            aria-label="Route destination"
          />
          <Input
            value={prefixLength}
            onChange={(event) => setPrefixLength(event.target.value)}
            aria-label="Route prefix"
          />
          <Input
            value={nextHop}
            onChange={(event) => setNextHop(event.target.value)}
            aria-label="Route next hop"
            placeholder="192.168.1.1"
          />
          <Input
            value={distance}
            onChange={(event) => setDistance(event.target.value)}
            aria-label="Administrative distance"
          />
        </div>
        <Button size="sm" className="mt-2 w-full" onClick={addRoute}>
          <Plus /> Add route
        </Button>
        <div className="mt-2 space-y-1.5">
          {routing.staticRoutes.map((route, index) => (
            <div
              key={`${route.destination}-${route.prefixLength}-${route.nextHop}`}
              className="border-border flex items-center gap-2 rounded-lg border p-2 text-[10px]"
            >
              <Route className="text-primary size-3.5" />
              <code className="min-w-0 flex-1 truncate">
                S {route.destination}/{route.prefixLength} via {route.nextHop}
              </code>
              <Badge variant="outline">AD {route.administrativeDistance}</Badge>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label={`Remove route ${route.destination}/${route.prefixLength}`}
                onClick={() =>
                  apply((candidate) => {
                    candidate.routing.staticRoutes.splice(index, 1);
                  })
                }
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
      </section>

      {vlans.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold">Switch Virtual Interface (SVI)</h3>
          <div className="grid grid-cols-[110px_1fr_65px] gap-2">
            <Select value={sviVlan} onValueChange={setSviVlan}>
              <SelectTrigger aria-label="SVI VLAN">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {vlans.map((vlan) => (
                  <SelectItem key={vlan.id} value={String(vlan.id)}>
                    Vlan{vlan.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={sviIp}
              onChange={(event) => setSviIp(event.target.value)}
              aria-label="SVI IPv4"
              placeholder="10.10.10.1"
            />
            <Input value={sviPrefix} onChange={(event) => setSviPrefix(event.target.value)} aria-label="SVI prefix" />
          </div>
          <Button size="sm" variant="outline" className="mt-2 w-full" onClick={addSvi}>
            <Plus /> Add SVI
          </Button>
          <div className="mt-2 space-y-1.5">
            {Object.values(routing.svis).map((svi) => (
              <div
                key={svi.vlanId}
                className="border-border flex items-center justify-between rounded-lg border p-2 text-xs"
              >
                <code>
                  Vlan{svi.vlanId} · {svi.ipv4}/{svi.prefixLength}
                </code>
                <Badge variant={svi.enabled ? "success" : "warning"}>{svi.enabled ? "up" : "shutdown"}</Badge>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="mb-2 text-xs font-semibold">Routing table</h3>
        <div className="space-y-1.5">
          {routingTable.map((route) => (
            <div
              key={`${route.source}-${route.destination}-${route.prefixLength}`}
              className="border-border rounded-lg border p-2 font-mono text-[10px]"
            >
              <div className="flex items-center justify-between gap-2">
                <span>
                  {route.source === "connected" ? "C" : route.source === "default" ? "S*" : "S"} {route.destination}/
                  {route.prefixLength}
                </span>
                <Badge variant={route.active ? "success" : "warning"}>{route.active ? "active" : "unresolved"}</Badge>
              </div>
              <p className="text-muted-foreground mt-1">
                {route.nextHop ? `via ${route.nextHop}` : `direct ${route.outgoingInterfaceId}`}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
