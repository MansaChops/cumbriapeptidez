import type { Config } from '@netlify/functions'
import { deliverSlack, dueSlackNotifications } from '../lib/slack.js'

// Retries Slack notifications that failed on first send, following the outbox backoff.
export default async () => {
  for (const { id } of await dueSlackNotifications()) await deliverSlack(id)
}

export const config: Config = { schedule: '* * * * *' }
