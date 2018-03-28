const jobs = require('./jobs')

module.exports = () => {
  Object.keys(jobs).forEach(job => jobs[job].start())
}
