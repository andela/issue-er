const async = require('async')
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
  inviteToSlackGroup,
  inviteBotToSlackGroup,
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
const { url } = config.google

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

  async.each(projectCards.edges, async ({ node: {
    id: cardId,
    project: { name: projectName },
    column: { id: currentColumnId, name: currentColumnName } } }) => {
    const project = await graphqlClient.request(operations.FindProjectColumns,
      Object.assign({}, variables, { projectName })
    )
    const { repository: { projects: { edges } } } = project
    async.each(edges, async ({ node: { columns: { edges } } }) => {
      async.each(edges, async ({ node: { id: columnId, name: columnName } }) => {
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
      // const cwd = await workspace()
      //
      // const depFolderName = `${depId} (${depName.charAt(0).toUpperCase()}${depName.slice(1)})`
      // const requestFolderName = `${requestId} (${requestTitle})`
      //
      // const depFolder = await createFolder(depFolderName, [cwd.id])
      // const folder = await createFolder(requestFolderName, [depFolder.id])

      // return { groupId, userIds, gdrive: { folder } }
      
      return { groupId, userIds }

    },
    async ({ groupId }) => {

      const purpose = `Discuss ticket # ${number}. Request ID: ${requestId}`
      const topic = `Github Issue: https://github.com/andela/andela-studio/issues/${number} \n`

      // const topic = `Github Issue: https://github.com/andela-studio/issues/${number} \n GDrive Folder: ${url}/${folder.id}`

      await setSlackGroupPurpose(groupId, purpose)
      await setSlackGroupTopic(groupId, topic)

      return { groupId }
    },
    async ({ groupId }) => {
      const teamId = await getSlackTeamID()

      // await issues.editIssue(number, {
      //   body: `#### [Airtable Record: ${requestId}](${requestView}) \r\n #### [Google Drive: ${folder.name}](${url}/${folder.id}) \r\n #### [Slack: ${group}](https://slack.com/app_redirect?channel=${groupId}&&team=${teamId}) \r\n ${body} \r\n `
      // })

      await issues.editIssue(number, {
        body: `#### [Airtable Record: ${requestId}](${requestView}) \r\n #### [Slack: ${group}](https://slack.com/app_redirect?channel=${groupId}&&team=${teamId}) \r\n ${body} \r\n `
      })
    }
  ])
}

const labeled = async (payload) => {
  const { issue: { number, labels }, label: { name } } = payload

  const record = await getAirtableRequestRecord(number)

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

  async.each(issueLabels, async (label) => {
    const { node: { name, description } } = label
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
        await updatePriority(record[0], name)
        break
      case 'category':
        await updateCategory(record[0], name)
        break
      default:
        console.log('No matching label description')
    }

    // Add to 'All Projects'
    if (name === 'incoming') {
      await addToProject(project, issue, variables)
    }

    // Update label with 'expedite'
    const expediteLabel = 'expedite'
    const expediteReq = record.get('expedite')
    if (expediteReq && !labels.includes(expediteLabel)) {
      const currentLabels = labels.map((label) => label.name)
      const newLabels = [expediteLabel, ...currentLabels]
      await issues.editIssue(number, { labels: newLabels })
    }
  })
}

const assigned = async (payload) => {
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

const closed = async (payload) => {
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

module.exports = { opened, labeled, assigned, closed }
