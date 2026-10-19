// Tabela de empréstimos: liga um equipamento ao técnico que registrou a saída.

const STATUSES = ['active', 'returned'];

const createTableSql = `
  CREATE TABLE IF NOT EXISTS loans (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    equipment_id            INTEGER NOT NULL REFERENCES equipment(id),
    technician_id           INTEGER NOT NULL REFERENCES users(id),
    borrower_name           TEXT    NOT NULL,          -- quem recebeu o equipamento
    destination_department  TEXT    NOT NULL,          -- setor para onde foi
    checkout_date           TEXT    NOT NULL,          -- AAAA-MM-DD
    expected_return_date    TEXT    NOT NULL,          -- AAAA-MM-DD (calculada pulando feriados)
    returned_at             TEXT,                      -- AAAA-MM-DD; NULL enquanto não devolvido
    notes                   TEXT,
    status                  TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'returned'))
  )
`;

module.exports = { tableName: 'loans', STATUSES, createTableSql };
