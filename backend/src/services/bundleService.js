/**
 * Bundle Service — Smart flight+hotel bundling using rule-based scoring
 * + Pinecone vector search for semantic preference matching.
 *
 * Scoring Factors:
 *   1. Airport Proximity — hotels closer to destination airport score higher
 *   2. Star Rating Match — match hotel class to inferred budget tier
 *   3. Price-Value Ratio — best combined price for the bundle
 *   4. Amenity Match — hotel amenities matching user style/chat context
 *   5. Time Alignment — flight arrival → hotel check-in compatibility
 *
 * Flow:
 *   (hotels[], flights[], chatHistory[]) → score + rank → top N bundles
 *   Optional: Pinecone semantic boost if configured.
 */
import {
  upsertHotelVectors,
  upsertFlightVectors,
  queryHotelsByPreference,
  queryFlightsByPreference,
} from "./vectorService.js";
import config from "../config/index.js";

// ─── Airport Coordinates (IATA → lat/lng) ─────────────────────
// Used to compute hotel-to-airport distance for proximity scoring
const AIRPORT_COORDS = {
  DEL: { lat: 28.5562, lng: 77.1000 },
  BOM: { lat: 19.0896, lng: 72.8656 },
  BLR: { lat: 13.1986, lng: 77.7066 },
  HYD: { lat: 17.2403, lng: 78.4294 },
  MAA: { lat: 12.9941, lng: 80.1709 },
  CCU: { lat: 22.6547, lng: 88.4467 },
  GOI: { lat: 15.3808, lng: 73.8314 },
  JAI: { lat: 26.8242, lng: 75.8122 },
  SXR: { lat: 33.9871, lng: 74.7742 },
  GAU: { lat: 26.1061, lng: 91.5859 },
  COK: { lat: 10.1520, lng: 76.4019 },
  AMD: { lat: 23.0772, lng: 72.6347 },
  PNQ: { lat: 18.5822, lng: 73.9197 },
  LKO: { lat: 26.7606, lng: 80.8893 },
  VNS: { lat: 25.4524, lng: 82.8593 },
  DXB: { lat: 25.2532, lng: 55.3657 },
  SIN: { lat: 1.3644, lng: 103.9915 },
  BKK: { lat: 13.6900, lng: 100.7501 },
  LON: { lat: 51.4700, lng: -0.4543 },
  LHR: { lat: 51.4700, lng: -0.4543 },
  PAR: { lat: 49.0097, lng: 2.5479 },
  CDG: { lat: 49.0097, lng: 2.5479 },
  TYO: { lat: 35.7647, lng: 140.3864 },
  NRT: { lat: 35.7647, lng: 140.3864 },
  NYC: { lat: 40.6413, lng: -73.7781 },
  JFK: { lat: 40.6413, lng: -73.7781 },
  DPS: { lat: -8.7482, lng: 115.1672 },
  MLE: { lat: 4.1918, lng: 73.5290 },
  KUL: { lat: 2.7456, lng: 101.7099 },
  HKT: { lat: 8.1132, lng: 98.3169 },
  ATQ: { lat: 31.7096, lng: 74.7973 },
  IXC: { lat: 30.6735, lng: 76.7885 },
  UDR: { lat: 24.6177, lng: 73.8961 },
  IXL: { lat: 34.1359, lng: 77.5465 },
  DED: { lat: 30.1897, lng: 78.1802 },
};

// ─── Utility: Haversine distance (km) ──────────────────────────
function haversineKm(lat1, lng1, lat2, lng2) {
  if (!lat1 || !lng1 || !lat2 || !lng2) return Infinity;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Infer user budget tier from chat history ──────────────────
function inferBudgetTier(chatHistory) {
  const text = (chatHistory || []).map((m) => m.content || "").join(" ").toLowerCase();

  if (/luxury|5\s*star|premium|high.?end|splurge|honeymoon|suite/.test(text)) return "luxury";
  if (/budget|cheap|affordable|low.?cost|hostel|backpack|save/.test(text)) return "budget";
  if (/mid.?range|moderate|comfortable|3\s*star|4\s*star|decent/.test(text)) return "midrange";

  return "midrange"; // default
}

// ─── Infer user style from chat history ────────────────────────
function inferUserStyle(chatHistory) {
  const text = (chatHistory || []).map((m) => m.content || "").join(" ").toLowerCase();
  const styles = [];

  if (/family|kid|children|child/.test(text)) styles.push("family");
  if (/romantic|couple|honeymoon|anniversary/.test(text)) styles.push("romantic");
  if (/business|work|corporate|meeting/.test(text)) styles.push("business");
  if (/adventure|trek|hike|outdoor/.test(text)) styles.push("adventure");
  if (/relax|spa|wellness|peaceful|quiet/.test(text)) styles.push("relaxation");
  if (/party|nightlife|fun|club/.test(text)) styles.push("party");

  return styles;
}

// ─── Scoring Functions ─────────────────────────────────────────

/**
 * Score 1: Airport Proximity (0–1)
 * Hotels within 5km = 1.0, up to 50km linearly decaying to 0
 */
function scoreAirportProximity(hotel, destAirportCode) {
  const airport = AIRPORT_COORDS[destAirportCode?.toUpperCase()];
  if (!airport || !hotel.latitude || !hotel.longitude) return 0.5; // neutral if unknown

  const distKm = haversineKm(hotel.latitude, hotel.longitude, airport.lat, airport.lng);
  if (distKm <= 5) return 1.0;
  if (distKm >= 50) return 0.0;
  return 1 - (distKm - 5) / 45;
}

/**
 * Score 2: Star Rating Match (0–1)
 * How well does hotel star rating match the inferred budget tier?
 */
function scoreStarRatingMatch(hotel, budgetTier) {
  const stars = hotel.star_rating || hotel.rating || 3;

  const idealStars = budgetTier === "luxury" ? 5 : budgetTier === "budget" ? 2 : 3.5;
  const diff = Math.abs(stars - idealStars);
  return Math.max(0, 1 - diff / 3);
}

/**
 * Score 3: Price-Value Ratio (0–1)
 * Lower combined price relative to peers = higher score
 */
function scorePriceValue(hotel, flight, allHotels, allFlights) {
  const hotelPrice = hotel.price_per_night || 0;
  const flightPrice = flight.price || 0;
  const combinedPrice = hotelPrice + flightPrice;

  if (combinedPrice === 0) return 0;

  // Calculate percentile among all possible combinations
  const allPrices = [];
  for (const h of allHotels.slice(0, 20)) {
    for (const f of allFlights.slice(0, 10)) {
      allPrices.push((h.price_per_night || 0) + (f.price || 0));
    }
  }
  allPrices.sort((a, b) => a - b);

  if (allPrices.length === 0) return 0.5;
  const rank = allPrices.findIndex((p) => p >= combinedPrice);
  return 1 - rank / allPrices.length;
}

/**
 * Score 4: Amenity Match (0–1)
 * How well hotel amenities match user's inferred style
 */
function scoreAmenityMatch(hotel, userStyles) {
  if (userStyles.length === 0) return 0.5; // neutral

  const amenities = (hotel.amenities || []).join(" ").toLowerCase();
  const tags = (hotel.style_tags || []).join(" ").toLowerCase();
  const combined = amenities + " " + tags;

  const styleKeywords = {
    family: ["pool", "kids", "family", "playground", "child"],
    romantic: ["spa", "pool", "romantic", "suite", "view", "couples"],
    business: ["wifi", "business", "center", "meeting", "workspace"],
    adventure: ["outdoor", "adventure", "trek", "sport", "activity"],
    relaxation: ["spa", "wellness", "pool", "quiet", "peaceful", "yoga"],
    party: ["bar", "nightlife", "restaurant", "lounge", "club"],
  };

  let matchCount = 0;
  let totalKeywords = 0;

  for (const style of userStyles) {
    const keywords = styleKeywords[style] || [];
    totalKeywords += keywords.length;
    for (const kw of keywords) {
      if (combined.includes(kw)) matchCount++;
    }
  }

  return totalKeywords > 0 ? matchCount / totalKeywords : 0.5;
}

/**
 * Score 5: Time Alignment (0–1)
 * Does the flight arrive at a reasonable time for hotel check-in?
 */
function scoreTimeAlignment(flight) {
  if (!flight.arrival_time) return 0.5;

  try {
    const arrivalDate = new Date(flight.arrival_time);
    const arrivalHour = arrivalDate.getHours();

    // Best: arrive 12pm-6pm (score 1.0)
    // OK: 6am-12pm or 6pm-10pm (score 0.6-0.8)
    // Bad: 10pm-6am (red-eye, score 0.2-0.4)
    if (arrivalHour >= 12 && arrivalHour <= 18) return 1.0;
    if (arrivalHour >= 6 && arrivalHour < 12) return 0.7;
    if (arrivalHour > 18 && arrivalHour <= 22) return 0.6;
    return 0.3; // late night / early morning
  } catch {
    return 0.5;
  }
}

// ─── Main Bundle Generator ─────────────────────────────────────

/**
 * Generate smart bundles from flights + hotels + chat context.
 *
 * @param {Object} params
 * @param {Array} params.hotels - Hotel search results
 * @param {Array} params.flights - Flight search results
 * @param {Array} params.chatHistory - Conversation messages [{role, content}]
 * @param {string} params.destinationCode - IATA airport code (e.g. "SXR")
 * @param {string} [params.sessionId] - Optional session ID for Pinecone
 * @returns {Array} Scored and ranked bundles
 */
export async function generateBundles({
  hotels = [],
  flights = [],
  chatHistory = [],
  destinationCode = "",
  sessionId = null,
}) {
  if (hotels.length === 0 || flights.length === 0) {
    return [];
  }

  const start = Date.now();
  console.log(`[Bundles] Generating from ${hotels.length} hotels × ${flights.length} flights...`);

  // Infer user preferences from chat
  const budgetTier = inferBudgetTier(chatHistory);
  const userStyles = inferUserStyle(chatHistory);
  console.log(`[Bundles] Inferred: budget=${budgetTier}, styles=[${userStyles.join(",")}]`);

  // ── Pinecone semantic boost (optional) ──
  let semanticHotelBoost = new Map(); // hotelIndex → score
  let semanticFlightBoost = new Map();

  if (sessionId && config.pinecone?.apiKey) {
    try {
      const prefText = buildPreferenceText(chatHistory, budgetTier, userStyles);

      // Upsert + query in parallel
      await Promise.all([
        upsertHotelVectors(hotels.slice(0, 50), sessionId),
        upsertFlightVectors(flights.slice(0, 30), sessionId),
      ]);

      const [hotelMatches, flightMatches] = await Promise.all([
        queryHotelsByPreference(prefText, sessionId, 15),
        queryFlightsByPreference(prefText, sessionId, 10),
      ]);

      for (const m of hotelMatches) {
        if (m.index !== undefined) semanticHotelBoost.set(m.index, m.score || 0);
      }
      for (const m of flightMatches) {
        if (m.index !== undefined) semanticFlightBoost.set(m.index, m.score || 0);
      }
      console.log(`[Bundles] Pinecone boosts: ${semanticHotelBoost.size} hotels, ${semanticFlightBoost.size} flights`);
    } catch (err) {
      console.warn("[Bundles] Pinecone semantic boost failed (continuing without):", err.message);
    }
  }

  // ── Select top candidates to limit combinatorial explosion ──
  const topHotels = hotels.slice(0, 20);
  const topFlights = flights.slice(0, 10);

  // ── Score each (hotel, flight) pair ──
  const WEIGHTS = {
    airportProximity: 0.20,
    starRating: 0.20,
    priceValue: 0.25,
    amenityMatch: 0.15,
    timeAlignment: 0.10,
    semanticBoost: 0.10,
  };

  const bundles = [];

  for (let hi = 0; hi < topHotels.length; hi++) {
    const hotel = topHotels[hi];
    for (let fi = 0; fi < topFlights.length; fi++) {
      const flight = topFlights[fi];

      const scores = {
        airportProximity: scoreAirportProximity(hotel, destinationCode),
        starRating: scoreStarRatingMatch(hotel, budgetTier),
        priceValue: scorePriceValue(hotel, flight, topHotels, topFlights),
        amenityMatch: scoreAmenityMatch(hotel, userStyles),
        timeAlignment: scoreTimeAlignment(flight),
        semanticBoost:
          ((semanticHotelBoost.get(hi) || 0) + (semanticFlightBoost.get(fi) || 0)) / 2,
      };

      const totalScore =
        WEIGHTS.airportProximity * scores.airportProximity +
        WEIGHTS.starRating * scores.starRating +
        WEIGHTS.priceValue * scores.priceValue +
        WEIGHTS.amenityMatch * scores.amenityMatch +
        WEIGHTS.timeAlignment * scores.timeAlignment +
        WEIGHTS.semanticBoost * scores.semanticBoost;

      bundles.push({
        hotel,
        flight,
        scores,
        totalScore: Math.round(totalScore * 1000) / 1000,
        combinedPrice: (hotel.price_per_night || 0) + (flight.price || 0),
        savings: calculateSavings(hotel, flight, topHotels, topFlights),
        tags: generateBundleTags(scores, budgetTier, userStyles),
      });
    }
  }

  // Sort by total score descending
  bundles.sort((a, b) => b.totalScore - a.totalScore);

  // Deduplicate: don't repeat same hotel or same flight in top results
  const seen = { hotels: new Set(), flights: new Set() };
  const uniqueBundles = [];
  for (const bundle of bundles) {
    const hid = bundle.hotel.id || bundle.hotel.name;
    const fid = bundle.flight.id || bundle.flight.flight_number;
    if (seen.hotels.has(hid) && seen.flights.has(fid)) continue;
    seen.hotels.add(hid);
    seen.flights.add(fid);
    uniqueBundles.push(bundle);
    if (uniqueBundles.length >= 5) break; // Top 5 bundles
  }

  const elapsed = Date.now() - start;
  console.log(`[Bundles] Generated ${uniqueBundles.length} bundles in ${elapsed}ms`);

  return uniqueBundles;
}

// ─── Helpers ────────────────────────────────────────────────────

function calculateSavings(hotel, flight, allHotels, allFlights) {
  // Estimate savings vs. median combination
  const allPrices = [];
  for (const h of allHotels.slice(0, 10)) {
    for (const f of allFlights.slice(0, 5)) {
      allPrices.push((h.price_per_night || 0) + (f.price || 0));
    }
  }
  if (allPrices.length === 0) return 0;
  allPrices.sort((a, b) => a - b);
  const median = allPrices[Math.floor(allPrices.length / 2)];
  const bundlePrice = (hotel.price_per_night || 0) + (flight.price || 0);
  return Math.max(0, Math.round(median - bundlePrice));
}

function generateBundleTags(scores, budgetTier, userStyles) {
  const tags = [];
  if (scores.airportProximity >= 0.8) tags.push("Near Airport");
  if (scores.priceValue >= 0.7) tags.push("Best Value");
  if (scores.starRating >= 0.8) tags.push("Perfect Match");
  if (scores.amenityMatch >= 0.7 && userStyles.length > 0) tags.push("Style Match");
  if (scores.timeAlignment >= 0.8) tags.push("Great Timing");
  if (budgetTier === "luxury" && (scores.starRating >= 0.7)) tags.push("Premium");
  if (budgetTier === "budget" && (scores.priceValue >= 0.7)) tags.push("Budget Friendly");
  return tags;
}

function buildPreferenceText(chatHistory, budgetTier, userStyles) {
  const historyText = (chatHistory || [])
    .slice(-4)
    .map((m) => m.content || "")
    .join(". ");
  return `${budgetTier} travel. Style: ${userStyles.join(", ") || "general"}. ${historyText}`.trim();
}
