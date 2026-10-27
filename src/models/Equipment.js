const TYPES = ['notebook', 'desktop', 'monitor', 'tablet', 'projector'];
const STATUSES = ['available', 'loaned', 'maintenance'];

const createTableSql = `
  CREATE TABLE IF NOT EXISTS equipment (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_tag      TEXT    NOT NULL UNIQUE,            -- número de patrimônio, ex.: TI-0001
    type           TEXT    NOT NULL CHECK (type IN ('notebook', 'desktop', 'monitor', 'tablet', 'projector')),
    brand          TEXT    NOT NULL,
    model          TEXT    NOT NULL,
    serial_number  TEXT    NOT NULL UNIQUE,
    value_usd      REAL    NOT NULL CHECK (value_usd >= 0),
    status         TEXT    NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'loaned', 'maintenance')),
    location       TEXT    NOT NULL,
    created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
  )
`;

module.exports = { tableName: 'equipment', TYPES, STATUSES, createTableSql };
