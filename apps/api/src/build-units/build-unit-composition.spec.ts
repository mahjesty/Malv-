import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { BuildUnitService } from "./build-unit.service";
import { BuildUnitEntity } from "../db/entities/build-unit.entity";
import { BuildUnitCompositionEntity } from "../db/entities/build-unit-composition.entity";
import { BuildUnitVersionEntity } from "../db/entities/build-unit-version.entity";

function makeCompositionSvc(opts: {
  composition?: BuildUnitCompositionEntity | null;
  unit?: Partial<BuildUnitEntity> | null;
}) {
  const comp = opts.composition;
  const unit = opts.unit;
  const compositionsRepo = {
    find:    jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockImplementation(async () => comp ?? null),
    create:  jest.fn((x: any) => x),
    save:    jest.fn(async (x: any) => x),
    remove:  jest.fn(async () => undefined)
  };
  const unitsRepo: any = {
    findOne: jest.fn().mockImplementation(async () => unit ?? null),
    save:    jest.fn(async (x: any) => x),
    update:  jest.fn().mockResolvedValue({ affected: 1 }),
    increment: jest.fn().mockResolvedValue(undefined),
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([])
    }),
    create: jest.fn((x: any) => x),
    manager: {
      transaction: jest.fn(async (cb: any) =>
        cb({
          getRepository: (Ent: unknown) => {
            if (Ent === BuildUnitVersionEntity) {
              return { find: jest.fn().mockResolvedValue([]), create: jest.fn((x: any) => x), save: jest.fn(async (x: any) => x) };
            }
            return { findOne: unitsRepo.findOne, save: unitsRepo.save };
          }
        })
      )
    }
  };
  const productivity = {
    createTask: jest.fn().mockResolvedValue({ id: "task-1", title: "Comp", status: "todo" })
  };
  const fileUnderstanding = {
    assertUserOwnsFile:         jest.fn(),
    persistUploadAndRegister: jest.fn(),
    readBinaryForAuthorFile:    jest.fn()
  };
  return new BuildUnitService(
    unitsRepo,
    { create: jest.fn(), save: jest.fn() } as any,
    productivity as any,
    { find: jest.fn().mockResolvedValue([]), create: jest.fn((x: any) => x), save: jest.fn(async (x: any) => x) } as any,
    compositionsRepo as any,
    fileUnderstanding as any,
    undefined
  );
}

describe("BuildUnitService compositions", () => {
  it("getComposition throws NotFound when missing", async () => {
    const svc = makeCompositionSvc({ composition: null });
    await expect(svc.getComposition("u1", "missing")).rejects.toThrow(NotFoundException);
  });

  it("getComposition throws Forbidden for other user", async () => {
    const row = { id: "c1", userId: "owner", name: "Sys", unitIds: ["a", "b"], metadataJson: null } as BuildUnitCompositionEntity;
    const svc = makeCompositionSvc({ composition: row });
    await expect(svc.getComposition("intruder", "c1")).rejects.toThrow(ForbiddenException);
  });

  it("deleteComposition calls remove for owner", async () => {
    const row = { id: "c1", userId: "u1", name: "Sys", unitIds: ["a", "b"], metadataJson: null } as BuildUnitCompositionEntity;
    const compositionsRepo = {
      find:    jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(row),
      create:  jest.fn((x: any) => x),
      save:    jest.fn(async (x: any) => x),
      remove:  jest.fn(async () => undefined)
    };
    const unitsRepo: any = {
      findOne: jest.fn().mockResolvedValue({ id: "a", archivedAt: null }),
      save:    jest.fn(),
      update:  jest.fn(),
      increment: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([])
      }),
      create: jest.fn(),
      manager: { transaction: jest.fn(async (cb: any) => cb({ getRepository: () => ({ findOne: jest.fn(), save: jest.fn() }) })) }
    };
    const svc = new BuildUnitService(
      unitsRepo,
      {} as any,
      { createTask: jest.fn() } as any,
      { find: jest.fn(), create: jest.fn(), save: jest.fn() } as any,
      compositionsRepo as any,
      { assertUserOwnsFile: jest.fn(), persistUploadAndRegister: jest.fn(), readBinaryForAuthorFile: jest.fn() } as any,
      undefined
    );
    await svc.deleteComposition("u1", "c1");
    expect(compositionsRepo.remove).toHaveBeenCalledWith(row);
  });

  it("sendCompositionToTask builds task from composition", async () => {
    const row = { id: "c1", userId: "u1", name: "My bundle", unitIds: ["unit-a"], metadataJson: null } as BuildUnitCompositionEntity;
    const productivity = { createTask: jest.fn().mockResolvedValue({ id: "t1", title: "My bundle", status: "todo" }) };
    let call = 0;
    const unitsRepo: any = {
      findOne: jest.fn().mockImplementation(async () => {
        call++;
        if (call === 1) return row;
        return {
          id: "unit-a",
          title: "U",
          type: "template",
          description: "D",
          prompt: "P",
          archivedAt: null,
          visibility: "public",
          authorUserId: null,
          executionProfileJson: {}
        };
      }),
      save: jest.fn(),
      update: jest.fn(),
      increment: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([])
      }),
      create: jest.fn(),
      manager: { transaction: jest.fn(async (cb: any) => cb({ getRepository: () => ({ findOne: jest.fn(), save: jest.fn() }) })) }
    };
    const compositionsRepo = {
      find: jest.fn(),
      findOne: jest.fn().mockResolvedValue(row),
      create: jest.fn(),
      save: jest.fn(),
      remove: jest.fn()
    };
    const svc = new BuildUnitService(
      unitsRepo,
      {} as any,
      productivity as any,
      { find: jest.fn(), create: jest.fn(), save: jest.fn() } as any,
      compositionsRepo as any,
      { assertUserOwnsFile: jest.fn(), persistUploadAndRegister: jest.fn(), readBinaryForAuthorFile: jest.fn() } as any,
      undefined
    );
    const out = await svc.sendCompositionToTask("u1", "c1");
    expect(out.task.id).toBe("t1");
    expect(productivity.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType:        "explore_composition",
        sourceReferenceId: "c1",
        title:             "My bundle"
      })
    );
  });
});
