const dateFormat = require('dateformat')

const {
  createFolder,
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
  unarchiveSlackGroup,
  inviteToSlackGroup,
  getSlackUserIDByEmail,
  getSlackUserID,
  getSlackGroupID,
  getSlackTeamID,
  getSlackProfile,
  setSlackGroupTopic,
  setSlackGroupPurpose,
  postMessageToSlack,
  retrieveSlackHistory
} = require('../lib/slack')

const config = require('../config')

const { managers, namespace } = config.team
const { owner, repo } = config.github
const { view } = config.airtable

const operations = require('../graphql/queries')

// Create query and mutation variable object
const baseVariables = { owner, name: repo }

// !This is temporary solution!
// forEach polyfill
// https://codeburst.io/javascript-async-await-with-foreach-b6ba62bbf404
async function asyncForEach(array, callback) {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array)
  }
}

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

const updatePriority = async (record, labels, priority, number) => {
  if (!record) return
  if (!labels || labels.length === 0) return
  if (!priority) return
  if (!number) return

  const expediteLabel = 'expedite'
  const expediteReq = record.get('expedite')

  const recordId = record.getId()
  const jobPriority = record.get('priority')

  if (priority !== jobPriority) {
    await base('request').update(recordId, { priority })
  }

  if (expediteReq && !labels.includes(expediteLabel)) {
    if (priority !== expediteLabel) {
      const currentLabels = labels.map((label) => label.name)
      const newLabels = [expediteLabel, ...currentLabels]
      await issues.editIssue(number, { labels: newLabels })
    }
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
  if (!project || project.repository.projects.edges.length === 0) return
  if (!issue) return
  if (!variables) return

  const { repository: { issue: { id: contentId } } } = issue
  const projectColumnId = project.repository.projects.edges[0].node.columns.edges[0].node.id || null
  if (contentId && projectColumnId) {
    const projectCardMutationVariables = Object.assign({}, variables, {
      "issue": { contentId, projectColumnId }
    })
    await graphqlClient.request(operations.AddProjectCard, projectCardMutationVariables)
  }
}

const moveProjectCard = async (destinationColumnName, issue, variables) => {
  if (!destinationColumnName) return
  if (!issue) return
  if (!variables) return

  const { repository: { issue: { projectCards } } }  = issue

  asyncForEach(projectCards.edges, async ({ node: {
    id: cardId,
    project: { name: projectName },
    column: { id: currentColumnId, name: currentColumnName } } }) => {
    const project = await graphqlClient.request(operations.FindProjectColumns,
      Object.assign({}, variables, { projectName })
    )
    const { repository: { projects: { edges } } } = project
    asyncForEach(edges, async ({ node: { columns: { edges } } }) => {
      asyncForEach(edges, async ({ node: { id: columnId, name: columnName } }) => {
        if (columnId === currentColumnId) return
        if (columnName.toLowerCase() === currentColumnName.toLowerCase()) return
        if (columnName.toLowerCase() !== destinationColumnName.toLowerCase()) return
        const projectCardMutationVariables = Object.assign({}, variables, {
          "card": { cardId, columnId }
        })
        await graphqlClient.request(operations.MoveProjectCard, projectCardMutationVariables)
      })
    })
  })
}

const opened = async (payload) => {
  const { issue: { number, body, assignee: { login } } } = payload
  const res = await getAirtableRequestRecord('request', number)
  const record = res[0]
  const recordId = record.getId()
  const depId = record.get('departmentID')[0]
  const depName = record.get('departmentName')[0]
  const requestId = record.get('requestID')
  const requestTitle = record.get('title')
  const requestView = view + recordId

  const cwd = await workspace()

  const depFolderName = `${depId} (${depName.charAt(0).toUpperCase()}${depName.slice(1)})`
  const requestFolderName = `${requestId} (${requestTitle})`

  const depFolder = await createFolder(depFolderName, [cwd.id])
  const requestFolder = await createFolder(requestFolderName, [depFolder.id])

  const { url } = config.google

  const group = `${namespace}-${number}`
  let groupID = await getSlackGroupID(group)

  await issues.editIssue(number, {
    body: `# Request ID: [${requestId}](${requestView}) \r\n \r\n ### [GDrive Assets repository: ${depFolder.name}](${url}/${requestFolder.id}) \r\n ${body}`
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

  const record = await getAirtableRequestRecord('request', number)

  const projectName = name === 'incoming' ? 'All Projects' : name

  const variables =  Object.assign({}, baseVariables, {
    number,
    projectName
  })

  const [issue, project] = await Promise.all([
    graphqlClient.request(operations.FindIssue, variables),
    graphqlClient.request(operations.FindProject, variables)
  ])

  const issueLabels = issue.repository.issue.labels.edges
    .filter((label) => label.node.name === name)

  asyncForEach(issueLabels, async (label) => {
    const { node: { name, description } } = label
    try {
      switch(description) {
        case 'department':
          await addToProject(project, issue, variables)
          break
        case 'status':
          await Promise.all([
            updateStatus(record[0], name),
            moveProjectCard(name, issue, variables)
          ])
          break
        case 'priority':
          await updatePriority(record[0], labels, name, number)
          break
        case 'category':
          await updateCategory(record[0], name)
          break
        default:
          console.log('No matching label description')
      }
    } catch(err) {
      console.log(err)
    }
  })

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
