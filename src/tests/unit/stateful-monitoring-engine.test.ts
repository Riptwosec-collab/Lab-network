import { describe, expect, it } from "vitest";

import { createDemoProject } from "@/data/demo-topology";
import { StatefulMonitoringEngine } from "@/engine/monitoring/stateful-monitoring-engine";
import type { MonitoringAlertRule, MonitoringMetricSample } from "@/types/monitoring";

const project = createDemoProject();
const topology = { devices: project.devices, connections: project.connections, groups: project.groups };

const latencyRule: MonitoringAlertRule = {
  id: "latency-test",
  metric: "latency",
  operator: ">",
  threshold: 80,
  durationSeconds: 0,
  severity: "high",
  message: "Latency threshold exceeded",
  enabled: true,
};

function latency(value: number): MonitoringMetricSample {
  return {
    id: "latency:link-1",
    timestamp: "2026-07-19T00:00:00.000Z",
    metric: "latency",
    source: "icmp",
    scopeId: "link-1",
    scopeType: "link",
    label: "Core link",
    value,
    unit: "ms",
    healthy: value <= 80,
  };
}

describe("StatefulMonitoringEngine", () => {
  it("collects deterministic topology metrics instead of permanent random values", () => {
    const engine = new StatefulMonitoringEngine();
    const first = engine.collect(topology, new Date("2026-07-19T00:00:00.000Z"));
    const second = engine.collect(topology, new Date("2026-07-19T00:01:00.000Z"));
    expect(first.map((sample) => [sample.id, sample.value, sample.healthy])).toEqual(
      second.map((sample) => [sample.id, sample.value, sample.healthy]),
    );
    expect(first.map((sample) => sample.metric)).toEqual(
      expect.arrayContaining([
        "device-availability",
        "interface-status",
        "bandwidth",
        "cpu",
        "memory",
        "temperature",
        "latency",
        "jitter",
        "packet-loss",
      ]),
    );
  });

  it("triggers an alert from a breached metric and deduplicates repeated polls", () => {
    const engine = new StatefulMonitoringEngine([latencyRule]);
    expect(engine.evaluate([latency(120)])).toHaveLength(1);
    expect(engine.evaluate([latency(130)])).toMatchObject([
      { id: "latency-test:link-1", state: "active", occurrenceCount: 1, value: 130 },
    ]);
    expect(engine.eventLog().filter((event) => event.type === "alert-triggered")).toHaveLength(1);
  });

  it("honors rule duration before triggering", () => {
    const engine = new StatefulMonitoringEngine([{ ...latencyRule, durationSeconds: 10 }]);
    expect(engine.evaluate([latency(120)], new Date("2026-07-19T00:00:00.000Z"))).toHaveLength(0);
    expect(engine.evaluate([latency(120)], new Date("2026-07-19T00:00:09.000Z"))).toHaveLength(0);
    expect(engine.evaluate([latency(120)], new Date("2026-07-19T00:00:10.000Z"))).toMatchObject([{ state: "active" }]);
  });

  it("acknowledges and resolves the same alert when the metric recovers", () => {
    const engine = new StatefulMonitoringEngine([latencyRule]);
    const [alert] = engine.evaluate([latency(120)]);
    engine.acknowledge(alert!.id);
    expect(engine.alerts()[0]?.state).toBe("acknowledged");
    expect(engine.evaluate([latency(10)])[0]?.state).toBe("resolved");
  });

  it("moves alerts into and out of maintenance without creating duplicates", () => {
    const engine = new StatefulMonitoringEngine([latencyRule]);
    engine.setMaintenance("global", true);
    expect(engine.evaluate([latency(120)])[0]?.state).toBe("maintenance");
    engine.setMaintenance("global", false);
    expect(engine.alerts()).toMatchObject([{ state: "active", occurrenceCount: 1 }]);
  });

  it("suppresses an alert until the workflow is explicitly changed", () => {
    const engine = new StatefulMonitoringEngine([latencyRule]);
    const [alert] = engine.evaluate([latency(120)]);
    engine.suppress(alert!.id);
    engine.evaluate([latency(130)]);
    expect(engine.alerts()[0]?.state).toBe("suppressed");
  });

  it("bounds the virtualized event source to the latest 1,000 records", () => {
    const engine = new StatefulMonitoringEngine([]);
    for (let index = 0; index < 1_100; index += 1) engine.setMaintenance("global", index % 2 === 0);
    expect(engine.eventLog()).toHaveLength(1_000);
    expect(engine.eventLog()[0]?.id).toBe("monitor-event-101");
  });
});
