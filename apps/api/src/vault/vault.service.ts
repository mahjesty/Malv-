import { BadRequestException, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "crypto";
import { VaultEntryEntity, type VaultEntryType } from "../db/entities/vault-entry.entity";
import { VaultSessionEntity, type VaultSessionStatus } from "../db/entities/vault-session.entity";
import { KillSwitchService } from "../kill-switch/kill-switch.service";
import { ObservabilityService } from "../common/observability.service";

@Injectable()
export class VaultService {
  private readonly logger = new Logger(VaultService.name);
  private readonly cryptoMetrics = {
    encryptedWrites: 0,
    decryptReads: 0,
    migratedPlaintextReads: 0
  };

  constructor(
    @InjectRepository(VaultSessionEntity) private readonly sessions: Repository<VaultSessionEntity>,
    @InjectRepository(VaultEntryEntity) private readonly entries: Repository<VaultEntryEntity>,
    private readonly killSwitch: KillSwitchService,
    private readonly cfg: ConfigService,
    private readonly observability: ObservabilityService
  ) {}

  private vaultMasterKey(): Buffer {
    const raw = (this.cfg.get<string>("MALV_VAULT_MASTER_KEY") ?? "").trim();
    if (!raw) {
      const fallback = (this.cfg.get<string>("MALV_VAULT_UNLOCK_SECRET") ?? "").trim();
      if (!fallback) {
        throw new UnauthorizedException("Vault encryption key is not configured.");
      }
      return createHash("sha256").update(fallback, "utf8").digest();
    }
    if (/^[a-fA-F0-9]{64}$/.test(raw)) return Buffer.from(raw, "hex");
    try {
      const b64 = Buffer.from(raw, "base64");
      if (b64.length === 32) return b64;
    } catch {
      // no-op
    }
    return createHash("sha256").update(raw, "utf8").digest();
  }

  private encryptWithAesGcm(plaintext: Buffer, key: Buffer) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      ciphertextB64: ciphertext.toString("base64"),
      ivB64: iv.toString("base64"),
      tagB64: tag.toString("base64")
    };
  }

  private decryptWithAesGcm(args: { ciphertextB64: string; ivB64: string; tagB64: string; key: Buffer }) {
    const decipher = createDecipheriv("aes-256-gcm", args.key, Buffer.from(args.ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(args.tagB64, "base64"));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(args.ciphertextB64, "base64")), decipher.final()]);
    return plaintext;
  }

  private encryptEntryContent(plaintext: string) {
    const dek = randomBytes(32);
    const master = this.vaultMasterKey();
    const content = this.encryptWithAesGcm(Buffer.from(plaintext, "utf8"), dek);
    const wrapped = this.encryptWithAesGcm(dek, master);
    return {
      contentCiphertext: content.ciphertextB64,
      contentIv: content.ivB64,
      contentTag: content.tagB64,
      wrappedDek: wrapped.ciphertextB64,
      wrappedDekIv: wrapped.ivB64,
      wrappedDekTag: wrapped.tagB64,
      keyVersion: 1,
      encryptionAlg: "aes-256-gcm+envelope-v1",
      encryptedAt: new Date()
    };
  }

  private decryptEntryContent(entry: VaultEntryEntity): string {
    if (!entry.contentCiphertext || !entry.contentIv || !entry.contentTag || !entry.wrappedDek || !entry.wrappedDekIv || !entry.wrappedDekTag) {
      return entry.content;
    }
    const master = this.vaultMasterKey();
    const dek = this.decryptWithAesGcm({
      ciphertextB64: entry.wrappedDek,
      ivB64: entry.wrappedDekIv,
      tagB64: entry.wrappedDekTag,
      key: master
    });
    const content = this.decryptWithAesGcm({
      ciphertextB64: entry.contentCiphertext,
      ivB64: entry.contentIv,
      tagB64: entry.contentTag,
      key: dek
    });
    this.cryptoMetrics.decryptReads += 1;
    return content.toString("utf8");
  }

  private async migratePlaintextEntryIfNeeded(entry: VaultEntryEntity) {
    if (entry.contentCiphertext || !entry.content) return;
    const encrypted = this.encryptEntryContent(entry.content);
    entry.contentCiphertext = encrypted.contentCiphertext;
    entry.contentIv = encrypted.contentIv;
    entry.contentTag = encrypted.contentTag;
    entry.wrappedDek = encrypted.wrappedDek;
    entry.wrappedDekIv = encrypted.wrappedDekIv;
    entry.wrappedDekTag = encrypted.wrappedDekTag;
    entry.keyVersion = encrypted.keyVersion;
    entry.encryptionAlg = encrypted.encryptionAlg;
    entry.encryptedAt = encrypted.encryptedAt;
    entry.content = "";
    await this.entries.save(entry);
    this.cryptoMetrics.migratedPlaintextReads += 1;
    this.observability.incVaultMigration("lazy_read");
    this.logger.log(
      JSON.stringify({
        tag: "vault.entry.migrated_plaintext",
        entryId: entry.id,
        userId: (entry.user as any)?.id ?? "unknown",
        metrics: this.cryptoMetrics
      })
    );
  }

  /**
   * Validates optional server-side vault phrase (env MALV_VAULT_UNLOCK_SECRET). If unset, any non-empty phrase opens (dev only).
   */
  private assertVaultPhrase(secretPhrase: string | undefined | null) {
    const nodeEnv = (this.cfg.get<string>("NODE_ENV") ?? "").trim().toLowerCase();
    const isProduction = nodeEnv === "production";
    const expected = (this.cfg.get<string>("MALV_VAULT_UNLOCK_SECRET") ?? "").trim();
    const expectedSha256 = (this.cfg.get<string>("MALV_VAULT_UNLOCK_SECRET_SHA256") ?? "").trim().toLowerCase();
    const got = (secretPhrase ?? "").trim();
    if (!got) throw new BadRequestException("Secret phrase required.");
    if (isProduction && !expected && !expectedSha256) {
      throw new UnauthorizedException("Vault unlock is not configured.");
    }
    if (expectedSha256) {
      const gotHash = createHash("sha256").update(got).digest("hex").toLowerCase();
      const a = Buffer.from(gotHash, "utf8");
      const b = Buffer.from(expectedSha256, "utf8");
      const ok = a.length === b.length && timingSafeEqual(a, b);
      if (!ok) throw new UnauthorizedException("Invalid vault phrase.");
      return;
    }
    if (expected) {
      const a = Buffer.from(got, "utf8");
      const b = Buffer.from(expected, "utf8");
      const ok = a.length === b.length && timingSafeEqual(a, b);
      if (!ok) throw new UnauthorizedException("Invalid vault phrase.");
      return;
    }
  }

  async openSession(args: { userId: string; accessLabel?: string | null; secretPhrase?: string | null }) {
    await this.killSwitch.ensureSystemOnOrThrow({ reason: "vault_mutation" });
    this.assertVaultPhrase(args.secretPhrase ?? "");

    const session = this.sessions.create({
      user: { id: args.userId } as any,
      status: "open" as VaultSessionStatus,
      accessLabel: args.accessLabel ?? null,
      openedAt: new Date()
    });
    await this.sessions.save(session);
    return session;
  }

  async getOpenSessionForUser(args: { userId: string; sessionId: string }) {
    const s = await this.sessions.findOne({
      where: { id: args.sessionId, user: { id: args.userId }, status: "open" as VaultSessionStatus }
    });
    return s;
  }

  async listSessions(args: { userId: string; limit: number; offset: number }) {
    await this.killSwitch.ensureSystemOnOrThrow({ reason: "vault_read" });
    const [rows, total] = await this.sessions.findAndCount({
      where: { user: { id: args.userId } },
      order: { openedAt: "DESC" },
      take: args.limit,
      skip: args.offset
    });
    return {
      items: rows.map((s) => ({
        id: s.id,
        status: s.status,
        accessLabel: s.accessLabel ?? null,
        openedAt: s.openedAt,
        closedAt: s.closedAt ?? null
      })),
      total
    };
  }

  async listEntries(args: { userId: string; vaultSessionId?: string | null; limit: number; offset: number }) {
    await this.killSwitch.ensureSystemOnOrThrow({ reason: "vault_read" });
    const where: Record<string, unknown> = { user: { id: args.userId } };
    if (args.vaultSessionId) {
      where.vaultSession = { id: args.vaultSessionId };
    }
    const [rows, total] = await this.entries.findAndCount({
      where: where as any,
      relations: ["vaultSession"],
      order: { createdAt: "DESC" },
      take: args.limit,
      skip: args.offset
    });
    const items = await Promise.all(
      rows.map(async (e) => {
        await this.migratePlaintextEntryIfNeeded(e);
        return {
        id: e.id,
        vaultSessionId: (e.vaultSession as VaultSessionEntity).id,
        entryType: e.entryType,
        label: e.label ?? null,
        content: this.decryptEntryContent(e),
        metadata: e.metadata ?? null,
        createdAt: e.createdAt
      };
      })
    );
    return {
      items,
      total
    };
  }

  async closeSession(args: { sessionId: string; userId: string }) {
    await this.killSwitch.ensureSystemOnOrThrow({ reason: "vault_mutation" });

    const session = await this.sessions.findOne({
      where: { id: args.sessionId, user: { id: args.userId }, status: "open" as VaultSessionStatus }
    });
    if (!session) throw new BadRequestException("Vault session not found or already closed.");

    session.status = "closed";
    session.closedAt = new Date();
    await this.sessions.save(session);
    return session;
  }

  async addEntry(args: {
    userId: string;
    vaultSessionId: string;
    entryType: VaultEntryType;
    label?: string | null;
    content: string;
    metadata?: Record<string, unknown> | null;
  }) {
    await this.killSwitch.ensureSystemOnOrThrow({ reason: "vault_mutation" });

    const session = await this.sessions.findOne({
      where: { id: args.vaultSessionId, user: { id: args.userId }, status: "open" as VaultSessionStatus }
    });
    if (!session) throw new BadRequestException("Vault session not open or not owned by user.");

    const entry = this.entries.create({
      vaultSession: session,
      user: { id: args.userId } as any,
      entryType: args.entryType,
      label: args.label ?? null,
      content: "",
      ...this.encryptEntryContent(args.content),
      metadata: args.metadata ?? null
    });
    await this.entries.save(entry);
    this.cryptoMetrics.encryptedWrites += 1;
    this.logger.log(
      JSON.stringify({
        tag: "vault.entry.encrypted_write",
        entryId: entry.id,
        userId: args.userId,
        metrics: this.cryptoMetrics
      })
    );
    return entry;
  }
}

