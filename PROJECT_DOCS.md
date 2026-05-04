# SafarAI (Voyehack) - Project Documentation & Presentation Reference

This document provides a detailed overview of SafarAI, its architecture, and key features. It is designed to serve as a reference for creating presentations, technical documentation, and project showcases.

---

## 1. Project Overview

**Project Name:** SafarAI (Voyehack)
**Tagline:** "Your Intelligent AI Travel Companion"
**Objective:** To revolutionize travel planning by combining Generative AI with real-time travel inventory, allowing users to plan complex trips using simple natural language.

---

## 2. Problem Statement (Why we built this)

*   **Complex Booking Processes:** Users usually have to visit multiple websites (flights, hotels, activities) to plan a single trip.
*   **Information Overload:** Filtering through thousands of options is overwhelming.
*   **Lack of Personalization:** Traditional search engines don't understand context (e.g., "romantic trip" vs. "business trip").
*   **Rigid Interfaces:** Dropdown menus and date pickers are often tedious for flexible planning.

---

## 3. The Solution

SafarAI solves these problems by:
*   **Understanding Natural Language:** Users can speak or type freely (e.g., *"Plan a 5-day trip to Bali for me and my wife next month"*).
*   **Smart Orchestration:** The AI Agent intelligently breaks down the request into flight, hotel, and activity searches.
*   **Unified Interface:** Results are presented in a cohesive dashboard with an interactive map, not just a list of links.

---

## 4. Key Features (For Slides)

### 🧠 **AI-Powered Intelligence**
*   **Powered by Google Gemini:** Uses Gemini 2.0 Flash / 1.5 Flash for high-speed, low-latency reasoning.
*   **Intent Recognition:** Automatically detects destinations, travel dates, budget constraints, and traveler count from a conversation.
*   **Context Awareness:** Understands implicit requirements (e.g., "family trip" implies kid-friendly hotels).

### 🌐 **Real-Time Travel Inventory**
*   **TBO API Integration:** Fetches live data for hotels and flights.
*   **Amadeus API Support:** Backup/Alternative provider for comprehensive flight coverage.
*   **City & Code Resolution:** Smart algorithms to map city names (e.g., "NYC") to airport codes (JFK/EWR) and hotel city codes.

### 🎨 **Modern User Experience**
*   **Conversational UI:** A "ChatGPT-like" assistant that stays with you throughout the booking flow.
*   **Voice Search:** Integrated voice input for hands-free planning.
*   **Interactive Map View:** Visualizes flight paths and hotel locations on a dynamic map.
*   **Smart Filters:** Dynamic filters based on search results (Price ranges, Star ratings, Airline preferences).

---

## 5. System Architecture

### **High-Level Data Flow**

```mermaid
graph TD
    User[User (Frontend)] -->|1. Enters Natural Language Query| Backend[Node.js Backend]
    Backend -->|2. Sends Prompt| Gemini[Google Gemini AI]
    Gemini -->|3. Returns Structured Intent (JSON)| Backend
    
    subgraph Agent_Service [Agent Service Layer]
        Backend -->|4. Orchestrates Search| SearchEngine[Search Engine]
        SearchEngine -->|5. Fetches Data| TBO[TBO Holidays API]
        SearchEngine -->|5. Fetches Data| Amadeus[Amadeus API]
    end
    
    TBO -->|6. Raw Inventory| SearchEngine
    Amadeus -->|6. Raw Inventory| SearchEngine
    
    SearchEngine -->|7. Aggregated Results| Backend
    Backend -->|8. Trip Plan JSON| User
```

### **Tech Stack Details**

### **Frontend (Client-Side)**
*   **Next.js 15 (App Router):** Ensures fast loading and SEO optimization.
*   **React Server Components:** Efficient data fetching.
*   **Tailwind CSS & Shadcn UI:** Beautiful, responsive, and accessible design.
*   **Zustand:** Lightweight state management for handling the trip plan data.

### **Backend (Server-Side)**
*   **Node.js & Express:** Robust REST API handling client requests.
*   **Agent Service:** The "Brain" of the application. It receives user text → calls Gemini to extract JSON → triggers TBO/Amadeus APIs -> returns structured results.
*   **Caching Strategy:** (Future Scope) Caching frequently searched routes to reduce API costs.

---

## 6. How It Works (User Journey)

1.  **Input:** User says "Find flights to Dubai for next weekend."
2.  **Processing:**
    *   Backend receives the text.
    *   Gemini AI analyzes the text and extracts: `{ destination: "DXB", date: "Next Friday" }`.
    *   Backend converts "Next Friday" to an actual date like `2026-03-06`.
3.  **Execution:** The backend calls the TBO Flight API with these parameters.
4.  **Response:** The raw API data is formatted into a clean JSON structure.
5.  **Display:** The Frontend displays the flights on cards and plots the route on the map.

---

## 7. Future Roadmap

*   **Booking Management:** Full end-to-end booking (Payment Gateway integration).
*   **Itinerary Builder:** Drag-and-drop feature to create day-by-day plans.
*   **Multi-City search:** Support for "Delhi -> London -> Paris -> Delhi".
*   **User Profiles:** Save preferences and past trips.
