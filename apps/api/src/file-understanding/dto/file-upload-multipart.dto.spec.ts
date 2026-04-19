import { validateSync } from "class-validator";
import { FileUploadMultipartDto } from "./file-upload-multipart.dto";

describe("FileUploadMultipartDto", () => {
  it("accepts multipart-style fileKind with no optional workspace/room ids", () => {
    const dto = Object.assign(new FileUploadMultipartDto(), { fileKind: "image" });
    const err = validateSync(dto, { whitelist: true, forbidNonWhitelisted: true });
    expect(err).toHaveLength(0);
  });

  it("rejects invalid fileKind", () => {
    const dto = Object.assign(new FileUploadMultipartDto(), { fileKind: "not-a-kind" });
    const err = validateSync(dto, { whitelist: true, forbidNonWhitelisted: true });
    expect(err.length).toBeGreaterThan(0);
  });
});
