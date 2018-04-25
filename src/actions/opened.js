const async = require('async')

const {
  issues
} = require('../lib/github')

const {
  getAirtableRequestRecord
} = require ('../lib/airtable')

const {
  createSlackGroup,
  inviteToSlackGroup,
  inviteBotToSlackGroup,
  getSlackUserIDByEmail,
  getSlackUserID,
  getSlackTeamID,
  setSlackGroupTopic,
  setSlackGroupPurpose,
} = require('../lib/slack')


const {
  createFolder
} = require('../lib/google')

const config = require('../config')

const { managers, namespace } = config.team
const { view } = config.airtable
const { url, workDirId } = config.google

async function opened (payload) {
  const { issue: { number, body, assignee: { login } } } = payload

  const requestRecord = await getAirtableRequestRecord(number)
  const record = requestRecord[0]
  const recordId = record.getId()
  const requestId = record.get('requestID')
  const requestView = view + recordId
  const group = `${namespace}-${number}`

  async.waterfall([
    async () => {

      const groupId = await createSlackGroup(group)

      return { groupId }
    },
    async ({ groupId }) => {

      const botId = await getSlackUserID(`@${login}`)

      await inviteBotToSlackGroup(groupId, botId)
      return { groupId, botId }
    },
    async ({ groupId }) => {

      const userIds = await Promise.all([
        ...managers.map(async (manager) => {
          const userId = await getSlackUserIDByEmail(manager)
          await inviteToSlackGroup(groupId, userId)
          return userId
        })
      ])

      return { groupId, userIds }
    },
    async ({ groupId, userIds }) => {

      const requestedEmail = record.get('requestedEmail')[0]
      const requestedSlack = await getSlackUserIDByEmail(requestedEmail)

      await inviteToSlackGroup(groupId, requestedSlack)

      return { groupId, userIds }
    },
    async ({ groupId, userIds }) => {

      // const depId = record.get('departmentID')[0]
      // const depName = record.get('departmentName')[0]
      // const requestTitle = record.get('title')
      //
      // const depFolderName = `${depId} (${depName.charAt(0).toUpperCase()}${depName.slice(1)})`
      // const depFolder = await createFolder(depFolderName, [workDirId])
      //
      // const requestFolderName = `${requestId} (${requestTitle})`
      // const folder = await createFolder(requestFolderName, [depFolder.id])

      return { groupId, userIds }
    },
    async ({ groupId }) => {

      const purpose = `Discuss ticket # ${number}. Request ID: ${requestId}`

      const topic = `Github Issue: https://github.com/andela/andela-studio/issues/${number}`

      await setSlackGroupPurpose(groupId, purpose)
      await setSlackGroupTopic(groupId, topic)

      return { groupId }
    },
    async ({ groupId }) => {
      const teamId = await getSlackTeamID()

      await issues.editIssue(number, {
        body: `#### [Airtable Record: ${requestId}](${requestView}) \r\n #### [Slack: ${group}](https://slack.com/app_redirect?channel=${groupId}&&team=${teamId}) \r\n ${body} \r\n `
      })
    }
  ])
}

module.exports = opened
