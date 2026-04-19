import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { randomUUID } from "crypto";
import { MalvUserExecutorEnrollmentEntity, type MalvExecutorEnrollmentChannel } from "../db/entities/malv-user-executor-enrollment.entity";

function isMissingEnrollmentTableError(err: unknown): boolean {
  const code =
    (err as { code?: string } | null | undefined)?.code ??
    (err as { driverError?: { code?: string } } | null | undefined)?.driverError?.code;
  return code === "ER_NO_SUCH_TABLE";
}

@Injectable()
export class MalvExecutorEnrollmentService {
  constructor(
    @InjectRepository(MalvUserExecutorEnrollmentEntity)
    private readonly enrollments: Repository<MalvUserExecutorEnrollmentEntity>
  ) {}

  async touchHeartbeat(
    userId: string,
    channel: MalvExecutorEnrollmentChannel,
    opts?: { at?: Date; deviceId?: string | null }
  ): Promise<void> {
    if (!userId) return;
    const at = opts?.at ?? new Date();
    const deviceId =
      typeof opts?.deviceId === "string" && opts.deviceId.trim().length > 0
        ? opts.deviceId.trim().slice(0, 128)
        : opts?.deviceId === null
          ? null
          : undefined;
    try {
      const existing = await this.enrollments.findOne({
        where: { user: { id: userId }, channel }
      });
      if (existing) {
        const patch: { lastHeartbeatAt: Date; deviceId?: string | null } = { lastHeartbeatAt: at };
        if (deviceId !== undefined) patch.deviceId = deviceId;
        await this.enrollments.update({ id: existing.id }, patch);
        return;
      }
      await this.enrollments.save(
        this.enrollments.create({
          id: randomUUID(),
          user: { id: userId } as any,
          channel,
          deviceId: deviceId ?? null,
          lastHeartbeatAt: at
        })
      );
    } catch (err) {
      if (isMissingEnrollmentTableError(err)) {
        return;
      }
      throw err;
    }
  }

  async lastHeartbeat(userId: string, channel: MalvExecutorEnrollmentChannel): Promise<Date | null> {
    try {
      const row = await this.enrollments.findOne({
        where: { user: { id: userId }, channel },
        order: { lastHeartbeatAt: "DESC" }
      });
      return row?.lastHeartbeatAt ?? null;
    } catch (err) {
      if (isMissingEnrollmentTableError(err)) {
        return null;
      }
      throw err;
    }
  }
}
