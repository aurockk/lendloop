"use client";

import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CATEGORIES, type Category } from "@/convex/lib/constants";
import { ToolTile } from "../../_components/tool-tile";
import { Empty, ErrorNote, Loading, PageTitle, useRun } from "../../_components/ui";

/** A painted label tape; the active one is fully yellow. */
function Tape({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`whitespace-nowrap px-2.5 pt-1.5 pb-1 text-[12px] font-bold uppercase tracking-wider [font-stretch:85%] transition-colors ${
        active ? "bg-safety text-ink shadow-[0_2px_6px_rgb(40_25_8/0.3)]" : "bg-paint/85 text-ink hover:bg-paint"
      }`}
      style={{ borderRadius: 1 }}
    >
      {children}
    </button>
  );
}

export default function ToolsPage() {
  const [category, setCategory] = useState<Category | undefined>();
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [requesting, setRequesting] = useState<Id<"tools"> | null>(null);
  const [sent, setSent] = useState<Id<"tools"> | null>(null);
  const { results: shown, status, loadMore } = usePaginatedQuery(
    api.tools.list,
    { category, onlyAvailable: onlyAvailable || undefined },
    { initialNumItems: 18 },
  );
  const me = useQuery(api.users.me);
  const removeTool = useMutation(api.tools.remove);
  const { run, error } = useRun();

  return (
    <>
      <PageTitle
        title="All tools"
        subtitle="Everything your neighbours are happy to lend. An outline means it's out on loan."
        action={<Link href="/listings" className="btn-primary">List a tool</Link>}
      />

      <div className="mb-10 flex flex-wrap items-center gap-2">
        <Tape active={!category} onClick={() => setCategory(undefined)}>
          All
        </Tape>
        {CATEGORIES.map((c) => (
          <Tape key={c} active={category === c} onClick={() => setCategory(c)}>
            {c}
          </Tape>
        ))}
        <label className="solid-board ml-auto flex cursor-pointer items-center gap-2 px-2 py-1 text-sm font-semibold text-ink">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--ink)]"
            checked={onlyAvailable}
            onChange={(e) => setOnlyAvailable(e.target.checked)}
          />
          Hanging now
        </label>
      </div>

      <ErrorNote>{error}</ErrorNote>

      {status === "LoadingFirstPage" ? (
        <Loading />
      ) : shown.length === 0 && status === "Exhausted" ? (
        <Empty>Nothing on this part of the board. Try another category.</Empty>
      ) : (
        <ul className="grid items-start gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((t) => (
            <ToolTile
              key={t._id}
              tool={t}
              asked={t.hasPendingRequest || sent === t._id}
              isAdmin={me?.role === "admin"}
              requesting={requesting === t._id}
              onAsk={() => setRequesting(t._id)}
              onCancel={() => setRequesting(null)}
              onSent={() => {
                setRequesting(null);
                setSent(t._id);
              }}
              onRemove={() => {
                if (confirm(`Remove "${t.name}" from LendLoop? Pending requests will be declined.`)) {
                  run(() => removeTool({ toolId: t._id }));
                }
              }}
            />
          ))}
        </ul>
      )}
      {(status === "CanLoadMore" || status === "LoadingMore") && (
        <button className="btn-ghost mt-10" disabled={status === "LoadingMore"} onClick={() => loadMore(18)}>
          {status === "LoadingMore" ? "Loading…" : "Show more of the board"}
        </button>
      )}
    </>
  );
}
