"use client";

import { useState } from "react";
import { Database, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createDeviceConfigurationState } from "@/domain/configuration/configuration-engine";
import { applyDeviceConfiguration } from "@/services/configuration-service";
import { useConfigurationStore } from "@/stores/configuration-store";
import type { AclProtocol, DeviceRuntimeConfig, DnsRecordType, NatRuleType, NetworkDevice } from "@/types/network";

type ServiceName = "dhcp" | "dns" | "nat" | "acl";

export function ServicesConfigurationPanel({ device }: { device: NetworkDevice }) {
  const stored = useConfigurationStore((state) => state.configurationState.devices[device.id]);
  const configuration = stored ?? createDeviceConfigurationState(device);
  const services = configuration.runningConfig.services;
  const [poolName, setPoolName] = useState("LAN");
  const [poolNetwork, setPoolNetwork] = useState("192.168.10.0");
  const [poolPrefix, setPoolPrefix] = useState("24");
  const [poolGateway, setPoolGateway] = useState("192.168.10.1");
  const [poolDns, setPoolDns] = useState("8.8.8.8");
  const [poolLease, setPoolLease] = useState("86400");
  const [poolMaximum, setPoolMaximum] = useState("200");
  const [excludedStart, setExcludedStart] = useState("");
  const [excludedEnd, setExcludedEnd] = useState("");
  const [reservationIp, setReservationIp] = useState("");
  const [reservationClient, setReservationClient] = useState("");
  const [helperAddress, setHelperAddress] = useState("");
  const [zoneName, setZoneName] = useState("lab.local");
  const [recordName, setRecordName] = useState("server.lab.local");
  const [recordType, setRecordType] = useState<DnsRecordType>("A");
  const [recordValue, setRecordValue] = useState("192.168.10.10");
  const [dnsForwarder, setDnsForwarder] = useState("");
  const [natType, setNatType] = useState<NatRuleType>("pat");
  const [natSource, setNatSource] = useState("192.168.10.0");
  const [natPrefix, setNatPrefix] = useState("24");
  const [natTranslated, setNatTranslated] = useState("203.0.113.10");
  const [natPoolName, setNatPoolName] = useState("PUBLIC");
  const [natPoolStart, setNatPoolStart] = useState("203.0.113.10");
  const [natPoolEnd, setNatPoolEnd] = useState("203.0.113.20");
  const [natOriginalPort, setNatOriginalPort] = useState("");
  const [natTranslatedPort, setNatTranslatedPort] = useState("");
  const [aclName, setAclName] = useState("EDGE-IN");
  const [aclSequence, setAclSequence] = useState("10");
  const [aclAction, setAclAction] = useState<"permit" | "deny">("permit");
  const [aclProtocol, setAclProtocol] = useState<AclProtocol>("icmp");
  const [aclSource, setAclSource] = useState("0.0.0.0");
  const [aclSourcePrefix, setAclSourcePrefix] = useState("0");
  const [aclDestination, setAclDestination] = useState("0.0.0.0");
  const [aclDestinationPrefix, setAclDestinationPrefix] = useState("0");
  const [aclSourcePort, setAclSourcePort] = useState("");
  const [aclDestinationPort, setAclDestinationPort] = useState("");
  const [assignmentInterface, setAssignmentInterface] = useState(device.interfaces[0]?.id ?? "");
  const [assignmentDirection, setAssignmentDirection] = useState<"in" | "out">("out");

  const apply = (update: (candidate: DeviceRuntimeConfig) => void) => {
    const candidate = structuredClone(configuration.runningConfig);
    update(candidate);
    const result = applyDeviceConfiguration(device.id, candidate, "form");
    if (!result.applied) toast.error(result.validation.issues[0]?.message ?? "Services configuration ไม่ถูกต้อง");
    return result.applied;
  };

  const toggle = (name: ServiceName, enabled: boolean) =>
    apply((candidate) => {
      candidate.services[name].enabled = enabled;
    });

  const addPool = () => {
    if (
      apply((candidate) => {
        candidate.services.dhcp.enabled = true;
        candidate.services.dhcp.pools[poolName] = {
          name: poolName,
          network: poolNetwork,
          prefixLength: Number(poolPrefix),
          defaultGateway: poolGateway,
          dnsServers: poolDns
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          domainName: zoneName,
          leaseSeconds: Number(poolLease),
          maximumLeases: Number(poolMaximum),
          excludedRanges: excludedStart && excludedEnd ? [{ start: excludedStart, end: excludedEnd }] : [],
          reservations:
            reservationIp && reservationClient
              ? [{ ipAddress: reservationIp, clientIdentifier: reservationClient }]
              : [],
          relayAddresses: helperAddress ? [helperAddress] : [],
        };
      })
    )
      toast.success(`เพิ่ม DHCP pool ${poolName} แล้ว`);
  };

  const addDnsRecord = () => {
    if (
      apply((candidate) => {
        candidate.services.dns.enabled = true;
        candidate.services.dns.forwarders = dnsForwarder ? [dnsForwarder] : [];
        const zone = (candidate.services.dns.zones[zoneName] ??= {
          name: zoneName,
          authoritative: true,
          reverse: zoneName.endsWith("in-addr.arpa"),
          records: [],
        });
        zone.records.push({
          id: `${recordType}:${recordName}:${Date.now()}`,
          name: recordName,
          type: recordType,
          value: recordValue,
          ttl: 300,
          priority: recordType === "MX" ? 10 : undefined,
        });
      })
    )
      toast.success(`เพิ่ม ${recordType} record แล้ว`);
  };

  const addNatRule = () => {
    if (
      apply((candidate) => {
        candidate.services.nat.enabled = true;
        candidate.services.nat.rules.push({
          id: `nat-${Date.now()}`,
          order: candidate.services.nat.rules.length * 10 + 10,
          enabled: true,
          type: natType,
          source: natSource,
          sourcePrefixLength: Number(natPrefix),
          destination: "0.0.0.0",
          destinationPrefixLength: 0,
          translatedAddress: natType === "exemption" ? undefined : natTranslated,
          poolName: candidate.services.nat.pools[natPoolName] ? natPoolName : undefined,
          insideInterfaceId: device.interfaces[0]?.id,
          outsideInterfaceId: device.interfaces[1]?.id,
          protocol: "ip",
          originalPort: natOriginalPort ? Number(natOriginalPort) : undefined,
          translatedPort: natTranslatedPort ? Number(natTranslatedPort) : undefined,
        });
      })
    )
      toast.success(`เพิ่ม NAT rule ${natType} แล้ว`);
  };

  const addNatPool = () => {
    if (
      apply((candidate) => {
        candidate.services.nat.enabled = true;
        candidate.services.nat.pools[natPoolName] = {
          name: natPoolName,
          startAddress: natPoolStart,
          endAddress: natPoolEnd,
          prefixLength: 24,
        };
      })
    )
      toast.success(`เพิ่ม NAT pool ${natPoolName} แล้ว`);
  };

  const addAclRule = () => {
    if (
      apply((candidate) => {
        candidate.services.acl.enabled = true;
        const acl = (candidate.services.acl.accessLists[aclName] ??= {
          name: aclName,
          type: "extended",
          rules: [],
        });
        acl.rules = acl.rules.filter((rule) => rule.sequence !== Number(aclSequence));
        acl.rules.push({
          sequence: Number(aclSequence),
          action: aclAction,
          protocol: aclProtocol,
          source: aclSource,
          sourcePrefixLength: Number(aclSourcePrefix),
          destination: aclDestination,
          destinationPrefixLength: Number(aclDestinationPrefix),
          sourcePort: aclSourcePort ? Number(aclSourcePort) : undefined,
          destinationPort: aclDestinationPort ? Number(aclDestinationPort) : undefined,
          logging: aclAction === "deny",
        });
      })
    )
      toast.success(`เพิ่ม ACL ${aclName} sequence ${aclSequence} แล้ว`);
  };

  const assignAcl = () => {
    if (
      apply((candidate) => {
        candidate.services.acl.enabled = true;
        candidate.services.acl.assignments = candidate.services.acl.assignments.filter(
          (item) => !(item.interfaceId === assignmentInterface && item.direction === assignmentDirection),
        );
        candidate.services.acl.assignments.push({
          interfaceId: assignmentInterface,
          direction: assignmentDirection,
          aclName,
        });
      })
    )
      toast.success(`ผูก ${aclName} ${assignmentDirection} แล้ว`);
  };

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-2">
        {(["dhcp", "dns", "nat", "acl"] as const).map((name) => (
          <label key={name} className="border-border flex items-center justify-between rounded-lg border p-2 text-xs">
            <span className="font-semibold uppercase">{name}</span>
            <input
              type="checkbox"
              checked={services[name].enabled}
              onChange={(event) => toggle(name, event.target.checked)}
              aria-label={`Enable ${name.toUpperCase()}`}
            />
          </label>
        ))}
      </section>

      <ServiceSection title="DHCP pools" badge={`${Object.keys(services.dhcp.pools).length} pools`}>
        <div className="grid grid-cols-2 gap-2">
          <Input value={poolName} onChange={(event) => setPoolName(event.target.value)} aria-label="DHCP pool name" />
          <Input
            value={poolNetwork}
            onChange={(event) => setPoolNetwork(event.target.value)}
            aria-label="DHCP network"
          />
          <Input value={poolPrefix} onChange={(event) => setPoolPrefix(event.target.value)} aria-label="DHCP prefix" />
          <Input
            value={poolGateway}
            onChange={(event) => setPoolGateway(event.target.value)}
            aria-label="DHCP gateway"
          />
          <Input
            value={poolDns}
            onChange={(event) => setPoolDns(event.target.value)}
            aria-label="DHCP DNS servers"
            className="col-span-2"
          />
          <Input
            value={poolLease}
            onChange={(event) => setPoolLease(event.target.value)}
            aria-label="DHCP lease seconds"
          />
          <Input
            value={poolMaximum}
            onChange={(event) => setPoolMaximum(event.target.value)}
            aria-label="DHCP maximum leases"
          />
          <Input
            value={excludedStart}
            onChange={(event) => setExcludedStart(event.target.value)}
            aria-label="DHCP excluded start"
            placeholder="Excluded start"
          />
          <Input
            value={excludedEnd}
            onChange={(event) => setExcludedEnd(event.target.value)}
            aria-label="DHCP excluded end"
            placeholder="Excluded end"
          />
          <Input
            value={reservationIp}
            onChange={(event) => setReservationIp(event.target.value)}
            aria-label="DHCP reservation address"
            placeholder="Reservation IP"
          />
          <Input
            value={reservationClient}
            onChange={(event) => setReservationClient(event.target.value)}
            aria-label="DHCP client identifier"
            placeholder="Client identifier"
          />
          <Input
            value={helperAddress}
            onChange={(event) => setHelperAddress(event.target.value)}
            aria-label="DHCP helper address"
            placeholder="Relay / helper address"
            className="col-span-2"
          />
        </div>
        <Button size="sm" className="mt-2 w-full" onClick={addPool}>
          <Plus /> Add DHCP pool
        </Button>
        <div className="mt-2 space-y-1.5">
          {Object.values(services.dhcp.pools).map((pool) => (
            <ConfigRow key={pool.name} label={`${pool.name} · ${pool.network}/${pool.prefixLength}`}>
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                aria-label={`Remove DHCP pool ${pool.name}`}
                onClick={() => apply((candidate) => void delete candidate.services.dhcp.pools[pool.name])}
              >
                <Trash2 />
              </Button>
            </ConfigRow>
          ))}
        </div>
      </ServiceSection>

      <ServiceSection
        title="DNS authoritative zones"
        badge={`${Object.values(services.dns.zones).reduce((count, zone) => count + zone.records.length, 0)} records`}
      >
        <Input value={zoneName} onChange={(event) => setZoneName(event.target.value)} aria-label="DNS zone name" />
        <div className="mt-2 flex items-center gap-2">
          <Input
            value={dnsForwarder}
            onChange={(event) => setDnsForwarder(event.target.value)}
            aria-label="DNS forwarder"
            placeholder="Optional forwarder IPv4"
          />
          <label className="flex items-center gap-1 text-[10px]">
            <input
              type="checkbox"
              checked={services.dns.recursive}
              onChange={(event) =>
                apply((candidate) => {
                  candidate.services.dns.recursive = event.target.checked;
                })
              }
              aria-label="Enable recursive DNS"
            />
            Recursive
          </label>
        </div>
        <div className="mt-2 grid grid-cols-[90px_1fr] gap-2">
          <Select value={recordType} onValueChange={(value) => setRecordType(value as DnsRecordType)}>
            <SelectTrigger aria-label="DNS record type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["A", "AAAA", "CNAME", "MX", "PTR", "TXT", "NS"] as const).map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={recordName}
            onChange={(event) => setRecordName(event.target.value)}
            aria-label="DNS record name"
          />
          <Input
            value={recordValue}
            onChange={(event) => setRecordValue(event.target.value)}
            aria-label="DNS record value"
            className="col-span-2"
          />
        </div>
        <Button size="sm" className="mt-2 w-full" onClick={addDnsRecord}>
          <Plus /> Add DNS record
        </Button>
        <div className="mt-2 space-y-1.5">
          {Object.values(services.dns.zones).flatMap((zone) =>
            zone.records.map((record) => (
              <ConfigRow key={record.id} label={`${record.type} ${record.name} → ${record.value}`}>
                <Badge variant="outline">TTL {record.ttl}</Badge>
              </ConfigRow>
            )),
          )}
        </div>
      </ServiceSection>

      <ServiceSection title="NAT / PAT rules" badge={`${services.nat.rules.length} rules`}>
        <div className="grid grid-cols-2 gap-2">
          <Select value={natType} onValueChange={(value) => setNatType(value as NatRuleType)}>
            <SelectTrigger aria-label="NAT rule type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["static", "dynamic", "pat", "source", "destination", "port-forward", "exemption"] as const).map(
                (type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
          <Input value={natSource} onChange={(event) => setNatSource(event.target.value)} aria-label="NAT source" />
          <Input
            value={natPrefix}
            onChange={(event) => setNatPrefix(event.target.value)}
            aria-label="NAT source prefix"
          />
          <Input
            value={natTranslated}
            onChange={(event) => setNatTranslated(event.target.value)}
            aria-label="NAT translated address"
          />
          <Input
            value={natOriginalPort}
            onChange={(event) => setNatOriginalPort(event.target.value)}
            aria-label="NAT original port"
            placeholder="Original port"
          />
          <Input
            value={natTranslatedPort}
            onChange={(event) => setNatTranslatedPort(event.target.value)}
            aria-label="NAT translated port"
            placeholder="Translated port"
          />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Input
            value={natPoolName}
            onChange={(event) => setNatPoolName(event.target.value)}
            aria-label="NAT pool name"
          />
          <Input
            value={natPoolStart}
            onChange={(event) => setNatPoolStart(event.target.value)}
            aria-label="NAT pool start"
          />
          <Input value={natPoolEnd} onChange={(event) => setNatPoolEnd(event.target.value)} aria-label="NAT pool end" />
          <Button size="sm" variant="outline" onClick={addNatPool}>
            <Plus /> Add pool
          </Button>
        </div>
        <Button size="sm" className="mt-2 w-full" onClick={addNatRule}>
          <Plus /> Add NAT rule
        </Button>
        <div className="mt-2 space-y-1.5">
          {services.nat.rules.map((rule, index) => (
            <ConfigRow
              key={rule.id}
              label={`${rule.order} ${rule.type} ${rule.source}/${rule.sourcePrefixLength} → ${rule.translatedAddress ?? "exempt"}`}
            >
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                aria-label={`Remove NAT rule ${rule.order}`}
                onClick={() => apply((candidate) => void candidate.services.nat.rules.splice(index, 1))}
              >
                <Trash2 />
              </Button>
            </ConfigRow>
          ))}
        </div>
      </ServiceSection>

      <ServiceSection title="Ordered ACL policy" badge={`${Object.keys(services.acl.accessLists).length} ACLs`}>
        <div className="grid grid-cols-2 gap-2">
          <Input value={aclName} onChange={(event) => setAclName(event.target.value)} aria-label="ACL name" />
          <Input
            value={aclSequence}
            onChange={(event) => setAclSequence(event.target.value)}
            aria-label="ACL sequence"
          />
          <Select value={aclAction} onValueChange={(value) => setAclAction(value as "permit" | "deny")}>
            <SelectTrigger aria-label="ACL action">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="permit">permit</SelectItem>
              <SelectItem value="deny">deny</SelectItem>
            </SelectContent>
          </Select>
          <Select value={aclProtocol} onValueChange={(value) => setAclProtocol(value as AclProtocol)}>
            <SelectTrigger aria-label="ACL protocol">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["ip", "icmp", "tcp", "udp"] as const).map((protocol) => (
                <SelectItem key={protocol} value={protocol}>
                  {protocol}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input value={aclSource} onChange={(event) => setAclSource(event.target.value)} aria-label="ACL source" />
          <Input
            value={aclSourcePrefix}
            onChange={(event) => setAclSourcePrefix(event.target.value)}
            aria-label="ACL source prefix"
          />
          <Input
            value={aclDestination}
            onChange={(event) => setAclDestination(event.target.value)}
            aria-label="ACL destination"
          />
          <Input
            value={aclDestinationPrefix}
            onChange={(event) => setAclDestinationPrefix(event.target.value)}
            aria-label="ACL destination prefix"
          />
          <Input
            value={aclSourcePort}
            onChange={(event) => setAclSourcePort(event.target.value)}
            aria-label="ACL source port"
            placeholder="Optional source port"
          />
          <Input
            value={aclDestinationPort}
            onChange={(event) => setAclDestinationPort(event.target.value)}
            aria-label="ACL destination port"
            placeholder="Optional destination port"
          />
        </div>
        <Button size="sm" className="mt-2 w-full" onClick={addAclRule}>
          <ShieldCheck /> Add / replace ACL rule
        </Button>
        <div className="mt-2 grid grid-cols-[1fr_75px] gap-2">
          <Select value={assignmentInterface} onValueChange={setAssignmentInterface}>
            <SelectTrigger aria-label="ACL interface">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {device.interfaces.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={assignmentDirection} onValueChange={(value) => setAssignmentDirection(value as "in" | "out")}>
            <SelectTrigger aria-label="ACL direction">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="in">in</SelectItem>
              <SelectItem value="out">out</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" variant="outline" className="mt-2 w-full" onClick={assignAcl}>
          Apply ACL to interface
        </Button>
        <div className="mt-2 space-y-1.5">
          {Object.values(services.acl.accessLists).flatMap((acl) =>
            [...acl.rules]
              .sort((a, b) => a.sequence - b.sequence)
              .map((rule) => (
                <ConfigRow
                  key={`${acl.name}:${rule.sequence}`}
                  label={`${acl.name} ${rule.sequence} ${rule.action} ${rule.protocol} ${rule.source}/${rule.sourcePrefixLength} → ${rule.destination}/${rule.destinationPrefixLength}`}
                >
                  <Badge variant={rule.action === "permit" ? "success" : "warning"}>{rule.action}</Badge>
                </ConfigRow>
              )),
          )}
          {services.acl.assignments.map((item) => (
            <ConfigRow
              key={`${item.interfaceId}:${item.direction}`}
              label={`${device.interfaces.find((networkInterface) => networkInterface.id === item.interfaceId)?.name ?? item.interfaceId} ${item.direction} · ${item.aclName}`}
            >
              <Badge variant="outline">bound</Badge>
            </ConfigRow>
          ))}
        </div>
      </ServiceSection>
    </div>
  );
}

function ServiceSection({ title, badge, children }: { title: string; badge: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <Database className="text-primary size-3.5" />
        <h3 className="text-xs font-semibold">{title}</h3>
        <Badge variant="outline" className="ml-auto">
          {badge}
        </Badge>
      </div>
      {children}
    </section>
  );
}

function ConfigRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-border flex items-center gap-2 rounded-lg border p-2 text-[10px]">
      <code className="min-w-0 flex-1 break-all">{label}</code>
      {children}
    </div>
  );
}
