import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";

// Create-or-update a judge job. Called only from the HTTP action (no auth
// for the POC; jobIds are unguessable UUIDs).
export const upsert = internalMutation({
  args: {
    jobId: v.string(),
    status: v.string(),
    monthLabel: v.optional(v.string()),
    count: v.optional(v.number()),
    book: v.optional(v.any()),
    usage: v.optional(v.any()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { jobId, ...rest }) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("judgeJobs")
      .withIndex("by_jobId", (q) => q.eq("jobId", jobId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { ...rest, updatedAt: now });
      return existing._id;
    }
    return await ctx.db.insert("judgeJobs", {
      jobId,
      status: rest.status,
      monthLabel: rest.monthLabel ?? "",
      count: rest.count ?? 0,
      book: rest.book,
      usage: rest.usage,
      error: rest.error,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const get = query({
  args: { jobId: v.string() },
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db
      .query("judgeJobs")
      .withIndex("by_jobId", (q) => q.eq("jobId", jobId))
      .unique();
    if (!job) return null;
    return {
      jobId: job.jobId,
      status: job.status,
      book: job.book ?? null,
      usage: job.usage ?? null,
      error: job.error ?? null,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  },
});
