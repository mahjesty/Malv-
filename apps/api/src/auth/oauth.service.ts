import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import crypto from "crypto";
import * as jwt from "jsonwebtoken";
import type { Response } from "express";
import { Repository } from "typeorm";
import { UserEntity } from "../db/entities/user.entity";
import { AuthService } from "./auth.service";

type OAuthProvider = "google" | "github" | "apple";

@Injectable()
export class OAuthService {
  private appleJwksCache: { expiresAt: number; keys: Array<Record<string, unknown>> } | null = null;

  constructor(
    private readonly cfg: ConfigService,
    private readonly jwt: JwtService,
    private readonly auth: AuthService,
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>
  ) {}

  private stateSecret(): string {
    const secret = (this.cfg.get<string>("OAUTH_STATE_SECRET") ?? "").trim();
    if (secret.length < 32 || secret.toLowerCase().includes("change-me")) {
      throw new BadRequestException("OAuth state secret is not configured securely.");
    }
    return secret;
  }

  private async signState(provider: OAuthProvider): Promise<string> {
    return this.jwt.signAsync(
      { provider, n: crypto.randomBytes(16).toString("hex") },
      { secret: this.stateSecret(), expiresIn: "10m" }
    );
  }

  private async verifyState(token: string, provider: OAuthProvider): Promise<void> {
    const payload = await this.jwt.verifyAsync<{ provider: string }>(token, { secret: this.stateSecret() });
    if (payload.provider !== provider) throw new UnauthorizedException("Invalid OAuth state.");
  }

  private webOrigin(): string {
    return this.cfg.get<string>("WEB_ORIGIN") ?? "http://localhost:5173";
  }

  redirectSuccess(res: Response, tokens: { accessToken: string; refreshToken: string }) {
    const cookieName = this.cfg.get<string>("AUTH_REFRESH_COOKIE_NAME") ?? "malv_refresh";
    const secure = (this.cfg.get<string>("AUTH_REFRESH_COOKIE_SECURE") ?? (process.env.NODE_ENV === "production" ? "true" : "false")) === "true";
    const sameSiteRaw = (this.cfg.get<string>("AUTH_REFRESH_COOKIE_SAMESITE") ?? "lax").toLowerCase();
    const sameSite = sameSiteRaw === "strict" || sameSiteRaw === "none" ? sameSiteRaw : "lax";
    const maxAgeSec = Number(this.cfg.get<string>("AUTH_REFRESH_COOKIE_MAX_AGE_SECONDS") ?? this.cfg.get<string>("REFRESH_TOKEN_TTL_SECONDS") ?? 1209600);
    res.cookie(cookieName, tokens.refreshToken, {
      httpOnly: true,
      secure,
      sameSite: sameSite as "lax" | "strict" | "none",
      path: this.cfg.get<string>("AUTH_REFRESH_COOKIE_PATH") ?? "/",
      domain: this.cfg.get<string>("AUTH_REFRESH_COOKIE_DOMAIN") ?? undefined,
      maxAge: Math.max(60, maxAgeSec) * 1000
    });
    const u = new URL(`${this.webOrigin()}/auth/oauth/callback`);
    u.searchParams.set("status", "ok");
    return res.redirect(302, u.toString());
  }

  redirectError(res: Response, code: string) {
    const u = new URL(`${this.webOrigin()}/auth/oauth/callback`);
    u.searchParams.set("error", code);
    return res.redirect(302, u.toString());
  }

  async buildGoogleAuthorizeUrl(): Promise<string> {
    const clientId = this.cfg.get<string>("GOOGLE_CLIENT_ID");
    const redirectUri = this.cfg.get<string>("OAUTH_GOOGLE_REDIRECT_URI");
    if (!clientId || !redirectUri) throw new BadRequestException("Google OAuth is not configured.");
    const state = await this.signState("google");
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      access_type: "online",
      prompt: "select_account"
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async handleGoogleCallback(code: string | undefined, state: string | undefined, res: Response): Promise<void> {
    if (!code || !state) {
      this.redirectError(res, "missing_code");
      return;
    }
    try {
      await this.verifyState(state, "google");
    } catch {
      this.redirectError(res, "bad_state");
      return;
    }

    const clientId = this.cfg.get<string>("GOOGLE_CLIENT_ID");
    const clientSecret = this.cfg.get<string>("GOOGLE_CLIENT_SECRET");
    const redirectUri = this.cfg.get<string>("OAUTH_GOOGLE_REDIRECT_URI");
    if (!clientId || !clientSecret || !redirectUri) {
      this.redirectError(res, "google_not_configured");
      return;
    }

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri
      })
    });

    if (!tokenRes.ok) {
      this.redirectError(res, "google_token");
      return;
    }

    const tokenJson = (await tokenRes.json()) as { access_token?: string };
    if (!tokenJson.access_token) {
      this.redirectError(res, "google_token");
      return;
    }

    const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { authorization: `Bearer ${tokenJson.access_token}` }
    });
    if (!profileRes.ok) {
      this.redirectError(res, "google_profile");
      return;
    }

    const profile = (await profileRes.json()) as { sub: string; email: string; name?: string };
    if (!profile.email) {
      this.redirectError(res, "google_email");
      return;
    }

    const tokens = await this.upsertGoogleUser({
      sub: profile.sub,
      email: profile.email,
      name: profile.name ?? profile.email.split("@")[0]
    });
    this.redirectSuccess(res, tokens);
  }

  private async upsertGoogleUser(p: { sub: string; email: string; name: string }) {
    let user = await this.users.findOne({ where: { oauthGoogleSub: p.sub } });
    if (user) return this.auth.createSessionForUser(user);

    user = await this.users.findOne({ where: { email: p.email } });
    if (user) {
      user = await this.auth.linkOAuthToExistingUser(user, { oauthGoogleSub: p.sub });
      return this.auth.createSessionForUser(user);
    }

    user = await this.auth.registerOAuthUser({
      email: p.email,
      displayName: p.name,
      oauthGoogleSub: p.sub
    });
    return this.auth.createSessionForUser(user);
  }

  async buildGithubAuthorizeUrl(): Promise<string> {
    const clientId = this.cfg.get<string>("GITHUB_CLIENT_ID");
    const redirectUri = this.cfg.get<string>("OAUTH_GITHUB_REDIRECT_URI");
    if (!clientId || !redirectUri) throw new BadRequestException("GitHub OAuth is not configured.");
    const state = await this.signState("github");
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: "read:user user:email",
      state
    });
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  async handleGithubCallback(code: string | undefined, state: string | undefined, res: Response): Promise<void> {
    if (!code || !state) {
      this.redirectError(res, "missing_code");
      return;
    }
    try {
      await this.verifyState(state, "github");
    } catch {
      this.redirectError(res, "bad_state");
      return;
    }

    const clientId = this.cfg.get<string>("GITHUB_CLIENT_ID");
    const clientSecret = this.cfg.get<string>("GITHUB_CLIENT_SECRET");
    const redirectUri = this.cfg.get<string>("OAUTH_GITHUB_REDIRECT_URI");
    if (!clientId || !clientSecret || !redirectUri) {
      this.redirectError(res, "github_not_configured");
      return;
    }

    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri
      })
    });

    if (!tokenRes.ok) {
      this.redirectError(res, "github_token");
      return;
    }

    const tokenJson = (await tokenRes.json()) as { access_token?: string };
    if (!tokenJson.access_token) {
      this.redirectError(res, "github_token");
      return;
    }

    const access = tokenJson.access_token;
    const userRes = await fetch("https://api.github.com/user", {
      headers: { authorization: `Bearer ${access}`, accept: "application/vnd.github+json" }
    });
    if (!userRes.ok) {
      this.redirectError(res, "github_profile");
      return;
    }

    const gh = (await userRes.json()) as { id: number; login: string; name?: string; email?: string | null };
    const sub = String(gh.id);
    let email = gh.email?.trim() || "";
    if (!email) {
      const emailsRes = await fetch("https://api.github.com/user/emails", {
        headers: { authorization: `Bearer ${access}`, accept: "application/vnd.github+json" }
      });
      if (emailsRes.ok) {
        const list = (await emailsRes.json()) as { email: string; primary?: boolean }[];
        const primary = list.find((e) => e.primary) ?? list[0];
        email = primary?.email ?? "";
      }
    }
    if (!email) {
      email = `${gh.login}@users.noreply.github.com`;
    }

    const displayName = gh.name?.trim() || gh.login;
    const tokens = await this.upsertGithubUser({ sub, email, name: displayName });
    this.redirectSuccess(res, tokens);
  }

  private async upsertGithubUser(p: { sub: string; email: string; name: string }) {
    let user = await this.users.findOne({ where: { oauthGithubSub: p.sub } });
    if (user) return this.auth.createSessionForUser(user);

    user = await this.users.findOne({ where: { email: p.email } });
    if (user) {
      user = await this.auth.linkOAuthToExistingUser(user, { oauthGithubSub: p.sub });
      return this.auth.createSessionForUser(user);
    }

    user = await this.auth.registerOAuthUser({
      email: p.email,
      displayName: p.name,
      oauthGithubSub: p.sub
    });
    return this.auth.createSessionForUser(user);
  }

  private appleClientSecret(): string {
    const teamId = this.cfg.get<string>("APPLE_TEAM_ID");
    const clientId = this.cfg.get<string>("APPLE_CLIENT_ID");
    const keyId = this.cfg.get<string>("APPLE_KEY_ID");
    const raw = this.cfg.get<string>("APPLE_PRIVATE_KEY");
    if (!teamId || !clientId || !keyId || !raw) {
      throw new BadRequestException("Apple OAuth is not configured.");
    }
    const privateKey = raw.replace(/\\n/g, "\n");
    return jwt.sign(
      {
        iss: teamId,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 86400 * 150,
        aud: "https://appleid.apple.com",
        sub: clientId
      },
      privateKey,
      { algorithm: "ES256", keyid: keyId }
    );
  }

  async buildAppleAuthorizeUrl(): Promise<string> {
    const clientId = this.cfg.get<string>("APPLE_CLIENT_ID");
    const redirectUri = this.cfg.get<string>("OAUTH_APPLE_REDIRECT_URI");
    if (!clientId || !redirectUri) throw new BadRequestException("Apple OAuth is not configured.");
    const state = await this.signState("apple");
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: "name email",
      response_mode: "form_post",
      state
    });
    return `https://appleid.apple.com/auth/authorize?${params.toString()}`;
  }

  private async getAppleJwks(): Promise<Array<Record<string, unknown>>> {
    const now = Date.now();
    if (this.appleJwksCache && this.appleJwksCache.expiresAt > now) {
      return this.appleJwksCache.keys;
    }
    const res = await fetch("https://appleid.apple.com/auth/keys");
    if (!res.ok) throw new UnauthorizedException("Unable to verify Apple identity token.");
    const data = (await res.json()) as { keys?: Array<Record<string, unknown>> };
    const keys = Array.isArray(data.keys) ? data.keys : [];
    if (keys.length === 0) throw new UnauthorizedException("Unable to verify Apple identity token.");
    this.appleJwksCache = { keys, expiresAt: now + 10 * 60 * 1000 };
    return keys;
  }

  private async verifyAppleIdToken(idToken: string): Promise<Record<string, unknown>> {
    const decoded = jwt.decode(idToken, { complete: true }) as
      | { header?: { kid?: string; alg?: string } | undefined }
      | null;
    const kid = decoded?.header?.kid;
    const alg = decoded?.header?.alg;
    if (!kid || alg !== "RS256") throw new UnauthorizedException("Invalid id_token.");

    const jwks = await this.getAppleJwks();
    const jwk = jwks.find((k) => String(k.kid ?? "") === kid);
    if (!jwk) throw new UnauthorizedException("Invalid id_token.");

    const publicKey = crypto.createPublicKey({ key: jwk as crypto.JsonWebKey, format: "jwk" }).export({
      type: "spki",
      format: "pem"
    });
    const audience = this.cfg.get<string>("APPLE_CLIENT_ID");
    if (!audience) throw new UnauthorizedException("Apple OAuth is not configured.");

    const claims = jwt.verify(idToken, publicKey, {
      algorithms: ["RS256"],
      issuer: "https://appleid.apple.com",
      audience
    }) as Record<string, unknown>;
    return claims;
  }

  async handleAppleCallback(body: Record<string, string | undefined>, res: Response): Promise<void> {
    const code = body.code;
    const state = body.state;
    const userFirst = body.user;

    if (!code || !state) {
      this.redirectError(res, "missing_code");
      return;
    }
    try {
      await this.verifyState(state, "apple");
    } catch {
      this.redirectError(res, "bad_state");
      return;
    }

    const clientId = this.cfg.get<string>("APPLE_CLIENT_ID");
    const redirectUri = this.cfg.get<string>("OAUTH_APPLE_REDIRECT_URI");
    if (!clientId || !redirectUri) {
      this.redirectError(res, "apple_not_configured");
      return;
    }

    let clientSecret: string;
    try {
      clientSecret = this.appleClientSecret();
    } catch {
      this.redirectError(res, "apple_not_configured");
      return;
    }

    const tokenRes = await fetch("https://appleid.apple.com/auth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri
      })
    });

    if (!tokenRes.ok) {
      this.redirectError(res, "apple_token");
      return;
    }

    const tokenJson = (await tokenRes.json()) as { id_token?: string };
    if (!tokenJson.id_token) {
      this.redirectError(res, "apple_token");
      return;
    }

    let claims: Record<string, unknown>;
    try {
      claims = await this.verifyAppleIdToken(tokenJson.id_token);
    } catch {
      this.redirectError(res, "apple_token_invalid");
      return;
    }
    const sub = String(claims.sub ?? "");
    if (!sub) {
      this.redirectError(res, "apple_profile");
      return;
    }

    let email = typeof claims.email === "string" ? claims.email : "";
    let displayName = email ? email.split("@")[0] : "Apple User";

    if (userFirst) {
      try {
        const parsed = JSON.parse(userFirst) as {
          name?: { firstName?: string; lastName?: string };
          email?: string;
        };
        if (parsed.email) email = parsed.email;
        const fn = parsed.name?.firstName ?? "";
        const ln = parsed.name?.lastName ?? "";
        const combined = `${fn} ${ln}`.trim();
        if (combined) displayName = combined;
      } catch {
        // ignore malformed user payload
      }
    }

    if (!email) {
      const existing = await this.users.findOne({ where: { oauthAppleSub: sub } });
      if (!existing) {
        this.redirectError(res, "apple_email_required");
        return;
      }
      const tokens = await this.auth.createSessionForUser(existing);
      this.redirectSuccess(res, tokens);
      return;
    }

    const tokens = await this.upsertAppleUser({ sub, email, name: displayName });
    this.redirectSuccess(res, tokens);
  }

  private async upsertAppleUser(p: { sub: string; email: string; name: string }) {
    let user = await this.users.findOne({ where: { oauthAppleSub: p.sub } });
    if (user) return this.auth.createSessionForUser(user);

    user = await this.users.findOne({ where: { email: p.email } });
    if (user) {
      user = await this.auth.linkOAuthToExistingUser(user, { oauthAppleSub: p.sub });
      return this.auth.createSessionForUser(user);
    }

    user = await this.auth.registerOAuthUser({
      email: p.email,
      displayName: p.name,
      oauthAppleSub: p.sub
    });
    return this.auth.createSessionForUser(user);
  }
}
