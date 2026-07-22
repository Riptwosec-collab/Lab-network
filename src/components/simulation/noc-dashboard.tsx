"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Activity, BellRing, Cloud, Database, Radio, ShieldCheck, Siren, Wifi } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatefulMonitoringEngine } from "@/engine/monitoring/stateful-monitoring-engine";
import { useTopologyStore } from "@/stores/topology-store";
import type { MonitoringMetricName, MonitoringSnapshot } from "@/types/monitoring";
import type { NetworkConnection } from "@/types/network";

export function NocDashboard() {
  const devices = useTopologyStore((state) => state.devices);
  const connections = useTopologyStore((state) => state.connections);
  const groups = useTopologyStore((state) => state.groups);
  const updateConnection = useTopologyStore((state) => state.updateConnection);
  const topology = useMemo(() => ({ devices, connections, groups }), [connections, devices, groups]);
  const [engine] = useState(() => new StatefulMonitoringEngine());
  const [originalLink, setOriginalLink] = useState<NetworkConnection>();
  const [maintenance, setMaintenance] = useState(false);
  const [snapshot, setSnapshot] = useState<MonitoringSnapshot>(() => engine.snapshot(topology));
  const refresh = useCallback(() => setSnapshot(engine.snapshot(topology)), [engine, topology]);

  useEffect(() => {
    const immediate = window.setTimeout(refresh, 0);
    const timer = window.setInterval(refresh, 2_000);
    return () => {
      window.clearTimeout(immediate);
      window.clearInterval(timer);
    };
  }, [refresh]);

  const simulateIncident = () => {
    const link = connections[0];
    if (!link) return;
    setOriginalLink((current) => current ?? structuredClone(link));
    updateConnection(link.id, { status: "degraded", latencyMs: 120, jitterMs: 45, packetLossPercent: 8 }, false);
  };

  const restoreLink = () => {
    const link = originalLink;
    if (!link) return;
    updateConnection(
      link.id,
      {
        status: link.status,
        latencyMs: link.latencyMs,
        jitterMs: link.jitterMs,
        packetLossPercent: link.packetLossPercent,
      },
      false,
    );
    setOriginalLink(undefined);
  };

  const toggleMaintenance = () => {
    const enabled = !maintenance;
    engine.setMaintenance("global", enabled);
    setMaintenance(enabled);
    setSnapshot(engine.snapshot(topology));
  };

  const transition = (alertId: string, action: "acknowledge" | "suppress") => {
    engine[action](alertId);
    setSnapshot(engine.snapshot(topology));
  };

  const activeAlerts = snapshot.alerts.filter((alert) => !["resolved", "suppressed"].includes(alert.state));
  const bandwidth = snapshot.metrics.filter((metric) => metric.metric === "bandwidth");

  return (
    <section className="space-y-3" data-testid="noc-dashboard">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Siren className="text-primary size-4" />
            <h3 className="text-xs font-semibold">Network Operations Center</h3>
            <Badge variant={activeAlerts.length ? "warning" : "success"}>
              {activeAlerts.length ? `${activeAlerts.length} active` : "Healthy"}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-0.5 text-[9px]">Live topology metrics · refreshed every 2 seconds</p>
        </div>
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="outline" onClick={simulateIncident} disabled={!connections.length}>
            Simulate metric incident
          </Button>
          <Button size="sm" variant="outline" onClick={restoreLink} disabled={!originalLink}>
            Restore healthy link
          </Button>
          <Button size="sm" variant={maintenance ? "default" : "outline"} onClick={toggleMaintenance}>
            Maintenance {maintenance ? "ON" : "OFF"}
          </Button>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<ShieldCheck />} label="Overall health" value={`${snapshot.overallHealthPercent}%`} />
        <MetricCard icon={<Activity />} label="SLA health" value={`${snapshot.slaPercent}%`} />
        <MetricCard
          icon={<BellRing />}
          label="Active alerts"
          value={String(activeAlerts.length)}
          warning={activeAlerts.length > 0}
        />
        <MetricCard icon={<Radio />} label="Metric samples" value={String(snapshot.metrics.length)} />
      </div>

      <div className="grid gap-3 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-2">
          <Panel title="Alert workflow">
            {snapshot.alerts.length ? (
              snapshot.alerts.slice(0, 8).map((alert) => (
                <div
                  key={alert.id}
                  className="border-border rounded-md border p-2 text-[10px]"
                  data-testid="monitoring-alert"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant={alert.severity === "critical" || alert.severity === "high" ? "warning" : "outline"}>
                      {alert.severity}
                    </Badge>
                    <Badge variant={alert.state === "resolved" ? "success" : "outline"}>{alert.state}</Badge>
                    <span className="min-w-0 flex-1 truncate font-medium">{alert.message}</span>
                    <span className="font-mono">{alert.value}</span>
                  </div>
                  <p className="text-muted-foreground mt-1 truncate">
                    {alert.label} · occurrence {alert.occurrenceCount}
                  </p>
                  {!["resolved", "suppressed"].includes(alert.state) && (
                    <div className="mt-1.5 flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => transition(alert.id, "acknowledge")}>
                        Acknowledge
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => transition(alert.id, "suppress")}>
                        Suppress
                      </Button>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <Empty text="No alerts. Metric thresholds are healthy." />
            )}
          </Panel>

          <Panel title="Device and link status">
            <div className="grid gap-1.5 sm:grid-cols-2">
              {devices.map((device) => {
                const availability = snapshot.metrics.find(
                  (item) => item.metric === "device-availability" && item.scopeId === device.id,
                );
                const utilization = bandwidth.find((item) => item.scopeId === device.id)?.value ?? 0;
                return (
                  <div key={device.id} className="border-border rounded-md border p-2 text-[10px]">
                    <div className="flex justify-between gap-2">
                      <span className="truncate font-medium">{device.hostname}</span>
                      <Badge variant={availability?.healthy ? "success" : "warning"}>
                        {availability?.healthy ? "up" : "down"}
                      </Badge>
                    </div>
                    <div className="bg-muted mt-1.5 h-1.5 overflow-hidden rounded-full">
                      <div className="bg-primary h-full" style={{ width: `${Math.min(100, utilization)}%` }} />
                    </div>
                    <p className="text-muted-foreground mt-1">Link utilization {utilization}%</p>
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>

        <div className="space-y-2">
          <Panel title="Service health">
            <div className="grid grid-cols-3 gap-1.5">
              <ServiceHealth icon={<Wifi />} label="Wi-Fi" snapshot={snapshot} names={["wifi-clients", "rssi"]} />
              <ServiceHealth
                icon={<Database />}
                label="Storage"
                snapshot={snapshot}
                names={["nas-capacity", "raid-state"]}
              />
              <ServiceHealth icon={<Cloud />} label="Cloud" snapshot={snapshot} names={["cloud-resource-status"]} />
            </div>
          </Panel>
          <Panel title="Top talkers">
            {bandwidth
              .slice()
              .sort((a, b) => b.value - a.value)
              .slice(0, 5)
              .map((metric, index) => (
                <div key={metric.id} className="flex items-center gap-2 text-[10px]">
                  <span className="text-muted-foreground w-3">{index + 1}</span>
                  <span className="flex-1 truncate">{metric.label}</span>
                  <span className="font-mono">{metric.value}%</span>
                </div>
              ))}
            {!bandwidth.length && <Empty text="NetFlow data appears when devices are added." />}
          </Panel>
          <Panel title="Incident timeline">
            <div className="max-h-36 space-y-1 overflow-auto" data-testid="monitoring-event-list">
              {snapshot.events
                .slice(-100)
                .reverse()
                .map((event) => (
                  <div key={event.id} className="border-border border-l-2 pl-2 text-[9px]">
                    <span className="font-medium">{event.type}</span>
                    <p className="text-muted-foreground truncate">{event.message}</p>
                  </div>
                ))}
              {!snapshot.events.length && <Empty text="No incidents recorded." />}
            </div>
          </Panel>
        </div>
      </div>
    </section>
  );
}

function MetricCard({
  icon,
  label,
  value,
  warning = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  warning?: boolean;
}) {
  return (
    <div className="border-border flex items-center gap-2 rounded-lg border p-2">
      <span className={warning ? "text-warning" : "text-primary"}>{icon}</span>
      <div>
        <p className="text-muted-foreground text-[9px] uppercase">{label}</p>
        <p className="font-mono text-sm">{value}</p>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-border space-y-1.5 rounded-lg border p-2">
      <h4 className="text-[10px] font-semibold tracking-wide uppercase">{title}</h4>
      {children}
    </div>
  );
}

function ServiceHealth({
  icon,
  label,
  snapshot,
  names,
}: {
  icon: ReactNode;
  label: string;
  snapshot: MonitoringSnapshot;
  names: MonitoringMetricName[];
}) {
  const metrics = snapshot.metrics.filter((metric) => names.includes(metric.metric));
  const healthy = metrics.length > 0 && metrics.every((metric) => metric.healthy);
  return (
    <div className="border-border rounded-md border p-2 text-center text-[9px]">
      <span className={healthy ? "text-success" : "text-muted-foreground"}>{icon}</span>
      <p className="mt-1 font-medium">{label}</p>
      <p className="text-muted-foreground">{metrics.length ? (healthy ? "Healthy" : "Attention") : "No data"}</p>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-muted-foreground py-2 text-center text-[10px]">{text}</p>;
}
