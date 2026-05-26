import { test } from "node:test";
import assert from "node:assert/strict";
import { computeReplanSyncPlan } from "./series-replan-sync";

test("computeReplanSyncPlan reuses rows by sequence when times match", () => {
  const existing = [
    { id: "a", name: "Race 1", scheduled_at: "2026-06-01T10:00:00.000Z" },
    { id: "b", name: "Race 2", scheduled_at: "2026-06-08T10:00:00.000Z" },
  ];
  const planned = [new Date("2026-06-01T10:00:00.000Z"), new Date("2026-06-08T10:00:00.000Z")];

  const plan = computeReplanSyncPlan(planned, existing);

  assert.equal(plan.matchedCount, 2);
  assert.equal(plan.toInsert.length, 0);
  assert.equal(plan.toRemove.length, 0);
  assert.deepEqual(
    plan.toUpdate.map((r) => r.id),
    ["a", "b"],
  );
});

test("computeReplanSyncPlan moves race 2 by sequence when only its time shifts", () => {
  const existing = [
    { id: "a", name: "Race 1", scheduled_at: "2026-06-01T10:00:00.000Z" },
    { id: "b", name: "Race 2", scheduled_at: "2026-06-08T10:00:00.000Z" },
  ];
  const planned = [
    new Date("2026-06-01T10:00:00.000Z"),
    new Date("2026-06-09T11:30:00.000Z"),
  ];

  const plan = computeReplanSyncPlan(planned, existing);

  assert.equal(plan.matchedCount, 2);
  assert.equal(plan.toRemove.length, 0);
  assert.equal(plan.toInsert.length, 0);
  assert.equal(plan.toUpdate[1]?.id, "b");
  assert.equal(plan.toUpdate[1]?.scheduled_at, "2026-06-09T11:30:00.000Z");
});

test("computeReplanSyncPlan shifts second race by sequence when template moves race 2", () => {
  const existing = [
    { id: "a", name: "Race 1", scheduled_at: "2026-06-01T10:00:00.000Z" },
    { id: "b", name: "Race 2", scheduled_at: "2026-06-08T10:00:00.000Z" },
  ];
  const planned = [new Date("2026-06-01T10:00:00.000Z"), new Date("2026-06-15T10:00:00.000Z")];

  const plan = computeReplanSyncPlan(planned, existing);

  assert.equal(plan.matchedCount, 2);
  assert.equal(plan.toUpdate[1]?.id, "b");
  assert.equal(plan.toUpdate[1]?.scheduled_at, "2026-06-15T10:00:00.000Z");
  assert.equal(plan.toRemove.length, 0);
  assert.equal(plan.toInsert.length, 0);
});

test("computeReplanSyncPlan removes trailing existing and inserts trailing planned", () => {
  const existing = [
    { id: "a", name: "Race 1", scheduled_at: "2026-06-01T10:00:00.000Z" },
    { id: "b", name: "Race 2", scheduled_at: "2026-06-08T10:00:00.000Z" },
    { id: "c", name: "Race 3", scheduled_at: "2026-06-15T10:00:00.000Z" },
  ];
  const planned = [new Date("2026-06-01T10:00:00.000Z"), new Date("2026-06-22T10:00:00.000Z")];

  const plan = computeReplanSyncPlan(planned, existing);

  assert.equal(plan.matchedCount, 2);
  assert.equal(plan.toUpdate[0]?.id, "a");
  assert.equal(plan.toUpdate[1]?.id, "b");
  assert.equal(plan.toUpdate[1]?.scheduled_at, "2026-06-22T10:00:00.000Z");
  assert.equal(plan.toRemove.length, 1);
  assert.equal(plan.toRemove[0]?.id, "c");
  assert.equal(plan.toInsert.length, 0);
});

test("computeReplanSyncPlan keeps start time and skips delete when finishes recorded", () => {
  const existing = [
    { id: "a", name: "Race 1", scheduled_at: "2026-06-01T10:00:00.000Z" },
    { id: "b", name: "Race 2", scheduled_at: "2026-06-08T10:00:00.000Z" },
  ];
  const planned = [new Date("2026-06-01T10:00:00.000Z")];
  const locked = new Set(["b"]);

  const plan = computeReplanSyncPlan(planned, existing, { lockedStartTimeRaceIds: locked });

  assert.equal(plan.matchedCount, 1);
  assert.equal(plan.startTimeLockedCount, 0);
  assert.equal(plan.toRemove.length, 0);
  assert.equal(plan.toInsert.length, 0);
});

test("computeReplanSyncPlan locks start time on matched row with recorded finishes", () => {
  const existing = [
    { id: "a", name: "Race 1", scheduled_at: "2026-06-01T10:00:00.000Z" },
    { id: "b", name: "Race 2", scheduled_at: "2026-06-08T10:00:00.000Z" },
  ];
  const planned = [
    new Date("2026-06-01T10:00:00.000Z"),
    new Date("2026-06-09T11:30:00.000Z"),
  ];
  const locked = new Set(["b"]);

  const plan = computeReplanSyncPlan(planned, existing, { lockedStartTimeRaceIds: locked });

  assert.equal(plan.startTimeLockedCount, 1);
  assert.equal(plan.toUpdate[1]?.id, "b");
  assert.equal(plan.toUpdate[1]?.scheduled_at, "2026-06-08T10:00:00.000Z");
  assert.equal(plan.toUpdate[1]?.startTimeLocked, true);
});
