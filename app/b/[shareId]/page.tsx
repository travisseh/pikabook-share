import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import BookViewer from "./viewer";

export const dynamic = "force-dynamic";

export default async function SharePage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;
  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  const book = await convex.query(api.books.getByShareId, { shareId });

  if (!book) {
    return (
      <main style={{ padding: 40, textAlign: "center" }}>
        <h1 style={{ fontSize: 22 }}>Book not found</h1>
        <p style={{ opacity: 0.7 }}>This link may be wrong or the book was removed.</p>
      </main>
    );
  }

  return <BookViewer shareId={shareId} book={book} />;
}
