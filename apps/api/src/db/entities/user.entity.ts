import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity({ name: "users" })
export class UserEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 255 })
  email!: string;

  @Column({ type: "varchar", length: 255, name: "password_hash", nullable: true })
  passwordHash!: string | null;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 255, name: "oauth_google_sub", nullable: true })
  oauthGoogleSub?: string | null;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 255, name: "oauth_apple_sub", nullable: true })
  oauthAppleSub?: string | null;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 255, name: "oauth_github_sub", nullable: true })
  oauthGithubSub?: string | null;

  @Column({ type: "varchar", length: 120, name: "display_name" })
  displayName!: string;

  @Column({ type: "boolean", default: false, name: "email_verified" })
  emailVerified!: boolean;

  @Column({ type: "boolean", default: true, name: "is_active" })
  isActive!: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  @DeleteDateColumn({ name: "deleted_at" })
  deletedAt?: Date | null;
}

