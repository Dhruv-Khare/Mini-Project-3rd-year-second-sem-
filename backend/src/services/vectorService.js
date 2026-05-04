/**
 * Vector Service — Pinecone integration for semantic matching.
 *
 * Stores and queries hotel/flight embeddings for smart bundling.
 * Uses Gemini embedding API to generate vectors from hotel/flight descriptions.
 */
import { Pinecone } from "@pinecone-database/pinecone";
import { GoogleGenerativeAI } from "@google/generative-ai";
import config from "../config/index.js";

const INDEX_NAME = "safarai-bundles";
const EMBEDDING_MODEL = "text-embedding-004";
const DIMENSION = 768; // Gemini text-embedding-004 dimension

let pineconeClient = null;
let pineconeIndex = null;
let genAI = null;

/**
 * Initialize Pinecone client and ensure index exists.
 */
async function initPinecone() {
  if (pineconeIndex) return pineconeIndex;

  const apiKey = config.pinecone?.apiKey;
  if (!apiKey) {
    console.warn("[Vector] PINECONE_API_KEY not set — vector service disabled.");
    return null;
  }

  try {
    pineconeClient = new Pinecone({ apiKey });

    // Check if index exists, create if not
    const indexes = await pineconeClient.listIndexes();
    const indexNames = (indexes.indexes || []).map((i) => i.name);

    if (!indexNames.includes(INDEX_NAME)) {
      console.log(`[Vector] Creating Pinecone index "${INDEX_NAME}"...`);
      await pineconeClient.createIndex({
        name: INDEX_NAME,
        dimension: DIMENSION,
        metric: "cosine",
        spec: { serverless: { cloud: "aws", region: "us-east-1" } },
      });
      // Wait for index to be ready
      await new Promise((r) => setTimeout(r, 5000));
    }

    pineconeIndex = pineconeClient.index(INDEX_NAME);
    console.log(`[Vector] Pinecone index "${INDEX_NAME}" ready.`);
    return pineconeIndex;
  } catch (err) {
    console.error("[Vector] Pinecone init failed:", err.message);
    return null;
  }
}

/**
 * Generate an embedding vector from text using Gemini.
 */
async function getEmbedding(text) {
  if (!genAI) {
    genAI = new GoogleGenerativeAI(config.gemini.apiKey);
  }

  const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
  const result = await model.embedContent(text);
  return result.embedding.values;
}

/**
 * Build a description string for a hotel (used for embedding).
 */
function buildHotelDescription(hotel) {
  const parts = [
    hotel.name || "",
    hotel.city || "",
    `${hotel.star_rating || hotel.rating || 0} star`,
    `₹${hotel.price_per_night || 0} per night`,
    ...(hotel.amenities || []).slice(0, 5),
    ...(hotel.style_tags || []).slice(0, 3),
    hotel.match_reason || "",
  ];
  return parts.filter(Boolean).join(". ");
}

/**
 * Build a description string for a flight (used for embedding).
 */
function buildFlightDescription(flight) {
  const parts = [
    flight.airline || "",
    `${flight.origin} to ${flight.destination}`,
    `₹${flight.price || 0}`,
    `${flight.duration_hours || 0}h`,
    flight.stops === 0 ? "non-stop" : `${flight.stops} stop(s)`,
    flight.departure_time || "",
  ];
  return parts.filter(Boolean).join(". ");
}

/**
 * Upsert hotel vectors into Pinecone for a given search session.
 */
export async function upsertHotelVectors(hotels, sessionId) {
  const index = await initPinecone();
  if (!index || !hotels || hotels.length === 0) return;

  try {
    const vectors = await Promise.all(
      hotels.slice(0, 50).map(async (hotel, i) => {
        const desc = buildHotelDescription(hotel);
        const embedding = await getEmbedding(desc);
        return {
          id: `${sessionId}_hotel_${hotel.id || i}`,
          values: embedding,
          metadata: {
            type: "hotel",
            sessionId,
            name: hotel.name || "",
            city: hotel.city || "",
            price: hotel.price_per_night || 0,
            rating: hotel.star_rating || hotel.rating || 0,
            latitude: hotel.latitude || 0,
            longitude: hotel.longitude || 0,
            amenities: (hotel.amenities || []).slice(0, 8).join(","),
            image_url: hotel.image_url || "",
            hotelIndex: i,
          },
        };
      })
    );

    await index.upsert(vectors);
    console.log(`[Vector] Upserted ${vectors.length} hotel vectors for session ${sessionId}`);
  } catch (err) {
    console.error("[Vector] Hotel upsert failed:", err.message);
  }
}

/**
 * Upsert flight vectors into Pinecone for a given search session.
 */
export async function upsertFlightVectors(flights, sessionId) {
  const index = await initPinecone();
  if (!index || !flights || flights.length === 0) return;

  try {
    const vectors = await Promise.all(
      flights.slice(0, 30).map(async (flight, i) => {
        const desc = buildFlightDescription(flight);
        const embedding = await getEmbedding(desc);
        return {
          id: `${sessionId}_flight_${flight.id || i}`,
          values: embedding,
          metadata: {
            type: "flight",
            sessionId,
            airline: flight.airline || "",
            origin: flight.origin || "",
            destination: flight.destination || "",
            price: flight.price || 0,
            duration: flight.duration_hours || 0,
            stops: flight.stops || 0,
            departure_time: flight.departure_time || "",
            arrival_time: flight.arrival_time || "",
            flightIndex: i,
          },
        };
      })
    );

    await index.upsert(vectors);
    console.log(`[Vector] Upserted ${vectors.length} flight vectors for session ${sessionId}`);
  } catch (err) {
    console.error("[Vector] Flight upsert failed:", err.message);
  }
}

/**
 * Query Pinecone for hotels semantically similar to a user preference string.
 * Returns indices + scores.
 */
export async function queryHotelsByPreference(preferenceText, sessionId, topK = 10) {
  const index = await initPinecone();
  if (!index) return [];

  try {
    const queryVector = await getEmbedding(preferenceText);
    const result = await index.query({
      vector: queryVector,
      topK,
      filter: { sessionId: { $eq: sessionId }, type: { $eq: "hotel" } },
      includeMetadata: true,
    });

    return (result.matches || []).map((m) => ({
      index: m.metadata?.hotelIndex,
      score: m.score,
      metadata: m.metadata,
    }));
  } catch (err) {
    console.error("[Vector] Hotel query failed:", err.message);
    return [];
  }
}

/**
 * Query Pinecone for flights semantically similar to a preference string.
 */
export async function queryFlightsByPreference(preferenceText, sessionId, topK = 5) {
  const index = await initPinecone();
  if (!index) return [];

  try {
    const queryVector = await getEmbedding(preferenceText);
    const result = await index.query({
      vector: queryVector,
      topK,
      filter: { sessionId: { $eq: sessionId }, type: { $eq: "flight" } },
      includeMetadata: true,
    });

    return (result.matches || []).map((m) => ({
      index: m.metadata?.flightIndex,
      score: m.score,
      metadata: m.metadata,
    }));
  } catch (err) {
    console.error("[Vector] Flight query failed:", err.message);
    return [];
  }
}

/**
 * Cleanup vectors for a session (optional, for housekeeping).
 */
export async function cleanupSession(sessionId) {
  const index = await initPinecone();
  if (!index) return;

  try {
    await index.deleteMany({ filter: { sessionId: { $eq: sessionId } } });
    console.log(`[Vector] Cleaned up vectors for session ${sessionId}`);
  } catch (err) {
    console.error("[Vector] Cleanup failed:", err.message);
  }
}

export { getEmbedding, buildHotelDescription, buildFlightDescription };
