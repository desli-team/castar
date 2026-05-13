import type { Currency, DebtDirection } from '../../../shared/types';

export type DebtIntentKind = 'create_debt' | 'repayment';

export interface ParsedDebtIntent {
  kind: DebtIntentKind;
  direction: DebtDirection;
  personName: string;
  amount: number;
  currency?: Currency;
  note: string;
  confidence: number;
  rawText: string;
}

const currencyKeywords: Record<string, Currency> = {
  dollar: 'USD',
  dollars: 'USD',
  usd: 'USD',
  доллар: 'USD',
  долларов: 'USD',
  euro: 'EUR',
  eur: 'EUR',
  евро: 'EUR',
  rub: 'RUB',
  rubl: 'RUB',
  рубль: 'RUB',
  рублей: 'RUB',
  sum: 'UZS',
  som: 'UZS',
  "so'm": 'UZS',
  сум: 'UZS',
  сумов: 'UZS',
};

function cleanPerson(value: string): string {
  return value
    .replace(/\b(to|from|for|за|у|от|мне|меня|menga|mendan|uchun|ga|dan)\b/giu, ' ')
    .replace(/[,.!?]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractAmount(text: string): { amount?: number; raw?: string; currency?: Currency } {
  const lower = text.toLowerCase();
  const match = lower.match(/(\d[\d\s,.]*\d|\d+)/);
  if (!match) return {};

  let amount = Number(match[1].replace(/[\s,]/g, ''));
  if (!Number.isFinite(amount)) return {};
  if (/\b(ming|тысяч|тысяча|тысячи|k)\b/i.test(lower)) amount *= 1000;
  if (/\b(million|миллион|mln)\b/i.test(lower)) amount *= 1000000;

  const currency = Object.entries(currencyKeywords).find(([keyword]) => lower.includes(keyword))?.[1];
  return { amount, raw: match[1], currency };
}

function personBeforeAmount(text: string, rawAmount: string): string {
  return text.slice(0, text.toLowerCase().indexOf(rawAmount.toLowerCase()));
}

function personAfterMarkerBeforeAmount(text: string, marker: RegExp, rawAmount: string): string {
  const before = personBeforeAmount(text, rawAmount);
  return cleanPerson(before.replace(marker, ''));
}

export function parseDebtIntent(text: string): ParsedDebtIntent | null {
  const rawText = text.trim();
  if (!rawText) return null;
  const lower = rawText.toLowerCase();
  const amountInfo = extractAmount(rawText);
  if (!amountInfo.amount || !amountInfo.raw || amountInfo.amount <= 0) return null;

  const normalized = lower.replace(/\s+/g, ' ');
  let kind: DebtIntentKind | undefined;
  let direction: DebtDirection | undefined;
  let personName = '';

  // Repayment: money moved now. Check inbound repayments before generic "paid".
  if (/(paid\s+me|paid\s+back|got\s+paid\s+back|вернул\s+мне|вернула\s+мне|menga\s+qaytardi)/iu.test(normalized)) {
    kind = 'repayment';
    direction = 'owes_me';
    personName = cleanPerson(personBeforeAmount(rawText, amountInfo.raw).replace(/(paid\s+me|paid\s+back|got\s+paid\s+back|вернул\s+мне|вернула\s+мне|menga\s+qaytardi)/giu, ''));
  } else if (/(i\s+paid|paid|repaid|вернул|вернула|оплатил|оплатила|qaytardim|to'ladim)/iu.test(normalized)) {
    kind = 'repayment';
    direction = 'i_owe';
    personName = personAfterMarkerBeforeAmount(rawText, /(i\s+paid|paid|repaid|вернул|вернула|оплатил|оплатила|qaytardim|to'ladim)/iu, amountInfo.raw);
  }

  // Create debt: no money movement in ledger yet.
  if (!kind && /(i\s+owe|borrowed\s+from|я\s+должен|я\s+должна|занял\s+у|заняла\s+у|qarz\s+oldim)/iu.test(normalized)) {
    kind = 'create_debt';
    direction = 'i_owe';
    personName = personAfterMarkerBeforeAmount(rawText, /(i\s+owe|borrowed\s+from|я\s+должен|я\s+должна|занял\s+у|заняла\s+у|qarz\s+oldim)/iu, amountInfo.raw);
  } else if (!kind && /(owes\s+me|lent\s+to|i\s+lent|должен\s+мне|должна\s+мне|дал\s+в\s+долг|дала\s+в\s+долг|qarz\s+berdim)/iu.test(normalized)) {
    kind = 'create_debt';
    direction = 'owes_me';
    personName = cleanPerson(personBeforeAmount(rawText, amountInfo.raw).replace(/(owes\s+me|lent\s+to|i\s+lent|должен\s+мне|должна\s+мне|дал\s+в\s+долг|дала\s+в\s+долг|qarz\s+berdim)/giu, ''));
    if (!personName && /(lent\s+to|i\s+lent)/i.test(normalized)) {
      personName = personAfterMarkerBeforeAmount(rawText, /(lent\s+to|i\s+lent)/iu, amountInfo.raw);
    }
  }

  if (!kind || !direction) return null;

  personName = cleanPerson(personName);
  if (!personName) return null;

  return {
    kind,
    direction,
    personName,
    amount: amountInfo.amount,
    currency: amountInfo.currency,
    note: rawText,
    confidence: 0.85,
    rawText,
  };
}
