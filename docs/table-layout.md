# Adjustable list columns

Data tables throughout the workspace now expose a resize handle at the right edge of each column heading. Drag a handle horizontally to change that column, double-click it to fit the currently displayed content, or focus it and use Left/Right (10 pixels), Shift+Left/Right (50 pixels), or Enter (fit content).

Each table has a **Reset lebar / Reset widths** button. Column widths persist in the current browser and are independent for each table. Filtering, pagination, switching views and reloading preserve those preferences. Reset restores the initial widths and removes the saved preference for that table.

Policy Register starts with a 340-pixel title column and wider owner, attachment and related-knowledge columns. Wide tables scroll horizontally inside their containers; text wraps and row height adapts to its content. Resize controls work in light/dark themes and on touch screens without changing business records.

The shared installer covers visible tables with a `thead`, including dynamically rendered dialogs and merged header layouts. Document-editor tables retain their own editing behavior. Developers can disable the helper with `data-table-resize="off"` or provide an explicit stable identity using `data-resize-key`. Existing table IDs, tbody IDs or containing panel IDs otherwise identify stored preferences.

Checks: `node --test test/tableResize.test.js` and `node scripts/test-table-resize-browser.js`.
