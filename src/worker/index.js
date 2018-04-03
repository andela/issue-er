const jobs = require('../jobs')

module.exports = async () => {
  await Promise.all(Object.keys(jobs).map(async job => jobs[job].start()))
}
