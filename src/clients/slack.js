const Slack = require('@slack/client').WebClient
const fetch = require('node-fetch')
const queryString = require('query-string')

const token = process.env.SLACK_TOKEN

const client = new Slack(token)

function createSlackGroup (name) {
  return new Promise((resolve, reject) => {
    return client.groups.create(name,
      (err, data) => {
        if (err) {
          console.log(err)
          reject(err)
        } else {
          console.log(data)
          resolve(data.group.id)
        }
      })
  })
}

function archiveSlackGroup (name) {
  return new Promise((resolve, reject) => {
    return getSlackGroupID(name).then((id) => {
      return client.groups.archive(id,
        (err, res) => {
          if (err) {
            console.log(err)
            reject(err)
          } else {
            console.log(res)
            resolve(res)
          }
        })
    })
  })
}

function inviteToSlackGroup (groupID, userID) {
  return new Promise((resolve, reject) => {
    return client.groups.invite(groupID, userID,
      (err, data) => {
        if (err) {
          console.log(err)
          reject(err)
        } else {
          resolve(data)
        }
      })
  })
}

function getSlackUserID (name) {
  return new Promise((resolve, reject) => {
    return client.users.list((err, data) => {
      let userID = null
      if (err) {
        console.log(err)
        reject(err)
      } else {
        for (const user of data.members) {
          if (`@${user.name}` === name) {
            userID = user.id
            break
          }
        }
        resolve(userID)
      }
    }, {
      limit: 1000
    })
  })
}

function getSlackUserIDByEmail (email) {
  return new Promise(async (resolve, reject) => {
    const teamID = await getSlackTeamID()
    const params = {
      team: teamID,
      token,
      email
    }

    return fetch(` https://slack.com/api/auth.findUser?${queryString.stringify(params)}`)
      .then((res) => res.json())
      .then((body) => {
        const { ok, user_id } = body
        if (!ok) reject(new Error('User not found'))
        resolve(user_id)
      })
  })
}

function getSlackGroupID (name) {
  return new Promise((resolve, reject) => {
    return client.groups.list((err, data) => {
      let groupID = null
      if (err) {
        console.log(err)
        reject(err)
      } else {
        for (const group of data.groups) {
          if (group.name === name) {
            groupID = group.id
            break
          }
        }
        resolve(groupID)
      }
    }, {
      limit: 1000,
      exclude_archived: true,
      exclude_members: true
    })
  })
}

function getSlackTeamID () {
  return new Promise((resolve, reject) => {
    return client.team.info((err, data) => {
      if (err) reject(err)
      resolve(data.team.id)
    })
  })
}

function getSlackProfile (userID) {
  return new Promise((resolve, reject) => {
    return client.users.info(userID,
      (err, data) => {
        if (err) reject(err)
        resolve(data.user)
    })
  })
}

function retrieveSlackHistory (groupID) {
  return new Promise((resolve, reject) => {
    return client.groups.history(groupID,
      (err, data) => {
        if (err) {
          console.log(err)
          reject(err)
        } else {
          resolve(data.messages.filter((message) => message.type === 'message' && !message.subtype))
        }
      }, {
        count: 1000
      })
  })
}
module.exports = {
  client,
  createSlackGroup,
  archiveSlackGroup,
  inviteToSlackGroup,
  getSlackUserIDByEmail,
  getSlackUserID,
  getSlackGroupID,
  getSlackTeamID,
  getSlackProfile,
  retrieveSlackHistory
}
