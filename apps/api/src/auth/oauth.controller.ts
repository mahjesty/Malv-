import { Controller, Get, Post, Query, Body, Res, BadRequestException, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { OAuthService } from "./oauth.service";
import { RateLimit } from "../common/rate-limit/rate-limit.decorator";
import { RateLimitGuard } from "../common/rate-limit/rate-limit.guard";

@Controller("v1/auth/oauth")
@UseGuards(RateLimitGuard)
export class OAuthController {
  constructor(private readonly oauth: OAuthService) {}

  @Get("google/start")
  @RateLimit({ key: "auth.oauth.google.start", limit: 20, windowSeconds: 60 })
  async googleStart(@Res({ passthrough: false }) res: Response) {
    let url: string;
    try {
      url = await this.oauth.buildGoogleAuthorizeUrl();
    } catch (e) {
      if (e instanceof BadRequestException) {
        this.oauth.redirectError(res, "google_not_configured");
        return;
      }
      throw e;
    }
    return res.redirect(302, url);
  }

  @Get("google/callback")
  @RateLimit({ key: "auth.oauth.google.callback", limit: 30, windowSeconds: 60 })
  async googleCallback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Query("error") oauthError: string | undefined,
    @Res({ passthrough: false }) res: Response
  ) {
    if (oauthError) {
      this.oauth.redirectError(res, oauthError);
      return;
    }
    await this.oauth.handleGoogleCallback(code, state, res);
  }

  @Get("github/start")
  @RateLimit({ key: "auth.oauth.github.start", limit: 20, windowSeconds: 60 })
  async githubStart(@Res({ passthrough: false }) res: Response) {
    let url: string;
    try {
      url = await this.oauth.buildGithubAuthorizeUrl();
    } catch (e) {
      if (e instanceof BadRequestException) {
        this.oauth.redirectError(res, "github_not_configured");
        return;
      }
      throw e;
    }
    return res.redirect(302, url);
  }

  @Get("github/callback")
  @RateLimit({ key: "auth.oauth.github.callback", limit: 30, windowSeconds: 60 })
  async githubCallback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Query("error") oauthError: string | undefined,
    @Res({ passthrough: false }) res: Response
  ) {
    if (oauthError) {
      this.oauth.redirectError(res, oauthError);
      return;
    }
    await this.oauth.handleGithubCallback(code, state, res);
  }

  @Get("apple/start")
  @RateLimit({ key: "auth.oauth.apple.start", limit: 20, windowSeconds: 60 })
  async appleStart(@Res({ passthrough: false }) res: Response) {
    let url: string;
    try {
      url = await this.oauth.buildAppleAuthorizeUrl();
    } catch (e) {
      if (e instanceof BadRequestException) {
        this.oauth.redirectError(res, "apple_not_configured");
        return;
      }
      throw e;
    }
    return res.redirect(302, url);
  }

  @Post("apple/callback")
  @RateLimit({ key: "auth.oauth.apple.callback", limit: 30, windowSeconds: 60 })
  async appleCallback(@Body() body: Record<string, string | undefined>, @Res({ passthrough: false }) res: Response) {
    await this.oauth.handleAppleCallback(body, res);
  }
}
