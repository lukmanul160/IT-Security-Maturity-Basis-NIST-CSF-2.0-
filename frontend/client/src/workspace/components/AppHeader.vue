<!-- Static DOM retained for existing feature runtime. Keep IDs and classes stable. -->
<template>
<header v-pre class="topbar tw-accent-line tw-surface">
      <div class="brand-block">
        <div class="brand-mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z"/><path d="m8 12 3 3 5-6"/></svg></div>
        <div>
          <strong class="brand-title">NIST Basis</strong>
          <p class="eyebrow">IT GOVERNANCE WORKSPACE</p>
        </div>
      </div>
      <div class="top-actions">
        <span class="save-state" id="saveState">Autosaved</span>
        <span class="user-session" id="currentUser"></span>
          <button class="button button-quiet" id="accountButton" type="button" aria-label="Account Management">Account</button>
        <button class="button button-quiet" id="logoutButton" type="button">Logout</button>
      </div>
    </header>
</template>
