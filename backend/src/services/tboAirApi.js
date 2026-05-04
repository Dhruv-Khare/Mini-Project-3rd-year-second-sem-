import fetch from "node-fetch";

/**
 * TBO India Air API service - fetches real flight data.
 * Replaces the Amadeus API with TBO Air endpoints.
 *
 * Flow: Authenticate → Search
 *
 * Endpoints:
 *   Auth:   http://Sharedapi.tektravels.com/SharedData.svc/rest/Authenticate
 *   Search: http://api.tektravels.com/BookingEngineService_Air/AirService.svc/rest/Search/
 */

// ─── Configuration ──────────────────────────────────────────────

// Auth base URL (SharedData service at Sharedapi)
const TBO_AIR_AUTH_URL = "http://Sharedapi.tektravels.com/SharedData.svc/rest";

// Search base URL (BookingEngineService_Air)
const TBO_AIR_SEARCH_URL = "http://api.tektravels.com/BookingEngineService_Air/AirService.svc/rest";

// Credentials provided for production/UAT use
// TBO_AIR_USERNAME/PASSWORD loaded from .env
// const TBO_AIR_USERNAME = process.env.TBO_AIR_USERNAME;
// const TBO_AIR_PASSWORD = process.env.TBO_AIR_PASSWORD; 

// Using a module-level variable for token caching
let cachedToken = null;
let tokenExpiry = 0;

// ─── IATA City Code Mapping ────────────────────────────────────
// TBO Air API expects 3-letter IATA codes. 
// Can be expanded as needed.
const CITY_IATA = {
  "new york": "NYC", nyc: "NYC", jfk: "JFK",
  "los angeles": "LAX", la: "LAX",
  "san francisco": "SFO",
  chicago: "CHI", ord: "ORD",
  miami: "MIA",
  london: "LON", heathrow: "LHR",
  paris: "PAR", cdg: "CDG",
  dubai: "DXB",
  tokyo: "TYO",
  singapore: "SIN",
  bangkok: "BKK",
  delhi: "DEL", "new delhi": "DEL",
  mumbai: "BOM", bombay: "BOM",
  bangalore: "BLR", bengaluru: "BLR",
  hyderabad: "HYD",
  chennai: "MAA", madras: "MAA",
  kolkata: "CCU", calcutta: "CCU",
  goa: "GOI",
  jaipur: "JAI",
  ahmedabad: "AMD",
  pune: "PNQ",
  lucknow: "LKO",
  kochi: "COK", cochin: "COK",
  guwahati: "GAU",
  varanasi: "VNS",
  chandigarh: "IXC",
  "nagpur": "NAG",
  "patna": "PAT",
  "bhopal": "BHO",
  "srinagar": "SXR",
  kashmir: "SXR", // Added check for Kashmir
  "amritsar": "ATQ",
  thiruvananthapuram: "TRV", trivandrum: "TRV",
  coimbatore: "CJB",
  mangalore: "IXE",
  visakhapatnam: "VTZ", vizag: "VTZ",
  ranchi: "IXR",
  raipur: "RPR",
  bhubaneswar: "BBI",
  dehradun: "DED",
  udaipur: "UDR",
  jodhpur: "JDH",
  leh: "IXL",
  "port blair": "IXZ",
  madurai: "IXM",
  tiruchirappalli: "TRZ", trichy: "TRZ",
  agartala: "IXA",
  imphal: "IMF",
  dibrugarh: "DIB",
  silchar: "IXS",
  bagdogra: "IXB",
  // International popular cities
  "kuala lumpur": "KUL",
  "hong kong": "HKG",
  seoul: "ICN",
  shanghai: "PVG",
  beijing: "PEK",
  sydney: "SYD",
  melbourne: "MEL",
  toronto: "YYZ",
  vancouver: "YVR",
  "sao paulo": "GRU",
  "abu dhabi": "AUH",
  doha: "DOH",
  muscat: "MCT",
  riyadh: "RUH",
  jeddah: "JED",
  istanbul: "IST",
  cairo: "CAI",
  nairobi: "NBO",
  johannesburg: "JNB",
  amsterdam: "AMS",
  frankfurt: "FRA",
  zurich: "ZRH",
  rome: "FCO",
  milan: "MXP",
  barcelona: "BCN",
  madrid: "MAD",
  lisbon: "LIS",
  vienna: "VIE",
  munich: "MUC",
  athens: "ATH",
  stockholm: "ARN",
  oslo: "OSL",
  copenhagen: "CPH",
  dublin: "DUB",
  male: "MLE", maldives: "MLE",
  colombo: "CMB", "sri lanka": "CMB",
  kathmandu: "KTM", nepal: "KTM",
  dhaka: "DAC", bangladesh: "DAC",
  bali: "DPS",
  phuket: "HKT",
};

/**
 * Resolve a city name to an IATA code. Case-insensitive.
 * Uses: exact match → common misspellings → partial match → Levenshtein fuzzy match → null.
 */
export function resolveIATA(cityName) {
  if (!cityName) return null;
  const cleaned = cityName.trim().toLowerCase().replace(/\s*\(.*?\)\s*/, "");

  // Already an IATA code
  if (cleaned.length === 3 && /^[a-z]{3}$/.test(cleaned)) {
    return cleaned.toUpperCase();
  }

  // Static cache — exact match
  if (CITY_IATA[cleaned]) return CITY_IATA[cleaned];

  // Try partial match (substring)
  for (const [key, code] of Object.entries(CITY_IATA)) {
    if (key.includes(cleaned) || cleaned.includes(key)) return code;
  }

  // Fuzzy match — Levenshtein distance for typos (e.g. "banglore", "mumabi", "dlehi")
  let bestMatch = null;
  let bestDist = Infinity;
  for (const [key, code] of Object.entries(CITY_IATA)) {
    const dist = levenshtein(cleaned, key);
    // Allow up to 2 edits for short names, 3 for longer ones
    const maxDist = key.length <= 5 ? 2 : 3;
    if (dist < bestDist && dist <= maxDist) {
      bestDist = dist;
      bestMatch = code;
    }
  }
  if (bestMatch) {
    console.log(`[TBO Air] Fuzzy IATA match: "${cityName}" -> ${bestMatch} (distance: ${bestDist})`);
    return bestMatch;
  }

  console.warn(`[TBO Air] Could not resolve IATA for "${cityName}", returning null.`);
  return null;
}

/**
 * Simple Levenshtein distance for short strings.
 */
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// ─── Authentication ─────────────────────────────────────────────

/**
 * Authenticate with TBO Air API and get a TokenId.
 * Tokens are cached for 15 minutes.
 */
async function getAuthToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry) {
    return cachedToken;
  }

  const url = `${TBO_AIR_AUTH_URL}/Authenticate`;
  
  // ClientId is 'ApiIntegrationNew' for TBO Air API
  const payload = {
    ClientId: "ApiIntegrationNew",
    UserName: process.env.TBO_AIR_USERNAME,
    Password: process.env.TBO_AIR_PASSWORD,
    EndUserIp: "103.0.0.1",
  };

  console.log(`[TBO Air →] Authenticating...`);
  const start = Date.now();

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const elapsed = Date.now() - start;

    if (!res.ok) {
      const text = await res.text();
      console.error(`[TBO Air ERROR] Auth failed (${res.status}, ${elapsed}ms): ${text.substring(0, 300)}`);
      throw new Error(`TBO Air auth failed (${res.status}): ${text}`);
    }

    const data = await res.json();

    if (data.TokenId) {
      console.log(`[TBO Air ←] Token obtained (${elapsed}ms)`);
      cachedToken = data.TokenId;
      // Cache for 14 minutes (token validity is typically 15 mins)
      tokenExpiry = now + 14 * 60 * 1000;
      return cachedToken;
    }

    if (data.Error && data.Error.ErrorCode !== 0) {
      throw new Error(`TBO Air auth error: ${data.Error.ErrorMessage || "Unknown"}`);
    }

    throw new Error("TBO Air auth: No TokenId in response");
  } catch (error) {
    console.error("TBO Auth Error:", error);
    throw error;
  }
}

// ─── Flight Search ──────────────────────────────────────────────

const INDIAN_AIRPORTS = new Set([
  "DEL", "BOM", "BLR", "HYD", "MAA", "CCU", "GOI", "JAI", "AMD", "PNQ",
  "LKO", "COK", "GAU", "VNS", "IXC", "IDR", "NAG", "PAT", "BHO", "SXR",
  "ATQ", "TRV", "CJB", "IXE", "VTZ", "IXR", "RPR", "BBI", "DED", "UDR",
  "JDH", "IXL", "IXZ", "IXM", "TRZ", "IXA", "IMF", "DIB", "IXS", "IXB",
]);

function isDomesticIndia(originCode, destCode) {
  return INDIAN_AIRPORTS.has(originCode) && INDIAN_AIRPORTS.has(destCode);
}

/**
 * Search flights using TBO India Air API.
 * Returns array of normalized flight objects.
 */
export async function searchTboFlights({
  origin,
  destination,
  departureDate,
  returnDate,
  adults = 1,
  children = 0,
  infants = 0,
  maxResults = 250,
}) {
  const originCode = resolveIATA(origin);
  const destCode = resolveIATA(destination);

  if (!originCode || !destCode) {
    console.warn(`[TBO Air] Missing IATA codes for ${origin} -> ${destination} (resolved: ${originCode} -> ${destCode})`);
    return [];
  }

  if (originCode === destCode) {
    console.warn(`[TBO Air] Origin and destination are the same: ${originCode}. Skipping search.`);
    return [];
  }

  // Get auth token
  let tokenId;
  try {
    tokenId = await getAuthToken();
  } catch (err) {
    console.error(`[TBO Air] Authentication failed: ${err.message}`);
    return [];
  }

  const isDomestic = isDomesticIndia(originCode, destCode);
  const journeyType = returnDate ? "2" : "1"; // 1 = one-way, 2 = return

  // Build segments
  const segments = [
    {
      Origin: originCode,
      Destination: destCode,
      PreferredDepartureTime: `${departureDate}T00:00:00`,
      PreferredArrivalTime: `${departureDate}T00:00:00`,
      FlightCabinClass: 1, // 1=Economy
    },
  ];

  if (returnDate) {
    segments.push({
      Origin: destCode,
      Destination: originCode,
      PreferredDepartureTime: `${returnDate}T00:00:00`,
      PreferredArrivalTime: `${returnDate}T00:00:00`,
      FlightCabinClass: 1,
    });
  }

  const searchPayload = {
    AdultCount: String(adults),
    ChildCount: String(children),
    InfantCount: String(infants),
    IsDomestic: String(isDomestic), // "true" or "false"
    BookingMode: "5",
    DirectFlight: "false",
    OneStopFlight: "false",
    JourneyType: journeyType,
    EndUserIp: "103.0.0.1",
    TokenId: tokenId,
    Segments: segments,
    ResultFareType: 0,
    PreferredCurrency: "INR",
  };

  const url = `${TBO_AIR_SEARCH_URL}/Search/`;
  console.log(
    `[TBO Air →] Search: ${originCode} → ${destCode} on ${departureDate}`
  );
  const start = Date.now();
  const controller = new AbortController();
  // 30s timeout for air search
  const timeout = setTimeout(() => controller.abort(), 30000); 

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(searchPayload),
      signal: controller.signal,
    });
    
    clearTimeout(timeout);
    const elapsed = Date.now() - start;
    console.log(`[TBO Air ←] ${res.status} (${elapsed}ms)`);

    if (!res.ok) {
      const text = await res.text();
      console.error(`[TBO Air ERROR] HTTP ${res.status}: ${text.substring(0, 500)}`);
      return [];
    }

    const data = await res.json();

    if (data.Response && data.Response.Error && data.Response.Error.ErrorCode !== 0) {
      console.error(
        `[TBO Air ERROR] API Error ${data.Response.Error.ErrorCode}: ${data.Response.Error.ErrorMessage}`
      );
      return [];
    }

    const traceId = data.Response?.TraceId || "";
    // Results structure: data.Response.Results[0] contains array of flight objects
    const results = data.Response?.Results || [];
    
    // Flatten result arrays (TBO returns [[OutboundOptions], [ReturnOptions]])
    let allFlights = [];
    if (Array.isArray(results[0])) {
        // Just take the first set for OneWay, or flatten for Return
        // For simplicity in list view, flat map them
        results.forEach(arr => {
            if(Array.isArray(arr)) allFlights = allFlights.concat(arr);
        });
    }

    console.log(`[TBO Air ←] ${allFlights.length} flight offers found`);

    // Normalize to our unified Flight interface
    const normalized = allFlights.slice(0, maxResults).map((offer, idx) => {
      return normalizeTboFlight(offer, idx, originCode, destCode, departureDate, traceId);
    }).filter(f => f !== null);

    return normalized;
  } catch (err) {
    console.error(`[TBO Air ERROR] Search failed: ${err.message}`);
    return [];
  }
}

function normalizeTboFlight(offer, idx, originCode, destCode, departureDate, traceId) {
  // Segments come as array of arrays (Connecting flights)
  // offer.Segments[0] is array of legs
  const segmentsGroup = (offer.Segments && offer.Segments[0]) ? offer.Segments[0] : [];
  
  if (segmentsGroup.length === 0) return null;

  const firstSeg = segmentsGroup[0];
  const lastSeg = segmentsGroup[segmentsGroup.length - 1];

  // Safeguard against missing airline info
  const airlineName = firstSeg.Airline?.AirlineName || firstSeg.Airline?.AirlineCode || "Airline";
  const airlineCode = firstSeg.Airline?.AirlineCode || "XX";
  const flightNumber = firstSeg.Airline?.FlightNumber || "000";

  // Times
  const depTime = firstSeg.Origin?.DepTime || departureDate; 
  const arrTime = lastSeg.Destination?.ArrTime;

  // Duration
  let totalMinutes = 0;
  segmentsGroup.forEach(seg => {
      totalMinutes += (seg.Duration || 0) + (seg.GroundTime || 0); 
  });
  const durationHours = totalMinutes > 0 ? Math.round((totalMinutes / 60) * 10) / 10 : 2.0;

  // Price
  const fare = offer.Fare || {};
  const price = fare.PublishedFare || fare.OfferedFare || 0;

  if (price === 0) return null; // Filter out bad price data

  return {
    id: `tbo_air_${idx}_${traceId}`,
    airline: airlineName,
    carrier_code: airlineCode,
    origin: firstSeg.Origin?.Airport?.AirportCode || originCode,
    destination: lastSeg.Destination?.Airport?.AirportCode || destCode,
    departure_time: depTime,
    arrival_time: arrTime,
    price: price,
    currency: fare.Currency || "INR",
    duration_hours: durationHours,
    stops: Math.max(0, segmentsGroup.length - 1),
    source: "tbo_air", // Mark as TBO
    
    // Extra details useful for UI
    flight_number: `${airlineCode}-${flightNumber}`,
    match_score: 95, // Default high match for real results
    
    // Raw data if needed later
    description: `${airlineName} flight from ${originCode} to ${destCode}`,
    segments: segmentsGroup.map(seg => ({
        origin: seg.Origin?.Airport?.AirportCode,
        destination: seg.Destination?.Airport?.AirportCode,
        airline: seg.Airline?.AirlineName,
        flight_number: `${seg.Airline?.AirlineCode}-${seg.Airline?.FlightNumber}`,
        duration: seg.Duration // mins
    }))
  };
}
