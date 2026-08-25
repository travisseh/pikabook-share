"use client";

import { useState } from "react";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

type Book = {
  title: string;
  monthLabel: string;
  pages: { page: number; url: string | null; feedbackCount: number }[];
  bookFeedbackCount: number;
};

const REACTIONS: [string, string][] = [
  ["love", "❤️ Love it"],
  ["meh", "😐 Meh"],
  ["cut", "✂️ Cut this one"],
];

export default function BookViewer({ shareId, book }: { shareId: string; book: Book }) {
  const [feedbackFor, setFeedbackFor] = useState<number | null | "closed">("closed");
  const [counts, setCounts] = useState<Record<number, number>>(
    Object.fromEntries(book.pages.map((p) => [p.page, p.feedbackCount]))
  );

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "24px 16px 80px" }}>
      <header style={{ textAlign: "center", marginBottom: 8 }}>
        <h1 style={{ fontSize: 26, margin: "0 0 4px" }}>{book.title}</h1>
        <p style={{ opacity: 0.6, margin: 0, fontSize: 14 }}>
          {book.monthLabel} · tap any photo to leave feedback
        </p>
      </header>

      {book.pages.map((p) => (
        <figure key={p.page} style={{ margin: "28px 0", textAlign: "center" }}>
          {p.url && (
            <img
              src={p.url}
              alt={p.page === 0 ? "cover" : `page ${p.page}`}
              onClick={() => setFeedbackFor(p.page)}
              style={{
                width: "100%",
                borderRadius: 14,
                cursor: "pointer",
                boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
                imageOrientation: "from-image",
              }}
            />
          )}
          <figcaption style={{ fontSize: 13, opacity: 0.55, marginTop: 8 }}>
            {p.page === 0 ? "cover" : `page ${p.page}`}
            {counts[p.page] > 0 && ` · ${counts[p.page]} 💬`}
          </figcaption>
        </figure>
      ))}

      <div style={{ textAlign: "center", marginTop: 32 }}>
        <button onClick={() => setFeedbackFor(null)} style={buttonStyle}>
          Leave feedback on the whole book
        </button>
      </div>

      {feedbackFor !== "closed" && (
        <FeedbackSheet
          shareId={shareId}
          page={feedbackFor}
          onDone={(submitted) => {
            if (submitted && feedbackFor !== null) {
              setCounts((c) => ({ ...c, [feedbackFor]: (c[feedbackFor] ?? 0) + 1 }));
            }
            setFeedbackFor("closed");
          }}
        />
      )}
    </main>
  );
}

function FeedbackSheet({
  shareId,
  page,
  onDone,
}: {
  shareId: string;
  page: number | null;
  onDone: (submitted: boolean) => void;
}) {
  const [reaction, setReaction] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [author, setAuthor] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!reaction && !text.trim()) {
      setError("Pick a reaction or write something");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
      await convex.mutation(api.books.addFeedback, {
        shareId,
        page: page ?? undefined,
        reaction: reaction ?? undefined,
        text: text.trim() || undefined,
        author: author.trim() || undefined,
      });
      onDone(true);
    } catch (e) {
      setError("Couldn't send — try again");
      setBusy(false);
    }
  }

  return (
    <div
      onClick={() => onDone(false)}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        zIndex: 10,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#1c1c1f",
          borderRadius: "16px 16px 0 0",
          padding: "20px 20px 32px",
          width: "100%",
          maxWidth: 640,
        }}
      >
        <h2 style={{ fontSize: 17, margin: "0 0 14px" }}>
          {page === null ? "Feedback on the book" : page === 0 ? "Feedback on the cover" : `Feedback on page ${page}`}
        </h2>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {REACTIONS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setReaction(reaction === key ? null : key)}
              style={{
                ...buttonStyle,
                flex: 1,
                padding: "10px 4px",
                fontSize: 14,
                background: reaction === key ? "#3b82f6" : "#2a2a2e",
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Anything specific? (optional)"
          rows={3}
          style={inputStyle}
        />
        <input
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          placeholder="Your name (optional)"
          style={{ ...inputStyle, marginTop: 8 }}
        />
        {error && <p style={{ color: "#f87171", fontSize: 13 }}>{error}</p>}
        <button
          onClick={submit}
          disabled={busy}
          style={{ ...buttonStyle, width: "100%", marginTop: 14, background: "#3b82f6" }}
        >
          {busy ? "Sending…" : "Send feedback"}
        </button>
      </div>
    </div>
  );
}

const buttonStyle: React.CSSProperties = {
  background: "#2a2a2e",
  color: "#f4f4f5",
  border: "none",
  borderRadius: 10,
  padding: "12px 18px",
  fontSize: 15,
  cursor: "pointer",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "#2a2a2e",
  color: "#f4f4f5",
  border: "1px solid #3a3a3f",
  borderRadius: 10,
  padding: 10,
  fontSize: 15,
  fontFamily: "inherit",
};
