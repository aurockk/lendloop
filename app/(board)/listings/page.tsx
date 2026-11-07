"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CATEGORIES, CONDITIONS, type Category, type Condition } from "@/convex/lib/constants";
import { BoardSlot } from "../../_components/silhouette";
import { Badge, Empty, ErrorNote, formatDate, Loading, PageTitle, TrustedBadge, useRun } from "../../_components/ui";

type Draft = { name: string; category: Category; condition: Condition; description: string };
const EMPTY: Draft = { name: "", category: "Power tools", condition: "Good", description: "" };

function ToolForm({
  initial,
  toolId,
  onClose,
}: {
  initial: Draft;
  toolId?: Id<"tools">;
  onClose: () => void;
}) {
  const create = useMutation(api.tools.create);
  const update = useMutation(api.tools.update);
  const { run, pending, error } = useRun();
  const [d, setD] = useState<Draft>(initial);

  return (
    <form
      className="card space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await run(async () => {
          if (toolId) await update({ toolId, ...d });
          else await create(d);
          return true;
        });
        if (ok) onClose();
      }}
    >
      <h2 className="stencil text-3xl font-black">{toolId ? "Edit listing" : "List a tool"}</h2>
      <label className="block">
        <span className="label">Name</span>
        <input
          className="input"
          required
          minLength={2}
          maxLength={80}
          value={d.name}
          onChange={(e) => setD({ ...d, name: e.target.value })}
          placeholder="Cordless drill"
          autoFocus
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className="label">Category</span>
          <select className="input" value={d.category} onChange={(e) => setD({ ...d, category: e.target.value as Category })}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Condition</span>
          <select className="input" value={d.condition} onChange={(e) => setD({ ...d, condition: e.target.value as Condition })}>
            {CONDITIONS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="label">Short description</span>
        <textarea
          className="input min-h-20"
          maxLength={500}
          value={d.description}
          onChange={(e) => setD({ ...d, description: e.target.value })}
          placeholder="18V, two batteries, comes with a small bit set."
        />
      </label>
      <p className="text-xs font-medium text-muted">Only your first name is shown to signed-in neighbours. Your email is never shared.</p>
      <ErrorNote>{error}</ErrorNote>
      <div className="flex gap-2">
        <button className="btn-primary" disabled={pending}>
          {pending ? "Saving…" : toolId ? "Save changes" : "List tool"}
        </button>
        <button type="button" className="btn-ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function ListingsPage() {
  const tools = useQuery(api.tools.mine);
  const me = useQuery(api.users.me);
  const remove = useMutation(api.tools.remove);
  const [editing, setEditing] = useState<Id<"tools"> | "new" | null>(null);
  const { run, error } = useRun();

  return (
    <>
      <PageTitle
        title="My listings"
        subtitle="Tools you're lending to the neighbourhood."
        action={
          editing !== "new" && (
            <button className="btn-primary" onClick={() => setEditing("new")}>
              List a tool
            </button>
          )
        }
      />
      {me?.trustedLender && (
        <div className="mb-4">
          <TrustedBadge />
        </div>
      )}
      {me && !me.hasEmail && (
        <p className="panel mb-6 px-3 py-2 text-sm font-semibold text-ink">
          We don&apos;t have an email for your account, so you won&apos;t get request notifications.
        </p>
      )}

      {editing === "new" && (
        <div className="mb-4">
          <ToolForm initial={EMPTY} onClose={() => setEditing(null)} />
        </div>
      )}
      <ErrorNote>{error}</ErrorNote>

      {tools === undefined ? (
        <Loading />
      ) : tools.length === 0 && editing !== "new" ? (
        <Empty>You haven&apos;t listed anything yet.</Empty>
      ) : (
        <ul className="space-y-4">
          {tools.map((t) =>
            editing === t._id ? (
              <li key={t._id}>
                <ToolForm
                  toolId={t._id}
                  initial={{ name: t.name, category: t.category, condition: t.condition, description: t.description }}
                  onClose={() => setEditing(null)}
                />
              </li>
            ) : (
              <li key={t._id} className="panel group flex flex-wrap items-center justify-between gap-4 p-4 pr-5">
                <div className="flex min-w-0 items-center gap-5">
                <div className="grid h-16 w-16 shrink-0 place-items-center bg-board" style={{ borderRadius: 2 }}>
                  <BoardSlot category={t.category} out={!t.available} size="sm" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h3 className="stencil text-2xl font-black">{t.name}</h3>
                    {t.available ? null : t.overdue ? (
                      <Badge tone="hazard">Overdue</Badge>
                    ) : (
                      <Badge tone="ink">Out until {formatDate(t.onLoanUntil!)}</Badge>
                    )}
                    {t.pendingRequests > 0 && (
                      <Badge tone="neutral">
                        {t.pendingRequests} pending request{t.pendingRequests > 1 ? "s" : ""}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-muted [font-stretch:88%]">
                    {t.category} · {t.condition}
                  </p>
                </div>
                </div>
                <div className="flex gap-2">
                  <button className="btn-ghost" onClick={() => setEditing(t._id)}>
                    Edit
                  </button>
                  <button
                    className="btn-danger"
                    onClick={() => {
                      if (confirm(`Delete "${t.name}"? Pending requests will be declined.`)) {
                        run(() => remove({ toolId: t._id }));
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </>
  );
}
