const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const env = require('./env');
const User = require('../models/User');
const Equipment = require('../models/Equipment');
const Loan = require('../models/Loan');

fs.mkdirSync(path.dirname(env.databasePath), { recursive: true });

const db = new DatabaseSync(env.databasePath);

db.exec('PRAGMA foreign_keys = ON');

for (const model of [User, Equipment, Loan]) {
  db.exec(model.createTableSql);
}

module.exports = db;
