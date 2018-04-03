const CronJob = require('cron').CronJob
const moment = require('moment')

const { graphqlClient } = require('../lib/github')

const config = require('../config')

const { managers, namespace } = config.team
const { owner, repo } = config.github
const { view } = config.airtable

const operations = require('../graphql/queries')

// Create query and mutation variable object
const baseVariables = { owner, name: repo }



const clearOld = new CronJob({
  cronTime: '00 00 23 * * 0-6',
  onTick: async () => {
    const now = moment()
    const twoWeeksAgo = now.substract(14, 'days').toDate()

    const variables =  Object.assign({}, baseVariables, {
      projectName: 'All Projects'
    })

    const project = await graphqlClient.request(operations.FindProjectColumns, variables)
    console.log(project)
    //
    //   const { repository: { projects: { edges } } } = project
    //   asyncForEach(edges, async ({ node: { columns: { edges } } }) => {
    //     asyncForEach(edges, async ({ node: { id: columnId, name: columnName } }) => {
    //       if (columnId === currentColumnId) return
    //       if (columnName.toLowerCase() === currentColumnName.toLowerCase()) return
    //       if (columnName.toLowerCase() !== destinationColumnName.toLowerCase()) return
    //       const projectCardMutationVariables = Object.assign({}, variables, {
    //         "card": { cardId, columnId }
    //       })
    //       await graphqlClient.request(operations.MoveProjectCard, projectCardMutationVariables)
    //     })
    //   })
    // })

    console.log(`Removing all cards from 'All Projects' created on: ${twoWeeksAgo}`)
    // Clear out issues on 'All Projects' older than 14 days
  },
  start: true,
  timezone: 'America/New_York'
})

module.exports = {
  clearOld
}
