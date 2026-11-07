import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import { as, listTool, setup } from "./helpers";

const firstPage = { numItems: 24, cursor: null };

describe("catalogue", () => {
  test("the public list exposes name and category only", async () => {
    const t = setup();
    const alice = await as(t, "Alice");
    await listTool(alice);
    const { page } = await t.query(api.tools.publicList, { paginationOpts: firstPage });
    expect(page).toHaveLength(1);
    expect(Object.keys(page[0]).sort()).toEqual(["_id", "category", "name"]);
  });

  test("hundreds of newer removed tools can't hide older active ones", async () => {
    const t = setup();
    const alice = await as(t, "Alice");
    const keep = await listTool(alice, "Old ladder");
    const ownerId = (await alice.query(api.users.me, {}))!._id;
    await t.run(async (ctx) => {
      for (let i = 0; i < 250; i++) {
        await ctx.db.insert("tools", {
          ownerId,
          name: `Gone ${i}`,
          category: "Power tools",
          condition: "Good",
          description: "",
          removedAt: Date.now(),
        });
      }
    });

    const pub = await t.query(api.tools.publicList, { paginationOpts: firstPage });
    expect(pub.page.map((x) => x._id)).toEqual([keep]);
    const signedIn = await alice.query(api.tools.list, { category: "Power tools", paginationOpts: firstPage });
    expect(signedIn.page.map((x) => x._id)).toEqual([keep]);
  });

  test("page size is capped server-side", async () => {
    const t = setup();
    const res = await t.query(api.tools.publicList, { paginationOpts: { numItems: 10_000, cursor: null } });
    expect(res.page.length).toBeLessThanOrEqual(50);
  });
});
