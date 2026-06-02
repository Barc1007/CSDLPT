# Sort-Merge Join for Distributed Sites — "Book-Authors"

**Topic 19** — Distributed Database Final Project
Implement a distributed sort-merge join where two sites sort their local data concurrently, then perform a coordinated merge.

## System Architecture

```
Site 1 (:5001) Books      Site 2 (:5002) Authors
     |                          |
     | --- Strategy A --------> | merge-join at Site 2
     |                          |
     | --- Strategy B --->  Site 3 (:5003) Coordinator
     |                      merge-join here
```

- **Strategy A**: Sort song song -> gui sorted Books -> Site 2 merge voi local Authors
- **Strategy B**: Sort song song -> gui ca 2 sorted data -> Site 3 merge
- **Baseline**: Gop raw data -> sort tuan tu tai 1 site

## Quick Start

```bash
# 1. Cai dependencies
npm install

# 2. Chuan bi du lieu (chay 1 lan)
node prepare_data.js

# 3. Khoi chay 3 sites
node run_all.js

# 4. (Terminal moi) Chay benchmark
node benchmark.js

# 5. (Terminal moi) Chay failure demo
node failure_demo.js
```

## Project Structure

```
CSDLPT/
├── prepare_data.js        # Tach Goodreads CSV -> Books + Authors
├── run_all.js             # Khoi chay 3 sites
├── benchmark.js           # Do hieu nang
├── failure_demo.js        # Demo xu ly loi
├── shared/merge_join.js   # Thuat toan merge-join dung chung
├── site1/server.js        # Books Site (port 5001)
├── site2/server.js        # Authors Site (port 5002)
├── site3/server.js        # Coordinator (port 5003)
```

## Dataset

- **Source**: [Goodreads Books](https://www.kaggle.com/jealousleopard/goodreadsbooks) (Kaggle)
- **Books**: 11,127 records | **Authors**: 4,219 records | **Join key**: `author_id`

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js v18+ |
| Framework | Express.js |
| HTTP Client | Axios |
| Data Format | CSV |
| Communication | REST API (HTTP) |

## Members
- **Thành viên thực hiện** : Nguyễn Hữu Đạt
- **MSSV** : N23DCCN077
- **Môn học**: Cơ sở dữ liệu phân tán
