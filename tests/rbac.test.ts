import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import { as, isoDay, listTool, setup } from "./helpers";

describe("listings are owner-only", () => {
  test("another user cannot edit or delete my tool", async () => {
    const t = setup();
    const alice = await as(t, "Alice");
    const bob = await as(t, "Bob");
    const toolId = await listTool(alice);

    await expect(
      bob.mutation(api.tools.update, {
        toolId,
        name: "Hijacked",
        category: "Other",
        condition: "Worn",
        description: "",
      }),
    ).rejects.toThrow(/your own listings/);
    await expect(bob.mutation(api.tools.remove, { toolId })).rejects.toThrow(/your own listings/);

    const mine = await alice.query(api.tools.mine, {});
    expect(mine.map((x) => x.name)).toEqual(["Cordless drill"]);
  });

  test("an admin can remove any listing, and it is audited", async () => {
    const t = setup();
    const alice = await as(t, "Alice");
    const admin = await as(t, "Admin");
    const toolId = await listTool(alice);

    await admin.mutation(api.tools.remove, { toolId });
    expect(await alice.query(api.tools.mine, {})).toEqual([]);
    const audit = await t.run((ctx) => ctx.db.query("auditLog").collect());
    expect(audit.map((a) => a.action)).toContain("tool.removed_by_admin");
  });
});

describe("loan decisions belong to the right person", () => {
  test("only the lender can approve; nobody can borrow their own tool", async () => {
    const t = setup();
    const alice = await as(t, "Alice");
    const bob = await as(t, "Bob");
    const carol = await as(t, "Carol");
    const toolId = await listTool(alice);

    await expect(
      alice.mutation(api.loans.request, { toolId, startDate: isoDay(1), endDate: isoDay(2) }),
    ).rejects.toThrow(/own tool/);

    const loanId = await bob.mutation(api.loans.request, { toolId, startDate: isoDay(1), endDate: isoDay(2) });
    await expect(bob.mutation(api.loans.approve, { loanId })).rejects.toThrow(/Only the lender/);
    await expect(carol.mutation(api.loans.decline, { loanId })).rejects.toThrow(/Only the lender/);
    await expect(alice.mutation(api.loans.cancel, { loanId })).rejects.toThrow(/Only the borrower/);
    await expect(carol.mutation(api.loans.markReturned, { loanId })).rejects.toThrow(/Only the lender/);

    await alice.mutation(api.loans.approve, { loanId });
    const [loan] = await bob.query(api.loans.myRequests, {});
    expect(loan.status).toBe("approved");
  });
});

describe("admin-only functions", () => {
  test("regular users are rejected server-side", async () => {
    const t = setup();
    const bob = await as(t, "Bob");
    const alice = await as(t, "Alice");

    await expect(bob.query(api.loans.adminAll, {})).rejects.toThrow(/Admins only/);
    await expect(bob.query(api.automation.health, {})).rejects.toThrow(/Admins only/);
    await expect(bob.query(api.users.adminListLenders, {})).rejects.toThrow(/Admins only/);
    const me = await alice.query(api.users.me, {});
    await expect(
      bob.mutation(api.users.setTrustedLender, { userId: me!._id, trusted: true }),
    ).rejects.toThrow(/Admins only/);
  });

  test("ADMIN_EMAILS only promotes a verified email", async () => {
    const t = setup();
    const impostor = await as(t, "Impostor", { email: "admin@example.com", emailVerified: false });
    expect((await impostor.query(api.users.me, {}))!.role).toBe("user");

    const real = await as(t, "Admin");
    expect((await real.query(api.users.me, {}))!.role).toBe("admin");
  });

  test("signed-out callers get nothing private", async () => {
    const t = setup();
    expect(await t.query(api.users.me, {})).toBeNull();
    expect((await t.query(api.tools.list, { paginationOpts: { numItems: 10, cursor: null } })).page).toEqual([]);
    await expect(t.mutation(api.tools.create, {
      name: "Drill", category: "Power tools", condition: "Good", description: "",
    })).rejects.toThrow(/Not signed in/);
  });
});
