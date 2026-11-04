import { describe, it, expect, vi, beforeEach } from "vitest";

const calls = vi.hoisted(() => ({ auto: [] as string[], dreame: [] as string[], synced: true }));
vi.mock("@/lib/sync-runner", () => ({ runAutoSync: vi.fn(async (id: string) => { calls.auto.push(id); return { synced: calls.synced, lastSyncAt: new Date() }; }) }));
vi.mock("@/lib/dreame-runner", () => ({ runDreame: vi.fn(async (p: { organizationId: string }) => { calls.dreame.push(p.organizationId); return []; }) }));

import { runTakt } from "@/lib/app-takt";
import { resetDb, seedWorld } from "./fixtures";

let orgId: string;
beforeEach(async () => {
  await resetDb();
  orgId = (await seedWorld()).org.id;
  calls.auto = []; calls.dreame = [];
});

describe("App-Takt", () => {
  it("gleicht jede Organisation ab; Saugroboter separat nur ohne Abgleich", async () => {
    calls.synced = true;
    await runTakt();
    expect(calls.auto).toEqual([orgId]);
    expect(calls.dreame).toEqual([]); // läuft schon im Abgleich mit

    calls.synced = false;
    await runTakt();
    expect(calls.dreame).toEqual([orgId]);
  });
});
