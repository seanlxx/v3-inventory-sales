import { newId } from './validators.js';

function command(sql, params = []) {
  return { sql, params };
}

export function replacePurchaseItemCommands(recordId, items, date, timestamp) {
  const commands = [
    command("DELETE FROM cost_snapshots WHERE source_type = 'purchase_item' AND source_record_id = ?", [recordId]),
    command('DELETE FROM purchase_record_items WHERE purchase_record_id = ?', [recordId])
  ];

  for (const item of items) {
    const itemId = `pri:manual:${newId()}`;
    commands.push(
      command(`
        INSERT INTO purchase_record_items (
          id, purchase_record_id, product_global_id, quantity, unit_cost_cents, total_cost_cents, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [itemId, recordId, item.productGlobalId, item.quantity, item.unitCostCents, item.totalCostCents, timestamp]),
      command(`
        INSERT INTO cost_snapshots (
          id, product_global_id, source_type, source_record_id, source_item_id,
          unit_cost_cents, quantity_context, total_cost_cents, effective_at, created_at
        )
        VALUES (?, ?, 'purchase_item', ?, ?, ?, ?, ?, ?, ?)
      `, [
        `cs:purchase:${itemId}`,
        item.productGlobalId,
        recordId,
        itemId,
        item.unitCostCents,
        item.quantity,
        item.totalCostCents,
        date,
        timestamp
      ])
    );
  }

  return commands;
}

export function replaceSalesItemCommands(recordId, items, date, timestamp) {
  const commands = [
    command("DELETE FROM cost_snapshots WHERE source_type = 'sale_item' AND source_record_id = ?", [recordId]),
    command('DELETE FROM sales_record_items WHERE sales_record_id = ?', [recordId])
  ];

  for (const item of items) {
    const itemId = `sri:manual:${newId()}`;
    commands.push(
      command(`
        INSERT INTO sales_record_items (
          id, sales_record_id, product_global_id, quantity, unit_price_cents,
          line_amount_cents, unit_cost_cents, line_cogs_cents, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        itemId,
        recordId,
        item.productGlobalId,
        item.quantity,
        item.unitPriceCents,
        item.lineAmountCents,
        item.unitCostCents,
        item.lineCogsCents,
        timestamp
      ]),
      command(`
        INSERT INTO cost_snapshots (
          id, product_global_id, source_type, source_record_id, source_item_id,
          unit_cost_cents, quantity_context, total_cost_cents, effective_at, created_at
        )
        VALUES (?, ?, 'sale_item', ?, ?, ?, ?, ?, ?, ?)
      `, [
        `cs:sale:${itemId}`,
        item.productGlobalId,
        recordId,
        itemId,
        item.unitCostCents,
        item.quantity,
        item.lineCogsCents,
        date,
        timestamp
      ])
    );
  }

  return commands;
}
