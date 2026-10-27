// Recria o banco com dados de exemplo: 4 usuários, 5 equipamentos e 3 empréstimos.
// Nenhum usuário tem 2FA configurado, então todos passam pelo QR Code no primeiro login.
// Uso: npm run seed

const db = require('./config/database');
const { hashPassword } = require('./utils/password');
const { toISODate, addDays } = require('./utils/formatDate');

async function seed() {
  // Em produção as senhas vêm do ambiente; as senhas padrão só valem para desenvolvimento local
  const isProduction = process.env.NODE_ENV === 'production';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || (isProduction ? null : 'Admin@123');
  const techPassword = process.env.SEED_TECH_PASSWORD || (isProduction ? null : 'Tech@123');
  if (!adminPassword || !techPassword) {
    throw new Error('Em produção, defina SEED_ADMIN_PASSWORD e SEED_TECH_PASSWORD antes de rodar o seed');
  }

  const adminHash = await hashPassword(adminPassword);
  const techHash = await hashPassword(techPassword);

  const users = [
    { name: 'Administrador TI', email: 'admin@inventory.local', password_hash: adminHash, role: 'admin' },
    { name: 'Ana Souza', email: 'ana@inventory.local', password_hash: techHash, role: 'technician' },
    { name: 'Bruno Lima', email: 'bruno@inventory.local', password_hash: techHash, role: 'technician' },
    { name: 'Carla Mendes', email: 'carla@inventory.local', password_hash: techHash, role: 'technician' },
  ];

  const equipment = [
    { asset_tag: 'TI-0001', type: 'notebook', brand: 'Dell', model: 'Latitude 7440', serial_number: 'DL7440-8F2K1', value_usd: 1850, status: 'loaned', location: 'Almoxarifado TI - Sala 102' },
    { asset_tag: 'TI-0002', type: 'notebook', brand: 'Apple', model: 'MacBook Pro 14 M3', serial_number: 'C02XK3M9MD6T', value_usd: 2399, status: 'available', location: 'Almoxarifado TI - Sala 102' },
    { asset_tag: 'TI-0003', type: 'desktop', brand: 'Lenovo', model: 'ThinkCentre M90q', serial_number: 'LNV-M90Q-5521', value_usd: 1120, status: 'loaned', location: 'Almoxarifado TI - Sala 102' },
    { asset_tag: 'TI-0004', type: 'monitor', brand: 'LG', model: 'UltraFine 27UQ850', serial_number: 'LG27UQ-90331', value_usd: 549, status: 'available', location: 'Almoxarifado TI - Armário B' },
    { asset_tag: 'TI-0005', type: 'tablet', brand: 'Samsung', model: 'Galaxy Tab S9', serial_number: 'SMX710-77K2', value_usd: 799, status: 'maintenance', location: 'Bancada de manutenção' },
  ];

  const today = new Date();
  const loans = [
    // ativos: TI-0001 e TI-0003 estão emprestados
    { equipment_id: 1, technician_id: 2, borrower_name: 'João Pereira', destination_department: 'Financeiro', checkout_date: toISODate(addDays(today, -3)), expected_return_date: toISODate(addDays(today, 4)), returned_at: null, notes: 'Fechamento do trimestre', status: 'active' },
    { equipment_id: 3, technician_id: 3, borrower_name: 'Mariana Costa', destination_department: 'Recursos Humanos', checkout_date: toISODate(addDays(today, -10)), expected_return_date: toISODate(addDays(today, -1)), returned_at: null, notes: 'Treinamento de novos colaboradores', status: 'active' },
    // devolvido: TI-0002 voltou ao estoque
    { equipment_id: 2, technician_id: 4, borrower_name: 'Rafael Gomes', destination_department: 'Marketing', checkout_date: toISODate(addDays(today, -20)), expected_return_date: toISODate(addDays(today, -13)), returned_at: toISODate(addDays(today, -14)), notes: 'Evento externo', status: 'returned' },
  ];

  // Tudo ou nada: se algo falhar no meio, o banco não fica pela metade
  db.exec('BEGIN');
  try {
    db.exec('DELETE FROM loans; DELETE FROM equipment; DELETE FROM users; DELETE FROM sqlite_sequence;');

    const insertUser = db.prepare(
      'INSERT INTO users (name, email, password_hash, role) VALUES (:name, :email, :password_hash, :role)'
    );
    users.forEach((user) => insertUser.run(user));

    const insertEquipment = db.prepare(`
      INSERT INTO equipment (asset_tag, type, brand, model, serial_number, value_usd, status, location)
      VALUES (:asset_tag, :type, :brand, :model, :serial_number, :value_usd, :status, :location)
    `);
    equipment.forEach((item) => insertEquipment.run(item));

    const insertLoan = db.prepare(`
      INSERT INTO loans (equipment_id, technician_id, borrower_name, destination_department,
                         checkout_date, expected_return_date, returned_at, notes, status)
      VALUES (:equipment_id, :technician_id, :borrower_name, :destination_department,
              :checkout_date, :expected_return_date, :returned_at, :notes, :status)
    `);
    loans.forEach((loan) => insertLoan.run(loan));

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  console.log(`Seed concluído: ${users.length} usuários, ${equipment.length} equipamentos, ${loans.length} empréstimos.`);
}

seed().catch((err) => {
  console.error('Falha no seed:', err);
  process.exit(1);
});
