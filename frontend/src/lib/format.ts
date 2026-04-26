export function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

export function shortAddress(address: string): string {
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/** Ultra-compact address for mobile: 0xFE…62 */
export function mobileShortAddress(address: string): string {
  if (address.length < 8) return address;
  return `${address.slice(0, 4)}…${address.slice(-2)}`;
}
