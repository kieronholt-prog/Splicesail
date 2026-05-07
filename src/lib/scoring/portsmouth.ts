/** RYA Portsmouth Yardstick: corrected time (seconds) = elapsed × 1000 ÷ PN */

export function correctedSecondsFromElapsed(
  elapsedSec: number,
  py: number,
): number {
  if (!(py > 0) || !Number.isFinite(elapsedSec)) return NaN;
  return (elapsedSec * 1000) / py;
}
