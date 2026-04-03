import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { TrustedDeviceEntity } from "../db/entities/trusted-device.entity";
import { SessionEntity } from "../db/entities/session.entity";
import { KillSwitchService } from "../kill-switch/kill-switch.service";
import { MalvFeatureFlagsService } from "../common/malv-feature-flags.service";

@Injectable()
export class DevicesService {
  constructor(
    @InjectRepository(TrustedDeviceEntity) private readonly devices: Repository<TrustedDeviceEntity>,
    @InjectRepository(SessionEntity) private readonly sessions: Repository<SessionEntity>,
    private readonly killSwitch: KillSwitchService,
    private readonly flags: MalvFeatureFlagsService
  ) {}

  async listDevices(args: { userId: string }) {
    await this.killSwitch.ensureSystemOnOrThrow({ reason: "devices_read" });
    const rows = await this.devices.find({
      where: { user: { id: args.userId } },
      order: { createdAt: "DESC" }
    });
    return rows.map((d) => ({
      id: d.id,
      deviceFingerprint: d.deviceFingerprint,
      deviceLabel: d.deviceLabel ?? null,
      isTrusted: d.isTrusted,
      createdAt: d.createdAt
    }));
  }

  async listSessions(args: { userId: string; limit: number }) {
    await this.killSwitch.ensureSystemOnOrThrow({ reason: "devices_read" });
    const rows = await this.sessions.find({
      where: { user: { id: args.userId } },
      relations: ["trustedDevice"],
      order: { lastSeenAt: "DESC" },
      take: args.limit
    });
    return rows.map((s) => ({
      id: s.id,
      status: s.status,
      ipAddress: s.ipAddress ?? null,
      userAgent: s.userAgent ?? null,
      expiresAt: s.expiresAt,
      lastSeenAt: s.lastSeenAt,
      trustedDeviceId: (s.trustedDevice as TrustedDeviceEntity | undefined)?.id ?? null
    }));
  }

  /**
   * Production trust fabric: sessions and trusted_devices rows created by real auth / mobile enrollment.
   * This method is ONLY for the optional dev harness (see `MalvFeatureFlagsService.devHarnessEnabled`).
   */
  async seedSimulatorData(args: { userId: string; deviceCount?: number; sessionCount?: number }) {
    await this.killSwitch.ensureSystemOnOrThrow({ reason: "devices_mutation" });
    if (!this.flags.devHarnessEnabled()) {
      return { devHarnessEnabled: false, insertedDevices: 0, insertedSessions: 0 };
    }

    const deviceCount = Math.max(1, Math.min(6, Number(args.deviceCount ?? 3)));
    const sessionCount = Math.max(1, Math.min(16, Number(args.sessionCount ?? 8)));
    const now = Date.now();
    const insertedDevices: TrustedDeviceEntity[] = [];

    for (let i = 0; i < deviceCount; i++) {
      const fingerprint = `sim:${args.userId.slice(0, 8)}:${i + 1}`;
      const existing = await this.devices.findOne({
        where: { user: { id: args.userId }, deviceFingerprint: fingerprint }
      });
      if (existing) {
        insertedDevices.push(existing);
        continue;
      }
      const d = this.devices.create({
        user: { id: args.userId } as any,
        deviceFingerprint: fingerprint,
        deviceLabel: `Simulated Device ${i + 1}`,
        isTrusted: true
      });
      await this.devices.save(d);
      insertedDevices.push(d);
    }

    let insertedSessions = 0;
    for (let i = 0; i < sessionCount; i++) {
      const device = insertedDevices[i % insertedDevices.length];
      const ageMinutes = i * 17;
      const lastSeen = new Date(now - ageMinutes * 60_000);
      const expires = new Date(now + (60 - Math.min(55, i * 3)) * 60_000);
      const status = expires.getTime() < now ? "expired" : "active";
      const s = this.sessions.create({
        user: { id: args.userId } as any,
        trustedDevice: device,
        status,
        ipAddress: `10.0.0.${10 + (i % 40)}`,
        userAgent: `MALV-Sim/${1 + (i % 3)}.0 (desktop)`,
        expiresAt: expires,
        lastSeenAt: lastSeen
      });
      await this.sessions.save(s);
      insertedSessions += 1;
    }

    return {
      devHarnessEnabled: true,
      insertedDevices: insertedDevices.length,
      insertedSessions
    };
  }

  /**
   * Production bridge status — always safe to call; describes how real device trust is wired today.
   */
  getBridgeHealth() {
    return {
      trustModel: "database_backed",
      tables: ["trusted_devices", "sessions"],
      enrollment: {
        description: "Clients establish sessions via auth; trusted devices are linked when clients present stable fingerprints/attestation.",
        docsPath: "docs/ARCHITECTURE_DEVICE_SMART_HOME.md"
      },
      devHarness: {
        enabled: this.flags.devHarnessEnabled(),
        note: "Optional dev-only seed for desktop QA — not a substitute for production enrollment."
      }
    };
  }

  simulatorHealth() {
    return {
      devHarnessEnabled: this.flags.devHarnessEnabled(),
      ...this.getBridgeHealth()
    };
  }
}
