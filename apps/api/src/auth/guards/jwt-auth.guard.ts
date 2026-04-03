import { ExecutionContext, Injectable, Logger, Optional } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ObservabilityService } from "../../common/observability.service";
import { SecurityEventService } from "../../security/security-event.service";

@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  private readonly logger = new Logger(JwtAuthGuard.name);
  constructor(
    private readonly observability: ObservabilityService,
    @Optional() private readonly securityEvents?: SecurityEventService
  ) {
    super();
  }

  handleRequest<TUser>(err: unknown, user: TUser, info: unknown, context: ExecutionContext, status?: unknown): TUser {
    if (err || !user) {
      try {
        const req = context.switchToHttp().getRequest<{ method?: string; url?: string; ip?: string }>();
        const path = req?.method && req?.url ? `${req.method} ${req.url}` : "HTTP";
        const detail =
          err instanceof Error
            ? err.message
            : typeof info === "string"
              ? info
              : info instanceof Error
                ? info.message
                : err != null
                  ? String(err)
                  : "invalid_or_expired_token";
        this.logger.warn(`[MALV auth] 401 ${path} — ${detail}`);
        try {
          this.observability.incAuthFailure({ reason: "invalid_or_expired_token", channel: "jwt_guard" });
        } catch (metricErr) {
          this.logger.warn(
            `[MALV auth] metrics skipped: ${metricErr instanceof Error ? metricErr.message : String(metricErr)}`
          );
        }
        void this.securityEvents?.emitBestEffort({
          eventType: "auth.jwt.rejected",
          severity: "low",
          subsystem: "auth",
          summary: `JWT authentication failed: ${path}`,
          details: { reason: detail.slice(0, 500) },
          sourceIp: typeof req?.ip === "string" ? req.ip : null
        });
      } catch (sideEffectErr) {
        this.logger.warn(
          `[MALV auth] rejection logging failed: ${sideEffectErr instanceof Error ? sideEffectErr.message : String(sideEffectErr)}`
        );
      }
    }
    // @nestjs/passport default: `throw err || new UnauthorizedException()` — passport-jwt sets `err` to
    // JsonWebTokenError / TokenExpiredError, which are not HttpExceptions → 500. Clear `err` when there is
    // no authenticated user so the parent throws UnauthorizedException (401) instead.
    return super.handleRequest(!user ? null : err, user, info, context, status) as TUser;
  }
}

