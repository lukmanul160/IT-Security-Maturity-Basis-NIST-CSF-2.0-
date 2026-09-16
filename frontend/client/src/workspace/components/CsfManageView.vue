<!-- Static DOM retained for existing feature runtime. Keep IDs and classes stable. -->
<template>
<section v-pre id="csfManageView" class="view">
          <div class="page-heading"><div><p class="eyebrow">FRAMEWORK ADMINISTRATION</p><h2>Manage CSF 2.0</h2><p class="lede">Create, read, update, and delete CSF controls directly in PostgreSQL.</p></div><div class="csf-actions"><button class="button button-accent" id="csfManageNewButton" type="button">New CSF control</button><span class="file-count" id="csfManageCount">0 controls</span></div></div>
          <dialog id="csfManageModal" class="certification-modal"><form id="csfForm" class="tw-surface risk-register-form" style="padding:20px;border:1px solid var(--line);border-radius:8px">
            <input id="csfFormOriginalId" type="hidden">
            <div class="section-heading compact"><div><p class="eyebrow" id="csfFormMode">NEW CONTROL</p><h3 id="csfFormTitle">Create CSF control</h3></div><span class="muted">All fields are saved to PostgreSQL</span></div>
            <div class="csf-form-grid"><label>Control ID<input id="csfFormId" required placeholder="GV.OC-01"></label><label>Function<input id="csfFormFunction" required placeholder="Govern"></label><label>Category<input id="csfFormCategory" required></label><label>Subcategory<input id="csfFormSubcategory" required></label><label>Implementation examples<textarea id="csfFormImplementation" rows="3"></textarea></label><label>Informative references<textarea id="csfFormReferences" rows="3"></textarea></label></div>
            <div class="csf-form-actions"><button class="button button-accent" type="submit" id="csfFormSubmit">Create control</button><button class="button button-quiet" type="button" id="csfFormCancel">Clear form</button><span class="save-state" id="csfFormStatus">Ready</span></div>
          </form></dialog>
          <div class="toolbar"><label class="search-box"><span>/</span><input id="csfManageSearch" type="search" placeholder="Search controls..." autocomplete="off"></label></div>
          <div class="excel-wrap"><table class="excel-table"><thead><tr><th>Control</th><th>Function</th><th>Category</th><th>Subcategory</th><th>Actions</th></tr></thead><tbody id="csfManageBody"></tbody></table><div class="assessment-pagination" id="csfManagePagination"></div></div>
        </section>
</template>
