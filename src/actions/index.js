const dateFormat = require('dateformat')
const github = require('../clients/github')
const airtable = require ('../clients/airtable')
const slack = require('../clients/slack')

const owner = process.env.GH_OWNER
const name = process.env.GH_REPOSITORY
const view = process.env.AIRTABLE_VIEW_ENDPOINT
const managers = process.env.MANAGERS.split(',')

const operations = require('../../graphql/queries')

// Create query and mutation variable object
const baseVariables = { owner, name }

// Issue status labels
const statuses = ['incoming', 'accepted', 'in progress', 'rejected', 'blocked', 'review', 'completed', 'hold', 'canceled']

// Issue category labels
// const categories = []
// fetch all github labels
// - apply by description on ticket

function joinArrayObject (array) {
  let str = ''
  for (const item of array) {
    str += item + '\r\n'
  }
  return str
}

module.exports = {
  opened: async (payload) => {
    const { issue: { number, body, assignee: { login } } } = payload
    const requestRecord = await airtable.getAirtableRequestRecord(airtable.base('request'), number)
    const requestRecordID = requestRecord[0].getId()
    const requestID = requestRecord[0].get('requestID')
    const requestView = view + requestRecordID

    // Add requestID and link to issue body
    const group = `studiojob-${number}`
    let groupID = await slack.getSlackGroupID(group)

    await github.apiV3.editIssue(number, {
      body: `# Request ID: [${requestID}](${requestView}) \r\n ${body}`
    })

    const botID = await slack.getSlackUserID(`@${login}`)

    if (groupID) {
      await Promise.all([
        ...managers.map(async (manager) => {
          const userID = await slack.getSlackUserIDByEmail(manager)
          await slack.inviteToSlackGroup(groupID, userID)
        }),
        slack.inviteToSlackGroup(groupID, botID)
      ])
    } else {
      await slack.createSlackGroup(group)
      groupID = await slack.getSlackGroupID(group)
      await Promise.all([
        ...managers.map(async (manager) => {
          const userID = await slack.getSlackUserIDByEmail(manager)
          await slack.inviteToSlackGroup(groupID, userID)
        }),
        slack.inviteToSlackGroup(groupID, botID)
      ])
    }
  },
  labeled: async (payload) => {
    const { issue: { number, labels }, label: { name } } = payload

    const requestRecord = await airtable.getAirtableRequestRecord(airtable.base('request'), number)
    const requestRecordID = requestRecord[0].getId()

    const status = name
    const projectName = name === 'incoming' ? 'All Projects' : name
    const requestJobStatus = requestRecord[0].get('jobStatus')

    // Add issue to project board
    const variables =  Object.assign({}, baseVariables, {
      number,
      projectName
    })

      const issue = await github.graphqlClient.request(operations.FindIssueID, variables)

      const project = await github.graphqlClient.request(operations.FindProjectColumnID, variables)

      const contentId = issue.repository.issue.id

      if (project.repository.projects.edges.length === 1 && payload.sender.login === 'studiobot' ) {
        const projectColumnId = project.repository.projects.edges[0].node.columns.edges[0].node.id
        if (contentId && projectColumnId) {
          const projectCardMutationVariables = Object.assign({}, variables, {
            "issue": { contentId, projectColumnId }
          })
          await github.graphqlClient.request(operations.AddProjectCard, projectCardMutationVariables)
        }
      }

      // Update airtable jobStatus field with label if airtable record exists &&
      // Label status is in statuses && record status is not the same as label name
      if (requestRecordID && statuses.includes(status) && status !== requestJobStatus) {
        await airtable.base('request').update(requestRecordID, { 'jobStatus': status })
        const today = dateFormat(new Date(), 'isoDate')

        if (status === 'accepted') {
          await airtable.base('request').update(requestRecordID, { 'startDate': today })
        }

        if (status === 'completed') {
          await airtable.base('request').update(requestRecordID, { 'dateDelivered': today })
        }
      }

      const expediteReq = requestRecord[0].get('expedite')
      const expediteLabel = 'expedite'

      // Add 'expedite' label to issue is expedite requested
      if (expediteReq && name !== expediteLabel && !labels.includes(expediteLabel)) {

        const currentLabels = labels.map((label) => label.name)
        const newLabels = [expediteLabel, ...currentLabels]

        await github.apiV3.editIssue(number, { labels: newLabels })
      }
  },
  assigned: async (payload) => {
    const { issue: { number } } = payload
    const requestRecord = await airtable.getAirtableRequestRecord(airtable.base('request'), number)
    const requestRecordID = requestRecord[0].getId()

    const group = `studiojob-${number}`
    const assignee = payload.issue.assignee.login
    const staffRecord = await airtable.getAirtableStaffRecord(airtable.base('staff'), assignee)
    const studioOwner = staffRecord[0]

    if (studioOwner) {
      const staffRecordID = studioOwner.getId()
      const studioOwnerEmail = studioOwner.get('email')
      const groupID = await slack.getSlackGroupID(group)
      const userID = await slack.getSlackUserIDByEmail(`${studioOwnerEmail}`)
      await Promise.all([
        airtable.base('request').update(requestRecordID, { 'studioOwner': [`${staffRecordID}`] }),
        slack.inviteToSlackGroup(groupID, userID)
      ])
    }
  },
  closed: async (payload) => {
    const { issue: { number } } = payload

    const group = `studiojob-${number}`
    const groupID = await slack.getSlackGroupID(group)
    // Dump Slack History in Github Issue
    if (groupID) {
      const teamID = await slack.getSlackTeamID()
      const history = await slack.retrieveSlackHistory(groupID)
      const messages = history.map(async (message) => {
        const profile = await slack.getSlackProfile(message.user)
        return `**${profile.name}**: \r\n ${message.text}`
      })

      const groupHistory = await Promise.all(messages)

      if (groupHistory.length >= 0) {
        await Promise.all([
          github.apiV3.createIssueComment(number, `# [${group} history](https://slack.com/app_redirect?channel=${groupID}&&team=${teamID}) \r\n ${joinArrayObject(groupHistory)}`)
        ])
      }

      await slack.archiveSlackGroup(group)
    }
  }
}
