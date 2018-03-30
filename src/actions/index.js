const dateFormat = require('dateformat')

const {
  createFolder,
  findFolder,
  getFolder,
  workspace
} = require('../lib/google')

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

const config = require('../config')

const { managers, namespace } = config.team
const { owner, repo } = config.github
const { view } = config.airtable

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

const updateCategory = async (record, category) => {
  if (!record) return
  if (!category) return

  const recordId = record.getId()
  const jobCategory = record.get('jobCategory')
  if (category !== jobCategory) {
    await base('request').update(recordId, { 'jobCategory': category })
  }
}

const addToProject = async (project, issue, variables) => {
  if (!project) return
  if (!issue) return
  if (!variables) return

  const { repository: { issue: { id } } } = issue
  const projectColumnId = project.repository.projects.edges[0].node.columns.edges[0].node.id
  if (id && projectColumnId) {
    const projectCardMutationVariables = Object.assign({}, variables, {
      "issue": { id, projectColumnId }
    })
    await graphqlClient.request(operations.AddProjectCard, projectCardMutationVariables)
  }
}

const moveProjectcard = async (issue, variables) => {
  if (!issue) return
  if (!variables) return

  const { repository: { issue: { projectCards } } }  = issue
  projectCards.forEach(async (card) => {
    const { edges: { node: { id: cardId, column: columnId } } } = card
    const projectCardMutationVariables = Object.assign({}, variables, {
      "card": { cardId, columnId }
    })
    await graphqlClient.request(operations.MoveProjectCard, projectCardMutationVariables)
  })
}

const opened = async (payload) => {
  const { issue: { number, body, assignee: { login } } } = payload
  const res = await getAirtableRequestRecord('request', number)
  const record = res[0]
  const recordId = record.getId()
  const depId = record.get('departmentID')
  const depName = record.get('departmentName')
  const requestId = record.get('requestID')
  const requestTitle = record.get('title')
  const requestView = view + recordId

  // const cwd = await workspace()
  //
  // const depDirName = `${depId} (${depName})`
  // const requestDirName = `${requestId} (${requestTitle})`
  //
  // const depDir = await createFolder(depDirName, [cwd.id])
  // const requestDir = await createFolder(requestDirName, [depDir.id])
  //
  // const { url } = config.google

  const group = `${namespace}-${number}`
  let groupID = await getSlackGroupID(group)

  await issues.editIssue(number, {
    body: `# Request ID: [${requestId}](${requestView}) \r\n \r\n ${body}`
  })
  // await issues.editIssue(number, {
  //   body: `# Request ID: [${requestId}](${requestView}) \r\n \r\n # [GDrive: ${requestDir.name}](${url}/${requestDir.id}) \r\n ${body}`
  // })
  
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

  const record = await getAirtableRequestRecord('request', number)

  const projectName = name === 'incoming' ? 'All Projects' : name

  const variables =  Object.assign({}, baseVariables, {
    number,
    projectName
  })

  const issue = await graphqlClient.request(operations.FindIssue, variables)
  const project = await graphqlClient.request(operations.FindProject, variables)

  const issueLabels = issue.repository.issue.labels

  issueLabels.forEach(async (label) => {
    const { edges: { node: { name, description } } } = label

    switch(description) {
      case 'department':
        await addToProject(project, issue, variables)
        break
      case 'status':
        await Promise.all([
          updateStatus(record[0], name),
          moveProjectcard(issue, variables)
        ])
        break
      case 'category':
        await updateCategory(record[0], name)
        break
      default:
        console.log('No matching label description')
    }

  })

  const expediteReq = record[0].get('expedite')
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

  const group = `${namespace}-${number}`
  const assignee = payload.issue.assignee.login
  const staffRecord = await getAirtableStaffRecord('staff', assignee)
  const owner = staffRecord[0]

  if (owner) {
    const staffRecordID = owner.getId()
    const ownerEmail = owner.get('email')
    const groupID = await getSlackGroupID(group)
    const userID = await getSlackUserIDByEmail(`${ownerEmail}`)
    await Promise.all([
      base('request').update(requestRecordID, { 'owner': [`${staffRecordID}`] }),
      inviteToSlackGroup(groupID, userID)
    ])
  }
}

const closed = async (payload) => {
  const { issue: { number } } = payload

  const group = `${namespace}-${number}`
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
