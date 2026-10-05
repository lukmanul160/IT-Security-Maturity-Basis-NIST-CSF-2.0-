<!-- Static DOM retained for existing feature runtime. Keep IDs and classes stable. -->
<template>
<header v-pre class="topbar tw-accent-line tw-surface">
      <div class="brand-block">
        <img class="brand-mark" src="/brand-logo.png" alt="Logo Black Owl Governance" width="38" height="38" style="object-fit:contain;background:transparent;border-radius:50%">
        <div>
          <strong class="brand-title">Black Owl Governance</strong>
          <p class="eyebrow">Align Your IT With Business need</p>
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
