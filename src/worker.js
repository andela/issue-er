const jobs = require('./jobs')

module.exports = () => {
  Object.keys(jobs).map(async job => jobs[job].start())
}
