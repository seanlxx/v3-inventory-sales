PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS vending_record_image_chunks (
  store TEXT NOT NULL,
  record_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
  chunk_base64 TEXT NOT NULL,
  PRIMARY KEY (store, record_id, chunk_index),
  FOREIGN KEY (store, record_id)
    REFERENCES vending_record_images (store, record_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vending_record_image_chunks_record
  ON vending_record_image_chunks (store, record_id, chunk_index);
