<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { api, type SessionSummary } from '@/api'
import { describeError } from '@/messages'
import CreateSessionForm from '@/components/CreateSessionForm.vue'
import SessionCard from '@/components/SessionCard.vue'

const REFRESH_MS = 15_000

// What's typed in the field, and the email the page shows results for. Only
// submitting (the Enter key or button) copies one to the other. Neither is
// saved, so every page load starts fresh.
const draftEmail = ref('')
const email = ref('')
const emailPending = computed(() => draftEmail.value !== email.value)
const sessions = ref<SessionSummary[]>([])
const loading = ref(true)
const loadError = ref('')

// A new email means a new person: reload, so the page shows their
// registrations and none of the previous person's messages.
watch(email, () => {
  void load()
})

function applyEmail() {
  if (emailPending.value) {
    email.value = draftEmail.value // the watcher reloads for the new email
  } else {
    void load() // the same email again: just refresh
  }
}

let latestLoad = 0

async function load() {
  const thisLoad = ++latestLoad
  try {
    const result = await api.listSessions(email.value)
    // Drop answers to older requests, such as one made for the previous email.
    if (thisLoad !== latestLoad) return
    sessions.value = result
    loadError.value = ''
  } catch (error) {
    if (thisLoad === latestLoad) loadError.value = describeError(error)
  } finally {
    loading.value = false
  }
}

// Refresh periodically so seat counts and open/closed states stay current.
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  void load()
  timer = setInterval(load, REFRESH_MS)
})
onUnmounted(() => clearInterval(timer))
</script>

<template>
  <main>
    <header>
      <h1>Upcoming sessions</h1>
      <form class="email" @submit.prevent="applyEmail">
        <label for="email">Your email</label>
        <div class="email-row">
          <input
            id="email"
            v-model.trim="draftEmail"
            type="email"
            placeholder="you@example.org"
            autocomplete="email"
          />
          <button type="submit">Enter</button>
        </div>
        <p v-if="emailPending" class="hint">
          Press Enter to {{ draftEmail ? 'show results for this email' : 'clear the email' }}.
        </p>
      </form>
    </header>

    <p v-if="loadError" class="feedback error" role="alert">
      {{ loadError }}
      <button type="button" class="secondary" @click="load">Try again</button>
    </p>
    <p v-else-if="loading">Loading sessions…</p>
    <p v-else-if="sessions.length === 0" class="empty">
      No upcoming sessions. Create one below, or run <code>npm run seed</code> in
      <code>backend/</code>.
    </p>

    <section class="sessions">
      <SessionCard
        v-for="session in sessions"
        :key="session.id"
        :session="session"
        :email="email"
        :email-pending="emailPending"
        @changed="load"
      />
    </section>

    <details class="organizer">
      <summary>Create a session</summary>
      <CreateSessionForm @created="load" />
    </details>
  </main>
</template>
