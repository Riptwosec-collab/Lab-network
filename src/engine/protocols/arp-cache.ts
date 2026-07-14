export type ArpEntryType = "dynamic" | "static";

export interface ArpEntry {
  readonly deviceId: string;
  readonly ipAddress: string;
  readonly macAddress: string;
  readonly type: ArpEntryType;
  readonly learnedAt: number;
  readonly expiresAt?: number;
}

export class ArpCache {
  private readonly entries = new Map<string, ArpEntry>();

  constructor(private readonly ttlMs = 60_000) {}

  get(deviceId: string, ipAddress: string, now = Date.now()): ArpEntry | undefined {
    const key = this.key(deviceId, ipAddress);
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.type === "dynamic" && entry.expiresAt !== undefined && entry.expiresAt <= now) {
      this.entries.delete(key);
      return undefined;
    }
    return entry;
  }

  set(
    deviceId: string,
    ipAddress: string,
    macAddress: string,
    type: ArpEntryType = "dynamic",
    now = Date.now(),
  ): ArpEntry {
    const entry: ArpEntry = {
      deviceId,
      ipAddress,
      macAddress,
      type,
      learnedAt: now,
      expiresAt: type === "dynamic" ? now + this.ttlMs : undefined,
    };
    this.entries.set(this.key(deviceId, ipAddress), entry);
    return entry;
  }

  list(now = Date.now()): ArpEntry[] {
    Array.from(this.entries.values()).forEach((entry) => void this.get(entry.deviceId, entry.ipAddress, now));
    return Array.from(this.entries.values()).sort((left, right) => left.ipAddress.localeCompare(right.ipAddress));
  }

  clear(): void {
    this.entries.clear();
  }

  private key(deviceId: string, ipAddress: string): string {
    return `${deviceId}:${ipAddress}`;
  }
}
