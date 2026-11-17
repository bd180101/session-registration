const dateTime = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
})

/** For example "Fri, Jan 25, 6:00 PM EST", in the viewer's time zone. */
export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso))
}
