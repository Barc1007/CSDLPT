# Distributed Database Project Proposal

**Due Date**: [Insert Date - Week 3]  
**Project ID & Category**: #19: Sort-Merge Join — Category 2 (Query Processing)

---

## 1. Project Identity

- **Team Name**: [Tên nhóm của bạn]
- **Team Members**: [Họ tên thành viên 1], [Họ tên thành viên 2]
- **Project Title**: Sort-Merge Join for Distributed Sites — Concurrent Sorting and Coordinated Merge on Book-Authors Dataset

---

## 2. Objective & Problem Statement

- **The "Why"**: In distributed databases, data is often fragmented across multiple sites. When performing a join operation (e.g., Books ⋈ Authors), the naive approach of collecting all data to one site for sorting is inefficient. We investigate whether **sorting in parallel at each site** before performing a coordinated merge can achieve meaningful speedup, and we compare **two data transfer strategies** for the merge phase.

- **Core Logic**: We implement the **Sort-Merge Join** algorithm in a distributed setting:
  1. **Parallel Sort Phase**: Both Site 1 (Books) and Site 2 (Authors) sort their local data by the join key (`author_id`) concurrently.
  2. **Coordinated Merge Phase**: The sorted data is transferred and merged using one of two strategies:
     - **Strategy A**: Site 1 sends sorted Books → Site 2 performs merge join locally.
     - **Strategy B**: Both sites send sorted data → Site 3 (Coordinator) performs merge join.
  3. **Baseline Comparison**: All data is collected at one site and sorted sequentially for comparison.

---

## 3. Dataset Specification

- **Source**: [Goodreads Books Dataset](https://www.kaggle.com/jealousleopard/goodreadsbooks) (Kaggle)
- **Size**: ~1.5 MB raw data, 11,127 book records + 4,219 unique author records
- **Schema**:

  | Table | Key Attributes |
  |-------|---------------|
  | **Books** (Site 1) | `book_id`, `title`, `author_id` (FK), `isbn`, `language_code`, `num_pages`, `average_rating`, `ratings_count`, `publication_date`, `publisher` |
  | **Authors** (Site 2) | `author_id` (PK), `name`, `books_count` |

- **Fragmentation Strategy**: **Vertical fragmentation** — The original dataset is split into two tables by attribute groups. Books are stored at Site 1, Authors at Site 2. Both fragments are linked by the `author_id` join key. Data at each site is intentionally **unsorted** (randomly shuffled) to demonstrate the sorting process.

---

## 4. System Architecture

- **Nodes**: 3 sites simulated as separate Node.js processes on localhost.

  | Site | Port | Role |
  |------|------|------|
  | Site 1 | 5001 | Stores Books, performs local sort |
  | Site 2 | 5002 | Stores Authors, performs local sort, executes Strategy A merge |
  | Site 3 | 5003 | Coordinator, executes Strategy B merge, stores results |

- **Communication Layer**: HTTP/REST APIs using Express.js framework. Sites communicate via JSON payloads over HTTP POST/GET requests. Axios is used as the HTTP client.

- **Storage**: Data is stored as CSV files on each site's local filesystem (`site1/data/books.csv`, `site2/data/authors.csv`). Results are saved as CSV and JSON files.

---

## 5. Tech Stack & Implementation Plan

- **Programming Language**: JavaScript (Node.js v18+)
- **Deployment**: Localhost — 3 separate Node.js processes (can be extended to Docker containers)
- **Libraries/Frameworks**:
  - Express.js — REST API framework
  - Axios — HTTP client for inter-site communication
  - csv-parse / csv-stringify — CSV data processing
  - cors — Cross-origin resource sharing

---

## 6. Success Metrics & Analysis

- **Quantitative Metrics**:
  - **Sort Speedup** = `T_sequential_sort / T_parallel_sort` — Measures the benefit of sorting in parallel across 2 sites vs. sorting sequentially at 1 site.
  - **Total Execution Time** for Strategy A, Strategy B, and Baseline.
  - **Data Transfer Cost** — Time spent sending data between sites.

- **The "Failure" Scenario**: We simulate the following distributed failures:
  1. **Site Crash**: Kill Site 2 (Authors) mid-operation → system detects the failure via health check, retries 3 times (5s timeout each), and reports the error with recovery instructions.
  2. **Network Delay**: Introduce artificial 10s delay on Site 2 → Strategy A times out → system automatically falls back to Strategy B (merge at Coordinator Site 3).
  3. **Recovery**: Restart crashed site → system detects recovery via health check and resumes normal operation.

---

## 7. Project Milestones

| Milestone | Week | Deliverable |
|-----------|------|-------------|
| Milestone 1 | Week 5 | Environment setup, data fragmentation complete. 3 sites running with CSV data loaded. |
| Milestone 2 | Week 8 | Core Sort-Merge Join algorithm operational. Both Strategy A and B implemented and tested. Benchmark script complete. |
| Milestone 3 | Week 12 | Failure handling implemented (crash detection, retry, fallback). Benchmarking complete. Analysis report and screen recording delivered. |
