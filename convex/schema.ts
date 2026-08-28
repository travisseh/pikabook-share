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

  // Async judge jobs (submitted by the phone from a short bg_refresh wake,
  // judged server-side via waitUntil, collected on a later wake). Sheets are
  // NOT stored (Convex 1MB doc cap); only status + result.
  // Web try-it jobs: photos uploaded from pikabook-site /try, processed by the
  // Railway worker, result lands in books/pages so the share viewer just works.
  webJobs: defineTable({
    jobId: v.string(),
    status: v.string(), // "uploading" | "queued" | "processing" | "done" | "failed"
    progressText: v.optional(v.string()),
    photoCount: v.number(),
    storageIds: v.array(v.id("_storage")),
    dates: v.optional(v.array(v.union(v.string(), v.null()))), // ISO per photo, parallel to storageIds
    resultShareId: v.optional(v.string()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_jobId", ["jobId"])
    .index("by_status", ["status"]),

  judgeJobs: defineTable({
    jobId: v.string(),
    status: v.string(), // "pending" | "done" | "failed"
    monthLabel: v.string(),
    count: v.number(),
    book: v.optional(v.any()),
    usage: v.optional(v.any()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_jobId", ["jobId"]),
});
