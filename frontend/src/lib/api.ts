const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function searchTravel(
  query: string,
  budgetMax?: number,
  history?: Array<{ role: string; content: string }>
) {
  const res = await fetch(`${API_BASE}/api/search/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, budget_max: budgetMax, history }),
  });
  if (!res.ok) throw new Error("Search failed");
  return res.json();
}

export async function searchHotels(params: {
  cityCode: string;
  checkIn: string;
  checkOut: string;
  adults?: number;
  children?: number;
  rooms?: number;
}) {
  const res = await fetch(`${API_BASE}/api/search/hotels`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error("Hotel search failed");
  return res.json();
}

/**
 * Perform a standalone flight search using the parameters returned by the agent.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function searchFlights(params: any) {
  const res = await fetch(`${API_BASE}/api/search/flights`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error("Flight search failed");
  return res.json();
}

/**
 * Generate smart flight+hotel bundles using backend scoring.
 */
export async function generateSmartBundles(params: {
  hotels: any[];
  flights: any[];
  chatHistory?: Array<{ role: string; content: string }>;
  destinationCode?: string;
  sessionId?: string;
}) {
  const res = await fetch(`${API_BASE}/api/search/bundles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error("Bundle generation failed");
  return res.json();
}


