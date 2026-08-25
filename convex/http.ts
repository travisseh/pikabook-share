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

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export default http;
