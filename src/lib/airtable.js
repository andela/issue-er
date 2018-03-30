const Airtable = require('airtable')
const retry = require('async-retry')

const config = require('../config')

const base = new Airtable({
  apiKey: config.airtable.key
}).base(config.airtable.base)

function getAirtableRequestRecord (name, issueNumber) {
  return retry(async () => {
    const record = await base(name).select({ filterByFormula: `githubIssue = '${issueNumber}'`}).firstPage()
    return record
  }, {
    retries: 10
  })
}

function getAirtableStaffRecord (name, assignee) {
  return retry(async () => {
    const record = await base(name).select({ filterByFormula: `github = '@${assignee}'`}).firstPage()
    return record
  }, {
    retries: 10
  })
}

module.exports = {
  base,
  getAirtableRequestRecord,
  getAirtableStaffRecord
}
