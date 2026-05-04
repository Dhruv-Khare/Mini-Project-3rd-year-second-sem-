/**
 * Centralized configuration — all env vars and constants in one place.
 * Import this instead of reading process.env directly in services.
 */
import dotenv from "dotenv";
dotenv.config();

const config = {
  // ─── Server ────────────────────────────
  port: parseInt(process.env.PORT, 10) || 8000,
  nodeEnv: process.env.NODE_ENV || "development",
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3000",

  // ─── Gemini AI ─────────────────────────
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || "",
    model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
  },

  // ─── TBO Hotels ────────────────────────
  tbo: {
    username: process.env.TBO_USERNAME || "",
    password: process.env.TBO_PASSWORD || "",
  },

  // ─── TBO Air ───────────────────────────
  tboAir: {
    username: process.env.TBO_AIR_USERNAME || "",
    password: process.env.TBO_AIR_PASSWORD || "",
  },

  // ─── Pinecone Vector DB ────────────────
  pinecone: {
    apiKey: process.env.PINECONE_API_KEY || "",
  },

  // ─── Defaults ──────────────────────────
  defaults: {
    origin: process.env.DEFAULT_ORIGIN || "DEL",
    nationality: process.env.DEFAULT_NATIONALITY || "IN",
  },

  // ─── Constants ─────────────────────────
  USD_TO_INR: parseFloat(process.env.USD_TO_INR) || 84.5,
};

export default config;
