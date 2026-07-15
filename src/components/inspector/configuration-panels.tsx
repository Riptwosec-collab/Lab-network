"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Clock3, Play, RotateCcw, Save, TerminalSquare } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cliPrompt, executeCliCommand, type CliContext } from "@/domain/configuration/cli-engine";
import {
  createDeviceConfigurationState,
  diffConfiguration,
  renderRunningConfig,
} from "@/domain/configuration/configuration-engine";
import { analyzeIPv4 } from "@/engine/protocols/ipv4";
import { deviceRuntimeConfigSchema } from "@/schemas/network.schema";
import {
  applyDeviceConfiguration,
  restoreDeviceStartupConfig,
  rollbackDeviceConfiguration,
  saveDeviceStartupConfig,
} from "@/services/configuration-service";
import { useConfigurationStore } from "@/stores/configuration-store";
import type { NetworkDevice } from "@/types/network";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => <div className="bg-muted/35 h-72 animate-pulse rounded-lg" aria-label="กำลังโหลด Raw Config Editor" />,
});

function useDeviceConfiguration(device: NetworkDevice) {
  return (
    useConfigurationStore((state) => state.configurationState.devices[device.id]) ??
    createDeviceConfigurationState(device)
  );
}

export function ConfigurationStatusPanel({ device }: { device: NetworkDevice }) {
  const configuration = useDeviceConfiguration(device);
  const lastRevision = configuration.revisions.at(-1);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Card>
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs">Config status</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-1">
            <Badge variant={configuration.validationResult.valid ? "success" : "warning"}>{configuration.status}</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs">Revisions</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-1 font-mono text-sm">{configuration.revisions.length}</CardContent>
        </Card>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            saveDeviceStartupConfig(device.id, "form");
            toast.success("Saved startup configuration");
          }}
        >
          <Save /> Save startup
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!lastRevision}
          onClick={() => {
            rollbackDeviceConfiguration(device.id);
            toast.success("Rolled back last revision");
          }}
        >
          <RotateCcw /> Rollback
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            restoreDeviceStartupConfig(device.id);
            toast.success("Restored startup configuration");
          }}
        >
          Restore startup
        </Button>
      </div>
      {lastRevision && (
        <div className="border-border rounded-lg border p-3 text-xs">
          <div className="flex items-center gap-2">
            <Clock3 className="size-3.5" />
            <span>{new Date(lastRevision.timestamp).toLocaleString()}</span>
          </div>
          <p className="text-muted-foreground mt-2">
            Source: {lastRevision.source} · {lastRevision.commitStatus}
          </p>
          <ul className="mt-2 space-y-1 font-mono text-[10px]">
            {lastRevision.changes.map((change) => (
              <li key={change}>{change}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function CliConfigurationPanel({ device }: { device: NetworkDevice }) {
  const configuration = useDeviceConfiguration(device);
  const [context, setContext] = useState<CliContext>({ mode: "user" });
  const [command, setCommand] = useState("");
  const [lines, setLines] = useState<string[]>(["NetLab Educational CLI · type help for commands"]);

  const runCommand = () => {
    const trimmed = command.trim();
    if (!trimmed) return;
    const prompt = cliPrompt(device.hostname, context);
    const result = executeCliCommand(trimmed, context, device, configuration);
    let output = result.output;
    if (result.action === "apply" && result.nextConfig) {
      const action = applyDeviceConfiguration(device.id, result.nextConfig, "cli");
      if (!action.applied) output = action.validation.issues.map((issue) => `% ${issue.path}: ${issue.message}`);
    }
    if (result.action === "save-startup") saveDeviceStartupConfig(device.id, "cli");
    if (result.action === "restore-startup") restoreDeviceStartupConfig(device.id);
    setLines((current) => [...current, `${prompt} ${trimmed}`, ...output].slice(-100));
    setContext(result.context);
    setCommand("");
  };

  return (
    <div className="space-y-2">
      <div
        className="h-72 overflow-y-auto rounded-lg bg-black p-3 font-mono text-[11px] leading-5 text-emerald-300"
        aria-label="Educational CLI output"
      >
        {lines.map((line, index) => (
          <div key={`${index}-${line}`}>{line || " "}</div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-primary shrink-0 font-mono text-xs">{cliPrompt(device.hostname, context)}</span>
        <Input
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") runCommand();
          }}
          className="font-mono"
          aria-label="CLI command"
          autoComplete="off"
        />
        <Button size="icon" onClick={runCommand} aria-label="Run CLI command">
          <TerminalSquare />
        </Button>
      </div>
    </div>
  );
}

export function RawConfigurationPanel({ device }: { device: NetworkDevice }) {
  const configuration = useDeviceConfiguration(device);
  const serialized = useMemo(() => JSON.stringify(configuration.runningConfig, null, 2), [configuration.runningConfig]);
  const [source, setSource] = useState(serialized);
  const [issues, setIssues] = useState<Array<{ path: string; message: string }>>([]);
  const parsed = useMemo(() => {
    try {
      const json: unknown = JSON.parse(source);
      return deviceRuntimeConfigSchema.safeParse(json);
    } catch (error) {
      return {
        success: false as const,
        error: { issues: [{ path: [], message: error instanceof Error ? error.message : "Invalid JSON" }] },
      };
    }
  }, [source]);
  const preview = parsed.success ? diffConfiguration(configuration.runningConfig, parsed.data) : [];

  const apply = () => {
    if (!parsed.success) {
      setIssues(parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })));
      return;
    }
    const result = applyDeviceConfiguration(device.id, parsed.data, "raw");
    setIssues(result.validation.issues);
    if (result.applied) toast.success("Raw configuration applied");
  };

  return (
    <div className="space-y-3">
      <MonacoEditor
        height="300px"
        language="json"
        value={source}
        onChange={(value) => setSource(value ?? "")}
        options={{ minimap: { enabled: false }, fontSize: 12, automaticLayout: true, tabSize: 2 }}
      />
      {issues.length > 0 && (
        <div className="border-destructive/30 bg-destructive/8 text-destructive rounded-lg border p-3 text-xs">
          {issues.map((issue) => (
            <p key={`${issue.path}-${issue.message}`}>
              <code>{issue.path || "JSON"}</code>: {issue.message}
            </p>
          ))}
        </div>
      )}
      <div className="border-border rounded-lg border p-3">
        <p className="mb-2 text-xs font-medium">Preview diff</p>
        <ul className="text-muted-foreground space-y-1 font-mono text-[10px]">
          {preview.map((change) => (
            <li key={change}>{change}</li>
          ))}
        </ul>
      </div>
      <Button size="sm" onClick={apply} disabled={!parsed.success}>
        <Play />
        Validate & Apply
      </Button>
    </div>
  );
}

export function RenderedConfigurationPanel({ device, kind }: { device: NetworkDevice; kind: "running" | "startup" }) {
  const configuration = useDeviceConfiguration(device);
  const config = kind === "running" ? configuration.runningConfig : configuration.startupConfig;
  return (
    <pre className="max-h-[460px] overflow-auto rounded-lg bg-black p-4 font-mono text-[11px] leading-5 text-emerald-300">
      {renderRunningConfig(config, device)}
    </pre>
  );
}

export function ConfigurationHistoryPanel({ device }: { device: NetworkDevice }) {
  const configuration = useDeviceConfiguration(device);
  return (
    <div className="space-y-2">
      {configuration.revisions.length ? (
        [...configuration.revisions].reverse().map((revision) => (
          <div key={revision.revisionId} className="border-border rounded-lg border p-3 text-xs">
            <div className="flex justify-between gap-2">
              <code>{revision.revisionId}</code>
              <Badge variant="outline">{revision.source}</Badge>
            </div>
            <p className="text-muted-foreground mt-2">{new Date(revision.timestamp).toLocaleString()}</p>
            <p className="mt-2">{revision.changes.join(" · ")}</p>
          </div>
        ))
      ) : (
        <p className="text-muted-foreground text-xs">No configuration revisions yet.</p>
      )}
    </div>
  );
}

export function ConnectedRoutesPanel({ device }: { device: NetworkDevice }) {
  const configuration = useDeviceConfiguration(device);
  const routes = Object.values(configuration.runningConfig.interfaces).flatMap((item) => {
    if (!item.enabled || !item.ipv4 || item.prefixLength === undefined) return [];
    const info = analyzeIPv4(item.ipv4, item.prefixLength);
    return info
      ? [{ interfaceId: item.interfaceId, network: info.networkAddress, prefixLength: info.prefixLength }]
      : [];
  });
  return (
    <div>
      <p className="mb-3 text-xs font-medium">Connected routes derived from running config</p>
      {routes.length ? (
        <div className="space-y-2">
          {routes.map((route) => (
            <div
              key={route.interfaceId}
              className="border-border flex justify-between rounded-lg border p-3 font-mono text-xs"
            >
              <span>
                C {route.network}/{route.prefixLength}
              </span>
              <span>{device.interfaces.find((item) => item.id === route.interfaceId)?.name}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">No active connected routes.</p>
      )}
    </div>
  );
}
