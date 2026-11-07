"use client";

import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { BoardSlot } from "./silhouette";
import { DateRange, ErrorNote, formatDate, TrustedBadge, useRun } from "./ui";

function isoDay(offset = 0) {
  return new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
}

function RequestForm({ toolId, onSent, onCancel }: { toolId: Id<"tools">; onSent: () => void; onCancel: () => void }) {
  const request = useMutation(api.loans.request);
  const { run, pending, error } = useRun();
  const [start, setStart] = useState(isoDay(1));
  const [end, setEnd] = useState(isoDay(3));
  const [note, setNote] = useState("");

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const id = await run(() => request({ toolId, startDate: start, endDate: end, note: note || undefined }));
        if (id) onSent();
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        <label>
          <span className="label">From</span>
          <input type="date" className="input" required min={isoDay()} value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label>
          <span className="label">Until</span>
          <input type="date" className="input" required min={start} value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>
      <label className="block">
        <span className="label">Note for the lender (optional)</span>
        <input className="input" maxLength={280} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Hanging shelves this weekend" />
      </label>
      <ErrorNote>{error}</ErrorNote>
      <div className="flex gap-2">
        <button className="btn-primary" disabled={pending}>
          {pending ? "Sending…" : "Send request"}
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export type ToolRow = FunctionReturnType<typeof api.tools.list>["page"][number];

/** One tool on the board: its silhouette hanging (or just the outline), with a painted panel below. */
export function ToolTile({
  tool: t,
  asked,
  isAdmin,
  requesting,
  onAsk,
  onCancel,
  onSent,
  onRemove,
}: {
  tool: ToolRow;
  asked: boolean;
  isAdmin: boolean;
  requesting: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onSent: () => void;
  onRemove: () => void;
}) {
  return (
    <li className="group flex flex-col items-center text-center">
      <div className="relative flex h-32 items-end justify-center pb-2">
        <BoardSlot category={t.category} out={!t.available} size="lg" />
        {!t.available &&
          (t.overdue ? (
            <span className="hazard absolute bottom-3 left-1/2 -translate-x-1/2 p-[3px]">
              <span className="board-label !bg-ink !text-safety">Overdue</span>
            </span>
          ) : (
            <span className="board-label absolute bottom-3 left-1/2 -translate-x-1/2">Back {formatDate(t.onLoanUntil!)}</span>
          ))}
        {asked && <span className="board-label absolute right-[18%] bottom-3 rotate-6 !bg-safety">You asked</span>}
      </div>

      <h3 className="mt-2 max-w-full">
        <span className="name-strip max-w-full text-[22px] font-black break-words">{t.name}</span>
      </h3>
      <div className="solid-board mt-1 flex flex-col items-center px-3 py-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-ink-soft [font-stretch:85%]">
          {t.category} · {t.condition}
        </p>
        {t.description && <p className="mt-2 line-clamp-2 max-w-[18rem] text-sm leading-snug text-ink-soft">{t.description}</p>}
        {t.upcoming.length > 0 && (
          <p className="mt-1.5 text-xs font-semibold text-ink-soft">
            Booked:{" "}
            {t.upcoming.slice(0, 3).map((u, i) => (
              <span key={i}>
                {i > 0 && ", "}
                <DateRange start={u.startDate} end={u.endDate} />
              </span>
            ))}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm font-semibold text-ink-soft">
          <span>{t.isMine ? "Your tool" : `Lent by ${t.ownerFirstName}`}</span>
          {t.ownerTrusted && <TrustedBadge />}
        </div>
      </div>
      {(!t.isMine && !asked && !requesting) || (isAdmin && !t.isMine) ? (
        <div className="mt-3 flex gap-2">
          {!t.isMine && !asked && !requesting && (
            <button className="btn-primary px-3 py-1.5" onClick={onAsk}>
              Ask to borrow
            </button>
          )}
          {isAdmin && !t.isMine && (
            <button className="btn-danger px-3 py-1.5" onClick={onRemove}>
              Remove
            </button>
          )}
        </div>
      ) : null}
      {requesting && (
        <div className="panel mt-4 w-full p-4 text-left">
          <RequestForm toolId={t._id} onCancel={onCancel} onSent={onSent} />
        </div>
      )}
    </li>
  );
}
