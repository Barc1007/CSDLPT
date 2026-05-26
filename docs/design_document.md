# Design Document — Sort-Merge Join for Distributed Sites

## 1. System Overview

This system implements a **distributed Sort-Merge Join** across 3 simulated database sites. The goal is to join the `Books` table (Site 1) with the `Authors` table (Site 2) on the `author_id` key, comparing two merge strategies and measuring the speedup of parallel sorting vs. sequential sorting.

### High-Level Architecture

```
                    ┌───────────────────────────────┐
                    │        Client / Benchmark     │
                    │      (benchmark.js)           │
                    └──────┬──────────┬─────────────┘
                           │          │
              ┌────────────▼──┐  ┌────▼────────────┐
              │  Site 1       │  │  Site 2          │
              │  Port 5001    │  │  Port 5002       │
              │               │  │                  │
              │  books.csv    │  │  authors.csv     │
              │  (unsorted)   │  │  (unsorted)      │
              │               │  │                  │
              │  POST /sort   │  │  POST /sort      │
              │  → sorted     │  │  → sorted        │
              │    books      │  │    authors       │
              └──────┬────────┘  └────┬─────────────┘
                     │                │
         ┌───────────┼────────────────┼──────────┐
         │           │   Strategy B   │          │
         │    ┌──────▼────────────────▼───────┐  │
         │    │         Site 3               │  │
         │    │         Port 5003            │  │
         │    │         Coordinator          │  │
         │    │                              │  │
         │    │    POST /merge-join          │  │
         │    │    POST /single-sort-join    │  │
         │    │    (baseline)                │  │
         │    └──────────────────────────────┘  │
         └──────────────────────────────────────┘
```

### Data Flow — Two Strategies

**Strategy A** — Merge at data site:
```
Site 1: sort(Books) ──sorted books──▶ Site 2: merge-join(sorted_books, local_sorted_authors) → Result
```

**Strategy B** — Merge at coordinator:
```
Site 1: sort(Books) ──sorted books──▶ Site 3: merge-join(sorted_books, sorted_authors) → Result
Site 2: sort(Authors) ─sorted authors─▶ ↑
```

**Baseline** — No distribution:
```
Site 3: receives raw Books + Authors → sort(Books) → sort(Authors) → merge-join → Result
```

---

## 2. Core Algorithm: Sort-Merge Join

The Sort-Merge Join operates in two phases:

### Phase 1: Parallel Sort
Both sites sort their local data by `author_id` using JavaScript's built-in `Array.sort()` (TimSort, O(n log n)):

```javascript
// Site 1 and Site 2 execute concurrently via Promise.all()
const [booksResult, authorsResult] = await Promise.all([
    axios.post('http://site1:5001/sort'),   // Sort books by author_id
    axios.post('http://site2:5002/sort'),   // Sort authors by author_id
]);
// Parallel sort time = max(T_sort_site1, T_sort_site2)
```

### Phase 2: Merge Join
A two-pointer algorithm performs the equi-join in O(n + m) time:

```javascript
function mergeJoin(sortedBooks, sortedAuthors) {
    let i = 0, j = 0;
    while (i < sortedBooks.length && j < sortedAuthors.length) {
        if (books[i].author_id === authors[j].author_id) {
            // Match found — emit joined record
            // Handle duplicates on both sides
        } else if (books[i].author_id < authors[j].author_id) {
            i++;  // Advance books pointer
        } else {
            j++;  // Advance authors pointer
        }
    }
}
```

**Complexity**: O(B log B + A log A + B + A), where B = |Books|, A = |Authors|.

---

## 3. Communication Protocol

All inter-site communication uses **REST APIs over HTTP** with JSON payloads:

| Request | Payload Size | Purpose |
|---------|-------------|---------|
| `POST /sort` | ~0 (trigger) → ~2MB response | Trigger local sort, receive sorted data |
| `POST /merge-join` | ~2MB (sorted data) | Send sorted data for merge |
| `GET /status` | ~100 bytes | Health check |

**Timeout**: 5,000ms per request.  
**Retry Policy**: Maximum 3 attempts with 2,000ms delay between retries.

---

## 4. Failure Handling Design

The system implements 4 fault-tolerance mechanisms:

| Mechanism | Implementation |
|-----------|---------------|
| **Health Check** | `GET /status` before every operation. If site responds within 2s → online. |
| **Timeout** | All HTTP requests have 5s timeout via Axios. Prevents indefinite blocking. |
| **Retry with Backoff** | On failure, retry up to 3 times with 2s delay. Handles transient network issues. |
| **Strategy Fallback** | If Strategy A fails (Site 2 down/slow) → automatically fall back to Strategy B (merge at Site 3). |

### Failure Simulation Endpoints (for demo):
- `POST /simulate-crash` — Shuts down the site process after configurable delay
- `POST /simulate-delay` — Adds artificial latency to all endpoints
- `POST /recover` — Removes artificial latency

---

## 5. Design Decisions & Justification

| Decision | Rationale |
|----------|-----------|
| **REST over WebSocket** | Simpler to implement and debug. Sort-merge join is request-response pattern, not streaming. Sufficient for the dataset size. |
| **CSV storage** | Lightweight, no database setup needed. Appropriate for ~11K records. Easy to inspect and verify data. |
| **3 separate processes** | Simulates real distributed sites with network overhead (HTTP). More realistic than in-memory simulation. |
| **JavaScript TimSort** | O(n log n) average case. Built-in, no external dependency. Consistent across sites. |
| **JSON payloads** | Human-readable, easy to debug. Overhead is acceptable for ~11K records (~2MB per transfer). |
