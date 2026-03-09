/**
 * Deterministic temporal parsing for quick task capture.
 *
 * Goals:
 * - preserve the existing `due_date` / `scheduled_date` compatibility fields
 * - distinguish deadline intent from planned-work intent
 * - support ranges, durations, and broader human phrasing
 * - return explicit ambiguity when wording materially changes meaning
 */

export type TemporalConfidence = 'high' | 'medium' | 'low' | 'ambiguous';
export type InterpretationType = 'due' | 'scheduled' | 'ambiguous' | 'none';
export type DetectedPhraseType = 'date' | 'time' | 'datetime' | 'range' | 'duration' | 'modifier';

export interface TemporalPhrase {
  phrase: string;
  start: number;
  end: number;
  type: DetectedPhraseType;
}

export interface ParsedTemporal {
  due_date?: string;
  due_time?: string;
  scheduled_date?: string;
  scheduled_time?: string;
  start_time?: string;
  end_time?: string;
  duration_minutes?: number;
  is_all_day?: boolean;
  confidence: TemporalConfidence;
  interpretation_type: InterpretationType;
  ambiguous?: string[];
  cleanedText: string;
  detectedPhrases?: TemporalPhrase[];
  extractedTemporalSpans?: TemporalPhrase[];
  alternatives?: ParsedTemporal[];
}

type DateSpec = {
  date: Date;
  phrase: string;
  start: number;
  end: number;
  confidence: number;
};

type TimeSpec = {
  hours: number;
  minutes: number;
  phrase: string;
  start: number;
  end: number;
  confidence: number;
};

type RangeSpec = {
  startTime: TimeSpec;
  endTime: TimeSpec;
  phrase: string;
  start: number;
  end: number;
  confidence: number;
};

type DurationSpec = {
  minutes: number;
  phrase: string;
  start: number;
  end: number;
  confidence: number;
};

type PartOfDaySpec = {
  startTime: TimeSpec;
  endTime?: TimeSpec;
  phrase: string;
  start: number;
  end: number;
  confidence: number;
};

type IntentScore = {
  due: number;
  scheduled: number;
  dueReasons: string[];
  scheduledReasons: string[];
};

type BuildOptions = {
  interpretation: 'due' | 'scheduled';
  forceAmbiguous?: boolean;
};

type ParseContext = {
  originalText: string;
  lowerText: string;
  dateSpec?: DateSpec;
  timeSpec?: TimeSpec;
  rangeSpec?: RangeSpec;
  durationSpec?: DurationSpec;
  partOfDaySpec?: PartOfDaySpec;
  phrases: TemporalPhrase[];
  intent: IntentScore;
};

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

const PARTS_OF_DAY: Array<{
  pattern: RegExp;
  startHour: number;
  startMinute?: number;
  endHour?: number;
  endMinute?: number;
  confidence: number;
}> = [
  { pattern: /\bearly morning\b/gi, startHour: 7, endHour: 9, confidence: 0.7 },
  { pattern: /\bmorning\b/gi, startHour: 9, endHour: 12, confidence: 0.72 },
  { pattern: /\bafter lunch\b/gi, startHour: 13, endHour: 15, confidence: 0.74 },
  { pattern: /\bthis afternoon\b/gi, startHour: 14, endHour: 17, confidence: 0.78 },
  { pattern: /\blate afternoon\b/gi, startHour: 16, endHour: 18, confidence: 0.72 },
  { pattern: /\bafternoon\b/gi, startHour: 14, endHour: 17, confidence: 0.72 },
  { pattern: /\bthis evening\b/gi, startHour: 18, endHour: 21, confidence: 0.76 },
  { pattern: /\bevening\b/gi, startHour: 18, endHour: 21, confidence: 0.72 },
  { pattern: /\btonight\b/gi, startHour: 20, endHour: 22, confidence: 0.82 },
  { pattern: /\bnight\b/gi, startHour: 20, endHour: 22, confidence: 0.68 },
];

const DUE_CUE_PATTERNS = [
  /\bdue\b/i,
  /\bby\b/i,
  /\bbefore\b/i,
  /\buntil\b/i,
  /\bno later than\b/i,
  /\bdeadline\b/i,
  /\bsubmit\b/i,
];

const SCHEDULE_CUE_PATTERNS = [
  /\bat\b/i,
  /\bfrom\b/i,
  /\bbetween\b/i,
  /\bstarting\b/i,
  /\bstart\b/i,
  /\bfor\b/i,
  /\bafter\b/i,
  /\bsometime\b/i,
];

function cloneDate(date: Date): Date {
  return new Date(date.getTime());
}

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toTimeKey(hours: number, minutes: number): string {
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
}

function withTime(baseDate: Date, time: TimeSpec): Date {
  const next = cloneDate(baseDate);
  next.setHours(time.hours, time.minutes, 0, 0);
  return next;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function getNextWeekday(now: Date, weekday: number, qualifier?: 'next' | 'this'): Date {
  const date = cloneDate(now);
  date.setHours(0, 0, 0, 0);
  const currentDay = date.getDay();
  let daysUntil = (weekday - currentDay + 7) % 7;

  if (qualifier === 'this') {
    if (daysUntil === 0) return date;
    date.setDate(date.getDate() + daysUntil);
    return date;
  }

  if (qualifier === 'next') {
    daysUntil = daysUntil === 0 ? 7 : daysUntil + 7;
  } else if (daysUntil === 0) {
    daysUntil = 7;
  }
  date.setDate(date.getDate() + daysUntil);
  return date;
}

function stripTimeWords(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

function parseTimeValue(raw: string, fallbackMeridiem?: 'am' | 'pm', contextualStartHour?: number): TimeSpec | null {
  const text = stripTimeWords(raw.toLowerCase());
  const match = text.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2] || '0');
  const meridiem = (match[3]?.toLowerCase() as 'am' | 'pm' | undefined) || fallbackMeridiem;

  if (hours > 23 || minutes > 59) return null;

  if (meridiem) {
    if (hours > 12) return null;
    if (meridiem === 'pm' && hours !== 12) hours += 12;
    if (meridiem === 'am' && hours === 12) hours = 0;
  } else if (hours <= 12) {
    if (contextualStartHour !== undefined) {
      if (contextualStartHour >= 12 && hours < 12) {
        hours += 12;
      }
    } else if (hours >= 1 && hours <= 6) {
      hours += 12;
    }
  }

  return {
    hours,
    minutes,
    phrase: raw,
    start: -1,
    end: -1,
    confidence: meridiem ? 0.92 : 0.68,
  };
}

function removePhrases(text: string, phrases: TemporalPhrase[]): string {
  if (phrases.length === 0) return text.trim();

  const unique = [...phrases].sort((a, b) => b.start - a.start || b.end - a.end);
  let cleaned = text;
  for (const phrase of unique) {
    cleaned = `${cleaned.slice(0, phrase.start)} ${cleaned.slice(phrase.end)}`;
  }

  return cleaned
    .replace(/\b(by|before|until|at|from|between|for|on|this|next)\s+(?=\s|$)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toConfidence(value: number): Exclude<TemporalConfidence, 'ambiguous'> {
  if (value >= 0.85) return 'high';
  if (value >= 0.65) return 'medium';
  return 'low';
}

function dedupePhrases(phrases: TemporalPhrase[]): TemporalPhrase[] {
  const seen = new Set<string>();
  return phrases
    .slice()
    .sort((a, b) => a.start - b.start || a.end - b.end)
    .filter((phrase) => {
      const key = `${phrase.start}:${phrase.end}:${phrase.type}:${phrase.phrase.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export class TemporalParser {
  private now: Date;
  private locale: string;
  private timezone: string;

  constructor(
    locale: string = 'en-US',
    timezone: string = Intl.DateTimeFormat().resolvedOptions().timeZone,
    now: Date = new Date()
  ) {
    this.now = cloneDate(now);
    this.locale = locale;
    this.timezone = timezone;
  }

  parse(input: string): ParsedTemporal {
    const originalText = input.trim();
    if (!originalText) {
      return {
        cleanedText: '',
        confidence: 'high',
        interpretation_type: 'none',
        detectedPhrases: [],
        extractedTemporalSpans: [],
      };
    }

    const context = this.extractContext(originalText);
    if (context.phrases.length === 0) {
      return {
        cleanedText: originalText,
        confidence: 'high',
        interpretation_type: 'none',
        detectedPhrases: [],
        extractedTemporalSpans: [],
      };
    }

    const hasTemporalAnchor = Boolean(context.dateSpec || context.timeSpec || context.rangeSpec || context.partOfDaySpec);
    if (!hasTemporalAnchor) {
      return {
        cleanedText: originalText,
        confidence: 'low',
        interpretation_type: 'none',
        detectedPhrases: context.phrases,
        extractedTemporalSpans: context.phrases,
      };
    }

    const dueScore = context.intent.due;
    const scheduledScore = context.intent.scheduled;

    const shouldBeAmbiguous =
      this.shouldReturnAmbiguity(context, dueScore, scheduledScore);

    if (shouldBeAmbiguous) {
      const dueAlternative = this.buildInterpretation(context, { interpretation: 'due', forceAmbiguous: true });
      const scheduledAlternative = this.buildInterpretation(context, { interpretation: 'scheduled', forceAmbiguous: true });
      const cleanedText = removePhrases(originalText, context.phrases);

      return {
        cleanedText,
        confidence: 'ambiguous',
        interpretation_type: 'ambiguous',
        ambiguous: ['due', 'scheduled'],
        detectedPhrases: context.phrases,
        extractedTemporalSpans: context.phrases,
        alternatives: [dueAlternative, scheduledAlternative],
      };
    }

    const interpretation: 'due' | 'scheduled' =
      scheduledScore > dueScore ? 'scheduled' : 'due';

    return this.buildInterpretation(context, { interpretation });
  }

  updateNow(newNow: Date = new Date()): void {
    this.now = cloneDate(newNow);
  }

  private extractContext(text: string): ParseContext {
    const lowerText = text.toLowerCase();
    const phrases: TemporalPhrase[] = [];

    const dateSpec = this.extractDate(text, lowerText, phrases);
    const partOfDaySpec = this.extractPartOfDay(text, phrases);
    const rangeSpec = this.extractRange(text, partOfDaySpec, phrases);
    const timeSpec = this.extractTime(text, rangeSpec, phrases);
    const durationSpec = this.extractDuration(text, phrases);
    const intent = this.detectIntent(text, lowerText, { dateSpec, partOfDaySpec, rangeSpec, timeSpec, durationSpec });

    return {
      originalText: text,
      lowerText,
      dateSpec,
      timeSpec,
      rangeSpec,
      durationSpec,
      partOfDaySpec,
      phrases: dedupePhrases(phrases),
      intent,
    };
  }

  private extractDate(text: string, lowerText: string, phrases: TemporalPhrase[]): DateSpec | undefined {
    const directPatterns: Array<{
      pattern: RegExp;
      confidence: number;
      getDate: (match: RegExpExecArray) => Date;
    }> = [
      {
        pattern: /\btoday\b/gi,
        confidence: 0.92,
        getDate: () => {
          const date = cloneDate(this.now);
          date.setHours(0, 0, 0, 0);
          return date;
        },
      },
      {
        pattern: /\btomorrow\b/gi,
        confidence: 0.94,
        getDate: () => {
          const date = cloneDate(this.now);
          date.setDate(date.getDate() + 1);
          date.setHours(0, 0, 0, 0);
          return date;
        },
      },
      {
        pattern: /\bthis weekend\b/gi,
        confidence: 0.62,
        getDate: () => {
          const saturday = getNextWeekday(this.now, 6, 'this');
          return saturday.getDay() === 6 ? saturday : getNextWeekday(this.now, 6);
        },
      },
      {
        pattern: /\bnext weekend\b/gi,
        confidence: 0.62,
        getDate: () => getNextWeekday(this.now, 6, 'next'),
      },
      {
        pattern: /\bnext week(?:\s+sometime)?\b/gi,
        confidence: 0.58,
        getDate: () => getNextWeekday(this.now, 1, 'next'),
      },
      {
        pattern: /\bin\s+(\d+)\s+days?\b/gi,
        confidence: 0.82,
        getDate: (match) => {
          const date = cloneDate(this.now);
          date.setDate(date.getDate() + Number(match[1]));
          date.setHours(0, 0, 0, 0);
          return date;
        },
      },
    ];

    for (const item of directPatterns) {
      const match = item.pattern.exec(text);
      if (!match) continue;
      const date = item.getDate(match);
      phrases.push({ phrase: match[0], start: match.index, end: match.index + match[0].length, type: 'date' });
      return {
        date,
        phrase: match[0],
        start: match.index,
        end: match.index + match[0].length,
        confidence: item.confidence,
      };
    }

    const weekdayRegex = /\b(?:(this|next)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi;
    const weekdayMatch = weekdayRegex.exec(text);
    if (weekdayMatch) {
      const qualifier = (weekdayMatch[1]?.toLowerCase() as 'this' | 'next' | undefined);
      const weekdayIndex = WEEKDAYS.indexOf(weekdayMatch[2].toLowerCase() as (typeof WEEKDAYS)[number]);
      const date = getNextWeekday(this.now, weekdayIndex, qualifier);
      phrases.push({ phrase: weekdayMatch[0], start: weekdayMatch.index, end: weekdayMatch.index + weekdayMatch[0].length, type: 'date' });
      return {
        date,
        phrase: weekdayMatch[0],
        start: weekdayMatch.index,
        end: weekdayMatch.index + weekdayMatch[0].length,
        confidence: qualifier ? 0.88 : 0.9,
      };
    }

    const isoRegex = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
    const isoMatch = isoRegex.exec(text);
    if (isoMatch) {
      const date = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
      date.setHours(0, 0, 0, 0);
      phrases.push({ phrase: isoMatch[0], start: isoMatch.index, end: isoMatch.index + isoMatch[0].length, type: 'date' });
      return {
        date,
        phrase: isoMatch[0],
        start: isoMatch.index,
        end: isoMatch.index + isoMatch[0].length,
        confidence: 0.96,
      };
    }

    if (/\btonight\b/i.test(lowerText)) {
      const date = cloneDate(this.now);
      date.setHours(0, 0, 0, 0);
      const match = /\btonight\b/i.exec(text);
      if (match) {
        phrases.push({ phrase: match[0], start: match.index, end: match.index + match[0].length, type: 'date' });
        return {
          date,
          phrase: match[0],
          start: match.index,
          end: match.index + match[0].length,
          confidence: 0.8,
        };
      }
    }

    return undefined;
  }

  private extractPartOfDay(text: string, phrases: TemporalPhrase[]): PartOfDaySpec | undefined {
    for (const part of PARTS_OF_DAY) {
      const match = part.pattern.exec(text);
      if (!match) continue;

      const startTime: TimeSpec = {
        hours: part.startHour,
        minutes: part.startMinute ?? 0,
        phrase: match[0],
        start: match.index,
        end: match.index + match[0].length,
        confidence: part.confidence,
      };

      const endTime = part.endHour !== undefined
        ? {
            hours: part.endHour,
            minutes: part.endMinute ?? 0,
            phrase: match[0],
            start: match.index,
            end: match.index + match[0].length,
            confidence: part.confidence,
          }
        : undefined;

      phrases.push({ phrase: match[0], start: match.index, end: match.index + match[0].length, type: 'time' });
      return {
        startTime,
        endTime,
        phrase: match[0],
        start: match.index,
        end: match.index + match[0].length,
        confidence: part.confidence,
      };
    }

    return undefined;
  }

  private extractRange(text: string, partOfDaySpec: PartOfDaySpec | undefined, phrases: TemporalPhrase[]): RangeSpec | undefined {
    const rangeRegex = /\b(?:from\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:-|to)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/gi;
    const match = rangeRegex.exec(text);
    if (!match) return undefined;

    const contextStart = partOfDaySpec?.startTime.hours;
    const endTime = parseTimeValue(match[2], undefined, contextStart);
    const endMeridiem = /am|pm/i.exec(match[2])?.[0]?.toLowerCase() as 'am' | 'pm' | undefined;
    const startTime = parseTimeValue(match[1], endMeridiem, contextStart);
    if (!startTime || !endTime) return undefined;

    if (endTime.hours < startTime.hours || (endTime.hours === startTime.hours && endTime.minutes < startTime.minutes)) {
      if (endTime.hours < 12) endTime.hours += 12;
    }

    startTime.start = match.index;
    startTime.end = match.index + match[1].length;
    endTime.start = match.index + match[0].lastIndexOf(match[2]);
    endTime.end = endTime.start + match[2].length;

    phrases.push({ phrase: match[0], start: match.index, end: match.index + match[0].length, type: 'range' });

    return {
      startTime,
      endTime,
      phrase: match[0],
      start: match.index,
      end: match.index + match[0].length,
      confidence: 0.93,
    };
  }

  private extractTime(text: string, rangeSpec: RangeSpec | undefined, phrases: TemporalPhrase[]): TimeSpec | undefined {
    if (rangeSpec) return undefined;

    const timeRegex = /\b(\d{1,2}(?::\d{2})?\s*(?:am|pm)|\d{1,2}:\d{2})\b/gi;
    const match = timeRegex.exec(text);
    if (!match) return undefined;

    const parsed = parseTimeValue(match[1]);
    if (!parsed) return undefined;

    phrases.push({ phrase: match[0], start: match.index, end: match.index + match[0].length, type: 'time' });
    return {
      ...parsed,
      phrase: match[0],
      start: match.index,
      end: match.index + match[0].length,
    };
  }

  private extractDuration(text: string, phrases: TemporalPhrase[]): DurationSpec | undefined {
    const durationRegex = /\bfor\s+(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours)\b/gi;
    const match = durationRegex.exec(text);
    if (!match) return undefined;

    const value = Number(match[1]);
    const unit = match[2].toLowerCase();
    const minutes = /^h|hr|hrs|hour|hours$/.test(unit) ? value * 60 : value;

    phrases.push({ phrase: match[0], start: match.index, end: match.index + match[0].length, type: 'duration' });
    return {
      minutes,
      phrase: match[0],
      start: match.index,
      end: match.index + match[0].length,
      confidence: 0.94,
    };
  }

  private detectIntent(
    text: string,
    lowerText: string,
    extracted: Pick<ParseContext, 'dateSpec' | 'partOfDaySpec' | 'rangeSpec' | 'timeSpec' | 'durationSpec'>
  ): IntentScore {
    const score: IntentScore = { due: 0, scheduled: 0, dueReasons: [], scheduledReasons: [] };

    for (const pattern of DUE_CUE_PATTERNS) {
      if (pattern.test(text)) {
        score.due += pattern.source.includes('submit') || pattern.source.includes('due') ? 3 : 2.5;
        score.dueReasons.push(pattern.source);
      }
    }

    for (const pattern of SCHEDULE_CUE_PATTERNS) {
      if (pattern.test(text)) {
        score.scheduled += pattern.source.includes('for') || pattern.source.includes('from') ? 2.5 : 1.8;
        score.scheduledReasons.push(pattern.source);
      }
    }

    if (extracted.rangeSpec) {
      score.scheduled += 4;
      score.scheduledReasons.push('range');
    }
    if (extracted.durationSpec) {
      score.scheduled += 4;
      score.scheduledReasons.push('duration');
    }
    if (extracted.partOfDaySpec) {
      score.scheduled += 1.8;
      score.scheduledReasons.push('part_of_day');
    }

    if (extracted.timeSpec && /\bbefore\b/i.test(text)) {
      score.due += 3;
      score.dueReasons.push('before_time');
    }
    if (extracted.timeSpec && /\bafter\b/i.test(text)) {
      score.scheduled += 2.5;
      score.scheduledReasons.push('after_time');
    }

    if (extracted.dateSpec && !extracted.timeSpec && !extracted.rangeSpec && !extracted.partOfDaySpec) {
      score.due += 1.6;
      score.dueReasons.push('date_only_default');
    }

    if ((extracted.timeSpec || extracted.rangeSpec) && !extracted.dateSpec) {
      score.scheduled += 0.8;
      score.scheduledReasons.push('time_without_date_default');
    }

    if (/\bmeeting\b|\bcall\b|\bstudy\b|\bwork on\b|\bfocus on\b/i.test(lowerText)) {
      score.scheduled += 1.5;
      score.scheduledReasons.push('task_shape_schedule');
    }

    return score;
  }

  private shouldReturnAmbiguity(context: ParseContext, dueScore: number, scheduledScore: number): boolean {
    const hasExplicitDueCue = dueScore >= 2.5;
    const hasExplicitScheduleCue =
      scheduledScore >= 2.5 || Boolean(context.rangeSpec || context.durationSpec);

    if (hasExplicitDueCue || hasExplicitScheduleCue) return false;

    const hasExactTime = Boolean(context.timeSpec);
    const hasPartOfDayOnly = Boolean(context.partOfDaySpec && !context.timeSpec && !context.rangeSpec);
    const hasDate = Boolean(context.dateSpec);

    if (context.rangeSpec || context.durationSpec) return false;
    if (hasPartOfDayOnly) return false;
    if (hasDate && hasExactTime) return true;
    return false;
  }

  private buildInterpretation(context: ParseContext, options: BuildOptions): ParsedTemporal {
    const cleanedText = removePhrases(context.originalText, context.phrases);
    const baseDate = cloneDate(context.dateSpec?.date || this.now);
    baseDate.setHours(0, 0, 0, 0);

    const result: ParsedTemporal = {
      cleanedText,
      confidence: options.forceAmbiguous
        ? 'medium'
        : toConfidence(this.getConfidence(context, options.interpretation)),
      interpretation_type: options.interpretation,
      detectedPhrases: context.phrases,
      extractedTemporalSpans: context.phrases,
      is_all_day: false,
    };

    const startTime = context.rangeSpec?.startTime || context.timeSpec || context.partOfDaySpec?.startTime;
    const endTime = context.rangeSpec?.endTime || context.partOfDaySpec?.endTime;

    if (options.interpretation === 'due') {
      result.due_date = toDateKey(baseDate);

      if (startTime) {
        result.due_time = toTimeKey(startTime.hours, startTime.minutes);
      }

      if (!startTime) {
        result.is_all_day = true;
      }

      return result;
    }

    result.scheduled_date = toDateKey(baseDate);

    if (startTime) {
      result.scheduled_time = toTimeKey(startTime.hours, startTime.minutes);
      result.start_time = result.scheduled_time;
    } else {
      result.is_all_day = true;
    }

    if (context.durationSpec && startTime) {
      const endDate = addMinutes(withTime(baseDate, startTime), context.durationSpec.minutes);
      result.duration_minutes = context.durationSpec.minutes;
      result.end_time = toTimeKey(endDate.getHours(), endDate.getMinutes());
    } else if (endTime) {
      result.end_time = toTimeKey(endTime.hours, endTime.minutes);
      if (startTime) {
        const startDate = withTime(baseDate, startTime);
        const endDate = withTime(baseDate, endTime);
        result.duration_minutes = Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 60000));
      }
    }

    return result;
  }

  private getConfidence(context: ParseContext, interpretation: 'due' | 'scheduled'): number {
    const dateConfidence = context.dateSpec?.confidence ?? 0.6;
    const timeConfidence =
      context.rangeSpec?.confidence ??
      context.timeSpec?.confidence ??
      context.partOfDaySpec?.confidence ??
      0.6;

    const cueWeight = interpretation === 'due' ? context.intent.due : context.intent.scheduled;
    const baseline = interpretation === 'due'
      ? (context.timeSpec || context.partOfDaySpec ? 0.74 : 0.9)
      : (context.rangeSpec || context.durationSpec ? 0.92 : 0.82);

    return Math.min(0.97, baseline + cueWeight * 0.04 + (dateConfidence + timeConfidence) * 0.05);
  }
}

export function parseTemporal(
  input: string,
  locale?: string,
  timezone?: string,
  now?: Date
): ParsedTemporal {
  const parser = new TemporalParser(locale, timezone, now);
  return parser.parse(input);
}
