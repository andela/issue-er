const CronJob = require('cron').CronJob
const moment = require('moment')
const async = require('async')
const dateFormat = require('dateformat')

const { graphqlClient } = require('../lib/github')
const {
  base,
  getAirtableRequestRecord
} = require('../lib/airtable')

const config = require('../config')

const { owner, repo } = config.github

const operations = require('../graphql/queries')

// Create query and mutation variable object
const baseVariables = { owner, name: repo }

const now = moment()
const time = (digit, unit) => now.clone().add(digit, unit).toDate()
const tz = moment.tz.guess()

const updateStatus = async (record, status) => {
  if (!record) return
  if (!status) return

  const recordId = record.getId()
  const jobStatus = record.get('jobStatus')
  const today = dateFormat(new Date(), 'isoDate')

  if (status !== jobStatus) {
    await base('request').update(recordId, { 'jobStatus': status })
  }

  if (status === 'accepted') {
    await base('request').update(recordId, { 'startDate': today })
  }

  if (status === 'completed') {
    await base('request').update(recordId, { 'dateDelivered': today })
  }
}

const updatePriority = async (record, priority) => {
  if (!record) return
  if (!priority) return

  const recordId = record.getId()

  await base('request').update(recordId, { priority })
}

const updateCategory = async (record, category) => {
  if (!record) return
  if (!category) return

  const recordId = record.getId()

  await base('request').update(recordId, { 'jobCategory': category })
}

const cleanAndUpdate = new CronJob({
  cronTime: '00 00 23 * * 0-6',
  onTick: async () => {
    const now = moment()
    const twoWeeksAgo = now.clone().subtract(14, 'days').toDate()

    const variables = Object.assign({}, baseVariables, {
      "order": {
        "direction": "DESC",
        "field": "UPDATED_AT"
      }
    })

    let allIssues = []
    let totalCount = 0
    let cursorId = ""
    let hasNextPage = false

    const fetchClosedIssues = async function () {

      try {

        const issues = await graphqlClient.request(operations.FindAllIssues, Object.assign({}, variables, {
          cursorId,
          hasNextPage,
          initial: !hasNextPage
        }))

        const { repository: { issues: { totalCount: total, pageInfo: { endCursor: cursor , hasNextPage: hasNext }, edges } } } = issues

        totalCount = total
        hasNextPage = hasNext
        cursorId = cursor

        if (allIssues.length < totalCount && hasNextPage) {

          allIssues = [...allIssues, ...edges]
          return await fetchClosedIssues()
        } else {
          return allIssues
        }
      } catch(err) {
        console.log(err)
      }
    }

    await fetchClosedIssues()

    async.each(allIssues,
      async ({ node: { number, closed, closedAt, labels, projectCards: { edges } } }) => {
        try {
          // Update Airtable information
          const record = await getAirtableRequestRecord(number)

          if (record) {
            async.each(labels.edges, async (label) => {
              const { node: { name, description } } = label
              
              switch(description) {
                case 'status':
                  await updateStatus(record[0], name)
                  break
                case 'priority':
                  await updatePriority(record[0], name)
                  break
                case 'category':
                  await updateCategory(record[0], name)
                  break
                default:
                  console.log('No matching label description')
              }
            })
          }

          // Remove old cards from projects boards
          async.each(edges, async ({ node: { id: cardId, project: { name } } }) => {
            try {
              if (closed && moment(closedAt) <= twoWeeksAgo) {
                const deletedCardId =  await graphqlClient.request(operations.DeleteProjectCard, Object.assign({}, baseVariables, {
                  "card": { cardId }
                }))
                console.log(`Removed card with id: ${deletedCardId} from project with name: ${name}`)
              }
            } catch(err) {
              console.log(err)
            }
          })
        } catch(err) {
          console.log(err)
        }
    })

    console.log(`Removing all cards from 'All Projects' closed on: ${twoWeeksAgo}`)
  },
  start: true,
  timeZone: tz
})

module.exports = { cleanAndUpdate }
