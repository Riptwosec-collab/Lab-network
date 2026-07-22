"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Activity, AlertTriangle, CheckCircle2, HeartPulse, Network, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NocDashboard } from "@/components/simulation/noc-dashboard";
import { TroubleshootingMode } from "@/components/simulation/troubleshooting-mode";
import { HighAvailabilityEngine, MonitoringEngine, type NetworkIncident } from "@/engine/operations/operations-engine";
import { OspfEngine } from "@/engine/protocols/ospf-engine";
import { useTopologyStore } from "@/stores/topology-store";

export function OperationsTool() {
  const devices = useTopologyStore((state) => state.devices);
  const connections = useTopologyStore((state) => state.connections);
  const groups = useTopologyStore((state) => state.groups);
  const [incidentStates, setIncidentStates] = useState<Record<string, NetworkIncident["status"]>>({});
  const topology = useMemo(() => ({ devices, connections, groups }), [connections, devices, groups]);
  const monitoring = useMemo(() => new MonitoringEngine(topology), [topology]);
  const metrics = useMemo(() => monitoring.metrics(), [monitoring]);
  const alerts = useMemo(() => monitoring.alerts(), [monitoring]);
  const incidents = useMemo(() => monitoring.incidents(), [monitoring]);
  const haMembers = useMemo(() => new HighAvailabilityEngine(topology).members(), [topology]);
  const ospfNeighbors = useMemo(
    () => devices.flatMap((device) => new OspfEngine(topology).neighbors(device)),
    [devices, topology],
  );
  const availability = metrics.length
    ? Math.round((metrics.filter((item) => item.availability === "up").length / metrics.length) * 1000) / 10
    : 100;

  return (
    <div className="border-border bg-background/80 min-h-64 border-t p-3" data-testid="operations-tool">
      <div className="mb-3 grid gap-2 sm:grid-cols-4">
        <Summary icon={<HeartPulse />} label="Availability" value={`${availability}%`} />
        <Summary icon={<Activity />} label="Metrics" value={String(metrics.length)} />
        <Summary
          icon={<AlertTriangle />}
          label="Active alerts"
          value={String(alerts.length)}
          warning={alerts.length > 0}
        />
        <Summary
          icon={<Network />}
          label="OSPF FULL"
          value={`${ospfNeighbors.filter((item) => item.state === "FULL").length}/${ospfNeighbors.length}`}
        />
      </div>
      <Tabs defaultValue="monitoring">
        <TabsList>
          <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
          <TabsTrigger value="troubleshooting">Troubleshooting</TabsTrigger>
          <TabsTrigger value="incidents">Incidents</TabsTrigger>
          <TabsTrigger value="ha">HA / OSPF</TabsTrigger>
        </TabsList>
        <TabsContent value="monitoring" className="mt-2 max-h-56 overflow-auto">
          <NocDashboard />
        </TabsContent>
        <TabsContent value="troubleshooting" className="mt-2 max-h-56 overflow-auto">
          <TroubleshootingMode />
        </TabsContent>
        <TabsContent value="incidents" className="mt-2 max-h-56 overflow-auto">
          {incidents.length ? (
            <div className="space-y-2">
              {incidents.map((incident) => {
                const status = incidentStates[incident.id] ?? incident.status;
                return (
                  <div key={incident.id} className="border-border rounded-lg border p-2 text-[10px]">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="text-warning size-3.5" />
                      <p className="flex-1 font-medium">{incident.title}</p>
                      <Badge variant={status === "resolved" ? "success" : "warning"}>{status}</Badge>
                    </div>
                    <p className="text-muted-foreground mt-1">{incident.evidence.join(" · ")}</p>
                    <p className="mt-1">Runbook: {incident.suggestedAction}</p>
                    <div className="mt-2 flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setIncidentStates((current) => ({ ...current, [incident.id]: "acknowledged" }))}
                      >
                        Acknowledge
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setIncidentStates((current) => ({ ...current, [incident.id]: "investigating" }))}
                      >
                        Investigate
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => setIncidentStates((current) => ({ ...current, [incident.id]: "resolved" }))}
                      >
                        Resolve
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty message="No active incidents. Alerts will create incidents automatically." success />
          )}
        </TabsContent>
        <TabsContent value="ha" className="mt-2 max-h-56 overflow-auto">
          <div className="grid gap-2 sm:grid-cols-2">
            {haMembers.map((member) => (
              <div key={member.deviceId} className="border-border rounded-lg border p-2 text-[10px]">
                <div className="flex justify-between">
                  <span className="font-medium">
                    {member.hostname} · {member.protocol} {member.groupId}
                  </span>
                  <Badge variant={member.role === "active" || member.role === "master" ? "success" : "outline"}>
                    {member.role}
                  </Badge>
                </div>
                <p className="text-muted-foreground mt-1">
                  VIP {member.virtualIp} · priority {member.effectivePriority} · {member.reason}
                </p>
              </div>
            ))}
            {ospfNeighbors.map((neighbor) => (
              <div
                key={`${neighbor.localDeviceId}:${neighbor.neighborDeviceId}:${neighbor.localInterfaceId}`}
                className="border-border rounded-lg border p-2 text-[10px]"
              >
                <div className="flex justify-between">
                  <span className="font-medium">
                    OSPF {neighbor.neighborRouterId} · area {neighbor.areaId}
                  </span>
                  <Badge variant={neighbor.state === "FULL" ? "success" : "warning"}>{neighbor.state}</Badge>
                </div>
                <p className="text-muted-foreground mt-1">{neighbor.reason}</p>
              </div>
            ))}
          </div>
          {!haMembers.length && !ospfNeighbors.length && (
            <Empty message="Configure HA or OSPF on routing devices to see protocol state." />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Summary({
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

function Empty({ message, success = false }: { message: string; success?: boolean }) {
  return (
    <div className="border-border text-muted-foreground flex items-center gap-2 rounded-lg border border-dashed p-4 text-xs">
      {success ? <CheckCircle2 className="text-success size-4" /> : <Search className="size-4" />}
      {message}
    </div>
  );
}
