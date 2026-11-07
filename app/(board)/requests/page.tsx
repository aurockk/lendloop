"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import { LoanCard } from "../../_components/loan-card";
import { Empty, ErrorNote, Loading, PageTitle, useRun } from "../../_components/ui";

export default function MyRequestsPage() {
  const loans = useQuery(api.loans.myRequests);
  const cancel = useMutation(api.loans.cancel);
  const { run, pending, error } = useRun();

  return (
    <>
      <PageTitle title="My requests" subtitle="Things you've asked to borrow." />
      <ErrorNote>{error}</ErrorNote>
      {loans === undefined ? (
        <Loading />
      ) : loans.length === 0 ? (
        <Empty>
          No requests yet. <Link href="/tools" className="font-semibold text-ink underline">Browse tools</Link> to find something.
        </Empty>
      ) : (
        <ul className="space-y-5">
          {loans.map((loan) => (
            <LoanCard
              key={loan._id}
              loan={loan}
              perspective="borrower"
              actions={
                loan.status === "pending" && (
                  <button className="btn-ghost" disabled={pending} onClick={() => run(() => cancel({ loanId: loan._id }))}>
                    Cancel request
                  </button>
                )
              }
            />
          ))}
        </ul>
      )}
    </>
  );
}
