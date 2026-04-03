/**
 * Opt-in MySQL integration tests (Docker required).
 *
 *   MALV_RUN_MYSQL_INTEGRATION=1 npm test -- malv-infra.mysql.integration
 *
 * Proves: MySQL GET_LOCK mutual exclusion (multi-node leader pattern), UNIQUE job lease
 * (duplicate work prevention), stale-lease → re-queue update matching job-runner logic,
 * and that observability helpers do not throw when used next to a DB connection.
 */
import { randomUUID } from "crypto";
import { DataSource } from "typeorm";
import { ObservabilityService } from "../common/observability.service";
import { ClusterLeaderService } from "./cluster-leader.service";

const RUN = process.env.MALV_RUN_MYSQL_INTEGRATION === "1";

const DDL = `
CREATE TABLE users (
  id CHAR(36) NOT NULL,
  email VARCHAR(255) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id)
) ENGINE=InnoDB;

CREATE TABLE ai_jobs (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  job_type VARCHAR(60) NOT NULL,
  requested_mode VARCHAR(20) NOT NULL DEFAULT 'Smart',
  classified_mode VARCHAR(20) NOT NULL DEFAULT 'beast',
  status VARCHAR(20) NOT NULL,
  progress INT NOT NULL DEFAULT 0,
  attempt_count INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  next_retry_after DATETIME(3) NULL,
  shard_key VARCHAR(120) NOT NULL DEFAULT 'default',
  queue_priority INT NOT NULL DEFAULT 50,
  payload JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_ai_jobs_user (user_id),
  CONSTRAINT fk_ai_jobs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE ai_job_leases (
  id CHAR(36) NOT NULL,
  ai_job_id CHAR(36) NOT NULL,
  owner_node VARCHAR(160) NOT NULL,
  owner_pid INT NULL,
  lease_token CHAR(64) NOT NULL,
  lease_expires_at DATETIME(3) NOT NULL,
  last_renewed_at DATETIME(3) NOT NULL,
  steal_count INT NOT NULL DEFAULT 0,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ai_job_leases_ai_job (ai_job_id),
  CONSTRAINT fk_ai_job_leases_job FOREIGN KEY (ai_job_id) REFERENCES ai_jobs(id) ON DELETE CASCADE
) ENGINE=InnoDB;
`;

function cfgLockName(name: string) {
  return { get: (k: string) => (k === "MALV_CLUSTER_LEADER_LOCK_NAME" ? name : undefined) } as any;
}

(RUN ? describe : describe.skip)("MySQL integration (leader lock, leases, recovery)", () => {
  jest.setTimeout(180_000);

  let port: number;
  let stopContainer: () => Promise<void>;

  beforeAll(async () => {
    const { GenericContainer, Wait } = await import("testcontainers");
    const container = await new GenericContainer("mysql:8.0.36")
      .withEnvironment({
        MYSQL_ROOT_PASSWORD: "malvit",
        MYSQL_DATABASE: "malv_it"
      })
      .withExposedPorts(3306)
      .withWaitStrategy(Wait.forLogMessage(/ready for connections/i).withStartupTimeout(120_000))
      .start();
    port = container.getMappedPort(3306);
    stopContainer = async () => {
      await container.stop();
    };

    const mysql = await import("mysql2/promise");
    const setup = await mysql.createConnection({
      host: "127.0.0.1",
      port,
      user: "root",
      password: "malvit",
      database: "malv_it",
      multipleStatements: true
    });
    await setup.query(DDL);
    await setup.end();
  });

  afterAll(async () => {
    if (stopContainer) await stopContainer();
  });

  async function openDataSource(): Promise<DataSource> {
    const ds = new DataSource({
      type: "mysql",
      host: "127.0.0.1",
      port,
      username: "root",
      password: "malvit",
      database: "malv_it",
      synchronize: false,
      logging: false
    });
    await ds.initialize();
    return ds;
  }

  it("GET_LOCK grants exactly one concurrent acquirer (multi-node leader pattern)", async () => {
    const ds1 = await openDataSource();
    const ds2 = await openDataSource();
    const qr1 = ds1.createQueryRunner();
    const qr2 = ds2.createQueryRunner();
    await qr1.connect();
    await qr2.connect();
    try {
      const lockName = `malv_it_${randomUUID().slice(0, 8)}`;
      const [a, b] = await Promise.all([
        qr1.query("SELECT GET_LOCK(?, 1) AS acquired", [lockName]),
        qr2.query("SELECT GET_LOCK(?, 1) AS acquired", [lockName])
      ]);
      const v1 = Number((a as any)?.[0]?.acquired);
      const v2 = Number((b as any)?.[0]?.acquired);
      expect(new Set([v1, v2])).toEqual(new Set([0, 1]));
      await qr1.query("SELECT RELEASE_LOCK(?) AS released", [lockName]);
      const c = await qr2.query("SELECT GET_LOCK(?, 2) AS acquired", [lockName]);
      expect(Number((c as any)?.[0]?.acquired)).toBe(1);
      await qr2.query("SELECT RELEASE_LOCK(?) AS released", [lockName]);
    } finally {
      await qr1.release();
      await qr2.release();
      await ds1.destroy();
      await ds2.destroy();
    }
  });

  it("ClusterLeaderService.runIfLeader runs once per lock holder", async () => {
    const ds = await openDataSource();
    try {
      const leader = new ClusterLeaderService(ds, cfgLockName(`svc_${randomUUID().slice(0, 8)}`));
      let n = 0;
      await leader.runIfLeader(async () => {
        n += 1;
      });
      expect(n).toBe(1);
    } finally {
      await ds.destroy();
    }
  });

  it("UNIQUE(ai_job_id) prevents duplicate leases (two nodes claiming same job)", async () => {
    const ds = await openDataSource();
    const mysql = await import("mysql2/promise");
    const conn = await mysql.createConnection({
      host: "127.0.0.1",
      port,
      user: "root",
      password: "malvit",
      database: "malv_it"
    });
    const userId = randomUUID();
    const jobId = randomUUID();
    await conn.query(`INSERT INTO users (id, email) VALUES (?, ?)`, [userId, `${userId}@t.test`]);
    await conn.query(
      `INSERT INTO ai_jobs (id, user_id, job_type, status) VALUES (?, ?, 'multimodal_deep_extract', 'queued')`,
      [jobId, userId]
    );
    const now = new Date();
    const ins = (lid: string, node: string) =>
      conn.query(
        `INSERT INTO ai_job_leases (id, ai_job_id, owner_node, lease_token, lease_expires_at, last_renewed_at) VALUES (?, ?, ?, 'tok', ?, ?)`,
        [lid, jobId, node, now, now]
      );
    await ins(randomUUID(), "node-a");
    await expect(ins(randomUUID(), "node-b")).rejects.toThrow(/Duplicate|ER_DUP_ENTRY/i);
    await conn.end();
    await ds.destroy();
  });

  it("concurrent lease inserts: at most one wins per job (multi-node-like race)", async () => {
    const mysql = await import("mysql2/promise");
    const c1 = await mysql.createConnection({
      host: "127.0.0.1",
      port,
      user: "root",
      password: "malvit",
      database: "malv_it"
    });
    const c2 = await mysql.createConnection({
      host: "127.0.0.1",
      port,
      user: "root",
      password: "malvit",
      database: "malv_it"
    });
    const userId = randomUUID();
    const jobId = randomUUID();
    await c1.query(`INSERT INTO users (id, email) VALUES (?, ?)`, [userId, `${userId}@t.test`]);
    await c1.query(
      `INSERT INTO ai_jobs (id, user_id, job_type, status) VALUES (?, ?, 'file_understand', 'queued')`,
      [jobId, userId]
    );
    const now = new Date();
    const l1 = randomUUID();
    const l2 = randomUUID();
    const q = (c: typeof c1, lid: string, node: string) =>
      c.query(
        `INSERT INTO ai_job_leases (id, ai_job_id, owner_node, lease_token, lease_expires_at, last_renewed_at) VALUES (?, ?, ?, 'tok', ?, ?)`,
        [lid, jobId, node, now, now]
      );
    const settled = await Promise.allSettled([q(c1, l1, "node-a"), q(c2, l2, "node-b")]);
    const ok = settled.filter((s) => s.status === "fulfilled").length;
    const bad = settled.filter((s) => s.status === "rejected").length;
    expect(ok).toBe(1);
    expect(bad).toBe(1);
    await c1.end();
    await c2.end();
  });

  it("stale lease pattern re-queues running job (matches leader recovery semantics)", async () => {
    const ds = await openDataSource();
    const mysql = await import("mysql2/promise");
    const conn = await mysql.createConnection({
      host: "127.0.0.1",
      port,
      user: "root",
      password: "malvit",
      database: "malv_it"
    });
    const userId = randomUUID();
    const jobId = randomUUID();
    await conn.query(`INSERT INTO users (id, email) VALUES (?, ?)`, [userId, `${userId}@t.test`]);
    await conn.query(
      `INSERT INTO ai_jobs (id, user_id, job_type, status, progress) VALUES (?, ?, 'file_understand', 'running', 50)`,
      [jobId, userId]
    );
    const expired = new Date(Date.now() - 600_000);
    await conn.query(
      `INSERT INTO ai_job_leases (id, ai_job_id, owner_node, lease_token, lease_expires_at, last_renewed_at) VALUES (?, ?, 'ghost', 'tok', ?, ?)`,
      [randomUUID(), jobId, expired, expired]
    );

    const staleRecoveryMs = 120_000;
    const staleAt = new Date(Date.now() - staleRecoveryMs);
    await conn.query(
      `UPDATE ai_jobs j
       INNER JOIN ai_job_leases l ON l.ai_job_id = j.id
       SET j.status = 'queued', j.progress = 0
       WHERE j.status = 'running' AND l.lease_expires_at < ?`,
      [staleAt]
    );
    const [rows] = await conn.query<any[]>(`SELECT status, progress FROM ai_jobs WHERE id = ?`, [jobId]);
    expect(rows[0].status).toBe("queued");
    expect(rows[0].progress).toBe(0);
    await conn.end();
    await ds.destroy();
  });

  it("observability job counters do not throw alongside an open DB connection", async () => {
    const ds = await openDataSource();
    try {
      const obs = new ObservabilityService({ get: () => "false" } as any);
      expect(() => {
        obs.recordJobExecution("multimodal_deep_extract", "retry_scheduled");
        obs.recordJobExecution("beast_proactive", "completed");
      }).not.toThrow();
      const ok = await ds.query("SELECT 1 AS ok");
      expect((ok as any)?.[0]?.ok).toBe(1);
    } finally {
      await ds.destroy();
    }
  });
});
