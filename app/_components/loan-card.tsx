"use client";

import type { FunctionReturnType } from "convex/server";
import type { ReactNode } from "react";
import type { api } from "@/convex/_generated/api";
import { BoardSlot } from "./silhouette";
import { ActivityLog, DateRail, StatusBadge, TrustedBadge } from "./ui";

export type Loan = FunctionReturnType<typeof api.loans.myRequests>[number];

/** A loan is a strip of white paint on the board: what, who, the date rail, and its automation log. */
export function LoanCard({
  loan,
  perspective,
  actions,
}: {
  loan: Loan;
  perspective: "borrower" | "lender" | "admin";
  actions?: ReactNode;
}) {
  const who =
    perspective === "borrower" ? (
      <span className="flex flex-wrap items-center gap-2">
        From {loan.lenderFirstName} {loan.lenderTrusted && <TrustedBadge />}
      </span>
    ) : perspective === "lender" ? (
      <span>Asked by {loan.borrowerFirstName}</span>
    ) : (
      <span>
        {loan.borrowerFirstName} borrowing from {loan.lenderFirstName}
      </span>
    );
  const live = loan.status === "approved" || loan.status === "pending";
  const out = loan.status === "approved";

  return (
    <li className="panel group grid gap-x-6 gap-y-4 p-5 sm:grid-cols-[auto_1fr]">
      <div className="hidden sm:block">
        <div className="grid h-16 w-16 place-items-center bg-board" style={{ borderRadius: 2 }}>
          <BoardSlot category={loan.toolCategory} out={out} size="sm" />
        </div>
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h3 className="stencil text-2xl font-black">{loan.toolName}</h3>
              <StatusBadge status={loan.status} overdue={loan.overdue} />
            </div>
            <div className="mt-1 text-sm font-medium text-muted">{who}</div>
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
        <div className={`mt-4 max-w-xl ${live ? "" : "opacity-60"}`}>
          <DateRail start={loan.startDate} end={loan.endDate} live={out} />
        </div>
        {loan.note && perspective !== "borrower" && (
          <p className="mt-4 max-w-prose text-sm text-ink">
            <span className="font-semibold">Note:</span> {loan.note}
          </p>
        )}
        <ActivityLog items={loan.activity} />
      </div>
    </li>
  );
}
