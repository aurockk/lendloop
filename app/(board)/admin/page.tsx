"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { LoanCard } from "../../_components/loan-card";
import { Badge, Empty, ErrorNote, Loading, PageTitle, timeAgo, useRun } from "../../_components/ui";

function Health() {
  const health = useQuery(api.automation.health);
  const retry = useMutation(api.webhooks.retryDelivery);
  const { run, pending, error } = useRun();
  if (health === undefined) return <Loading />;
  const ok =
    health.failedDeliveries.length === 0 && health.workflowErrors.length === 0 && health.reminderFailures.length === 0;

  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="stencil text-3xl font-black">Automation health</h2>
        {ok ? <Badge tone="safety">All good</Badge> : <Badge tone="hazard">Needs attention</Badge>}
        {health.pendingCount > 0 && <Badge tone="ink">{health.pendingCount} retrying</Badge>}
      </div>
      <ErrorNote>{error}</ErrorNote>
      {health.failedDeliveries.length > 0 && (
        <div>
          <h3 className="label">Failed notifications (Convex → n8n)</h3>
          <ul className="space-y-1 text-sm">
            {health.failedDeliveries.map((d) => (
              <li key={d._id} className="flex flex-wrap items-center gap-2">
                <code className="text-xs">{d.event}</code>
                <span className="text-muted">
                  {d.attempts} attempts · {d.lastError} · {timeAgo(d.at)}
                </span>
                <button className="btn-ghost ml-auto py-0.5" disabled={pending} onClick={() => run(() => retry({ deliveryId: d._id }))}>
                  Retry
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {[...health.workflowErrors, ...health.reminderFailures].length > 0 && (
        <div>
          <h3 className="label">n8n workflow errors</h3>
          <ul className="space-y-1 text-sm text-muted">
            {[...health.workflowErrors, ...health.reminderFailures]
              .sort((a, b) => b.at - a.at)
              .map((e) => (
                <li key={e._id}>
                  {e.detail} · {timeAgo(e.at)}
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Lenders() {
  const lenders = useQuery(api.users.adminListLenders);
  const setTrusted = useMutation(api.users.setTrustedLender);
  const { run, pending, error } = useRun();
  if (lenders === undefined) return <Loading />;
  return (
    <div className="card">
      <h2 className="stencil mb-4 text-3xl font-black">Lenders</h2>
      <ErrorNote>{error}</ErrorNote>
      {lenders.length === 0 ? (
        <p className="text-sm text-muted">No one has listed a tool yet.</p>
      ) : (
        <ul className="divide-y divide-paint-line text-sm">
          {lenders.map((u) => (
            <li key={u._id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <span className="font-bold">{u.firstName}</span>
              <span className="text-muted">{u.email ?? "no email"}</span>
              <span className="text-muted">{u.activeListings} listing{u.activeListings === 1 ? "" : "s"}</span>
              {u.role === "admin" && <Badge>Admin</Badge>}
              <label className="ml-auto flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={u.trustedLender}
                  disabled={pending}
                  onChange={(e) => run(() => setTrusted({ userId: u._id, trusted: e.target.checked }))}
                />
                Trusted lender
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AllLoans() {
  const loans = useQuery(api.loans.adminAll);
  const markReturned = useMutation(api.loans.markReturned);
  const { run, pending, error } = useRun();
  if (loans === undefined) return <Loading />;
  return (
    <section>
      <h2 className="stencil mb-5 text-4xl font-black">All loans</h2>
      <ErrorNote>{error}</ErrorNote>
      {loans.length === 0 ? (
        <Empty>No loans yet.</Empty>
      ) : (
        <ul className="space-y-5">
          {loans.map((loan) => (
            <LoanCard
              key={loan._id}
              loan={loan}
              perspective="admin"
              actions={
                loan.status === "approved" && (
                  <button className="btn-ghost" disabled={pending} onClick={() => run(() => markReturned({ loanId: loan._id }))}>
                    Mark returned
                  </button>
                )
              }
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export default function AdminPage() {
  const me = useQuery(api.users.me);
  if (me === undefined) return <Loading />;
  if (me?.role !== "admin") {
    return <Empty>This page is for LendLoop admins.</Empty>;
  }
  return (
    <>
      <PageTitle
        title="Admin"
        subtitle="Remove listings from the All tools page. Everything here is also enforced server-side."
      />
      <div className="space-y-6">
        <Health />
        <Lenders />
        <AllLoans />
      </div>
    </>
  );
}
