"use client";

import { SmartBundle, CartItem } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Plane,
  Hotel,
  Star,
  Clock,
  MapPin,
  Sparkles,
  TrendingDown,
  ShieldCheck,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface BundleCardProps {
  bundle: SmartBundle;
  rank: number;
  onAddToCart?: (item: CartItem) => void;
  isSelected?: boolean;
}

const TAG_COLORS: Record<string, string> = {
  "Best Value": "bg-emerald-100 text-emerald-700 border-emerald-200",
  "Near Airport": "bg-blue-100 text-blue-700 border-blue-200",
  "Perfect Match": "bg-purple-100 text-purple-700 border-purple-200",
  "Style Match": "bg-pink-100 text-pink-700 border-pink-200",
  "Great Timing": "bg-amber-100 text-amber-700 border-amber-200",
  "Premium": "bg-yellow-100 text-yellow-700 border-yellow-200",
  "Budget Friendly": "bg-lime-100 text-lime-700 border-lime-200",
};

function ScoreBar({ label, value, icon: Icon }: { label: string; value: number; icon: any }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2 text-xs">
      <Icon className="w-3 h-3 text-muted-foreground shrink-0" />
      <span className="w-20 text-muted-foreground truncate">{label}</span>
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-400" : "bg-slate-300"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 text-right font-medium text-slate-600">{pct}%</span>
    </div>
  );
}

export function BundleCard({ bundle, rank, onAddToCart, isSelected }: BundleCardProps) {
  const { hotel, flight, scores, totalScore, combinedPrice, savings, tags } = bundle;
  const matchPct = Math.round(totalScore * 100);

  const handleAddBoth = () => {
    if (!onAddToCart) return;
    // Add hotel
    onAddToCart({
      id: `hotel-${hotel.id}`,
      type: "hotel",
      name: hotel.name,
      price: hotel.price_per_night || 0,
      quantity: 1,
      image_url: hotel.image_url,
      details: `${hotel.city}, ${hotel.star_rating || hotel.rating}★`,
      originalData: hotel,
    });
    // Add flight
    onAddToCart({
      id: `flight-${flight.id}`,
      type: "flight",
      name: `${flight.airline} ${flight.flight_number || ""}`.trim(),
      price: flight.price,
      quantity: 1,
      details: `${flight.origin} → ${flight.destination}, ${flight.duration_hours}h`,
      originalData: flight,
    });
  };

  return (
    <div
      className={cn(
        "relative rounded-2xl border bg-white overflow-hidden transition-all duration-200 hover:shadow-lg",
        rank === 0
          ? "border-emerald-300 ring-2 ring-emerald-100 shadow-md"
          : "border-slate-200 hover:border-slate-300",
        isSelected && "ring-2 ring-blue-200 border-blue-300"
      )}
    >
      {/* Top ribbon for #1 */}
      {rank === 0 && (
        <div className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-[10px] font-bold px-3 py-1 flex items-center gap-1.5">
          <Sparkles className="w-3 h-3" />
          TOP PICK — {matchPct}% Match
        </div>
      )}

      <div className="p-4">
        {/* Header: Rank + Score + Tags */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            {rank > 0 && (
              <span className="text-xs font-bold text-slate-400">#{rank + 1}</span>
            )}
            <div className="flex flex-wrap gap-1">
              {tags.map((tag) => (
                <Badge
                  key={tag}
                  variant="outline"
                  className={cn("text-[10px] px-1.5 py-0 h-5 font-semibold border", TAG_COLORS[tag] || "bg-slate-100 text-slate-600")}
                >
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
          {rank > 0 && (
            <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
              {matchPct}%
            </span>
          )}
        </div>

        {/* Flight + Hotel Summary */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          {/* Flight */}
          <div className="bg-sky-50/60 rounded-xl p-3 border border-sky-100">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Plane className="w-3.5 h-3.5 text-sky-600" />
              <span className="text-[10px] font-bold uppercase text-sky-600">Flight</span>
            </div>
            <p className="text-sm font-semibold text-slate-800 truncate">{flight.airline}</p>
            <p className="text-xs text-slate-500">
              {flight.origin} → {flight.destination}
            </p>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-xs text-slate-500 flex items-center gap-0.5">
                <Clock className="w-3 h-3" />
                {flight.duration_hours}h
              </span>
              <span className="text-sm font-bold text-sky-700">
                ₹{flight.price?.toLocaleString("en-IN")}
              </span>
            </div>
          </div>

          {/* Hotel */}
          <div className="bg-emerald-50/60 rounded-xl p-3 border border-emerald-100">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Hotel className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-[10px] font-bold uppercase text-emerald-600">Hotel</span>
            </div>
            <p className="text-sm font-semibold text-slate-800 truncate">{hotel.name}</p>
            <div className="flex items-center gap-1 mt-0.5">
              {Array.from({ length: hotel.star_rating || hotel.rating || 0 }).map((_, i) => (
                <Star key={i} className="w-3 h-3 fill-amber-400 text-amber-400" />
              ))}
            </div>
            <span className="text-sm font-bold text-emerald-700 mt-1.5 block">
              ₹{hotel.price_per_night?.toLocaleString("en-IN")}/night
            </span>
          </div>
        </div>

        {/* Score Breakdown */}
        <div className="space-y-1.5 mb-3 px-1">
          <ScoreBar label="Airport Prox." value={scores.airportProximity} icon={MapPin} />
          <ScoreBar label="Star Match" value={scores.starRating} icon={Star} />
          <ScoreBar label="Value" value={scores.priceValue} icon={TrendingDown} />
          <ScoreBar label="Amenities" value={scores.amenityMatch} icon={ShieldCheck} />
          <ScoreBar label="Timing" value={scores.timeAlignment} icon={Clock} />
        </div>

        {/* Footer: Combined Price + Add Button */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
          <div>
            <p className="text-lg font-bold text-slate-800">
              ₹{combinedPrice?.toLocaleString("en-IN")}
            </p>
            <p className="text-[10px] text-slate-400">Flight + 1 Night</p>
            {savings > 0 && (
              <p className="text-xs font-semibold text-emerald-600 flex items-center gap-0.5 mt-0.5">
                <TrendingDown className="w-3 h-3" />
                Save ₹{savings.toLocaleString("en-IN")} vs avg
              </p>
            )}
          </div>
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-9 px-4 gap-1.5 font-semibold shadow-md shadow-emerald-100"
            onClick={handleAddBoth}
          >
            <Plus className="w-3.5 h-3.5" />
            Add Bundle
          </Button>
        </div>
      </div>
    </div>
  );
}
