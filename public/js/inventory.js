const STATUS_LABELS = {
  available: ['Disponível', 'ok'],
  loaned: ['Emprestado', 'warn'],
  maintenance: ['Manutenção', 'bad'],
};
const loanMessage = document.getElementById('loan-message');
const listMessage = document.getElementById('list-message');

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

async function loadEquipment() {
  const items = await protectedApi('GET', '/api/equipment');

  const rate = items[0]?.exchange_rate;
  document.getElementById('exchange-rate').textContent = rate
    ? `Cotação USD→BRL: ${rate.usd_brl} (${rate.source}, ${rate.quoted_at})${rate.stale ? ' — desatualizada' : ''}`
    : 'Cotação indisponível no momento.';

  document.getElementById('equipment').replaceChildren(
    ...items.map((item) => {
      const [label, css] = STATUS_LABELS[item.status];
      return el(
        'tr',
        {},
        el('td', {}, item.asset_tag),
        el('td', {}, item.type),
        el('td', {}, `${item.brand} ${item.model}`),
        el('td', {}, item.serial_number),
        el('td', {}, usd.format(item.value_usd)),
        el('td', {}, item.value_brl === null ? '-' : brl.format(item.value_brl)),
        el('td', {}, el('span', { class: `badge ${css}` }, label)),
        el('td', {}, item.location)
      );
    })
  );

  const available = items.filter((item) => item.status === 'available');
  document.getElementById('equipment-id').replaceChildren(
    ...available.map((item) => el('option', { value: item.id }, `${item.asset_tag} — ${item.brand} ${item.model}`))
  );
}

async function loadLoans() {
  const loans = await protectedApi('GET', '/api/loans');
  document.getElementById('loans').replaceChildren(
    ...loans.map((loan) => {
      const status = loan.status === 'returned'
        ? el('span', { class: 'badge' }, 'Devolvido')
        : el('span', { class: `badge ${loan.is_overdue ? 'bad' : 'warn'}` }, loan.is_overdue ? 'Atrasado' : 'Ativo');
      const action = loan.status === 'active'
        ? el('button', { class: 'small', onclick: () => returnLoan(loan) }, 'Devolver')
        : '';

      return el(
        'tr',
        {},
        el('td', {}, String(loan.id)),
        el('td', {}, `${loan.equipment_asset_tag} — ${loan.equipment_description}`),
        el('td', {}, loan.borrower_name),
        el('td', {}, loan.destination_department),
        el('td', {}, formatDate(loan.checkout_date)),
        el('td', {}, formatDate(loan.expected_return_date)),
        el('td', {}, formatDate(loan.returned_at)),
        el('td', {}, loan.technician_name),
        el('td', {}, status),
        el('td', {}, action)
      );
    })
  );
}

async function returnLoan(loan) {
  try {
    await protectedApi('PATCH', `/api/loans/${loan.id}/return`);
    showMessage(listMessage, `Devolução do ${loan.equipment_asset_tag} registrada.`, 'success');
    await Promise.all([loadEquipment(), loadLoans()]);
  } catch (error) {
    showMessage(listMessage, error.message);
  }
}

document.getElementById('loan-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const botao = event.target.querySelector('button[type="submit"]');
  botao.disabled = true;
  try {
    const loan = await protectedApi('POST', '/api/loans', {
      equipment_id: Number(document.getElementById('equipment-id').value),
      borrower_name: document.getElementById('borrower').value,
      destination_department: document.getElementById('department').value,
      business_days: Number(document.getElementById('days').value),
      notes: document.getElementById('notes').value || undefined,
    });

    let text = `Empréstimo registrado. Devolução prevista: ${formatDate(loan.expected_return_date)}.`;
    if (loan.skipped_holidays.length) {
      text += ` Feriados considerados: ${loan.skipped_holidays.map((h) => `${formatDate(h.date)} (${h.name})`).join(', ')}.`;
    }
    if (!loan.holidays_checked) text += ' (Feriados não verificados: BrasilAPI indisponível.)';

    event.target.reset();
    showMessage(loanMessage, text, 'success');
    await Promise.all([loadEquipment(), loadLoans()]);
  } catch (error) {
    showMessage(loanMessage, error.message);
  } finally {
    botao.disabled = false;
  }
});

(async () => {
  const session = await requireSession('technician');
  if (!session) return;
  setupHeader(session);
  await Promise.all([loadEquipment(), loadLoans()]);
})();
