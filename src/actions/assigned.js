const async = require('async')

const {
  base,
  getAirtableRequestRecord,
  getAirtableStaffRecord
} = require ('../lib/airtable')

const {
  inviteToSlackGroup,
  getSlackUserIDByEmail,
  getSlackGroupID,
  postMessageToSlack,
} = require('../lib/slack')

const config = require('../config')

const { namespace } = config.team

async function assigned (payload) {

  const { issue: { number } } = payload
  const requestRecord = await getAirtableRequestRecord(number)
  const record = requestRecord[0]
  const requestId = record.getId()

  const group = `${namespace}-${number}`
  const assignee = payload.issue.assignee.login

  async.waterfall([
    async () => {
      const groupId = await getSlackGroupID(group)
      return { groupId }
    },
    async ({groupId}) => {
      const ownerRecord = await getAirtableStaffRecord(assignee)
      const owner = ownerRecord[0]
      const ownerId = owner.getId()
      const ownerEmail = owner.get('email')
      const ownerSlackId = await getSlackUserIDByEmail(`${ownerEmail}`)
      await Promise.all([
        base('request').update(requestId, { 'owner': [`${ownerId}`] }),
        inviteToSlackGroup(groupId, ownerSlackId)
      ])

      return { owner, groupId, ownerSlackId }
    },
    async ({ groupId, ownerSlackId }) => {
      const requestedEmail = record.get('requestedEmail')[0]

      const requestedSlack = await getSlackUserIDByEmail(requestedEmail)
      
      const message = `<@${requestedSlack}>, your studio request will be serviced by <@${ownerSlackId}>`

      await postMessageToSlack(groupId, message)
    }
  ])
}


module.exports = assigned
