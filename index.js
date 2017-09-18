require('dotenv-safe').load()

const { json, send } = require('micro')
// const cors = require('micro-cors')()
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
const variables = {
  "owner": owner,
  "name": repository,
}



function signRequestBody(key, body) {
  return `sha1=${crypto.createHmac('sha1', key.toString()).update(body.toString(), 'utf-8').digest('hex')}`
}



function addProjectCard(...args) {
  
  const { query, variables } = args
  let addProjectCardPayload

  try {
      addProjectCardPayload = await client.request(query, variables) 
  } catch (error) {
      return send(res, 401, {  headers: { 'Content-Type': 'text/plain' }, body: 'Error adding issue to project' })
  }
  return addProjectCardPayload
}

function deleteProjectCard(...args) {

  const { query, variables } = args
  let deleteProjectCardPayload

  try {
      deleteProjectCardPayload = await client.request(query, variables) 
  } catch (error) {
      return send(res, 401, {  headers: { 'Content-Type': 'text/plain' }, body: 'Error deleting issue to project' })
  }
  return deleteProjectCardPayload
}

// Grapql Queries & Mutations

const FindProjectByName = `

`






module.exports = async function (req, res) {
  
  const payload = await json(req)
  const headers = req.headers
  const sig = headers['x-hub-signature']
  const githubEvent = headers['x-github-event']
  const id = headers['x-github-delivery']
  const issueNumber = payload.issue.number
  // const calculateSig = signRequestBody(secret, payload) 
  let issueID
  let errorMessage

  if (typeof token !== 'string') {
    errorMessage = `Must provide a 'GH_WEBHOOK_SECRET' env variable`
    return send(res, 401, { 
      headers: { 'Content-Type': 'text/plain' },
      body: errorMessage }) 
  }

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
    errorMessage = `Only opened action on issues please :)`
    return send(res, 200, { 
      headers: { 'Content-Type': 'text/plain' },
      body: errorMessage }) 
  }
  // if (sig !==  calculateSig) {
  //   errorMessage = `X-Hub-Signature incorrect. Github webhook token doesn't match`
  //   return send(res, 401, { 
  //     headers: { 'Content-Type': 'text/plain' },
  //     body: errorMessage }) 
  // }


  console.log(`------------------------------`)
  console.log(`Github-Event:  ${githubEvent} with action: ${payload.action}`)
  console.log(`-------------------------------`)
  const variables = {
    "owner": owner,
    "name": repository,
    "issueNumber": issueNumber,
    "issue": {
      "contentId": issueID,
      "projectColumnId": "MDEzOlByb2plY3RDb2x1bW4xNDc0MzM4"
    } 
  }

    // FindIssueId
  const FindIssueID = `
    query FindIssueID($owner: String!, $name: String!, $issueNumber: Int!) {
      repository(owner: $owner, name: $name) {
        issue(number: $issueNumber) {
          id
        }
      }
    }
  `

  const data = await client.request(FindIssueID, variables)
  issueID = data.repository.issue.id
  variables.issue.contentId = issueID
  
  // AddIssueToCard
  
  const AddIssueToProject = `
    mutation AddIssueToProject($issue: AddProjectCardInput!) {
      addProjectCard(input: $issue) {
        cardEdge {
          node {
            id
          }
        }
        projectColumn {
          id
        }
      }
    }
  `

  if (!issueID) {
    return send(res, 200, {  headers: { 'Content-Type': 'text/plain' }, body: 'No issue with ID found' })
  }

  try {
      const addIssueToProjectPayload = await client.request(AddIssueToProject, variables)
    if (!addIssueToProjectPayload) {
      return send(res, 200, {  headers: { 'Content-Type': 'text/plain' }, body: 'Project already has the associated issue' })
    }
  } catch (error) {
      return send(res, 401, {  headers: { 'Content-Type': 'text/plain' }, body: 'Error adding issue to project' })
  }

  return send(res, 200, { headers: { 'Content-Type':'application/json' }, body: `Done: \n${addIssueToProjectPayload}` })
}
