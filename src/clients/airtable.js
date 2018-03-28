const Airtable = require('airtable')
const retry = require('async-retry')

const airtableKey = process.env.AIRTABLE_API_KEY
const airtableBase = process.env.AIRTABLE_BASE

const base = new Airtable({
  apiKey: airtableKey
}).base(airtableBase)

function getAirtableRequestRecord (table, issueNumber) {
  return retry(async () => {
    const record = await table.select({ filterByFormula: `githubIssue = '${issueNumber}'`}).firstPage()
    return record
  }, {
    retries: 10
  })
}

function getAirtableStaffRecord (table, assignee) {
  return retry(async () => {
    const record = await table.select({ filterByFormula: `github = '@${assignee}'`}).firstPage()
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
