const CronJob = require('cron').CronJob
const moment = require('moment')

const clearOld = new CronJob({
  cronTime: '00 00 23 * * 0-6',
  onTick: () => {
    const now = moment()
    const twoWeeksAgo = now.substract(14, 'days').toDate()
    console.log(`Removing all cards from 'All Projects' created on: ${twoWeeksAgo}`)
    // Clear out issues on 'All Projects' older than 14 days
  },
  start: false,
  timezone: 'America/New_York'
})

module.exports = {
  clearOld
}
