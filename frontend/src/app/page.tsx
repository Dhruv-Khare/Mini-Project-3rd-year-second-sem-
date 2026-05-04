"use client";

import { useState, useCallback, useRef } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { RefinedFilters, FilterData, FilterInitialData } from "@/components/layout/RefinedFilters";
import { MapView } from "@/components/features/MapView";
import { ChatAssistant } from "@/components/features/ChatAssistant";
import { SafarBot } from "@/components/features/SafarBot";
import { ResultsPanel } from "@/components/layout/ResultsPanel";
import { searchTravel, searchHotels, searchFlights, generateSmartBundles } from "@/lib/api";
import { TripPlan, CartItem, SmartBundle } from "@/lib/types";
import { cn } from "@/lib/utils";

import { HeroLanding } from "@/components/layout/HeroLanding";

export default function Home() {
  const [activeTab, setActiveTab] = useState("flights");
  const [isLoading, setIsLoading] = useState(false);
  const [flightsLoading, setFlightsLoading] = useState(false);
  const [tripPlan, setTripPlan] = useState<TripPlan | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number] | undefined>(undefined);
  const [mapZoom, setMapZoom] = useState<number | undefined>(undefined);
  const [showHero, setShowHero] = useState(true);

  // ── Cart State ──
  const [cart, setCart] = useState<CartItem[]>([]);

  // ── Smart Bundles State ──
  const [bundles, setBundles] = useState<SmartBundle[]>([]);
  const [bundlesLoading, setBundlesLoading] = useState(false);

  const handleAddToCart = useCallback((item: CartItem) => {
    setCart(prev => {
      // For flights: only 1 allowed — replace any existing flight
      if (item.type === "flight") {
        const withoutFlights = prev.filter(c => c.type !== "flight");
        return [...withoutFlights, { ...item, quantity: 1 }];
      }
      // For hotels: only 1 allowed — replace any existing hotel
      if (item.type === "hotel") {
        const withoutHotels = prev.filter(c => c.type !== "hotel");
        return [...withoutHotels, { ...item, quantity: 1 }];
      }
      // For other types: add normally (no duplicates)
      const existing = prev.find(c => c.id === item.id);
      if (existing) {
        return prev.map(c =>
          c.id === item.id
            ? { ...c, quantity: c.quantity + 1 }
            : c
        );
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  }, []);

  const handleRemoveFromCart = useCallback((itemId: string) => {
    setCart(prev => prev.filter(c => c.id !== itemId));
  }, []);

  const handleUpdateCartQty = useCallback((itemId: string, delta: number) => {
    setCart(prev => prev.map(c => {
      if (c.id !== itemId) return c;
      const newQty = c.quantity + delta;
      return newQty > 0 ? { ...c, quantity: newQty } : c;
    }).filter(c => c.quantity > 0));
  }, []);

  const handleClearCart = useCallback(() => {
    setCart([]);
  }, []);

  const cartTotal = cart.reduce((sum, c) => sum + c.price * c.quantity, 0);
  const cartCount = cart.reduce((sum, c) => sum + c.quantity, 0);

  // Keep the original (unfiltered) trip plan so filters work client-side
  const originalTripPlan = useRef<TripPlan | null>(null);
  // Track the dates that were last fetched from the API
  const lastFetchedDates = useRef<{ checkIn: string; checkOut: string }>({ checkIn: "", checkOut: "" });

  // Derive filter initial data from tripPlan
  const filterInitialData: FilterInitialData | undefined = tripPlan ? {
    destination: tripPlan.destination !== "Multiple" ? tripPlan.destination : undefined,
    origin: tripPlan.origin || tripPlan.flights?.[0]?.origin || undefined,
    checkIn: tripPlan.check_in || undefined,
    checkOut: tripPlan.check_out || undefined,
  } : undefined;

  const processResults = useCallback(async (plan: TripPlan | null) => {
    // Save the original unfiltered results for client-side filtering
    // (This might be temporarily incomplete if async/await is still running)
    originalTripPlan.current = plan;
    
    // Remember the dates that were fetched so we can detect changes
    if (plan) {
      lastFetchedDates.current = {
        checkIn: plan.check_in || "",
        checkOut: plan.check_out || "",
      };
    }
    
    setTripPlan(plan);
    setIsLoading(false); // Stop main loader immediately

    if (plan) {
      setShowHero(false);
      // Auto-move map logic
      if (plan.actions) {
        const flyAction = plan.actions.find(a => a.type === 'fly_to');
        if (flyAction && typeof flyAction.lat === 'number' && typeof flyAction.lng === 'number') {
          setMapCenter([flyAction.lat, flyAction.lng]);
          setMapZoom(flyAction.zoom || 12);
        }
      }

      // ──────────────────────────────────────────────
      // Async Flight Fetching (for speed)
      // ──────────────────────────────────────────────
      if (plan.fetch_flights_async && plan.flight_search_params) {
          console.log("Triggering async flight search...");
          setFlightsLoading(true);
          try {
              // Fetch flights separately
              const flightResponse = await searchFlights(plan.flight_search_params);
              const flights = flightResponse.flights || [];
              
              // Merge into existing plan
              setTripPlan(prev => {
                  if (!prev) return null;
                  const updated = { 
                      ...prev, 
                      flights: flights, 
                      fetch_flights_async: false // Mark done
                  };
                  originalTripPlan.current = updated;

                  // Auto-generate smart bundles when both flights & hotels are available
                  if (flights.length > 0 && (updated.hotels?.length || 0) > 0) {
                    const destCode = flights[0]?.destination || updated.destination || "";
                    setBundlesLoading(true);
                    generateSmartBundles({
                      hotels: updated.hotels || [],
                      flights: flights,
                      chatHistory: [],
                      destinationCode: destCode,
                    })
                      .then(res => setBundles(res.bundles || []))
                      .catch(err => console.error("Bundle generation failed:", err))
                      .finally(() => setBundlesLoading(false));
                  }

                  return updated;
              });
          } catch (err) {
              console.error("Async flight search failed:", err);
          } finally {
              setFlightsLoading(false);
          }
      }
    }
  }, []);

  /* Direct search from landing page search bar */
  const handleDirectSearch = useCallback(async (query: string) => {
    setIsLoading(true);
    try {
      const result = await searchTravel(query);
      processResults(result);
    } catch {
      setIsLoading(false);
    }
  }, [processResults]);

  /* Chat assistant results callback */
  const handleSearchResults = useCallback((plan: TripPlan | null) => {
    processResults(plan);
  }, [processResults]);

  const handleLoadingChange = useCallback((loading: boolean) => {
    setIsLoading(loading);
  }, []);

  const handleHotelDateUpdate = useCallback(async (newCheckIn: string, newCheckOut: string) => {
    if (!tripPlan) return;

    // Use city code if available from previous backend search
    const cityId = tripPlan.search_params?.cityId;

    if (!cityId) {
        console.warn("Cannot update hotels: Missing City ID in tripPlan data.");
        return; 
    }

    setIsLoading(true);

    // Call API just for hotels
    try {
        const response: any = await searchHotels({
            cityCode: cityId,
            checkIn: newCheckIn,
            checkOut: newCheckOut,
            rooms: 1, 
            adults: 2
        });
        
        // The API returns { count, hotels: [...], ... }
        // We need to update tripPlan
        const updatedHotels = response.hotels || [];
        const updatedSearchParams = {
          ...tripPlan.search_params,
          check_in: newCheckIn,
          check_out: newCheckOut
        };

        setTripPlan(prev => {
            if (!prev) return null;
            const newPlan = {
                ...prev,
                hotels: updatedHotels,
                search_params: updatedSearchParams
            };
            
            // IMPORTANT: Update the reference used by client-side filters 
            // so that if user changes budget later, we don't revert to old hotels
            if (originalTripPlan.current) {
                originalTripPlan.current = {
                    ...originalTripPlan.current,
                    hotels: updatedHotels,
                    search_params: updatedSearchParams
                };
            }
            
            return newPlan;
        });

    } catch (err) {
        console.error("Failed to update hotels:", err);
    } finally {
        setIsLoading(false);
    }
  }, [tripPlan]);

  /*
   * Hybrid filtering:
   *  - Date change → re-fetch hotels from API (availability is date-dependent)
   *  - Budget / text change only → instant client-side filter (no API call)
   */
  const handleApplyFilters = useCallback(
    async (filters: FilterData) => {
      const base = originalTripPlan.current;
      if (!base) return;

      const datesChanged =
        (filters.departureDate && filters.departureDate !== lastFetchedDates.current.checkIn) ||
        (filters.returnDate && filters.returnDate !== lastFetchedDates.current.checkOut);

      let workingPlan = { ...base };

      // ── If dates changed, re-fetch hotels for the new dates ──
      if (datesChanged && filters.to) {
        setIsLoading(true);
        try {
          // Build a query that includes destination + new dates so the agent uses them
          const query = `hotels in ${filters.to}${filters.from ? ` from ${filters.from}` : ""} check-in ${filters.departureDate} check-out ${filters.returnDate}`;
          const freshResult = await searchTravel(query);
          if (freshResult) {
            // Merge: keep original flights, replace hotels with fresh results
            workingPlan = {
              ...base,
              hotels: freshResult.hotels || [],
              check_in: filters.departureDate,
              check_out: filters.returnDate,
              data_source: freshResult.data_source || base.data_source,
            };
            // Update the "original" baseline with fresh hotel data
            originalTripPlan.current = workingPlan;
            lastFetchedDates.current = {
              checkIn: filters.departureDate,
              checkOut: filters.returnDate,
            };
          }
        } catch (err) {
          console.error("Date re-fetch failed, applying client-side only:", err);
        } finally {
          setIsLoading(false);
        }
      }

      // ── Client-side filters (always applied) ──
      const filtered = { ...workingPlan };

      // Filter hotels by budget
      if (filters.budgetMax && filters.budgetMax < 200000) {
        filtered.hotels = (workingPlan.hotels || []).filter(
          (h) => (h.price_per_night || h.total_fare || 0) <= filters.budgetMax
        );
      }

      // Filter flights by origin / destination text
      if (filters.from || filters.to) {
        filtered.flights = (workingPlan.flights || []).filter((f) => {
          const matchFrom = !filters.from || f.origin.toLowerCase().includes(filters.from.toLowerCase());
          const matchTo = !filters.to || f.destination.toLowerCase().includes(filters.to.toLowerCase());
          return matchFrom && matchTo;
        });
      }

      // Sync display dates
      if (filters.departureDate) filtered.check_in = filters.departureDate;
      if (filters.returnDate) filtered.check_out = filters.returnDate;

      setTripPlan(filtered);
    },
    [/* stable refs only */]
  );

  const mapHotels = tripPlan?.hotels || [];
  const mapFlights = tripPlan?.flights || [];
  const mapOrigin = tripPlan?.origin || null;
  const mapDestination = tripPlan?.destination || null;

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden font-sans">
      
      {/* 1. Navbar (Sticky Top) */}
      <Navbar 
        activeTab={activeTab} 
        onTabChange={setActiveTab} 
        transparent={showHero}
        cartCount={cartCount}
        cartTotal={cartTotal}
      />

      {/* 2. Horizontal Filter Bar (Only visible when not in Hero mode) */}
      {!showHero && (
        <div className="z-40 border-b border-border shadow-sm pt-20">
            <RefinedFilters onApplyFilters={handleApplyFilters} initialData={filterInitialData} />
        </div>
      )}

      {/* 3. Main Split View Area */}
      <div className="flex flex-1 overflow-hidden relative">
        
        {/* Left Panel: Search Results (Visible only when not in Hero mode) */}
        {!showHero && (
            <div className="h-full z-30 shrink-0">
                <ResultsPanel 
                    tripPlan={tripPlan} 
                    isLoading={isLoading} 
                    flightsLoading={flightsLoading}
                    onHotelDateChange={handleHotelDateUpdate}
                    cart={cart}
                    onAddToCart={handleAddToCart}
                    onRemoveFromCart={handleRemoveFromCart}
                    onUpdateCartQty={handleUpdateCartQty}
                    onClearCart={handleClearCart}
                    onActiveTabChange={setActiveTab}
                    bundles={bundles}
                    bundlesLoading={bundlesLoading}
                />
            </div>
        )}

        {/* Right Panel / Main Area: Map or Hero */}
        <main className={cn(
          "flex-1 relative w-full h-full",
          showHero ? "overflow-y-auto" : "overflow-hidden"
        )}>
          {showHero ? (
            <HeroLanding
              onSearch={handleDirectSearch}
              isLoading={isLoading}
            />
          ) : (
            <div className="w-full h-full relative">
              {/* Top gradient overlay for visual depth */}
              <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-black/[0.03] to-transparent z-[500] pointer-events-none" />

              {/* Floating Destination Pill */}
              {mapDestination && mapDestination !== "Multiple" && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-white/95 backdrop-blur-xl shadow-lg shadow-black/5 border border-white/60 rounded-full px-5 py-2.5 flex items-center gap-3 animate-in slide-in-from-top-2 duration-500 pointer-events-none">
                  <div className="relative flex items-center justify-center">
                    <div className="w-2.5 h-2.5 bg-blue-500 rounded-full" />
                    <div className="absolute w-2.5 h-2.5 bg-blue-500 rounded-full animate-ping opacity-50" />
                  </div>
                  <span className="text-sm font-bold text-gray-800 tracking-tight">
                    {activeTab === "flights" && mapFlights.length > 0
                      ? `${mapOrigin || mapFlights[0]?.origin || 'Origin'} → ${mapDestination}`
                      : `Exploring ${mapDestination}`
                    }
                  </span>
                  <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                    {activeTab === "flights" && mapFlights.length > 0
                      ? `${mapFlights.length} flight${mapFlights.length > 1 ? 's' : ''}`
                      : `${mapHotels.filter(h => h.latitude && h.longitude).length} pins`
                    }
                  </span>
                </div>
              )}
              
              <MapView 
                hotels={mapHotels}
                flights={mapFlights}
                origin={mapOrigin}
                destination={mapDestination} 
                center={mapCenter}
                zoom={mapZoom}
                activeTab={activeTab}
                onAddToCart={handleAddToCart}
                cart={cart}
              />
            </div>
          )}
        </main>
      </div>
      <SafarBot />
    </div>
  );
}
