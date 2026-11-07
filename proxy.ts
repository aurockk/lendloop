import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Everything except the public landing page needs a session. This is a UX
// guard only — Convex re-verifies identity and permissions on every call.
const isPublic = createRouteMatcher(["/"]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublic(req)) await auth.protect();
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
