require('dotenv-safe').load()

const crypto = require('crypto')
const { json, send, text } = require('micro')
const sleep = require('then-sleep')
const GitHub = require('github-api')
const { GraphQLClient } = require('graphql-request')
const airtable = require('airtable')
const dateFormat = require('dateformat')

const dev = process.env.NODE_ENV !== 'production'
// Env Variables
const token = process.env.GH_TOKEN
const secret = process.env.GH_WEBHOOK_SECRET
const owner = process.env.GH_OWNER
const name = process.env.GH_REPOSITORY
const endpoint = process.env.GH_ENDPOINT
const airtableKey = process.env.AIRTABLE_API_KEY
const airtableBase = process.env.AIRTABLE_BASE
const table = process.env.AIRTABLE_TABLE
const view = process.env.AIRTABLE_VIEW_ENDPOINT

// Initialize GraphQLClient
const client = new GraphQLClient(endpoint, {
  headers: {
    Authorization: `bearer ${token}`,
  },
})

// Initialize GitHub Instance

const gh = new GitHub({token}).getIssues(`${owner}/${name}`)

// Initialize Airtable client
airtable.configure({
  apiKey: airtableKey
})

const base = airtable.base(airtableBase)(table)

// Create query and mutation variable object
const baseVariables = { owner, name }


// Issue status labels
const statuses = ['incoming', 'accepted', 'in progress', 'rejected', 'blocked', 'review', 'completed', 'hold', 'canceled']

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
  FindProjectColumnIDs: `
    query FindProjectColumnIDs($owner:String!, $name:String!, $projectName:String!) {
      repository(owner:$owner,name:$name) {
        projects(first:1, search:$projectName){
          edges {
            node {
              columns(first:7) {
                totalCount
                edges {
                  node {
                    id
                    name
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
  `,
  AddComment: `
    mutation AddComment($issue: AddCommentInput!) {
      addComment(input:$issue) {
        commentEdge {
          node {
            id
          }
        }
        clientMutationId
      }
    }
  `
}


function signRequestBody(key, body) {
  return `sha1=${crypto.createHmac('sha1', key).update(body, 'utf-8').digest('hex')}`
}

module.exports = async function (req, res) {

  try {
    const payload = await json(req) 
    const body = await text(req) 
    const headers = req.headers
    const sig = headers['x-hub-signature']
    const githubEvent = headers['x-github-event']
    const id = headers['x-github-delivery']
    const calculatedSig = signRequestBody(secret, body)
    let errMessage

    if (!sig) {
      errMessage = 'No X-Hub-Signature found on request'
      return send(res, 401, { 
        headers: { 'Content-Type': 'text/plain' },
        body: errMessage }) 
    }

    if (!githubEvent) {
      errMessage = 'No Github Event found on request'
      return send(res, 422, { 
        headers: { 'Content-Type': 'text/plain' },
        body: errMessage }) 
    }

    if (githubEvent !== 'issues') {
      errMessage = 'No Github Issues event found on request'
      return send(res, 200, { 
        headers: { 'Content-Type': 'text/plain' },
        body: errMessage }) 
    }

    if(!id) {
      errMessage = 'No X-Github-Delivery found on request'
      return send(res, 401, { 
        headers: { 'Content-Type': 'text/plain' },
        body: errMessage }) 
    }

    if (sig !== calculatedSig) {
      errMessage = 'No X-Hub-Signature doesn\'t match Github webhook secret'
      return send(res, 401, { 
        headers: { 'Content-Type': 'text/plain' },
        body: errMessage }) 
    }

    const action = payload.action
    
    if (action === 'opened') {

      const issueNumber = payload.issue.number

      if (!dev) { await sleep(3000) } // Delay for Zap to update Airtable record field 'githubIssue'

      const record = await base.select({ filterByFormula: `githubIssue = ${issueNumber}`}).firstPage()
      const recordID = record[0].getId()
      const requestID = record[0].get('requestID')
      const recordView = view + recordID
      const expediteReq = record[0].get('expedite')

      // Add 'expedite' label to issue is expedite requested
      if (expediteReq) {
        const label = 'expedite'
        const labels = payload.issue.labels.map((label) => label.name)
        labels.push(label)
        await gh.editIssue(issueNumber, { labels })
      }
      
      // Add requestID and link to issue body
      await gh.editIssue(issueNumber, { body: `# Request ID: [${requestID}](${recordView}) \r\n ${payload.issue.body}` })

    }

    if (action === 'labeled') {
      const label = payload.label
      const status = label.name
      const issueNumber = payload.issue.number
      const projectName = label.name === 'incoming' ? 'All Projects' : label.name
      
      // Add issue to project board
      const variables =  Object.assign({}, baseVariables, {
        issueNumber,
        projectName
      })

      const issue = await client.request(operations.FindIssueID, variables)
      const contentId = issue.repository.issue.id

      const project = await client.request(operations.FindProjectColumnID, variables)

      if (project.repository.projects.edges.length === 1 && payload.sender.login === 'studiobot' ) {

        const projectColumnId = project.repository.projects.edges[0].node.columns.edges[0].node.id
      
        if (contentId && projectColumnId) {

          const projectCardMutationVariables = Object.assign({}, variables, {
            "issue": { contentId, projectColumnId }
          })
   
          await client.request(operations.AddProjectCard, projectCardMutationVariables)
        }
      } else {
          // Lookup airtable record by issueNumber 
          const record = await base.select({ filterByFormula: `githubIssue = ${issueNumber}` }).firstPage()
          const recordID = record[0].getId()
          const recordJobStatus = record[0].get('jobStatus')


          // Update airtable jobStatus field with label if airtable record exists &&
          // Label status is in statuses && record status is not the same as label name
          if (recordID && statuses.includes(status) && status !== recordJobStatus) {

            await base.update(recordID, { 'jobStatus': status })

            const today = dateFormat(new Date(), 'isoDate')

            if (status === 'accepted') {
              await base.update(recordID, { 'startDate': today })
            }

            if (status === 'completed') {
              await base.update(recordID, { 'dateDelivered': today })
            }

          }
        

      }
    }

    return send(res, 200, { body: `Done with action: '${action}'` })
  } catch(err) {
    console.log(err)
    send(res, 500)  
  }
}
