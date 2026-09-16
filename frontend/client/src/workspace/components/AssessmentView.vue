<!-- Static DOM retained for existing feature runtime. Keep IDs and classes stable. -->
<template>
<section v-pre id="assessmentView" class="view">
          <div class="page-heading assessment-heading"><div><button class="back-link" id="backButton" type="button"><- Back to overview</button><p class="eyebrow" id="assessmentKicker">FUNCTION</p><h2 id="assessmentTitle">Govern</h2><p class="lede" id="assessmentDescription"></p></div><div class="assessment-progress"><span id="functionProgress">0 / 4</span><div class="meter"><span id="functionMeter"></span></div></div></div>
          <div class="toolbar"><label class="search-box"><span>/</span><input id="searchInput" type="search" placeholder="Search subcategories..." autocomplete="off"></label><select id="statusFilter" aria-label="Filter status"><option value="all">All controls</option><option value="unscored">Unscored</option><option value="scored">Scored</option><option value="gaps">Below target</option></select></div>
          <div class="assessment-table"><div class="table-head"><span>Subcategory</span><span>Policy and Practice maturity</span><span>Policy and Practice Action Notes</span></div><div id="controlList"></div><div class="assessment-pagination" id="csfAssessmentPagination"></div></div>
        </section>
</template>
