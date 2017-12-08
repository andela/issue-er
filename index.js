require('dotenv-safe').load()
const crypto = require('crypto')
// const cors = require('micro-cors')()
const { json, send, text } = require('micro')
const SlackWebClient = require('@slack/client').WebClient
const GitHub = require('github-api')
const { GraphQLClient } = require('graphql-request')
const Airtable = require('airtable')
const dateFormat = require('dateformat')

// Env Variables
const token = process.env.GH_TOKEN
const secret = process.env.GH_WEBHOOK_SECRET
const owner = process.env.GH_OWNER
const name = process.env.GH_REPOSITORY
const endpoint = process.env.GH_ENDPOINT
const airtableKey = process.env.AIRTABLE_API_KEY
const airtableBase = process.env.AIRTABLE_BASE
const view = process.env.AIRTABLE_VIEW_ENDPOINT
const slackToken = process.env.SLACK_TOKEN

// Initialize GraphQLClient
const client = new GraphQLClient(endpoint, {
  headers: {
    Authorization: `bearer ${token}`,
  },
})

// Initialize GitHub instance
const gh = new GitHub({token}).getIssues(`${owner}/${name}`)

// Initialize Airtable base
const base = new Airtable({
  apiKey: airtableKey
}).base(airtableBase)

// Add functions to retrieve userID and userName from: https://github.com/slackapi/node-slack-sdk/issues/73
SlackWebClient.prototype.convertToUserID = function (key) {
  if (key in this.users) {
    return key
  }

  for (const userID in this.users) {
    if (userID === key || this.users[userID].name === key) {
      return this.users[userID].name
    }
  }
}

SlackWebClient.prototype.convertToUserName = function (key) {
  for (const userID in this.users) {
    if (userID === key || this.users[userID].name === key) {
      return this.users[userID].name
    }
  }
}

SlackWebClient.prototype.convertToGroupID = function (key) {
  if (key in this.groups) {
    return key
  }

  for (const groupID in this.groups) {
    if (groupID === key || this.groups[groupID].name === key) {
      return this.groups[groupID].name
    }
  }
}

SlackWebClient.prototype.convertToGroupName = function (key) {
  for (const groupID in this.groups) {
    if (groupID === key || this.groups[groupID].name === key) {
      return this.groups[groupID].name
    }
  }
}


// Initialize Slack Token
const slackWeb = new SlackWebClient(slackToken)

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


function signRequestBody (key, body) {
  return `sha1=${crypto.createHmac('sha1', key).update(body, 'utf-8').digest('hex')}`
}

function getAirtableRequestRecord (table, issueNumber) {
  return new Promise(resolve => {
    setTimeout(() => {
      const record = table.select({ filterByFormula: `githubIssue = '${issueNumber}'`}).firstPage()
      resolve(record)
    }, 3000)
  })
}

function getAirtableStaffRecord (table, assignee) {
   return table.select({ filterByFormula: `github = '@${assignee}'`}).firstPage()
}

function createSlackGroup (name) {
  return slackWeb.groups.create(name,
    (err, data) => {
      if (err) {
        console.log(err)
      } else {
        inviteToSlackGroup(data.group.id, 'studiobot')
      }
    })
}

function inviteToSlackGroup (groupID, user) {
  const userID = getSlackUserID(user)
  return slackWeb.groups.invite(groupID, userID,
    (err) => {
      if (err) {
        console.log(err)
      }
    })
}

function getSlackUserID (name) {
  return slackWeb.users.list((err, data) => {
    if (err) {
      console.log(err)
    } else {
      for (const user of data.members) {
        if (user.name === name) {
          return user.id
        }
      }
    }
  })
}

function getSlackGroupID (name) {
  return slackWeb.groups.list((err, data) => {
    if (err) {
      console.log(err)
    } else {
      for (const group of data.groups) {
        if (group.name === name) {
          return group.id
        }
      }
    }
  })
}

const handler = async function (req, res) {
  try {
    const [payload, body] = await Promise.all([json(req), text(req)])
    const headers = req.headers
    const sig = headers['x-hub-signature']
    const githubEvent = headers['x-github-event']
    const id = headers['x-github-delivery']
    const calculatedSig = signRequestBody(secret, body)
    const action = payload.action
    let errMessage
    console.log('he')

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

    if (action === 'edited') {
      errMessage = `Can't handle edits, sorry :)`
      return send(res, 200, { 
        headers: { 'Content-Type': 'text/plain' },
        body: errMessage }) 
    }

    const issueNumber = payload.issue.number
    const requestRecord = await getAirtableRequestRecord(base('request'), issueNumber)
    const requestRecordID = requestRecord[0].getId()
    const requestID = requestRecord[0].get('requestID')
    const requestView = view + requestRecordID

    if (action === 'opened') {
      // Add requestID and link to issue body
      const requestBrief = payload.issue.body
      // const group = `studiojob-${issueNumber}`
      const group = 'test-bot-studio-11'
      await Promise.all([
        gh.editIssue(issueNumber, { body: `# Request ID: [${requestID}](${requestView}) \r\n ${requestBrief}` }),
        createSlackGroup(group)
      ])
    }

    if (action === 'labeled') {
      const label = payload.label
      const status = label.name
      const projectName = label.name === 'incoming' ? 'All Projects' : label.name
      const requestJobStatus = requestRecord[0].get('jobStatus')
      
      // Add issue to project board
      const variables =  Object.assign({}, baseVariables, {
        issueNumber,
        projectName
      })

      const findIssueID = client.request(operations.FindIssueID, variables)

      const findProjectColumnID = client.request(operations.FindProjectColumnID, variables)

      const [issue, project] = await Promise.all([findIssueID, findProjectColumnID])

      const contentId = issue.repository.issue.id

      if (project.repository.projects.edges.length === 1 && payload.sender.login === 'studiobot' ) {

        const projectColumnId = project.repository.projects.edges[0].node.columns.edges[0].node.id
      
        if (contentId && projectColumnId) {

          const projectCardMutationVariables = Object.assign({}, variables, {
            "issue": { contentId, projectColumnId }
          })
   
          await client.request(operations.AddProjectCard, projectCardMutationVariables)
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
      const labels = payload.issue.labels

      // Add 'expedite' label to issue is expedite requested
      if (expediteReq && label !== expediteLabel && !labels.includes(expediteLabel)) {

        const currentLabels = labels.map((label) => label.name)
        const newLabels = [expediteLabel, ...currentLabels]

        await gh.editIssue(issueNumber, { labels: newLabels })
      }

    }
    
    if (action === 'assigned') {

      const assignee = payload.issue.assignee.login
      const staffRecord = await getAirtableStaffRecord(base('staff'), assignee)
      const studioOwner = staffRecord[0]

      if (studioOwner) {

        const staffRecordID = studioOwner.getId()
        await base('request').update(requestRecordID, { 'studioOwner': [`${staffRecordID}`] })
      }
    }

    return send(res, 200, { body: `Done with action: '${action}'` })

  } catch(err) {
    console.log(err)
    send(res, 500, { body: `Error occurred: ${err}` })
  }
}

module.exports = handler
