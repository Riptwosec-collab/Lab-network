"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Eye, Lightbulb, Play, RotateCcw, Send, Wrench } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { troubleshootingScenarios } from "@/data/troubleshooting-scenarios";
import { createBuiltInFaultRegistry } from "@/domain/troubleshooting/fault-registry";
import { TroubleshootingScenarioEngine } from "@/domain/troubleshooting/troubleshooting-engine";
import { TroubleshootingEngine } from "@/engine/operations/operations-engine";
import { useConfigurationStore } from "@/stores/configuration-store";
import { useTopologyStore } from "@/stores/topology-store";
import {
  faultTypes,
  type FaultType,
  type TroubleshootingScore,
  type TroubleshootingSession,
} from "@/types/troubleshooting";

const workflow = [
  "Read Ticket",
  "Inspect",
  "Layer 1",
  "Layer 2",
  "Layer 3",
  "Service",
  "Apply Fix",
  "Verify",
  "Root Cause",
  "Review",
];

export function TroubleshootingMode() {
  const devices = useTopologyStore((state) => state.devices);
  const connections = useTopologyStore((state) => state.connections);
  const groups = useTopologyStore((state) => state.groups);
  const replaceTopology = useTopologyStore((state) => state.replaceTopology);
  const auditCount = useConfigurationStore((state) => state.configurationState.auditLog.length);
  const topology = useMemo(() => ({ devices, connections, groups }), [connections, devices, groups]);
  const engine = useMemo(() => new TroubleshootingScenarioEngine(), []);
  const faultRegistry = useMemo(() => createBuiltInFaultRegistry(), []);
  const [scenarioId, setScenarioId] = useState(troubleshootingScenarios[0]!.id);
  const [session, setSession] = useState<TroubleshootingSession>();
  const [startAuditCount, setStartAuditCount] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [visibleHints, setVisibleHints] = useState(0);
  const [showSolution, setShowSolution] = useState(false);
  const [selectedCause, setSelectedCause] = useState<FaultType>();
  const [selectedCauses, setSelectedCauses] = useState<readonly FaultType[]>([]);
  const [score, setScore] = useState<TroubleshootingScore>();
  const scenario = troubleshootingScenarios.find((item) => item.id === scenarioId) ?? troubleshootingScenarios[0]!;
  const elapsedSeconds = session ? Math.max(0, Math.round((now - new Date(session.startedAt).getTime()) / 1000)) : 0;
  const expired = !!session && elapsedSeconds >= session.scenario.timeLimitSeconds;
  const findings = useMemo(() => new TroubleshootingEngine(topology).analyze(), [topology]);

  useEffect(() => {
    if (!session) return;
    const intervalId = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(intervalId);
  }, [session]);

  const start = () => {
    const next = engine.start(scenario, topology);
    setSession(next);
    setStartAuditCount(auditCount);
    setNow(Date.now());
    setVisibleHints(0);
    setShowSolution(false);
    setSelectedCause(undefined);
    setSelectedCauses([]);
    setScore(undefined);
    replaceTopology(next.faultedTopology);
  };

  const reset = () => {
    if (!session) return;
    replaceTopology(session.faultedTopology);
    setSession({ ...session, startedAt: new Date().toISOString(), resetCount: session.resetCount + 1 });
    setVisibleHints(0);
    setShowSolution(false);
    setSelectedCauses([]);
    setScore(undefined);
    setNow(Date.now());
  };

  const restoreHealthy = () => {
    if (!session) return;
    replaceTopology(session.healthyTopology);
    setSession(undefined);
    setScore(undefined);
  };

  const revealHint = () => {
    if (!session || visibleHints >= session.scenario.hints.length) return;
    setVisibleHints((value) => value + 1);
    setSession({ ...session, hintsUsed: session.hintsUsed + 1 });
    setScore(undefined);
  };

  const revealSolution = () => {
    if (!session) return;
    setShowSolution(true);
    setSession({ ...session, solutionViewed: true });
    setScore(undefined);
  };

  const addCause = () => {
    if (!selectedCause || selectedCauses.includes(selectedCause)) return;
    setSelectedCauses((current) => [...current, selectedCause]);
  };

  const submit = () => {
    if (!session) return;
    const commandCount = Math.max(0, auditCount - startAuditCount);
    const activeServiceImpact = topology.connections.filter((connection) => connection.status !== "up").length;
    const result = engine.score(session, topology, {
      selectedRootCauses: selectedCauses,
      commandCount,
      unnecessaryChanges: Math.max(0, commandCount - session.faults.length * 2),
      serviceImpactEvents: activeServiceImpact,
      elapsedSeconds,
    });
    setScore(result);
  };

  if (!session) {
    return (
      <div className="grid gap-3 lg:grid-cols-[320px_1fr]" data-testid="troubleshooting-mode">
        <div className="space-y-3">
          <Select value={scenarioId} onValueChange={setScenarioId}>
            <SelectTrigger aria-label="Troubleshooting scenario">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {troubleshootingScenarios.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Badge>{scenario.difficulty}</Badge>
            <Badge variant="outline">{scenario.faultTypes.length} hidden fault(s)</Badge>
          </div>
          <Button className="w-full" onClick={start}>
            <Play />
            Start Scenario
          </Button>
        </div>
        <div className="border-border rounded-lg border p-3 text-xs">
          <p className="font-semibold">{scenario.ticketDescription}</p>
          <p className="text-muted-foreground mt-2 leading-5">{scenario.userComplaint}</p>
          <p className="text-muted-foreground mt-3">
            Root cause จะไม่แสดงจนกว่าจะแก้สำเร็จ ขอ Hint เปิด Solution หรือหมดเวลา
          </p>
        </div>
      </div>
    );
  }

  const revealRootCause = expired || session.hintsUsed > 0 || session.solutionViewed || score?.fixed;
  const remaining = Math.max(0, session.scenario.timeLimitSeconds - elapsedSeconds);

  return (
    <div className="space-y-3" data-testid="troubleshooting-mode">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="text-warning size-4" />
          <strong className="text-xs">{session.scenario.title}</strong>
          <Badge>{session.scenario.difficulty}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={expired ? "warning" : "outline"}>
            <Clock3 className="mr-1 size-3" />
            {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
          </Badge>
          <Button size="sm" variant="outline" onClick={reset}>
            <RotateCcw />
            Reset Scenario
          </Button>
          <Button size="sm" variant="ghost" onClick={restoreHealthy}>
            Exit & Restore
          </Button>
        </div>
      </div>
      <div className="flex gap-1 overflow-x-auto pb-1">
        {workflow.map((step, index) => (
          <Badge key={step} variant={index < 2 ? "default" : "outline"}>
            {index + 1}. {step}
          </Badge>
        ))}
      </div>
      <div className="grid gap-3 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="space-y-2">
          <div className="border-border rounded-lg border p-3 text-[10px]">
            <p className="font-semibold">Ticket</p>
            <p className="mt-1">{session.scenario.ticketDescription}</p>
            <p className="text-muted-foreground mt-1">User: {session.scenario.userComplaint}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Evidence title="Logs" lines={session.scenario.logs} />
            <Evidence title="Device Status" lines={[session.scenario.deviceStatus]} />
            <Evidence title="Monitoring" lines={[session.scenario.monitoringData]} />
            <Evidence title="Packet Result" lines={[session.scenario.packetResult]} />
          </div>
          {findings.length ? (
            <div className="border-border rounded-lg border p-2 text-[10px]">
              <p className="font-semibold">Live diagnostic findings</p>
              {findings.slice(0, 4).map((finding) => (
                <p key={finding.id} className="text-muted-foreground mt-1">
                  {finding.layer} · {finding.symptom} · {finding.evidence}
                </p>
              ))}
            </div>
          ) : null}
        </section>
        <section className="border-border space-y-3 rounded-lg border p-3 text-[10px]">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={revealHint}
              disabled={visibleHints >= session.scenario.hints.length}
            >
              <Lightbulb />
              Hint ({session.hintsUsed})
            </Button>
            <Button size="sm" variant="outline" onClick={revealSolution} disabled={showSolution}>
              <Eye />
              Open Solution
            </Button>
          </div>
          {session.scenario.hints.slice(0, visibleHints).map((hint, index) => (
            <p key={hint} className="bg-warning/8 border-warning/20 rounded border p-2">
              Hint {index + 1}: {hint}
            </p>
          ))}
          {showSolution ? (
            <div className="bg-destructive/5 border-destructive/20 rounded border p-2">
              <p className="font-semibold">Solution</p>
              {session.scenario.solution.map((step) => (
                <p key={step} className="mt-1">
                  — {step}
                </p>
              ))}
            </div>
          ) : null}
          <div>
            <p className="font-semibold">Submit Root Cause</p>
            <div className="mt-2 flex gap-2">
              <Select value={selectedCause} onValueChange={(value) => setSelectedCause(value as FaultType)}>
                <SelectTrigger aria-label="Root cause candidate">
                  <SelectValue placeholder="เลือกสาเหตุ" />
                </SelectTrigger>
                <SelectContent>
                  {faultTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {faultRegistry.label(type)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" onClick={addCause}>
                Add
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {selectedCauses.map((type) => (
                <button
                  type="button"
                  key={type}
                  onClick={() => setSelectedCauses((current) => current.filter((item) => item !== type))}
                >
                  <Badge>{faultRegistry.label(type)} ×</Badge>
                </button>
              ))}
            </div>
          </div>
          <Button className="w-full" size="sm" onClick={submit}>
            <Send />
            Verify Fix & Submit
          </Button>
          {score ? (
            <div
              className={`rounded-lg border p-3 ${score.fixed ? "border-success/30 bg-success/5" : "border-warning/30 bg-warning/5"}`}
            >
              <div className="flex items-center gap-2">
                {score.fixed ? (
                  <CheckCircle2 className="text-success size-4" />
                ) : (
                  <Wrench className="text-warning size-4" />
                )}
                <strong>
                  {score.resolvedFaults}/{score.totalFaults} faults resolved · Score {score.total}/100
                </strong>
              </div>
              <p className="mt-1">
                Fix {score.correctFix} · Root cause {score.correctRootCause} · Commands {score.commandEfficiency} · Time{" "}
                {score.time}
              </p>
            </div>
          ) : null}
          {revealRootCause ? (
            <div className="bg-muted rounded-lg p-2" data-testid="root-cause-reveal">
              <p className="font-semibold">Root cause</p>
              <p className="mt-1">{session.scenario.faultTypes.map((type) => faultRegistry.label(type)).join(" + ")}</p>
              <p className="text-muted-foreground mt-1">{session.scenario.explanation}</p>
            </div>
          ) : (
            <p className="text-muted-foreground">Root cause is hidden while investigation is active.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function Evidence({ title, lines }: { readonly title: string; readonly lines: readonly string[] }) {
  return (
    <div className="border-border rounded-lg border p-2 text-[10px]">
      <p className="font-semibold">{title}</p>
      {lines.map((line) => (
        <p key={line} className="text-muted-foreground mt-1">
          {line}
        </p>
      ))}
    </div>
  );
}
