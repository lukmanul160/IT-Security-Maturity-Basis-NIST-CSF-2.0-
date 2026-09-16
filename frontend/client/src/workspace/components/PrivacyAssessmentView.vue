<!-- Static DOM retained for existing feature runtime. Keep IDs and classes stable. -->
<template>
<section v-pre id="privacyAssessmentView" class="view">
          <div class="page-heading assessment-heading"><div><button class="back-link" id="privacyBackButton" type="button"><- Back to Privacy overview</button><p class="eyebrow" id="privacyAssessmentKicker">FUNCTION / PRIVACY FRAMEWORK CORE</p><h2 id="privacyAssessmentTitle">Identify-P</h2><p class="lede" id="privacyAssessmentDescription"></p></div><div class="assessment-progress"><span id="privacyFunctionProgress">0 / 0</span><div class="meter"><span id="privacyFunctionMeter"></span></div></div></div>
          <div class="toolbar"><label class="search-box"><span>/</span><input id="privacyAssessmentSearch" type="search" placeholder="Search subcategories..." autocomplete="off"></label><select id="privacyAssessmentStatus" aria-label="Filter Privacy status"><option value="all">All controls</option><option value="unscored">Unscored</option><option value="scored">Scored</option><option value="gaps">Below target</option></select></div>
          <div class="assessment-table"><div class="table-head"><span>Subcategory</span><span>Policy and Practice maturity</span><span>Policy and Practice Action Notes</span></div><div id="privacyControlList"></div><div class="assessment-pagination" id="privacyFunctionPagination"></div></div>
        </section>
</template>
