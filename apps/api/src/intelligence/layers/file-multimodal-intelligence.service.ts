import { Injectable } from "@nestjs/common";
import type { FileMultimodalLayerOutput, MetaRouterInput } from "../meta-intelligence.types";

@Injectable()
export class FileMultimodalIntelligenceService {
  analyze(input: MetaRouterInput): FileMultimodalLayerOutput {
    const hasFiles = Boolean(input.hasFiles);
    return {
      modalityProfile: hasFiles ? ["document_or_media"] : ["text_only"],
      extractedSignals: hasFiles ? ["file_context_present"] : ["no_file_context"],
      fileUnderstandingSummary: hasFiles ? "file evidence available for retrieval path" : "no file inputs detected",
      multimodalEvidenceMap: hasFiles ? ["file_understanding", "chunk_retrieval"] : [],
      recommendedActionByModality: hasFiles ? ["run_file_retrieval_first"] : ["proceed_with_text_analysis"]
    };
  }
}
