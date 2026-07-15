"use client";

import { useState } from "react";
import { CheckCircle2, FlaskConical, Play, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { labs } from "@/data/labs";
import { TopologyLabValidator } from "@/domain/labs/lab-validator";
import { useConfigurationStore } from "@/stores/configuration-store";
import { useTopologyStore } from "@/stores/topology-store";
import type { LabValidationResult } from "@/types/lab";

export function LabValidationPanel() {
  const devices = useTopologyStore((state) => state.devices);
  const connections = useTopologyStore((state) => state.connections);
  const groups = useTopologyStore((state) => state.groups);
  const configurationState = useConfigurationStore((state) => state.configurationState);
  const [labId, setLabId] = useState("vlan");
  const [results, setResults] = useState<readonly LabValidationResult[]>([]);
  const selectedLab = labs.find((lab) => lab.id === labId) ?? labs[0]!;

  const validate = async () => {
    const validator = new TopologyLabValidator({ devices, connections, groups }, configurationState);
    setResults(await validator.validate(selectedLab));
  };

  return (
    <div className="grid h-64 min-h-0 gap-3 overflow-y-auto p-3 lg:grid-cols-[300px_1fr]">
      <section className="border-border bg-background/45 rounded-lg border p-3">
        <div className="mb-3 flex items-center gap-2">
          <FlaskConical className="text-primary size-4" />
          <h3 className="text-xs font-semibold">Real Lab Validator</h3>
        </div>
        <Select value={labId} onValueChange={setLabId}>
          <SelectTrigger aria-label="Lab to validate">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {labs.map((lab) => (
              <SelectItem key={lab.id} value={lab.id}>
                {lab.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-muted-foreground mt-3 text-xs leading-5">{selectedLab.scenario}</p>
        <Button size="sm" className="mt-3 w-full" onClick={() => void validate()}>
          <Play /> Validate Lab
        </Button>
      </section>
      <section className="border-border bg-background/45 rounded-lg border p-3">
        <h3 className="mb-3 text-xs font-semibold">Validation results</h3>
        {results.length ? (
          <div className="space-y-2">
            {results.map((result) => {
              const task = selectedLab.tasks.find((item) => item.id === result.taskId);
              return (
                <div key={result.taskId} className="border-border flex gap-3 rounded-lg border p-3">
                  {result.status === "passed" ? (
                    <CheckCircle2 className="text-success size-4 shrink-0" />
                  ) : (
                    <XCircle className="text-destructive size-4 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-medium">{task?.title ?? result.taskId}</p>
                      <Badge variant={result.status === "passed" ? "success" : "warning"}>{result.status}</Badge>
                    </div>
                    <p className="text-muted-foreground mt-1 text-[10px]">{result.message}</p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="border-border text-muted-foreground grid h-36 place-items-center rounded-lg border border-dashed text-xs">
            เลือก Lab แล้วกด Validate Lab
          </div>
        )}
      </section>
    </div>
  );
}
