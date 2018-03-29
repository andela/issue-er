const Airtable = require('airtable')
const retry = require('async-retry')

const config = require('../config')

const airtable = new Airtable({
  apiKey: config.airtable.key
}).base(config.airtable.base)

const table = (name) => airtable.base(name)

const base = (name) => table(name)

function getAirtableRequestRecord (name, issueNumber) {
  return retry(async () => {
    const record = await table(name).select({ filterByFormula: `githubIssue = '${issueNumber}'`}).firstPage()
    return record
  }, {
    retries: 10
  })
}

function getAirtableStaffRecord (name, assignee) {
  return retry(async () => {
    const record = await table(name).select({ filterByFormula: `github = '@${assignee}'`}).firstPage()
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
