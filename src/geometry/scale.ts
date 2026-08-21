/**
 * scale.ts — Unit conversions, scale mathematics, and dimension formatting
 *
 * All annotation (line weights, text heights, dimension ticks, scale bar geometry)
 * is authored in paper-mm and converted to model units via the declared scale.
 * This ensures correct rendering across all scales and units.
 */

export type Unit = "mm" | "cm" | "m" | "ft" | "in";

/**
 * Millimeters per unit: conversion table
 * Used to convert any unit to mm for scale calculations
 */
export function mmPerUnit(unit: Unit): number {
  const table: Record<Unit, number> = {
    mm: 1,
    cm: 10,
    m: 1000,
    ft: 304.8,     // 1 foot = 304.8 mm
    in: 25.4,      // 1 inch = 25.4 mm
  };
  return table[unit];
}

/**
 * Parse a scale string like "1:100" into its denominator (100)
 */
export function parseScale(scaleStr: string): number {
  const match = scaleStr.match(/^1:(\d+)$/);
  if (!match) {
    throw new Error(`Scale must be in '1:N' format, got '${scaleStr}'`);
  }

  const denominator = parseInt(match[1], 10);
  if (denominator <= 0) {
    throw new Error(`Scale denominator must be positive, got ${denominator}`);
  }

  return denominator;
}

/**
 * Convert paper-mm to model units for the given scale and unit
 *
 * Formula: modelUnits = paperMm × scaleDenominator / mmPerUnit
 *
 * Example: 0.5 mm @ 1:100 with unit "m"
 * = 0.5 × 100 / 1000 = 0.05 m
 */
export function modelPerPaperMm(scaleStr: string, unit: Unit): number {
  const denominator = parseScale(scaleStr);
  const mmPer = mmPerUnit(unit);
  return denominator / mmPer;
}

/**
 * Format a dimension value in the given unit
 * Returns a string like "3.5 m" or "10 ft"
 */
export function formatDimensionValue(value: number, unit: Unit): string {
  // Round to 2 decimal places
  const rounded = Math.round(value * 100) / 100;

  // Convert to string and remove trailing zeros
  let str = rounded.toString();
  if (str.includes(".")) {
    str = str.replace(/\.?0+$/, "");
  }

  // Append unit with space
  return `${str} ${unit}`;
}

/**
 * Generate scale bar tick stops for a given scale and total distance
 *
 * Returns an array of {positionMm, label} for drawing a scale bar.
 * Positions are in paper-mm (for drawing in the sheet margin).
 * Labels are human-readable (e.g. "0", "10 m", "20 m").
 */
export function getScaleBarStops(
  scaleStr: string,
  unit: Unit,
  totalModelDistance: number
): Array<{ positionMm: number; label: string }> {
  const denominator = parseScale(scaleStr);
  const mmPer = mmPerUnit(unit);

  // How many paper-mm represent totalModelDistance?
  // paperMm = modelDistance × mmPer / denominator
  const totalPaperMm = totalModelDistance * mmPer / denominator;

  // Choose a nice interval in model units
  let interval = 1;
  if (totalModelDistance > 100) interval = 10;
  else if (totalModelDistance > 50) interval = 5;
  else if (totalModelDistance > 10) interval = 2;

  const stops: Array<{ positionMm: number; label: string }> = [];

  for (let modelValue = 0; modelValue <= totalModelDistance; modelValue += interval) {
    // Position in paper-mm
    const paperMm = modelValue * mmPer / denominator;
    if (paperMm > totalPaperMm + 0.1) break; // Don't exceed total

    const label = formatDimensionValue(modelValue, unit);
    stops.push({
      positionMm: paperMm,
      label,
    });
  }

  return stops;
}
