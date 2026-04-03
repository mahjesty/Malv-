import { Injectable, Logger } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ConfigService } from "@nestjs/config";
import { ExtractJwt, Strategy } from "passport-jwt";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { UserEntity } from "../db/entities/user.entity";
import { UserRoleEntity } from "../db/entities/user-role.entity";
import { RolePermissionEntity } from "../db/entities/role-permission.entity";

export type JwtPayload = {
  sub: string;
  role: "admin" | "user";
  permissions?: string[];
  iat?: number;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    cfg: ConfigService,
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
    @InjectRepository(UserRoleEntity) private readonly userRoles: Repository<UserRoleEntity>,
    @InjectRepository(RolePermissionEntity) private readonly rolePermissions: Repository<RolePermissionEntity>
  ) {
    const secret = (cfg.get<string>("JWT_ACCESS_SECRET") ?? "").trim();
    if (secret.length < 32 || secret.toLowerCase().includes("change-me")) {
      throw new Error("JWT_ACCESS_SECRET must be securely configured and at least 32 chars.");
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
      issuer: cfg.get<string>("JWT_ISSUER") ?? "malv",
      audience: cfg.get<string>("JWT_AUDIENCE") ?? "malv-users"
    });
  }

  async validate(payload: JwtPayload) {
    try {
      const user = await this.users.findOne({ where: { id: payload.sub } });
      if (!user || !user.isActive) return null;
      const iatSec = Number(payload?.iat ?? 0);
      const updatedSec = Math.floor(user.updatedAt.getTime() / 1000);
      if (!Number.isFinite(iatSec) || iatSec < updatedSec) return null;

      const primaryRole = await this.userRoles.findOne({
        where: { user: { id: user.id }, isPrimary: true },
        relations: ["role"]
      });

      const roleKey = (primaryRole?.role?.roleKey ?? "user") as "admin" | "user";
      const perms =
        primaryRole?.role?.id
          ? await this.rolePermissions.find({
              where: { role: { id: primaryRole.role.id }, granted: true } as any,
              relations: ["permission"]
            })
          : [];
      return {
        userId: user.id,
        email: user.email,
        displayName: user.displayName,
        role: roleKey,
        permissions: perms.map((p) => p.permission?.permissionKey).filter((x): x is string => Boolean(x))
      };
    } catch (e) {
      // DB/driver errors must not surface as 500 from passport-jwt (non-HttpException).
      this.logger.warn(`validate failed: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }
}

