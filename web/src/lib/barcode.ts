/**
 * Retail barcodes (EAN-13, EAN-8, UPC-A, UPC-E as GTIN). The last digit is a check digit;
 * verifying it rejects most misreads before anything is looked up.
 */
export function normaliseBarcode(raw: string): string | null {
  const digits = raw.replace(/[\s-]/g, "");
  if (!/^\d{8}$|^\d{12,14}$/.test(digits)) return null;
  return validCheckDigit(digits) ? digits : null;
}

/** GS1 check digit: weights 3,1,3,1… from the right, excluding the check digit itself. */
export function validCheckDigit(code: string): boolean {
  const body = code.slice(0, -1);
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const d = body.charCodeAt(body.length - 1 - i) - 48;
    sum += i % 2 === 0 ? d * 3 : d;
  }
  return (10 - (sum % 10)) % 10 === Number(code[code.length - 1]);
}
