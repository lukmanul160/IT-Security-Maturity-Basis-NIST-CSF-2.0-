<!-- Static DOM retained for existing feature runtime. Keep IDs and classes stable. -->
<template>
<header v-pre class="topbar tw-accent-line tw-surface">
      <div class="header-owl-track" aria-hidden="true">
        <div class="header-owl-walker"><span class="header-owl-dream">Z<span>z</span></span>
          <svg class="header-owl" viewBox="0 0 64 80" width="56" height="64" xmlns="http://www.w3.org/2000/svg">
            <g class="header-owl-body" fill="#edc341">
              <path d="M9 3 24 10Q32 6 40 10L55 3 50 20Q54 28 49 34Q59 51 48 69L38 73 32 78 26 73 16 69Q5 51 15 34Q10 28 14 20Z"/>
              <path d="M15 34Q4 49 12 67L20 60 24 43ZM49 34Q60 49 52 67L44 60 40 43Z"/>
              <g class="header-owl-feathers" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <path d="m13 9 12 8 7 10 7-10 12-8M16 14l9 5m23-5-9 5M16 32l9 5 7-4 7 4 9-5M19 37l6 5 7-5 7 5 6-5M21 45l5 6 6-7 6 7 5-6M22 54l5 7 5-7 5 7 5-7M26 65l6 7 6-7M14 43l-2 9 6-5m-5 10 6-5m-3 10 5-6M50 43l2 9-6-5m5 10-6-5m3 10-5-6"/>
                <path d="M17 19Q23 13 29 22L26 31Q17 34 16 24M47 19Q41 13 35 22L38 31Q47 34 48 24"/>
              </g>
              <g class="header-owl-awake"><ellipse cx="23" cy="24" rx="4" ry="5" fill="#192b36"/><ellipse cx="41" cy="24" rx="4" ry="5" fill="#192b36"/><circle cx="24" cy="22" r="1.2" fill="#fff3ba"/><circle cx="42" cy="22" r="1.2" fill="#fff3ba"/></g>
              <g class="header-owl-asleep" fill="none" stroke="#192b36" stroke-width="2" stroke-linecap="round"><path d="M19 24q4 5 8 0M37 24q4 5 8 0"/></g>
              <path d="m29 27 3 9 3-9Z" fill="#a87713"/>
            </g><g fill="none" stroke="#edc341" stroke-width="2.4" stroke-linecap="round"><path class="header-owl-foot left" d="M22 69v7m-4 1 4-3 4 3"/><path class="header-owl-foot right" d="M42 69v7m-4 1 4-3 4 3"/></g>

          </svg>
        </div>
      </div>
      <div class="brand-block">
        <img class="brand-mark" src="/brand-logo.png" alt="Logo Black Owl Governance" width="38" height="38" style="object-fit:contain;background:transparent;border-radius:50%">
        <div>
          <strong class="brand-title">Black Owl Governance</strong>
          <p class="eyebrow">Align Your IT With Business need</p>
        </div>
      </div>
      <div class="top-actions">
        <button type="button" class="button button-quiet theme-toggle" data-theme-toggle aria-label="Switch to dark mode" aria-pressed="false"><svg data-theme-icon="moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 13a8.5 8.5 0 0 1-9.5-9.5A8.5 8.5 0 1 0 20.5 13Z"/></svg><svg data-theme-icon="sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg><span data-theme-label>Dark mode</span></button>
        <span class="save-state" id="saveState">Autosaved</span>
        <span class="user-session" id="currentUser"></span>
          <button class="button button-quiet" id="accountButton" type="button" aria-label="Account Management">Account</button>
        <button class="button button-quiet" id="logoutButton" type="button">Logout</button>
      </div>
    </header>
</template>
