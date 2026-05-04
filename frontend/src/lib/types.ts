export interface AgentStep {
  type: "thinking" | "tool_call" | "analyzing" | "done" | "error";
  text: string;
  tool?: string;
}

export interface HotelRoom {
  room_name: string;
  room_type?: string; // alias for backward compat
  meal_type: string;
  total_fare: number;
  total_tax: number;
  is_refundable: boolean;
  booking_code: string | null;
  inclusion?: string;
  cancel_policies: unknown[];
  day_rates: unknown[];
  promotions?: unknown[];
}

export interface Hotel {
  id: string;
  name: string;
  city: string;
  address?: string;
  country: string;
  description: string;
  price_per_night: number;
  total_fare?: number;
  currency?: string;
  tax?: number;
  rating: number;
  star_rating?: number;
  amenities: string[];
  image_url: string;
  latitude: number;
  longitude: number;
  style_tags: string[];
  match_score?: number;
  match_reason?: string;
  check_in?: string;
  check_out?: string;
  // TBO-specific
  result_index?: number;
  hotel_code?: string;
  booking_code?: string | null;
  rooms?: HotelRoom[];
  source?: "tbo" | "mock" | string;
}

export interface Flight {
  id: string;
  airline: string;
  carrier_code?: string; // e.g. "AI", "UK", "6E"
  origin: string;
  destination: string;
  departure_time: string;
  arrival_time: string;
  price: number;
  duration_hours: number;
  stops: number;
  match_score?: number;
  flight_number?: string;
  source?: string;
}

export interface TripPlan {
  summary: string;
  steps?: AgentStep[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actions?: { type: string; [key: string]: any }[];
  destination: string;
  origin?: string;
  check_in?: string; // Top-level (often global trip date)
  check_out?: string;
  
  // Search params specifically used to fetch this result (e.g. resolved cityId)
  search_params?: {
      cityId?: string;
      check_in?: string; 
      check_out?: string;
  };

  fetch_flights_async?: boolean;
  flight_search_params?: unknown; // Could be any object passed to search_flights
  hotels?: Hotel[];
  flights?: Flight[];
  dates_suggestion?: string;
  total_estimated_cost?: number;
  ai_reasoning?: string;
  data_source?: "tbo_live" | "mock";
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  tripPlan?: TripPlan;
  imageSearch?: {
    extracted_tags: string[];
    hotels: Hotel[];
  };
  timestamp: Date;
}

// ── Cart Types ──
export interface CartItem {
  id: string;
  type: "hotel" | "flight";
  name: string;
  price: number;
  quantity: number;
  image_url?: string;
  details: string; // e.g. "Mumbai, 3-star" or "DEL → BOM, 2h 30m"
  originalData: Hotel | Flight;
}

// ── Smart Bundle Types ──
export interface BundleScores {
  airportProximity: number;
  starRating: number;
  priceValue: number;
  amenityMatch: number;
  timeAlignment: number;
  semanticBoost: number;
}

export interface SmartBundle {
  hotel: Hotel;
  flight: Flight;
  scores: BundleScores;
  totalScore: number;
  combinedPrice: number;
  savings: number;
  tags: string[];
}
