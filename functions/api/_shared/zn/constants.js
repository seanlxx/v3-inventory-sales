export const ZN_INTEGRATION = 'zn';

// 详见 docs/设备映射与数据来源.md
export const ZN_DEVICE_TO_MACHINE = {
  TBN5CFA0261G547T5D3: '1号机',
  TBN5CFA0261GJ6BG6EA: '2号机'
};

export function mapZnDeviceToMachine(deviceCode) {
  const key = String(deviceCode || '').trim();
  return ZN_DEVICE_TO_MACHINE[key] || null;
}
