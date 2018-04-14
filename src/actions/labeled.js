const async = require('async')

const {
  issues,
  graphqlClient
} = require('../lib/github')

const {
  updateStatus,
  updatePriority,
  updateCategory,
  getAirtableRequestRecord,
} = require ('../lib/airtable')

const config = require('../config')

const { owner, repo } = config.github

const operations = require('../graphql/queries')

// Create query and mutation variable object
const baseVariables = { owner, name: repo }

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

async function labeled (payload) {

  const { issue: { number, state, labels }, label: { name } } = payload

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
      case 'project':
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

    // Close ticket if issue marked completed
    if (name === 'completed' && state !== 'closed') {
      console.log('hi')
      await issues.editIssue(number, { state: 'closed' })
    }
  })
}

module.exports = labeled
