"use client";

import { SignInButton } from "@clerk/nextjs";
import { Authenticated, Unauthenticated, usePaginatedQuery } from "convex/react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import type { Category } from "@/convex/lib/constants";
import { BoardSlot } from "./_components/silhouette";

const COLS = 3;

function Slot({ name, category }: { name: string; category: Category }) {
  return (
    <li className="group flex flex-col items-center gap-3 text-center">
      <BoardSlot category={category} />
      <div className="min-w-0 max-w-full">
        <span className="name-strip max-w-full truncate text-lg font-bold">{name}</span>
        <p className="solid-board mx-auto mt-1 block w-fit px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-ink-soft [font-stretch:85%]">{category}</p>
      </div>
    </li>
  );
}

/** Bare pegs where the next tool can hang: nothing painted yet. */
function FreeHook() {
  return (
    <li aria-hidden className="flex h-20 items-start justify-center">
      <span className="mt-[-4px] flex gap-3">
        <span className="h-1.5 w-1.5 rounded-full bg-ink/60" />
        <span className="h-1.5 w-1.5 rounded-full bg-ink/60" />
      </span>
    </li>
  );
}

const LEGEND: { category: Category; state: "hanging" | "out" | "asked"; title: string; text: string }[] = [
  { category: "Hand tools", state: "hanging", title: "Hanging", text: "Home and free to borrow." },
  { category: "Ladders & access", state: "out", title: "Outline only", text: "Out on loan, with the day it's due back." },
  { category: "Power tools", state: "asked", title: "Tagged", text: "You've asked; the lender decides." },
];

const STEPS = [
  { title: "Ask", text: "Pick the days you need it. The lender gets an email." },
  { title: "Approve", text: "One tap to say yes or no. You hear back by email." },
  { title: "Borrow", text: "Collect it from your neighbour. The board marks it out." },
  { title: "Return", text: "Late? You get a friendly reminder each morning until it's back." },
];

function Legend() {
  return (
    <section aria-labelledby="legend-heading" className="mt-12 border-t-[3px] border-dotted border-board-deep pt-6">
      <h2 id="legend-heading" className="text-sm font-bold uppercase tracking-wider [font-stretch:88%]">
        Reading the board <span className="font-semibold text-ink-soft normal-case tracking-normal">(an example)</span>
      </h2>
      <ul className="mt-5 grid grid-cols-3 gap-4">
        {LEGEND.map((l) => (
          <li key={l.title} className="group flex flex-col items-center gap-2 text-center">
            <div className="relative">
              <BoardSlot category={l.category} out={l.state === "out"} size="md" />
              {l.state === "asked" && (
                <span className="board-label absolute -right-3 bottom-0 rotate-6 !bg-safety">You asked</span>
              )}
              {l.state === "out" && <span className="board-label absolute bottom-0 left-1/2 -translate-x-1/2">Back Nov 12</span>}
            </div>
            <div className="solid-board mt-1 px-2 py-1.5">
              <h3 className="text-sm font-bold uppercase tracking-wide [font-stretch:88%]">{l.title}</h3>
              <p className="mt-0.5 text-[13px] leading-snug text-ink-soft">{l.text}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function Home() {
  // Public query: name + category only, never anything about the owner.
  const { results: tools, status, loadMore } = usePaginatedQuery(api.tools.publicList, {}, { initialNumItems: 6 });
  const pad = tools.length % COLS === 0 ? 0 : COLS - (tools.length % COLS);

  const signIn = (
    <>
      <Unauthenticated>
        <SignInButton mode="modal">
          <button className="btn-primary px-6 py-3 text-base">Sign in to lend or borrow</button>
        </SignInButton>
      </Unauthenticated>
      <Authenticated>
        <Link href="/tools" className="btn-primary px-6 py-3 text-base">
          Open the board
        </Link>
      </Authenticated>
    </>
  );

  return (
    <div className="space-y-24 pb-10">
      <section className="pt-1 lg:pt-4">
        <h1 className="stencil text-[clamp(3.2rem,7.6vw,6rem)] font-black text-ink [animation:lift-in_.6s_cubic-bezier(.2,.7,.2,1)_both]">
          Borrow what you need.
          <br />
          Lend what you don&apos;t.
        </h1>

        <div className="mt-10 grid items-start gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <div>
            <p className="max-w-md text-lg font-medium leading-relaxed text-ink-soft">
              The neighbourhood&apos;s shadow board. Every tool has its painted place; when one is out on loan,
              you see its outline and the day it comes back.
            </p>
            <div className="mt-8">{signIn}</div>
            <p className="solid-board mt-6 max-w-sm px-1 text-sm font-medium text-ink-soft">
              Signed-in neighbours see a lender&apos;s first name only. Your email is used for one thing: telling
              you what happened.
            </p>
          </div>

          <div>
            <h2 className="sr-only">On the board now</h2>
            {status === "LoadingFirstPage" ? (
              <p className="text-sm font-medium text-ink-soft">Loading the board…</p>
            ) : tools.length === 0 ? (
              <p className="py-6 text-[15px] font-medium text-ink-soft">
                Nothing hanging yet. The first neighbour to lend a tool puts it here.
              </p>
            ) : (
              <>
                <ul className="grid grid-cols-3 gap-x-4 gap-y-10">
                  {tools.map((t) => (
                    <Slot key={t._id} name={t.name} category={t.category} />
                  ))}
                  {Array.from({ length: pad }, (_, i) => (
                    <FreeHook key={i} />
                  ))}
                </ul>
                {status === "CanLoadMore" && (
                  <button className="btn-ghost mt-8" onClick={() => loadMore(6)}>
                    Show more of the board
                  </button>
                )}
              </>
            )}
            <Legend />
          </div>
        </div>
      </section>

      <section aria-labelledby="how-heading">
        <h2 id="how-heading" className="stencil text-4xl font-black sm:text-5xl">
          How a loan runs
        </h2>
        <div className="relative mt-10">
          {/* the hook rail every step hangs from: across on desktop, down on phones */}
          <div aria-hidden className="absolute inset-x-0 top-0 hidden h-2 bg-ink sm:block" style={{ borderRadius: 1 }} />
          <div aria-hidden className="absolute top-0 bottom-0 left-2 w-2 bg-ink sm:hidden" style={{ borderRadius: 1 }} />
          <ol className="grid gap-6 pl-10 sm:grid-cols-4 sm:gap-5 sm:pl-0">
            {STEPS.map((s) => (
              <li key={s.title} className="relative sm:pt-8">
                <span aria-hidden className="absolute top-2 left-8 hidden h-6 w-[3px] bg-ink sm:block" />
                <span aria-hidden className="absolute top-6 -left-6 h-[3px] w-6 bg-ink sm:hidden" />
                <div className="panel h-full p-5">
                  <h3 className="stencil text-3xl font-black">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <div className="mt-14">{signIn}</div>
      </section>
    </div>
  );
}
