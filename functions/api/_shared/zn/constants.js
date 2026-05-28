export const ZN_INTEGRATION = 'zn';

// 详见 docs/设备映射与数据来源.md
export const ZN_DEVICE_TO_MACHINE = {
  TBN5CFA0261G547T5D3: '1号机',
  TBN5CFA0261GJ6BG6EA: '2号机',
  TBN5CFA0261GI1MJ345: '2号机'
};

export function mapZnDeviceToMachine(deviceCode) {
  const key = String(deviceCode || '').trim();
  return ZN_DEVICE_TO_MACHINE[key] || null;
}

export function mapZnDeviceLabelToMachine(value) {
  const text = String(value || '').trim();
  const direct = mapZnDeviceToMachine(text);
  if (direct) return direct;

  for (const [deviceCode, machineId] of Object.entries(ZN_DEVICE_TO_MACHINE)) {
    if (text.includes(deviceCode) || text.includes(deviceCode.slice(-6))) {
      return machineId;
    }
  }
  return null;
}
