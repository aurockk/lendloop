"use client";

import { ConvexError } from "convex/values";
import { useState, type ReactNode } from "react";

export function errorMessage(e: unknown): string {
  if (e instanceof ConvexError) return typeof e.data === "string" ? e.data : "Something went wrong";
  return "Something went wrong. Please try again.";
}

/** Wraps a mutation call with pending + error state. */
export function useRun() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setPending(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(errorMessage(e));
      return undefined;
    } finally {
      setPending(false);
    }
  }
  return { run, pending, error, setError };
}

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="bg-alert-paint px-3 py-2 text-sm font-medium text-alert" style={{ borderRadius: 2 }}>
      {children}
    </p>
  );
}

/** Page titles are stencilled straight onto the board. */
export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="stencil text-5xl font-black text-ink sm:text-6xl">{title}</h1>
        {subtitle && <p className="mt-3 max-w-prose text-[15px] font-medium text-ink-soft">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/** An empty stretch of board: a dashed painted outline waiting for something. */
export function Empty({ children }: { children: ReactNode }) {
  return (
    <div
      className="px-6 py-12 text-center text-[15px] font-medium text-ink-soft"
      style={{ border: "2.5px dashed var(--board-deep)", borderRadius: 4 }}
    >
      {children}
    </div>
  );
}

export function Loading() {
  return <p className="text-sm font-medium text-ink-soft">Loading the board…</p>;
}

type Tone = "neutral" | "safety" | "ink" | "hazard";
const TONES: Record<Tone, string> = {
  neutral: "bg-transparent text-ink-soft shadow-[inset_0_0_0_1.5px_var(--ink-soft)]",
  safety: "bg-safety text-ink",
  ink: "bg-ink text-paint",
  hazard: "hazard p-[3px]",
};

/** A small painted label. */
export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center px-1.5 pt-[3px] pb-[2px] text-[11px] font-bold uppercase leading-none tracking-wider [font-stretch:85%] ${TONES[tone]}`}
      style={{ borderRadius: 1 }}
    >
      {tone === "hazard" ? <span className="bg-ink px-1 pt-[2px] pb-[1px] text-safety">{children}</span> : children}
    </span>
  );
}

/** A brass inspection tag: the admin has vouched for this lender. */
export function TrustedBadge() {
  return (
    <span
      title="Vouched for by a LendLoop admin"
      className="inline-flex items-center gap-1 bg-[#c9a44c] px-1.5 pt-[3px] pb-[2px] text-[11px] font-bold uppercase leading-none tracking-wider text-ink [font-stretch:85%]"
      style={{ borderRadius: "1px 6px 6px 1px" }}
    >
      <svg aria-hidden viewBox="0 0 12 12" className="h-2.5 w-2.5 fill-current">
        <path d="M4.6 9.2L1.4 6l1.2-1.2 2 2 4.8-4.8L10.6 3.2z" />
      </svg>
      Trusted lender
    </span>
  );
}

const STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Pending", tone: "safety" },
  approved: { label: "Out on loan", tone: "ink" },
  declined: { label: "Declined", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  returned: { label: "Back on the board", tone: "neutral" },
};

export function StatusBadge({ status, overdue }: { status: string; overdue?: boolean }) {
  if (overdue) return <Badge tone="hazard">Overdue</Badge>;
  const s = STATUS[status] ?? { label: status, tone: "neutral" as Tone };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function timeAgo(ms: number): string {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function DateRange({ start, end }: { start: string; end: string }) {
  return (
    <span className="tabular-nums">
      {formatDate(start)} – {formatDate(end)}
    </span>
  );
}

const DAY = 86_400_000;
const dayNum = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / DAY;

/**
 * The loan's date rail: one line from pickup to return with a marker on
 * today, so "how long is left" reads without doing date maths.
 */
export function DateRail({ start, end, live }: { start: string; end: string; live: boolean }) {
  const s = dayNum(start);
  const e = dayNum(end) + 1; // inclusive end date
  // Read the clock once per mount, not on every render.
  const [today] = useState(() => Math.floor(Date.now() / DAY));
  const span = Math.max(e - s, 1);
  const pos = Math.min(Math.max((today + 0.5 - s) / span, 0), 1);
  const late = live && today >= e;
  const before = today < s;
  const left = Math.ceil(e - today - 0.5);
  const note = !live
    ? null
    : before
      ? `Starts in ${Math.ceil(s - today)} day${Math.ceil(s - today) === 1 ? "" : "s"}`
      : late
        ? `${Math.floor(today - e) + 1} day${Math.floor(today - e) + 1 === 1 ? "" : "s"} late`
        : `${left} day${left === 1 ? "" : "s"} left`;

  return (
    <div className="w-full">
      <div className="relative h-5">
        <div className={`absolute inset-x-0 top-1/2 h-[5px] -translate-y-1/2 ${late ? "hazard" : "bg-ink/85"}`} style={{ borderRadius: 1 }} />
        <span className="absolute top-1/2 left-0 h-3 w-[3px] -translate-y-1/2 bg-ink" />
        <span className="absolute top-1/2 right-0 h-3 w-[3px] -translate-y-1/2 bg-ink" />
        {live && (
          <span
            className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-safety shadow-[0_0_0_3px_var(--ink),0_2px_6px_rgb(40_25_8/0.4)]"
            style={{ left: `${pos * 100}%` }}
            title="Today"
          />
        )}
      </div>
      <div className="mt-1.5 flex justify-between text-xs font-semibold text-muted tabular-nums">
        <span>{formatDate(start)}</span>
        {note && <span className={late ? "text-alert" : "text-ink"}>{note}</span>}
        <span>{formatDate(end)}</span>
      </div>
    </div>
  );
}

type Activity = { kind: string; detail: string; at: number };

/** The automation log: what n8n did for this loan, newest first. */
export function ActivityLog({ items }: { items: Activity[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-4 space-y-1.5 border-t-2 border-dotted border-paint-line pt-3 text-[13px] text-muted">
      {items.map((a, i) => {
        const bad = a.kind.endsWith("failed") || a.kind === "workflow_error";
        return (
          <li key={i} className="flex items-start gap-2">
            <svg aria-hidden viewBox="0 0 16 16" className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${bad ? "text-alert" : "text-ink"}`}>
              {bad ? (
                <path fill="currentColor" d="M8 1l7 13H1zm-.9 4v4.5h1.8V5zm0 6v1.8h1.8V11z" />
              ) : (
                <path fill="none" stroke="currentColor" strokeWidth="1.8" d="M1.5 4.5h13v8h-13zM1.5 4.5L8 9.5l6.5-5" />
              )}
            </svg>
            <span>
              <span className={bad ? "font-semibold text-alert" : "text-ink"}>{a.detail}</span>
              <span className="text-muted"> · </span>
              <time dateTime={new Date(a.at).toISOString()}>{timeAgo(a.at)}</time>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
