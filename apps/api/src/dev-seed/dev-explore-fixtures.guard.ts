import { CanActivate, ExecutionContext, Injectable, NotFoundException } from "@nestjs/common";

/**
 * Hides dev fixture routes outside local/dev unless explicitly enabled.
 * Returns 404 in production so paths are not discoverable.
 */
@Injectable()
export class DevExploreFixturesGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    const nodeEnv = process.env.NODE_ENV ?? "development";
    const explicit = process.env.MALV_DEV_EXPLORE_FIXTURES === "1" || process.env.MALV_DEV_EXPLORE_FIXTURES === "true";
    if (nodeEnv === "production" && !explicit) {
      throw new NotFoundException();
    }
    return true;
  }
}
