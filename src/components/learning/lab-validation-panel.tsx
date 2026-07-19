"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Eye,
  FlaskConical,
  Lightbulb,
  Play,
  RotateCcw,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createDemoProject } from "@/data/demo-topology";
import { labs } from "@/data/labs";
import { db } from "@/db/local-database";
import { LabValidationEngine } from "@/domain/labs/lab-validation-engine";
import { useConfigurationStore } from "@/stores/configuration-store";
import { useTopologyStore } from "@/stores/topology-store";
import type { LabAttemptState, LabValidationReport } from "@/types/lab";

const newAttempt = (): LabAttemptState => ({
  startedAt: new Date().toISOString(),
  hintsUsed: 0,
  partialSolutionViewed: false,
  fullSolutionViewed: false,
  resetCount: 0,
  elapsedSeconds: 0,
});

export function LabValidationPanel() {
  const devices = useTopologyStore((state) => state.devices);
  const connections = useTopologyStore((state) => state.connections);
  const groups = useTopologyStore((state) => state.groups);
  const replaceTopology = useTopologyStore((state) => state.replaceTopology);
  const configurationState = useConfigurationStore((state) => state.configurationState);
  const [labId, setLabId] = useState("vlan");
  const [report, setReport] = useState<LabValidationReport>();
  const [attempt, setAttempt] = useState<LabAttemptState>(newAttempt);
  const [visibleHints, setVisibleHints] = useState(0);
  const [showPartial, setShowPartial] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const selectedLab = labs.find((lab) => lab.id === labId) ?? labs[0]!;

  useEffect(() => {
    const requestedLab = new URLSearchParams(window.location.search).get("lab");
    if (!requestedLab || !labs.some((lab) => lab.id === requestedLab)) return;
    const timeoutId = window.setTimeout(() => setLabId(requestedLab), 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  const selectLab = (value: string) => {
    setLabId(value);
    setReport(undefined);
    setAttempt(newAttempt());
    setVisibleHints(0);
    setShowPartial(false);
    setShowSolution(false);
  };

  const validate = async () => {
    const elapsedSeconds = Math.max(
      attempt.elapsedSeconds,
      Math.round((Date.now() - new Date(attempt.startedAt).getTime()) / 1000),
    );
    const currentAttempt = { ...attempt, elapsedSeconds };
    setAttempt(currentAttempt);
    const result = await new LabValidationEngine().validate(
      selectedLab,
      { topology: { devices, connections, groups }, configurationState },
      currentAttempt,
    );
    setReport(result);
    await db.labProgress.put({
      id: selectedLab.id,
      progress: Math.round((result.passedRules / result.totalRules) * 100),
      completedAt: result.completed ? new Date().toISOString() : undefined,
      quizScore: result.score,
      updatedAt: new Date().toISOString(),
    });
  };

  const revealHint = () => {
    if (visibleHints >= selectedLab.hints.length) return;
    setVisibleHints((value) => value + 1);
    setAttempt((current) => ({ ...current, hintsUsed: current.hintsUsed + 1 }));
    setReport(undefined);
  };

  const revealPartial = () => {
    setShowPartial(true);
    setAttempt((current) => ({ ...current, partialSolutionViewed: true }));
    setReport(undefined);
  };

  const revealSolution = () => {
    setShowSolution(true);
    setAttempt((current) => ({ ...current, fullSolutionViewed: true }));
    setReport(undefined);
  };

  const resetLab = () => {
    const project = createDemoProject();
    useConfigurationStore.getState().hydrate(project.configurationState, project.devices);
    replaceTopology({ devices: project.devices, connections: project.connections, groups: project.groups });
    setAttempt((current) => ({
      ...newAttempt(),
      resetCount: current.resetCount + 1,
    }));
    setReport(undefined);
  };

  return (
    <div className="grid h-80 min-h-0 gap-3 overflow-y-auto p-3 xl:grid-cols-[320px_1fr]" data-testid="lab-validator">
      <section className="border-border bg-background/45 rounded-lg border p-3">
        <div className="mb-3 flex items-center gap-2">
          <FlaskConical className="text-primary size-4" />
          <h3 className="text-xs font-semibold">State-based Lab Validator</h3>
          <Badge variant="outline">REGISTRY</Badge>
        </div>
        <Select value={labId} onValueChange={selectLab}>
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
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Badge>{selectedLab.level}</Badge>
          <Badge variant="outline">{selectedLab.difficulty}</Badge>
          <Badge variant="outline">{selectedLab.estimatedMinutes} นาที</Badge>
        </div>
        <p className="text-muted-foreground mt-3 text-xs leading-5">{selectedLab.scenario}</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button size="sm" onClick={() => void validate()}>
            <Play />
            Validate Lab
          </Button>
          <Button size="sm" variant="outline" onClick={resetLab}>
            <RotateCcw />
            Reset
          </Button>
        </div>
        <Button size="sm" variant="ghost" className="mt-2 w-full" onClick={() => setShowDetails((value) => !value)}>
          Lab Brief <ChevronDown className={showDetails ? "rotate-180 transition-transform" : "transition-transform"} />
        </Button>
        {showDetails ? (
          <div className="border-border mt-2 space-y-3 border-t pt-3 text-[11px]">
            <div>
              <p className="font-semibold">Objectives</p>
              <ul className="text-muted-foreground mt-1 space-y-1">
                {selectedLab.objectives.map((item) => (
                  <li key={item}>— {item}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-semibold">IP Address Table</p>
              <div className="mt-1 space-y-1 font-mono text-[10px]">
                {selectedLab.ipAddressTable.map((item) => (
                  <p key={`${item.device}-${item.interfaceName}`}>
                    {item.device} · {item.address}
                    {item.gateway ? ` · GW ${item.gateway}` : ""}
                  </p>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <section className="border-border bg-background/45 rounded-lg border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-semibold">Tasks & Network-state Evidence</h3>
          {report ? (
            <div className="flex items-center gap-2">
              <Badge variant={report.completed ? "success" : "warning"}>
                {report.passedRules}/{report.totalRules} RULES
              </Badge>
              <Badge>
                {report.score}/{report.maxScore} POINTS
              </Badge>
            </div>
          ) : null}
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px]">
          <div className="space-y-2">
            {selectedLab.tasks.map((task) => {
              const result = report?.results.find((item) => item.taskId === task.id);
              return (
                <div key={task.id} className="border-border flex gap-3 rounded-lg border p-3">
                  {result?.status === "passed" ? (
                    <CheckCircle2 className="text-success size-4 shrink-0" />
                  ) : result ? (
                    <XCircle className="text-destructive size-4 shrink-0" />
                  ) : (
                    <ShieldCheck className="text-muted-foreground size-4 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-medium">
                        {task.title}: {task.description}
                      </p>
                      {result ? (
                        <Badge variant={result.status === "passed" ? "success" : "warning"}>{result.status}</Badge>
                      ) : null}
                    </div>
                    <p className="text-muted-foreground mt-1 text-[10px]">
                      {result?.message ?? "รอตรวจ topology และ runtime configuration"}
                    </p>
                    {result?.evidence?.length ? (
                      <code className="text-primary mt-1 block truncate text-[9px]">{result.evidence.join(" · ")}</code>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
          <aside className="space-y-2">
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={revealHint}
              disabled={visibleHints >= selectedLab.hints.length}
            >
              <Lightbulb />
              Hint ({attempt.hintsUsed} used)
            </Button>
            {selectedLab.hints.slice(0, visibleHints).map((hint, index) => (
              <p key={hint} className="bg-warning/8 border-warning/25 rounded-lg border p-2 text-[10px]">
                Hint {index + 1}: {hint}
              </p>
            ))}
            <Button size="sm" variant="outline" className="w-full" onClick={revealPartial} disabled={showPartial}>
              <Eye />
              Partial solution (-{selectedLab.scoreRules.partialSolutionPenalty})
            </Button>
            {showPartial ? (
              <div className="bg-muted rounded-lg p-2 text-[10px]">
                <p className="font-semibold">{selectedLab.partialSolution.summary}</p>
                {selectedLab.partialSolution.steps.map((step) => (
                  <p key={step} className="mt-1">
                    — {step}
                  </p>
                ))}
              </div>
            ) : null}
            <Button size="sm" variant="outline" className="w-full" onClick={revealSolution} disabled={showSolution}>
              <Eye />
              Full solution (-{selectedLab.scoreRules.fullSolutionPenalty})
            </Button>
            {showSolution ? (
              <div className="bg-destructive/6 border-destructive/20 rounded-lg border p-2 text-[10px]">
                <p className="font-semibold">{selectedLab.solution.summary}</p>
                {selectedLab.solution.steps.map((step) => (
                  <p key={step} className="mt-1">
                    — {step}
                  </p>
                ))}
              </div>
            ) : null}
          </aside>
        </div>
      </section>
    </div>
  );
}
