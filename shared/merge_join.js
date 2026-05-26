// ============================================================
// shared/merge_join.js — Thuật toán Sort-Merge Join dùng chung
// Tránh duplicate code giữa site2 và site3
// ============================================================

function mergeJoin(sortedBooks, sortedAuthors) {
  const result = [];
  let i = 0;
  let j = 0;

  while (i < sortedBooks.length && j < sortedAuthors.length) {
    const bookAuthorId = parseInt(sortedBooks[i].author_id);
    const authorId = parseInt(sortedAuthors[j].author_id);

    if (bookAuthorId === authorId) {
      const matchStart = j;

      // Duyệt tất cả books có cùng author_id
      while (i < sortedBooks.length && parseInt(sortedBooks[i].author_id) === authorId) {
        j = matchStart;
        // Duyệt tất cả authors có cùng author_id (thường chỉ 1)
        while (j < sortedAuthors.length && parseInt(sortedAuthors[j].author_id) === authorId) {
          result.push({
            book_id: sortedBooks[i].book_id,
            title: sortedBooks[i].title,
            author_id: authorId,
            author_name: sortedAuthors[j].name,
            isbn: sortedBooks[i].isbn,
            language_code: sortedBooks[i].language_code,
            num_pages: sortedBooks[i].num_pages,
            average_rating: sortedBooks[i].average_rating,
            ratings_count: sortedBooks[i].ratings_count,
            publication_date: sortedBooks[i].publication_date,
            publisher: sortedBooks[i].publisher,
            books_count: sortedAuthors[j].books_count,
          });
          j++;
        }
        i++;
      }
    } else if (bookAuthorId < authorId) {
      i++;
    } else {
      j++;
    }
  }

  return result;
}

module.exports = mergeJoin;
