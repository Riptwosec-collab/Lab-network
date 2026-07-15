import { IPv4PingEngine } from "@/engine/protocols/ping-engine";
import type { LabDefinition, LabValidationResult, LabValidator } from "@/types/lab";
import type { ProjectConfigurationState, TopologySnapshot } from "@/types/network";

export class TopologyLabValidator implements LabValidator {
  constructor(
    private readonly topology: TopologySnapshot,
    private readonly configurationState: ProjectConfigurationState,
  ) {}

  async validate(lab: LabDefinition): Promise<readonly LabValidationResult[]> {
    if (lab.id === "vlan") return this.validateVlanLab(lab);
    if (lab.id === "ip-ping") return this.validateIpPingLab(lab);
    if (lab.id === "inter-vlan") return this.validateInterVlanLab(lab);
    return lab.tasks.map((task) => ({
      taskId: task.id,
      status: "failed",
      message: `Validator สำหรับ ${lab.title} จะเปิดเมื่อ simulation phase ที่เกี่ยวข้องพร้อมใช้งาน`,
    }));
  }

  private validateVlanLab(lab: LabDefinition): readonly LabValidationResult[] {
    const switchStates = this.topology.devices
      .filter((device) => device.category === "switch" || device.capabilities.includes("switching"))
      .flatMap((device) => {
        const state = this.configurationState.devices[device.id];
        return state?.runningConfig.switching ? [{ device, config: state.runningConfig }] : [];
      });
    const hasVlans = switchStates.some(({ config }) => config.switching?.vlans["10"] && config.switching.vlans["20"]);
    const accessVlans = new Set(
      switchStates.flatMap(({ config }) =>
        Object.values(config.interfaces)
          .filter((item) => item.switchport?.mode === "access")
          .map((item) => item.switchport!.accessVlan),
      ),
    );
    const checks = [
      {
        passed: !!hasVlans,
        message: hasVlans
          ? "พบ VLAN 10 และ VLAN 20 ใน running config"
          : "ยังไม่มี switch ที่สร้าง VLAN 10 และ VLAN 20 ครบ",
      },
      {
        passed: accessVlans.has(10) && accessVlans.has(20),
        message:
          accessVlans.has(10) && accessVlans.has(20)
            ? "พบ access ports ใน VLAN 10 และ VLAN 20"
            : "ต้องกำหนด access ports ให้ VLAN 10 และ VLAN 20",
      },
    ];
    return lab.tasks.map((task, index) => ({
      taskId: task.id,
      status: checks[index]?.passed ? "passed" : "failed",
      message: checks[index]?.message ?? "ไม่มี validation rule สำหรับ task นี้",
    }));
  }

  private validateIpPingLab(lab: LabDefinition): readonly LabValidationResult[] {
    const endpoints = this.topology.devices.filter((device) =>
      device.interfaces.some(
        (networkInterface) => networkInterface.ipv4 && networkInterface.prefixLength !== undefined,
      ),
    );
    const source = endpoints[0];
    const destination = endpoints[1]?.interfaces.find((networkInterface) => networkInterface.ipv4);
    const result =
      source && destination
        ? new IPv4PingEngine(this.topology).ping({ sourceDeviceId: source.id, destinationIp: destination.ipv4! })
        : undefined;
    const checks = [
      {
        passed: endpoints.length >= 2,
        message:
          endpoints.length >= 2
            ? "มี endpoints ที่กำหนด IPv4 แล้ว"
            : "ต้องมี endpoints ที่กำหนด IPv4 อย่างน้อย 2 เครื่อง",
      },
      {
        passed: !!result?.success,
        message: result?.success
          ? "Ping สำเร็จตาม simulation state"
          : (result?.reason ?? "ยังไม่มีคู่ endpoint สำหรับ Ping"),
      },
    ];
    return lab.tasks.map((task, index) => ({
      taskId: task.id,
      status: checks[index]?.passed ? "passed" : "failed",
      message: checks[index]?.message ?? "ไม่มี validation rule สำหรับ task นี้",
    }));
  }

  private validateInterVlanLab(lab: LabDefinition): readonly LabValidationResult[] {
    const layer3Devices = this.topology.devices.filter((device) => {
      const routing = this.configurationState.devices[device.id]?.runningConfig.routing;
      return routing?.ipRouting && Object.keys(routing.svis).length >= 2;
    });
    const endpoints = this.topology.devices.filter((device) =>
      device.interfaces.some(
        (networkInterface) =>
          networkInterface.ipv4 && networkInterface.prefixLength !== undefined && networkInterface.defaultGateway,
      ),
    );
    let pingPassed = false;
    outer: for (const source of endpoints) {
      for (const destination of endpoints) {
        if (source.id === destination.id) continue;
        const destinationInterface = destination.interfaces.find((item) => item.ipv4);
        if (
          destinationInterface &&
          new IPv4PingEngine(this.topology).ping({
            sourceDeviceId: source.id,
            destinationIp: destinationInterface.ipv4!,
          }).success
        ) {
          pingPassed = true;
          break outer;
        }
      }
    }
    const checks = [
      {
        passed: layer3Devices.length > 0,
        message: layer3Devices.length
          ? "พบ Layer 3 device ที่เปิด ip routing และมี SVI อย่างน้อย 2 VLAN"
          : "ต้องเปิด ip routing และสร้าง SVI อย่างน้อย 2 VLAN",
      },
      {
        passed: pingPassed,
        message: pingPassed ? "Cross-subnet Ping สำเร็จผ่าน routing engine" : "ยัง Ping ข้าม VLAN ไม่สำเร็จ",
      },
    ];
    return lab.tasks.map((task, index) => ({
      taskId: task.id,
      status: checks[index]?.passed ? "passed" : "failed",
      message: checks[index]?.message ?? "ไม่มี validation rule สำหรับ task นี้",
    }));
  }
}
