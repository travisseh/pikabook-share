import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  books: defineTable({
    shareId: v.string(),
    title: v.string(),
    monthLabel: v.string(),
    deviceName: v.optional(v.string()),
    pageCount: v.number(),
    ready: v.boolean(),
  }).index("by_shareId", ["shareId"]),

  pages: defineTable({
    bookId: v.id("books"),
    page: v.number(), // 0 = cover
    storageId: v.id("_storage"),
  }).index("by_book", ["bookId"]),

  feedback: defineTable({
    bookId: v.id("books"),
    page: v.optional(v.number()), // absent = whole-book feedback
    reaction: v.optional(v.string()), // "love" | "meh" | "cut"
    text: v.optional(v.string()),
    author: v.optional(v.string()),
    tapX: v.optional(v.number()), // normalized 0-1
    tapY: v.optional(v.number()),
  }).index("by_book", ["bookId"]),
});
