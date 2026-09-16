# Workspace components

Edit page markup in its `.vue` file here. `AppHeader.vue` and `AppSidebar.vue` own shared navigation; the `*View.vue` files own each page, including its existing forms and dialogs.

`../source.html` now contains the outer layout, shared styles, enhancement scripts and `workspace-component:Name` markers. `scripts/prepare-vue-client.js` uses those markers to generate `WorkspaceLayout.vue` with explicit component imports. Do not edit generated files. Add a marker and matching component file to register a new view.

The initial migration deliberately retains static DOM (`v-pre`) and existing IDs/classes. The feature scripts in `../features/` still own state, event handling, visibility and rendered lists. All components mount before runtime initialization; do not introduce lazy mounting or `v-if` for these pages without updating their DOM dependencies. Literal email placeholders such as `{{owner}}` remain text, not Vue expressions.

Run `npm run build:client` and `npm run test:browser` after structural changes. A future reactive migration should move both markup and its state/event handlers together, feature by feature.
