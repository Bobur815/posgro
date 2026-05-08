export async function fetchOfdAmount(ofdUrl: string): Promise<number | null> {
  try {
    const res = await fetch(ofdUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' },
      signal: AbortSignal.timeout(8000),
    });
    let html = await res.text();

    // Remove SVG blocks — their numeric path data (e.g. viewBox "552.93") pollutes parsing
    html = html.replace(/<svg[\s\S]*?<\/svg>/gi, '');

    // 1. price-sum class (line item price cell) — works for single-item receipts
    const priceSumMatch = html.match(/class="price-sum"[^>]*>\s*([\d,]+\.\d{2})/);
    if (priceSumMatch) {
      const val = parseFloat(priceSumMatch[1].replace(/,/g, ''));
      if (!isNaN(val) && val >= 100) return val;
    }

    // Strip tags for text search
    const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ');

    // 2. "Jami" keyword followed by comma-formatted amount (e.g. "50,000.00")
    const jamiMatch = text.match(/Jami[^0-9]{0,30}?([\d]{1,3}(?:,\d{3})+\.\d{2})/i);
    if (jamiMatch) {
      const val = parseFloat(jamiMatch[1].replace(/,/g, ''));
      if (!isNaN(val) && val >= 100) return val;
    }

    // 3. All comma-formatted amounts — take the largest (most likely the total)
    const amounts = [...text.matchAll(/\b(\d{1,3}(?:,\d{3})+\.\d{2})\b/g)]
      .map(m => parseFloat(m[1].replace(/,/g, '')))
      .filter(n => n >= 100 && n < 100_000_000);
    if (amounts.length > 0) return Math.max(...amounts);

  } catch (err) {
    console.warn(`[ofd-fetcher] Failed to fetch ${ofdUrl}: ${err}`);
  }
  return null;
}
