import type { Category } from "@/convex/lib/constants";

/**
 * One silhouette per category, drawn on a 64×64 grid like the painted
 * outlines on a tool library's shadow board.
 */
const SHAPES: Record<Category, React.ReactNode> = {
  "Power tools": (
    <>
      <rect x="9" y="17" width="35" height="14" rx="3" />
      <rect x="44" y="20" width="7" height="8" rx="1" />
      <rect x="51" y="23" width="9" height="2.5" rx="1" />
      <path d="M21 31h10l3 18H22z" />
      <rect x="18" y="49" width="19" height="8" rx="1.5" />
    </>
  ),
  "Hand tools": (
    <>
      <path d="M13 10h29a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H13a3 3 0 0 1-3-3v-8a3 3 0 0 1 3-3z" />
      <path d="M45 12l11-5-2 10-9 3z" />
      <rect x="24" y="24" width="8" height="34" rx="3" />
    </>
  ),
  Garden: (
    <>
      <path d="M32 5c11 6 13 19 7 30H25c-6-11-4-24 7-30z" />
      <rect x="30" y="35" width="4" height="6" />
      <rect x="27" y="41" width="10" height="18" rx="4" />
    </>
  ),
  "Ladders & access": (
    <>
      <rect x="15" y="4" width="5" height="56" rx="1" />
      <rect x="44" y="4" width="5" height="56" rx="1" />
      <rect x="20" y="11" width="24" height="4" />
      <rect x="20" y="23" width="24" height="4" />
      <rect x="20" y="35" width="24" height="4" />
      <rect x="20" y="47" width="24" height="4" />
    </>
  ),
  Cleaning: (
    <>
      <path d="M16 22c0-15 32-15 32 0" fill="none" stroke="currentColor" strokeWidth="3.5" />
      <rect x="11" y="20" width="42" height="6" rx="1.5" />
      <path d="M14 26h36l-5 31H19z" />
    </>
  ),
  "Camping & outdoor": (
    <path fillRule="evenodd" d="M32 7l27 49H5zM32 31l8 25H24z" />
  ),
  Kitchen: (
    <>
      <circle cx="25" cy="33" r="18" />
      <rect x="40" y="30" width="22" height="6" rx="3" />
    </>
  ),
  Other: (
    <>
      <path d="M23 24v-9h18v9h-4v-5H27v5z" />
      <rect x="7" y="24" width="50" height="31" rx="3" />
    </>
  ),
};

export function Silhouette({
  category,
  className,
  title,
}: {
  category: Category;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="currentColor"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      {SHAPES[category]}
    </svg>
  );
}

/**
 * A slot on the board: the painted outline is always there; the tool hangs
 * over it when it's home, and lifts a little on hover. Out on loan, only the
 * painted outline remains.
 */
export function BoardSlot({
  category,
  out = false,
  size = "md",
}: {
  category: Category;
  out?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const dim = size === "lg" ? "h-28 w-28" : size === "sm" ? "h-12 w-12" : "h-20 w-20";
  return (
    <div className={`relative ${dim} shrink-0`}>
      {/* two pegs the tool hangs from */}
      {size !== "sm" && (
        <span aria-hidden className="absolute -top-1 left-1/2 flex -translate-x-1/2 gap-3">
          <span className="h-1.5 w-1.5 rounded-full bg-ink/80 shadow-[0_1px_0_rgb(255_255_255/0.25)]" />
          <span className="h-1.5 w-1.5 rounded-full bg-ink/80 shadow-[0_1px_0_rgb(255_255_255/0.25)]" />
        </span>
      )}
      <Silhouette category={category} className="absolute inset-0 h-full w-full text-board-deep" />
      {!out && (
        <Silhouette
          category={category}
          className="tool absolute inset-0 h-full w-full -translate-x-[9%] -translate-y-[9%] text-ink transition-transform duration-300 ease-out group-hover:-translate-x-[13%] group-hover:-translate-y-[16%] group-focus-within:-translate-x-[13%] group-focus-within:-translate-y-[16%] group-active:-translate-x-[13%] group-active:-translate-y-[16%]"
        />
      )}
    </div>
  );
}
