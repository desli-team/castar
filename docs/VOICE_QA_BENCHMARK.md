# Castar Voice QA Benchmark

> Purpose: verify that interface language and spoken language are independent, and that RU/UZ/EN voice capture reliably reaches saved transaction state.

## Product requirement

The interface language must not restrict voice input language.

Examples:
- Russian UI + English speech → should transcribe, parse, review, save.
- English UI + Uzbek speech → should transcribe, parse, review, save.
- Uzbek UI + Russian speech → should transcribe, parse, review, save.

## Success metric

Target: 99% successful capture for common MVP utterances after provider/model selection and parser hardening.

Do not measure transcript accuracy alone. Score the full pipeline:

1. Audio captured
2. STT returns correct usable text
3. Parser extracts amount/type/category/currency where present
4. Candidate review card appears
5. User can save
6. Transaction exists in local SQLite/Zustand
7. Sync queue contains create operation when authenticated/offline-first mode applies

## Test dimensions

### Interface languages

- `uz`
- `ru`
- `en`
- plus non-voice UI languages from interface localization set for smoke only: `be`, `uk`, `kk`, `de`, `az`, `pl`, `ka`, `zh`

### Spoken languages for STT benchmark

- Uzbek: `uz-UZ`
- Russian: `ru-RU`
- English: `en-US`

### Matrix

Each spoken-language set must be tested under at least these UI languages:

| UI language | Spoken Uzbek | Spoken Russian | Spoken English |
|---|---:|---:|---:|
| uz | required | required | required |
| ru | required | required | required |
| en | required | required | required |

For the remaining interface languages, run smoke samples to prove UI locale does not restrict STT:

| UI language | Spoken Uzbek | Spoken Russian | Spoken English |
|---|---:|---:|---:|
| be/uk/kk/de/az/pl/ka/zh | smoke | smoke | smoke |

## Dataset size

Minimum benchmark before claiming reliability:

- 50–100 utterances total for initial MVP gate.
- Recommended production confidence set: 100 per spoken language, across accents/noise/amount formats.

## Core utterance groups

### Single expense

Russian:
- `потратил 50000 сум на такси`
- `купил кофе за 25000`
- `еда 120 тысяч`

Uzbek:
- `taksiga 50000 so'm sarfladim`
- `kofe 25000 so'm`
- `ovqatga 120 ming`

English:
- `spent 50000 sum on taxi`
- `coffee 25000`
- `food 120 thousand`

### Income

Russian:
- `получил зарплату 500 долларов`
- `доход 300000 сум`

Uzbek:
- `maosh 500 dollar oldim`
- `daromad 300000 so'm`

English:
- `received salary 500 dollars`
- `income 300000 sum`

### Multi-transaction

Russian:
- `молоко 20000, хлеб 8000, такси 25000`

Uzbek:
- `sut 20000, non 8000, taksi 25000`

English:
- `milk 20000, bread 8000, taxi 25000`

### Mixed UI/spoken cases

- UI `ru`, speech English: `spent 30000 sum on lunch`
- UI `en`, speech Russian: `потратил 40000 сум на аптеку`
- UI `uz`, speech English: `paid 90000 sum for internet`
- UI `ru`, speech Uzbek: `ovqatga 60000 so'm sarfladim`

## Pass/fail rules

### Pass

- Text is transcribed with enough accuracy to preserve amount and category intent.
- Parser extracts amount correctly.
- Candidate appears and can be saved.
- Saved transaction has correct type, amount, currency fallback, category fallback if confidence is low.

### Soft pass / needs review

- STT text is usable but category is ambiguous.
- App shows review state and allows quick edit.

### Fail

- No transcript.
- Amount lost or wrong by material value.
- Candidate not created.
- Save fails.
- UI language changes the STT language set and blocks another spoken language.

## Current implementation status

- Cloud STT now sends RU/UZ/EN language codes regardless of UI language.
- UI language is used only as preferred ordering.
- Parser is multilingual but still needs benchmark-driven hardening.
- Offline VOSK remains single-model by selected/preferred STT language and needs separate quality/routing review.

## Next implementation tasks

1. Build a simple local benchmark runner around `parseVoiceInputs()` for text fixtures.
2. Add real audio collection/run sheet for device QA.
3. Compare providers: Google STT, Groq Whisper, Deepgram.
4. Add parser fixes from failed samples.
5. Only then claim 99% reliability.
