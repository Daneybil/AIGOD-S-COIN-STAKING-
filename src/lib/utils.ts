/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBNB(value: bigint | string | number) {
  const val = typeof value === 'bigint' ? Number(value) / 1e18 : Number(value);
  return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

export function formatToken(value: bigint | string | number) {
  const val = typeof value === 'bigint' ? Number(value) / 1e18 : Number(value);
  return val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
