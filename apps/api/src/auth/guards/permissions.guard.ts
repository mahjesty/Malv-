import { CanActivate, ExecutionContext, Injectable, Optional } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { REQUIRED_PERMISSIONS_KEY } from "../decorators/permissions.decorator";
import { AuditEventEntity } from "../../db/entities/audit-event.entity";
import { SecurityEventService } from "../../security/security-event.service";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(AuditEventEntity) private readonly audits: Repository<AuditEventEntity>,
    @Optional() private readonly securityEvents?: SecurityEventService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS_KEY, [context.getHandler(), context.getClass()]) ?? [];
    if (!required.length) return true;
    const req = context.switchToHttp().getRequest();
    const auth = (req as any)?.user as { userId?: string; role?: string; permissions?: string[] } | undefined;
    if (!auth?.userId) return false;
    if (auth.role === "admin") return true;
    const granted = new Set(auth.permissions ?? []);
    const ok = required.every((p) => granted.has(p));
    if (!ok) {
      await this.audits.save(
        this.audits.create({
          actorUser: { id: auth.userId } as any,
          eventType: "permission_denied",
          level: "warn",
          message: `Permission denied: requires [${required.join(", ")}]`,
          metadata: {
            requiredPermissions: required,
            grantedPermissions: Array.from(granted),
            method: req?.method ?? "UNKNOWN",
            route: req?.route?.path ?? req?.url ?? "unknown"
          }
        })
      );
      void this.securityEvents?.emitBestEffort({
        eventType: "auth.permission.denied",
        severity: "medium",
        subsystem: "authz",
        summary: `Privileged route permission denied for [${required.join(", ")}]`,
        details: {
          requiredPermissions: required,
          route: req?.route?.path ?? req?.url ?? "unknown",
          method: req?.method ?? "UNKNOWN"
        },
        actorUserId: auth.userId,
        actorRole: auth.role ?? "user",
        sourceIp: typeof (req as any)?.ip === "string" ? (req as any).ip : null
      });
    }
    return ok;
  }
}
