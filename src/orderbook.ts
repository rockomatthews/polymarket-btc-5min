export type BookLevel = { price: string; size: string };

export type Book = {
  market: string;
  asset_id: string;
  bids: BookLevel[];
  asks: BookLevel[];
};

export async function fetchBook(host: string, tokenId: string): Promise<Book> {
  const url = new URL("/book", host);
  url.searchParams.set("token_id", tokenId);

  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`book fetch failed (${tokenId}): ${res.status} ${await res.text()}`);
  return (await res.json()) as Book;
}

export function bestAsk(book: Book): { price: number; size: number } | null {
  const top = book.asks?.[0];
  if (!top) return null;
  return { price: Number(top.price), size: Number(top.size) };
}

export function bestBid(book: Book): { price: number; size: number } | null {
  const top = book.bids?.[0];
  if (!top) return null;
  return { price: Number(top.price), size: Number(top.size) };
}
