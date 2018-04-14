const jobs = require('../jobs')

module.exports = async () => {
  await Promise.all(Object.keys(jobs).map(async job => {
    console.log(`Initializing job '${job}'`)
    return jobs[job].start()
  }))
}
