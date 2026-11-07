"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { LoanCard } from "../../_components/loan-card";
import { Empty, ErrorNote, Loading, PageTitle, useRun } from "../../_components/ui";

export default function IncomingPage() {
  const loans = useQuery(api.loans.incoming);
  const approve = useMutation(api.loans.approve);
  const decline = useMutation(api.loans.decline);
  const markReturned = useMutation(api.loans.markReturned);
  const { run, pending, error } = useRun();

  const open = loans?.filter((l) => l.status === "pending" || l.status === "approved") ?? [];
  const closed = loans?.filter((l) => l.status !== "pending" && l.status !== "approved") ?? [];

  return (
    <>
      <PageTitle title="Incoming requests" subtitle="Neighbours asking to borrow your tools." />
      <ErrorNote>{error}</ErrorNote>
      {loans === undefined ? (
        <Loading />
      ) : loans.length === 0 ? (
        <Empty>No requests for your tools yet.</Empty>
      ) : (
        <div className="space-y-8">
          <ul className="space-y-5">
            {open.length === 0 && <Empty>Nothing needs your attention.</Empty>}
            {open.map((loan) => (
              <LoanCard
                key={loan._id}
                loan={loan}
                perspective="lender"
                actions={
                  loan.status === "pending" ? (
                    <>
                      <button className="btn-primary" disabled={pending} onClick={() => run(() => approve({ loanId: loan._id }))}>
                        Approve
                      </button>
                      <button className="btn-ghost" disabled={pending} onClick={() => run(() => decline({ loanId: loan._id }))}>
                        Decline
                      </button>
                    </>
                  ) : (
                    <button className="btn-ghost" disabled={pending} onClick={() => run(() => markReturned({ loanId: loan._id }))}>
                      Mark returned
                    </button>
                  )
                }
              />
            ))}
          </ul>
          {closed.length > 0 && (
            <section>
              <h2 className="stencil mb-5 text-3xl font-black">History</h2>
              <ul className="space-y-5">
                {closed.map((loan) => (
                  <LoanCard key={loan._id} loan={loan} perspective="lender" />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </>
  );
}
