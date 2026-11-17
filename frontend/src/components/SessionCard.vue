<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { api, type SessionSummary } from '@/api'
import { formatDateTime } from '@/format'
import { describeError } from '@/messages'

const props = defineProps<{
  session: SessionSummary
  email: string
  /** The email field holds a change that hasn't been entered yet. */
  emailPending: boolean
}>()
const emit = defineEmits<{ changed: [] }>()

const busy = ref(false)
const feedback = ref<{ ok: boolean; text: string } | null>(null)

// A message belongs to whoever acted, so clear it when the email changes.
watch(
  () => props.email,
  () => {
    feedback.value = null
  },
)

const isFull = computed(() => props.session.seatsRemaining <= 0)
const canRegister = computed(
  () =>
    !props.emailPending &&
    !props.session.isRegistered &&
    props.session.registrationStatus === 'open' &&
    !isFull.value,
)

const seatsText = computed(() => {
  const { seatsRemaining, capacity } = props.session
  if (seatsRemaining <= 0) return `Full (${capacity} of ${capacity} seats taken)`
  return `${seatsRemaining} of ${capacity} ${capacity === 1 ? 'seat' : 'seats'} left`
})

const windowText = computed(() => {
  const { registrationStatus, registrationOpensAt, registrationClosesAt } = props.session
  if (registrationStatus === 'not_open') {
    return `Registration opens ${formatDateTime(registrationOpensAt)}`
  }
  if (registrationStatus === 'closed') {
    return `Registration closed ${formatDateTime(registrationClosesAt)}`
  }
  return `Registration open until ${formatDateTime(registrationClosesAt)}`
})

async function run(action: (email: string) => Promise<void>, success?: string) {
  const email = props.email.trim()
  if (!email) {
    feedback.value = { ok: false, text: 'Enter your email address at the top first.' }
    return
  }
  busy.value = true
  feedback.value = null
  try {
    await action(email)
    feedback.value = success ? { ok: true, text: success } : null
  } catch (error) {
    feedback.value = { ok: false, text: describeError(error) }
  } finally {
    busy.value = false
    // Refresh either way: a rejection such as "full" means our numbers were stale.
    emit('changed')
  }
}

// No success message here: once the list reloads, the card itself says "You're registered".
const register = () => run((email) => api.register(props.session.id, email))

const unregister = () =>
  run(
    (email) => api.unregister(props.session.id, email),
    'Your registration has been cancelled.',
  )
</script>

<template>
  <article class="session">
    <h2>{{ session.title }}</h2>
    <p class="starts">{{ formatDateTime(session.startsAt) }}</p>
    <p :class="['seats', { full: isFull }]">{{ seatsText }}</p>
    <p :class="['window', session.registrationStatus]">{{ windowText }}</p>
    <p v-if="session.isRegistered" class="registered">✓ You're registered</p>
    <div class="actions">
      <button type="button" :disabled="busy || !canRegister" @click="register">
        Register
      </button>
      <button
        type="button"
        class="secondary"
        :disabled="busy || emailPending || !session.isRegistered"
        @click="unregister"
      >
        Cancel my registration
      </button>
    </div>
    <p
      v-if="feedback"
      :class="['feedback', feedback.ok ? 'success' : 'error']"
      role="status"
    >
      {{ feedback.text }}
    </p>
  </article>
</template>
