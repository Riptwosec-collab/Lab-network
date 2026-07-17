"use client";

import { useState } from "react";
import { Plus, Shield, Trash2, Wifi } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createDeviceConfigurationState } from "@/domain/configuration/configuration-engine";
import { applyDeviceConfiguration } from "@/services/configuration-service";
import { useConfigurationStore } from "@/stores/configuration-store";
import type { DeviceRuntimeConfig, NetworkDevice, WirelessSsidRuntimeConfig } from "@/types/network";

export function SecurityConfigurationPanel({ device }: { device: NetworkDevice }) {
  const stored = useConfigurationStore((state) => state.configurationState.devices[device.id]);
  const configuration = stored ?? createDeviceConfigurationState(device);
  const security = configuration.runningConfig.security;
  const [policyName, setPolicyName] = useState("ALLOW-TRUST-OUT");
  const [policyAction, setPolicyAction] = useState<"allow" | "deny">("allow");
  const [localPeer, setLocalPeer] = useState(device.interfaces.find((item) => item.ipv4)?.ipv4 ?? "192.0.2.1");
  const [remotePeer, setRemotePeer] = useState("192.0.2.2");
  const [localNetwork, setLocalNetwork] = useState("10.1.0.0");
  const [remoteNetwork, setRemoteNetwork] = useState("10.2.0.0");
  const [vpnKey, setVpnKey] = useState("netlab-vpn-key");
  const [ssidName, setSsidName] = useState(Object.values(security.wireless.ssids)[0]?.name ?? "NetLab-Secure");
  const [ssidMode, setSsidMode] = useState<WirelessSsidRuntimeConfig["securityMode"]>("wpa2-psk");
  const [ssidPassword, setSsidPassword] = useState("netlab-demo");
  const [ssidVlan, setSsidVlan] = useState("1");
  const [radiusServer, setRadiusServer] = useState("192.168.1.20");
  const [radiusSecret, setRadiusSecret] = useState("radius-secret");
  const [radiusUser, setRadiusUser] = useState("student");
  const [radiusPassword, setRadiusPassword] = useState("netlab123");

  const apply = (update: (candidate: DeviceRuntimeConfig) => void) => {
    const candidate = structuredClone(configuration.runningConfig);
    update(candidate);
    const result = applyDeviceConfiguration(device.id, candidate, "form");
    if (!result.applied) toast.error(result.validation.issues[0]?.message ?? "Security configuration ไม่ถูกต้อง");
    return result.applied;
  };

  const initializeZones = () =>
    apply((candidate) => {
      candidate.security.firewall.enabled = true;
      const outside = device.interfaces[0]?.id;
      const inside = device.interfaces[1]?.id ?? device.interfaces[0]?.id;
      candidate.security.firewall.zones = {
        untrust: { name: "untrust", interfaceIds: outside ? [outside] : [] },
        trust: { name: "trust", interfaceIds: inside ? [inside] : [] },
      };
    });

  const addPolicy = () => {
    if (
      apply((candidate) => {
        candidate.security.firewall.enabled = true;
        candidate.security.firewall.policies.push({
          id: `policy-${Date.now()}`,
          order: candidate.security.firewall.policies.length * 10 + 10,
          enabled: true,
          name: policyName,
          sourceZone: "trust",
          destinationZone: "untrust",
          sourceAddress: "any",
          destinationAddress: "any",
          service: "any",
          application: "any",
          action: policyAction,
          logging: true,
          schedule: "always",
        });
      })
    )
      toast.success(`เพิ่ม firewall policy ${policyName} แล้ว`);
  };

  const addVpn = () => {
    const id = `vpn-${Date.now()}`;
    if (
      apply((candidate) => {
        candidate.security.vpn.tunnels[id] = {
          id,
          name: "SITE-TO-SITE",
          type: "site-to-site",
          enabled: true,
          localPeer,
          remotePeer,
          localNetwork,
          localPrefixLength: 24,
          remoteNetwork,
          remotePrefixLength: 24,
          preSharedKey: vpnKey,
          encryption: "aes256",
          hash: "sha256",
          ikeVersion: "ikev2",
          lifetimeSeconds: 3600,
          routeThroughTunnel: true,
        };
      })
    )
      toast.success("เพิ่ม IPSec site-to-site tunnel แล้ว");
  };

  const saveSsid = () => {
    if (
      apply((candidate) => {
        const radioIds = Object.keys(candidate.security.wireless.radios);
        candidate.security.wireless.ssids[ssidName] = {
          id: ssidName,
          name: ssidName,
          enabled: true,
          bssid: device.interfaces.find((item) => item.type === "wireless")?.macAddress ?? "02:00:00:00:00:01",
          radioIds,
          securityMode: ssidMode,
          preSharedKey: ssidMode.endsWith("psk") ? ssidPassword : undefined,
          radiusServer: ssidMode.endsWith("enterprise") ? radiusServer : undefined,
          radiusSecret: ssidMode.endsWith("enterprise") ? radiusSecret : undefined,
          vlanId: Number(ssidVlan),
          guest: false,
          clientIsolation: false,
          captivePortal: false,
          maximumClients: 64,
          roaming: true,
          mesh: false,
        };
      })
    )
      toast.success(`บันทึก SSID ${ssidName} แล้ว`);
  };

  const enableRadius = () => {
    if (
      apply((candidate) => {
        candidate.security.radius.enabled = true;
        candidate.security.radius.sharedSecret = radiusSecret;
        candidate.security.radius.users[radiusUser] = {
          username: radiusUser,
          password: radiusPassword,
          vlanId: Number(ssidVlan),
          enabled: true,
        };
      })
    )
      toast.success("เปิด RADIUS และเพิ่มผู้ใช้แล้ว");
  };

  return (
    <div className="space-y-6">
      <Section title="Stateful Firewall" count={`${security.firewall.policies.length} policies`}>
        <Button size="sm" variant="outline" className="w-full" onClick={initializeZones}>
          <Shield /> Initialize trust / untrust zones
        </Button>
        <div className="mt-2 grid grid-cols-[1fr_100px] gap-2">
          <Input
            value={policyName}
            onChange={(event) => setPolicyName(event.target.value)}
            aria-label="Firewall policy name"
          />
          <Select value={policyAction} onValueChange={(value) => setPolicyAction(value as "allow" | "deny")}>
            <SelectTrigger aria-label="Firewall policy action">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="allow">allow</SelectItem>
              <SelectItem value="deny">deny</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" className="mt-2 w-full" onClick={addPolicy}>
          <Plus /> Add first-match policy
        </Button>
        <Rows>
          {[...security.firewall.policies]
            .sort((a, b) => a.order - b.order)
            .map((policy, index) => (
              <Row
                key={policy.id}
                text={`${policy.order} ${policy.sourceZone} → ${policy.destinationZone} · ${policy.action}`}
              >
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  aria-label={`Remove firewall policy ${policy.name}`}
                  onClick={() => apply((candidate) => void candidate.security.firewall.policies.splice(index, 1))}
                >
                  <Trash2 />
                </Button>
              </Row>
            ))}
        </Rows>
      </Section>

      <Section title="VPN Tunnels" count={`${Object.keys(security.vpn.tunnels).length} tunnels`}>
        <div className="grid grid-cols-2 gap-2">
          <Input value={localPeer} onChange={(event) => setLocalPeer(event.target.value)} aria-label="VPN local peer" />
          <Input
            value={remotePeer}
            onChange={(event) => setRemotePeer(event.target.value)}
            aria-label="VPN remote peer"
          />
          <Input
            value={localNetwork}
            onChange={(event) => setLocalNetwork(event.target.value)}
            aria-label="VPN local network"
          />
          <Input
            value={remoteNetwork}
            onChange={(event) => setRemoteNetwork(event.target.value)}
            aria-label="VPN remote network"
          />
          <Input
            value={vpnKey}
            onChange={(event) => setVpnKey(event.target.value)}
            aria-label="VPN pre-shared key"
            className="col-span-2"
          />
        </div>
        <Button size="sm" className="mt-2 w-full" onClick={addVpn}>
          <Plus /> Add AES256 / IKEv2 tunnel
        </Button>
        <Rows>
          {Object.values(security.vpn.tunnels).map((tunnel) => (
            <Row key={tunnel.id} text={`${tunnel.name} · ${tunnel.localPeer} ↔ ${tunnel.remotePeer}`}>
              <Badge variant="outline">configured</Badge>
            </Row>
          ))}
        </Rows>
      </Section>

      <Section title="Wireless SSIDs / Radios" count={`${Object.keys(security.wireless.ssids).length} SSIDs`}>
        <div className="grid grid-cols-2 gap-2">
          <Input value={ssidName} onChange={(event) => setSsidName(event.target.value)} aria-label="Wireless SSID" />
          <Select
            value={ssidMode}
            onValueChange={(value) => setSsidMode(value as WirelessSsidRuntimeConfig["securityMode"])}
          >
            <SelectTrigger aria-label="Wireless security mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["open", "wpa2-psk", "wpa3-psk", "wpa2-enterprise", "wpa3-enterprise"].map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {mode}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={ssidPassword}
            onChange={(event) => setSsidPassword(event.target.value)}
            aria-label="Wireless password"
          />
          <Input value={ssidVlan} onChange={(event) => setSsidVlan(event.target.value)} aria-label="Wireless VLAN" />
        </div>
        <Button size="sm" className="mt-2 w-full" onClick={saveSsid}>
          <Wifi /> Save SSID
        </Button>
        <Rows>
          {Object.values(security.wireless.ssids).map((ssid) => (
            <Row key={ssid.id} text={`${ssid.name} · ${ssid.securityMode} · VLAN ${ssid.vlanId}`}>
              <Badge variant={ssid.enabled ? "success" : "warning"}>{ssid.enabled ? "broadcast" : "disabled"}</Badge>
            </Row>
          ))}
        </Rows>
      </Section>

      <Section title="RADIUS / 802.1X" count={`${Object.keys(security.radius.users).length} users`}>
        <div className="grid grid-cols-2 gap-2">
          <Input
            value={radiusServer}
            onChange={(event) => setRadiusServer(event.target.value)}
            aria-label="RADIUS server address"
          />
          <Input
            value={radiusSecret}
            onChange={(event) => setRadiusSecret(event.target.value)}
            aria-label="RADIUS shared secret"
          />
          <Input
            value={radiusUser}
            onChange={(event) => setRadiusUser(event.target.value)}
            aria-label="RADIUS username"
          />
          <Input
            value={radiusPassword}
            onChange={(event) => setRadiusPassword(event.target.value)}
            aria-label="RADIUS password"
          />
        </div>
        <Button size="sm" className="mt-2 w-full" onClick={enableRadius}>
          Enable local RADIUS user
        </Button>
      </Section>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center">
        <h3 className="text-xs font-semibold">{title}</h3>
        <Badge variant="outline" className="ml-auto">
          {count}
        </Badge>
      </div>
      {children}
    </section>
  );
}
function Rows({ children }: { children: React.ReactNode }) {
  return <div className="mt-2 space-y-1.5">{children}</div>;
}
function Row({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <div className="border-border flex items-center gap-2 rounded-lg border p-2 text-[10px]">
      <code className="min-w-0 flex-1 break-all">{text}</code>
      {children}
    </div>
  );
}
