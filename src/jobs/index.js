const CronJob = require('cron').CronJob
const moment = require('moment')
const async = require('async')

const { graphqlClient } = require('../lib/github')
const {
  updateStatus,
  updatePriority,
  updateCategory,
  getAirtableRequestRecord
} = require('../lib/airtable')

const config = require('../config')

const { owner, repo } = config.github

const operations = require('../graphql/queries')

// Create query and mutation variable object
const baseVariables = { owner, name: repo }

const tz = moment.tz.guess()

const cleanAndUpdate = new CronJob({
  cronTime: '* 00 23 * * 0-6',
  onTick: async () => {
    const now = moment()
    const twoWeeksAgo = now.clone().subtract(14, 'days').toDate()

    console.log('hi')

    const variables = Object.assign({}, baseVariables, {
      "order": {
        "direction": "ASC",
        "field": "UPDATED_AT"
      }
    })

    let allIssues = []

    const fetchIssues = async function (cursorId="", hasNextPage=false) {

      try {

        const issues = await graphqlClient.request(operations.FindAllIssues, Object.assign({}, variables, {
          cursorId,
          hasNextPage,
          initial: !hasNextPage
        }))

        const { repository: { issues: { totalCount, pageInfo: { endCursor: cursor , hasNextPage: hasNext }, edges } } } = issues

        if (allIssues.length < totalCount && hasNextPage) {

          allIssues = [...allIssues, ...edges]
          return await fetchIssues(cursor, hasNext)
        }

        return allIssues
      } catch(err) {
        console.log(err)
      }
    }

    await fetchIssues()

    if (!allIssues || allIssues.length === 0) return

    async.each(allIssues,
      async ({ node: { number, closed, closedAt, labels, projectCards: { edges } } }) => {
        try {
          // Update Airtable & Github project boards information
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
  start: true, // update
  timeZone: tz
})

cleanAndUpdate.start()

console.log(cleanAndUpdate.running)

module.exports = { cleanAndUpdate }
