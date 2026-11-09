/** All inventory tables have a fixed maximum of twenty displayed rows. */
export function technologyTablePage(rows, requestedPage = 1) {
  const pages = Math.max(1, Math.ceil(rows.length / 20));
  const page = Math.max(1, Math.min(pages, Number.isInteger(requestedPage) ? requestedPage : 1));
  const offset = (page - 1) * 20;
  return { page, pages, total: rows.length, rows: rows.slice(offset, offset + 20) };
}
