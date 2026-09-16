<!-- Static DOM retained for existing feature runtime. Keep IDs and classes stable. -->
<template>
<section v-pre id="privacyManageView" class="view">
          <div class="page-heading"><div><p class="eyebrow">FRAMEWORK ADMINISTRATION</p><h2>Manage Privacy Framework</h2><p class="lede">Create, update, and delete Privacy Framework Core controls stored in PostgreSQL.</p></div><div class="csf-actions"><button class="button button-accent" id="privacyManageNewButton" type="button">New Privacy control</button><span class="file-count" id="privacyManageCount">0 controls</span></div></div>
          <dialog id="privacyManageModal" class="certification-modal"><form id="privacyForm" class="tw-surface risk-register-form" style="padding:20px;border:1px solid var(--line);border-radius:8px">
            <input id="privacyFormOriginalId" type="hidden">
            <div class="section-heading compact"><div><p class="eyebrow" id="privacyFormMode">NEW CONTROL</p><h3 id="privacyFormTitle">Create Privacy control</h3></div><span class="muted">All fields are saved to PostgreSQL</span></div>
            <div class="csf-form-grid"><label>Control ID<input id="privacyFormId" required placeholder="ID.IM-P1"></label><label>Function<input id="privacyFormFunction" required placeholder="IDENTIFY-P"></label><label>Category<input id="privacyFormCategory" required></label><label>Subcategory<input id="privacyFormSubcategory" required></label><label>Implementation examples<textarea id="privacyFormImplementation" rows="3"></textarea></label><label>Informative references<textarea id="privacyFormReferences" rows="3"></textarea></label></div>
            <div class="csf-form-actions"><button class="button button-accent" type="submit" id="privacyFormSubmit">Create control</button><button class="button button-quiet" type="button" id="privacyFormCancel">Clear form</button><span class="save-state" id="privacyFormStatus">Ready</span></div>
          </form></dialog>
          <div class="toolbar"><label class="search-box"><span>/</span><input id="privacyManageSearch" type="search" placeholder="Search Privacy controls..." autocomplete="off"></label></div>
          <div class="excel-wrap"><table class="excel-table"><thead><tr><th>Control</th><th>Function</th><th>Category</th><th>Subcategory</th><th>Actions</th></tr></thead><tbody id="privacyManageBody"></tbody></table><div class="assessment-pagination" id="privacyManagePagination"></div></div>
        </section>
</template>
