import os
import csv
from datetime import datetime, timezone
from firebase_config import db

# Resolve paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(BASE_DIR, "dataset", "BooksDatasetClean.csv")


def seed_books():
    if not os.path.exists(CSV_PATH):
        raise FileNotFoundError(f"Dataset not found at {CSV_PATH}")

    books_to_add = []
    count = 0

    with open(CSV_PATH, mode="r", encoding="utf-8", errors="ignore") as f:
        reader = csv.DictReader(f)
        for row in reader:
            title = (row.get("Title") or "").strip()
            authors = (row.get("Authors") or "").strip()
            category = (row.get("Category") or "").strip()

            # 1. Filter for rows that have non-empty Title, Authors, and Category
            if not title or not authors or not category:
                continue

            # 2. Clean leading 'By ' from Authors if present
            if authors.lower().startswith("by "):
                authors = authors[3:].strip()

            count += 1

            # 3. Generate sequential ISBN, RFID tag, and copy quantities
            isbn = f"978-00000{1000 + count}"
            rfid_tag = f"RFID-{1000 + count}"

            book_doc = {
                "title": title,
                "author": authors,
                "category": category,
                "isbn": isbn,
                "rfid_tag": rfid_tag,
                "total_copies": 3,
                "available_copies": 3,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            books_to_add.append(book_doc)

            # Limit to first 50 qualified books
            if count == 50:
                break

    # 4. Use Firestore batch write (db.batch()) to upload all books in a single atomic request
    batch = db.batch()
    books_ref = db.collection("books")

    for book in books_to_add:
        doc_ref = books_ref.document()
        batch.set(doc_ref, book)

    batch.commit()
    print("Successfully seeded 50 books into Firestore!")


if __name__ == "__main__":
    seed_books()
