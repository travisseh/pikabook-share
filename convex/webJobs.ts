import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";

// Web try-it job store. Site-facing routes are capability-gated by the
// unguessable jobId; worker routes are gated by the shared secret in http.ts.

export const create = internalMutation({
  args: { jobId: v.string(), photoCount: v.number() },
  handler: async (ctx, { jobId, photoCount }) => {
    const now = Date.now();
    return await ctx.db.insert("webJobs", {
      jobId,
      status: "uploading",
      photoCount,
      storageIds: [],
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const enqueue = internalMutation({
  args: {
    jobId: v.string(),
    storageIds: v.array(v.id("_storage")),
    dates: v.optional(v.array(v.union(v.string(), v.null()))),
  },
  handler: async (ctx, { jobId, storageIds, dates }) => {
    const job = await byJobId(ctx, jobId);
    if (!job) throw new Error("unknown job");
    if (job.status !== "uploading") throw new Error(`job is ${job.status}`);
    await ctx.db.patch(job._id, {
      storageIds,
      dates,
      photoCount: storageIds.length,
      status: "queued",
      progressText: "In line for curation",
      updatedAt: Date.now(),
    });
  },
});

export const getStatus = query({
  args: { jobId: v.string() },
  handler: async (ctx, { jobId }) => {
    const job = await byJobId(ctx, jobId);
    if (!job) return null;
    return {
      status: job.status,
      progressText: job.progressText ?? null,
      resultShareId: job.resultShareId ?? null,
      error: job.error ?? null,
      photoCount: job.photoCount,
    };
  },
});

// Worker: atomically claim the oldest queued job.
export const claim = internalMutation({
  args: {},
  handler: async (ctx) => {
    const job = await ctx.db
      .query("webJobs")
      .withIndex("by_status", (q) => q.eq("status", "queued"))
      .order("asc")
      .first();
    if (!job) return null;
    await ctx.db.patch(job._id, {
      status: "processing",
      progressText: "Looking at your photos",
      updatedAt: Date.now(),
    });
    return { jobId: job.jobId, storageIds: job.storageIds, dates: job.dates ?? null };
  },
});

export const update = internalMutation({
  args: {
    jobId: v.string(),
    status: v.optional(v.string()),
    progressText: v.optional(v.string()),
    resultShareId: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { jobId, ...rest }) => {
    const job = await byJobId(ctx, jobId);
    if (!job) throw new Error("unknown job");
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [k, val] of Object.entries(rest)) if (val !== undefined) patch[k] = val;
    await ctx.db.patch(job._id, patch);
  },
});

// Worker: reclaim jobs stuck in processing (worker crashed mid-job).
export const reapStale = internalMutation({
  args: { olderThanMs: v.number() },
  handler: async (ctx, { olderThanMs }) => {
    const cutoff = Date.now() - olderThanMs;
    const stuck = await ctx.db
      .query("webJobs")
      .withIndex("by_status", (q) => q.eq("status", "processing"))
      .collect();
    let n = 0;
    for (const j of stuck) {
      if (j.updatedAt < cutoff) {
        await ctx.db.patch(j._id, { status: "queued", updatedAt: Date.now() });
        n++;
      }
    }
    return n;
  },
});

export const storageUrls = internalQuery({
  args: { storageIds: v.array(v.id("_storage")) },
  handler: async (ctx, { storageIds }) => {
    const urls: (string | null)[] = [];
    for (const id of storageIds) urls.push(await ctx.storage.getUrl(id));
    return urls;
  },
});

async function byJobId(ctx: any, jobId: string) {
  return await ctx.db
    .query("webJobs")
    .withIndex("by_jobId", (q: any) => q.eq("jobId", jobId))
    .unique();
}
