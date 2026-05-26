export const SHARED_STOCK_MACHINE_ID = '1/2号机';
export const SHARED_STOCK_MACHINE_LABEL = '1/2号机总库存';
export const SHARED_STOCK_SOURCE_MACHINES = new Set(['1号机', '2号机', SHARED_STOCK_MACHINE_ID, SHARED_STOCK_MACHINE_LABEL]);
export const SHARED_STOCK_MACHINE_SQL = "CASE WHEN machine_id IN ('1号机', '2号机', '1/2号机') THEN '1/2号机' ELSE machine_id END";
export const SHARED_PRODUCT_STOCK_MACHINE_SQL = "CASE WHEN p.machine_id IN ('1号机', '2号机', '1/2号机') THEN '1/2号机' ELSE p.machine_id END";

export function stockMachineIdFor(machineId) {
  const value = String(machineId || '').trim();
  if (SHARED_STOCK_SOURCE_MACHINES.has(value)) return SHARED_STOCK_MACHINE_ID;
  return value || SHARED_STOCK_MACHINE_ID;
}

export function isSharedStockMachine(machineId) {
  return stockMachineIdFor(machineId) === SHARED_STOCK_MACHINE_ID;
}

export function canServeOrderMachine(productMachineId, orderMachineId) {
  const productScope = stockMachineIdFor(productMachineId);
  const orderScope = stockMachineIdFor(orderMachineId);
  return productScope === orderScope;
}
