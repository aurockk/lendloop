import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Safety net for the webhook outbox (see webhooks.ts).
crons.interval("re-queue stuck webhook deliveries", { minutes: 5 }, internal.webhooks.sweepStuck, {});

export default crons;
