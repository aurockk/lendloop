"use client";

import { SignInButton, UserButton } from "@clerk/nextjs";
import { Authenticated, Unauthenticated, useQuery } from "convex/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/convex/_generated/api";

const NAV = [
  { href: "/tools", label: "All tools" },
  { href: "/listings", label: "My listings" },
  { href: "/requests", label: "My requests" },
  { href: "/incoming", label: "Incoming" },
];

function Nav() {
  const pathname = usePathname();
  const me = useQuery(api.users.me);
  const items = me?.role === "admin" ? [...NAV, { href: "/admin", label: "Admin" }] : NAV;
  return (
    <nav aria-label="Board" className="-mx-1 flex gap-1 overflow-x-auto">
      {items.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap px-3 py-1.5 text-[13px] font-semibold uppercase tracking-wide [font-stretch:88%] transition-colors ${
              active ? "bg-safety text-ink" : "text-paint/80 hover:bg-paint/10 hover:text-paint"
            }`}
            style={{ borderRadius: 2 }}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** The header is the board's top cleat: a black rail the whole board hangs from. */
export function Header() {
  return (
    <header className="sticky top-0 z-20 bg-ink text-paint shadow-[0_4px_12px_rgb(40_25_8/0.35)]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-2 px-4 py-2.5 sm:px-8">
        <Link href="/" className="stencil text-[28px] font-black text-safety" aria-label="LendLoop home">
          LendLoop
        </Link>
        <Authenticated>
          <div className="order-3 w-full sm:order-none sm:w-auto sm:flex-1">
            <Nav />
          </div>
          <UserButton />
        </Authenticated>
        <Unauthenticated>
          <div className="flex-1" />
          <SignInButton mode="modal">
            <button className="btn text-paint shadow-[inset_0_0_0_2px_var(--paint)] hover:bg-paint hover:text-ink">
              Sign in
            </button>
          </SignInButton>
        </Unauthenticated>
      </div>
    </header>
  );
}
