import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal, api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

// iOS upload flow:
//   1. POST /create-book {title, monthLabel, deviceName, pageCount}
//      -> {bookId, shareId, uploadUrls: [pageCount short-lived storage upload URLs]}
//   2. POST each JPEG to its upload URL -> {storageId}
//   3. POST /finalize-book {bookId, pages: [{page, storageId}]} -> {ok}
// No auth for the POC; the shareId is an unguessable capability token.

const http = httpRouter();

http.route({
  path: "/create-book",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const body = await req.json();
    const { title, monthLabel, deviceName, pageCount } = body ?? {};
    if (typeof title !== "string" || typeof monthLabel !== "string" ||
        !Number.isInteger(pageCount) || pageCount < 1 || pageCount > 60) {
      return json({ error: "need title, monthLabel, pageCount (1-60)" }, 400);
    }
    const shareId = crypto.randomUUID().replace(/-/g, "");
    const bookId = await ctx.runMutation(internal.books.createBook, {
      shareId, title, monthLabel, deviceName, pageCount,
    });
    const uploadUrls: string[] = [];
    for (let i = 0; i < pageCount; i++) {
      uploadUrls.push(await ctx.storage.generateUploadUrl());
    }
    return json({ bookId, shareId, uploadUrls });
  }),
});

http.route({
  path: "/finalize-book",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const body = await req.json();
    const { bookId, pages } = body ?? {};
    if (typeof bookId !== "string" || !Array.isArray(pages) || pages.length === 0) {
      return json({ error: "need bookId, pages[]" }, 400);
    }
    await ctx.runMutation(internal.books.attachPages, {
      bookId: bookId as Id<"books">,
      pages: pages as { page: number; storageId: Id<"_storage"> }[],
    });
    return json({ ok: true });
  }),
});

// In-app feedback posts here (same table the web page writes to).
http.route({
  path: "/feedback",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const body = await req.json();
    try {
      await ctx.runMutation(api.books.addFeedback, body);
      return json({ ok: true });
    } catch (e: any) {
      return json({ error: String(e?.message ?? e) }, 400);
    }
  }),
});

// Async judge job store, written by the Vercel judge server (submit + waitUntil)
// and read by the phone's collect step. Shared secret keeps random writers out.
http.route({
  path: "/judge-job",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (req.headers.get("x-judge-secret") !== (process.env.JUDGE_JOB_SECRET ?? "")) {
      return json({ error: "forbidden" }, 403);
    }
    const body = await req.json();
    if (typeof body?.jobId !== "string" || typeof body?.status !== "string") {
      return json({ error: "need jobId, status" }, 400);
    }
    await ctx.runMutation(internal.jobs.upsert, {
      jobId: body.jobId,
      status: body.status,
      monthLabel: body.monthLabel,
      count: body.count,
      book: body.book,
      usage: body.usage,
      error: body.error,
    });
    return json({ ok: true });
  }),
});

http.route({
  path: "/judge-job",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const jobId = new URL(req.url).searchParams.get("jobId");
    if (!jobId) return json({ error: "need jobId" }, 400);
    const job = await ctx.runQuery(api.jobs.get, { jobId });
    if (!job) return json({ error: "unknown job" }, 404);
    return json(job);
  }),
});

// ---- Web try-it flow (pikabook-site /try) ----
// Site-facing: capability is the unguessable jobId.
//   POST /web-job/create {photoCount} -> {jobId, uploadUrls[]}
//   POST /web-job/enqueue {jobId, storageIds[], dates?[]} -> {ok}
//   GET  /web-job/status?jobId=... -> {status, progressText, resultShareId, error}
// Worker-facing (x-judge-secret header, same shared secret as judge jobs):
//   POST /web-job/claim {} -> {jobId, photos:[{storageId,url}], dates} | {none:true}
//   POST /web-job/progress {jobId, progressText}
//   POST /web-job/complete {jobId, shareId}
//   POST /web-job/fail {jobId, error}

const MAX_WEB_PHOTOS = 300;

http.route({
  path: "/web-job/create",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const body = await req.json();
    const photoCount = body?.photoCount;
    if (!Number.isInteger(photoCount) || photoCount < 8 || photoCount > MAX_WEB_PHOTOS) {
      return cors(json({ error: `need photoCount (8-${MAX_WEB_PHOTOS})` }, 400));
    }
    const jobId = crypto.randomUUID().replace(/-/g, "");
    await ctx.runMutation(internal.webJobs.create, { jobId, photoCount });
    const uploadUrls: string[] = [];
    for (let i = 0; i < photoCount; i++) {
      uploadUrls.push(await ctx.storage.generateUploadUrl());
    }
    return cors(json({ jobId, uploadUrls }));
  }),
});

http.route({
  path: "/web-job/enqueue",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const body = await req.json();
    const { jobId, storageIds, dates } = body ?? {};
    if (typeof jobId !== "string" || !Array.isArray(storageIds) ||
        storageIds.length < 8 || storageIds.length > MAX_WEB_PHOTOS) {
      return cors(json({ error: "need jobId, storageIds[] (8-300)" }, 400));
    }
    try {
      await ctx.runMutation(internal.webJobs.enqueue, {
        jobId,
        storageIds: storageIds as Id<"_storage">[],
        dates: Array.isArray(dates) ? dates.slice(0, storageIds.length) : undefined,
      });
      return cors(json({ ok: true }));
    } catch (e: any) {
      return cors(json({ error: String(e?.message ?? e) }, 400));
    }
  }),
});

http.route({
  path: "/web-job/status",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const jobId = new URL(req.url).searchParams.get("jobId");
    if (!jobId) return cors(json({ error: "need jobId" }, 400));
    const job = await ctx.runQuery(api.webJobs.getStatus, { jobId });
    if (!job) return cors(json({ error: "unknown job" }, 404));
    return cors(json(job));
  }),
});

function workerAuthed(req: Request): boolean {
  return req.headers.get("x-judge-secret") === (process.env.JUDGE_JOB_SECRET ?? "");
}

http.route({
  path: "/web-job/claim",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!workerAuthed(req)) return json({ error: "forbidden" }, 403);
    // Requeue anything stuck in processing for >30 min (crashed worker).
    await ctx.runMutation(internal.webJobs.reapStale, { olderThanMs: 30 * 60 * 1000 });
    const claimed = await ctx.runMutation(internal.webJobs.claim, {});
    if (!claimed) return json({ none: true });
    const urls = await ctx.runQuery(internal.webJobs.storageUrls, {
      storageIds: claimed.storageIds,
    });
    return json({
      jobId: claimed.jobId,
      dates: claimed.dates,
      photos: claimed.storageIds.map((id: string, i: number) => ({
        storageId: id,
        url: urls[i],
      })),
    });
  }),
});

for (const [path, patch] of [
  ["/web-job/progress", (b: any) => ({ jobId: b.jobId, progressText: String(b.progressText ?? "") })],
  ["/web-job/complete", (b: any) => ({ jobId: b.jobId, status: "done", resultShareId: String(b.shareId ?? ""), progressText: "Your book is ready" })],
  ["/web-job/fail", (b: any) => ({ jobId: b.jobId, status: "failed", error: String(b.error ?? "unknown") })],
] as const) {
  http.route({
    path,
    method: "POST",
    handler: httpAction(async (ctx, req) => {
      if (!workerAuthed(req)) return json({ error: "forbidden" }, 403);
      const body = await req.json();
      if (typeof body?.jobId !== "string") return json({ error: "need jobId" }, 400);
      try {
        await ctx.runMutation(internal.webJobs.update, patch(body));
        return json({ ok: true });
      } catch (e: any) {
        return json({ error: String(e?.message ?? e) }, 400);
      }
    }),
  });
}

// Browser calls the site-facing routes cross-origin from pikabook-site.
http.route({ path: "/web-job/create", method: "OPTIONS", handler: httpAction(async () => preflight()) });
http.route({ path: "/web-job/enqueue", method: "OPTIONS", handler: httpAction(async () => preflight()) });
http.route({ path: "/web-job/status", method: "OPTIONS", handler: httpAction(async () => preflight()) });

function preflight(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type",
      "access-control-max-age": "86400",
    },
  });
}

function cors(resp: Response): Response {
  resp.headers.set("access-control-allow-origin", "*");
  return resp;
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export default http;
