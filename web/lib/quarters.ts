export interface Quarter {
  value: string;
  label: string;
  start: Date;
  end: Date;
}

export function getQuartersForYear(year: number): Quarter[] {
  return [
    {
      value: `${year}-Q1`,
      label: `T1 ${year}`,
      start: new Date(year, 0, 1),
      end: new Date(year, 2, 31),
    },
    {
      value: `${year}-Q2`,
      label: `T2 ${year}`,
      start: new Date(year, 3, 1),
      end: new Date(year, 5, 30),
    },
    {
      value: `${year}-Q3`,
      label: `T3 ${year}`,
      start: new Date(year, 6, 1),
      end: new Date(year, 8, 30),
    },
    {
      value: `${year}-Q4`,
      label: `T4 ${year}`,
      start: new Date(year, 9, 1),
      end: new Date(year, 11, 31),
    },
  ];
}

export function getCurrentQuarter(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const q = Math.floor(month / 3) + 1;
  return `${year}-Q${q}`;
}

export function getQuarterRange(quarterValue: string): { start: string; end: string } {
  const [year, q] = quarterValue.split('-Q');
  const y = parseInt(year);
  const qNum = parseInt(q);
  const startMonth = (qNum - 1) * 3;
  const endMonth = startMonth + 2;

  const start = new Date(y, startMonth, 1);
  const end = new Date(y, endMonth + 1, 0);

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export function isDateInQuarter(date: string, quarterValue: string): boolean {
  const { start, end } = getQuarterRange(quarterValue);
  return date >= start && date <= end;
}
