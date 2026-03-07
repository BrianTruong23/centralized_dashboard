/**
 * Temporal Parser for Task Input
 * 
 * Extracts date/time phrases from free-form text and maps them to structured fields:
 * - due_date, due_time
 * - scheduled_date, scheduled_time
 * - is_all_day
 * 
 * Supports:
 * - Weekdays (Monday, Tuesday, etc.)
 * - Relative dates (today, tomorrow, next week, etc.)
 * - Parts of day (morning, afternoon, evening, night)
 * - Clock times (5pm, 3:30, 14:00, etc.)
 */

export interface ParsedTemporal {
  due_date?: string; // ISO date string (YYYY-MM-DD)
  due_time?: string; // ISO time string (HH:MM:SS)
  scheduled_date?: string; // ISO date string
  scheduled_time?: string; // ISO time string
  is_all_day?: boolean;
  confidence: 'high' | 'medium' | 'low' | 'ambiguous';
  ambiguous?: string[]; // Alternative interpretations
  cleanedText: string; // Text with temporal phrases removed
}

interface TemporalMatch {
  phrase: string;
  type: 'date' | 'time' | 'datetime' | 'relative' | 'weekday' | 'part_of_day';
  value: Date | null;
  confidence: number;
  originalText: string;
}

export class TemporalParser {
  private now: Date;
  private locale: string;
  private timezone: string;

  constructor(locale: string = 'en-US', timezone: string = Intl.DateTimeFormat().resolvedOptions().timeZone) {
    this.now = new Date();
    this.locale = locale;
    this.timezone = timezone;
  }

  /**
   * Parse temporal information from task input text
   */
  parse(input: string): ParsedTemporal {
    const originalText = input.trim();
    if (!originalText) {
      return {
        cleanedText: '',
        confidence: 'high',
      };
    }

    // Find all temporal matches
    const matches = this.findTemporalMatches(originalText);
    
    if (matches.length === 0) {
      return {
        cleanedText: originalText,
        confidence: 'high',
      };
    }

    // Sort matches by confidence and position
    matches.sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return a.originalText.indexOf(a.phrase) - b.originalText.indexOf(b.phrase);
    });

    // Check for ambiguity
    const highConfidenceMatches = matches.filter(m => m.confidence >= 0.8);
    const mediumConfidenceMatches = matches.filter(m => m.confidence >= 0.5 && m.confidence < 0.8);
    
    if (highConfidenceMatches.length > 1) {
      // Multiple high-confidence matches - check if they're compatible
      const uniqueDates = new Set(highConfidenceMatches.map(m => m.value?.toISOString().split('T')[0]));
      if (uniqueDates.size > 1) {
        return {
          cleanedText: this.removeTemporalPhrases(originalText, matches),
          confidence: 'ambiguous',
          ambiguous: highConfidenceMatches.map(m => m.phrase),
        };
      }
    }

    if (mediumConfidenceMatches.length > 0 && highConfidenceMatches.length === 0) {
      // Only medium confidence matches
      return {
        cleanedText: this.removeTemporalPhrases(originalText, matches),
        confidence: 'medium',
        ambiguous: mediumConfidenceMatches.map(m => m.phrase),
      };
    }

    // Extract the best match
    const bestMatch = matches[0];
    if (!bestMatch.value) {
      return {
        cleanedText: this.removeTemporalPhrases(originalText, matches),
        confidence: 'low',
      };
    }

    // Determine if it's a due date or scheduled date
    // If it contains "at" or time, it's likely scheduled; otherwise due date
    const hasTime = bestMatch.type === 'time' || bestMatch.type === 'datetime';
    const hasAt = /\bat\b/i.test(originalText);

    const dateStr = bestMatch.value.toISOString().split('T')[0];
    const timeStr = hasTime ? bestMatch.value.toTimeString().split(' ')[0].substring(0, 5) + ':00' : undefined;
    const isAllDay = !hasTime && !hasAt;

    const result: ParsedTemporal = {
      cleanedText: this.removeTemporalPhrases(originalText, matches),
      confidence: bestMatch.confidence >= 0.8 ? 'high' : bestMatch.confidence >= 0.5 ? 'medium' : 'low',
    };

    if (hasAt || hasTime) {
      result.scheduled_date = dateStr;
      if (timeStr) result.scheduled_time = timeStr;
      result.is_all_day = isAllDay;
    } else {
      result.due_date = dateStr;
      result.is_all_day = true;
    }

    return result;
  }

  /**
   * Find all temporal matches in the text
   */
  private findTemporalMatches(text: string): TemporalMatch[] {
    const matches: TemporalMatch[] = [];
    const lowerText = text.toLowerCase();

    // Weekday patterns
    const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const weekdayRegex = new RegExp(`\\b(next\\s+)?(${weekdays.join('|')})\\b`, 'gi');
    let match;
    while ((match = weekdayRegex.exec(text)) !== null) {
      const isNext = match[1]?.toLowerCase().includes('next');
      const weekday = weekdays.indexOf(match[2].toLowerCase());
      const date = this.getNextWeekday(weekday, isNext);
      matches.push({
        phrase: match[0],
        type: 'weekday',
        value: date,
        confidence: 0.9,
        originalText: text,
      });
    }

    // Relative date patterns
    const relativePatterns = [
      { pattern: /\btoday\b/gi, offset: 0 },
      { pattern: /\btomorrow\b/gi, offset: 1 },
      { pattern: /\byesterday\b/gi, offset: -1 },
      { pattern: /\bnext\s+week\b/gi, offset: 7 },
      { pattern: /\bnext\s+month\b/gi, offset: 30 },
      { pattern: /\bin\s+(\d+)\s+days?\b/gi, offset: (m: RegExpMatchArray) => parseInt(m[1]) },
      { pattern: /\b(\d+)\s+days?\s+from\s+now\b/gi, offset: (m: RegExpMatchArray) => parseInt(m[1]) },
    ];

    for (const { pattern, offset } of relativePatterns) {
      while ((match = pattern.exec(text)) !== null) {
        const daysOffset = typeof offset === 'function' ? offset(match) : offset;
        const date = new Date(this.now);
        date.setDate(date.getDate() + daysOffset);
        date.setHours(0, 0, 0, 0);
        matches.push({
          phrase: match[0],
          type: 'relative',
          value: date,
          confidence: 0.85,
          originalText: text,
        });
      }
    }

    // Time patterns
    const timePatterns = [
      { pattern: /\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/gi, parse: (m: RegExpMatchArray) => {
        let hours = parseInt(m[1]);
        const minutes = parseInt(m[2]);
        const ampm = m[3]?.toLowerCase();
        if (ampm === 'pm' && hours !== 12) hours += 12;
        if (ampm === 'am' && hours === 12) hours = 0;
        return { hours, minutes };
      }},
      { pattern: /\b(\d{1,2})\s*(am|pm)\b/gi, parse: (m: RegExpMatchArray) => {
        let hours = parseInt(m[1]);
        const ampm = m[2].toLowerCase();
        if (ampm === 'pm' && hours !== 12) hours += 12;
        if (ampm === 'am' && hours === 12) hours = 0;
        return { hours, minutes: 0 };
      }},
    ];

    for (const { pattern, parse } of timePatterns) {
      while ((match = pattern.exec(text)) !== null) {
        const time = parse(match);
        const date = new Date(this.now);
        date.setHours(time.hours, time.minutes, 0, 0);
        matches.push({
          phrase: match[0],
          type: 'time',
          value: date,
          confidence: 0.9,
          originalText: text,
        });
      }
    }

    // Part of day patterns
    const partOfDayPatterns = [
      { pattern: /\bmorning\b/gi, hours: 9 },
      { pattern: /\bafternoon\b/gi, hours: 14 },
      { pattern: /\bevening\b/gi, hours: 18 },
      { pattern: /\bnight\b/gi, hours: 20 },
    ];

    for (const { pattern, hours } of partOfDayPatterns) {
      while ((match = pattern.exec(text)) !== null) {
        const date = new Date(this.now);
        date.setHours(hours, 0, 0, 0);
        matches.push({
          phrase: match[0],
          type: 'part_of_day',
          value: date,
          confidence: 0.7,
          originalText: text,
        });
      }
    }

    // Mark date matches (weekday and relative are dates)
    for (const match of matches) {
      if (match.type === 'weekday' || match.type === 'relative') {
        match.type = 'date';
      }
    }

    // Combine date + time matches
    const combinedMatches = this.combineDateTimeMatches(matches, text);
    
    return combinedMatches.length > 0 ? combinedMatches : matches;
  }

  /**
   * Combine separate date and time matches into datetime matches
   */
  private combineDateTimeMatches(matches: TemporalMatch[], text: string): TemporalMatch[] {
    const combined: TemporalMatch[] = [];
    const dateMatches = matches.filter(m => m.type === 'date' || m.type === 'weekday' || m.type === 'relative');
    const timeMatches = matches.filter(m => m.type === 'time' || m.type === 'part_of_day');

    for (const dateMatch of dateMatches) {
      // Find time match within 20 characters
      const dateIndex = text.toLowerCase().indexOf(dateMatch.phrase.toLowerCase());
      const nearbyTime = timeMatches.find(tm => {
        const timeIndex = text.toLowerCase().indexOf(tm.phrase.toLowerCase());
        return Math.abs(timeIndex - dateIndex) < 20;
      });

      if (nearbyTime && dateMatch.value && nearbyTime.value) {
        const combinedDate = new Date(dateMatch.value);
        combinedDate.setHours(nearbyTime.value.getHours(), nearbyTime.value.getMinutes(), 0, 0);
        combined.push({
          phrase: `${dateMatch.phrase} ${nearbyTime.phrase}`,
          type: 'datetime',
          value: combinedDate,
          confidence: Math.min(dateMatch.confidence, nearbyTime.confidence),
          originalText: text,
        });
      } else if (dateMatch.value) {
        combined.push(dateMatch);
      }
    }

    // Add standalone time matches that weren't combined
    for (const timeMatch of timeMatches) {
      if (!combined.some(c => c.phrase.includes(timeMatch.phrase))) {
        const date = new Date(this.now);
        date.setHours(timeMatch.value?.getHours() || 0, timeMatch.value?.getMinutes() || 0, 0, 0);
        combined.push({
          ...timeMatch,
          value: date,
        });
      }
    }

    return combined;
  }

  /**
   * Get next occurrence of a weekday
   */
  private getNextWeekday(weekday: number, isNext: boolean): Date {
    const date = new Date(this.now);
    const currentDay = date.getDay();
    let daysUntil = (weekday - currentDay + 7) % 7;
    
    if (daysUntil === 0) daysUntil = 7; // Next week if today
    if (isNext) daysUntil += 7; // "Next Tuesday" means next week's Tuesday
    
    date.setDate(date.getDate() + daysUntil);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  /**
   * Remove temporal phrases from text
   */
  private removeTemporalPhrases(text: string, matches: TemporalMatch[]): string {
    let cleaned = text;
    
    // Sort by position (reverse) to remove from end to start
    const sortedMatches = [...matches].sort((a, b) => 
      text.indexOf(b.phrase) - text.indexOf(a.phrase)
    );

    for (const match of sortedMatches) {
      // Remove the phrase and surrounding "at" if present
      const regex = new RegExp(`\\s*\\bat\\s+${this.escapeRegex(match.phrase)}\\b|\\b${this.escapeRegex(match.phrase)}\\s*\\bat\\b|\\b${this.escapeRegex(match.phrase)}\\b`, 'gi');
      cleaned = cleaned.replace(regex, '');
    }

    // Clean up extra spaces
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    return cleaned;
  }

  /**
   * Escape special regex characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Update the current time reference
   */
  updateNow(newNow: Date = new Date()): void {
    this.now = newNow;
  }
}

/**
 * Convenience function to parse temporal information
 */
export function parseTemporal(input: string, locale?: string, timezone?: string): ParsedTemporal {
  const parser = new TemporalParser(locale, timezone);
  return parser.parse(input);
}
