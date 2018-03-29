const dateFormat = require('dateformat')

const config = require('../config')

const {
  issues,
  graphqlClient
} = require('../lib/github')

const {
  base,
  getAirtableRequestRecord,
  getAirtableStaffRecord
} = require ('../lib/airtable')

const {
  createSlackGroup,
  archiveSlackGroup,
  inviteToSlackGroup,
  getSlackUserIDByEmail,
  getSlackUserID,
  getSlackGroupID,
  getSlackTeamID,
  getSlackProfile,
  retrieveSlackHistory
} = require('../lib/slack')

const { owner, repo } = config.github

const { view } = config.airtable
const { managers } = config.team

const operations = require('../graphql/queries')

// Create query and mutation variable object
const baseVariables = { owner, name: repo }


function joinArrayObject (array) {
  let str = ''
  for (const item of array) {
    str += item + '\r\n'
  }
  return str
}

const opened = async (payload) => {
  const { issue: { number, body, assignee: { login } } } = payload
  const requestRecord = await getAirtableRequestRecord('request', number)
  const requestRecordID = requestRecord[0].getId()
  const requestID = requestRecord[0].get('requestID')
  const requestView = view + requestRecordID

  // Add requestID and link to issue body
  const group = `studiojob-${number}`
  let groupID = await getSlackGroupID(group)

  await issues.editIssue(number, {
    body: `# Request ID: [${requestID}](${requestView}) \r\n ${body}`
  })

  const botID = await getSlackUserID(`@${login}`)

  if (groupID) {
    await Promise.all([
      ...managers.map(async (manager) => {
        const userID = await getSlackUserIDByEmail(manager)
        await inviteToSlackGroup(groupID, userID)
      }),
      inviteToSlackGroup(groupID, botID)
    ])
  } else {
    await createSlackGroup(group)
    groupID = await getSlackGroupID(group)
    await Promise.all([
      ...managers.map(async (manager) => {
        const userID = await getSlackUserIDByEmail(manager)
        await inviteToSlackGroup(groupID, userID)
      }),
      inviteToSlackGroup(groupID, botID)
    ])
  }
}

const labeled = async (payload) => {
  const { issue: { number, labels }, label: { name } } = payload

  const requestRecord = await getAirtableRequestRecord('request', number)
  const requestRecordID = requestRecord[0].getId()

  const status = name
  const projectName = name === 'incoming' ? 'All Projects' : name
  const requestJobStatus = requestRecord[0].get('jobStatus')
  const requestJobCategory = requestRecord[0].get('jobCategory')

  // Add issue to project board
  const variables =  Object.assign({}, baseVariables, {
    number,
    projectName
  })

    const issue = await graphqlClient.request(operations.FindIssueID, variables)

    const project = await graphqlClient.request(operations.FindProjectColumnID, variables)

    const contentId = issue.repository.issue.id

    if (project.repository.projects.edges.length === 1 && payload.sender.login === 'studiobot' ) {
      const projectColumnId = project.repository.projects.edges[0].node.columns.edges[0].node.id
      if (contentId && projectColumnId) {
        const projectCardMutationVariables = Object.assign({}, variables, {
          "issue": { contentId, projectColumnId }
        })
        await graphqlClient.request(operations.AddProjectCard, projectCardMutationVariables)
      }
    }

    // Update airtable jobStatus field with label if airtable record exists &&
    // Label status is in statuses && record status is not the same as label name
    if (requestRecordID && statuses.includes(status) && status !== requestJobStatus) {
      await base('request').update(requestRecordID, { 'jobStatus': status })
      const today = dateFormat(new Date(), 'isoDate')

      if (status === 'accepted') {
        await base('request').update(requestRecordID, { 'startDate': today })
      }

      if (status === 'completed') {
        await base('request').update(requestRecordID, { 'dateDelivered': today })
      }
    }


    const expediteReq = requestRecord[0].get('expedite')
    const expediteLabel = 'expedite'

    // Add 'expedite' label to issue is expedite requested
    if (expediteReq && name !== expediteLabel && !labels.includes(expediteLabel)) {

      const currentLabels = labels.map((label) => label.name)
      const newLabels = [expediteLabel, ...currentLabels]

      await issues.editIssue(number, { labels: newLabels })
    }
}

const assigned = async (payload) => {
  const { issue: { number } } = payload
  const requestRecord = await getAirtableRequestRecord('request', number)
  const requestRecordID = requestRecord[0].getId()

  const group = `studiojob-${number}`
  const assignee = payload.issue.assignee.login
  const staffRecord = await getAirtableStaffRecord('staff', assignee)
  const studioOwner = staffRecord[0]

  if (studioOwner) {
    const staffRecordID = studioOwner.getId()
    const studioOwnerEmail = studioOwner.get('email')
    const groupID = await getSlackGroupID(group)
    const userID = await getSlackUserIDByEmail(`${studioOwnerEmail}`)
    await Promise.all([
      base('request').update(requestRecordID, { 'studioOwner': [`${staffRecordID}`] }),
      inviteToSlackGroup(groupID, userID)
    ])
  }
}

const closed = async (payload) => {
  const { issue: { number } } = payload

  const group = `studiojob-${number}`
  const groupID = await getSlackGroupID(group)
  // Dump Slack History in Github Issue
  if (groupID) {
    const teamID = await getSlackTeamID()
    const history = await retrieveSlackHistory(groupID)
    const messages = history.map(async (message) => {
      const profile = await getSlackProfile(message.user)
      return `**${profile.name}**: \r\n ${message.text}`
    })

    const groupHistory = await Promise.all(messages)

    if (groupHistory.length >= 0) {
      await Promise.all([
        issues.createIssueComment(number, `# [${group} history](https://slack.com/app_redirect?channel=${groupID}&&team=${teamID}) \r\n ${joinArrayObject(groupHistory)}`)
      ])
    }

    await archiveSlackGroup(group)
  }
}

module.exports = { opened, labeled, assigned, closed }
