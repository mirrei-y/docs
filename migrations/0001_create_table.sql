CREATE TABLE IF NOT EXISTS pixels (
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    color TEXT NOT NULL DEFAULT '#E0E0E0',
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (x, y)
);
