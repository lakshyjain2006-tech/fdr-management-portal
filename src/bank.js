// Pluggable bank verification adapter.
// "mock" confirms any FDR except numbers containing FAKE (to demo a failed verification).
// To integrate a real bank / AICTE API, implement verify() with the same signature and set BANK_ADAPTER.
const adapters = {
  mock: {
    name: 'Mock bank gateway',
    async verify(f) {
      await new Promise(r => setTimeout(r, 300));
      if (/fake/i.test(f.fdrNumber)) return { verified: false, reference: null, reason: 'Bank has no record of this FDR number.' };
      return { verified: true, reference: 'MOCK-' + Date.now().toString(36).toUpperCase(), reason: 'Details match bank records (simulated).' };
    }
  }
};
module.exports = adapters[process.env.BANK_ADAPTER || 'mock'] || adapters.mock;
