"use client";

import { Activity, HeartPulse, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createDeviceConfigurationState } from "@/domain/configuration/configuration-engine";
import { HighAvailabilityEngine, MonitoringEngine } from "@/engine/operations/operations-engine";
import { applyDeviceConfiguration } from "@/services/configuration-service";
import { useConfigurationStore } from "@/stores/configuration-store";
import { useTopologyStore } from "@/stores/topology-store";
import type { DeviceRuntimeConfig, HighAvailabilityProtocol, NetworkDevice } from "@/types/network";

export function OperationsConfigurationPanel({ device }: { device: NetworkDevice }) {
  const stored = useConfigurationStore((state) => state.configurationState.devices[device.id]);
  const configuration = stored ?? createDeviceConfigurationState(device);
  const devices = useTopologyStore((state) => state.devices);
  const connections = useTopologyStore((state) => state.connections);
  const groups = useTopologyStore((state) => state.groups);
  const topology = { devices, connections, groups };
  const operations = configuration.runningConfig.operations;
  const member = new HighAvailabilityEngine(topology).members().find((item) => item.deviceId === device.id);
  const metrics = new MonitoringEngine(topology).metrics().filter((item) => item.deviceId === device.id);

  const apply = (update: (candidate: DeviceRuntimeConfig) => void) => {
    const candidate = structuredClone(configuration.runningConfig);
    update(candidate);
    const result = applyDeviceConfiguration(device.id, candidate, "form");
    if (!result.applied) toast.error(result.validation.issues[0]?.message ?? "Operations configuration is invalid");
  };

  return (
    <div className="space-y-4">
      <section className="border-border space-y-3 rounded-lg border p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-primary size-4" />
            <div>
              <h3 className="text-xs font-semibold">High availability</h3>
              <p className="text-muted-foreground text-[10px]">HSRP, VRRP, firewall or dual-ISP failover</p>
            </div>
          </div>
          <input
            type="checkbox"
            checked={operations.highAvailability.enabled}
            aria-label="Enable high availability"
            onChange={(event) =>
              apply((candidate) => {
                candidate.operations.highAvailability.enabled = event.target.checked;
              })
            }
          />
        </div>
        {operations.highAvailability.enabled && (
          <>
            <Select
              value={operations.highAvailability.protocol}
              onValueChange={(value) =>
                apply((candidate) => {
                  candidate.operations.highAvailability.protocol = value as HighAvailabilityProtocol;
                })
              }
            >
              <SelectTrigger aria-label="HA protocol">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["hsrp", "vrrp", "active-standby", "dual-isp"].map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-muted-foreground text-[10px]">
                Virtual IP
                <Input
                  className="mt-1"
                  value={operations.highAvailability.virtualIp}
                  onChange={(event) =>
                    apply((candidate) => {
                      candidate.operations.highAvailability.virtualIp = event.target.value;
                    })
                  }
                />
              </label>
              <label className="text-muted-foreground text-[10px]">
                Priority
                <Input
                  className="mt-1"
                  type="number"
                  value={operations.highAvailability.priority}
                  onChange={(event) =>
                    apply((candidate) => {
                      candidate.operations.highAvailability.priority = Number(event.target.value);
                    })
                  }
                />
              </label>
            </div>
            <label className="flex items-center justify-between text-xs">
              Preempt
              <input
                type="checkbox"
                checked={operations.highAvailability.preempt}
                onChange={(event) =>
                  apply((candidate) => {
                    candidate.operations.highAvailability.preempt = event.target.checked;
                  })
                }
              />
            </label>
            <div>
              <p className="text-muted-foreground mb-1 text-[10px]">Tracked interfaces</p>
              <div className="flex flex-wrap gap-1.5">
                {device.interfaces.map((networkInterface) => {
                  const selected = operations.highAvailability.trackedInterfaceIds.includes(networkInterface.id);
                  return (
                    <button
                      key={networkInterface.id}
                      className={`rounded border px-2 py-1 text-[10px] ${selected ? "border-primary bg-primary/10 text-primary" : "border-border"}`}
                      onClick={() =>
                        apply((candidate) => {
                          const values = candidate.operations.highAvailability.trackedInterfaceIds;
                          candidate.operations.highAvailability.trackedInterfaceIds = values.includes(
                            networkInterface.id,
                          )
                            ? values.filter((id) => id !== networkInterface.id)
                            : [...values, networkInterface.id];
                        })
                      }
                    >
                      {networkInterface.name}
                    </button>
                  );
                })}
              </div>
            </div>
            {member && (
              <div className="bg-muted/35 rounded-lg p-2 text-[10px]">
                <div className="flex items-center justify-between">
                  <span>Runtime role</span>
                  <Badge variant={member.role === "active" || member.role === "master" ? "success" : "outline"}>
                    {member.role}
                  </Badge>
                </div>
                <p className="text-muted-foreground mt-1">
                  Effective priority {member.effectivePriority} · {member.reason}
                </p>
              </div>
            )}
          </>
        )}
      </section>

      <section className="border-border space-y-3 rounded-lg border p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <HeartPulse className="text-primary size-4" />
            <div>
              <h3 className="text-xs font-semibold">Monitoring</h3>
              <p className="text-muted-foreground text-[10px]">ICMP, SNMP, Syslog and NetFlow framework</p>
            </div>
          </div>
          <input
            type="checkbox"
            checked={operations.monitoring.enabled}
            aria-label="Enable monitoring"
            onChange={(event) =>
              apply((candidate) => {
                candidate.operations.monitoring.enabled = event.target.checked;
              })
            }
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-muted-foreground text-[10px]">
            Poll interval (s)
            <Input
              className="mt-1"
              type="number"
              value={operations.monitoring.pollingIntervalSeconds}
              onChange={(event) =>
                apply((candidate) => {
                  candidate.operations.monitoring.pollingIntervalSeconds = Number(event.target.value);
                })
              }
            />
          </label>
          <label className="text-muted-foreground text-[10px]">
            Loss threshold %
            <Input
              className="mt-1"
              type="number"
              value={operations.monitoring.thresholds.packetLossPercent}
              onChange={(event) =>
                apply((candidate) => {
                  candidate.operations.monitoring.thresholds.packetLossPercent = Number(event.target.value);
                })
              }
            />
          </label>
        </div>
        <div className="space-y-1.5">
          {metrics.map((metric) => (
            <div key={metric.interfaceId} className="border-border rounded border p-2 text-[10px]">
              <div className="flex justify-between">
                <span className="flex items-center gap-1">
                  <Activity className="size-3" />
                  {metric.interfaceName}
                </span>
                <Badge variant={metric.availability === "up" ? "success" : "warning"}>{metric.availability}</Badge>
              </div>
              <p className="text-muted-foreground mt-1 font-mono">
                {metric.bandwidthUtilizationPercent}% · {metric.latencyMs}ms · loss {metric.packetLossPercent}% · errors{" "}
                {metric.errorCount}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
