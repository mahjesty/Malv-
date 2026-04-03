import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthController } from "./auth.controller";
import { OAuthController } from "./oauth.controller";
import { AuthService } from "./auth.service";
import { OAuthService } from "./oauth.service";
import { JwtStrategy } from "./jwt.strategy";
import { UserEntity } from "../db/entities/user.entity";
import { RefreshTokenEntity } from "../db/entities/refresh-token.entity";
import { TrustedDeviceEntity } from "../db/entities/trusted-device.entity";
import { RoleEntity } from "../db/entities/role.entity";
import { UserRoleEntity } from "../db/entities/user-role.entity";
import { SessionEntity } from "../db/entities/session.entity";
import { VerificationTokenEntity } from "../db/entities/verification-token.entity";
import { PermissionEntity } from "../db/entities/permission.entity";
import { RolePermissionEntity } from "../db/entities/role-permission.entity";
import { PermissionsGuard } from "./guards/permissions.guard";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { AuditEventEntity } from "../db/entities/audit-event.entity";
import { CommonModule } from "../common/common.module";
import { SecurityModule } from "../security/security.module";

@Module({
  imports: [
    ConfigModule,
    CommonModule,
    SecurityModule,
    PassportModule,
    TypeOrmModule.forFeature([
      UserEntity,
      RefreshTokenEntity,
      TrustedDeviceEntity,
      RoleEntity,
      PermissionEntity,
      RolePermissionEntity,
      UserRoleEntity,
      SessionEntity,
      VerificationTokenEntity,
      AuditEventEntity
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const secret = (cfg.get<string>("JWT_ACCESS_SECRET") ?? "").trim();
        if (secret.length < 32 || secret.toLowerCase().includes("change-me")) {
          throw new Error("JWT_ACCESS_SECRET must be securely configured and at least 32 chars.");
        }
        // Access token lifetime: JWT_EXPIRES_IN (e.g. "30d", "15m") from env.
        // Long values are convenient for local dev; production should prefer shorter access tokens plus refresh (see refresh TTL).
        const jwtExpiresIn = cfg.get<string>("JWT_EXPIRES_IN")?.trim();
        const legacySeconds = cfg.get<string>("ACCESS_TOKEN_TTL_SECONDS")?.trim();
        const expiresIn =
          jwtExpiresIn && jwtExpiresIn.length > 0
            ? jwtExpiresIn
            : legacySeconds && legacySeconds.length > 0
              ? Number(legacySeconds)
              : "15m";

        return {
          secret,
          signOptions: {
            expiresIn,
            issuer: cfg.get<string>("JWT_ISSUER") ?? "malv",
            audience: cfg.get<string>("JWT_AUDIENCE") ?? "malv-users"
          }
        };
      }
    })
  ],
  controllers: [AuthController, OAuthController],
  providers: [AuthService, OAuthService, JwtStrategy, PermissionsGuard, JwtAuthGuard],
  exports: [AuthService, PermissionsGuard, JwtAuthGuard, PassportModule]
})
export class AuthModule {}

