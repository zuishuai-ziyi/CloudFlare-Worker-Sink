// Node replacement for the Cloudflare scheduled backup handler. Instead of the
// `cloudflare:scheduled` hook, it schedules a daily run at 00:00:00 UTC with
// unref'd timers so the process can still exit cleanly. The same daily tick also
// prunes access logs past their retention window.

const DAY_MS = 24 * 60 * 60 * 1000

export default defineNitroPlugin(() => {
  const config = useRuntimeConfig()
  const backupDisabled = config.disableAutoBackup
  const retentionDays = Number(config.analyticsRetentionDays)
  const retentionEnabled = Number.isFinite(retentionDays) && retentionDays > 0

  if (backupDisabled && !retentionEnabled) {
    console.info('[backup] Auto backup and access-log retention are disabled by configuration')
    return
  }

  const nextMidnight = new Date()
  nextMidnight.setUTCHours(24, 0, 0, 0)
  const delay = Math.max(0, nextMidnight.getTime() - Date.now())

  const runDailyTasks = async () => {
    // Timers fire this with `void`, so swallow every rejection here; otherwise an
    // unhandled rejection could crash the process before the next daily tick.
    try {
      if (!backupDisabled)
        await runScheduledBackup()
      if (retentionEnabled)
        await pruneAccessLogs(retentionDays)
    }
    catch (error) {
      console.error('[backup] daily maintenance failed:', error)
    }
  }

  const dailyTimer = setTimeout(() => {
    void runDailyTasks()
    const interval = setInterval(() => {
      void runDailyTasks()
    }, DAY_MS)
    interval.unref()
  }, delay)
  dailyTimer.unref()

  console.info(`[backup] Next scheduled maintenance in ${Math.round(delay / 1000)}s`)
})

async function runScheduledBackup(): Promise<void> {
  try {
    const env = await usePlatformEnv()
    await backupLinksToR2(env as unknown as Cloudflare.Env)
  }
  catch (error) {
    console.error('[backup] Scheduled backup failed:', error)
  }
}
