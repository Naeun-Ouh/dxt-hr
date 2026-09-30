export interface Interval { start_date: string; end_date: string }
// Inclusive, UTC-normalized dates; this is interval coverage, not a utilization denominator.
export function coveredPeriods(intervals: Interval[], year: number) {
 if (!Number.isInteger(year) || year < 1900 || year > 9999) throw new Error('Invalid year');
 const first = `${year}-01-01`, last = `${year}-12-31`;
 const sorted = intervals.map(i => ({ start_date: i.start_date < first ? first : i.start_date, end_date: i.end_date > last ? last : i.end_date }))
  .filter(i => i.start_date <= i.end_date).sort((a,b) => a.start_date.localeCompare(b.start_date));
 const periods: Interval[] = [];
 for (const interval of sorted) {
  const previous = periods.at(-1);
  if (previous && Date.parse(interval.start_date) <= Date.parse(previous.end_date) + 86400000) {
   if (interval.end_date > previous.end_date) previous.end_date = interval.end_date;
  } else periods.push({...interval});
 }
 return { periods, days: periods.reduce((sum,i) => sum + (Date.parse(i.end_date)-Date.parse(i.start_date))/86400000+1,0) };
}
