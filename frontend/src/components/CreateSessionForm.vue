<script setup lang="ts">
import { reactive, ref } from 'vue'
import { api } from '@/api'
import { describeError } from '@/messages'

const emit = defineEmits<{ created: [] }>()

const HOUR = 60 * 60 * 1000
const now = Date.now()

const form = reactive({
  title: '',
  capacity: 10,
  opensAt: toLocalInput(new Date(now)),
  closesAt: toLocalInput(new Date(now + 24 * HOUR)),
  startsAt: toLocalInput(new Date(now + 48 * HOUR)),
})
const busy = ref(false)
const error = ref('')
const created = ref('')

/** Formats a date for <input type="datetime-local">, which works in local time. */
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

/** Turns a local datetime-local value into the unambiguous UTC instant the API expects. */
function toIso(local: string): string {
  const date = new Date(local)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

async function submit() {
  busy.value = true
  error.value = ''
  created.value = ''
  try {
    await api.createSession({
      title: form.title,
      capacity: form.capacity,
      registrationOpensAt: toIso(form.opensAt),
      registrationClosesAt: toIso(form.closesAt),
      startsAt: toIso(form.startsAt),
    })
    created.value = `Created "${form.title.trim()}".`
    form.title = ''
    emit('created')
  } catch (e) {
    error.value = describeError(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <form class="create" @submit.prevent="submit">
    <label>
      Title
      <input v-model="form.title" required maxlength="200" />
    </label>
    <label>
      Capacity
      <input v-model.number="form.capacity" type="number" min="1" max="10000" required />
    </label>
    <label>
      Registration opens
      <input v-model="form.opensAt" type="datetime-local" required />
    </label>
    <label>
      Registration closes
      <input v-model="form.closesAt" type="datetime-local" required />
    </label>
    <label>
      Session starts
      <input v-model="form.startsAt" type="datetime-local" required />
    </label>
    <button type="submit" :disabled="busy">Create session</button>
    <p v-if="error" class="feedback error" role="alert">{{ error }}</p>
    <p v-if="created" class="feedback success" role="status">{{ created }}</p>
  </form>
</template>
