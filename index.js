require('dotenv-safe').load()

const { json, send } = require('micro')
const { GraphQLClient, request } = require('graphql-request')
const crypto = require('crypto')

// Env Variables
const token = process.env.GH_TOKEN
const secret = process.env.GH_WEBHOOK_SECRET
const owner = process.env.GH_OWNER
const repository = process.env.GH_REPOSITORY
const endpoint = process.env.GH_ENDPOINT

// Initialize GraphQLClient
const client = new GraphQLClient(endpoint, {
  headers: {
    Authorization: `bearer ${token}`,
  },
})

// Initialize query and mutation variable object
const baseVariables = {
  "owner": owner,
  "name": repository,
}

function signRequestBody(key, body) {
  return `sha1=${crypto.createHmac('sha1', key.toString()).update(body.toString(), 'utf-8').digest('hex')}`
}


// function performOperation(...args) {
//   const { operation, variables } = args
//   return  await client.request(operation, variables)
// }



// Grapql Operations: Queries & Mutations

const operations = {
  FindProjectColumnID: `
    query FindProjectByName($owner: String!, $name: String!, $projectName: String!) {
      repository(owner: $owner, name: $name) {
        projects(first: 1, search: $projectName){
          edges {
            node {
              columns(first:1) {
                edges {
                  node {
                    id
                  }
                }
              }
            }
          }
        }
      }
    }
  `,
  FindIssueID: `
     query FindIssueID($owner: String!, $name: String!, $issueNumber: Int!) {
      repository(owner: $owner, name: $name) {
        issue(number: $issueNumber) {
          id
        }
      }
    }
  `,
  AddProjectCard: `
    mutation AddProjectCard($issue: AddProjectCardInput!) {
      addProjectCard(input: $issue) {
        cardEdge {
          node {
            id
          }
        }
        projectColumn {
          id
        },
        clientMutationId
      }
    }
  `,
  MoveProjectCard: `
    mutation MoveProjectCard($card: MoveProjectCardInput!) {
      moveProjectCard(input: $card) {
        cardEdge {
          node {
            id
          }
        }
        clientMutationId
      }
    }
  `
}

module.exports = async function (req, res) {
  if (!req) { return }  
  const payload = await json(req)
  const headers = req.headers
  const sig = headers['x-hub-signature']
  const githubEvent = headers['x-github-event']
  const id = headers['x-github-delivery']
  let operationPayload = {}
  let errorMessage

  if (!sig) {
    errorMessage = `No X-Hub-Signature found on request`
    return send(res, 401, { 
      headers: { 'Content-Type': 'text/plain' },
      body: errorMessage }) 
  }

  if (!githubEvent) {
    errorMessage = `No Github Event found on request`
    return send(res, 401, { 
      headers: { 'Content-Type': 'text/plain' },
      body: errorMessage }) 
  }

  if (githubEvent !== 'issues') {
    errorMessage = `No Github Issues event found on request`
    return send(res, 200, { 
      headers: { 'Content-Type': 'text/plain' },
      body: errorMessage }) 
  }

  if (payload.action !== 'opened') {
    errorMessage = `Only 'opened' action permitted at the momment`
    return send(res, 200, { 
      headers: { 'Content-Type': 'text/plain' },
      body: errorMessage }) 
  }

  payload.issue.labels.forEach(async (label) => {    
    const issueNumber = payload.issue.number
    const projectName = label.name === 'incoming' ? 'All Projects' : label.name

    const variables = Object.assign({}, baseVariables, {
      "issueNumber": issueNumber,
      "projectName": projectName
    })

    let data
    data  = await client.request(operations.FindIssueID, variables)
    const issueID = data.repository.issue.id
    data  = await client.request(operations.FindProjectColumnID, variables)
    const columnID = data.repository.projects.edges[0].node.columns.edges[0].node.id

    if(issueID && columnID) {

      let mutationVariables = Object.assign({}, variables, {
        "issue": {
          "contentId": issueID,
          "projectColumnId": columnID
        }
      })
    
      try {
        mutationPayload = await client.request(operations.AddProjectCard, mutationVariables)
      } catch (error) {
        return send(res, 401, {  headers: { 'Content-Type': 'text/plain' }, body: 'Error adding issue to project' })
      }

      operationPayload = Object.assign({}, mutationPayload)

    } else {
        return send(res, 401, {  headers: { 'Content-Type': 'text/plain' }, body: 'No matching labels for project board' })
    }

    return "Done"
  })

  return send(res, 200, { headers: { 'Content-Type':'application/json' }, body: `Done with response: ${JSON.stringify(operationPayload)}` })
}
