import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

// Public read for the share page: book + page image URLs + feedback counts.
export const getByShareId = query({
  args: { shareId: v.string() },
  handler: async (ctx, { shareId }) => {
    const book = await ctx.db
      .query("books")
      .withIndex("by_shareId", (q) => q.eq("shareId", shareId))
      .unique();
    if (!book || !book.ready) return null;
    const pages = await ctx.db
      .query("pages")
      .withIndex("by_book", (q) => q.eq("bookId", book._id))
      .collect();
    const feedback = await ctx.db
      .query("feedback")
      .withIndex("by_book", (q) => q.eq("bookId", book._id))
      .collect();
    const counts: Record<number, number> = {};
    for (const f of feedback) {
      const key = f.page ?? -1;
      counts[key] = (counts[key] ?? 0) + 1;
    }
    const sorted = pages.sort((a, b) => a.page - b.page);
    return {
      bookId: book._id,
      title: book.title,
      monthLabel: book.monthLabel,
      pages: await Promise.all(
        sorted.map(async (p) => ({
          page: p.page,
          url: await ctx.storage.getUrl(p.storageId),
          feedbackCount: counts[p.page] ?? 0,
        }))
      ),
      bookFeedbackCount: counts[-1] ?? 0,
    };
  },
});

// Public feedback write from the share page (shareId is the capability).
export const addFeedback = mutation({
  args: {
    shareId: v.string(),
    page: v.optional(v.number()),
    reaction: v.optional(v.string()),
    text: v.optional(v.string()),
    author: v.optional(v.string()),
    tapX: v.optional(v.number()),
    tapY: v.optional(v.number()),
  },
  handler: async (ctx, { shareId, ...rest }) => {
    const book = await ctx.db
      .query("books")
      .withIndex("by_shareId", (q) => q.eq("shareId", shareId))
      .unique();
    if (!book) throw new Error("unknown book");
    if (!rest.reaction && !rest.text) throw new Error("empty feedback");
    if (rest.text && rest.text.length > 2000) rest.text = rest.text.slice(0, 2000);
    await ctx.db.insert("feedback", { bookId: book._id, ...rest });
  },
});

// Admin: read all feedback for a book, newest first (run from dashboard/CLI).
export const allFeedback = query({
  args: { shareId: v.string() },
  handler: async (ctx, { shareId }) => {
    const book = await ctx.db
      .query("books")
      .withIndex("by_shareId", (q) => q.eq("shareId", shareId))
      .unique();
    if (!book) return [];
    const rows = await ctx.db
      .query("feedback")
      .withIndex("by_book", (q) => q.eq("bookId", book._id))
      .collect();
    return rows
      .sort((a, b) => b._creationTime - a._creationTime)
      .map((f) => ({
        when: new Date(f._creationTime).toISOString(),
        page: f.page ?? "book",
        reaction: f.reaction,
        text: f.text,
        author: f.author,
      }));
  },
});

// Admin cleanup: remove a book, its pages/stored files, and its feedback.
// Run: npx convex run books:deleteBook '{"shareId": "<id>"}' --prod
export const deleteBook = mutation({
  args: { shareId: v.string() },
  handler: async (ctx, { shareId }) => {
    const book = await ctx.db
      .query("books")
      .withIndex("by_shareId", (q) => q.eq("shareId", shareId))
      .unique();
    if (!book) return "not found";
    const pages = await ctx.db
      .query("pages")
      .withIndex("by_book", (q) => q.eq("bookId", book._id))
      .collect();
    for (const p of pages) {
      await ctx.storage.delete(p.storageId);
      await ctx.db.delete(p._id);
    }
    const feedback = await ctx.db
      .query("feedback")
      .withIndex("by_book", (q) => q.eq("bookId", book._id))
      .collect();
    for (const f of feedback) await ctx.db.delete(f._id);
    await ctx.db.delete(book._id);
    return `deleted book + ${pages.length} pages + ${feedback.length} feedback`;
  },
});

// Internal plumbing for the HTTP actions.
export const createBook = internalMutation({
  args: {
    shareId: v.string(),
    title: v.string(),
    monthLabel: v.string(),
    deviceName: v.optional(v.string()),
    pageCount: v.number(),
  },
  handler: async (ctx, args) => ctx.db.insert("books", { ...args, ready: false }),
});

export const attachPages = internalMutation({
  args: {
    bookId: v.id("books"),
    pages: v.array(v.object({ page: v.number(), storageId: v.id("_storage") })),
  },
  handler: async (ctx, { bookId, pages }) => {
    for (const p of pages) {
      await ctx.db.insert("pages", { bookId, page: p.page, storageId: p.storageId });
    }
    await ctx.db.patch(bookId, { ready: true });
  },
});
