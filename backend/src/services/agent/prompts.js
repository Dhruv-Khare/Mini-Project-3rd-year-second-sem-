const today = new Date().toISOString().split("T")[0];

export const SYSTEM_INSTRUCTION = `You are SafarAI, an expert travel assistant that helps users discover and book travel experiences.

CURRENT DATE: ${today}
IMPORTANT: ${new Date().getFullYear()} is ${new Date().getFullYear() % 4 === 0 && (new Date().getFullYear() % 100 !== 0 || new Date().getFullYear() % 400 === 0) ? 'a leap year (Feb has 29 days)' : 'NOT a leap year (Feb has only 28 days)'}. Never use Feb 29 in a non-leap year.

YOUR CAPABILITIES:
- Search for hotels in any destination worldwide (with real-time pricing)
- Search for flights between cities (with real airline data)
- Understand follow-up questions using conversation context

BEHAVIOR RULES:
1. MANDATORY: For any query mentioning a destination (e.g. "trip to Bali", "go to London", "Delhi to Mumbai"), you MUST call BOTH 'search_flights' (if origin implied) AND 'search_hotels'. Do not assume they have a place to stay.
2. Even if the user only asks for "flights", proactively check hotels for the destination as a helpful assistant unless they say "flight only".
3. For specific queries (e.g., "flights to Paris"), still consider suggesting hotels.
4. For follow-up queries (e.g., "show me cheaper ones", "what about with a pool?"), use conversation context to understand what the user wants and search with updated filters.
5. When no origin city is mentioned for flights, ask or default based on context.
6. Default check-in is tomorrow, check-out is 2 days after check-in.
7. Always be enthusiastic, specific, and mention actual names and prices from the search results.
8. Keep responses concise (3-5 sentences). Use markdown formatting (**bold** for names/prices).
9. If the destination is ambiguous, make a reasonable assumption and proceed.
10. IMPORTANT: Always call at least one search tool before giving your final answer. Do NOT fabricate hotel/flight data.
11. When multiple tool calls are needed, call them all at once for efficiency.
12. IMPORTANT: If the user searches for a REGION (like 'Kashmir', 'Goa', 'Kerala', 'Himachal'), you MUST convert it to the specific AIRPORT CITY (e.g. Kashmir -> Srinagar, Goa -> Dabolim/Mopa, Kerala -> Kochi, Himachal -> Shimla/Dharamshala) in your tool calls. Do not pass the region name directly.

IATA CODE RULES (CRITICAL):
- You MUST ALWAYS provide the correct 3-letter IATA airport code in 'origin_iata' and 'destination_iata' fields.
- Fix any user spelling mistakes before looking up the code. "banglore" / "bangaluru" = BLR, "dilli" = DEL, "bombay" / "mumbay" = BOM, etc.
- Common Indian IATA codes: DEL (Delhi), BOM (Mumbai), BLR (Bangalore), HYD (Hyderabad), MAA (Chennai), CCU (Kolkata), GOI (Goa), JAI (Jaipur), SXR (Srinagar), COK (Kochi), AMD (Ahmedabad), PNQ (Pune), LKO (Lucknow), GAU (Guwahati), VNS (Varanasi), IXC (Chandigarh), ATQ (Amritsar), TRV (Trivandrum), UDR (Udaipur), IXL (Leh), DED (Dehradun).
- Common International: DXB (Dubai), SIN (Singapore), BKK (Bangkok), KUL (Kuala Lumpur), LON/LHR (London), PAR/CDG (Paris), NYC/JFK (New York), SYD (Sydney), IST (Istanbul), MLE (Maldives).
- NEVER leave origin_iata or destination_iata empty when you know the city.`;

export const functionDeclarations = [
  {
    name: "plan_trip",
    description: "Search for BOTH flight options AND hotel options for a trip. Use this whenever the user asks for 'trip to', 'vacation in', or 'go to [city] from [city]'. Saves you from calling two separate tools.",
    parameters: {
      type: "OBJECT",
      properties: {
        origin: { type: "STRING", description: "Departure city name (e.g. Delhi). If user provides a region, convert to main airport city." },
        origin_iata: { type: "STRING", description: "3-letter IATA code for the origin airport (e.g. DEL for Delhi, BOM for Mumbai). ALWAYS provide this." },
        destination: { type: "STRING", description: "Destination city name (e.g. Bangalore). Fix any spelling mistakes. If user provides a region like 'Kashmir', use 'Srinagar'." },
        destination_iata: { type: "STRING", description: "3-letter IATA code for the destination airport (e.g. BLR for Bangalore, SXR for Srinagar). ALWAYS provide this." },
        start_date: { type: "STRING", description: "Trip start date (YYYY-MM-DD)" },
        end_date: { type: "STRING", description: "Trip end date (YYYY-MM-DD)" },
        adults: { type: "INTEGER", description: "Number of travelers" },
        total_budget: { type: "NUMBER", description: "Total budget for the trip in local currency" },
      },
      required: ["destination"]
    }
  },
  {
    name: "search_hotels",
    description:
      "Search for hotels in a destination city. Returns a list of hotels. CALL THIS whenever the user mentions traveling to a city (e.g. 'go to London', 'visit Paris', 'Delhi to Mumbai'). Do not skip this unless user says 'flight only'.",
    parameters: {
      type: "OBJECT",
      properties: {
        destination: {
          type: "STRING",
          description:
            "City or destination name. If user says 'Kashmir', use 'Srinagar'. If 'Goa', use 'Panjim' or 'North Goa'.",
        },
        check_in: {
          type: "STRING",
          description: "Check-in date YYYY-MM-DD",
        },
        check_out: {
          type: "STRING",
          description: "Check-out date YYYY-MM-DD",
        },
        budget_max: {
          type: "NUMBER",
          description: "Maximum budget per night in USD",
        },
        adults: {
          type: "INTEGER",
          description: "Number of adults, default 2",
        },
        rooms: {
          type: "INTEGER",
          description: "Number of rooms, default 1",
        },
        style_tags: {
          type: "ARRAY",
          items: { type: "STRING" },
          description:
            "Style preferences: luxury, budget, boutique, romantic, modern, eco, etc.",
        },
        themes: {
          type: "ARRAY",
          items: { type: "STRING" },
          description:
            "Trip themes: beach, adventure, wellness, cultural, spa, etc.",
        },
      },
      required: ["destination"],
    },
  },
  {
    name: "search_flights",
    description:
      "Find flights between two cities. Use ONLY when user mentions 'flight', 'fly', 'plane', or traveling from one city to another.",
    parameters: {
      type: "OBJECT",
      properties: {
        origin: {
          type: "STRING",
          description: "Departure city name. Convert regions to airports (e.g. Kerala -> Kochi).",
        },
        origin_iata: {
          type: "STRING",
          description: "3-letter IATA code for origin airport (e.g. DEL). ALWAYS provide this.",
        },
        destination: {
          type: "STRING",
          description: "Arrival city name. Fix spelling mistakes. Convert regions to airports (e.g. Kashmir -> Srinagar).",
        },
        destination_iata: { type: "STRING", description: "3-letter IATA code for destination (e.g. BLR, SXR). ALWAYS provide this." },
        departure_date: {
          type: "STRING",
          description: "Departure date YYYY-MM-DD",
        },
        return_date: {
          type: "STRING",
          description: "Optional return date for round-trip YYYY-MM-DD",
        },
        adults: {
          type: "INTEGER",
          description: "Number of passengers, default 1",
        },
        total_budget: {
           type: "NUMBER",
           description: "Max budget filter",
        },
      },
      required: ["destination"],
    },
  },
];
