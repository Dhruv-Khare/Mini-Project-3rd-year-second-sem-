"use client";

import { TripPlan, Flight, CartItem, SmartBundle } from "@/lib/types";
import { HotelCard } from "../features/HotelCard";
import { FlightCard } from "../features/FlightCard";
import { FlightFilters } from "../features/FlightFilters";
import { BundleCard } from "../features/BundleCard";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plane,
  Hotel,
  Sparkles,
  Calendar,
  Filter,
  Maximize2,
  Minimize2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Star,
  ClipboardList,
  Trash2,
  Plus,
  Minus
} from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import ReactMarkdown from "react-markdown";

interface ResultsPanelProps {
  isLoading: boolean;
  flightsLoading?: boolean;
  tripPlan: TripPlan | null;
  className?: string;
  onHotelDateChange?: (checkIn: string, checkOut: string) => Promise<void>;
  cart?: CartItem[];
  onAddToCart?: (item: CartItem) => void;
  onRemoveFromCart?: (itemId: string) => void;
  onUpdateCartQty?: (itemId: string, delta: number) => void;
  onClearCart?: () => void;
  onActiveTabChange?: (tab: string) => void;
  bundles?: SmartBundle[];
  bundlesLoading?: boolean;
}

export function ResultsPanel({
  isLoading,
  flightsLoading = false,
  tripPlan,
  className,
  onHotelDateChange,
  cart = [],
  onAddToCart,
  onRemoveFromCart,
  onUpdateCartQty,
  onClearCart,
  onActiveTabChange,
  bundles = [],
  bundlesLoading = false,
}: ResultsPanelProps) {
  const [activeTab, setActiveTabInternal] = useState<"flights" | "hotels" | "cart">("flights");
  const setActiveTab = (tab: "flights" | "hotels" | "cart") => {
    setActiveTabInternal(tab);
    onActiveTabChange?.(tab);
  };
  const [collapsed, setCollapsed] = useState(false);
  const [filteredFlights, setFilteredFlights] = useState<Flight[]>([]);
  
  // Local state for Hotel Dates
  const [localCheckIn, setLocalCheckIn] = useState<string>("");
  const [localCheckOut, setLocalCheckOut] = useState<string>("");
  const [isUpdatingHotels, setIsUpdatingHotels] = useState(false);

  // Hotel sort & filter
  const [hotelSort, setHotelSort] = useState<"default" | "price-asc" | "price-desc" | "rating-desc">("default");
  const [hotelPriceRange, setHotelPriceRange] = useState<{ min: number; max: number } | null>(null);

  // Initialize hotel dates when tripPlan loads
  useEffect(() => {
    const defaultCheckIn = tripPlan?.search_params?.check_in || tripPlan?.check_in;
    const defaultCheckOut = tripPlan?.search_params?.check_out || tripPlan?.check_out;

    if (defaultCheckIn) setLocalCheckIn(defaultCheckIn);
    if (defaultCheckOut) setLocalCheckOut(defaultCheckOut);
  }, [tripPlan]);

  const handleHotelSearchUpdate = async () => {
    if (!onHotelDateChange || !localCheckIn || !localCheckOut) return;
    setIsUpdatingHotels(true);
    try {
        await onHotelDateChange(localCheckIn, localCheckOut);
        // After successful update, we know the parent will update tripPlan
        // And if we implemented it right, tripPlan.search_params will have the new dates
        // So the useEffect above will sync them back, keeping the UI consistent.
    } finally {
        setIsUpdatingHotels(false);
    }
  };

  useEffect(() => {
    if (!tripPlan && !isLoading) {
       setCollapsed(true);
    } else {
       setCollapsed(false);
    }
  }, [tripPlan, isLoading]);

  // Reset filtered flights when tripPlan changes
  useEffect(() => {
    if (tripPlan?.flights) {
        setFilteredFlights(tripPlan.flights);
    } else {
        setFilteredFlights([]);
    }
  }, [tripPlan]);

  // Derive sorted & filtered hotels
  const sortedHotels = (() => {
    let list = [...(tripPlan?.hotels || [])];
    
    // Price range filter
    if (hotelPriceRange) {
      list = list.filter(h => (h.price_per_night || 0) >= hotelPriceRange.min && (h.price_per_night || 0) <= hotelPriceRange.max);
    }
    // Sort
    switch (hotelSort) {
      case "price-asc":
        list.sort((a, b) => (a.price_per_night || 0) - (b.price_per_night || 0));
        break;
      case "price-desc":
        list.sort((a, b) => (b.price_per_night || 0) - (a.price_per_night || 0));
        break;
      case "rating-desc":
        list.sort((a, b) => (b.star_rating || b.rating || 0) - (a.star_rating || a.rating || 0));
        break;
    }
    return list;
  })();

  const totalHotels = tripPlan?.hotels?.length || 0;
  const totalFlights = tripPlan?.flights?.length || 0;
  const cartCount = cart.reduce((sum, c) => sum + c.quantity, 0);

  const tabs = [
    { id: "flights", label: `Flights`, count: flightsLoading ? undefined : totalFlights, icon: flightsLoading ? Loader2 : Plane },
    { id: "hotels", label: `Hotels`, count: totalHotels, icon: Hotel },
    { id: "cart", label: `Itinerary`, count: cartCount, icon: ClipboardList },
  ];
  
  // Custom renderer for ReactMarkdown to handle 'children' prop
  const MarkdownComponents = {
     p: ({node, ...props}: any) => <p className="text-sm text-muted-foreground leading-relaxed mb-4" {...props} />,
     h1: ({node, ...props}: any) => <h1 className="text-lg font-bold text-foreground mb-2" {...props} />,
     h2: ({node, ...props}: any) => <h2 className="text-base font-bold text-foreground mb-2" {...props} />,
     li: ({node, ...props}: any) => <li className="text-sm text-muted-foreground ml-4 list-disc" {...props} />,
  };

  return (
    <div className={cn("flex h-full relative group z-30", className)}>
        <div 
            className={cn(
                "flex flex-col border-r border-border bg-background/95 backdrop-blur shadow-xl transition-all duration-300 ease-in-out h-full overflow-hidden",
                collapsed ? "w-0 p-0 opacity-0 border-none" : "w-full md:w-[750px] lg:w-[900px] opacity-100"
            )}
        >
        {/* Header */}
        <div className="flex flex-col border-b border-border bg-muted/20 p-4 shrink-0 min-w-[320px] md:min-w-[500px] lg:min-w-[600px]">
            <div className="flex items-center justify-between mb-2">
                <div>
                     {/* Header removed */}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                        {isLoading && <span className="flex items-center text-primary animate-pulse"><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Gathering info...</span>}
                    </div>
                </div>
            </div>

            <div className="flex bg-muted/50 p-1 rounded-xl">
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={cn(
                                "flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-lg transition-all duration-200",
                                activeTab === tab.id
                                    ? "bg-background text-foreground shadow-sm ring-1 ring-border/50"
                                    : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                            )}
                        >
                            <Icon className="w-3.5 h-3.5" />
                            {tab.label}
                            {tab.count !== undefined && tab.count > 0 && (
                                <span className="bg-primary/10 text-primary px-1.5 rounded-full text-[10px] min-w-[16px] text-center">
                                    {tab.count}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>

        <ScrollArea className="flex-1 overflow-hidden w-full min-w-[420px] lg:min-w-[480px]">
            <div className="p-4 space-y-6 pb-20">

                {/* Summary removed */}

                {/* Flights */}
                {(activeTab === 'flights') && (totalFlights > 0 || flightsLoading) && (
                   <div className="flex gap-4 items-start">
                        {/* Filters Sidebar */}
                        <div className="hidden md:block border-r border-border pr-4 sticky top-0 max-h-[calc(100vh-160px)] overflow-y-auto w-[240px] shrink-0">
                             <FlightFilters 
                                 flights={tripPlan?.flights || []} 
                                 onFilterChange={setFilteredFlights} 
                             />
                        </div>

                        <div className="flex-1 w-full min-w-0">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="font-semibold flex items-center gap-2">
                                  {flightsLoading ? <Loader2 className="w-4 h-4 animate-spin text-sky-500" /> : <Plane className="w-4 h-4 text-sky-500" />} 
                                  Flights
                                </h3>
                                <Badge variant="secondary" className="text-xs font-normal">
                                  {flightsLoading ? "Searching..." : `${filteredFlights.length} options`}
                                </Badge>
                            </div>

                            {flightsLoading ? (
                                <div className="flex flex-col items-center justify-center py-12 space-y-4 text-muted-foreground animate-pulse border rounded-xl border-dashed bg-muted/30">
                                    <Plane className="w-12 h-12 text-sky-200" />
                                    <div className="text-center space-y-1">
                                        <p className="text-sm font-medium text-foreground">Fetching live flight prices...</p>
                                        <p className="text-xs">Checking airlines for the best deals</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {filteredFlights.length > 0 ? (
                                        filteredFlights.map((flight, idx) => (
                                            <FlightCard
                                              key={idx}
                                              flight={flight}
                                              isInCart={cart.some(c => c.id === `flight-${flight.id}`)}
                                              onAddToCart={onAddToCart}
                                            />
                                        ))
                                    ) : (
                                        <div className="text-center py-10 text-muted-foreground text-sm">
                                            No flights match your filters.
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                   </div>
                )}


                {/* Hotels */}
                {(activeTab === 'hotels') && (
                   <div className="flex gap-4 items-start">
                        {/* Hotel Filters Sidebar (mirrors FlightFilters layout) */}
                        <div className="hidden md:block border-r border-border pr-4 sticky top-0 max-h-[calc(100vh-160px)] overflow-y-auto w-[240px] shrink-0">
                            <div className="space-y-6">
                                {/* Check-in / Check-out Dates — at top for quick access */}
                                <div className="space-y-3">
                                    <h3 className="font-bold text-sm text-slate-900">Travel Dates</h3>
                                    <div className="space-y-2">
                                        <div className="space-y-1">
                                            <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Check-In</label>
                                            <input 
                                                type="date" 
                                                className="w-full bg-muted border border-border rounded px-2 py-1.5 text-sm"
                                                value={localCheckIn}
                                                onChange={(e) => setLocalCheckIn(e.target.value)}
                                                min={new Date().toISOString().split('T')[0]}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Check-Out</label>
                                            <input 
                                                type="date" 
                                                className="w-full bg-muted border border-border rounded px-2 py-1.5 text-sm"
                                                value={localCheckOut}
                                                onChange={(e) => setLocalCheckOut(e.target.value)}
                                                min={localCheckIn || new Date().toISOString().split('T')[0]}
                                            />
                                        </div>
                                        <Button 
                                            size="sm" 
                                            variant="secondary"
                                            className="w-full h-8 mt-1"
                                            onClick={handleHotelSearchUpdate}
                                            disabled={isUpdatingHotels || !localCheckIn || !localCheckOut}
                                        >
                                            {isUpdatingHotels ? <><Loader2 className="w-3 h-3 animate-spin mr-1" /> Updating...</> : "Update Dates"}
                                        </Button>
                                    </div>
                                </div>

                                {/* Sort By Price */}
                                <div className="space-y-3">
                                    <h3 className="font-bold text-sm text-slate-900">Sort By</h3>
                                    <div className="space-y-2">
                                        {([
                                            { label: "Price: Low to High", val: "price-asc" as const },
                                            { label: "Price: High to Low", val: "price-desc" as const },
                                            { label: "Top Rated First", val: "rating-desc" as const },
                                        ] as const).map((opt) => (
                                            <div 
                                                key={opt.val} 
                                                className="flex items-center gap-2 group cursor-pointer" 
                                                onClick={() => setHotelSort(hotelSort === opt.val ? "default" : opt.val)}
                                            >
                                                <Checkbox 
                                                    checked={hotelSort === opt.val}
                                                    className="w-4 h-4 rounded-[2px] border-slate-400 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600 pointer-events-none"
                                                />
                                                <Label className="text-sm font-normal text-slate-700 cursor-pointer pointer-events-none">{opt.label}</Label>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Price Range Quick Picks */}
                                <div className="space-y-3">
                                    <h3 className="font-bold text-sm text-slate-900">Price Range</h3>
                                    <div className="space-y-2">
                                        {([
                                            { label: "Under ₹3,000", min: 0, max: 3000 },
                                            { label: "₹3,000 – ₹8,000", min: 3000, max: 8000 },
                                            { label: "₹8,000 – ₹15,000", min: 8000, max: 15000 },
                                            { label: "₹15,000+", min: 15000, max: Infinity },
                                        ]).map((range) => {
                                            const count = (tripPlan?.hotels || []).filter(h => h.price_per_night >= range.min && h.price_per_night < range.max).length;
                                            const isActive = hotelPriceRange?.min === range.min && hotelPriceRange?.max === range.max;
                                            return (
                                                <div 
                                                    key={range.label} 
                                                    className="flex items-center justify-between group cursor-pointer" 
                                                    onClick={() => setHotelPriceRange(isActive ? null : { min: range.min, max: range.max })}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <Checkbox 
                                                            checked={isActive}
                                                            className="w-4 h-4 rounded-[2px] border-slate-400 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600 pointer-events-none"
                                                        />
                                                        <Label className="text-sm font-normal text-slate-700 cursor-pointer pointer-events-none">{range.label}</Label>
                                                    </div>
                                                    <span className="text-xs text-slate-500 font-medium">{count}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                            </div>
                        </div>

                        {/* Hotel Cards (right side) */}
                        <div className="flex-1 w-full min-w-0">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="font-semibold flex items-center gap-2"><Hotel className="w-4 h-4 text-emerald-500" /> Hotels</h3>
                                <Badge variant="secondary" className="text-xs font-normal">{sortedHotels.length}{sortedHotels.length !== totalHotels ? `/${totalHotels}` : ''} options</Badge>
                            </div>

                            {isUpdatingHotels ? (
                                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground animate-pulse">
                                    <Hotel className="w-8 h-8 mb-2 opacity-50" />
                                    <p>Checking availability for new dates...</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {sortedHotels.length > 0 ? (
                                        sortedHotels.map((hotel, idx) => (
                                            <HotelCard
                                              key={hotel.id || idx}
                                              hotel={hotel}
                                              index={idx}
                                              isInCart={cart.some(c => c.id === `hotel-${hotel.id}`)}
                                              onAddToCart={onAddToCart}
                                            />
                                        ))
                                    ) : totalHotels > 0 ? (
                                        <div className="text-center py-12 text-muted-foreground border rounded-lg border-dashed">
                                            <p>No hotels match your filters.</p>
                                            <p className="text-xs mt-1 opacity-70">Try adjusting price filters.</p>
                                        </div>
                                    ) : (
                                        <div className="text-center py-12 text-muted-foreground border rounded-lg border-dashed">
                                            <p>No hotels found for these dates.</p>
                                            <p className="text-xs mt-1 opacity-70">Try changing dates in the sidebar.</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                   </div>
                )}


                {/* Itinerary */}
                {(activeTab === 'cart') && (
                   <div>
                        {/* ──── Smart Bundles Section ──── */}
                        {(bundles.length > 0 || bundlesLoading) && (
                          <div className="mb-6">
                            <div className="flex items-center gap-2 mb-3">
                              <Sparkles className="w-4 h-4 text-emerald-500" />
                              <h3 className="font-semibold text-sm">Smart Bundles</h3>
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-medium">
                                {bundlesLoading ? 'Finding...' : `${bundles.length} matches`}
                              </Badge>
                            </div>
                            <p className="text-[11px] text-muted-foreground mb-3">
                              AI-matched flight + hotel combos based on proximity, value &amp; your preferences.
                            </p>
                            {bundlesLoading ? (
                              <div className="flex flex-col items-center py-10 text-muted-foreground animate-pulse border rounded-xl border-dashed bg-emerald-50/30">
                                <Sparkles className="w-8 h-8 text-emerald-200 mb-2" />
                                <p className="text-sm font-medium text-foreground">Generating smart bundles...</p>
                                <p className="text-xs">Scoring airport proximity, value &amp; more</p>
                              </div>
                            ) : (
                              <div className="space-y-3">
                                {bundles.map((bundle, idx) => (
                                  <BundleCard
                                    key={`bundle-${idx}`}
                                    bundle={bundle}
                                    rank={idx}
                                    onAddToCart={onAddToCart}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        <div className="flex items-center justify-between mb-4 mt-6">
                            <h3 className="font-semibold flex items-center gap-2">
                              <ClipboardList className="w-4 h-4 text-emerald-600" /> Your Itinerary
                            </h3>
                            {cart.length > 0 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 h-7 px-2"
                                onClick={onClearCart}
                              >
                                <Trash2 className="w-3 h-3 mr-1" /> Clear All
                              </Button>
                            )}
                        </div>

                        {cart.length === 0 ? (
                          <div className="text-center py-16 text-muted-foreground">
                            <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-20" />
                            <p className="font-medium">Your itinerary is empty</p>
                            <p className="text-xs mt-1 opacity-70">Add flights or hotels to build your trip.</p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {cart.map((item) => (
                              <div key={item.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-white hover:shadow-sm transition-shadow">
                                {/* Image */}
                                {item.image_url && (
                                  <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0 bg-slate-100">
                                    <img
                                      src={item.image_url}
                                      alt={item.name}
                                      className="w-full h-full object-cover"
                                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                    />
                                  </div>
                                )}
                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 mb-0.5">
                                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 font-semibold uppercase">
                                      {item.type === 'hotel' ? '🏨' : item.type === 'flight' ? '✈️' : '🎯'} {item.type}
                                    </Badge>
                                  </div>
                                  <p className="text-sm font-semibold text-slate-800 truncate">{item.name}</p>
                                  <p className="text-[11px] text-slate-500 truncate">{item.details}</p>
                                </div>
                                {/* Quantity & Price */}
                                <div className="flex flex-col items-end gap-1.5 shrink-0">
                                  <p className="text-sm font-bold text-slate-800">
                                    ₹{(item.price * item.quantity).toLocaleString('en-IN')}
                                  </p>
                                  <div className="flex items-center gap-1">
                                    <button
                                      className="w-6 h-6 rounded-md border border-slate-200 flex items-center justify-center hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition-colors text-slate-500"
                                      onClick={() => {
                                        if (item.quantity <= 1) onRemoveFromCart?.(item.id);
                                        else onUpdateCartQty?.(item.id, -1);
                                      }}
                                    >
                                      {item.quantity <= 1 ? <Trash2 className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                                    </button>
                                    <span className="text-xs font-semibold w-5 text-center">{item.quantity}</span>
                                    <button
                                      className="w-6 h-6 rounded-md border border-slate-200 flex items-center justify-center hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-600 transition-colors text-slate-500"
                                      onClick={() => onUpdateCartQty?.(item.id, 1)}
                                    >
                                      <Plus className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}

                            {/* Itinerary Total */}
                            <div className="mt-4 p-4 rounded-xl bg-gradient-to-r from-emerald-50 to-cyan-50 border border-emerald-200">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-sm font-semibold text-emerald-800">
                                  Total ({cartCount} {cartCount === 1 ? 'item' : 'items'})
                                </span>
                                <span className="text-lg font-bold text-emerald-700">
                                  ₹{cart.reduce((s, c) => s + c.price * c.quantity, 0).toLocaleString('en-IN')}
                                </span>
                              </div>
                              <Button className="w-full mt-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-10 font-semibold shadow-lg shadow-emerald-200 gap-2">
                                <ClipboardList className="w-4 h-4" />
                                Confirm Itinerary
                              </Button>
                            </div>
                          </div>
                        )}
                   </div>
                )}
            </div>
        </ScrollArea>
        </div>

        {/* Toggle Button */}
        <div className={cn(
            "absolute top-1/2 -translate-y-1/2 z-50 transition-all duration-300",
            collapsed ? "left-0" : "left-[calc(100%-1px)] md:left-[749px] lg:left-[899px]"
        )}>
             <Button
                variant="outline"
                size="icon"
                className="rounded-r-full rounded-l-none shadow-md bg-background text-foreground hover:bg-muted border border-l-0 border-border h-10 w-6 flex items-center justify-center"
                onClick={() => setCollapsed(!collapsed)}
                title={collapsed ? "Show Results" : "Hide Results"}
            >
                {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </Button>
        </div>
    </div>
  );
}
