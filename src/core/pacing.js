const profiles = {
  A0: Object.freeze({ requestsPerMinute: 4, meanDelayMs: 18_000, deviationMs: 3_000, minDelayMs: 9_000, maxDelayMs: 30_000 }),
  A1: Object.freeze({ requestsPerMinute: 12, meanDelayMs: 5_000, deviationMs: 900, minDelayMs: 2_500, maxDelayMs: 8_000 }),
  A2: Object.freeze({ requestsPerMinute: 30, meanDelayMs: 2_000, deviationMs: 350, minDelayMs: 1_000, maxDelayMs: 3_500 })
};

export const LEVELS = Object.freeze(Object.defineProperties(profiles, {
  circuitFailures: { value: 5 },
  backoffBaseMs: { value: 60_000 },
  backoffCapMs: { value: 6 * 60 * 60_000 },
  retryFloorMs: { value: Object.freeze({ A0: 15 * 60_000, A1: 10 * 60_000, A2: 5 * 60_000 }) }
}));

export const RETRY_FLOOR_MS = LEVELS.retryFloorMs;

const LEVEL_ORDER = ['A0', 'A1', 'A2'];
const MIN_PROBABILITY = 1e-7;

function probability(rng) {
  const value = Number(rng());
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1 - MIN_PROBABILITY, Math.max(MIN_PROBABILITY, value));
}

// Acklam's rational approximation gives a Gaussian sample from one uniform draw.
function normalQuantile(p) {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const low = 0.02425;
  const high = 1 - low;

  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > high) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }

  const q = p - 0.5;
  const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

export function budgetPerMinute(level) {
  return profiles[level]?.requestsPerMinute ?? profiles.A0.requestsPerMinute;
}

export function delayMs(level, rng = Math.random) {
  const profile = profiles[level] ?? profiles.A0;
  const gaussian = normalQuantile(probability(rng));
  const sample = profile.meanDelayMs + gaussian * profile.deviationMs;
  return Math.round(Math.min(profile.maxDelayMs, Math.max(profile.minDelayMs, sample)));
}

export function backoffMs(failures, rng = Math.random) {
  const count = Math.max(1, Math.floor(Number(failures) || 1));
  const exponential = Math.min(LEVELS.backoffCapMs, LEVELS.backoffBaseMs * (2 ** Math.min(count - 1, 30)));
  const jitter = Math.min(1.5, Math.max(0.5, Math.exp(normalQuantile(probability(rng)) * 0.25)));
  return Math.min(LEVELS.backoffCapMs, Math.round(exponential * jitter));
}

export function nextLevel({ level = 'A0', cleanSessions = 0 } = {}) {
  const index = LEVEL_ORDER.indexOf(level);
  if (index < 0 || cleanSessions < 3) return LEVEL_ORDER[Math.max(index, 0)];
  return LEVEL_ORDER[Math.min(index + 1, LEVEL_ORDER.length - 1)];
}

export function openCircuit(failures) {
  return Number(failures) >= LEVELS.circuitFailures;
}

export function reduceOutcome(state = {}, { host, status } = {}) {
  const domains = { ...(state.domains ?? {}) };
  const current = domains[host] ?? { failures: 0 };
  const isSuccess = status === 200;
  const isThrottle = [401, 403, 429].includes(status);

  domains[host] = {
    ...current,
    failures: isSuccess ? 0 : (Number(current.failures) || 0) + 1
  };

  return {
    ...state,
    level: isThrottle ? 'A0' : (state.level ?? 'A0'),
    cleanSessions: isSuccess ? (Number(state.cleanSessions) || 0) + 1 : 0,
    throttled: isThrottle ? true : (isSuccess ? false : Boolean(state.throttled)),
    domains
  };
}
