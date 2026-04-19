import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from "typeorm";

export type BuildUnitType =
  | "template"
  | "component"
  | "behavior"
  | "workflow"
  | "plugin"
  | "blueprint"
  | "ai_generated";

export type BuildUnitVisibility = "public" | "private" | "team";
export type BuildUnitSourceKind = "system" | "user";

/** How the catalog card / detail header should present this unit visually. */
export type BuildUnitPreviewKind = "image" | "code" | "rendered" | "animation" | "mixed" | "none";

/**
 * Represents a reusable Build Unit — template, component, workflow, plugin, or blueprint.
 * System units (sourceKind='system') are seeded by MALV and are read-only.
 * User units (sourceKind='user') are created or forked by users and owned via authorUserId.
 * Forks preserve lineage via originalBuildUnitId.
 */
@Entity({ name: "build_units" })
export class BuildUnitEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  /** Deterministic slug for system units, generated for user units. */
  @Index({ unique: true })
  @Column({ type: "varchar", length: 120, name: "slug" })
  slug!: string;

  @Column({ type: "varchar", length: 220, name: "title" })
  title!: string;

  @Column({ type: "text", name: "description", nullable: true })
  description!: string | null;

  @Index()
  @Column({ type: "varchar", length: 30, name: "type" })
  type!: BuildUnitType;

  @Index()
  @Column({ type: "varchar", length: 60, name: "category" })
  category!: string;

  @Column({ type: "json", name: "tags", nullable: true })
  tags!: string[] | null;

  /** Execution prompt — used for Send to MALV and Open in Chat. */
  @Column({ type: "text", name: "prompt", nullable: true })
  prompt!: string | null;

  /** Representative code or config snippet shown in the detail panel. */
  @Column({ type: "text", name: "code_snippet", nullable: true })
  codeSnippet!: string | null;

  @Column({ type: "varchar", length: 500, name: "preview_image_url", nullable: true })
  previewImageUrl!: string | null;

  @Index()
  @Column({ type: "varchar", length: 20, name: "preview_kind", default: "none" })
  previewKind!: BuildUnitPreviewKind;

  /** Optional uploaded preview image (files.id); readable by anyone who can view the unit. */
  @Index()
  @Column({ type: "varchar", length: 36, name: "preview_file_id", nullable: true })
  previewFileId!: string | null;

  /** Persisted Explore grid snapshot (files.id); raster, SVG, or separate from HTML live preview. */
  @Index()
  @Column({ type: "varchar", length: 36, name: "preview_snapshot_id", nullable: true })
  previewSnapshotId!: string | null;

  /** Optional uploaded source asset (code/text); owner-only download. */
  @Index()
  @Column({ type: "varchar", length: 36, name: "source_file_id", nullable: true })
  sourceFileId!: string | null;

  @Column({ type: "varchar", length: 255, name: "source_file_name", nullable: true })
  sourceFileName!: string | null;

  @Column({ type: "varchar", length: 100, name: "source_file_mime", nullable: true })
  sourceFileMime!: string | null;

  /** Optional external URL for source manifest or hosted asset (not used for private uploads). */
  @Column({ type: "varchar", length: 512, name: "source_file_url", nullable: true })
  sourceFileUrl!: string | null;

  /**
   * User who owns this unit. Null for system units.
   * String FK (not ManyToOne) to match workspace task pattern for nullable user references.
   */
  @Index()
  @Column({ type: "varchar", length: 36, name: "author_user_id", nullable: true })
  authorUserId!: string | null;

  /** Display label shown in the UI — e.g. "MALV" for system units or user's display name. */
  @Column({ type: "varchar", length: 120, name: "author_label", nullable: true })
  authorLabel!: string | null;

  @Index()
  @Column({ type: "varchar", length: 20, name: "visibility", default: "public" })
  visibility!: BuildUnitVisibility;

  /** Whether this is a MALV system unit (read-only) or user-created unit (editable by owner). */
  @Index()
  @Column({ type: "varchar", length: 20, name: "source_kind", default: "user" })
  sourceKind!: BuildUnitSourceKind;

  /** Set on forks — references the original BuildUnit this was forked from. */
  @Index()
  @Column({ type: "varchar", length: 36, name: "original_build_unit_id", nullable: true })
  originalBuildUnitId!: string | null;

  @Column({ type: "tinyint", name: "forkable", default: 1 })
  forkable!: boolean;

  @Column({ type: "tinyint", name: "downloadable", default: 1 })
  downloadable!: boolean;

  @Column({ type: "tinyint", name: "verified", default: 0 })
  verified!: boolean;

  /** Surfaces this unit in the Trending section. */
  @Column({ type: "tinyint", name: "trending", default: 0 })
  trending!: boolean;

  /** Surfaces this unit in the Recommended section. */
  @Column({ type: "tinyint", name: "recommended", default: 0 })
  recommended!: boolean;

  /** Surfaces this unit in the New section. */
  @Column({ type: "tinyint", name: "is_new", default: 0 })
  isNew!: boolean;

  /** UI accent color (oklch or hex). Stored for consistent theming across clients. */
  @Column({ type: "varchar", length: 80, name: "accent", nullable: true })
  accent!: string | null;

  @Column({ type: "int", name: "uses_count", default: 0 })
  usesCount!: number;

  @Column({ type: "int", name: "forks_count", default: 0 })
  forksCount!: number;

  @Column({ type: "int", name: "downloads_count", default: 0 })
  downloadsCount!: number;

  /**
   * Extensible metadata for UI/integration hints and future signals.
   * Reserved shape (optional keys, additive only): usage aggregates, fork-graph hints,
   * external provenance — keep catalog API stable; do not overload for vanity metrics.
   * Explore catalog: `malvExploreBrowseExclude` (boolean) omits the unit from default list (search still finds it);
   * `malvExploreFeaturedRank` (number) orders the public browse grid; `malvExplorePreviewClass` hints card rendering.
   */
  @Column({ type: "json", name: "metadata_json", nullable: true })
  metadataJson!: Record<string, unknown> | null;

  /** Derived execution hints: inputs, ordered steps, complexity (computed on write / lazy backfill). */
  @Column({ type: "json", name: "execution_profile_json", nullable: true })
  executionProfileJson!: Record<string, unknown> | null;

  /** Code-derived preview lifecycle when published from intake (null for legacy rows). */
  @Column({ type: "varchar", length: 20, name: "intake_preview_state", nullable: true })
  intakePreviewState!: "not_requested" | "queued" | "ready" | "unavailable" | null;

  @Column({ type: "text", name: "intake_preview_unavailable_reason", nullable: true })
  intakePreviewUnavailableReason!: string | null;

  @Column({ type: "varchar", length: 32, name: "intake_audit_decision", nullable: true })
  intakeAuditDecision!: "pending" | "approved" | "approved_with_warnings" | "declined" | null;

  @Column({ type: "json", name: "intake_detection_json", nullable: true })
  intakeDetectionJson!: Record<string, unknown> | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  @Column({ type: "datetime", name: "archived_at", nullable: true })
  archivedAt!: Date | null;
}
