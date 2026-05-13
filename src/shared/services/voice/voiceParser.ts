/**
 * Castar — Voice input parser
 * Parses spoken text into transaction data.
 *
 * Examples:
 *   "потратил пятьдесят тысяч на еду" → { amount: 50000, type: 'expense', categoryHint: 'еду' }
 *   "spent 20 dollars on taxi" → { amount: 20, currency: 'USD', type: 'expense', categoryHint: 'taxi' }
 *   "ovqatga 50 ming sarfladim" → { amount: 50000, type: 'expense', categoryHint: 'ovqat' }
 */

import type { VoiceParseResult, Currency } from '../../types';

// Number word mappings for multilingual support
const numberWordsRu: Record<string, number> = {
  'тысяча': 1000, 'тысячи': 1000, 'тысяч': 1000,
  'миллион': 1000000, 'миллиона': 1000000, 'миллионов': 1000000,
  'сто': 100, 'двести': 200, 'триста': 300, 'четыреста': 400,
  'пятьсот': 500,
  'десять': 10, 'двадцать': 20, 'тридцать': 30, 'сорок': 40, 'пятьдесят': 50,
  'один': 1, 'два': 2, 'три': 3, 'четыре': 4, 'пять': 5,
};

const numberWordsUz: Record<string, number> = {
  'ming': 1000,
  'million': 1000000,
  'yuz': 100, 'ikki yuz': 200,
  "o'n": 10, 'yigirma': 20, "o'ttiz": 30, 'qirq': 40, 'ellik': 50,
  'bir': 1, 'ikki': 2, 'uch': 3, "to'rt": 4, 'besh': 5,
};

const currencyKeywords: Record<string, Currency> = {
  'dollar': 'USD', 'dollars': 'USD', 'доллар': 'USD', 'долларов': 'USD',
  'euro': 'EUR', 'евро': 'EUR',
  'рубль': 'RUB', 'рублей': 'RUB', 'rubl': 'RUB',
  "so'm": 'UZS', 'sum': 'UZS', 'сум': 'UZS', 'сумов': 'UZS',
};

const expenseKeywords = [
  'потратил', 'потратила', 'расход', 'купил', 'купила', 'заплатил',
  'spent', 'paid', 'bought',
  'sarfladim', 'sotib oldim', "to'ladim",
];

const incomeKeywords = [
  'получил', 'получила', 'заработал', 'доход',
  'received', 'earned', 'got',
  'oldim', 'ishladim', 'daromad',
];

export function parseVoiceInput(text: string): VoiceParseResult {
  return parseSingleTransaction(text);
}

export function parseVoiceInputs(text: string): VoiceParseResult[] {
  const parts = splitPotentialTransactions(text);
  const parsed = parts.map((part) => parseSingleTransaction(part));

  if (parsed.length <= 1) {
    return parsed;
  }

  const sharedType = parsed.find((item) => item.type)?.type;
  const sharedCurrency = parsed.find((item) => item.currency)?.currency;

  return parsed.map((item) => ({
    ...item,
    type: item.type ?? sharedType ?? 'expense',
    currency: item.currency ?? sharedCurrency,
    confidence:
      item.confidence +
      (item.type === undefined && sharedType ? 0.15 : 0) +
      (item.currency === undefined && sharedCurrency ? 0.05 : 0),
  }));
}

function parseSingleTransaction(text: string): VoiceParseResult {
  const lowerText = text.toLowerCase().trim();
  let amount: number | undefined;
  let currency: Currency | undefined;
  let type: VoiceParseResult['type'];
  let categoryHint: string | undefined;

  // Extract numeric amount
  const numberMatch = lowerText.match(/(\d[\d\s,.]*\d|\d+)/);
  if (numberMatch) {
    amount = parseFloat(numberMatch[1].replace(/[\s,]/g, ''));
  }

  // Detect multiplier words (e.g., "50 ming" = 50,000)
  if (amount && /ming|тысяч/.test(lowerText)) {
    amount *= 1000;
  }
  if (amount && /million|миллион/.test(lowerText)) {
    amount *= 1000000;
  }

  // Detect currency
  for (const [keyword, curr] of Object.entries(currencyKeywords)) {
    if (lowerText.includes(keyword)) {
      currency = curr;
      break;
    }
  }

  // Detect transaction type
  if (expenseKeywords.some((kw) => lowerText.includes(kw))) {
    type = 'expense';
  } else if (incomeKeywords.some((kw) => lowerText.includes(kw))) {
    type = 'income';
  }

  // Extract category hint — text after "на", "on", "uchun", "ga"
  const categoryMatch = lowerText.match(/(?:на|on|uchun|ga)\s+(.+?)(?:\s*$)/);
  if (categoryMatch) {
    categoryHint = categoryMatch[1].trim();
  }

  if (!categoryHint && amount !== undefined) {
    categoryHint = inferDescriptionWithoutAmount(lowerText, numberMatch?.[1]);
  }

  const confidence =
    (amount !== undefined ? 0.4 : 0) +
    (type !== undefined ? 0.3 : 0) +
    (categoryHint !== undefined ? 0.2 : 0) +
    (currency !== undefined ? 0.1 : 0);

  return {
    amount,
    currency,
    categoryHint,
    type,
    description: categoryHint ?? text,
    confidence,
    rawText: text,
  };
}

function splitPotentialTransactions(text: string): string[] {
  const normalized = text.trim();

  if (!normalized) {
    return [text];
  }

  const parts = normalized
    .split(/[,;\n]+|\s+и\s+|\s+and\s+|\s+va\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);

  const meaningfulParts = parts.filter((part) => /\d|ming|тысяч|dollar|sum|сум|so'm/i.test(part));

  return meaningfulParts.length > 1 ? meaningfulParts : [text];
}

function inferDescriptionWithoutAmount(text: string, rawAmount?: string): string | undefined {
  if (!rawAmount) {
    return undefined;
  }

  const cleaned = text
    .replace(rawAmount, '')
    .replace(/\b(spent|paid|bought|потратил|потратила|купил|купила|sarfladim|sotib oldim)\b/gi, '')
    .replace(/\b(dollar|dollars|доллар|долларов|euro|евро|рубль|рублей|rubl|so'm|sum|сум|сумов|ming|тысяч)\b/gi, '')
    .trim();

  return cleaned || undefined;
}
