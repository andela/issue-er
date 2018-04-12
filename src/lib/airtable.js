const Airtable = require('airtable')
const dateFormat = require('dateformat')
const retry = require('async-retry')

const config = require('../config')

const base = new Airtable({
  apiKey: config.airtable.key
}).base(config.airtable.base)

function getAirtableRequestRecord (issueNumber) {
  return retry(async () => {
    try {
      const record = await base('request').select({ filterByFormula: `githubIssue = '${issueNumber}'`}).firstPage()
      return record
    } catch(err) {
      console.log(err)
    }
  }, {
    retries: 10
  })
}

function getAirtableStaffRecord (assignee) {
  return retry(async () => {
    try {
      const record = await base('staff').select({ filterByFormula: `github = '@${assignee}'`}).firstPage()
      return record
    } catch(err) {
      console.log(err)
    }
  }, {
    retries: 10
  })
}

async function updateStatus (record, status) {
  try {
      if (!record) return
      if (!status) return

      const recordId = record.getId()
      const jobStatus = record.get('jobStatus')
      const today = dateFormat(new Date(), 'isoDate')

      if (status !== jobStatus) {
        await base('request').update(recordId, { 'jobStatus': status })
      }

      if (status === 'accepted' && status !== jobStatus) {
        await base('request').update(recordId, { 'startDate': today })
      }

      if (status === 'completed' && status !== jobStatus) {
        await base('request').update(recordId, { 'dateDelivered': today })
      }
  } catch(err) {
    console.log(err)
  }
}

async function updatePriority (record, priority) {
  try {
    if (!record) return
    if (!priority) return

    const recordId = record.getId()
    const jobPriority = record.get('priority')

    if (priority !== jobPriority) {
      await base('request').update(recordId, { priority })
    }
  } catch(err) {
    console.log(err) 
  }
}

async function updateCategory (record, category) {
  try {
    if (!record) return
    if (!category) return

    const recordId = record.getId()
    const jobCategory = record.get('jobCategory')

    if (category !== jobCategory) {
      await base('request').update(recordId, { 'jobCategory': category })
    }
  } catch (err) {
    console.log(err)
  }
}

module.exports = {
  base,
  updateStatus,
  updatePriority,
  updateCategory,
  getAirtableRequestRecord,
  getAirtableStaffRecord
}
