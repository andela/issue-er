const async = require('async')

const {
  issues,
} = require('../lib/github')

const {
  archiveSlackGroup,
  getSlackGroupID,
  getSlackTeamID,
  getSlackProfile,
  retrieveSlackHistory
} = require('../lib/slack')

const config = require('../config')

const { namespace } = config.team

function joinArrayObject (array) {
  let str = ''
  for (const item of array) {
    str += item + '\r\n'
  }
  return str
}


async function closed (payload) {
  const { issue: { number } } = payload

  const group = `${namespace}-${number}`

  async.waterfall([
    async () => {
      const groupId = await getSlackGroupID(group)
      return { groupId }
    },
    async ({ groupId }) => {
      const [teamId, history] = await Promise.all([
        getSlackTeamID(),
        retrieveSlackHistory(groupId)
      ])
      return { groupId, teamId, history }
    },
    async ({ groupId, teamId, history }) => {
      const messages = history.map(async (message) => {
        const profile = await getSlackProfile(message.user)
          return `**${profile.name}**: \r\n ${message.text}`
      })

      const groupHistory = await Promise.all(messages)

      await Promise.all([
        issues.createIssueComment(number, `# [${group} history](https://slack.com/app_redirect?channel=${groupId}&&team=${teamId}) \r\n ${joinArrayObject(groupHistory)}`)
      ])
    },
    async () => {
      await archiveSlackGroup(group)
    }
  ])
}

module.exports = closed
