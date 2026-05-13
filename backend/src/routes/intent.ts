/**
 * Castar — AI Intent Resolver
 *
 * Contract-first resolver for AI-native capture. The endpoint returns a strict,
 * review-safe JSON shape. Until an approved model/provider is configured, it
 * uses deterministic fallback logic that follows the same schema.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import type { Env, Variables } from '../types';

const intent = new Hono<{ Bindings: Env; Variables: Variables }>();

const supportedIntentSchema = z.enum([
  'transaction',
  'debt_create',
  'debt_repayment',
  'budget_create',
  'recurring_create',
  'dashboard_query',
  'unknown',
]);

const categorySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['income', 'expense']),
  icon: z.string().optional(),
  color: z.string().optional(),
});

const accountSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.string().optional(),
  currency: z.string().optional(),
});

const debtSchema = z.object({
  id: z.string().min(1),
  person_name: z.string().min(1),
  direction: z.enum(['i_owe', 'owes_me']),
  remaining_amount: z.number().optional(),
  currency: z.string().optional(),
  status: z.string().optional(),
});

const resolveIntentSchema = z.object({
  text: z.string().min(1).max(2000),
  source: z.enum(['text', 'voice', 'manual']).default('text'),
  ui_language: z.string().default('en'),
  default_currency: z.string().default('UZS'),
  categories: z.array(categorySchema).default([]),
  accounts: z.array(accountSchema).default([]),
  active_debts: z.array(debtSchema).default([]),
  current_date: z.string().optional(),
});

type CategoryInput = z.infer<typeof categorySchema>;
type ResolveIntentInput = z.infer<typeof resolveIntentSchema>;

type TransactionType = 'income' | 'expense';
type DebtDirection = 'i_owe' | 'owes_me';

type IntentDraft = {
  kind: z.infer<typeof supportedIntentSchema>;
  confidence: number;
  missing_fields: string[];
  next_question?: string;
  transaction?: {
    type: TransactionType;
    amount?: number;
    currency?: string;
    category_id?: string;
    category_name?: string;
    description?: string;
    date?: number;
  };
  debt?: {
    direction: DebtDirection;
    person_name?: string;
    amount?: number;
    currency?: string;
    note?: string;
  };
  repayment?: {
    debt_id?: string;
    direction: DebtDirection;
    person_name?: string;
    amount?: number;
    currency?: string;
    note?: string;
  };
  budget?: {
    category_id?: string;
    amount?: number;
    currency?: string;
    period?: 'daily' | 'weekly' | 'fourteen_days' | 'monthly' | 'yearly';
  };
  recurring?: {
    type?: TransactionType;
    amount?: number;
    currency?: string;
    category_id?: string;
    frequency?: 'daily' | 'weekly' | 'monthly' | 'yearly';
    description?: string;
  };
};

const currencyKeywords: Record<string, string> = {
  dollar: 'USD', dollars: 'USD', usd: 'USD', доллар: 'USD', долларов: 'USD',
  euro: 'EUR', eur: 'EUR', евро: 'EUR',
  rub: 'RUB', rubl: 'RUB', рубль: 'RUB', рублей: 'RUB',
  sum: 'UZS', som: 'UZS', "so'm": 'UZS', сум: 'UZS', сумов: 'UZS',
};

const expenseKeywords = [
  'spent', 'paid', 'bought', 'buy', 'purchase',
  'потратил', 'потратила', 'купил', 'купила', 'заплатил', 'расход',
  'sarfladim', 'sotib oldim', "to'ladim", 'xarajat',
];

const incomeKeywords = [
  'salary', 'income', 'received', 'earned', 'got paid',
  'зарплата', 'доход', 'получил', 'получила', 'заработал',
  'oylik', 'maosh', 'daromad', 'oldim',
];

const categoryKeywordMap: Record<string, string[]> = {
  food: ['food', 'coffee', 'tea', 'lunch', 'dinner', 'breakfast', 'milk', 'bread', 'lavash', 'burger', 'restaurant', 'cafe', 'еда', 'кофе', 'обед', 'ужин', 'молоко', 'хлеб', 'лаваш', 'ovqat', 'non', 'choy'],
  transport: ['taxi', 'bus', 'metro', 'fuel', 'gas', 'parking', 'transport', 'такси', 'автобус', 'метро', 'бензин', 'транспорт'],
  groceries: ['grocery', 'groceries', 'market', 'supermarket', 'products', 'продукты', 'магазин', 'маркет'],
  health: ['health', 'doctor', 'medicine', 'pharmacy', 'аптека', 'лекарство', 'доктор'],
  entertainment: ['movie', 'cinema', 'game', 'netflix', 'кино', 'развлеч'],
  salary: ['salary', 'oylik', 'maosh', 'зарплата'],
  freelance: ['freelance', 'фриланс'],
};

export const INTENT_RESOLVER_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['intent', 'confidence', 'drafts', 'missing_fields', 'next_question', 'provider'],
  properties: {
    intent: { enum: supportedIntentSchema.options },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    drafts: { type: 'array' },
    missing_fields: { type: 'array', items: { type: 'string' } },
    next_question: { type: ['string', 'null'] },
    provider: { type: 'string' },
  },
} as const;

export const INTENT_RESOLVER_SYSTEM_PROMPT = `You are Castar's finance intent resolver. Convert user text/transcripts into strict JSON only.

Rules:
- Do not save anything. Create review-safe drafts.
- Classify intent as one of: transaction, debt_create, debt_repayment, budget_create, recurring_create, dashboard_query, unknown.
- Choose categories only from provided category IDs. Never invent IDs.
- If confidence is low or a required field is missing, include missing_fields and next_question.
- Debts are not normal expenses/income until repayment.
- Repayment creates a real transaction later, but this resolver only returns a draft.
- Preserve privacy: do not include unnecessary raw personal/financial context.
- Return JSON matching the provided schema; no markdown.`;

intent.get('/schema', (c) => c.json({
  ok: true,
  data: {
    schema: INTENT_RESOLVER_JSON_SCHEMA,
    system_prompt: INTENT_RESOLVER_SYSTEM_PROMPT,
  },
}));

intent.post('/resolve', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ ok: false, error: 'Invalid JSON body' }, 400);

  const parsed = resolveIntentSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'Validation failed', details: parsed.error.issues }, 400);
  }

  const resolved = resolveWithDeterministicFallback(parsed.data);
  return c.json({ ok: true, data: resolved });
});

function resolveWithDeterministicFallback(input: ResolveIntentInput) {
  const parts = splitPotentialItems(input.text);
  const drafts = parts.map((part) => resolveSingle(part, input));
  const meaningfulDrafts = drafts.filter((draft) => draft.kind !== 'unknown' || draft.missing_fields.length > 0);
  const finalDrafts = meaningfulDrafts.length > 0 ? meaningfulDrafts : [unknownDraft(input.text)];
  const primary = finalDrafts[0];
  const confidence = average(finalDrafts.map((draft) => draft.confidence));
  const missingFields = unique(finalDrafts.flatMap((draft) => draft.missing_fields));

  return {
    intent: finalDrafts.length > 1 && finalDrafts.every((draft) => draft.kind === 'transaction') ? 'transaction' : primary.kind,
    confidence,
    drafts: finalDrafts,
    missing_fields: missingFields,
    next_question: missingFields.length > 0 ? primary.next_question ?? nextQuestionFor(primary.kind, missingFields) : null,
    provider: 'rules_fallback',
    model: null,
  };
}

function resolveSingle(text: string, input: ResolveIntentInput): IntentDraft {
  const lower = text.toLowerCase().trim();
  const amountInfo = extractAmount(lower);
  const currency = amountInfo.currency ?? input.default_currency;

  const debt = resolveDebtIntent(text, input, amountInfo.amount, amountInfo.raw, currency);
  if (debt) return debt;

  const budget = resolveBudgetIntent(text, input, amountInfo.amount, currency);
  if (budget) return budget;

  const recurring = resolveRecurringIntent(text, input, amountInfo.amount, currency);
  if (recurring) return recurring;

  const transaction = resolveTransactionIntent(text, input, amountInfo.amount, currency);
  if (transaction) return transaction;

  return unknownDraft(text);
}

function resolveTransactionIntent(text: string, input: ResolveIntentInput, amount: number | undefined, currency: string): IntentDraft | null {
  const lower = text.toLowerCase();
  const type: TransactionType = incomeKeywords.some((word) => lower.includes(word)) ? 'income' : 'expense';
  const category = resolveCategory(input.categories, type, lower);
  const missingFields: string[] = [];
  if (!amount) missingFields.push('amount');
  if (!category) missingFields.push('category_id');

  if (!amount && !expenseKeywords.some((word) => lower.includes(word)) && !incomeKeywords.some((word) => lower.includes(word))) {
    return null;
  }

  const confidence = clamp(
    (amount ? 0.4 : 0) +
    (category ? 0.3 : 0) +
    (incomeKeywords.some((word) => lower.includes(word)) || expenseKeywords.some((word) => lower.includes(word)) ? 0.2 : 0.1) +
    0.1,
  );

  return {
    kind: 'transaction',
    confidence,
    missing_fields: missingFields,
    next_question: missingFields.length > 0 ? nextQuestionFor('transaction', missingFields) : undefined,
    transaction: {
      type,
      amount,
      currency,
      category_id: category?.id,
      category_name: category?.name,
      description: stripAmountAndCurrency(text) || category?.name || text,
      date: Date.now(),
    },
  };
}

function resolveDebtIntent(
  text: string,
  input: ResolveIntentInput,
  amount: number | undefined,
  rawAmount: string | undefined,
  currency: string,
): IntentDraft | null {
  const lower = text.toLowerCase().replace(/\s+/g, ' ');
  if (!rawAmount) return null;

  let kind: 'debt_create' | 'debt_repayment' | undefined;
  let direction: DebtDirection | undefined;
  let personName = '';

  if (/(paid\s+me|paid\s+back|got\s+paid\s+back|вернул\s+мне|вернула\s+мне|menga\s+qaytardi)/iu.test(lower)) {
    kind = 'debt_repayment';
    direction = 'owes_me';
    personName = cleanPerson(text.slice(0, text.toLowerCase().indexOf(rawAmount.toLowerCase())).replace(/paid\s+me|paid\s+back|got\s+paid\s+back|вернул\s+мне|вернула\s+мне|menga\s+qaytardi/giu, ''));
  } else if (/(i\s+paid|paid|repaid|вернул|вернула|оплатил|оплатила|qaytardim|to'ladim)/iu.test(lower)) {
    kind = 'debt_repayment';
    direction = 'i_owe';
    personName = personAfterMarkerBeforeAmount(text, /(i\s+paid|paid|repaid|вернул|вернула|оплатил|оплатила|qaytardim|to'ladim)/iu, rawAmount);
  }

  if (!kind && /(i\s+owe|borrowed\s+from|я\s+должен|я\s+должна|занял\s+у|заняла\s+у|qarz\s+oldim)/iu.test(lower)) {
    kind = 'debt_create';
    direction = 'i_owe';
    personName = personAfterMarkerBeforeAmount(text, /(i\s+owe|borrowed\s+from|я\s+должен|я\s+должна|занял\s+у|заняла\s+у|qarz\s+oldim)/iu, rawAmount);
  } else if (!kind && /(owes\s+me|lent\s+to|i\s+lent|должен\s+мне|должна\s+мне|дал\s+в\s+долг|дала\s+в\s+долг|qarz\s+berdim)/iu.test(lower)) {
    kind = 'debt_create';
    direction = 'owes_me';
    personName = cleanPerson(text.slice(0, text.toLowerCase().indexOf(rawAmount.toLowerCase())).replace(/owes\s+me|lent\s+to|i\s+lent|должен\s+мне|должна\s+мне|дал\s+в\s+долг|дала\s+в\s+долг|qarz\s+berdim/giu, ''));
    if (!personName && /(lent\s+to|i\s+lent)/iu.test(lower)) {
      personName = personAfterMarkerBeforeAmount(text, /(lent\s+to|i\s+lent)/iu, rawAmount);
    }
  }

  if (!kind || !direction) return null;

  const missingFields: string[] = [];
  if (!amount) missingFields.push('amount');
  if (!personName) missingFields.push('person_name');

  const matchedDebt = kind === 'debt_repayment' && personName
    ? input.active_debts.find((debt) => debt.direction === direction && normalize(debt.person_name) === normalize(personName))
      ?? input.active_debts.find((debt) => debt.direction === direction && normalize(debt.person_name).includes(normalize(personName)))
    : undefined;

  if (kind === 'debt_repayment' && !matchedDebt) missingFields.push('debt_id');

  return {
    kind,
    confidence: clamp(0.55 + (amount ? 0.15 : 0) + (personName ? 0.2 : 0) + (matchedDebt ? 0.1 : 0)),
    missing_fields: missingFields,
    next_question: missingFields.length > 0 ? nextQuestionFor(kind, missingFields) : undefined,
    debt: kind === 'debt_create' ? { direction, person_name: personName || undefined, amount, currency, note: text } : undefined,
    repayment: kind === 'debt_repayment' ? { debt_id: matchedDebt?.id, direction, person_name: personName || undefined, amount, currency, note: text } : undefined,
  };
}

function resolveBudgetIntent(text: string, input: ResolveIntentInput, amount: number | undefined, currency: string): IntentDraft | null {
  const lower = text.toLowerCase();
  if (!/(budget|limit|лимит|бюджет|chegara|limit)/iu.test(lower)) return null;
  const category = resolveCategory(input.categories, 'expense', lower);
  const missingFields: string[] = [];
  if (!amount) missingFields.push('amount');
  if (!category) missingFields.push('category_id');

  return {
    kind: 'budget_create',
    confidence: clamp(0.45 + (amount ? 0.25 : 0) + (category ? 0.2 : 0)),
    missing_fields: missingFields,
    next_question: missingFields.length > 0 ? nextQuestionFor('budget_create', missingFields) : undefined,
    budget: { category_id: category?.id, amount, currency, period: /week|недел|hafta/i.test(lower) ? 'weekly' : 'monthly' },
  };
}

function resolveRecurringIntent(text: string, input: ResolveIntentInput, amount: number | undefined, currency: string): IntentDraft | null {
  const lower = text.toLowerCase();
  if (!/(every|monthly|weekly|daily|кажд|ежемесяч|еженедел|har\s+oy|har\s+hafta)/iu.test(lower)) return null;
  const type: TransactionType = incomeKeywords.some((word) => lower.includes(word)) ? 'income' : 'expense';
  const category = resolveCategory(input.categories, type, lower);
  const missingFields: string[] = [];
  if (!amount) missingFields.push('amount');
  if (!category) missingFields.push('category_id');

  return {
    kind: 'recurring_create',
    confidence: clamp(0.5 + (amount ? 0.2 : 0) + (category ? 0.2 : 0)),
    missing_fields: missingFields,
    next_question: missingFields.length > 0 ? nextQuestionFor('recurring_create', missingFields) : undefined,
    recurring: {
      type,
      amount,
      currency,
      category_id: category?.id,
      frequency: /week|недел|hafta/i.test(lower) ? 'weekly' : /day|день|kun/i.test(lower) ? 'daily' : 'monthly',
      description: stripAmountAndCurrency(text) || category?.name,
    },
  };
}

function resolveCategory(categories: CategoryInput[], type: TransactionType, lowerText: string): CategoryInput | undefined {
  const list = categories.filter((category) => category.type === type);
  if (list.length === 0) return undefined;

  const direct = list.find((category) => {
    const name = normalize(category.name.replace('categories.', '').replace(/_/g, ' '));
    return lowerText.includes(name) || name.split(/\s+/).some((part) => part.length > 2 && lowerText.includes(part));
  });
  if (direct) return direct;

  for (const [key, words] of Object.entries(categoryKeywordMap)) {
    if (words.some((word) => lowerText.includes(word))) {
      const matched = list.find((category) => normalize(category.name).includes(key));
      if (matched) return matched;
    }
  }

  return list.find((category) => /other|проч|boshqa/i.test(category.name)) ?? list[0];
}

function extractAmount(lower: string): { amount?: number; raw?: string; currency?: string } {
  const match = lower.match(/(\d[\d\s,.]*\d|\d+)/);
  if (!match) return {};

  let amount = Number(match[1].replace(/[\s,]/g, ''));
  if (!Number.isFinite(amount)) return {};
  if (/\b(ming|тысяч|тысяча|тысячи|k)\b/i.test(lower)) amount *= 1000;
  if (/\b(million|миллион|mln)\b/i.test(lower)) amount *= 1000000;

  const currency = Object.entries(currencyKeywords).find(([keyword]) => lower.includes(keyword))?.[1];
  return { amount, raw: match[1], currency };
}

function splitPotentialItems(text: string): string[] {
  const parts = text.trim().split(/[,;\n]+|\s+и\s+|\s+and\s+|\s+va\s+/i).map((part) => part.trim()).filter(Boolean);
  const meaningful = parts.filter((part) => /\d|ming|тысяч|dollar|sum|сум|so'm/i.test(part));
  return meaningful.length > 1 ? meaningful : [text];
}

function stripAmountAndCurrency(text: string): string {
  return text
    .replace(/(\d[\d\s,.]*\d|\d+)/g, '')
    .replace(/\b(dollar|dollars|usd|доллар|долларов|euro|eur|евро|rub|rubl|рубль|рублей|so'm|sum|som|сум|сумов|ming|тысяч|k|million|миллион|mln)\b/giu, '')
    .replace(/\b(spent|paid|bought|buy|purchase|потратил|потратила|купил|купила|заплатил|sarfladim|sotib oldim)\b/giu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanPerson(value: string): string {
  return value
    .replace(/\b(to|from|for|за|у|от|мне|меня|menga|mendan|uchun|ga|dan)\b/giu, ' ')
    .replace(/[,.!?]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function personAfterMarkerBeforeAmount(text: string, marker: RegExp, rawAmount: string): string {
  const beforeAmount = text.slice(0, text.toLowerCase().indexOf(rawAmount.toLowerCase()));
  return cleanPerson(beforeAmount.replace(marker, ''));
}

function unknownDraft(text: string): IntentDraft {
  return {
    kind: 'unknown',
    confidence: 0.1,
    missing_fields: ['intent'],
    next_question: 'What would you like to record: expense, income, debt, repayment, budget, or recurring payment?',
    transaction: { description: text, type: 'expense' },
  };
}

function nextQuestionFor(kind: string, missingFields: string[]): string {
  if (missingFields.includes('amount')) return 'What amount should I use?';
  if (missingFields.includes('category_id')) return 'Which category should I use?';
  if (missingFields.includes('person_name')) return 'Who is this debt or repayment with?';
  if (missingFields.includes('debt_id')) return 'Which active debt should this repayment apply to?';
  if (kind === 'unknown') return 'What would you like to record?';
  return 'Please confirm or add the missing details.';
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return clamp(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

export { intent };
