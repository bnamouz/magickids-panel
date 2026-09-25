import type { loadIntakeQueue } from './queue';

type CaseRow = Awaited<ReturnType<typeof loadIntakeQueue>>[number];
export const DIRECTORY_PAGE_SIZE = 10;

/** Staff-only directory; archived cases stay searchable, never re-opened. */
export function caseDirectory(rows: CaseRow[], search = '', requestedPage = '1') {
  const query = search.trim().slice(0, 120);
  const needle = query.toLocaleLowerCase();
  const matches = rows.filter(row =>
    [row.childName, row.parentName].some(name => name.toLocaleLowerCase().includes(needle)),
  ).sort((a, b) => {
    const latest = (row: CaseRow) => Math.max(...[row.parentSubmittedAt, row.teacherSubmittedAt, row.createdAt]
      .map(value => value ? Date.parse(value) : 0).map(value => Number.isFinite(value) ? value : 0));
    return latest(b) - latest(a) || a.id.localeCompare(b.id);
  });
  const pageCount = Math.max(1, Math.ceil(matches.length / DIRECTORY_PAGE_SIZE));
  const parsed = Number(requestedPage);
  const page = Math.min(pageCount, Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1);
  return { query, page, pageCount, total: matches.length,
    rows: matches.slice((page - 1) * DIRECTORY_PAGE_SIZE, page * DIRECTORY_PAGE_SIZE) };
}
