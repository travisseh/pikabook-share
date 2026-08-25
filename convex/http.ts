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

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export default http;
