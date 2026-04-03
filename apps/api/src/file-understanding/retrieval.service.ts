import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { FileEmbeddingEntity } from "../db/entities/file-embedding.entity";

@Injectable()
export class RetrievalService {
  constructor(
    @InjectRepository(FileEmbeddingEntity) private readonly embeddings: Repository<FileEmbeddingEntity>
  ) {}

  private localEmbedding(text: string): number[] {
    const v = new Array<number>(64).fill(0);
    const t = text.slice(0, 4000);
    for (let i = 0; i < t.length; i++) {
      v[t.charCodeAt(i) % 64] += 1;
    }
    const norm = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1;
    return v.map((x) => x / norm);
  }

  private cosine(a: number[], b: number[]): number {
    let dot = 0;
    let an = 0;
    let bn = 0;
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) {
      dot += a[i] * b[i];
      an += a[i] * a[i];
      bn += b[i] * b[i];
    }
    const denom = Math.sqrt(an) * Math.sqrt(bn) || 1;
    return dot / denom;
  }

  async semanticRetrieve(args: { userId: string; fileId?: string; query: string; topK?: number }) {
    const topK = Math.max(1, Math.min(20, args.topK ?? 5));
    const queryVec = this.localEmbedding(args.query);

    const embeds = await this.embeddings.find({
      where: args.fileId
        ? ({ user: { id: args.userId }, file: { id: args.fileId } } as any)
        : ({ user: { id: args.userId } } as any),
      relations: ["fileChunk", "file"]
    });

    const scored = embeds
      .map((e) => ({
        score: this.cosine(queryVec, e.embeddingVector ?? []),
        chunk: e.fileChunk,
        fileId: (e.file as any)?.id ?? null
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return scored.map((s) => ({
      score: s.score,
      fileId: s.fileId,
      chunkId: s.chunk.id,
      chunkIndex: s.chunk.chunkIndex,
      content: s.chunk.content
    }));
  }
}

