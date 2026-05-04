// ─── Tool Executors ─────────────────────────────────────────────
import config from "../../config/index.js";
import { searchTboFlights } from "../tboAirApi.js";
import { searchHotels as tboSearchHotels, getHotelCodeBatch, searchHotelsChunked } from "../tboApi.js";
import { generateMockHotels } from "../mockHotels.js";
import { getCityCode } from "../cityResolver.js";
import {
  getDefaultCheckIn,
  getDefaultCheckOut,
  getDefaultFlightDate,
  validateAndFixDate,
  transformTboHotel,
  fetchHotelDetailsMap,
} from "./helpers.js";

export async function executeSearchHotels(args, collected) {
  const destination = args.destination || "";
  console.log(`[Agent Tool] executeSearchHotels called for: ${destination}`);
  const rawCheckIn = args.check_in || getDefaultCheckIn();
  const rawCheckOut = args.check_out || getDefaultCheckOut(rawCheckIn);
  // Validate dates — fix invalid ones like Feb 29 in non-leap years
  const checkIn = validateAndFixDate(rawCheckIn) || getDefaultCheckIn();
  const checkOut = validateAndFixDate(rawCheckOut) || getDefaultCheckOut(checkIn);

  let hotels = [];
  let source = "mock";
  let usedCheckIn = checkIn;
  let usedCheckOut = checkOut;

  // Try TBO API first
  const cityCode = await getCityCode(destination.toLowerCase());
  if (cityCode) {
    // Build a list of date ranges to try: original, then shifted by +1, +3, +7 days
    const dateAttempts = [
      { checkIn, checkOut },
    ];

    for (const attempt of dateAttempts) {
      try {
        console.log(`[Agent] Chunked search: dates ${attempt.checkIn}→${attempt.checkOut}, city ${cityCode}`);
        const tboResult = await searchHotelsChunked({
          cityCode,
          checkIn: attempt.checkIn,
          checkOut: attempt.checkOut,
          adults: args.adults || 2,
          children: 0,
          childrenAges: [],
          nationality: args.nationality || config.defaults.nationality,
          rooms: args.rooms || 1,
        });

        let hotelResults =
          tboResult.HotelResult ||
          tboResult.HotelSearchResults?.HotelResult ||
          [];

        console.log(
          `[Agent] TBO returned ${hotelResults.length} hotels for CityCode: ${cityCode} (dates: ${attempt.checkIn} → ${attempt.checkOut})`
        );

        if (hotelResults.length > 0) {
          const returnedCodes = hotelResults.map((h) => String(h.HotelCode));
          const detailsMap = await fetchHotelDetailsMap(returnedCodes, cityCode);

          hotels = hotelResults.map((h) => transformTboHotel(h, detailsMap, destination));
          
          // Filter by budget
          if (args.budget_max || args.total_budget) {
              const oneDay = 24 * 60 * 60 * 1000;
              const date1 = new Date(usedCheckIn);
              const date2 = new Date(usedCheckOut);
              const nights = Math.max(1, Math.round(Math.abs((date1 - date2) / oneDay)));
              
              let maxNightly = Number.MAX_SAFE_INTEGER;
              if (args.budget_max) {
                  maxNightly = Number(args.budget_max);
              } else if (args.total_budget) {
                  const hotelBudget = Number(args.total_budget) * 0.6;
                  maxNightly = hotelBudget / nights;
              }
              
              const before = hotels.length;
              hotels = hotels.filter(h => h.price_per_night <= maxNightly);
              console.log(`[Agent] Filtered hotels by budget (Max/Night: ${Math.round(maxNightly)}): ${before} -> ${hotels.length}`);
          }

          source = "tbo_live";
          usedCheckIn = attempt.checkIn;
          usedCheckOut = attempt.checkOut;
          break; // Found results, stop trying dates
        }
      } catch (err) {
        console.error(`[Agent] TBO hotel search error (dates: ${attempt.checkIn} → ${attempt.checkOut}):`, err.message);
      }
    }
  }

  // If TBO still returns 0 hotels after all attempts, use mock fallback
  if (hotels.length === 0) {
      console.log("[Agent] TBO returned 0 hotels across all date attempts. Using mock fallback.");
      hotels = generateMockHotels(destination, usedCheckIn, usedCheckOut, args.rooms || 1);
      source = "mock";
      console.log(`[Agent] Generated ${hotels.length} mock hotels for ${destination}`);
  }

  // Store full data
  collected.hotels = hotels;
  collected.dataSource = source;
  if (!collected.destination) collected.destination = destination;
  collected.check_in = usedCheckIn;
  collected.check_out = usedCheckOut;
  collected.search_params = {
      cityId: cityCode,
      check_in: usedCheckIn,
      check_out: usedCheckOut
  };

  // Return compact summary
  return {
    count: hotels.length,
    source,
    search_params: {
        check_in: usedCheckIn,
        check_out: usedCheckOut,
        cityId: cityCode
    },
    hotels: hotels.map((h) => ({
      name: h.name,
      city: h.city,
      price_per_night: h.price_per_night,
      total_fare: h.total_fare || null,
      rating: h.rating,
      check_in: usedCheckIn,   // Explicitly adding check-in date to each hotel object
      check_out: checkOut, // Explicitly adding check-out date to each hotel object
      amenities: (h.amenities || []).slice(0, 4),
      style_tags: (h.style_tags || []).slice(0, 3),
      match_reason: h.match_reason || null,
    })),
  };
}

export async function executeSearchFlights(args, collected) {
  // Prefer IATA codes from LLM, fall back to city names for resolveIATA
  const destination = args.destination_iata || args.destination || "";
  const origin =
    args.origin_iata ||
    args.origin ||
    collected.origin ||
    config.defaults.origin ||    "Delhi";
  const rawDepartureDate =
    args.departure_date || collected.check_in || getDefaultFlightDate();
  const departureDate = validateAndFixDate(rawDepartureDate) || getDefaultFlightDate();

  // Validate return date if provided
  const rawReturnDate = args.return_date || null;
  const returnDate = rawReturnDate ? (validateAndFixDate(rawReturnDate) || null) : null;

  let flights = [];
  let source = "tbo_air"; // Switched to TBO

  try {
    // ─── Switched to TBO Search ─────────────────────────────────
    const tboFlights = await searchTboFlights({
      origin,
      destination,
      departureDate,
      returnDate,
      adults: args.adults || 1,
      maxResults: 250,
    });
    
    if (tboFlights.length > 0) {
      console.log(`[Agent] TBO returned ${tboFlights.length} flights`);

      // Dedup true duplicates (same flight + same price + same cabin)
      const seen = new Set();
      const unique = [];
      for (const f of tboFlights) {
        // TBO uses TraceId+ResultIndex as unique ID, but we can also dedup by content
        // to avoid showing identical flight options if any
        const key = [
          f.carrier_code, f.flight_number,
          f.departure_time, f.arrival_time,
          f.price, f.cabin_class
        ].join("|");
        
        if (!seen.has(key)) {
          seen.add(key);
          unique.push(f);
        }
      }
      // console.log(`[Agent] After dedup: ${unique.length} unique flights`);
      flights = unique.sort((a, b) => a.price - b.price);

      // NEW: Budget Filter
      if (args.total_budget) {
        // Heuristic: Flight typically takes 40-60% of budget. 
        // Let's cap flight cost at 70% of total budget to leave room for hotels/activities.
        const budget = Number(args.total_budget);
        const maxFlightPrice = budget * 0.70; 
        
        const beforeCount = flights.length;
        flights = flights.filter(f => f.price <= maxFlightPrice);
        console.log(`[Agent] Flight Budget Filter (Max ${Math.round(maxFlightPrice)}): ${beforeCount} -> ${flights.length}`);
      }
    } else {
      console.warn("[Agent] TBO returned 0 flights");
    }
  } catch (err) {
    console.error("[Agent] TBO flight search error:", err.message);
  }

  collected.flights = flights;
  if (!collected.destination) collected.destination = destination;
  if (!collected.origin) collected.origin = origin;
  collected.dataSource = "tbo_air"; // Mark source

  // Return compact summary for the LLM to reason about, but we've stored full list in 'collected'
  return {
    count: flights.length,
    source,
    // Give LLM a decent chunk but not overwhelming, e.g. 50
    flights: flights.slice(0, 50).map((f) => ({ 
      airline: f.airline,
      flight_number: f.flight_number,
      origin: f.origin,
      destination: f.destination,
      price: f.price,
      currency: "INR",
      duration_hours: f.duration_hours,
      stops: f.stops,
      departure_time: f.departure_time,
      arrival_time: f.arrival_time,
    })),
  };
}

// ─── Super Tool Executor ────────────────────────────────────────

// For "plan_trip", we run ONLY hotel search to be fast, and return a flag for client-side flight fetching
export async function executePlanTrip(args, collected) {
  console.log(`[Agent Tool] executePlanTrip called. Destination: ${args.destination}`);
  
  // 1. Run Hotel Search (Fast)
  const hotelRes = await executeSearchHotels({
       destination: args.destination,
       check_in: validateAndFixDate(args.start_date) || undefined,
       check_out: validateAndFixDate(args.end_date) || undefined,
       adults: args.adults,
       total_budget: args.total_budget
     }, collected);

  // 2. Setup Flush for Client-Side Flight Search
  collected.flights = []; 
  collected.fetchFlightsAsync = true; // Flag for UI
  collected.flightParams = {
       origin: args.origin || collected.origin,
       origin_iata: args.origin_iata || null,
       destination: args.destination,
       destination_iata: args.destination_iata || null,
       departureDate: validateAndFixDate(args.start_date) || undefined,
       returnDate: validateAndFixDate(args.end_date) || undefined,
       adults: args.adults,
       total_budget: args.total_budget
  };

  return {
    flights: [],
    hotels: hotelRes,
    message: "Searched for hotels. Flights will be loaded asynchronously."
  };
}

export async function executeTool(name, args, collected) {
  try {
    switch (name) {
      case "plan_trip":
        return await executePlanTrip(args, collected);
      case "search_hotels":
        return await executeSearchHotels(args, collected);
      case "search_flights":
        return await executeSearchFlights(args, collected);
      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    console.error(`[Agent] Tool ${name} failed:`, err.message);
    return { error: `Tool ${name} failed: ${err.message}` };
  }
}
