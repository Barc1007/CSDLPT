const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

// ============================================================
// prepare_data.js
// Tach Goodreads books.csv -> Books (Site 1) + Authors (Site 2)
// Ca 2 file output deu UNSORTED (shuffle ngau nhien)
// ============================================================

const RAW_CSV_PATH = path.join(__dirname, 'books.csv', 'books.csv');

// Doc CSV goc
console.log('Doc Goodreads dataset...');
const rawContent = fs.readFileSync(RAW_CSV_PATH, 'utf-8');
const records = parse(rawContent, {
  columns: true,
  skip_empty_lines: true,
  trim: true,
  relax_column_count: true,
  relax_quotes: true,
  quote: false,
  escape: false,
  skip_records_with_error: true,
});

console.log(`   Tong so records: ${records.length}`);

// --- Buoc 1: Trich xuat danh sach Authors duy nhat ---
const authorMap = new Map(); // name -> author_id
let authorIdCounter = 1;

for (const row of records) {
  // Cot "authors" co the chua nhieu tac gia: "Author1/Author2"
  // Lay tac gia dau tien (primary author)
  const authorName = (row.authors || '').split('/')[0].trim();
  if (authorName && !authorMap.has(authorName)) {
    authorMap.set(authorName, authorIdCounter++);
  }
}

console.log(`Tong so authors duy nhat: ${authorMap.size}`);

// --- Buoc 2: Tao bang Authors ---
const authors = [];
for (const [name, id] of authorMap) {
  authors.push({
    author_id: id,
    name: name,
    books_count: 0, // se cap nhat sau
  });
}

// --- Buoc 3: Tao bang Books voi author_id ---
const books = [];
const bookCountByAuthor = new Map();

for (const row of records) {
  const authorName = (row.authors || '').split('/')[0].trim();
  const authorId = authorMap.get(authorName);
  if (!authorId) continue;

  books.push({
    book_id: parseInt(row.bookID) || books.length + 1,
    title: row.title || 'Unknown',
    author_id: authorId,
    isbn: row.isbn || '',
    language_code: row.language_code || 'eng',
    num_pages: parseInt(row['  num_pages']) || parseInt(row.num_pages) || 0,
    average_rating: parseFloat(row.average_rating) || 0,
    ratings_count: parseInt(row.ratings_count) || 0,
    publication_date: row.publication_date || '',
    publisher: row.publisher || '',
  });

  // Dem so sach moi tac gia
  bookCountByAuthor.set(authorId, (bookCountByAuthor.get(authorId) || 0) + 1);
}

// Cap nhat books_count cho authors
for (const author of authors) {
  author.books_count = bookCountByAuthor.get(author.author_id) || 0;
}

console.log(`Tong so books hop le: ${books.length}`);

// --- Buoc 4: Shuffle (xao tron) de dam bao UNSORTED ---
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

shuffle(books);
shuffle(authors);

// --- Buoc 5: Luu file CSV ---
// Tao thu muc neu chua co
const site1DataDir = path.join(__dirname, 'site1', 'data');
const site2DataDir = path.join(__dirname, 'site2', 'data');
fs.mkdirSync(site1DataDir, { recursive: true });
fs.mkdirSync(site2DataDir, { recursive: true });

// Ghi Books CSV
const booksCsv = stringify(books, { header: true });
fs.writeFileSync(path.join(site1DataDir, 'books.csv'), booksCsv);
console.log(`Saved: site1/data/books.csv (${books.length} rows)`);

// Ghi Authors CSV
const authorsCsv = stringify(authors, { header: true });
fs.writeFileSync(path.join(site2DataDir, 'authors.csv'), authorsCsv);
console.log(`Saved: site2/data/authors.csv (${authors.length} rows)`);

// --- Thong ke ---
console.log('\nThong ke:');
console.log(`   Books: ${books.length} rows`);
console.log(`   Authors: ${authors.length} rows`);
console.log(`   Join key: author_id`);
console.log(`   Du lieu da duoc SHUFFLE (unsorted)`);
console.log('\nHoan tat! San sang chay 3 sites.');
