import { ipv4ToInteger, analyzeIPv4 } from "@/engine/protocols/ipv4";
import type { ConfigurationValidationResult, NetworkDevice, SecurityRuntimeConfig } from "@/types/network";

export function createSecurityRuntimeConfig(device: NetworkDevice): SecurityRuntimeConfig {
  const wirelessInterfaces = device.interfaces.filter((item) => item.type === "wireless");
  const supportsWireless = device.category === "wireless" || device.capabilities.includes("wireless");
  const defaultSsid = typeof device.configuration.ssid === "string" ? device.configuration.ssid : "NetLab";
  const radios = supportsWireless
    ? Object.fromEntries(
        (wirelessInterfaces.length ? wirelessInterfaces : [{ id: `radio:${device.id}:0` }]).map((item, index) => [
          item.id,
          {
            id: item.id,
            enabled: true,
            band: index === 0 ? ("2.4GHz" as const) : ("5GHz" as const),
            channel: index === 0 ? 6 : 36,
            channelWidthMhz: index === 0 ? (20 as const) : (80 as const),
            txPowerDbm: 20,
          },
        ]),
      )
    : {};
  return {
    firewall: {
      enabled: device.category === "security" || device.capabilities.includes("firewall"),
      zones: {},
      addressObjects: { any: { name: "any", network: "0.0.0.0", prefixLength: 0 } },
      serviceObjects: { any: { name: "any", protocol: "ip", ports: [] } },
      policies: [],
      sessionTimeoutSeconds: 3600,
      natOrder: "after-policy",
    },
    vpn: { tunnels: {} },
    wireless: {
      radios,
      ssids: supportsWireless
        ? {
            [defaultSsid]: {
              id: defaultSsid,
              name: defaultSsid,
              enabled: true,
              bssid: wirelessInterfaces[0]?.macAddress ?? "02:00:00:00:00:01",
              radioIds: Object.keys(radios),
              securityMode: "wpa2-psk",
              preSharedKey: "netlab-demo",
              vlanId: 1,
              guest: false,
              clientIsolation: false,
              captivePortal: false,
              maximumClients: 64,
              roaming: false,
              mesh: false,
            },
          }
        : {},
    },
    radius: { enabled: false, port: 1812, sharedSecret: "", users: {}, clients: [] },
  };
}

export function normalizeSecurityRuntimeConfig(
  device: NetworkDevice,
  current: Partial<SecurityRuntimeConfig> | undefined,
): SecurityRuntimeConfig {
  const defaults = createSecurityRuntimeConfig(device);
  return {
    firewall: {
      ...defaults.firewall,
      ...current?.firewall,
      zones: current?.firewall?.zones ?? defaults.firewall.zones,
      addressObjects: { ...defaults.firewall.addressObjects, ...current?.firewall?.addressObjects },
      serviceObjects: { ...defaults.firewall.serviceObjects, ...current?.firewall?.serviceObjects },
      policies: current?.firewall?.policies ?? [],
    },
    vpn: { tunnels: current?.vpn?.tunnels ?? {} },
    wireless: {
      radios: { ...defaults.wireless.radios, ...current?.wireless?.radios },
      ssids: { ...defaults.wireless.ssids, ...current?.wireless?.ssids },
    },
    radius: {
      ...defaults.radius,
      ...current?.radius,
      users: current?.radius?.users ?? {},
      clients: current?.radius?.clients ?? [],
    },
  };
}

export function validateSecurityRuntimeConfig(
  device: NetworkDevice,
  security: SecurityRuntimeConfig,
): ConfigurationValidationResult["issues"] {
  const issues: ConfigurationValidationResult["issues"] = [];
  const interfaceIds = new Set(device.interfaces.map((item) => item.id));
  for (const [zoneKey, zone] of Object.entries(security.firewall.zones)) {
    zone.interfaceIds.forEach((id) => {
      if (!interfaceIds.has(id))
        issues.push({ path: `security.firewall.zones.${zoneKey}`, message: `ไม่พบ interface ${id}` });
    });
  }
  for (const [key, object] of Object.entries(security.firewall.addressObjects)) {
    if (analyzeIPv4(object.network, object.prefixLength)?.networkAddress !== object.network)
      issues.push({
        path: `security.firewall.addressObjects.${key}`,
        message: "Firewall address object ต้องเป็น network address",
      });
  }
  const policyOrders = new Set<number>();
  for (const [index, policy] of security.firewall.policies.entries()) {
    const path = `security.firewall.policies.${index}`;
    if (policyOrders.has(policy.order)) issues.push({ path: `${path}.order`, message: "Firewall policy order ซ้ำ" });
    policyOrders.add(policy.order);
    if (!security.firewall.zones[policy.sourceZone] || !security.firewall.zones[policy.destinationZone])
      issues.push({ path, message: "Firewall policy อ้างถึง zone ที่ไม่มี" });
    if (
      !security.firewall.addressObjects[policy.sourceAddress] ||
      !security.firewall.addressObjects[policy.destinationAddress]
    )
      issues.push({ path, message: "Firewall policy อ้างถึง address object ที่ไม่มี" });
    if (!security.firewall.serviceObjects[policy.service])
      issues.push({ path, message: "Firewall policy อ้างถึง service object ที่ไม่มี" });
  }
  for (const [key, tunnel] of Object.entries(security.vpn.tunnels)) {
    const path = `security.vpn.tunnels.${key}`;
    if (ipv4ToInteger(tunnel.localPeer) === undefined || ipv4ToInteger(tunnel.remotePeer) === undefined)
      issues.push({ path, message: "VPN peer ต้องเป็น IPv4" });
    if (
      analyzeIPv4(tunnel.localNetwork, tunnel.localPrefixLength)?.networkAddress !== tunnel.localNetwork ||
      analyzeIPv4(tunnel.remoteNetwork, tunnel.remotePrefixLength)?.networkAddress !== tunnel.remoteNetwork
    )
      issues.push({ path, message: "VPN protected networks ต้องเป็น network address" });
    if (tunnel.type !== "gre" && !tunnel.preSharedKey)
      issues.push({ path: `${path}.preSharedKey`, message: "IPSec VPN ต้องมี pre-shared key" });
  }
  for (const [key, ssid] of Object.entries(security.wireless.ssids)) {
    const path = `security.wireless.ssids.${key}`;
    if (!ssid.name.trim()) issues.push({ path: `${path}.name`, message: "SSID ห้ามว่าง" });
    if (ssid.radioIds.some((id) => !security.wireless.radios[id]))
      issues.push({ path: `${path}.radioIds`, message: "SSID อ้างถึง radio ที่ไม่มี" });
    if (
      (ssid.securityMode === "wpa2-psk" || ssid.securityMode === "wpa3-psk") &&
      (!ssid.preSharedKey || ssid.preSharedKey.length < 8)
    )
      issues.push({ path: `${path}.preSharedKey`, message: "WPA pre-shared key ต้องมีอย่างน้อย 8 ตัวอักษร" });
    if (ssid.securityMode.includes("enterprise") && (!ssid.radiusServer || !ssid.radiusSecret))
      issues.push({ path, message: "802.1X SSID ต้องกำหนด RADIUS server และ secret" });
  }
  if (security.radius.enabled && !security.radius.sharedSecret)
    issues.push({ path: "security.radius.sharedSecret", message: "RADIUS server ต้องมี shared secret" });
  return issues;
}

export function renderSecurityRunningConfig(security: SecurityRuntimeConfig): string[] {
  const lines: string[] = [];
  Object.values(security.firewall.zones).forEach((zone) =>
    lines.push(`zone security ${zone.name} interfaces ${zone.interfaceIds.join(",")}`),
  );
  [...security.firewall.policies]
    .sort((a, b) => a.order - b.order)
    .forEach((policy) =>
      lines.push(
        `security-policy ${policy.order} ${policy.name} from ${policy.sourceZone} to ${policy.destinationZone} ${policy.action}${policy.logging ? " log" : ""}`,
      ),
    );
  Object.values(security.vpn.tunnels).forEach((tunnel) =>
    lines.push(
      `vpn tunnel ${tunnel.name} ${tunnel.type} peer ${tunnel.remotePeer} ${tunnel.encryption}-${tunnel.hash}`,
    ),
  );
  Object.values(security.wireless.ssids).forEach((ssid) =>
    lines.push(`wireless ssid ${ssid.name} security ${ssid.securityMode} vlan ${ssid.vlanId}`),
  );
  if (security.radius.enabled) lines.push(`radius-server local auth-port ${security.radius.port}`);
  return lines;
}
