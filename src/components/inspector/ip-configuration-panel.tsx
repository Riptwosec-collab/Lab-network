"use client";

import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Calculator, Save } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { analyzeIPv4, ipv4ToInteger, validateInterfaceIPv4 } from "@/engine/protocols/ipv4";
import { useTopologyStore } from "@/stores/topology-store";
import type { InterfaceStatus, NetworkDevice } from "@/types/network";

const ipFormSchema = z
  .object({
    ipv4: z.string().trim(),
    prefixLength: z.string().trim(),
    defaultGateway: z.string().trim(),
  })
  .superRefine((value, context) => {
    if (!value.ipv4) {
      if (value.prefixLength || value.defaultGateway)
        context.addIssue({ code: "custom", path: ["ipv4"], message: "กรุณาระบุ IPv4 ก่อน Prefix หรือ Gateway" });
      return;
    }
    if (ipv4ToInteger(value.ipv4) === undefined)
      context.addIssue({ code: "custom", path: ["ipv4"], message: "รูปแบบ IPv4 ไม่ถูกต้อง" });
    const prefix = Number(value.prefixLength);
    if (!/^\d+$/.test(value.prefixLength) || prefix < 0 || prefix > 32)
      context.addIssue({ code: "custom", path: ["prefixLength"], message: "Prefix ต้องอยู่ระหว่าง 0–32" });
    if (value.defaultGateway && ipv4ToInteger(value.defaultGateway) === undefined)
      context.addIssue({ code: "custom", path: ["defaultGateway"], message: "รูปแบบ Gateway ไม่ถูกต้อง" });
  });

type IpFormValues = z.infer<typeof ipFormSchema>;

export function IpConfigurationPanel({ device }: { device: NetworkDevice }) {
  const [selectedInterfaceId, setSelectedInterfaceId] = useState(device.interfaces[0]?.id ?? "");
  const [statusOverride, setStatusOverride] = useState<{ interfaceId: string; status: InterfaceStatus }>();
  const [domainError, setDomainError] = useState<string>();
  const devices = useTopologyStore((state) => state.devices);
  const connections = useTopologyStore((state) => state.connections);
  const groups = useTopologyStore((state) => state.groups);
  const updateDevice = useTopologyStore((state) => state.updateDevice);
  const selectedInterface = device.interfaces.find((item) => item.id === selectedInterfaceId) ?? device.interfaces[0];
  const form = useForm<IpFormValues>({
    resolver: zodResolver(ipFormSchema),
    defaultValues: { ipv4: "", prefixLength: "24", defaultGateway: "" },
  });
  const address = useWatch({ control: form.control, name: "ipv4" });
  const prefix = useWatch({ control: form.control, name: "prefixLength" });
  const preview = useMemo(() => analyzeIPv4(address, Number(prefix)), [address, prefix]);
  const interfaceStatus =
    statusOverride?.interfaceId === selectedInterface?.id ? statusOverride.status : selectedInterface?.status;

  useEffect(() => {
    if (!selectedInterface) return;
    form.reset({
      ipv4: selectedInterface.ipv4 ?? "",
      prefixLength: selectedInterface.prefixLength?.toString() ?? "24",
      defaultGateway: selectedInterface.defaultGateway ?? "",
    });
  }, [form, selectedInterface]);

  if (!selectedInterface)
    return <p className="text-muted-foreground text-xs">อุปกรณ์นี้ไม่มี interface สำหรับตั้งค่า IP</p>;

  const submit = (values: IpFormValues) => {
    const prefixLength = values.ipv4 ? Number(values.prefixLength) : undefined;
    const info = values.ipv4 && prefixLength !== undefined ? analyzeIPv4(values.ipv4, prefixLength) : undefined;
    const interfaces = device.interfaces.map((networkInterface) =>
      networkInterface.id === selectedInterface.id
        ? {
            ...networkInterface,
            ipv4: values.ipv4 || undefined,
            prefixLength,
            subnetMask: info?.subnetMask,
            defaultGateway: values.defaultGateway || undefined,
            status: interfaceStatus ?? selectedInterface.status,
          }
        : networkInterface,
    );
    const candidateDevices = devices.map((item) => (item.id === device.id ? { ...item, interfaces } : item));
    const issues = validateInterfaceIPv4(
      { devices: candidateDevices, connections, groups },
      device.id,
      selectedInterface.id,
    );
    if (issues.length) {
      setDomainError(issues.map((issue) => issue.message).join(" · "));
      return;
    }
    updateDevice(device.id, { interfaces });
    setDomainError(undefined);
    toast.success(`บันทึก IPv4 บน ${selectedInterface.name} แล้ว`);
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="text-muted-foreground mb-1.5 block text-xs font-medium">Interface</label>
        <Select
          value={selectedInterface.id}
          onValueChange={(value) => {
            setSelectedInterfaceId(value);
            setStatusOverride(undefined);
            setDomainError(undefined);
          }}
        >
          <SelectTrigger aria-label="เลือก interface">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {device.interfaces.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name} · {item.type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <form className="space-y-3" onSubmit={form.handleSubmit(submit)}>
        <label className="text-muted-foreground block text-xs font-medium">
          IPv4 Address
          <Input
            className="mt-1.5 font-mono"
            placeholder="192.168.1.10"
            {...form.register("ipv4")}
            aria-invalid={Boolean(form.formState.errors.ipv4)}
          />
        </label>
        {form.formState.errors.ipv4 && (
          <p className="text-destructive text-xs" role="alert">
            {form.formState.errors.ipv4.message}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <label className="text-muted-foreground block text-xs font-medium">
            Prefix Length
            <Input
              className="mt-1.5 font-mono"
              inputMode="numeric"
              {...form.register("prefixLength")}
              aria-invalid={Boolean(form.formState.errors.prefixLength)}
            />
          </label>
          <div>
            <label className="text-muted-foreground mb-1.5 block text-xs font-medium">Interface State</label>
            <Select
              value={interfaceStatus ?? selectedInterface.status}
              onValueChange={(value) =>
                setStatusOverride({ interfaceId: selectedInterface.id, status: value as InterfaceStatus })
              }
            >
              <SelectTrigger aria-label="สถานะ interface">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="up">Up</SelectItem>
                <SelectItem value="down">Down</SelectItem>
                <SelectItem value="administratively-down">Administratively down</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {form.formState.errors.prefixLength && (
          <p className="text-destructive text-xs" role="alert">
            {form.formState.errors.prefixLength.message}
          </p>
        )}
        <label className="text-muted-foreground block text-xs font-medium">
          Default Gateway
          <Input
            className="mt-1.5 font-mono"
            placeholder="Optional"
            {...form.register("defaultGateway")}
            aria-invalid={Boolean(form.formState.errors.defaultGateway)}
          />
        </label>
        {form.formState.errors.defaultGateway && (
          <p className="text-destructive text-xs" role="alert">
            {form.formState.errors.defaultGateway.message}
          </p>
        )}
        {domainError && (
          <div
            className="border-destructive/30 bg-destructive/8 text-destructive rounded-lg border p-3 text-xs"
            role="alert"
          >
            {domainError}
          </div>
        )}
        <Button type="submit" size="sm">
          <Save />
          บันทึก IPv4
        </Button>
      </form>
      {preview && (
        <div className="border-border bg-background rounded-lg border p-3">
          <div className="mb-3 flex items-center gap-2">
            <Calculator className="text-primary size-4" />
            <p className="text-xs font-medium">Subnet calculation</p>
            <Badge variant={preview.isUsableHost ? "success" : "warning"}>
              {preview.isUsableHost ? "HOST" : "RESERVED"}
            </Badge>
          </div>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 font-mono text-[10px]">
            <div>
              <dt className="text-muted-foreground">MASK</dt>
              <dd>{preview.subnetMask}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">HOSTS</dt>
              <dd>{preview.totalHosts.toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">NETWORK</dt>
              <dd>{preview.networkAddress}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">BROADCAST</dt>
              <dd>{preview.broadcastAddress}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-muted-foreground">HOST RANGE</dt>
              <dd>
                {preview.firstHost} – {preview.lastHost}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
