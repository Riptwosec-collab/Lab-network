"use client";

import { useMemo, useState } from "react";
import { Cable, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createDeviceConfigurationState } from "@/domain/configuration/configuration-engine";
import { Layer2Engine } from "@/engine/protocols/layer2-engine";
import { applyDeviceConfiguration } from "@/services/configuration-service";
import { useConfigurationStore } from "@/stores/configuration-store";
import { useLayer2Store } from "@/stores/layer2-store";
import { useTopologyStore } from "@/stores/topology-store";
import type { DeviceRuntimeConfig, NetworkDevice } from "@/types/network";

export function SwitchingConfigurationPanel({ device }: { device: NetworkDevice }) {
  const stored = useConfigurationStore((state) => state.configurationState.devices[device.id]);
  const configuration = stored ?? createDeviceConfigurationState(device);
  const switching = configuration.runningConfig.switching;
  const devices = useTopologyStore((state) => state.devices);
  const connections = useTopologyStore((state) => state.connections);
  const groups = useTopologyStore((state) => state.groups);
  const learnedMacTable = useLayer2Store((state) => state.macTable).filter(
    (entry) => entry.switchDeviceId === device.id,
  );
  const [vlanId, setVlanId] = useState("10");
  const [vlanName, setVlanName] = useState("USERS");
  const [channelId, setChannelId] = useState("1");
  const [channelMembers, setChannelMembers] = useState<string[]>([]);
  const liveTables = useMemo(() => {
    const engine = new Layer2Engine({ devices, connections, groups });
    const firstVlan = switching
      ? (Object.values(switching.vlans).find((vlan) => vlan.status === "active")?.id ?? 1)
      : 1;
    return { spanningTree: engine.calculateSpanningTree(firstVlan), etherChannels: engine.calculateEtherChannels() };
  }, [connections, devices, groups, switching]);

  if (!switching) {
    return <p className="text-muted-foreground text-xs">อุปกรณ์นี้ไม่รองรับ Layer 2 switching configuration</p>;
  }
  const vlans = Object.values(switching.vlans).sort((left, right) => left.id - right.id);

  const apply = (update: (candidate: DeviceRuntimeConfig) => void) => {
    const candidate = structuredClone(configuration.runningConfig);
    update(candidate);
    const result = applyDeviceConfiguration(device.id, candidate, "form");
    if (!result.applied) toast.error(result.validation.issues[0]?.message ?? "Switching configuration ไม่ถูกต้อง");
    return result.applied;
  };

  const addVlan = () => {
    const id = Number(vlanId);
    if (!Number.isInteger(id) || id < 1 || id > 4094 || !vlanName.trim()) {
      toast.error("VLAN ID ต้องอยู่ระหว่าง 1–4094 และต้องมีชื่อ");
      return;
    }
    if (
      apply((candidate) => {
        candidate.switching!.vlans[String(id)] = { id, name: vlanName.trim(), status: "active" };
        if (!candidate.switching!.spanningTree.enabledVlans.includes(id))
          candidate.switching!.spanningTree.enabledVlans.push(id);
      })
    )
      toast.success(`สร้าง VLAN ${id} แล้ว`);
  };

  const addEtherChannel = () => {
    const id = Number(channelId);
    if (!Number.isInteger(id) || id < 1 || id > 255 || channelMembers.length < 2) {
      toast.error("เลือก Channel ID และ member interfaces อย่างน้อย 2 ports");
      return;
    }
    if (
      apply((candidate) => {
        candidate.switching!.etherChannels[String(id)] = {
          id,
          protocol: "lacp",
          mode: "active",
          memberInterfaceIds: channelMembers,
        };
        channelMembers.forEach((interfaceId) => {
          const switchport = candidate.interfaces[interfaceId]?.switchport;
          if (switchport) {
            switchport.channelGroup = id;
            switchport.lacpMode = "active";
          }
        });
      })
    ) {
      setChannelMembers([]);
      toast.success(`สร้าง Port-channel${id} แล้ว`);
    }
  };

  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-2 text-xs font-semibold">VLAN database</h3>
        <div className="grid grid-cols-[72px_1fr_auto] gap-2">
          <Input value={vlanId} onChange={(event) => setVlanId(event.target.value)} aria-label="VLAN ID" />
          <Input value={vlanName} onChange={(event) => setVlanName(event.target.value)} aria-label="VLAN name" />
          <Button size="icon" onClick={addVlan} aria-label="Add VLAN">
            <Plus />
          </Button>
        </div>
        <div className="mt-2 space-y-1.5">
          {vlans.map((vlan) => (
            <div key={vlan.id} className="border-border flex items-center gap-2 rounded-lg border p-2 text-xs">
              <Badge variant="outline">{vlan.id}</Badge>
              <span className="flex-1">{vlan.name}</span>
              <Badge variant={vlan.status === "active" ? "success" : "warning"}>{vlan.status}</Badge>
              {vlan.id !== 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label={`Delete VLAN ${vlan.id}`}
                  onClick={() =>
                    apply((candidate) => {
                      delete candidate.switching!.vlans[String(vlan.id)];
                      candidate.switching!.spanningTree.enabledVlans =
                        candidate.switching!.spanningTree.enabledVlans.filter((item) => item !== vlan.id);
                    })
                  }
                >
                  <Trash2 />
                </Button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold">Switchports</h3>
        <div className="space-y-2">
          {device.interfaces.map((networkInterface) => {
            const switchport = configuration.runningConfig.interfaces[networkInterface.id]?.switchport;
            if (!switchport) return null;
            return (
              <Card key={networkInterface.id}>
                <CardHeader className="p-3 pb-2">
                  <CardTitle className="flex items-center justify-between text-xs">
                    {networkInterface.name}
                    <Badge variant="outline">{networkInterface.status}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2 p-3 pt-0">
                  <Select
                    value={switchport.mode}
                    onValueChange={(mode) =>
                      apply((candidate) => {
                        candidate.interfaces[networkInterface.id]!.switchport!.mode = mode as typeof switchport.mode;
                      })
                    }
                  >
                    <SelectTrigger aria-label={`${networkInterface.name} port mode`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(["access", "trunk", "routed", "dynamic", "disabled"] as const).map((mode) => (
                        <SelectItem key={mode} value={mode}>
                          {mode}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {switchport.mode === "access" && (
                    <Select
                      value={String(switchport.accessVlan)}
                      onValueChange={(value) =>
                        apply((candidate) => {
                          candidate.interfaces[networkInterface.id]!.switchport!.accessVlan = Number(value);
                        })
                      }
                    >
                      <SelectTrigger aria-label={`${networkInterface.name} access VLAN`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {vlans.map((vlan) => (
                          <SelectItem key={vlan.id} value={String(vlan.id)}>
                            VLAN {vlan.id} · {vlan.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {switchport.mode === "trunk" && (
                    <>
                      <Select
                        value={String(switchport.nativeVlan)}
                        onValueChange={(value) =>
                          apply((candidate) => {
                            candidate.interfaces[networkInterface.id]!.switchport!.nativeVlan = Number(value);
                          })
                        }
                      >
                        <SelectTrigger aria-label={`${networkInterface.name} native VLAN`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {vlans.map((vlan) => (
                            <SelectItem key={vlan.id} value={String(vlan.id)}>
                              Native VLAN {vlan.id}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        key={switchport.allowedVlans.join(",")}
                        defaultValue={switchport.allowedVlans.join(",")}
                        aria-label={`${networkInterface.name} allowed VLANs`}
                        onBlur={(event) => {
                          const allowed = event.currentTarget.value
                            .split(",")
                            .map(Number)
                            .filter((item) => Number.isInteger(item));
                          apply((candidate) => {
                            candidate.interfaces[networkInterface.id]!.switchport!.allowedVlans = allowed;
                          });
                        }}
                      />
                    </>
                  )}
                  <label className="flex items-center gap-2 text-[11px]">
                    <input
                      type="checkbox"
                      checked={switchport.portFast}
                      onChange={(event) =>
                        apply((candidate) => {
                          candidate.interfaces[networkInterface.id]!.switchport!.portFast = event.target.checked;
                        })
                      }
                    />
                    PortFast
                  </label>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold">Spanning Tree</h3>
        <div className="grid grid-cols-2 gap-2">
          <Select
            value={switching.spanningTree.mode}
            onValueChange={(mode) =>
              apply((candidate) => {
                candidate.switching!.spanningTree.mode = mode as typeof switching.spanningTree.mode;
              })
            }
          >
            <SelectTrigger aria-label="STP mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rapid-pvst">Rapid PVST</SelectItem>
              <SelectItem value="pvst">PVST</SelectItem>
              <SelectItem value="rstp">RSTP</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={String(switching.spanningTree.priority)}
            onValueChange={(value) =>
              apply((candidate) => {
                candidate.switching!.spanningTree.priority = Number(value);
              })
            }
          >
            <SelectTrigger aria-label="STP priority">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[0, 4096, 8192, 16384, 24576, 32768, 40960, 49152, 57344, 61440].map((priority) => (
                <SelectItem key={priority} value={String(priority)}>
                  Priority {priority}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="border-border mt-2 rounded-lg border p-3 text-xs">
          Root: {liveTables.spanningTree.rootBridgeDeviceId ?? "single-switch topology"}
          <div className="mt-2 space-y-1 font-mono text-[10px]">
            {liveTables.spanningTree.ports
              .filter((port) => port.switchDeviceId === device.id)
              .map((port) => (
                <p key={`${port.interfaceId}-${port.state}`}>
                  {device.interfaces.find((item) => item.id === port.interfaceId)?.name}: {port.role}/{port.state}
                </p>
              ))}
          </div>
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold">EtherChannel / LACP</h3>
        <div className="flex gap-2">
          <Input value={channelId} onChange={(event) => setChannelId(event.target.value)} aria-label="Channel group" />
          <Button variant="outline" onClick={addEtherChannel}>
            <Cable /> Create
          </Button>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1">
          {device.interfaces.map((item) => (
            <label key={item.id} className="border-border flex items-center gap-2 rounded border p-2 text-[10px]">
              <input
                type="checkbox"
                checked={channelMembers.includes(item.id)}
                onChange={(event) =>
                  setChannelMembers((current) =>
                    event.target.checked
                      ? [...current, item.id]
                      : current.filter((interfaceId) => interfaceId !== item.id),
                  )
                }
              />
              {item.name}
            </label>
          ))}
        </div>
        <div className="mt-2 space-y-1.5">
          {liveTables.etherChannels
            .filter((channel) => channel.switchDeviceId === device.id)
            .map((channel) => (
              <div
                key={channel.channelId}
                className="border-border flex items-center justify-between rounded-lg border p-2 text-xs"
              >
                <span>
                  Po{channel.channelId} · {channel.protocol.toUpperCase()}
                </span>
                <Badge variant={channel.status === "up" ? "success" : "warning"}>{channel.status}</Badge>
              </div>
            ))}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold">MAC address table</h3>
        {learnedMacTable.length ? (
          <div className="space-y-1.5 font-mono text-[10px]">
            {learnedMacTable.map((entry) => (
              <div key={`${entry.vlanId}-${entry.macAddress}`} className="border-border rounded border p-2">
                VLAN {entry.vlanId} · {entry.macAddress} →{" "}
                {device.interfaces.find((item) => item.id === entry.interfaceId)?.name}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground border-border rounded-lg border border-dashed p-3 text-[10px]">
            MAC table ยังว่าง — Run Ping เพื่อให้ switch เรียนรู้ source/destination MAC
          </p>
        )}
      </section>
    </div>
  );
}
